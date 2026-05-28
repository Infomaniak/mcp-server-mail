import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {register as listMailboxes} from "./listMailboxes.js";
import {register as listFolders} from "./listFolders.js";
import {register as listEmails} from "./listEmails.js";
import {register as readEmail} from "./readEmail.js";
import {register as sendEmail} from "./sendEmail.js";

export function registerTools(server: McpServer, mailClient: MailClient) {
  listMailboxes(server, mailClient);
  listFolders(server, mailClient);
  listEmails(server, mailClient);
  readEmail(server, mailClient);
  sendEmail(server, mailClient);
}
