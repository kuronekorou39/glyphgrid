import { describe, expect, it } from "vitest";
import { applyOp, applyOps, argsFromCli, emptyDoc, type Op } from "../src/core/index.js";
import { route } from "../src/core/commands/util.js";
import { build, expectClose, pos, style } from "./helpers.js";

const three: Op[] = [
  { op: "addNode", id: "a", kind: "dot", x: 2, y: 2 },
  { op: "addNode", id: "b", kind: "ring", x: 5, y: 4 },
  { op: "addNode", id: "c", kind: "square", x: 9, y: 7 },
];

describe("addNode / removeNode", () => {
  it("既定サイズ m で追加し、id を自動採番する", () => {
    const doc = build([{ op: "addNode", kind: "dot", x: 1, y: 2 }, { op: "addNode", kind: "ring", x: 3, y: 4, size: "s" }]);
    expect(doc.nodes).toEqual([
      { id: "n1", shape: "circle", fill: "solid", x: 1, y: 2, size: "m" },
      { id: "n2", shape: "circle", fill: "outline", x: 3, y: 4, size: "s" },
    ]);
  });

  it("重複 id や不正な kind はエラー", () => {
    expect(() => build([...three, { op: "addNode", id: "a", kind: "dot", x: 0, y: 0 }])).toThrow(/すでに使われて/);
    expect(() => build([{ op: "addNode", kind: "star", x: 0, y: 0 }])).toThrow(/kind/);
  });

  it("removeNode は接続エッジも消す", () => {
    const doc = build([...three, { op: "connect", from: "a", to: "b" }, { op: "connect", from: "b", to: "c" }, { op: "removeNode", id: "b" }]);
    expect(doc.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(doc.edges).toEqual([]);
  });

  it("元の doc を変更しない", () => {
    const before = build(three);
    const snapshot = structuredClone(before);
    applyOp(before, style, { op: "moveNode", id: "a", x: 0, y: 0 });
    expect(before).toEqual(snapshot);
  });
});

describe("moveNode / nudge / setKind / setSize", () => {
  it("moveNode", () => {
    expect(pos(build([...three, { op: "moveNode", id: "a", x: 6, y: 1 }]), "a")).toEqual({ x: 6, y: 1 });
  });

  it("nudge は両端とも動いたエッジの幹も動かす", () => {
    const doc = build([
      ...three,
      { op: "connect", id: "ab", from: "a", to: "b", route: "hvh:3" },
      { op: "connect", id: "bc", from: "b", to: "c", route: "hvh:7" },
      { op: "nudge", ids: ["a", "b"], dx: 1, dy: -1 },
    ]);
    expect(pos(doc, "a")).toEqual({ x: 3, y: 1 });
    expect(pos(doc, "b")).toEqual({ x: 6, y: 3 });
    expect(doc.edges[0]!.route).toEqual({ type: "ortho", bend: "hvh", mid: 4 });
    expect(doc.edges[1]!.route).toEqual({ type: "ortho", bend: "hvh", mid: 7 });
  });

  it("setKind / setSize", () => {
    const doc = build([...three, { op: "setKind", ids: ["a", "b"], kind: "square" }, { op: "setSize", ids: ["c"], size: "l" }]);
    expect(doc.nodes.map((n) => `${n.shape}/${n.fill}:${n.size}`)).toEqual(["square/outline:m", "square/outline:m", "square/outline:l"]);
  });

  it("存在しない id はエラー", () => {
    expect(() => build([...three, { op: "setKind", ids: ["zz"], kind: "dot" }])).toThrow(/zz/);
  });
});

describe("connect / disconnect / setRoute", () => {
  it("route は既定で straight、短縮形も受け付ける", () => {
    const doc = build([...three, { op: "connect", from: "a", to: "b" }, { op: "connect", from: "b", to: "c", route: "vhv:5" }]);
    expect(doc.edges).toEqual([
      { id: "e1", from: "a", to: "b", route: { type: "straight" } },
      { id: "e2", from: "b", to: "c", route: { type: "ortho", bend: "vhv", mid: 5 } },
    ]);
  });

  it("自己ループと存在しないノードはエラー", () => {
    expect(() => build([...three, { op: "connect", from: "a", to: "a" }])).toThrow();
    expect(() => build([...three, { op: "connect", from: "a", to: "x" }])).toThrow(/x/);
  });

  it("disconnect / setRoute", () => {
    const doc = build([
      ...three,
      { op: "connect", id: "e1", from: "a", to: "b" },
      { op: "connect", id: "e2", from: "b", to: "c" },
      { op: "disconnect", id: "e1" },
      { op: "setRoute", id: "e2", route: { type: "slant", bend: "hdh", mid: 7, span: 2 } },
    ]);
    expect(doc.edges).toEqual([{ id: "e2", from: "b", to: "c", route: { type: "slant", bend: "hdh", mid: 7, span: 2 } }]);
  });
});

describe("route の短縮形", () => {
  it.each([
    ["straight", { type: "straight" }],
    ["hv", { type: "ortho", bend: "hv" }],
    ["hvh", { type: "ortho", bend: "hvh" }],
    ["vhv:4.5", { type: "ortho", bend: "vhv", mid: 4.5 }],
    ["hdh:6:2", { type: "slant", bend: "hdh", mid: 6, span: 2 }],
    ['{"type":"ortho","bend":"vh"}', { type: "ortho", bend: "vh" }],
  ])("%s", (input, expected) => {
    expect(route(input)).toEqual(expected);
  });

  it("不正な短縮形はエラー", () => {
    expect(() => route("zigzag")).toThrow();
  });
});

describe("align", () => {
  it.each([
    ["left", "x", [2, 2, 2]],
    ["right", "x", [9, 9, 9]],
    ["center-x", "x", [5.5, 5.5, 5.5]],
    ["top", "y", [2, 2, 2]],
    ["bottom", "y", [7, 7, 7]],
    ["center-y", "y", [4.5, 4.5, 4.5]],
  ] as const)("%s", (mode, axis, expected) => {
    const doc = build([...three, { op: "align", ids: ["a", "b", "c"], mode }]);
    expect(doc.nodes.map((n) => n[axis])).toEqual(expected);
  });

  it("中央揃えの結果は 0.5 グリッドに乗る", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 0, y: 0 },
      { op: "addNode", id: "b", kind: "dot", x: 1.5, y: 0 },
      { op: "align", ids: ["a", "b"], mode: "center-x" },
    ]);
    expect(pos(doc, "a").x).toBe(1); // 0.75 → 1
  });
});

