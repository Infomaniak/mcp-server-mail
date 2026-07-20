import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://mail.infomaniak.com/api";

export class MailClient {
    private readonly headers: { Authorization: string; "Content-Type": string };
    private mailboxUuid: string | null = null;
    private mailboxes: any[] = [];
    private readonly draftsCache: Map<string, any> = new Map();

    constructor(token: string) {
        this.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    private parseRecipients(recipientString?: string): any[] | null {
        if (!recipientString) return null;
        const recipients = recipientString
            .split(",")
            .map((email) => email.trim())
            .filter(Boolean)
            .map((email) => ({
                name: "",
                email,
            }));

        return recipients.length > 0 ? recipients : null;
    }

    private escapeHtml(text: string): string {
        const replacements: Record<string, string> = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        };

        return text.replace(/[&<>"']/g, (char) => replacements[char]);
    }

    private createHtmlBody(body: string): string {
        const escapedBody = this.escapeHtml(body).replace(/\n/g, "<br>");
        return `<html><body><div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px;">${escapedBody}</div></body></html>`;
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

    async createFolder(
        mailboxUuid: string,
        name: string,
        parentFolderId?: string,
    ): Promise<any> {
        const payload: any = {
            name,
        };
        if (parentFolderId) {
            payload.parent = parentFolderId;
        }

        const response = await this.apiRequest(`/mail/${mailboxUuid}/folder`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (response.result !== "success") {
            throw new Error(`Failed to create folder: ${JSON.stringify(response)}`);
        }

        return {
            id: response.data?.id,
            name: response.data?.name,
            parent_folder_id: parentFolderId || null,
        };
    }

    async deleteFolder(
        mailboxUuid: string,
        folderId: string,
    ): Promise<any> {
        const response = await this.apiRequest(`/mail/${mailboxUuid}/folder/${folderId}`, {
            method: "DELETE",
        });

        if (response.result !== "success") {
            throw new Error(`Failed to delete folder: ${JSON.stringify(response)}`);
        }

        return {
            result: "success",
            folder_id: folderId,
        };
    }

    async renameFolder(
        mailboxUuid: string,
        folderId: string,
        name: string,
    ): Promise<any> {
        const response = await this.apiRequest(`/mail/${mailboxUuid}/folder/${folderId}/rename`, {
            method: "POST",
            body: JSON.stringify({ name }),
        });

        if (response.result !== "success") {
            throw new Error(`Failed to rename folder: ${JSON.stringify(response)}`);
        }

        return {
            id: folderId,
            name,
        };
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
            seen: (thread.unseen_messages ?? 0) === 0,
            flagged: thread.flagged ?? thread.messages?.some((m: any) => m.flagged) ?? false,
            preview: thread.messages?.[0]?.preview || "",
            first_message_uid: thread.messages?.[0]?.uid?.split("@")[0] || null,
            folder_id: thread.messages?.[0]?.folder_id || null,
            folder: thread.messages?.[0]?.folder || null,
        }));
    }

    async searchEmails(
        mailboxUuid: string,
        options: {
            query?: string;
            from?: string;
            to?: string;
            subject?: string;
            since?: string;
            before?: string;
            unseen?: boolean;
            flagged?: boolean;
            folderId?: string;
            limit?: number;
            offset?: number;
        },
    ): Promise<any[]> {
        const {
            query,
            from,
            to,
            subject,
            since,
            before,
            unseen,
            flagged,
            folderId,
            limit = 50,
            offset = 0,
        } = options;

        if (!query && !from && !to && !subject && !since && !before) {
            throw new Error(
                "At least one search filter (query, from, to, subject, since, or before) must be provided.",
            );
        }

        let searchFolderId = folderId;
        let severywhere = "0";

        if (!searchFolderId) {
            severywhere = "1";
            const folders = await this.listFolders(mailboxUuid);
            const inbox = folders.find(
                (f: any) => f.role === "INBOX" || f.role === "inbox",
            );
            if (!inbox) {
                throw new Error("INBOX folder not found for search base.");
            }
            searchFolderId = inbox.id;
        }

        const params = new URLSearchParams();
        params.set("offset", String(offset));
        params.set("thread", "off");
        params.set("severywhere", severywhere);
        params.set("limit", String(limit));

        if (query) params.set("scontains", query);
        if (from) params.set("sfrom", from);
        if (to) params.set("sto", to);
        if (subject) params.set("ssubject", subject);
        if (since) params.set("sfromdate", `${since} 00:00:00`);
        if (before) params.set("stodate", `${before} 00:00:00`);

        const response = await this.apiRequest(
            `/mail/${mailboxUuid}/folder/${searchFolderId}/message?${params.toString()}`,
        );

        let results = (response.data?.threads || []).map((thread: any) => ({
            thread_uid: thread.uid,
            subject: thread.subject || "(no subject)",
            from: thread.from?.map((f: any) => `${f.name} <${f.email}>`).join(", ") || "",
            to: thread.to?.map((t: any) => `${t.name} <${t.email}>`).join(", ") || "",
            date: thread.date,
            messages_count: thread.messages_count,
            unseen_messages: thread.unseen_messages,
            seen: (thread.unseen_messages ?? 0) === 0,
            flagged: thread.flagged ?? thread.messages?.some((m: any) => m.flagged) ?? false,
            preview: thread.messages?.[0]?.preview || "",
            first_message_uid: thread.messages?.[0]?.uid?.split("@")[0] || null,
            folder_id: thread.messages?.[0]?.folder_id || null,
            folder: thread.messages?.[0]?.folder || null,
        }));

        if (unseen !== undefined) {
            results = results.filter((r: any) => r.seen === !unseen);
        }

        if (flagged !== undefined) {
            results = results.filter((r: any) => r.flagged === flagged);
        }

        return results;
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
        const draftInfo = await this.createDraft(to, subject, body, cc, bcc, mailboxUuid);

        if (attachments && attachments.length > 0) {
            await this.updateDraft(draftInfo.uuid, { attachments }, mailboxUuid);
        }

        return this.sendDraft(draftInfo.uuid, 0, mailboxUuid);
    }

    async createDraft(
        to: string,
        subject: string,
        body: string,
        cc?: string,
        bcc?: string,
        mailboxUuid?: string,
    ): Promise<any> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        const mbInfo = this.getMailboxInfo(uuid);
        const fromEmail = mbInfo.email;
        const fromName = mbInfo.email.split("@")[0];

        const toRecipients = this.parseRecipients(to);
        const ccRecipients = this.parseRecipients(cc);
        const bccRecipients = this.parseRecipients(bcc);
        const htmlBody = this.createHtmlBody(body);

        const payload: any = {
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

        const response = await this.apiRequest(`/mail/${uuid}/draft`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (response.result !== "success") {
            throw new Error(`Failed to create draft: ${JSON.stringify(response)}`);
        }

        const draftUuid = response.data.uuid;
        payload.uuid = draftUuid;
        payload.uid = response.data.uid;
        this.draftsCache.set(draftUuid, payload);

        return {
            uuid: draftUuid,
            uid: response.data.uid,
            subject,
            body,
            to,
            cc,
            bcc,
        };
    }

    async updateDraft(
        draftUuid: string,
        options: {
            to?: string;
            subject?: string;
            body?: string;
            cc?: string;
            bcc?: string;
            attachments?: string[];
        },
        mailboxUuid?: string,
    ): Promise<any> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        const cached = this.draftsCache.get(draftUuid);

        if (!cached) {
            throw new Error(
                `Draft ${draftUuid} not found in cache. ` +
                `Please recreate the draft or provide the full draft state.`,
            );
        }

        const payload = { ...cached };

        if (options.to !== undefined) {
            payload.to = this.parseRecipients(options.to);
        }
        if (options.subject !== undefined) {
            payload.subject = options.subject;
        }
        if (options.body !== undefined) {
            payload.body = this.createHtmlBody(options.body);
        }
        if (options.cc !== undefined) {
            payload.cc = this.parseRecipients(options.cc);
        }
        if (options.bcc !== undefined) {
            payload.bcc = this.parseRecipients(options.bcc);
        }

        payload.action = "save";
        payload.uuid = draftUuid;
        payload.resource = `/api/mail/${uuid}/draft/${draftUuid}`;

        if (options.attachments && options.attachments.length > 0) {
            const attachmentUuids: string[] = [];
            for (const filePath of options.attachments) {
                const attachmentUuid = await this.uploadAttachment(filePath, uuid);
                attachmentUuids.push(attachmentUuid);
            }
            payload.attachments = attachmentUuids;
        }

        const response = await this.apiRequest(`/mail/${uuid}/draft/${draftUuid}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });

        if (response.result !== "success") {
            throw new Error(`Failed to update draft: ${JSON.stringify(response)}`);
        }

        payload.uid = response.data?.uid || payload.uid;
        this.draftsCache.set(draftUuid, payload);

        return {
            uuid: draftUuid,
            uid: payload.uid,
            subject: payload.subject,
            body: options.body !== undefined ? options.body : cached.body,
            to: options.to !== undefined ? options.to : cached.to,
            cc: options.cc !== undefined ? options.cc : cached.cc,
            bcc: options.bcc !== undefined ? options.bcc : cached.bcc,
        };
    }

    async sendDraft(
        draftUuid: string,
        delay: number = 0,
        mailboxUuid?: string,
    ): Promise<any> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        const cached = this.draftsCache.get(draftUuid);

        if (!cached) {
            throw new Error(
                `Draft ${draftUuid} not found in cache. ` +
                `Cannot send a draft that was not created in this session.`,
            );
        }

        const payload = { ...cached };
        payload.action = "send";
        payload.delay = delay;
        payload.uuid = draftUuid;
        payload.resource = `/api/mail/${uuid}/draft/${draftUuid}`;

        const response = await this.apiRequest(`/mail/${uuid}/draft/${draftUuid}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });

        if (response.result !== "success") {
            throw new Error(`Failed to send draft: ${JSON.stringify(response)}`);
        }

        this.draftsCache.delete(draftUuid);
        return response.data;
    }

