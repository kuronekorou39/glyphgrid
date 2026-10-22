import { useState } from "preact/hooks";
import type { AppInfo } from "./api.js";

/** デスクトップアプリのときだけ出す:sets/ の場所と、内蔵 MCP サーバーへのつなぎ方 */
export function AppPanel({ info }: { info: AppInfo }) {
  const [copied, setCopied] = useState(false);
  const command = info.mcpUrl ? `claude mcp add --transport http glyphgrid-app ${info.mcpUrl}` : "";
  return (
    <section class="panel">
      <h2>アプリ</h2>
      <p class="muted">sets: {info.setsDir}</p>
      {info.mcpUrl ? (
        <>
          <p class="muted">MCP: {info.mcpUrl}</p>
          <div class="copy">
            <code>{command}</code>
            <button
              onClick={() =>
                navigator.clipboard.writeText(command).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
        </>
      ) : (
        <p class="warn">MCP サーバーは起動していません: {info.mcpError}</p>
      )}
    </section>
  );
}
