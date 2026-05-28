import {Folder} from "../domain/models.js";
import {MailGateway} from "../ports/MailGateway.js";

export interface ListFoldersRequest {
  mailboxUuid?: string;
}

export async function listFolders(
  gateway: MailGateway,
  request: ListFoldersRequest = {},
): Promise<Folder[]> {
  const uuid =
    request.mailboxUuid ?? (await gateway.getPrimaryMailbox()).uuid;
  return gateway.listFolders(uuid);
}
