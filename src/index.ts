#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {MailClient} from "./mail-client.js";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {version} = require("../package.json") as {version: string};

const server = new McpServer(
    {
        name: "Infomaniak Mail MCP Server",
        version,
    },
    {
        capabilities: {
            completions: {},
            prompts: {},
            resources: {},
            tools: {},
        },
    },
);

if (!process.env.MAIL_TOKEN) {
    console.error("Please set MAIL_TOKEN environment variable");
    process.exit(1);
}

const token = process.env.MAIL_TOKEN;

const mailClient = new MailClient(token);

server.tool(
    "mail_list_mailboxes",
    "List all mailboxes in the Infomaniak account",
    {},
    async () => {
        const mailboxes = await mailClient.listMailboxes();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(mailboxes, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_list_folders",
    "List all folders in a mailbox",
    {
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const folders = await mailClient.listFolders(uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(folders, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_list_emails",
    "List emails in a folder",
    {
        folder_id: z.string().describe("Folder ID (e.g., INBOX folder id)"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
        limit: z
            .number()
            .describe("Maximum number of emails to return")
            .default(50),
        offset: z
            .number()
            .describe("Offset for pagination")
            .default(0),
    },
    async ({folder_id, mailbox_uuid, limit, offset}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const emails = await mailClient.listEmails(uuid, folder_id, limit, offset);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(emails, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_search_emails",
    "Search emails by keyword, sender, recipient, subject, or date range across all folders or within a specific folder",
    {
        query: z
            .string()
            .describe("Full-text search in message body and metadata")
            .optional(),
        from: z
            .string()
            .describe("Filter by sender email or name")
            .optional(),
        to: z
            .string()
            .describe("Filter by recipient email or name")
            .optional(),
        subject: z
            .string()
            .describe("Filter by subject")
            .optional(),
        since: z
            .string()
            .describe("Start date (YYYY-MM-DD)")
            .optional(),
        before: z
            .string()
            .describe("End date (YYYY-MM-DD)")
            .optional(),
        unseen: z
            .boolean()
            .describe("If true, only return unread emails. If false, only return read emails.")
            .optional(),
        folder_id: z
            .string()
            .describe("Limit search to a specific folder. If omitted, searches all folders.")
            .optional(),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
        limit: z
            .number()
            .describe("Maximum number of results to return")
            .default(50),
        offset: z
            .number()
            .describe("Offset for pagination")
            .default(0),
    },
    async ({query, from, to, subject, since, before, unseen, folder_id, mailbox_uuid, limit, offset}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const results = await mailClient.searchEmails(uuid, {
            query,
            from,
            to,
            subject,
            since,
            before,
            unseen,
            folderId: folder_id,
            limit,
            offset,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(results, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_read_email",
    "Read a specific email",
    {
        folder_id: z.string().describe("Folder ID containing the email"),
        message_id: z.string().describe("Message ID or UID"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({folder_id, message_id, mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const email = await mailClient.readEmail(uuid, folder_id, message_id);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(email, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_send_email",
    "Send an email",
    {
        to: z
            .string()
            .describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z
            .string()
            .describe("CC recipient(s), comma-separated")
            .optional(),
        bcc: z
            .string()
            .describe("BCC recipient(s), comma-separated")
            .optional(),
        attachments: z
            .array(z.string())
            .describe("Array of local file paths to attach to the email")
            .optional(),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({to, subject, body, cc, bcc, attachments, mailbox_uuid}) => {
        const result = await mailClient.sendEmail(to, subject, body, cc, bcc, attachments, mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_create_draft",
    "Create a new email draft",
    {
        to: z
            .string()
            .describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe("Draft subject"),
        body: z.string().describe("Draft body (plain text)"),
        cc: z
            .string()
            .describe("CC recipient(s), comma-separated")
            .optional(),
        bcc: z
            .string()
            .describe("BCC recipient(s), comma-separated")
            .optional(),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({to, subject, body, cc, bcc, mailbox_uuid}) => {
        const result = await mailClient.createDraft(to, subject, body, cc, bcc, mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_update_draft",
    "Update an existing email draft. Only fields you want to change need to be provided.",
    {
        draft_uuid: z.string().describe("Draft UUID to update"),
        subject: z.string().describe("New draft subject").optional(),
        body: z.string().describe("New draft body (plain text)").optional(),
        to: z.string().describe("New recipient(s), comma-separated").optional(),
        cc: z.string().describe("New CC recipient(s), comma-separated").optional(),
        bcc: z.string().describe("New BCC recipient(s), comma-separated").optional(),
        attachments: z
            .array(z.string())
            .describe("Files to attach to the draft")
            .optional(),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional)")
            .optional(),
    },
    async ({draft_uuid, subject, body, to, cc, bcc, attachments, mailbox_uuid}) => {
        const options: any = {};
        if (subject !== undefined) options.subject = subject;
        if (body !== undefined) options.body = body;
        if (to !== undefined) options.to = to;
        if (cc !== undefined) options.cc = cc;
        if (bcc !== undefined) options.bcc = bcc;
        if (attachments !== undefined) options.attachments = attachments;
        
        const result = await mailClient.updateDraft(draft_uuid, options, mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_send_draft",
    "Send an existing email draft",
    {
        draft_uuid: z.string().describe("Draft UUID to send"),
        delay: z
            .number()
            .describe("Delay in seconds before sending (default: 0)")
            .default(0),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional)")
            .optional(),
    },
    async ({draft_uuid, delay, mailbox_uuid}) => {
        const result = await mailClient.sendDraft(draft_uuid, delay, mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_delete_draft",
    "Delete an email draft",
    {
        draft_uuid: z.string().describe("Draft UUID to delete"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional)")
            .optional(),
    },
    async ({draft_uuid, mailbox_uuid}) => {
        const result = await mailClient.deleteDraft(draft_uuid, mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_list_drafts",
    "List all drafts in the mailbox",
    {
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({mailbox_uuid}) => {
        const drafts = await mailClient.listDrafts(mailbox_uuid);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(drafts, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_mark_email",
    "Mark one or more emails as read or unread",
    {
        folder_id: z.string().describe("Folder ID containing the messages"),
        message_ids: z
            .array(z.string())
            .describe("Message sequence UIDs (numeric, without @folder_id suffix)"),
        read: z
            .boolean()
            .describe("true to mark as read, false to mark as unread"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({folder_id, message_ids, read, mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const result = await mailClient.markEmails(uuid, folder_id, message_ids, read);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_move_email",
    "Move one or more emails to a different folder",
    {
        message_ids: z
            .array(z.string())
            .describe("Message sequence UIDs (numeric, without @folder_id suffix)"),
        from_folder_id: z.string().describe("Source folder ID"),
        to_folder_id: z.string().describe("Destination folder ID"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({message_ids, from_folder_id, to_folder_id, mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const result = await mailClient.moveEmails(uuid, message_ids, from_folder_id, to_folder_id);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_archive_email",
    "Archive one or more emails (move to the Archives folder)",
    {
        folder_id: z.string().describe("Folder ID currently containing the messages"),
        message_ids: z
            .array(z.string())
            .describe("Message sequence UIDs (numeric, without @folder_id suffix)"),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({folder_id, message_ids, mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const result = await mailClient.archiveEmails(uuid, folder_id, message_ids);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

server.tool(
    "mail_delete_email",
    "Delete one or more emails (move to Trash by default, or permanently delete)",
    {
        folder_id: z.string().describe("Folder ID currently containing the messages"),
        message_ids: z
            .array(z.string())
            .describe("Message sequence UIDs (numeric, without @folder_id suffix)"),
        permanent: z
            .boolean()
            .describe("If true, permanently delete. If false (default), move to Trash.")
            .default(false),
        mailbox_uuid: z
            .string()
            .describe("Mailbox UUID (optional, uses primary if omitted)")
            .optional(),
    },
    async ({folder_id, message_ids, permanent, mailbox_uuid}) => {
        const uuid = mailbox_uuid || await mailClient.getMailboxUuid();
        const result = await mailClient.deleteEmails(uuid, folder_id, message_ids, permanent);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    },
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