describe("distribute", () => {
  it("両端を固定して等間隔に並べる", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 2, y: 0 },
      { op: "addNode", id: "b", kind: "dot", x: 3, y: 0 },
      { op: "addNode", id: "c", kind: "dot", x: 4, y: 0 },
      { op: "addNode", id: "d", kind: "dot", x: 11, y: 0 },
      { op: "distribute", ids: ["d", "b", "a", "c"], direction: "horizontal" },
    ]);
    expect(["a", "b", "c", "d"].map((id) => pos(doc, id).x)).toEqual([2, 5, 8, 11]);
  });

  it("縦方向", () => {
    const doc = build([...three, { op: "distribute", ids: ["a", "b", "c"], direction: "vertical" }]);
    expect(pos(doc, "b").y).toBe(4.5);
  });
});

describe("normalizeSize", () => {
  it("未指定なら最頻値に揃える", () => {
    const doc = build([
      ...three,
      { op: "setSize", ids: ["a"], size: "s" },
      { op: "setSize", ids: ["b", "c"], size: "l" },
      { op: "normalizeSize", ids: ["a", "b", "c"] },
    ]);
    expect(doc.nodes.map((n) => n.size)).toEqual(["l", "l", "l"]);
  });

  it("指定があればそれに揃える", () => {
    const doc = build([...three, { op: "normalizeSize", ids: ["a", "b"], size: "s" }]);
    expect(doc.nodes.map((n) => n.size)).toEqual(["s", "s", "m"]);
  });
});

