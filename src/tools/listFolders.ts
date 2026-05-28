import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {jsonResponse} from "../helpers/responses.js";
import * as schemas from "../helpers/schemas.js";

export function register(server: McpServer, mailClient: MailClient) {
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
}