    async deleteDraft(
        draftUuid: string,
        mailboxUuid?: string,
    ): Promise<any> {
        const uuid = mailboxUuid || await this.getMailboxUuid();

        const response = await this.apiRequest(`/mail/${uuid}/draft/${draftUuid}`, {
            method: "DELETE",
        });

        if (response.result !== "success") {
            throw new Error(`Failed to delete draft: ${JSON.stringify(response)}`);
        }

        this.draftsCache.delete(draftUuid);
        return response.data;
    }

    async listDrafts(mailboxUuid?: string): Promise<any[]> {
        const uuid = mailboxUuid || await this.getMailboxUuid();
        const folders = await this.listFolders(uuid);

        const draftsFolder = folders.find(
            (f: any) => f.role === "draft" || f.role === "DRAFT",
        );

        if (!draftsFolder) {
            throw new Error("Drafts folder not found");
        }

        return this.listEmails(uuid, draftsFolder.id, 50, 0);
    }

    private formatUids(messageIds: string[], folderId: string): string[] {
        return messageIds.map((id) => (id.includes("@") ? id : `${id}@${folderId}`));
    }

    async markEmails(
        mailboxUuid: string,
        folderId: string,
        messageIds: string[],
        read: boolean,
    ): Promise<any> {
        if (!messageIds || messageIds.length === 0) {
            throw new Error("At least one message_id must be provided.");
        }

        const endpoint = read ? "seen" : "unseen";
        const uids = this.formatUids(messageIds, folderId);

        const response = await this.apiRequest(
            `/mail/${mailboxUuid}/message/${endpoint}`,
            {
                method: "POST",
                body: JSON.stringify({ uids }),
            },
        );

        if (response.result !== "success") {
            throw new Error(`Failed to mark emails: ${JSON.stringify(response)}`);
        }

        return {
            result: "success",
            marked: uids.length,
            read,
        };
    }

