import { describe, expect, it } from "vitest";
import { edgePolyline, lint, parseDoc, parseStyle, renderSvg, type IconDoc } from "../src/core/index.js";
import { nodeBounds, outline, signedDistance } from "../src/core/shape.js";
import { build, expectClose, style } from "./helpers.js";

const node = (doc: IconDoc, id: string) => doc.nodes.find((n) => n.id === id)!;
const edge = (doc: IconDoc, id: string) => doc.edges.find((e) => e.id === id)!;

describe("旧形式(version 1)の読み込み", () => {
  it("kind を shape + fill に変換する", () => {
    const doc = parseDoc({
      version: 1,
      name: "old",
      canvas: { cols: 12, rows: 12 },
      nodes: [
        { id: "a", kind: "dot", x: 2, y: 2, size: "m" },
        { id: "b", kind: "ring", x: 4, y: 2, size: "s" },
        { id: "c", kind: "square", x: 6, y: 2, size: "l" },
      ],
      edges: [],
    });
    expect(doc.version).toBe(2);
    expect(doc.nodes.map((n) => [n.id, n.shape, n.fill, n.size])).toEqual([
      ["a", "circle", "solid", "m"],
      ["b", "circle", "outline", "s"],
      ["c", "square", "outline", "l"],
    ]);
    expect(Object.keys(doc.nodes[0]!)).toEqual(["id", "shape", "fill", "x", "y", "size"]);
  });

  it("旧形式の style.json(node.dot)は circle として読む", () => {
    expect(parseStyle({ node: { dot: { m: 3 } } }).node.circle.m).toBe(3);
  });
});

describe("ノードの形と塗り", () => {
  it("addNode: shape と fill。fill の既定は outline。旧 kind 名も使える", () => {
    const doc = build([
      { op: "addNode", id: "a", shape: "hexagon", fill: "core", x: 2, y: 2 },
      { op: "addNode", id: "b", shape: "diamond", x: 6, y: 2 },
      { op: "addNode", id: "c", shape: "dot", x: 10, y: 2 },
    ]);
    expect(doc.nodes.map((n) => `${n.shape}/${n.fill}`)).toEqual(["hexagon/core", "diamond/outline", "circle/solid"]);
  });

  it("不正な shape / fill はエラー", () => {
    expect(() => build([{ op: "addNode", shape: "star", x: 0, y: 0 }])).toThrow(/shape/);
    expect(() => build([{ op: "addNode", shape: "circle", fill: "glow", x: 0, y: 0 }])).toThrow(/fill/);
    expect(() => build([{ op: "addNode", x: 0, y: 0 }])).toThrow(/shape/);
  });

  it("setShape は塗りを保ち、setFill は塗りだけ変える", () => {
    const doc = build([
      { op: "addNode", id: "a", shape: "circle", fill: "solid", x: 2, y: 2 },
      { op: "setShape", ids: ["a"], shape: "triangle" },
    ]);
    expect(node(doc, "a")).toMatchObject({ shape: "triangle", fill: "solid" });
    expect(node(build([{ op: "setFill", ids: ["a"], fill: "core" }], doc), "a")).toMatchObject({ shape: "triangle", fill: "core" });
    expect(node(build([{ op: "setKind", ids: ["a"], kind: "ring" }], doc), "a")).toMatchObject({ shape: "circle", fill: "outline" });
  });
});

describe("外形", () => {
  const at = (shape: "diamond" | "triangle" | "hexagon") => ({ shape, size: "m" as const, x: 6, y: 6 });

  it("ひし形は上下左右に頂点がある", () => {
    const o = outline(style, at("diamond"));
    const h = style.node.diamond.m / 2;
    expect(o.type === "poly" && o.pts.map((p) => [p.x, p.y].map((v) => Math.round(v * 1000) / 1000))).toEqual([
      [6, 6 - h],
      [6 + h, 6],
      [6, 6 + h],
      [6 - h, 6],
    ]);
  });

  it("三角形は外接矩形の中心がノード中心にくる", () => {
    const b = nodeBounds(style, at("triangle"));
    expectClose((b.minX + b.maxX) / 2, 6);
    expectClose((b.minY + b.maxY) / 2, 6);
  });

  it("符号付き距離:内側は負、外側は正", () => {
    const o = outline(style, at("hexagon"));
    expect(signedDistance(o, { x: 6, y: 6 })).toBeLessThan(0);
    expect(signedDistance(o, { x: 10, y: 6 })).toBeGreaterThan(0);
  });

  it("エッジは多角形の線の中心で切られる", () => {
    const doc = build([
      { op: "addNode", id: "a", shape: "circle", x: 1, y: 6 },
      { op: "addNode", id: "d", shape: "diamond", x: 6, y: 6 },
    ]);
    const pts = edgePolyline(style, { type: "straight" }, node(doc, "a"), node(doc, "d"));
    expectClose(signedDistance(outline(style, node(doc, "d"), style.stroke.width / 2), pts[1]!), 0);
  });
});

