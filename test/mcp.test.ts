import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGlyphgridServer } from "../src/mcp/server.js";

let dir: string;
let client: Client;

type Content = { type: string; text?: string; data?: string; mimeType?: string };
async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Content[];
  return { isError: !!res.isError, content, text: content.filter((c) => c.type === "text").map((c) => c.text).join("\n") };
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "glyphgrid-mcp-"));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createGlyphgridServer(dir).connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});
afterEach(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("MCP サーバー", () => {
  it("ツール一覧と使い方を公開する", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["apply_ops", "create_icon", "get_icon", "get_style", "lint", "list_commands", "list_sets", "render", "update_style"].sort(),
    );
    expect(client.getInstructions()).toContain("apply_ops");
    expect((await call("list_commands")).text).toContain("addNode(shape, x, y");
  });

  it("作成 → ops 適用 → lint → 描画", async () => {
    expect((await call("create_icon", { set: "demo", icon: "flow" })).text).toContain("作成しました");
    const applied = await call("apply_ops", {
      set: "demo",
      icon: "flow",
      ops: [
        { op: "addNode", id: "a", shape: "circle", fill: "solid", x: 2, y: 6 },
        { op: "addNode", id: "b", shape: "diamond", x: 9, y: 6 },
        { op: "connect", from: "a", to: "b", arrow: "end" },
        { op: "tidy" },
      ],
      preview: true,
    });
    expect(applied.isError).toBe(false);
    expect(applied.text).toContain("lint: 問題なし");
    expect(applied.content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);
    expect(readFileSync(join(dir, "demo", "icons", "flow.icon.json"), "utf8")).toContain('"shape": "diamond"');

    expect((await call("list_sets")).text).toBe("demo: flow");
    expect((await call("lint", { set: "demo" })).text).toContain("問題なし");
    const sheet = await call("render", { set: "demo" });
    expect(sheet.content.map((c) => c.type)).toEqual(["text", "image"]);
  });

  it("途中で失敗した ops は保存しない", async () => {
    await call("create_icon", { set: "demo", icon: "x" });
    const res = await call("apply_ops", {
      set: "demo",
      icon: "x",
      ops: [{ op: "addNode", id: "a", shape: "circle", x: 2, y: 2 }, { op: "connect", from: "a", to: "ghost" }],
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("ops[1]");
    expect((await call("get_icon", { set: "demo", icon: "x" })).text).toContain('"nodes": []');
  });

  it("dryRun では保存しない", async () => {
    await call("create_icon", { set: "demo", icon: "x" });
    await call("apply_ops", { set: "demo", icon: "x", ops: [{ op: "addNode", shape: "circle", x: 6, y: 6 }], dryRun: true });
    expect((await call("get_icon", { set: "demo", icon: "x" })).text).toContain('"nodes": []');
  });

  it("update_style は一部だけ書き換えて検証する", async () => {
    await call("create_icon", { set: "demo", icon: "x" });
    await call("update_style", { set: "demo", patch: { stroke: { width: 0.25 }, node: { circle: { m: 2.2 } } } });
    const style = JSON.parse(readFileSync(join(dir, "demo", "style.json"), "utf8"));
    expect(style.stroke).toMatchObject({ width: 0.25, color: "#222222" });
    expect(style.node.circle).toEqual({ s: 1.3, m: 2.2, l: 2.8 });
    expect((await call("update_style", { set: "demo", patch: { stroke: { width: 0 } } })).isError).toBe(true);
  });

  it("不正なセット名は拒否する", async () => {
    expect((await call("get_icon", { set: "..", icon: "x" })).isError).toBe(true);
  });
});
