import {Email} from "../domain/models.js";
import {MailGateway} from "../ports/MailGateway.js";

export interface ReadEmailRequest {
  folderId: string;
  messageId: string;
  mailboxUuid?: string;
}

export async function readEmail(
  gateway: MailGateway,
  request: ReadEmailRequest,
): Promise<Email> {
  const uuid =
    request.mailboxUuid ?? (await gateway.getPrimaryMailbox()).uuid;
  return gateway.readEmail(uuid, request.folderId, request.messageId);
}
