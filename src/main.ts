#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {registerTools} from "./adapters/in/mcp/tools.js";
import HttpClient from "./adapters/out/infomaniak/HttpClient.js";
import InfomaniakMailGateway from "./adapters/out/infomaniak/InfomaniakMailGateway.js";

const MAIL_TOKEN = process.env.MAIL_TOKEN;

if (!MAIL_TOKEN) {
    console.error("Please set MAIL_TOKEN environment variable");
    process.exit(1);
}

const http = new HttpClient(MAIL_TOKEN);
const gateway = new InfomaniakMailGateway(http);

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

registerTools(server, gateway);

async function main() {
    await gateway.getPrimaryMailbox();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
