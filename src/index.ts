#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import ApiClient from "./classes/ApiClient.js";
import MailClient from "./classes/MailClient.js";
import {registerTools} from "./tools/index.js";

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

registerTools(server, mailClient);

async function main() {
    await mailClient.init();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
