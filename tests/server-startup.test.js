import { describe, it } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(__dirname, "..", "dist", "index.js");
const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

// Launches dist/index.js the way `npx` / MCP clients do: through a bin symlink,
// performs the MCP `initialize` handshake over stdio, then — when follow-up
// requests are given — sends the `initialized` notification plus those requests
// and resolves with the last JSON-RPC response (or null on timeout).
function connectViaSymlink(followUpRequests = [], timeoutMs = 8000) {
    return new Promise((resolve) => {
        const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-bin-"));
        const link = path.join(linkDir, "mcp-server-mail");
        fs.symlinkSync(entry, link);

        const child = spawn(process.execPath, [link], {
            env: { ...process.env, MAIL_TOKEN: "test-token" },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let initialized = false;
        let settled = false;
        const lastId = followUpRequests.length
            ? followUpRequests[followUpRequests.length - 1].id
            : 1;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            try { fs.rmSync(linkDir, { recursive: true, force: true }); } catch {}
            resolve(value);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
            for (const line of stdout.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const msg = JSON.parse(trimmed);
                    if (msg.id === 1 && followUpRequests.length && !initialized) {
                        initialized = true;
                        child.stdin.write(JSON.stringify({
                            jsonrpc: "2.0",
                            method: "notifications/initialized",
                        }) + "\n");
                        for (const request of followUpRequests) {
                            child.stdin.write(JSON.stringify(request) + "\n");
                        }
                    }
                    if (msg.id === lastId) finish(msg);
                } catch {}
            }
        });

        // Exiting before answering means main() never connected the transport.
        child.on("exit", () => finish(null));

        const initialize = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "startup-test", version: "1.0.0" },
            },
        };
        child.stdin.write(JSON.stringify(initialize) + "\n");
    });
}

describe("server startup", () => {
    it("responds to an MCP initialize handshake when launched via bin symlink", async () => {
        const response = await connectViaSymlink();
        assert.ok(
            response,
            "server exited without answering initialize — main() did not connect the transport (bin-symlink entry-point bug)",
        );
        assert.strictEqual(response.id, 1);
        assert.ok(response.result, "initialize response should carry a result");
        assert.ok(
            response.result.serverInfo,
            "initialize result should include serverInfo",
        );
        assert.strictEqual(response.result.serverInfo.version, packageJson.version);
    });

    it("describes the inline image allowlist for mail_download_attachment", async () => {
        const response = await connectViaSymlink([
            { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        ]);
        assert.ok(response?.result?.tools, "tools/list should return tools");
        const tool = response.result.tools.find((t) => t.name === "mail_download_attachment");
        assert.ok(tool, "mail_download_attachment should be listed");
        assert.match(
            tool.description,
            /png\/jpeg\/gif\/webp/,
            "description should name the image formats inlined as image content",
        );
    });
});
