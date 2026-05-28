import {MessageBody, MessageHeader} from "./api.js";

export interface Mailbox {
  uuid: string;
  email: string;
  mailbox: string;
  is_primary: boolean;
  hosting_id: number;
}

export interface Folder {
  id: string;
  name: string;
  path: string;
  role: string | null;
  unread_count: number;
  total_count: number;
}

export interface EmailSummary {
  thread_uid: string;
  subject: string;
  from: string;
  date: string;
  messages_count: number;
  unseen_messages: number;
  preview: string;
  first_message_uid: string | null;
}

export interface Email {
  uid: string;
  msg_id: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  date: string;
  body: MessageBody;
  html: string;
  preview: string;
  has_attachments: boolean;
  seen: boolean;
  flagged: boolean;
  folder: string;
  headers: MessageHeader[];
}
