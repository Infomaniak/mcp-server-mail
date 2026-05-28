import ApiClient from "./ApiClient.js";
import {formatAddresses, parseRecipients} from "../helpers/addresses.js";
import {
  ApiDraft,
  ApiFolder,
  ApiMailbox,
  ApiMessage,
  ApiThread,
  ApiThreadList,
  DraftPayload,
  Email,
  EmailSummary,
  Folder,
  Mailbox,
} from "../types.js";

export default class MailClient {
  readonly #api: ApiClient;
  #mailboxUuid: string | null = null;
  #hostingId: number | null = null; /** necessary in the future ? */
  #mailboxName: string | null = null; /** necessary in the future ? */
  #fromEmail: string | null = null;
  #fromName: string | null = null;

  constructor(api: ApiClient) {
    this.#api = api;
  }

  async init(): Promise<void> {
    const mailboxes = await this.#api.request<ApiMailbox[]>(
      "/mailbox?with=aliases,permissions,accountId,count_users",
    );
    if (!mailboxes?.length) {
      throw new Error("No mailboxes found. Check your MAIL_TOKEN.");
    }

    const mailbox = mailboxes.find((m) => m.is_primary) ?? mailboxes[0];
    this.#mailboxUuid = mailbox.uuid;
    this.#hostingId = mailbox.hosting_id;
    this.#mailboxName = mailbox.mailbox;
    this.#fromEmail = mailbox.email;
    this.#fromName = mailbox.email.split("@")[0];
  }

  get mailboxUuid(): string {
    if (!this.#mailboxUuid) throw new Error("Mailbox not initialized");
    return this.#mailboxUuid;
  }

  async listMailboxes(): Promise<Mailbox[]> {
    const mailboxes = await this.#api.request<ApiMailbox[]>(
      "/mailbox?with=aliases,permissions,accountId,count_users",
    );
    return mailboxes.map((m) => ({
      uuid: m.uuid,
      email: m.email,
      mailbox: m.mailbox,
      is_primary: m.is_primary,
      hosting_id: m.hosting_id,
    }));
  }

  async listFolders(mailboxUuid: string): Promise<Folder[]> {
    const data = await this.#api.request<ApiFolder[]>(
      `/mail/${mailboxUuid}/folder?with=ik-static`,
    );

    const flatten = (folders: ApiFolder[], prefix = ""): Folder[] => {
      const result: Folder[] = [];
      for (const folder of folders || []) {
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
          result.push(...flatten(folder.children, fullPath));
        }
      }
      return result;
    };

    return flatten(data || []);
  }

  async listEmails(
    mailboxUuid: string,
    folderId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<EmailSummary[]> {
    const data = await this.#api.request<ApiThreadList>(
      `/mail/${mailboxUuid}/folder/${folderId}/message?offset=${offset}&thread=on&severywhere=0&limit=${limit}`,
    );

    return (data?.threads || []).map((thread: ApiThread) => ({
      thread_uid: thread.uid,
      subject: thread.subject || "(no subject)",
      from: formatAddresses(thread.from),
      date: thread.date,
      messages_count: thread.messages_count,
      unseen_messages: thread.unseen_messages,
      preview: thread.messages?.[0]?.preview || "",
      first_message_uid: thread.messages?.[0]?.uid || null,
    }));
  }

  async readEmail(
    mailboxUuid: string,
    folderId: string,
    messageId: string,
  ): Promise<Email> {
    const data = await this.#api.request<ApiMessage>(
      `/mail/${mailboxUuid}/folder/${folderId}/message/${messageId}?prefered_format=html&with=auto_uncrypt,thread_context`,
    );

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

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    cc?: string,
    bcc?: string,
  ): Promise<ApiDraft> {
    if (!this.#mailboxUuid) throw new Error("Mailbox not initialized");

    const toRecipients = parseRecipients(to);
    const ccRecipients = cc ? parseRecipients(cc) : null;
    const bccRecipients = bcc ? parseRecipients(bcc) : null;

    const htmlBody = `<html><body><div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px;">${body.replace(/\n/g, "<br>")}</div></body></html>`;

    const draftPayload: DraftPayload = {
      uuid: null,
      subject,
      body: htmlBody,
      quote: null,
      mime_type: "text/html",
      from: {
        id: null,
        name: this.#fromName,
        email: this.#fromEmail,
      },
      reply_to: {
        name: this.#fromName,
        email: this.#fromEmail,
      },
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
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

    const draft = await this.#api.request<ApiDraft>(
      `/mail/${this.#mailboxUuid}/draft`,
      {
        method: "POST",
        body: JSON.stringify(draftPayload),
      },
    );

    const sendPayload: DraftPayload = {
      ...draftPayload,
      uuid: draft.uuid,
      uid: draft.uid,
      resource: `/api/mail/${this.#mailboxUuid}/draft/${draft.uuid}`,
      action: "send",
    };

    return this.#api.request<ApiDraft>(
      `/mail/${this.#mailboxUuid}/draft/${draft.uuid}`,
      {
        method: "PUT",
        body: JSON.stringify(sendPayload),
      },
    );
  }
}
