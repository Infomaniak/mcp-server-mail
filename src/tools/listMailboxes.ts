import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {jsonResponse} from "../helpers/responses.js";

export function register(server: McpServer, mailClient: MailClient) {
  server.tool(
    "mail_list_mailboxes",
    "List all mailboxes in the Infomaniak account",
    {},
    async () => {
      const mailboxes = await mailClient.listMailboxes();

      return jsonResponse(mailboxes);
    },
  );
}
