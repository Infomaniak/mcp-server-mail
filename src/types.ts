export type BearerToken = `Bearer ${string}`;

export interface RequestHeaders {
  Authorization: BearerToken;
  "Content-Type": "application/json";
}

export interface ApiResponse<T> {
  result: "success" | "error";
  data: T;
}

export interface ApiMailbox {
  uuid: string;
  email: string;
  mailbox: string;
  is_primary: boolean;
  hosting_id: number;
}

export interface Mailbox {
  uuid: string;
  email: string;
  mailbox: string;
  is_primary: boolean;
  hosting_id: number;
}

export interface ApiFolder {
  id: string;
  name: string;
  separator: string;
  role: string | null;
  unread_count: number;
  total_count: number;
  children?: ApiFolder[];
}

export interface Folder {
  id: string;
  name: string;
  path: string;
  role: string | null;
  unread_count: number;
  total_count: number;
}

export interface ApiAddress {
  name: string;
  email: string;
}

export interface ApiThreadMessage {
  uid: string;
  preview: string;
}

export interface ApiThread {
  uid: string;
  subject: string | null;
  from: ApiAddress[];
  date: string;
  messages_count: number;
  unseen_messages: number;
  messages: ApiThreadMessage[];
}

export interface ApiThreadList {
  threads: ApiThread[];
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

export interface MessageBody {
  value: string;
  type: string;
}

export interface MessageHeader {
  name: string;
  value: string;
}

export interface ApiMessage {
  uid: string;
  msg_id: string;
  subject: string | null;
  from: ApiAddress[];
  to: ApiAddress[];
  cc: ApiAddress[];
  bcc: ApiAddress[];
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

export interface DraftAddress {
  name: string;
  email: string;
}

export interface DraftIdentity {
  name: string | null;
  email: string | null;
}

export interface DraftFrom extends DraftIdentity {
  id: string | null;
}

export interface DraftPayload {
  uuid: string | null;
  subject: string;
  body: string;
  quote: string | null;
  mime_type: string;
  from: DraftFrom;
  reply_to: DraftIdentity;
  to: DraftAddress[];
  cc: DraftAddress[] | null;
  bcc: DraftAddress[] | null;
  references: string;
  in_reply_to: string | null;
  in_reply_to_uid: string | null;
  forwarded_uid: string | null;
  attachments: unknown[];
  identity_id: string | null;
  ack_request: boolean;
  st_uuid: string | null;
  uid: string | null;
  resource: string | null;
  priority: string;
  encrypted: boolean;
  encryption_password: string;
  event_poll_uuid: string | null;
  action: "save" | "send";
  delay: number;
}

export interface ApiDraft {
  uuid: string;
  uid: string;
}
