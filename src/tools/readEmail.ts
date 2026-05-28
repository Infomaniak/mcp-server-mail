import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {jsonResponse} from "../helpers/responses.js";
import * as schemas from "../helpers/schemas.js";

export function register(server: McpServer, mailClient: MailClient) {
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
}
