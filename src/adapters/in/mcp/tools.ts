import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {MailGateway} from "../../../ports/MailGateway.js";
import {register as listEmails} from "./tools/listEmails.tool.js";
import {register as listFolders} from "./tools/listFolders.tool.js";
import {register as listMailboxes} from "./tools/listMailboxes.tool.js";
import {register as readEmail} from "./tools/readEmail.tool.js";
import {register as sendEmail} from "./tools/sendEmail.tool.js";

export function registerTools(server: McpServer, gateway: MailGateway) {
  listMailboxes(server, gateway);
  listFolders(server, gateway);
  listEmails(server, gateway);
  readEmail(server, gateway);
  sendEmail(server, gateway);
}
