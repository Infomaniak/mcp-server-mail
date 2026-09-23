import { describe, it } from "node:test";
import assert from "node:assert";

const { attachmentToContent } = await import("../dist/attachment-content.js");

const URI = "infomaniak-mail://mb/folder/msg/att";

describe("attachmentToContent", () => {
    it("returns a PDF as an embedded resource blob, not base64 text", () => {
        const content = attachmentToContent(
            { filename: "quote.pdf", mime_type: "application/pdf", size: 4, content: "JVBERg==" },
            URI,
        );

        assert.strictEqual(content.length, 2);
        assert.deepStrictEqual(content[1], {
            type: "resource",
            resource: { uri: URI, mimeType: "application/pdf", blob: "JVBERg==" },
        });
    });

    it("returns an image as image content", () => {
        const content = attachmentToContent(
            { filename: "logo.png", mime_type: "image/png", size: 3, content: "iVBO" },
            URI,
        );

        assert.deepStrictEqual(content[1], { type: "image", data: "iVBO", mimeType: "image/png" });
    });

    it("keeps metadata in a text block without the base64 payload", () => {
        const content = attachmentToContent(
            { filename: "quote.pdf", mime_type: "application/pdf", size: 4, content: "JVBERg==" },
            URI,
        );

        assert.strictEqual(content[0].type, "text");
        assert.deepStrictEqual(JSON.parse(content[0].text), {
            filename: "quote.pdf",
            mime_type: "application/pdf",
            size: 4,
        });
        assert.ok(!content[0].text.includes("JVBERg=="));
    });

    it("matches image MIME types case-insensitively", () => {
        const content = attachmentToContent(
            { filename: "SCAN.JPG", mime_type: "IMAGE/JPEG", size: 3, content: "/9j/" },
            URI,
        );

        assert.deepStrictEqual(content[1], { type: "image", data: "/9j/", mimeType: "image/jpeg" });
    });

    it("returns image types clients commonly reject as a resource blob", () => {
        for (const mime_type of ["image/tiff", "image/heic", "image/svg+xml", "image/bmp"]) {
            const content = attachmentToContent(
                { filename: "scan", mime_type, size: 1, content: "AA==" },
                URI,
            );

            assert.strictEqual(content[1].type, "resource", mime_type);
            assert.strictEqual(content[1].resource.mimeType, mime_type);
        }
    });

    it("falls back to application/octet-stream when the MIME type is missing", () => {
        for (const mime_type of [undefined, ""]) {
            const content = attachmentToContent(
                { filename: "blob", mime_type, size: 1, content: "AA==" },
                URI,
            );

            assert.strictEqual(content[1].type, "resource");
            assert.strictEqual(content[1].resource.mimeType, "application/octet-stream");
        }
    });

    it("handles an empty payload", () => {
        const content = attachmentToContent(
            { filename: "empty.txt", mime_type: "text/plain", size: 0, content: "" },
            URI,
        );

        assert.deepStrictEqual(content[1], {
            type: "resource",
            resource: { uri: URI, mimeType: "text/plain", blob: "" },
        });
        assert.strictEqual(JSON.parse(content[0].text).size, 0);
    });
});
