import {Mailbox} from "../domain/models.js";
import {MailGateway} from "../ports/MailGateway.js";

export async function listMailboxes(gateway: MailGateway): Promise<Mailbox[]> {
  return gateway.listMailboxes();
}
