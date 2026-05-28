import {z} from "zod";

export const mailboxUuid = z
  .string()
  .describe("Mailbox UUID (optional, uses primary if omitted)")
  .optional();

export const folderId = z
  .string()
  .describe("Folder ID (e.g., INBOX folder id)");

export const messageId = z
  .string()
  .describe("Message ID or UID");

export const limit = z
  .number()
  .describe("Maximum number of emails to return")
  .default(50);

export const offset = z
  .number()
  .describe("Offset for pagination")
  .default(0);

export const to = z
  .string()
  .describe("Recipient email address(es), comma-separated");

export const subject = z
  .string()
  .describe("Email subject");

export const body = z
  .string()
  .describe("Email body (plain text)");

export const cc = z
  .string()
  .describe("CC recipient(s), comma-separated")
  .optional();

export const bcc = z
  .string()
  .describe("BCC recipient(s), comma-separated")
  .optional();
