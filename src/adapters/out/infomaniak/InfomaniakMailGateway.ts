import {
  DraftResult,
  Email,
  EmailSummary,
  Folder,
  Mailbox,
} from "../../../domain/models.js";
import {
  GatewaySendEmailInput,
  MailGateway,
} from "../../../ports/MailGateway.js";
import HttpClient from "./HttpClient.js";
import {formatAddresses, toDraftAddresses} from "./addresses.js";
import {
  ApiDraft,
  ApiFolder,
  ApiMailbox,
  ApiMessage,
  ApiThread,
  ApiThreadList,
  DraftPayload,
} from "./types.js";

const MAILBOXES_PATH =
  "/mailbox?with=aliases,permissions,accountId,count_users";

export default class InfomaniakMailGateway implements MailGateway {
  readonly #http: HttpClient;
  #primaryMailbox: Mailbox | null = null;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  async listMailboxes(): Promise<Mailbox[]> {
    const mailboxes = await this.#http.request<ApiMailbox[]>(MAILBOXES_PATH);
    return mailboxes.map(toMailbox);
  }

  async getPrimaryMailbox(): Promise<Mailbox> {
    if (this.#primaryMailbox) return this.#primaryMailbox;

    const mailboxes = await this.listMailboxes();
    if (!mailboxes.length) {
      throw new Error("No mailboxes found. Check your MAIL_TOKEN.");
    }
    this.#primaryMailbox =
      mailboxes.find((m) => m.is_primary) ?? mailboxes[0];
    return this.#primaryMailbox;
  }

  async listFolders(mailboxUuid: string): Promise<Folder[]> {
    const data = await this.#http.request<ApiFolder[]>(
      `/mail/${mailboxUuid}/folder?with=ik-static`,
    );
    return flattenFolders(data || []);
  }

  async listEmails(
    mailboxUuid: string,
    folderId: string,
    limit: number,
    offset: number,
  ): Promise<EmailSummary[]> {
    const data = await this.#http.request<ApiThreadList>(
      `/mail/${mailboxUuid}/folder/${folderId}/message?offset=${offset}&thread=on&severywhere=0&limit=${limit}`,
    );
    return (data?.threads || []).map(toEmailSummary);
  }

  async readEmail(
    mailboxUuid: string,
    folderId: string,
    messageId: string,
  ): Promise<Email> {
    const data = await this.#http.request<ApiMessage>(
      `/mail/${mailboxUuid}/folder/${folderId}/message/${messageId}?prefered_format=html&with=auto_uncrypt,thread_context`,
    );
    return toEmail(data);
  }

  async sendEmail(input: GatewaySendEmailInput): Promise<DraftResult> {
    const primary = await this.getPrimaryMailbox();

    const htmlBody = `<html><body><div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px;">${input.body.replace(/\n/g, "<br>")}</div></body></html>`;

    const draftPayload: DraftPayload = {
      uuid: null,
      subject: input.subject,
      body: htmlBody,
      quote: null,
      mime_type: "text/html",
      from: {
        id: null,
        name: input.from.name,
        email: input.from.email,
      },
      reply_to: {
        name: input.from.name,
        email: input.from.email,
      },
      to: toDraftAddresses(input.to),
      cc: input.cc ? toDraftAddresses(input.cc) : null,
      bcc: input.bcc ? toDraftAddresses(input.bcc) : null,
      references: "",
      in_reply_to: null,
      in_reply_to_uid: null,
      forwarded_uid: null,
      attachments: [],
      identity_id: null,
      ack_request: false,
      st_uuid: null,
      uid: null,
      resource: null,
      priority: "normal",
      encrypted: false,
      encryption_password: "",
      event_poll_uuid: null,
      action: "save",
      delay: 0,
    };

    const draft = await this.#http.request<ApiDraft>(
      `/mail/${primary.uuid}/draft`,
      {
        method: "POST",
        body: JSON.stringify(draftPayload),
      },
    );

    const sendPayload: DraftPayload = {
      ...draftPayload,
      uuid: draft.uuid,
      uid: draft.uid,
      resource: `/api/mail/${primary.uuid}/draft/${draft.uuid}`,
      action: "send",
    };

    return this.#http.request<ApiDraft>(
      `/mail/${primary.uuid}/draft/${draft.uuid}`,
      {
        method: "PUT",
        body: JSON.stringify(sendPayload),
      },
    );
  }
}

function toMailbox(m: ApiMailbox): Mailbox {
  return {
    uuid: m.uuid,
    email: m.email,
    mailbox: m.mailbox,
    is_primary: m.is_primary,
    hosting_id: m.hosting_id,
  };
}

function flattenFolders(folders: ApiFolder[], prefix = ""): Folder[] {
  const result: Folder[] = [];
  for (const folder of folders) {
    const fullPath = prefix
      ? `${prefix}${folder.separator}${folder.name}`
      : folder.name;
    result.push({
      id: folder.id,
      name: folder.name,
      path: fullPath,
      role: folder.role,
      unread_count: folder.unread_count,
      total_count: folder.total_count,
    });
    if (folder.children?.length) {
      result.push(...flattenFolders(folder.children, fullPath));
    }
  }
  return result;
}

function toEmailSummary(thread: ApiThread): EmailSummary {
  return {
    thread_uid: thread.uid,
    subject: thread.subject || "(no subject)",
    from: formatAddresses(thread.from),
    date: thread.date,
    messages_count: thread.messages_count,
    unseen_messages: thread.unseen_messages,
    preview: thread.messages?.[0]?.preview || "",
    first_message_uid: thread.messages?.[0]?.uid || null,
  };
}

function toEmail(data: ApiMessage): Email {
  return {
    uid: data.uid,
    msg_id: data.msg_id,
    subject: data.subject || "(no subject)",
    from: formatAddresses(data.from),
    to: formatAddresses(data.to),
    cc: formatAddresses(data.cc),
    bcc: formatAddresses(data.bcc),
    date: data.date,
    body: data.body,
    html: data.html,
    preview: data.preview,
    has_attachments: data.has_attachments,
    seen: data.seen,
    flagged: data.flagged,
    folder: data.folder,
    headers: data.headers,
  };
}
