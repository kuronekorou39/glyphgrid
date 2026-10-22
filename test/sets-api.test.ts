import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSetsApi, type SetsApi } from "../src/server/sets-api.js";
import { build } from "./helpers.js";

let dir: string;
let api: SetsApi;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glyphgrid-"));
  api = createSetsApi(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("sets API", () => {
  it("作成 → 一覧 → 読み書き", () => {
    api.createIcon("demo", "first");
    expect(api.listSets()).toEqual([{ name: "demo", icons: ["first"] }]);
    expect(api.readStyle("demo").unit).toBeGreaterThan(0);

    const doc = build([{ op: "addNode", id: "a", kind: "dot", x: 6, y: 6 }], api.readIcon("demo", "first"));
    api.writeIcon("demo", "first", doc);
    expect(api.readIcon("demo", "first")).toEqual(doc);
    expect(readFileSync(join(dir, "demo", "icons", "first.icon.json"), "utf8")).toContain('{"id": "a"');
  });

  it("内容が同じなら書き込まない", () => {
    api.createIcon("demo", "x");
    const path = join(dir, "demo", "icons", "x.icon.json");
    const before = statSync(path).mtimeMs;
    api.writeIcon("demo", "x", api.readIcon("demo", "x"));
    expect(statSync(path).mtimeMs).toBe(before);
  });

  it("不正な名前や不正な doc は拒否する", () => {
    expect(() => api.readIcon("..", "x")).toThrow(/名前/);
    expect(() => api.createIcon("demo", "a/b")).toThrow(/名前/);
    api.createIcon("demo", "x");
    expect(() => api.writeIcon("demo", "x", { version: 2 })).toThrow();
    expect(() => api.createIcon("demo", "x")).toThrow(/すでに/);
  });

  it("変更されたファイルを通知用に振り分ける", () => {
    expect(api.classify(join(dir, "demo", "icons", "a.icon.json"))).toEqual({ set: "demo", icon: "a" });
    expect(api.classify(join(dir, "demo", "style.json"))).toEqual({ set: "demo", icon: null });
    expect(api.classify(join(dir, "demo", "notes.txt"))).toBeNull();
    expect(api.classify(join(dir, "..", "elsewhere", "style.json"))).toBeNull();
  });
});
