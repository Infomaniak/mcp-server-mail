import {EmailSummary} from "../domain/models.js";
import {MailGateway} from "../ports/MailGateway.js";

export interface ListEmailsRequest {
  folderId: string;
  limit?: number;
  offset?: number;
  mailboxUuid?: string;
}

export async function listEmails(
  gateway: MailGateway,
  request: ListEmailsRequest,
): Promise<EmailSummary[]> {
  const uuid =
    request.mailboxUuid ?? (await gateway.getPrimaryMailbox()).uuid;
  return gateway.listEmails(
    uuid,
    request.folderId,
    request.limit ?? 50,
    request.offset ?? 0,
  );
}
