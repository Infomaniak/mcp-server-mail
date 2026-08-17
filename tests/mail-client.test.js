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
        if (response instanceof Response) {
            return response;
        }
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

    it("createFolder sends POST with correct payload", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: { id: "new-folder-id", name: "NewFolder" } });

        const result = await client.createFolder("mb-uuid", "NewFolder");

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/folder");
        assert.strictEqual(calls[0].options.method, "POST");
        const body = JSON.parse(calls[0].options.body);
        assert.strictEqual(body.name, "NewFolder");
        assert.strictEqual(body.parent, undefined);
        assert.strictEqual(result.id, "new-folder-id");
        assert.strictEqual(result.name, "NewFolder");
    });

    it("createFolder with parent_folder_id sends parent in payload", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: { id: "sub-folder-id", name: "SubFolder" } });

        const result = await client.createFolder("mb-uuid", "SubFolder", "parent-id");

        const calls = fetchMock.calls();
        const body = JSON.parse(calls[0].options.body);
        assert.strictEqual(body.name, "SubFolder");
        assert.strictEqual(body.parent, "parent-id");
        assert.strictEqual(result.parent_folder_id, "parent-id");
    });

    it("renameFolder sends POST to /rename endpoint", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: { id: "folder-id", name: "RenamedFolder" } });

        const result = await client.renameFolder("mb-uuid", "folder-id", "RenamedFolder");

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/folder/folder-id/rename");
        assert.strictEqual(calls[0].options.method, "POST");
        const body = JSON.parse(calls[0].options.body);
        assert.strictEqual(body.name, "RenamedFolder");
        assert.strictEqual(result.id, "folder-id");
        assert.strictEqual(result.name, "RenamedFolder");
    });

    it("deleteFolder sends DELETE to correct URL", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.deleteFolder("mb-uuid", "folder-id-to-delete");

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/folder/folder-id-to-delete");
        assert.strictEqual(calls[0].options.method, "DELETE");
        assert.strictEqual(result.result, "success");
        assert.strictEqual(result.folder_id, "folder-id-to-delete");
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
                attachments: [
                    {
                        part_id: 2,
                        name: "test.txt",
                        mime_type: "text/plain",
                        size: 4,
                        resource: "/api/mail/mb/folder/fid/message/1/attachment/2",
                    }
                ],
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
        assert.strictEqual(result.attachments.length, 1);
        assert.strictEqual(result.attachments[0].id, "2");
        assert.strictEqual(result.attachments[0].filename, "test.txt");
        assert.strictEqual(result.attachments[0].mime_type, "text/plain");
        assert.strictEqual(result.attachments[0].size, 4);
        assert.strictEqual(result.attachments[0].url, "/api/mail/mb/folder/fid/message/1/attachment/2");
    });

    it("readEmail returns empty attachments when API omits field", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "1",
                msg_id: "msg-456",
                subject: "No Attachments",
                from: [{ name: "Sender", email: "sender@test.com" }],
                to: [{ name: "Receiver", email: "receiver@test.com" }],
                date: "2024-01-01",
                body: { value: "Hello", type: "text/plain" },
                html: "<p>Hello</p>",
                preview: "Hello",
                has_attachments: false,
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: { subject: "No Attachments" },
            },
        });

        const result = await client.readEmail("mb", "fid", "1");
        assert.deepStrictEqual(result.attachments, []);
    });

    it("downloadAttachment fetches and encodes attachment", async () => {
        const client = new MailClient("mock-token");

        const mockBuffer = Buffer.from("PDF binary content");
        fetchMock.enqueue(new Response(mockBuffer, {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-disposition": 'attachment; filename="report.pdf"',
            },
        }));

        const result = await client.downloadAttachment("mb-uuid", "folder-1", "msg-123", "att-456");

        const calls = fetchMock.calls();
        assert.strictEqual(
            calls[0].url,
            "https://mail.infomaniak.com/api/mail/mb-uuid/folder/folder-1/message/msg-123/attachment/att-456",
        );
        assert.strictEqual(calls[0].options.headers.Authorization, "Bearer mock-token");

        assert.strictEqual(result.filename, "report.pdf");
        assert.strictEqual(result.mime_type, "application/pdf");
        assert.strictEqual(result.size, 18);
        assert.strictEqual(result.content, Buffer.from("PDF binary content").toString("base64"));
    });

    it("downloadAttachment strips charset from content-type", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response(Buffer.from("hi"), {
            status: 200,
            headers: {
                "content-type": "text/plain; charset=utf-8",
                "content-disposition": 'attachment; filename="note.txt"',
            },
        }));

        const result = await client.downloadAttachment("mb", "f", "m", "a");
        assert.strictEqual(result.mime_type, "text/plain");
    });

    it("downloadAttachment parses RFC 5987 encoded filename", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response(Buffer.from("hi"), {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-disposition": "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
            },
        }));

        const result = await client.downloadAttachment("mb", "f", "m", "a");
        assert.strictEqual(result.filename, "résumé.pdf");
    });

    it("downloadAttachment falls back to attachmentId when no filename", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response(Buffer.from("hi"), {
            status: 200,
            headers: {
                "content-type": "application/pdf",
            },
        }));

        const result = await client.downloadAttachment("mb", "f", "m", "att-789");
        assert.strictEqual(result.filename, "att-789");
    });

    it("downloadAttachment throws on 404", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response(null, {
            status: 404,
            statusText: "Not Found",
        }));

        await assert.rejects(
            client.downloadAttachment("mb", "f", "m", "missing"),
            /Attachment missing not found for message m/,
        );
    });

    it("downloadAttachment throws on generic error", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response("server error", {
            status: 500,
            statusText: "Internal Server Error",
        }));

        await assert.rejects(
            client.downloadAttachment("mb", "f", "m", "a"),
            /Failed to download attachment: 500 Internal Server Error/,
        );
    });

    it("downloadAttachment rejects oversized attachment via content-length", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue(new Response(Buffer.from("x"), {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-length": String(26 * 1024 * 1024),
            },
        }));

        await assert.rejects(
            client.downloadAttachment("mb", "f", "m", "a"),
            /Attachment too large/,
        );
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

        // draft create + send
        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });
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

        // call 2 = draft send
        const sendBody = JSON.parse(calls[2].options.body);
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

        // draft create + send
        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });
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

    it("sendEmail ignores blank recipient entries", async () => {
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

        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });
        fetchMock.enqueue({
            result: "success",
            data: { etop: "2024-01-01T00:00:00+00:00" },
        });

        await client.sendEmail(
            "a@test.com, , b@test.com,",
            "Subject",
            "Body",
            ", cc@test.com,",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[1].options.body);
        assert.deepStrictEqual(draftBody.to, [
            { name: "", email: "a@test.com" },
            { name: "", email: "b@test.com" },
        ]);
        assert.deepStrictEqual(draftBody.cc, [{ name: "", email: "cc@test.com" }]);
    });

    it("createDraft escapes plain text body before wrapping it in HTML", async () => {
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

        fetchMock.enqueue({
            result: "success",
            data: { uuid: "draft-uuid", uid: "draft-uid" },
        });

        await client.createDraft(
            "to@test.com",
            "Escaped body",
            "<script>alert('x')</script>\nTom & Jerry \"quote\"",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[1].options.body);
        assert.ok(
            draftBody.body.includes(
                "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;<br>Tom &amp; Jerry &quot;quote&quot;",
            ),
        );
        assert.ok(
            !draftBody.body.includes("<script>"),
            "plain text body should not be interpreted as HTML",
        );
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

    it("listEmails returns folder_id and folder so callers can read messages from multi-folder threads", async () => {
        const client = new MailClient("mock-token");
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "t-multi",
                        subject: "Multi-folder thread",
                        from: [{ name: "Alice", email: "alice@test.com" }],
                        date: "2026-07-17T10:00:00+0200",
                        messages_count: 2,
                        unseen_messages: 0,
                        messages: [
                            {
                                uid: "7@sentFolderId",
                                preview: "Sent reply",
                                folder_id: "sentFolderId",
                                folder: "Sent",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.listEmails("mb", "inboxFolderId");

        assert.strictEqual(result[0].first_message_uid, "7");
        assert.strictEqual(result[0].folder_id, "sentFolderId");
        assert.strictEqual(result[0].folder, "Sent");
    });

    it("listDrafts finds folder with role DRAFT", async () => {
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

        // folders response with DRAFT role
        fetchMock.enqueue({
            result: "success",
            data: [
                { id: "inbox-id", name: "INBOX", role: "INBOX" },
                { id: "draft-id", name: "Drafts", role: "DRAFT" },
                { id: "sent-id", name: "Sent", role: "SENT" },
            ],
        });

        // drafts messages
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "t1",
                        subject: "Draft 1",
                        from: [],
                        date: "2024",
                        messages_count: 1,
                        unseen_messages: 0,
                        messages: [{ uid: "1@fid", preview: "..." }],
                    },
                ],
            },
        });

        const drafts = await client.listDrafts();

        const calls = fetchMock.calls();
        assert.ok(calls[2].url.includes("draft-id"), "should query drafts folder");
        assert.strictEqual(drafts.length, 1);
        assert.strictEqual(drafts[0].subject, "Draft 1");
    });

    it("createDraft and sendDraft flow", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }] });
        await client.init();

        // create draft
        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });
        // send draft
        fetchMock.enqueue({ result: "success", data: { etop: "2024-01-01T00:00:00+00:00" } });

        const draft = await client.createDraft("a@test.com", "Subject", "Body");
        assert.strictEqual(draft.uuid, "draft-uuid");

        const result = await client.sendDraft(draft.uuid);
        assert.strictEqual(result.etop, "2024-01-01T00:00:00+00:00");
    });

    it("createDraft resolves In-Reply-To and References from in_reply_to_uid", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        // source message read for threading headers
        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "42",
                msg_id: "<orig-123@example.com>",
                subject: "Original",
                from: [{ name: "Alice", email: "alice@test.com" }],
                to: [{ name: "Bob", email: "bob@test.com" }],
                date: "2026-01-01T00:00:00+0000",
                body: { value: "Hello", type: "text/plain" },
                html: "<p>Hello</p>",
                preview: "Hello",
                has_attachments: false,
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: {
                    references: "<parent-1@example.com>",
                },
            },
        });

        // draft creation
        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft(
            "bob@test.com",
            "Re: Original",
            "Reply body",
            undefined,
            undefined,
            undefined,
            undefined,
            "42@fid",
        );

        const calls = fetchMock.calls();
        // call 0 = init, call 1 = readEmail (source), call 2 = draft POST
        assert.strictEqual(
            calls[1].url,
            "https://mail.infomaniak.com/api/mail/mb-uuid/folder/fid/message/42?prefered_format=html&with=auto_uncrypt,thread_context",
        );
        const draftBody = JSON.parse(calls[2].options.body);
        assert.strictEqual(draftBody.in_reply_to, "<orig-123@example.com>");
        // References should contain parent and source msg_id (dedup)
        assert.strictEqual(draftBody.references, "<parent-1@example.com> <orig-123@example.com>");
        assert.strictEqual(draftBody.in_reply_to_uid, "42@fid");
    });

    it("createDraft with in_reply_to_uid appends source msg_id to existing References if missing", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "7",
                msg_id: "<reply-target@example.com>",
                subject: "Re: Thread",
                from: [{ name: "A", email: "a@test.com" }],
                to: [{ name: "B", email: "b@test.com" }],
                date: "2026-01-01",
                body: { value: "Hi", type: "text/plain" },
                html: "<p>Hi</p>",
                preview: "Hi",
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: {
                    References: "<first@example.com> <second@example.com>",
                },
            },
        });

        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft(
            "a@test.com",
            "Re: Thread",
            "Reply",
            undefined,
            undefined,
            undefined,
            undefined,
            "7@fid",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[2].options.body);
        assert.strictEqual(draftBody.in_reply_to, "<reply-target@example.com>");
        assert.strictEqual(
            draftBody.references,
            "<first@example.com> <second@example.com> <reply-target@example.com>",
        );
    });

    it("createDraft does not duplicate source msg_id already present in References", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "9",
                msg_id: "<dup@example.com>",
                subject: "Re: Thread",
                from: [{ name: "A", email: "a@test.com" }],
                to: [{ name: "B", email: "b@test.com" }],
                date: "2026-01-01",
                body: { value: "Hi", type: "text/plain" },
                html: "<p>Hi</p>",
                preview: "Hi",
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: {
                    references: "<parent@example.com> <dup@example.com>",
                },
            },
        });

        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft(
            "a@test.com",
            "Re: Thread",
            "Reply",
            undefined,
            undefined,
            undefined,
            undefined,
            "9@fid",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[2].options.body);
        assert.strictEqual(draftBody.in_reply_to, "<dup@example.com>");
        assert.strictEqual(
            draftBody.references,
            "<parent@example.com> <dup@example.com>",
        );
    });

    it("createDraft prefers explicit in_reply_to/references over resolved-from-uid", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        // No source read should happen since both explicit headers are provided
        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft(
            "a@test.com",
            "Re: Original",
            "Reply",
            undefined,
            undefined,
            undefined,
            "<explicit-in-reply-to@example.com>",
            "42@fid",
            "<explicit-ref@example.com>",
        );

        const calls = fetchMock.calls();
        // init + draft POST only; no source read
        assert.strictEqual(calls.length, 2);
        const draftBody = JSON.parse(calls[1].options.body);
        assert.strictEqual(draftBody.in_reply_to, "<explicit-in-reply-to@example.com>");
        assert.strictEqual(draftBody.references, "<explicit-ref@example.com>");
        assert.strictEqual(draftBody.in_reply_to_uid, "42@fid");
    });

    it("createDraft resolves References from uid when only in_reply_to is explicit", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "42",
                msg_id: "<resolved@example.com>",
                subject: "Original",
                from: [{ name: "A", email: "a@test.com" }],
                to: [{ name: "B", email: "b@test.com" }],
                date: "2026-01-01",
                body: { value: "Hi", type: "text/plain" },
                html: "<p>Hi</p>",
                preview: "Hi",
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: { references: "<parent@example.com>" },
            },
        });

        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft(
            "a@test.com",
            "Re: Original",
            "Reply",
            undefined,
            undefined,
            undefined,
            "<explicit-in-reply-to@example.com>",
            "42@fid",
        );

        const calls = fetchMock.calls();
        const draftBody = JSON.parse(calls[2].options.body);
        // explicit in_reply_to preserved
        assert.strictEqual(draftBody.in_reply_to, "<explicit-in-reply-to@example.com>");
        // references resolved from source
        assert.strictEqual(draftBody.references, "<parent@example.com> <resolved@example.com>");
    });

    it("createDraft rejects in_reply_to_uid with missing msg_id", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        fetchMock.enqueue({
            result: "success",
            data: {
                uid: "42",
                msg_id: null,
                subject: "Original",
                from: [{ name: "A", email: "a@test.com" }],
                to: [{ name: "B", email: "b@test.com" }],
                date: "2026-01-01",
                body: { value: "Hi", type: "text/plain" },
                html: "<p>Hi</p>",
                preview: "Hi",
                seen: true,
                flagged: false,
                folder: "INBOX",
                headers: {},
            },
        });

        await assert.rejects(
            client.createDraft(
                "a@test.com",
                "Re: Original",
                "Reply",
                undefined,
                undefined,
                undefined,
                undefined,
                "42@fid",
            ),
            /cannot build threading headers/,
        );
    });

    it("createDraft rejects invalid in_reply_to_uid format", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        await assert.rejects(
            client.createDraft(
                "a@test.com",
                "Re: Original",
                "Reply",
                undefined,
                undefined,
                undefined,
                undefined,
                "invalid-uid-no-at-sign",
            ),
            /Invalid in_reply_to_uid format/,
        );
    });

    it("createDraft without in_reply_to_uid skips threading resolution", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }],
        });
        await client.init();

        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });

        await client.createDraft("a@test.com", "Subject", "Body");

        const calls = fetchMock.calls();
        // init + draft POST only, no readEmail call
        assert.strictEqual(calls.length, 2);
        assert.ok(!calls.some((c) => c.url.includes("/message/")), "should not read source message");
    });

    it("updateDraft modifies draft fields", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }] });
        await client.init();

        // create draft
        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });
        const draft = await client.createDraft("a@test.com", "Original", "Body");

        // update draft
        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid-updated" } });
        const updated = await client.updateDraft(draft.uuid, { subject: "Updated", to: "b@test.com" });

        assert.strictEqual(updated.subject, "Updated");
        assert.strictEqual(updated.to, "b@test.com");
    });

    it("deleteDraft removes draft", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: [{ uuid: "mb-uuid", email: "test@test.com", mailbox: "test", hosting_id: 123 }] });
        await client.init();

        fetchMock.enqueue({ result: "success", data: { uuid: "draft-uuid", uid: "draft-uid" } });
        const draft = await client.createDraft("a@test.com", "To Delete", "Body");

        // delete
        fetchMock.enqueue({ result: "success", data: null });
        const result = await client.deleteDraft(draft.uuid);

        const calls = fetchMock.calls();
        const last = calls[calls.length - 1];
        assert.strictEqual(last.options.method, "DELETE");
        assert.ok(last.url.includes("draft-uuid"));
    });

    it("searchEmails searches all folders with scontains when no folderId given", async () => {
        const client = new MailClient("mock-token");

        // init (needed for INBOX folder resolution)
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

        // folders response for INBOX resolution
        fetchMock.enqueue({
            result: "success",
            data: [
                { id: "inbox-id", name: "INBOX", role: "INBOX" },
                { id: "sent-id", name: "Sent", role: "SENT" },
            ],
        });

        // search response
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "thread-1",
                        subject: "Test result",
                        from: [{ name: "Alice", email: "alice@test.com" }],
                        to: [{ name: "Bob", email: "bob@test.com" }],
                        date: "2026-06-21T21:36:56+0200",
                        messages_count: 1,
                        unseen_messages: 0,
                        messages: [
                            {
                                uid: "10@eJwLTs0rAQADzwGb",
                                preview: "Hello world",
                                folder_id: "eJwLTs0rAQADzwGb",
                                folder: "Sent",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.searchEmails("mb-uuid", { query: "test" });

        const calls = fetchMock.calls();
        // call 0 = init, call 1 = listFolders, call 2 = search
        const searchUrl = calls[2].url;
        assert.ok(searchUrl.includes("scontains=test"), "URL must contain scontains=test");
        assert.ok(searchUrl.includes("severywhere=1"), "URL must contain severywhere=1");
        assert.ok(searchUrl.includes("thread=off"), "URL must contain thread=off");
        assert.ok(searchUrl.includes("inbox-id"), "URL path must use INBOX folder id");
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].subject, "Test result");
        assert.strictEqual(result[0].from, "Alice <alice@test.com>");
        assert.strictEqual(result[0].to, "Bob <bob@test.com>");
        assert.strictEqual(result[0].folder_id, "eJwLTs0rAQADzwGb");
        assert.strictEqual(result[0].folder, "Sent");
        assert.strictEqual(result[0].first_message_uid, "10");
    });

    it("searchEmails searches within a specific folder when folderId given", async () => {
        const client = new MailClient("mock-token");

        // search response (no init/folders needed since folderId is provided)
        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "thread-2",
                        subject: "Folder search",
                        from: [{ name: "Carol", email: "carol@test.com" }],
                        to: [{ name: "Dave", email: "dave@test.com" }],
                        date: "2026-07-01T10:00:00+0200",
                        messages_count: 1,
                        unseen_messages: 1,
                        messages: [
                            {
                                uid: "5@customFolderId",
                                preview: "Folder result",
                                folder_id: "customFolderId",
                                folder: "Custom",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.searchEmails("mb-uuid", {
            query: "folder",
            folderId: "customFolderId",
        });

        const calls = fetchMock.calls();
        const searchUrl = calls[0].url;
        assert.ok(searchUrl.includes("customFolderId"), "URL path must use provided folder id");
        assert.ok(searchUrl.includes("severywhere=0"), "URL must contain severywhere=0");
        assert.ok(searchUrl.includes("scontains=folder"), "URL must contain scontains=folder");
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].folder, "Custom");
    });

    it("searchEmails combines multiple filters and formats dates correctly", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: {
                threads: [
                    {
                        uid: "thread-3",
                        subject: "Invoice June",
                        from: [{ name: "Billing", email: "billing@test.com" }],
                        to: [{ name: "Me", email: "me@test.com" }],
                        date: "2026-06-15T08:00:00+0200",
                        messages_count: 1,
                        unseen_messages: 0,
                        messages: [
                            {
                                uid: "20@folderEnc",
                                preview: "Your invoice",
                                folder_id: "folderEnc",
                                folder: "Inbox",
                            },
                        ],
                    },
                ],
            },
        });

        const result = await client.searchEmails("mb-uuid", {
            query: "invoice",
            from: "billing@test.com",
            subject: "Invoice",
            since: "2026-06-01",
            before: "2026-06-30",
            folderId: "folderEnc",
        });

        const calls = fetchMock.calls();
        const searchUrl = calls[0].url;
        assert.ok(searchUrl.includes("scontains=invoice"), "must have scontains");
        assert.ok(searchUrl.includes("sfrom=billing%40test.com"), "must have sfrom");
        assert.ok(searchUrl.includes("ssubject=Invoice"), "must have ssubject");
        assert.ok(searchUrl.includes("sfromdate=2026-06-01+00%3A00%3A00"), "must have formatted sfromdate");
        assert.ok(searchUrl.includes("stodate=2026-06-30+00%3A00%3A00"), "must have formatted stodate");
        assert.strictEqual(result.length, 1);
    });

    it("searchEmails throws when no search filters are provided", async () => {
        const client = new MailClient("mock-token");

        await assert.rejects(
            client.searchEmails("mb-uuid", {}),
            /At least one search filter/,
        );
    });

    it("markEmails marks messages as read with correct URL and body", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.markEmails("mb-uuid", "fid", ["1", "2"], true);

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/seen");
        assert.strictEqual(calls[0].options.method, "POST");
        const body = JSON.parse(calls[0].options.body);
        assert.deepStrictEqual(body, { uids: ["1@fid", "2@fid"] });
        assert.strictEqual(result.result, "success");
        assert.strictEqual(result.marked, 2);
        assert.strictEqual(result.read, true);
    });

    it("markEmails marks messages as unread with correct URL and body", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.markEmails("mb-uuid", "fid", ["7"], false);

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/unseen");
        const body = JSON.parse(calls[0].options.body);
        assert.deepStrictEqual(body, { uids: ["7@fid"] });
        assert.strictEqual(result.read, false);
    });

    it("markEmails throws when messageIds is empty", async () => {
        const client = new MailClient("mock-token");

        await assert.rejects(
            client.markEmails("mb-uuid", "fid", [], true),
            /At least one message_id/,
        );
    });

    it("moveEmails sends move request with correct body", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.moveEmails("mb-uuid", ["1", "2"], "from-fid", "to-fid");

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/move");
        assert.strictEqual(calls[0].options.method, "POST");
        const body = JSON.parse(calls[0].options.body);
        assert.deepStrictEqual(body, {
            uids: ["1@from-fid", "2@from-fid"],
            to: "to-fid",
            move_reactions: false,
        });
        assert.strictEqual(result.result, "success");
        assert.strictEqual(result.moved, 2);
        assert.strictEqual(result.to, "to-fid");
    });

    it("moveEmails throws when messageIds is empty", async () => {
        const client = new MailClient("mock-token");

        await assert.rejects(
            client.moveEmails("mb-uuid", [], "from-fid", "to-fid"),
            /At least one message_id/,
        );
    });

    it("formatUids leaves UIDs containing @ unchanged", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        await client.moveEmails("mb-uuid", ["5@already-formatted"], "from-fid", "to-fid");

        const calls = fetchMock.calls();
        const body = JSON.parse(calls[0].options.body);
        assert.deepStrictEqual(body.uids, ["5@already-formatted"]);
    });

    it("archiveEmails resolves ARCHIVE folder and moves messages there", async () => {
        const client = new MailClient("mock-token");

        // folders response
        fetchMock.enqueue({
            result: "success",
            data: [
                { id: "inbox-id", name: "INBOX", separator: "/", role: "INBOX", children: [] },
                { id: "archive-id", name: "Archives", separator: "/", role: "ARCHIVE", children: [] },
                { id: "trash-id", name: "Trash", separator: "/", role: "TRASH", children: [] },
            ],
        });
        // move response
        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.archiveEmails("mb-uuid", "inbox-id", ["1", "2"]);

        const calls = fetchMock.calls();
        // call 0 = listFolders, call 1 = move
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/folder?with=ik-static");
        assert.strictEqual(calls[1].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/move");
        const body = JSON.parse(calls[1].options.body);
        assert.deepStrictEqual(body, {
            uids: ["1@inbox-id", "2@inbox-id"],
            to: "archive-id",
            move_reactions: false,
        });
        assert.strictEqual(result.result, "success");
        assert.strictEqual(result.archived, 2);
    });

    it("archiveEmails throws when ARCHIVE folder is not found", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({
            result: "success",
            data: [
                { id: "inbox-id", name: "INBOX", separator: "/", role: "INBOX", children: [] },
            ],
        });

        await assert.rejects(
            client.archiveEmails("mb-uuid", "inbox-id", ["1"]),
            /ARCHIVE folder not found/,
        );
    });

    it("deleteEmails with permanent=false moves to TRASH folder", async () => {
        const client = new MailClient("mock-token");

        // folders response
        fetchMock.enqueue({
            result: "success",
            data: [
                { id: "inbox-id", name: "INBOX", separator: "/", role: "INBOX", children: [] },
                { id: "trash-id", name: "Trash", separator: "/", role: "TRASH", children: [] },
            ],
        });
        // move response
        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.deleteEmails("mb-uuid", "inbox-id", ["1"], false);

        const calls = fetchMock.calls();
        assert.strictEqual(calls[1].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/move");
        const body = JSON.parse(calls[1].options.body);
        assert.strictEqual(body.to, "trash-id");
        assert.strictEqual(result.result, "success");
        assert.strictEqual(result.deleted, 1);
        assert.strictEqual(result.permanent, false);
    });

    it("deleteEmails with permanent=true calls message/delete directly", async () => {
        const client = new MailClient("mock-token");

        fetchMock.enqueue({ result: "success", data: null });

        const result = await client.deleteEmails("mb-uuid", "inbox-id", ["1", "2"], true);

        const calls = fetchMock.calls();
        assert.strictEqual(calls[0].url, "https://mail.infomaniak.com/api/mail/mb-uuid/message/delete");
        assert.strictEqual(calls[0].options.method, "POST");
        const body = JSON.parse(calls[0].options.body);
        assert.deepStrictEqual(body, {
            uids: ["1@inbox-id", "2@inbox-id"],
            move_reactions: false,
        });
        assert.strictEqual(result.deleted, 2);
        assert.strictEqual(result.permanent, true);
    });

    it("deleteEmails throws when messageIds is empty", async () => {
        const client = new MailClient("mock-token");

        await assert.rejects(
            client.deleteEmails("mb-uuid", "fid", [], false),
            /At least one message_id/,
        );
    });
});