    async moveEmails(
        mailboxUuid: string,
        messageIds: string[],
        fromFolderId: string,
        toFolderId: string,
    ): Promise<any> {
        if (!messageIds || messageIds.length === 0) {
            throw new Error("At least one message_id must be provided.");
        }

        const uids = this.formatUids(messageIds, fromFolderId);

        const response = await this.apiRequest(
            `/mail/${mailboxUuid}/message/move`,
            {
                method: "POST",
                body: JSON.stringify({
                    uids,
                    to: toFolderId,
                    move_reactions: false,
                }),
            },
        );

        if (response.result !== "success") {
            throw new Error(`Failed to move emails: ${JSON.stringify(response)}`);
        }

        return {
            result: "success",
            moved: uids.length,
            to: toFolderId,
        };
    }

    async flagEmails(
        mailboxUuid: string,
        folderId: string,
        messageIds: string[],
        flagged: boolean,
    ): Promise<any> {
        if (!messageIds || messageIds.length === 0) {
            throw new Error("At least one message_id must be provided.");
        }

        const endpoint = flagged ? "star" : "unstar";
        const uids = this.formatUids(messageIds, folderId);

        const response = await this.apiRequest(
            `/mail/${mailboxUuid}/message/${endpoint}`,
            {
                method: "POST",
                body: JSON.stringify({ uids }),
            },
        );

        if (response.result !== "success") {
            throw new Error(`Failed to ${flagged ? "star" : "unstar"} emails: ${JSON.stringify(response)}`);
        }

        return {
            result: "success",
            flagged,
            [flagged ? "starred" : "unstarred"]: uids.length,
        };
    }

