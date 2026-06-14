#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {MailClient} from "./mail-client.js";

const server = new McpServer(
    {
        name: "Infomaniak Mail MCP Server",
        version: "1.1.1",
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

const token = process.env.MAIL_TOKEN ?? "mock-token";

if (import.meta.url === `file://${process.argv[1]}`) {
    if (!process.env.MAIL_TOKEN) {
        console.error("Please set MAIL_TOKEN environment variable");
        process.exit(1);
    }
}

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

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error("Fatal error in main():", error);
        process.exit(1);
    });
}
