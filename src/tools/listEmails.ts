import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {jsonResponse} from "../helpers/responses.js";
import * as schemas from "../helpers/schemas.js";

export function register(server: McpServer, mailClient: MailClient) {
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
      const uuid = mailbox_uuid || mailClient.mailboxUuid;
      const emails = await mailClient.listEmails(uuid, folder_id, limit, offset);

      return jsonResponse(emails);
    },
  );
}