    private async findFolderByRole(mailboxUuid: string, role: string): Promise<string> {
        const folders = await this.listFolders(mailboxUuid);
        const folder = folders.find(
            (f: any) => f.role && f.role.toUpperCase() === role.toUpperCase(),
        );
        if (!folder) {
            throw new Error(`${role} folder not found`);
        }
        return folder.id;
    }

    async archiveEmails(
        mailboxUuid: string,
        folderId: string,
        messageIds: string[],
    ): Promise<any> {
        if (!messageIds || messageIds.length === 0) {
            throw new Error("At least one message_id must be provided.");
        }

        const archiveFolderId = await this.findFolderByRole(mailboxUuid, "ARCHIVE");
        await this.moveEmails(mailboxUuid, messageIds, folderId, archiveFolderId);

        return {
            result: "success",
            archived: messageIds.length,
        };
    }

    async deleteEmails(
        mailboxUuid: string,
        folderId: string,
        messageIds: string[],
        permanent: boolean = false,
    ): Promise<any> {
        if (!messageIds || messageIds.length === 0) {
            throw new Error("At least one message_id must be provided.");
        }

        if (permanent) {
            const uids = this.formatUids(messageIds, folderId);
            const response = await this.apiRequest(
                `/mail/${mailboxUuid}/message/delete`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        uids,
                        move_reactions: false,
                    }),
                },
            );

            if (response.result !== "success") {
                throw new Error(`Failed to delete emails: ${JSON.stringify(response)}`);
            }

            return {
                result: "success",
                deleted: uids.length,
                permanent: true,
            };
        }

        const trashFolderId = await this.findFolderByRole(mailboxUuid, "TRASH");
        await this.moveEmails(mailboxUuid, messageIds, folderId, trashFolderId);

        return {
            result: "success",
            deleted: messageIds.length,
            permanent: false,
        };
    }
}
