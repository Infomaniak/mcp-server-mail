import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {listEmails} from "../../../../application/listEmails.js";
import {MailGateway} from "../../../../ports/MailGateway.js";
import {jsonResponse} from "../responses.js";
import * as schemas from "../schemas.js";

export function register(server: McpServer, gateway: MailGateway) {
  server.tool(
    "mail_list_emails",
    "List emails in a folder",
    {
      folder_id: schemas.folderId,
      mailbox_uuid: schemas.mailboxUuid,
      limit: schemas.limit,
      offset: schemas.offset,
    },
    async ({folder_id, mailbox_uuid, limit, offset}) => {
      const emails = await listEmails(gateway, {
        folderId: folder_id,
        mailboxUuid: mailbox_uuid,
        limit,
        offset,
      });

      return jsonResponse(emails);
    },
  );
}
