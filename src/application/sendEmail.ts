import {DraftResult} from "../domain/models.js";
import {MailGateway} from "../ports/MailGateway.js";

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export async function sendEmail(
  gateway: MailGateway,
  request: SendEmailRequest,
): Promise<DraftResult> {
  const primary = await gateway.getPrimaryMailbox();
  return gateway.sendEmail({
    from: {
      name: primary.email.split("@")[0],
      email: primary.email,
    },
    ...request,
  });
}
