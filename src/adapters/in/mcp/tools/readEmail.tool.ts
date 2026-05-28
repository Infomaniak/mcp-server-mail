import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {readEmail} from "../../../../application/readEmail.js";
import {MailGateway} from "../../../../ports/MailGateway.js";
import {jsonResponse} from "../responses.js";
import * as schemas from "../schemas.js";

export function register(server: McpServer, gateway: MailGateway) {
  server.tool(
    "mail_read_email",
    "Read a specific email",
    {
      folder_id: schemas.folderId,
      message_id: schemas.messageId,
      mailbox_uuid: schemas.mailboxUuid,
    },
    async ({folder_id, message_id, mailbox_uuid}) => {
      const email = await readEmail(gateway, {
        folderId: folder_id,
        messageId: message_id,
        mailboxUuid: mailbox_uuid,
      });

      return jsonResponse(email);
    },
  );
}
