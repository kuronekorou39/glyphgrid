import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { edgePolyline, formatDoc, lint, parseDoc, parseStyle, renderSvg, roundedPath, routePoints, simplify } from "../src/core/index.js";
import { renderSheet } from "../src/core/render/sheet.js";
import { build, expectClose, style } from "./helpers.js";

describe("routePoints", () => {
  const a = { x: 2, y: 2 };
  const b = { x: 8, y: 6 };
  it.each([
    [{ type: "straight" } as const, [a, b]],
    [{ type: "ortho", bend: "hv" } as const, [a, { x: 8, y: 2 }, b]],
    [{ type: "ortho", bend: "vh" } as const, [a, { x: 2, y: 6 }, b]],
    [{ type: "ortho", bend: "hvh" } as const, [a, { x: 5, y: 2 }, { x: 5, y: 6 }, b]],
    [{ type: "ortho", bend: "vhv", mid: 3 } as const, [a, { x: 2, y: 3 }, { x: 8, y: 3 }, b]],
    [{ type: "slant", bend: "hdh", mid: 5, span: 2 } as const, [a, { x: 4, y: 2 }, { x: 6, y: 6 }, b]],
    [{ type: "slant", bend: "vdv" } as const, [a, { x: 2, y: 3.5 }, { x: 8, y: 4.5 }, b]],
  ])("%j", (route, expected) => {
    expect(routePoints(route, a, b)).toEqual(expected);
  });

  it("hdh は右から左へ向かうときも斜め区間が mid を中心にする", () => {
    expect(routePoints({ type: "slant", bend: "hdh", mid: 5, span: 2 }, b, a)).toEqual([b, { x: 6, y: 6 }, { x: 4, y: 2 }, a]);
  });

  it("一直線になる hvh は直線に縮む", () => {
    expect(routePoints({ type: "ortho", bend: "hvh", mid: 5 }, { x: 2, y: 4 }, { x: 8, y: 4 })).toEqual([{ x: 2, y: 4 }, { x: 8, y: 4 }]);
  });

  it("simplify は重複点と途中の直線点を除く", () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }])).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
  });
});

describe("edgePolyline(ノード外形で切る)", () => {
  const w = style.stroke.width;
  it("円は半径 - 線幅/2 で切る", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "ring", x: 2, y: 6 },
      { op: "addNode", id: "b", kind: "dot", x: 10, y: 6 },
    ]);
    const pts = edgePolyline(style, { type: "straight" }, doc.nodes[0]!, doc.nodes[1]!);
    expectClose(pts[0]!.x, 2 + style.node.circle.m / 2 - w / 2);
    expectClose(pts[1]!.x, 10 - style.node.circle.m / 2 + w / 2);
  });

  it("四角は斜めから来ても辺で切る", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "square", x: 2, y: 2 },
      { op: "addNode", id: "b", kind: "dot", x: 8, y: 8 },
    ]);
    const pts = edgePolyline(style, { type: "straight" }, doc.nodes[0]!, doc.nodes[1]!);
    const half = style.node.square.m / 2 - w / 2;
    expectClose(pts[0]!.x, 2 + half);
    expectClose(pts[0]!.y, 2 + half);
  });

  it("ノードが重なっていて描く部分が無ければ空", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 2, y: 2 },
      { op: "addNode", id: "b", kind: "dot", x: 2.5, y: 2 },
    ]);
    expect(edgePolyline(style, { type: "straight" }, doc.nodes[0]!, doc.nodes[1]!)).toEqual([]);
  });
});

describe("roundedPath", () => {
  it("直角の折れ点を円弧にする", () => {
    const cmds = roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 1);
    expect(cmds).toEqual([
      { c: "M", p: { x: 0, y: 0 } },
      { c: "L", p: { x: 3, y: 0 } },
      { c: "A", r: expect.closeTo(1, 6), sweep: 1, p: { x: 4, y: expect.closeTo(1, 6) } },
      { c: "L", p: { x: 4, y: 4 } },
    ]);
  });

  it("区間が短いときは半径を縮める", () => {
    const cmds = roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 8, y: 1 }], 2);
    const arcs = cmds.filter((c) => c.c === "A");
    expect(arcs).toHaveLength(2);
    for (const a of arcs) expectClose(a.c === "A" ? a.r : 0, 0.5);
  });
});

describe("renderSvg", () => {
  it("エッジが先、ノードが後。viewBox 付き", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 2, y: 6 },
      { op: "addNode", id: "b", kind: "ring", x: 10, y: 2 },
      { op: "addNode", id: "c", kind: "square", x: 10, y: 10 },
      { op: "connect", from: "a", to: "b", route: "hvh:6" },
      { op: "connect", from: "a", to: "c", route: "hvh:6" },
    ]);
    const svg = renderSvg(doc, style);
    expect(svg).toMatchSnapshot();
    expect(svg).toContain('viewBox="0 0 288 288"');
    expect(svg.indexOf("<path")).toBeLessThan(svg.indexOf("<circle"));
  });

  it("背景色を指定すると矩形を敷く", () => {
    const svg = renderSvg(build([]), { ...style, background: "#fff" });
    expect(svg).toContain('<rect width="288" height="288" fill="#fff"/>');
  });

  it("スタイルを変えると線幅・色が全体に反映される", () => {
    const doc = build([{ op: "addNode", kind: "ring", x: 6, y: 6 }]);
    const svg = renderSvg(doc, parseStyle({ stroke: { width: 0.5, color: "#ff0000" } }));
    expect(svg).toContain('stroke="#ff0000" stroke-width="12"');
  });
});

// 番号付きのアイコン(NN-name.icon.json)だけをテスト対象にする。作業中に足したファイルは含めない
describe.each([
  ["sample", 9],
  ["showcase", 6],
])("セット sets/%s", (set, count) => {
  const dir = join(import.meta.dirname, "..", "sets", set);
  const setStyle = parseStyle(JSON.parse(readFileSync(join(dir, "style.json"), "utf8")));
  const files = readdirSync(join(dir, "icons")).filter((f) => /^\d\d-.+\.icon\.json$/.test(f)).sort();
  const read = (f: string) => readFileSync(join(dir, "icons", f), "utf8");

  it(`${count} アイコンがそろい、lint を通る`, () => {
    expect(files).toHaveLength(count);
    for (const f of files) expect(lint(parseDoc(JSON.parse(read(f))), setStyle).map((i) => i.message)).toEqual([]);
  });

  it.each(files)("%s", (file) => {
    const text = read(file);
    const doc = parseDoc(JSON.parse(text));
    expect(formatDoc(doc)).toBe(text.replace(/\r\n/g, "\n"));
    expect(renderSvg(doc, setStyle)).toMatchSnapshot();
  });

  it("シート", () => {
    const docs = files.map((f) => parseDoc(JSON.parse(read(f))));
    expect(renderSheet(docs, setStyle)).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  });
});
