#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import ApiClient from "./classes/ApiClient.js";
import MailClient from "./classes/MailClient.js";
import {jsonResponse} from "./helpers/responses.js";

const MAIL_TOKEN = process.env.MAIL_TOKEN;

if (!MAIL_TOKEN) {
    console.error(
        "Please set MAIL_TOKEN environment variable",
    );
    process.exit(1);
}

const apiClient = new ApiClient(MAIL_TOKEN);
const mailClient = new MailClient(apiClient);

const server = new McpServer(
    {
        name: "Infomaniak Mail MCP Server",
        version: "0.0.1",
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

server.tool(
    "mail_list_mailboxes",
    "List all mailboxes in the Infomaniak account",
    {},
    async () => {
        const mailboxes = await mailClient.listMailboxes();

        return jsonResponse(mailboxes);
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
        const uuid = mailbox_uuid || mailClient.mailboxUuid;
        const folders = await mailClient.listFolders(uuid);

        return jsonResponse(folders);
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
        const uuid = mailbox_uuid || mailClient.mailboxUuid;
        const emails = await mailClient.listEmails(uuid, folder_id, limit, offset);

        return jsonResponse(emails);
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
        const uuid = mailbox_uuid || mailClient.mailboxUuid;
        const email = await mailClient.readEmail(uuid, folder_id, message_id);

        return jsonResponse(email);
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
    },
    async ({to, subject, body, cc, bcc}) => {
        const result = await mailClient.sendEmail(to, subject, body, cc, bcc);

        return jsonResponse(result);
    },
);

async function main() {
    await mailClient.init();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
