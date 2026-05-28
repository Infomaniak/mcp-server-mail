import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {listMailboxes} from "../../../../application/listMailboxes.js";
import {MailGateway} from "../../../../ports/MailGateway.js";
import {jsonResponse} from "../responses.js";

export function register(server: McpServer, gateway: MailGateway) {
  server.tool(
    "mail_list_mailboxes",
    "List all mailboxes in the Infomaniak account",
    {},
    async () => {
      const mailboxes = await listMailboxes(gateway);

      return jsonResponse(mailboxes);
    },
  );
}
