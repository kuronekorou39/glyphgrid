// MCP サーバーの起動口(stdio)。stdout はプロトコル専用なので、ログは stderr に出す。
// 対象の sets/ は引数 > 環境変数 GLYPHGRID_SETS > このリポジトリの sets/ の順で決める。
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGlyphgridServer } from "./server.js";

const setsDir = resolve(process.argv[2] ?? process.env.GLYPHGRID_SETS ?? resolve(import.meta.dirname, "..", "..", "sets"));
await createGlyphgridServer(setsDir).connect(new StdioServerTransport());
console.error(`glyphgrid MCP サーバー: ${setsDir}`);
