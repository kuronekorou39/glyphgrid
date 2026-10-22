// MCP サーバーの起動口。
//   node --import tsx src/mcp/main.ts [sets-dir]              stdio(Claude Code の .mcp.json から)
//   node --import tsx src/mcp/main.ts --http 7331 [--parent PID] [sets-dir]  HTTP(デスクトップアプリから)
// stdout は stdio プロトコル専用なので、ログは stderr に出す。
// 対象の sets/ は引数 > 環境変数 GLYPHGRID_SETS > このリポジトリの sets/ の順で決める。
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCP_PATH, serveHttp } from "./http.js";
import { createGlyphgridServer } from "./server.js";

const args = process.argv.slice(2);
const httpAt = args.indexOf("--http");
const port = httpAt >= 0 ? Number(args.splice(httpAt, 2)[1]) : null;
const parentAt = args.indexOf("--parent");
const parentPid = parentAt >= 0 ? Number(args.splice(parentAt, 2)[1]) : null;

// 起動元のアプリが落ちても残り続けてポートをふさがないよう、親プロセスがいなくなったら終了する
const PARENT_CHECK_MS = 2000;
if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, PARENT_CHECK_MS).unref();
}
const setsDir = resolve(args[0] ?? process.env.GLYPHGRID_SETS ?? resolve(import.meta.dirname, "..", "..", "sets"));

if (port !== null) {
  if (!Number.isInteger(port) || port <= 0) throw new Error("--http にはポート番号を指定してください");
  await serveHttp(setsDir, port);
  console.error(`glyphgrid MCP サーバー: http://127.0.0.1:${port}${MCP_PATH}(${setsDir})`);
} else {
  await createGlyphgridServer(setsDir).connect(new StdioServerTransport());
  console.error(`glyphgrid MCP サーバー: stdio(${setsDir})`);
}
