import {ApiAddress, DraftAddress} from "./types.js";

export function formatAddresses(
  addresses: ApiAddress[] | undefined | null,
): string {
  return addresses?.map((a) => `${a.name} <${a.email}>`).join(", ") || "";
}

export function toDraftAddresses(emails: string[]): DraftAddress[] {
  return emails.map((email) => ({name: "", email: email.trim()}));
}
