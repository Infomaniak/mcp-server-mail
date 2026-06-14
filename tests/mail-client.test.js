import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import compiled module once; fetch is resolved dynamically at call time
const { MailClient } = await import("../dist/mail-client.js");

function createFetchMock() {
    const calls = [];
    const responses = [];

    const mock = async (url, options = {}) => {
        calls.push({ url, options });
        if (responses.length === 0) {
            throw new Error(`Unexpected fetch to ${url}`);
        }
        const response = responses.shift();
        return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => response,
            text: async () => JSON.stringify(response),
        };
    };

    mock.enqueue = (response) => responses.push(response);
    mock.calls = () => calls;
    return mock;
}

describe("MailClient", () => {
    let fetchMock;
    let originalFetch;

    beforeEach(() => {
        fetchMock = createFetchMock();
        originalFetch = global.fetch;
        global.fetch = fetchMock;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("listMailboxes sends correct request", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({ result: "success", data: [] });

        await client.listMailboxes();

        const calls = fetchMock.calls();
        assert.strictEqual(
            calls[0].url,
            "https://mail.infomaniak.com/api/mailbox?with=aliases,permissions,accountId,count_users",
        );
        assert.deepStrictEqual(calls[0].options.headers, {
            Authorization: "Bearer mock-token",
            "Content-Type": "application/json",
        });
    });

    it("listFolders flattens nested folders", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    id: "inbox",
                    name: "INBOX",
                    separator: "/",
                    role: "INBOX",
                    unread_count: 1,
                    total_count: 10,
                    children: [
                        {
                            id: "sub",
                            name: "Sub",
                            separator: "/",
                            role: null,
                            unread_count: 0,
                            total_count: 5,
                            children: [],
                        },
                    ],
                },
            ],
        });

        const result = await client.listFolders("mailbox-uuid");

        assert.strictEqual(result[0].path, "INBOX");
        assert.strictEqual(result[1].path, "INBOX/Sub");
    });

    it("listEmails extracts numeric sequence number from first_message_uid", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "thread-uid",
                        subject: "Test",
                        from: [{ name: "John", email: "john@test.com" }],
                        date: "2024-01-01",
                        messages_count: 1,
                        unseen_messages: 0,
                        messages: [
                            {
                                uid: "42@folder-id-encoded",
                                preview: "Hello",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.listEmails("mb", "fid");

        assert.strictEqual(result[0].first_message_uid, "42");
        assert.ok(!result[0].first_message_uid.includes("@"), "uid must not contain @");
    });

    it("readEmail reads message with correct URL", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "1",
                msg_id: "msg-123",
                subject: "Test Subject",
                from: [{ name: "Sender", email: "sender@test.com" }],
                to: [{ name: "Receiver", email: "receiver@test.com" }],
                cc: [],
                bcc: [],
                date: "2024-01-01",
                body: { value: "Hello", type: "text/plain" },
                html: "<p>Hello</p>",
                preview: "Hello",
                has_attachments: false,
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: { subject: "Test Subject" },
            },
        });

        const result = await client.readEmail("mb", "fid", "1");

        const calls = fetchMock.calls();
        assert.strictEqual(
            calls[0].url,
            "https://mail.infomaniak.com/api/mail/mb/folder/fid/message/1?prefered_format=html&with=auto_uncrypt,thread_context",
        );
        assert.strictEqual(result.subject, "Test Subject");
        assert.strictEqual(result.from, "Sender <sender@test.com>");
        assert.strictEqual(result.to, "Receiver <receiver@test.com>");
    });

    it("init sets mailbox state from first mailbox", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    uuid: "mb-uuid",
                    hosting_id: 123,
                    mailbox: "test",
                    email: "test@test.com",
                },
            ],
        });

        await client.init();
        assert.strictEqual(await client.getMailboxUuid(), "mb-uuid");
    });

    it("sendEmail creates draft and sends", async () => {
        const client = new MailClient("mock-token");

        // init
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    uuid: "mb-uuid",
                    hosting_id: 123,
                    mailbox: "test",
                    email: "test@test.com",
                },
            ],
        });
        await client.init();

        // draft create
        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });
        // draft save (update)
        fetchMock.enqueue({ result: "success" });
        // draft send
        fetchMock.enqueue({
            result: "success",
            data: { etop: "2024-01-01T00:00:00+00:00" },
        });

        const result = await client.sendEmail(
            "to@test.com",
            "Test Subject",
            "Hello world",
        );

        const calls = fetchMock.calls();
        // call 1 = init, call 2 = draft POST
        assert.strictEqual(
            calls[1].url,
            "https://mail.infomaniak.com/api/mail/mb-uuid/draft",
        );
        assert.strictEqual(calls[1].options.method, "POST");

        const draftBody = JSON.parse(calls[1].options.body);
        assert.deepStrictEqual(draftBody.to, [{ name: "", email: "to@test.com" }]);
        assert.strictEqual(draftBody.subject, "Test Subject");
        assert.strictEqual(draftBody.from.email, "test@test.com");

        // call 3 = draft update (save), call 4 = draft send
        const sendBody = JSON.parse(calls[3].options.body);
        assert.strictEqual(sendBody.action, "send");
        assert.strictEqual(result.etop, "2024-01-01T00:00:00+00:00");
    });

    it("sendEmail handles multiple recipients and cc/bcc", async () => {
        const client = new MailClient("mock-token");

        // init
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    uuid: "mb-uuid",
                    hosting_id: 123,
                    mailbox: "test",
                    email: "test@test.com",
                },
            ],
        });
        await client.init();

        // draft create + save + send
        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });
        fetchMock.enqueue({ result: "success" });
        fetchMock.enqueue({
            result: "success",
            data: { etop: "2024-01-01T00:00:00+00:00" },
        });

        await client.sendEmail(
            "a@test.com, b@test.com",
            "Subject",
            "Body",
            "cc@test.com",
            "bcc@test.com",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[1].options.body);
        assert.deepStrictEqual(draftBody.to, [
            { name: "", email: "a@test.com" },
            { name: "", email: "b@test.com" },
        ]);
        assert.deepStrictEqual(draftBody.cc, [{ name: "", email: "cc@test.com" }]);
        assert.deepStrictEqual(draftBody.bcc, [{ name: "", email: "bcc@test.com" }]);
    });

    it("uploadAttachment sets correct MIME type", async () => {
        const client = new MailClient("mock-token");

        // init
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    uuid: "mb-uuid",
                    hosting_id: 123,
                    mailbox: "test",
                    email: "test@test.com",
                },
            ],
        });
        await client.init();

        const testFile = path.join(__dirname, "test-file.png");
        fs.writeFileSync(testFile, Buffer.from("fake-image"));

        try {
            fetchMock.enqueue({
                result: "success",
                data: { uuid: "att-uuid" },
            });

            await client.uploadAttachment(testFile);

            const calls = fetchMock.calls();
            const last = calls[calls.length - 1];
            assert.ok(last.url.includes("/mail/mb-uuid/draft/attachment"));
            assert.strictEqual(last.options.method, "POST");
            assert.strictEqual(
                last.options.headers["x-ws-attachment-filename"],
                "test-file.png",
            );
            assert.strictEqual(
                last.options.headers["x-ws-attachment-mime-type"],
                "image/png",
            );
        } finally {
            fs.unlinkSync(testFile);
        }
    });

    it("uploadAttachment defaults to octet-stream for unknown extension", async () => {
        const client = new MailClient("mock-token");

        // init
        fetchMock.enqueue({
            result: "success",
            data: [
                {
                    uuid: "mb-uuid",
                    hosting_id: 123,
                    mailbox: "test",
                    email: "test@test.com",
                },
            ],
        });
        await client.init();

        const testFile = path.join(__dirname, "test-file.xyz");
        fs.writeFileSync(testFile, Buffer.from("unknown"));

        try {
            fetchMock.enqueue({
                result: "success",
                data: { uuid: "att-uuid" },
            });

            await client.uploadAttachment(testFile);

            const calls = fetchMock.calls();
            const last = calls[calls.length - 1];
            assert.strictEqual(
                last.options.headers["x-ws-attachment-mime-type"],
                "application/octet-stream",
            );
        } finally {
            fs.unlinkSync(testFile);
        }
    });

    it("regression: first_message_uid must not contain @ symbol", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "t1",
                        subject: "S",
                        from: [],
                        date: "2024",
                        messages_count: 1,
                        unseen_messages: 0,
                        messages: [
                            {
                                uid: "99@folder-id-base64",
                                preview: "...",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.listEmails("mb", "fid");
        const uid = result[0].first_message_uid;

        assert.strictEqual(uid, "99");
        assert.ok(!uid.includes("@"), "uid must not contain @");
        assert.ok(!uid.includes("-"), "uid should be a simple sequence number");
    });
});
