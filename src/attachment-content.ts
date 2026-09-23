import type {ContentBlock} from "@modelcontextprotocol/sdk/types.js";
import type {DownloadedAttachment} from "./types.js";

export type {DownloadedAttachment};

// Image formats MCP clients and LLM APIs commonly accept as image content.
// Others (TIFF, HEIC, SVG, BMP...) go out as a resource blob: an image block
// the client cannot decode can make it reject the whole tool result.
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Turn a downloaded attachment into MCP tool-result content blocks.
 *
 * The binary goes in a typed block (`image` for images, an embedded `resource`
 * blob for everything else) instead of base64 inside a `text` block: clients
 * cap text results and cannot interpret base64 text as a document, so large
 * attachments such as scanned PDFs arrived truncated and unreadable.
 * The metadata stays in a small `text` block.
 */
export function attachmentToContent(attachment: DownloadedAttachment, uri: string): ContentBlock[] {
    const {content, mime_type, ...rest} = attachment;
    // MIME types are case-insensitive (RFC 2045)
    const mimeType = (mime_type || "application/octet-stream").toLowerCase();
    const metadata = {...rest, mime_type: mimeType};
    const binary: ContentBlock = INLINE_IMAGE_TYPES.has(mimeType)
        ? {type: "image", data: content, mimeType}
        : {type: "resource", resource: {uri, mimeType, blob: content}};
    return [
        {type: "text", text: JSON.stringify(metadata, null, 2)},
        binary,
    ];
}
