import { describe, expect, it } from "vitest";
import { lint, parseDoc, renderSvg, type IconDoc } from "../src/core/index.js";
import { nodeBounds } from "../src/core/shape.js";
import { build, expectClose, style } from "./helpers.js";

const node = (doc: IconDoc, id: string) => doc.nodes.find((n) => n.id === id)!;
const rules = (doc: IconDoc) => lint(doc, style).map((i) => `${i.rule}:${i.ids.join(",")}`);

describe("箱の形(frame / table / text)", () => {
  it("w / h を省略すると既定値で埋める", () => {
    const doc = build([
      { op: "addNode", id: "f", shape: "frame", x: 6, y: 6 },
      { op: "addNode", id: "t", shape: "table", x: 6, y: 6 },
      { op: "addNode", id: "x", shape: "text", x: 6, y: 6 },
    ]);
    expect(node(doc, "f")).toMatchObject({ w: 4, h: 3 });
    expect(node(doc, "t")).toMatchObject({ w: 4, h: 3, cols: 2, rows: 3 });
    expect(node(doc, "x")).toMatchObject({ w: 3, lines: 1 });
    expect(node(doc, "x").h).toBeUndefined();
  });

  it("setBox で大きさと属性を変える。箱以外には使えない", () => {
    const doc = build([
      { op: "addNode", id: "t", shape: "table", x: 6, y: 6 },
      { op: "addNode", id: "c", shape: "circle", x: 2, y: 2 },
      { op: "setBox", ids: ["t"], w: 6, cols: 3, header: true },
    ]);
    expect(node(doc, "t")).toMatchObject({ w: 6, h: 3, cols: 3, header: true });
    expect(() => build([{ op: "setBox", ids: ["c"], w: 3 }], doc)).toThrow(/setBox/);
    expect(() => build([{ op: "setBox", ids: ["t"], cols: 0 }], doc)).toThrow(/cols/);
  });

  it("setShape で箱にすると既定値を補い、箱でなくすると箱の属性を消す", () => {
    let doc = build([{ op: "addNode", id: "a", shape: "circle", x: 6, y: 6 }, { op: "setShape", ids: ["a"], shape: "frame" }]);
    expect(node(doc, "a")).toMatchObject({ shape: "frame", w: 4, h: 3 });
    doc = build([{ op: "setShape", ids: ["a"], shape: "square" }], doc);
    expect(Object.keys(node(doc, "a"))).toEqual(["id", "shape", "fill", "x", "y", "size"]);
  });

  it("箱の形には w(text 以外は h も)が必要", () => {
    const base = { version: 2, name: "x", canvas: { cols: 12, rows: 12 }, edges: [] };
    expect(() => parseDoc({ ...base, nodes: [{ id: "a", shape: "frame", fill: "outline", x: 6, y: 6, size: "m", w: 3 }] })).toThrow(/w と h/);
    expect(parseDoc({ ...base, nodes: [{ id: "a", shape: "text", fill: "outline", x: 6, y: 6, size: "m", w: 3 }] }).nodes).toHaveLength(1);
  });

  it("外接矩形は w / h から、text は行数から決まる", () => {
    const doc = build([
      { op: "addNode", id: "f", shape: "frame", x: 6, y: 6, w: 5, h: 3 },
      { op: "addNode", id: "x", shape: "text", x: 6, y: 6, w: 4, lines: 3 },
    ]);
    expect(nodeBounds(style, node(doc, "f"))).toEqual({ minX: 3.5, minY: 4.5, maxX: 8.5, maxY: 7.5 });
    const b = nodeBounds(style, node(doc, "x"));
    expectClose(b.maxY - b.minY, 2 * style.text.gap + style.stroke.width);
  });

  it("描画:枠・タブ付きの枠・表・テキスト行・マーク", () => {
    const doc = build([
      { op: "addNode", shape: "frame", x: 3.5, y: 3, w: 5, h: 3, header: true },
      { op: "addNode", shape: "frame", x: 9, y: 3, w: 4, h: 3, tab: true },
      { op: "addNode", shape: "table", x: 3.5, y: 8.5, w: 5, h: 4, cols: 2, rows: 3, header: true },
      { op: "addNode", shape: "text", x: 9, y: 7, w: 3, lines: 2 },
      { op: "addNode", shape: "check", x: 8, y: 10 },
      { op: "addNode", shape: "cross", x: 10, y: 10, size: "s" },
      { op: "addNode", shape: "sparkle", fill: "solid", x: 6, y: 6, size: "s" },
      { op: "addNode", shape: "cursor", fill: "outline", x: 10.5, y: 5.5, size: "s" },
    ]);
    const svg = renderSvg(doc, style);
    expect(svg).toMatchSnapshot();
    // 箱はエッジより先、マークはエッジより後に描く
    expect(svg.indexOf("<rect")).toBeLessThan(svg.lastIndexOf("<path"));
  });
});

describe("入れ子と lint", () => {
  const nested = [
    { op: "addNode", id: "box", shape: "frame", x: 6, y: 4.5, w: 8, h: 5, header: true },
    { op: "addNode", id: "in", shape: "circle", x: 5, y: 5 },
    { op: "addNode", id: "out", shape: "circle", x: 6, y: 9 },
  ];

  it("枠の内側に収まったノードは重なりにしない", () => {
    expect(rules(build(nested))).toEqual([]);
  });

  it("枠からはみ出したノードは重なり", () => {
    expect(rules(build([...nested, { op: "moveNode", id: "in", x: 2.5, y: 5 }]))).toContain("overlap:box,in");
  });

  it("枠の中から外へ出る線は貫通にしない。外どうしを結ぶ線が枠を横切るのは貫通", () => {
    expect(rules(build([...nested, { op: "connect", from: "in", to: "out" }]))).toEqual([]);
    const crossing = build([
      { op: "addNode", id: "box", shape: "frame", x: 6, y: 6, w: 4, h: 4 },
      { op: "addNode", id: "a", shape: "circle", x: 2, y: 6 },
      { op: "addNode", id: "b", shape: "circle", x: 10, y: 6 },
      { op: "connect", id: "e", from: "a", to: "b" },
    ]);
    expect(rules(crossing)).toContain("edge-through-node:e,box");
  });
});

describe("記号マークと線", () => {
  it("マークは外接円から mark.gap だけ離して線を切る(尖った先端と線がつながらない)", async () => {
    const { edgePolyline } = await import("../src/core/index.js");
    const doc = build([
      { op: "addNode", id: "ai", shape: "sparkle", fill: "solid", x: 3, y: 6 },
      { op: "addNode", id: "b", shape: "circle", x: 10, y: 6 },
    ]);
    const pts = edgePolyline(style, { type: "straight" }, node(doc, "ai"), node(doc, "b"));
    expectClose(pts[0]!.x - 3, style.node.sparkle.m / 2 + style.mark.gap);
  });
});
