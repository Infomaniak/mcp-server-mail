import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {sendEmail} from "../../../../application/sendEmail.js";
import {MailGateway} from "../../../../ports/MailGateway.js";
import {jsonResponse} from "../responses.js";
import * as schemas from "../schemas.js";

function splitList(input: string): string[] {
  return input.split(",").map((s) => s.trim());
}

export function register(server: McpServer, gateway: MailGateway) {
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
      const result = await sendEmail(gateway, {
        to: splitList(to),
        cc: cc ? splitList(cc) : undefined,
        bcc: bcc ? splitList(bcc) : undefined,
        subject,
        body,
      });

      return jsonResponse(result);
    },
  );
}