describe("エッジの線種と矢印", () => {
  const base = [
    { op: "addNode", id: "a", shape: "circle", x: 2, y: 6 },
    { op: "addNode", id: "b", shape: "square", x: 10, y: 6 },
  ];

  it("connect で dash / arrow を指定。既定値はキーを持たない", () => {
    const doc = build([
      ...base,
      { op: "connect", id: "e1", from: "a", to: "b", dash: "dashed", arrow: "end" },
      { op: "connect", id: "e2", from: "b", to: "a", dash: "solid", arrow: "none" },
    ]);
    expect(edge(doc, "e1")).toMatchObject({ dash: "dashed", arrow: "end" });
    expect(Object.keys(edge(doc, "e2"))).toEqual(["id", "from", "to", "route"]);
  });

  it("setDash / setArrow。solid / none でキーが消える", () => {
    let doc = build([...base, { op: "connect", id: "e", from: "a", to: "b", route: "hv" }, { op: "setDash", ids: ["e"], dash: "dotted" }, { op: "setArrow", ids: ["e"], arrow: "both" }]);
    expect(edge(doc, "e")).toMatchObject({ dash: "dotted", arrow: "both" });
    doc = build([{ op: "setDash", ids: ["e"], dash: "solid" }, { op: "setArrow", ids: ["e"], arrow: "none" }], doc);
    expect(edge(doc, "e")).toEqual({ id: "e", from: "a", to: "b", route: { type: "ortho", bend: "hv" } });
  });

  it("reverse は向きを入れ替え、hv / vh は同じ形になるよう入れ替える", () => {
    const doc = build([...base, { op: "connect", id: "e", from: "a", to: "b", route: "hv", arrow: "end" }, { op: "reverse", ids: ["e"] }]);
    expect(edge(doc, "e")).toEqual({ id: "e", from: "b", to: "a", route: { type: "ortho", bend: "vh" }, arrow: "end" });
  });

  it("矢印のある端は、外形から gap だけ離れた位置で止まる", () => {
    const doc = build([...base, { op: "connect", id: "e", from: "a", to: "b", arrow: "end" }]);
    const pts = edgePolyline(style, { type: "straight" }, node(doc, "a"), node(doc, "b"), "end");
    expectClose(signedDistance(outline(style, node(doc, "b")), pts[1]!), style.arrow.gap);
  });

  it("破線と矢じりを描く", () => {
    const doc = build([...base, { op: "connect", from: "a", to: "b", dash: "dashed", arrow: "both" }]);
    const svg = renderSvg(doc, style);
    expect(svg).toContain(`stroke-dasharray="${style.dash.dashed.map((v) => Math.round(v * style.unit * 1000) / 1000).join(" ")}"`);
    expect(svg.match(/<path d="M[^"]*L[^"]*L[^"]*M[^"]*L[^"]*L[^"]*"\/>/)).not.toBeNull();
  });

  it("新しい形と塗りの描画", () => {
    const doc = build([
      { op: "addNode", shape: "diamond", fill: "solid", x: 3, y: 3 },
      { op: "addNode", shape: "hexagon", fill: "core", x: 9, y: 3 },
      { op: "addNode", shape: "triangle", fill: "outline", x: 3, y: 9 },
      { op: "addNode", shape: "square", fill: "solid", x: 9, y: 9 },
      { op: "connect", from: "n1", to: "n2", arrow: "end", dash: "dotted" },
      { op: "connect", from: "n3", to: "n4", route: "hdh", arrow: "both" },
    ]);
    expect(renderSvg(doc, style)).toMatchSnapshot();
  });
});

describe("lint と tidy", () => {
  it("short-edge: 矢印に対して線が短い", () => {
    const doc = build([
      { op: "addNode", id: "a", shape: "circle", x: 4.5, y: 6 },
      { op: "addNode", id: "b", shape: "circle", x: 7.5, y: 6 },
      { op: "connect", id: "e", from: "a", to: "b", arrow: "both" },
    ]);
    expect(lint(doc, style).map((i) => i.rule)).toEqual(["short-edge"]);
    expect(lint(build([{ op: "setArrow", ids: ["e"], arrow: "none" }], doc), style)).toEqual([]);
  });

  it("tidy は矢印の向きが違うエッジを重複とみなさない", () => {
    const doc = build([
      { op: "addNode", id: "a", shape: "circle", x: 2, y: 6 },
      { op: "addNode", id: "b", shape: "circle", x: 10, y: 6 },
      { op: "connect", from: "a", to: "b", arrow: "end" },
      { op: "connect", from: "b", to: "a", arrow: "end" },
      { op: "connect", from: "a", to: "b", arrow: "end" },
      { op: "tidy" },
    ]);
    expect(doc.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});
