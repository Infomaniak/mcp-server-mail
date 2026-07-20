# Mail MCP Server

MCP Server for the Infomaniak Mail API.

## Tools

1. `mail_list_mailboxes`
   - List all mailboxes in your Infomaniak account
   - Returns: List of mailboxes with uuid, email, and mailbox name

2. `mail_list_folders`
   - List all folders in a mailbox
   - Required inputs:
     - `mailbox_uuid` (string, optional): Mailbox UUID (uses primary if omitted)
   - Returns: List of folders with id, name, path, role, unread/total counts

3. `mail_create_folder`
   - Create a new folder in the mailbox
   - Required inputs:
     - `name` (string): Name of the folder to create
   - Optional inputs:
     - `parent_folder_id` (string): Parent folder ID (omit for root-level folder)
     - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
   - Returns: Created folder with id, name, and parent_folder_id

4. `mail_delete_folder`
   - Delete a folder from the mailbox
   - Required inputs:
     - `folder_id` (string): Folder ID to delete
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
   - Returns: Deletion confirmation

5. `mail_rename_folder`
   - Rename a folder in the mailbox
   - Required inputs:
     - `folder_id` (string): Folder ID to rename
     - `name` (string): New folder name
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
   - Returns: Renamed folder with id and name

6. `mail_list_emails`
   - List emails in a folder
   - Required inputs:
     - `folder_id` (string): Folder ID
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID
     - `limit` (number): Maximum emails to return (default: 50)
     - `offset` (number): Pagination offset (default: 0)
     - Returns: List of email threads with subject, from, date, seen status, flagged status, preview

7. `mail_read_email`
   - Required inputs:
     - `folder_id` (string): Folder ID containing the email
     - `message_id` (string): Message ID or UID
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID
    - Returns: Full email with subject, from, to, body, html, headers, flagged status

8. `mail_send_email`
   - Send an email
   - Required inputs:
     - `to` (string): Recipient email address(es), comma-separated
     - `subject` (string): Email subject
     - `body` (string): Email body (plain text)
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
     - `cc` (string): CC recipient(s), comma-separated
     - `bcc` (string): BCC recipient(s), comma-separated
   - Returns: Send confirmation with timestamp

9. `mail_create_draft`
   - Create a new email draft
   - Required inputs:
     - `to` (string): Recipient email address(es), comma-separated
     - `subject` (string): Draft subject
     - `body` (string): Draft body (plain text)
   - Optional inputs:
     - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
     - `cc` (string): CC recipient(s), comma-separated
     - `bcc` (string): BCC recipient(s), comma-separated
   - Returns: Draft UUID and UID for later update/send

10. `mail_update_draft`
   - Update an existing email draft (only provide fields to change)
   - Required inputs:
     - `draft_uuid` (string): Draft UUID to update
   - Optional inputs:
     - `to` (string), `subject` (string), `body` (string)
     - `cc` (string), `bcc` (string)
     - `attachments` (string[]): Local file paths to attach
   - Returns: Updated draft info

11. `mail_send_draft`
   - Send an existing email draft
   - Required inputs:
     - `draft_uuid` (string): Draft UUID to send
   - Optional inputs:
     - `delay` (number): Delay in seconds before sending (default: 0)
   - Returns: Send confirmation with scheduled time

12. `mail_delete_draft`
   - Delete an email draft
   - Required inputs:
     - `draft_uuid` (string): Draft UUID to delete
   - Returns: Deletion confirmation

13. `mail_list_drafts`
    - List all drafts in the mailbox
     - Returns: Draft threads with subject, date, and message UID

14. `mail_search_emails`
    - Search emails by keyword, sender, recipient, subject, or date range
    - Optional inputs:
      - `query` (string): Full-text search in message body and metadata
      - `from` (string): Filter by sender email or name
      - `to` (string): Filter by recipient email or name
      - `subject` (string): Filter by subject
      - `since` (string): Start date (YYYY-MM-DD)
      - `before` (string): End date (YYYY-MM-DD)
       - `unseen` (boolean): If `true`, only return unread emails. If `false`, only return read emails.
       - `flagged` (boolean): If `true`, only return starred/flagged emails. If `false`, only return unstarred emails.
       - `folder_id` (string): Limit search to a specific folder (searches all folders if omitted)
      - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
      - `limit` (number): Maximum results to return (default: 50)
      - `offset` (number): Pagination offset (default: 0)
     - Returns: List of matching emails with subject, from, to, date, seen status, flagged status, preview, folder, and folder_id
    - Note: At least one of query, from, to, subject, since, or before must be provided.

15. `mail_mark_email`
     - Mark one or more emails as read or unread
     - Required inputs:
       - `folder_id` (string): Folder ID containing the messages
       - `message_ids` (string[]): Message sequence UIDs (from `mail_list_emails` or `mail_search_emails`)
       - `read` (boolean): `true` to mark as read, `false` to mark as unread
     - Optional inputs:
       - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
     - Returns: Confirmation with count of marked messages

16. `mail_flag_email`
     - Flag (star) or unflag (unstar) one or more emails
     - Required inputs:
       - `folder_id` (string): Folder ID containing the messages
       - `message_ids` (string[]): Message sequence UIDs
       - `flagged` (boolean): `true` to star/flag, `false` to unstar/unflag
     - Optional inputs:
       - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
     - Returns: Confirmation with count of flagged/unflagged messages

17. `mail_move_email`
    - Move one or more emails to a different folder
    - Required inputs:
      - `message_ids` (string[]): Message sequence UIDs
      - `from_folder_id` (string): Source folder ID
      - `to_folder_id` (string): Destination folder ID
    - Optional inputs:
      - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
    - Returns: Confirmation with count of moved messages

18. `mail_archive_email`
    - Archive one or more emails (move to the Archives folder)
    - Required inputs:
      - `folder_id` (string): Folder ID currently containing the messages
      - `message_ids` (string[]): Message sequence UIDs
    - Optional inputs:
      - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
    - Returns: Confirmation with count of archived messages

19. `mail_delete_email`
    - Delete one or more emails (move to Trash by default, or permanently delete)
    - Required inputs:
      - `folder_id` (string): Folder ID currently containing the messages
      - `message_ids` (string[]): Message sequence UIDs
    - Optional inputs:
      - `permanent` (boolean): If `true`, permanently delete. If `false` (default), move to Trash.
      - `mailbox_uuid` (string): Mailbox UUID (uses primary if omitted)
    - Returns: Confirmation with count of deleted messages and whether deletion was permanent

## Setup

1. Create a token linked to your user:
    - Visit the [API Token page](https://manager.infomaniak.com/v3/ng/accounts/token/list)
    - Choose "workspace:mail" scopes

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### NPX

```json
{
  "mcpServers": {
    "mail": {
      "command": "npx",
      "args": [
        "-y",
        "@infomaniak/mcp-server-mail"
      ],
      "env": {
        "MAIL_TOKEN": "your-token"
      }
    }
  }
}
```

#### Docker

```json
{
  "mcpServers": {
    "mail": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "MAIL_TOKEN",
        "infomaniak/mcp-server-mail"
      ],
      "env": {
        "MAIL_TOKEN": "your-token"
      }
    }
  }
}
```

### Environment Variables

1. `MAIL_TOKEN`: Required. Your Infomaniak API token.

### Troubleshooting

If you encounter permission errors, verify that:
1. All required scopes are added to your token
2. The token is correctly copied to your configuration

## Build

Docker build:

```bash
docker build -t infomaniak/mcp-server-mail -f Dockerfile .
```

## License

This MCP server is licensed under the MIT License.