describe("snapToGrid", () => {
  it("座標と幹の位置を 0.5 刻みに吸着させる", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 1.2, y: 2.8 },
      { op: "addNode", id: "b", kind: "dot", x: 7.74, y: -0.1 },
      { op: "connect", from: "a", to: "b", route: "hvh:4.3" },
      { op: "snapToGrid" },
    ]);
    expect(pos(doc, "a")).toEqual({ x: 1, y: 3 });
    expect(pos(doc, "b")).toEqual({ x: 7.5, y: 0 });
    expect(doc.edges[0]!.route).toEqual({ type: "ortho", bend: "hvh", mid: 4.5 });
  });

  it("ids を指定するとそのノードだけ", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 1.2, y: 1.2 },
      { op: "addNode", id: "b", kind: "dot", x: 1.2, y: 1.2 },
      { op: "snapToGrid", ids: ["a"] },
    ]);
    expect(pos(doc, "a").x).toBe(1);
    expect(pos(doc, "b").x).toBe(1.2);
  });
});

describe("mirror", () => {
  it("左右反転の複製。軸上のノードは共有する", () => {
    const doc = build([
      { op: "addNode", id: "c", kind: "dot", x: 6, y: 2 },
      { op: "addNode", id: "l", kind: "ring", x: 2, y: 6 },
      { op: "connect", from: "c", to: "l", route: "vhv:4" },
      { op: "mirror", ids: ["c", "l"], axis: "x" },
    ]);
    expect(doc.nodes).toHaveLength(3);
    expect(pos(doc, "n1")).toEqual({ x: 10, y: 6 });
    expect(doc.edges[1]).toEqual({ id: "e2", from: "c", to: "n1", route: { type: "ortho", bend: "vhv", mid: 4 } });
  });

  it("上下反転では対応する軸の mid を反転する", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 2, y: 2 },
      { op: "addNode", id: "b", kind: "dot", x: 4, y: 4 },
      { op: "connect", from: "a", to: "b", route: "vhv:3" },
      { op: "mirror", ids: ["a", "b"], axis: "y", about: 5 },
    ]);
    expect(doc.nodes.slice(2).map((n) => n.y)).toEqual([8, 6]);
    expect(doc.edges[1]!.route).toEqual({ type: "ortho", bend: "vhv", mid: 7 });
  });
});

describe("radial", () => {
  it("上を起点に時計回りで等角度に置く", () => {
    const doc = build([
      { op: "addNode", id: "c", kind: "dot", x: 6, y: 6 },
      { op: "addNode", id: "a", kind: "ring", x: 0, y: 0 },
      { op: "addNode", id: "b", kind: "ring", x: 0, y: 0 },
      { op: "addNode", id: "d", kind: "ring", x: 0, y: 0 },
      { op: "addNode", id: "e", kind: "ring", x: 0, y: 0 },
      { op: "radial", center: "c", ids: ["a", "b", "d", "e"], radius: 3 },
    ]);
    expect(["a", "b", "d", "e"].map((id) => pos(doc, id))).toEqual([
      { x: 6, y: 3 },
      { x: 9, y: 6 },
      { x: 6, y: 9 },
      { x: 3, y: 6 },
    ]);
  });

  it("radius 省略時は現在の平均距離、startAngle で回転", () => {
    const doc = build([
      { op: "addNode", id: "c", kind: "dot", x: 6, y: 6 },
      { op: "addNode", id: "a", kind: "ring", x: 6, y: 2 },
      { op: "addNode", id: "b", kind: "ring", x: 10, y: 6 },
      { op: "radial", center: "c", ids: ["a", "b"], startAngle: 90 },
    ]);
    expect(pos(doc, "a")).toEqual({ x: 10, y: 6 });
    expect(pos(doc, "b")).toEqual({ x: 2, y: 6 });
  });
});

