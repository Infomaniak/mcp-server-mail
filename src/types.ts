export interface DownloadedAttachment {
    filename: string;
    mime_type: string;
    size: number;
    content: string; // base64
}
