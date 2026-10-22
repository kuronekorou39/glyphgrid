// MCP サーバーの HTTP 版(Streamable HTTP、ステートレス)。デスクトップアプリが起動時に立ち上げる。
// ローカル専用:127.0.0.1 だけで待ち受け、Host ヘッダも検査する(DNS リバインディング対策)。
import { createServer, type IncomingMessage, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createGlyphgridServer } from "./server.js";

export const MCP_PATH = "/mcp";
const HOST = "127.0.0.1";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function serveHttp(setsDir: string, port: number): Promise<Server> {
  const allowedHosts = [`${HOST}:${port}`, `localhost:${port}`];
  const http = createServer(async (req, res) => {
    if (req.url?.split("?")[0] !== MCP_PATH) {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      // ステートレスなので、サーバーからの通知用ストリーム(GET)とセッション終了(DELETE)は使わない
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    try {
      const body = await readJson(req);
      const server = createGlyphgridServer(setsDir);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        enableDnsRebindingProtection: true,
        allowedHosts,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: (e as Error).message }, id: null }));
    }
  });
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, HOST, () => resolve(http));
  });
}