describe("centerContent", () => {
  it("外形込みの外接矩形をキャンバス中央に寄せる", () => {
    const doc = build([
      { op: "addNode", id: "a", kind: "dot", x: 1, y: 1 },
      { op: "addNode", id: "b", kind: "dot", x: 5, y: 3 },
      { op: "connect", from: "a", to: "b", route: "hvh:2" },
      { op: "centerContent" },
    ]);
    expect(pos(doc, "a")).toEqual({ x: 4, y: 5 });
    expect(pos(doc, "b")).toEqual({ x: 8, y: 7 });
    expect(doc.edges[0]!.route).toEqual({ type: "ortho", bend: "hvh", mid: 5 });
  });

  it("空の doc はそのまま", () => {
    expect(applyOp(emptyDoc("x"), style, { op: "centerContent" })).toEqual(emptyDoc("x"));
  });
});

describe("tidy", () => {
  it("吸着・重複除去・幹の共有化・中央寄せをまとめて行う", () => {
    const doc = build([
      { op: "addNode", id: "s", kind: "dot", x: 2.2, y: 6 },
      { op: "addNode", id: "t1", kind: "dot", x: 10, y: 2 },
      { op: "addNode", id: "t2", kind: "dot", x: 10, y: 10 },
      { op: "connect", from: "s", to: "t1", route: "hvh:5.6" },
      { op: "connect", from: "s", to: "t2", route: "hvh:6.3" },
      { op: "connect", from: "s", to: "t1", route: "hvh:5.6" },
      { op: "connect", from: "t1", to: "t2" },
      { op: "connect", from: "t2", to: "t1" },
      { op: "tidy" },
    ]);
    expect(doc.edges.map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
    const mids = doc.edges.slice(0, 2).map((e) => (e.route.type === "ortho" ? e.route.mid : null));
    expect(mids[0]).toBe(mids[1]);
    expect(pos(doc, "s").x).toBe(2);
  });

  it("離れた幹はまとめない", () => {
    const doc = build([
      { op: "addNode", id: "s", kind: "dot", x: 2, y: 6 },
      { op: "addNode", id: "t1", kind: "dot", x: 10, y: 2 },
      { op: "addNode", id: "t2", kind: "dot", x: 10, y: 10 },
      { op: "connect", from: "s", to: "t1", route: "hvh:4" },
      { op: "connect", from: "s", to: "t2", route: "hvh:8" },
      { op: "tidy" },
    ]);
    expect(doc.edges.map((e) => (e.route.type === "ortho" ? e.route.mid : null))).toEqual([4, 8]);
  });
});

describe("applyOps", () => {
  it("失敗した op の位置を添えてエラーにする", () => {
    expect(() => applyOps(emptyDoc("x"), style, [{ op: "addNode", kind: "dot", x: 0, y: 0 }, { op: "nope" }])).toThrow(/ops\[1\] \(nope\)/);
  });
});

describe("argsFromCli", () => {
  it("位置引数と key=value を割り当てる", () => {
    expect(argsFromCli("addNode", ["dot", "2", "3", "id=hub"])).toEqual({ shape: "dot", x: "2", y: "3", id: "hub" });
  });

  it("必須引数が足りなければエラー", () => {
    expect(() => argsFromCli("connect", ["a"])).toThrow(/to/);
  });

  it("CLI 由来の文字列引数でもコマンドが動く", () => {
    const doc = build(three);
    const out = applyOp(doc, style, { op: "nudge", ...argsFromCli("nudge", ["a,b", "1", "-1"]) });
    expect(pos(out, "a")).toEqual({ x: 3, y: 1 });
    expectClose(pos(out, "b").y, 3);
  });
});
