import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://mail.infomaniak.com/api";

export class MailClient {
    private readonly headers: { Authorization: string; "Content-Type": string };
    private mailboxUuid: string | null = null;
    private mailboxes: any[] = [];

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

        this.mailboxes = mailboxesResponse.data || [];
        const mailbox = this.mailboxes[0];
        this.mailboxUuid = mailbox.uuid;
    }

    async getMailboxUuid(): Promise<string> {
        if (!this.mailboxUuid) await this.init();
        if (!this.mailboxUuid) throw new Error("Mailbox not initialized");
        return this.mailboxUuid;
    }

    private getMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
            ".txt": "text/plain",
            ".html": "text/html",
            ".csv": "text/csv",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt": "application/vnd.ms-powerpoint",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".zip": "application/zip",
            ".rar": "application/x-rar-compressed",
            ".7z": "application/x-7z-compressed",
            ".mp3": "audio/mpeg",
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
        };
        return mimeTypes[ext] || "application/octet-stream";
    }

    private getMailboxInfo(mailboxUuid: string) {
        const mb = (this.mailboxes || []).find((m: any) => m.uuid === mailboxUuid);
        if (!mb) {
            throw new Error(`Mailbox not found: ${mailboxUuid}`);
        }
        return mb;
    }

    async uploadAttachment(filePath: string, mailboxUuid?: string): Promise<string> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        if (!uuid) throw new Error("Mailbox not initialized");

        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const mimeType = this.getMimeType(fileName);

        const response = await this.apiRequest(
            `/mail/${uuid}/draft/attachment`,
            {
                method: "POST",
                body: fileBuffer,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "x-ws-attachment-disposition": "attachment",
                    "x-ws-attachment-filename": fileName,
                    "x-ws-attachment-mime-type": mimeType,
                },
            },
        );

        if (response.result !== "success") {
            throw new Error(
                `Failed to upload attachment: ${JSON.stringify(response)}`,
            );
        }

        return response.data.uuid;
    }

    async listMailboxes(): Promise<any[]> {
        if (!this.mailboxes?.length) {
            const response = await this.apiRequest(
                "/mailbox?with=aliases,permissions,accountId,count_users",
            );
            this.mailboxes = response.data || [];
        }
        return (this.mailboxes || []).map((m: any) => ({
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
            first_message_uid: thread.messages?.[0]?.uid?.split("@")[0] || null,
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
        attachments?: string[],
        mailboxUuid?: string,
    ): Promise<any> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        if (!uuid) throw new Error("Mailbox not initialized");

        const mbInfo = this.getMailboxInfo(uuid);
        const fromEmail = mbInfo.email;
        const fromName = mbInfo.email.split("@")[0];

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

        const draftPayload: any = {
            uuid: null,
            subject,
            body: htmlBody,
            quote: null,
            mime_type: "text/html",
            from: {
                id: null,
                name: fromName,
                email: fromEmail,
            },
            reply_to: {
                name: fromName,
                email: fromEmail,
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
            `/mail/${uuid}/draft`,
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

        const attachmentUuids: string[] = [];
        if (attachments && attachments.length > 0) {
            for (const filePath of attachments) {
                const attachmentUuid = await this.uploadAttachment(filePath, uuid);
                attachmentUuids.push(attachmentUuid);
            }
        }

        const updatePayload = {
            ...draftPayload,
            uuid: draftUuid,
            uid: draftUid,
            resource: `/api/mail/${uuid}/draft/${draftUuid}`,
            attachments: attachmentUuids,
            action: "save",
        };

        await this.apiRequest(
            `/mail/${uuid}/draft/${draftUuid}`,
            {
                method: "PUT",
                body: JSON.stringify(updatePayload),
            },
        );

        const sendPayload = {
            ...updatePayload,
            action: "send",
        };

        const sendResponse = await this.apiRequest(
            `/mail/${uuid}/draft/${draftUuid}`,
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
