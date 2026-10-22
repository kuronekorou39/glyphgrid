import { routePoints } from "../geometry.js";
import { EPS, allIds, findNode, nextId, requireNode, type IconDoc, type Route, type SizeToken } from "../model.js";
import { nodeHalfExtent, type Style } from "../style.js";
import type { Command } from "./types.js";
import { clone, idList, midAxis, oneOf, optNum, pickNodes, shiftMids, size, snap } from "./util.js";

const ALIGN_MODES = ["left", "center-x", "right", "top", "center-y", "bottom"] as const;

/** ノード中心を基準に揃える(グリッド上の点に置く前提なので外形ではなく中心で揃える) */
export const align: Command = (doc, _style, args) => {
  const mode = oneOf(args.mode, ALIGN_MODES, "mode");
  const next = clone(doc);
  const nodes = pickNodes(next, idList(args.ids));
  if (nodes.length < 2) return next;
  const axis = mode === "left" || mode === "center-x" || mode === "right" ? "x" : "y";
  const vals = nodes.map((n) => n[axis]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const target = mode === "left" || mode === "top" ? lo : mode === "right" || mode === "bottom" ? hi : snap((lo + hi) / 2);
  for (const n of nodes) n[axis] = target;
  return next;
};

/** 両端を固定して等間隔に並べる。結果は 0.5 グリッドに丸める */
export const distribute: Command = (doc, _style, args) => {
  const direction = oneOf(args.direction ?? args.mode, ["horizontal", "vertical"] as const, "direction");
  const axis = direction === "horizontal" ? "x" : "y";
  const next = clone(doc);
  const nodes = pickNodes(next, idList(args.ids)).sort((a, b) => a[axis] - b[axis]);
  if (nodes.length < 3) return next;
  const first = nodes[0]![axis];
  const step = (nodes[nodes.length - 1]![axis] - first) / (nodes.length - 1);
  nodes.forEach((n, i) => {
    if (i > 0 && i < nodes.length - 1) n[axis] = snap(first + step * i);
  });
  return next;
};

/** サイズを揃える。未指定なら最頻値(同数なら ids で先に出たもの) */
export const normalizeSize: Command = (doc, _style, args) => {
  const next = clone(doc);
  const nodes = pickNodes(next, idList(args.ids));
  let target: SizeToken | undefined = args.size === undefined ? undefined : size(args.size);
  if (!target) {
    const count = new Map<SizeToken, number>();
    for (const n of nodes) count.set(n.size, (count.get(n.size) ?? 0) + 1);
    let best = 0;
    for (const n of nodes) {
      const c = count.get(n.size)!;
      if (c > best) [best, target] = [c, n.size];
    }
  }
  if (target) for (const n of nodes) n.size = target;
  return next;
};

/** 座標と幹の位置(mid)を 0.5 グリッドに吸着させる。ids 省略時は全体 */
export const snapToGrid: Command = (doc, _style, args) => {
  const next = clone(doc);
  const ids = args.ids === undefined ? null : new Set(idList(args.ids));
  if (ids) pickNodes(next, [...ids]);
  for (const n of next.nodes) {
    if (ids && !ids.has(n.id)) continue;
    n.x = snap(n.x);
    n.y = snap(n.y);
  }
  for (const e of next.edges) {
    if (ids && !(ids.has(e.from) || ids.has(e.to))) continue;
    if (e.route.type !== "straight" && e.route.mid !== undefined) e.route.mid = snap(e.route.mid);
    if (e.route.type === "slant" && e.route.span !== undefined) e.route.span = snap(e.route.span);
  }
  return next;
};

function mirrorRoute(r: Route, axis: "x" | "y", about: number): Route {
  const out = structuredClone(r);
  if (out.type !== "straight" && out.mid !== undefined && midAxis(out) === axis) out.mid = 2 * about - out.mid;
  return out;
}

/**
 * 鏡像を複製する。axis "x" は x 座標を反転(左右反転)、"y" は上下反転。
 * about は対称軸の座標で、省略時はキャンバス中央。
 * 対称軸上のノードは複製せず共有し、選択内のエッジも鏡像を作る。
 */
export const mirror: Command = (doc, _style, args) => {
  const axis = oneOf(args.axis, ["x", "y"] as const, "axis");
  const about = optNum(args.about, "about") ?? (axis === "x" ? doc.canvas.cols / 2 : doc.canvas.rows / 2);
  const next = clone(doc);
  const nodes = pickNodes(next, idList(args.ids));
  const map = new Map<string, string>();
  for (const n of nodes) {
    const v = 2 * about - n[axis];
    if (Math.abs(v - n[axis]) < EPS) {
      map.set(n.id, n.id);
      continue;
    }
    const id = nextId(allIds(next), "n");
    next.nodes.push({ ...n, id, [axis]: v });
    map.set(n.id, id);
  }
  for (const e of [...next.edges]) {
    const from = map.get(e.from);
    const to = map.get(e.to);
    if (!from || !to || (from === e.from && to === e.to)) continue;
    next.edges.push({ id: nextId(allIds(next), "e"), from, to, route: mirrorRoute(e.route, axis, about) });
  }
  return next;
};

/**
 * 中心ノードの周りに等角度で配置する。角度は上(12時)を 0 として時計回り(度)。
 * radius 省略時は現在の距離の平均。結果は 0.5 グリッドに丸める。
 */
export const radial: Command = (doc, _style, args) => {
  const next = clone(doc);
  const center = requireNode(next, String(args.center ?? args.centerId));
  const nodes = pickNodes(next, idList(args.ids)).filter((n) => n.id !== center.id);
  if (!nodes.length) return next;
  const start = optNum(args.startAngle, "startAngle") ?? 0;
  const radius =
    optNum(args.radius, "radius") ??
    nodes.reduce((s, n) => s + Math.hypot(n.x - center.x, n.y - center.y), 0) / nodes.length;
  if (!(radius > EPS)) throw new Error("radius が 0 です。radius を指定してください");
  nodes.forEach((n, i) => {
    const a = ((start + (360 * i) / nodes.length) * Math.PI) / 180;
    n.x = snap(center.x + radius * Math.sin(a));
    n.y = snap(center.y - radius * Math.cos(a));
  });
  return next;
};

/** ノードの外形と、エッジの折れ点を含む外接矩形 */
export function contentBounds(doc: IconDoc, style: Style) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  for (const n of doc.nodes) {
    const h = nodeHalfExtent(style, n);
    add(n.x - h, n.y - h, n.x + h, n.y + h);
  }
  const w = style.stroke.width / 2;
  for (const e of doc.edges) {
    const a = findNode(doc, e.from);
    const b = findNode(doc, e.to);
    if (!a || !b) continue;
    for (const p of routePoints(e.route, a, b)) add(p.x - w, p.y - w, p.x + w, p.y + w);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** 内容をキャンバス中央に寄せる。移動量は 0.5 グリッド刻み */
export const centerContent: Command = (doc, style) => {
  const b = contentBounds(doc, style);
  if (!b) return clone(doc);
  const dx = snap(doc.canvas.cols / 2 - (b.minX + b.maxX) / 2);
  const dy = snap(doc.canvas.rows / 2 - (b.minY + b.maxY) / 2);
  const next = clone(doc);
  for (const n of next.nodes) {
    n.x += dx;
    n.y += dy;
  }
  shiftMids(next, new Set(next.nodes.map((n) => n.id)), dx, dy);
  return next;
};

