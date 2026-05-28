import {ApiAddress, DraftAddress} from "../types.js";

export function formatAddresses(addresses: ApiAddress[] | undefined | null): string {
  return addresses?.map((a) => `${a.name} <${a.email}>`).join(", ") || "";
}

export function parseRecipients(input: string): DraftAddress[] {
  return input.split(",").map((email) => ({name: "", email: email.trim()}));
}
