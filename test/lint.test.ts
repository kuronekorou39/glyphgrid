import { describe, expect, it } from "vitest";
import { emptyDoc, lint, type IconDoc, type Op, type Rule } from "../src/core/index.js";
import { build, style } from "./helpers.js";

const rules = (doc: IconDoc) => lint(doc, style).map((i) => `${i.rule}:${i.severity}:${i.ids.join(",")}`);
const has = (doc: IconDoc, rule: Rule) => lint(doc, style).filter((i) => i.rule === rule);

/** 中央にそろった、問題のない基本形 */
const base: Op[] = [
  { op: "addNode", id: "a", kind: "dot", x: 3, y: 6 },
  { op: "addNode", id: "b", kind: "ring", x: 9, y: 6 },
  { op: "connect", id: "ab", from: "a", to: "b" },
];

describe("lint", () => {
  it("問題がなければ空", () => {
    expect(lint(build(base), style)).toEqual([]);
    expect(lint(emptyDoc("x"), style)).toEqual([]);
  });

  it("off-grid: ノードと mid", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 3.3, y: 4 },
      { op: "addNode", id: "b", kind: "dot", x: 9, y: 8 },
      { op: "connect", id: "e", from: "a", to: "b", route: "hvh:6.2" },
    ]);
    expect(has(doc, "off-grid").map((i) => i.ids)).toEqual([["a"], ["e"]]);
  });

  it("dangling-edge", () => {
    const doc = build(base);
    doc.edges.push({ id: "bad", from: "a", to: "ghost", route: { type: "straight" } });
    expect(has(doc, "dangling-edge")).toEqual([
      { rule: "dangling-edge", severity: "error", ids: ["bad"], message: expect.stringContaining("ghost") },
    ]);
  });

  it("overlap: 重なりはエラー、近すぎは警告", () => {
    const doc = build([
      ...base,
      { op: "addNode", id: "c", kind: "dot", x: 3, y: 7 },
      { op: "addNode", id: "d", kind: "square", x: 9, y: 8 },
    ]);
    const issues = has(doc, "overlap");
    expect(issues.map((i) => `${i.severity}:${i.ids}`)).toEqual(["error:a,c", "warning:b,d"]);
  });

  it("edge-through-node: 無関係なノードを貫く線", () => {
    const doc = build([...base, { op: "addNode", id: "m", kind: "square", x: 6, y: 6, size: "s" }]);
    expect(has(doc, "edge-through-node").map((i) => i.ids)).toEqual([["ab", "m"]]);
  });

  it("edge-through-node: 線から離れていれば出ない", () => {
    const doc = build([...base, { op: "addNode", id: "m", kind: "square", x: 6, y: 7.5, size: "s" }]);
    expect(has(doc, "edge-through-node")).toEqual([]);
  });

  it("out-of-bounds: 余白にはみ出したノード", () => {
    const doc = build([...base, { op: "addNode", id: "far", kind: "dot", x: 11, y: 6 }]);
    expect(has(doc, "out-of-bounds").map((i) => i.ids)).toEqual([["far"]]);
  });

  it("off-center: 中央からずれている", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 2, y: 2 },
      { op: "addNode", id: "b", kind: "dot", x: 6, y: 2 },
    ]);
    expect(rules(doc)).toEqual(["off-center:warning:"]);
    expect(lint(build([{ op: "centerContent" }], doc), style)).toEqual([]);
  });

  it("inconsistent-size: 同じ種類・同じ接続数でサイズ混在", () => {
    const doc = build([
      { op: "addNode", id: "h", kind: "dot", x: 6, y: 6 },
      { op: "addNode", id: "l1", kind: "ring", x: 3, y: 6 },
      { op: "addNode", id: "l2", kind: "ring", x: 9, y: 6, size: "s" },
      { op: "connect", from: "h", to: "l1" },
      { op: "connect", from: "h", to: "l2" },
    ]);
    expect(rules(doc)).toEqual(["inconsistent-size:warning:l1,l2"]);
    expect(lint(build([{ op: "normalizeSize", ids: ["l1", "l2"] }], doc), style)).toEqual([]);
  });

  it("tidy の後は off-grid と off-center が消える", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 1.8, y: 2.2 },
      { op: "addNode", id: "b", kind: "ring", x: 6.1, y: 2.3 },
      { op: "connect", from: "a", to: "b" },
    ]);
    expect(has(doc, "off-grid")).toHaveLength(2);
    expect(lint(build([{ op: "tidy" }], doc), style)).toEqual([]);
  });
});
