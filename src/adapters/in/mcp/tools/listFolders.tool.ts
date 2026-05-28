import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {listFolders} from "../../../../application/listFolders.js";
import {MailGateway} from "../../../../ports/MailGateway.js";
import {jsonResponse} from "../responses.js";
import * as schemas from "../schemas.js";

export function register(server: McpServer, gateway: MailGateway) {
  server.tool(
    "mail_list_folders",
    "List all folders in a mailbox",
    {
      mailbox_uuid: schemas.mailboxUuid,
    },
    async ({mailbox_uuid}) => {
      const folders = await listFolders(gateway, {mailboxUuid: mailbox_uuid});

      return jsonResponse(folders);
    },
  );
}
