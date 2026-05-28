import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import MailClient from "../classes/MailClient.js";
import {jsonResponse} from "../helpers/responses.js";
import * as schemas from "../helpers/schemas.js";

export function register(server: McpServer, mailClient: MailClient) {
  server.tool(
    "mail_send_email",
    "Send an email",
    {
      to: schemas.to,
      subject: schemas.subject,
      body: schemas.body,
      cc: schemas.cc,
      bcc: schemas.bcc,
    },
    async ({to, subject, body, cc, bcc}) => {
      const result = await mailClient.sendEmail(to, subject, body, cc, bcc);

      return jsonResponse(result);
    },
  );
}
