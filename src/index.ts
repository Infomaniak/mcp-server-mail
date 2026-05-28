#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import ApiClient from "./classes/ApiClient.js";
import MailClient from "./classes/MailClient.js";
import {jsonResponse} from "./helpers/responses.js";
import * as schemas from "./helpers/schemas.js";

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
        mailbox_uuid: schemas.mailboxUuid,
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
        folder_id: schemas.folderId,
        mailbox_uuid: schemas.mailboxUuid,
        limit: schemas.limit,
        offset: schemas.offset,
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
        folder_id: schemas.folderId,
        message_id: schemas.messageId,
        mailbox_uuid: schemas.mailboxUuid,
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
        to: schemas.to,
        subject: schemas.subject,
        body: schemas.body,
        cc: schemas.cc,
        bcc: schemas.bcc,
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
