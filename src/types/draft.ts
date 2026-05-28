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
