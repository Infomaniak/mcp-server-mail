const API_BASE = "https://mail.infomaniak.com/api";

export default class MailClient {
  private readonly headers: { Authorization: string; "Content-Type": string };
  private mailboxUuid: string | null = null;
  private hostingId: number | null = null; /** necessary in the future ? */
  private mailboxName: string | null = null; /** necessary in the future ? */
  private fromEmail: string | null = null;
  private fromName: string | null = null;

  constructor(token: string) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async apiRequest(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options.headers as Record<string, string> || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    return response.json();
  }

  async init(): Promise<void> {
    const mailboxesResponse = await this.apiRequest(
      "/mailbox?with=aliases,permissions,accountId,count_users",
    );
    if (
      mailboxesResponse.result !== "success" ||
      !mailboxesResponse.data?.length
    ) {
      throw new Error("No mailboxes found. Check your MAIL_TOKEN.");
    }

    const mailbox = mailboxesResponse.data[0];
    this.mailboxUuid = mailbox.uuid;
    this.hostingId = mailbox.hosting_id;
    this.mailboxName = mailbox.mailbox;
    this.fromEmail = mailbox.email;
    this.fromName = mailbox.email.split("@")[0];
  }

  getMailboxUuid(): string {
    if (!this.mailboxUuid) throw new Error("Mailbox not initialized");
    return this.mailboxUuid;
  }

  async listMailboxes(): Promise<any[]> {
    const response = await this.apiRequest(
      "/mailbox?with=aliases,permissions,accountId,count_users",
    );
    return (response.data || []).map((m: any) => ({
      uuid: m.uuid,
      email: m.email,
      mailbox: m.mailbox,
      is_primary: m.is_primary,
      hosting_id: m.hosting_id,
    }));
  }

  async listFolders(mailboxUuid: string): Promise<any[]> {
    const response = await this.apiRequest(
      `/mail/${mailboxUuid}/folder?with=ik-static`,
    );

    const flatten = (folders: any[], prefix = ""): any[] => {
      const result: any[] = [];
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

    return flatten(response.data || []);
  }

  async listEmails(
    mailboxUuid: string,
    folderId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<any[]> {
    const response = await this.apiRequest(
      `/mail/${mailboxUuid}/folder/${folderId}/message?offset=${offset}&thread=on&severywhere=0&limit=${limit}`,
    );

    return (response.data?.threads || []).map((thread: any) => ({
      thread_uid: thread.uid,
      subject: thread.subject || "(no subject)",
      from: thread.from?.map((f: any) => `${f.name} <${f.email}>`).join(", ") || "",
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
  ): Promise<any> {
    const response = await this.apiRequest(
      `/mail/${mailboxUuid}/folder/${folderId}/message/${messageId}?prefered_format=html&with=auto_uncrypt,thread_context`,
    );

    const data = response.data;
    return {
      uid: data.uid,
      msg_id: data.msg_id,
      subject: data.subject || "(no subject)",
      from: data.from?.map((f: any) => `${f.name} <${f.email}>`).join(", ") || "",
      to: data.to?.map((t: any) => `${t.name} <${t.email}>`).join(", ") || "",
      cc: data.cc?.map((c: any) => `${c.name} <${c.email}>`).join(", ") || "",
      bcc: data.bcc?.map((b: any) => `${b.name} <${b.email}>`).join(", ") || "",
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
  ): Promise<any> {
    if (!this.mailboxUuid) throw new Error("Mailbox not initialized");

    const toRecipients = to.split(",").map((email) => ({
      name: "",
      email: email.trim(),
    }));
    const ccRecipients = cc
      ? cc.split(",").map((email) => ({name: "", email: email.trim()}))
      : null;
    const bccRecipients = bcc
      ? bcc.split(",").map((email) => ({name: "", email: email.trim()}))
      : null;

    const htmlBody = `<html><body><div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px;">${body.replace(/\n/g, "<br>")}</div></body></html>`;

    const draftPayload = {
      uuid: null,
      subject,
      body: htmlBody,
      quote: null,
      mime_type: "text/html",
      from: {
        id: null,
        name: this.fromName,
        email: this.fromEmail,
      },
      reply_to: {
        name: this.fromName,
        email: this.fromEmail,
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

    const draftResponse = await this.apiRequest(
      `/mail/${this.mailboxUuid}/draft`,
      {
        method: "POST",
        body: JSON.stringify(draftPayload),
      },
    );

    if (draftResponse.result !== "success") {
      throw new Error(
        `Failed to create draft: ${JSON.stringify(draftResponse)}`,
      );
    }

    const draftUuid = draftResponse.data.uuid;
    const draftUid = draftResponse.data.uid;

    const sendPayload = {
      ...draftPayload,
      uuid: draftUuid,
      uid: draftUid,
      resource: `/api/mail/${this.mailboxUuid}/draft/${draftUuid}`,
      action: "send",
    };

    const sendResponse = await this.apiRequest(
      `/mail/${this.mailboxUuid}/draft/${draftUuid}`,
      {
        method: "PUT",
        body: JSON.stringify(sendPayload),
      },
    );

    if (sendResponse.result !== "success") {
      throw new Error(
        `Failed to send email: ${JSON.stringify(sendResponse)}`,
      );
    }

    return sendResponse.data;
  }
}
