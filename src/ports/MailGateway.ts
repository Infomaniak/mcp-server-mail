import {
  DraftResult,
  Email,
  EmailSummary,
  Folder,
  Mailbox,
} from "../domain/models.js";

export interface GatewaySendEmailInput {
  from: { name: string; email: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export interface MailGateway {
  listMailboxes(): Promise<Mailbox[]>;
  getPrimaryMailbox(): Promise<Mailbox>;
  listFolders(mailboxUuid: string): Promise<Folder[]>;
  listEmails(
    mailboxUuid: string,
    folderId: string,
    limit: number,
    offset: number,
  ): Promise<EmailSummary[]>;
  readEmail(
    mailboxUuid: string,
    folderId: string,
    messageId: string,
  ): Promise<Email>;
  sendEmail(input: GatewaySendEmailInput): Promise<DraftResult>;
}
