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

export interface ApiFolder {
  id: string;
  name: string;
  separator: string;
  role: string | null;
  unread_count: number;
  total_count: number;
  children?: ApiFolder[];
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

export interface ApiDraft {
  uuid: string;
  uid: string;
}
