import { contentBounds } from "../commands/layout.js";
import { GRID_STEP } from "../commands/util.js";
import { edgePolyline, type Point } from "../geometry.js";
import { EPS, findNode, type IconDoc, type IconNode } from "../model.js";
import { nodeHalfExtent, type Style } from "../style.js";

export type Severity = "error" | "warning";
export type Rule =
  | "off-grid"
  | "overlap"
  | "edge-through-node"
  | "dangling-edge"
  | "out-of-bounds"
  | "off-center"
  | "inconsistent-size";

export interface Issue {
  rule: Rule;
  severity: Severity;
  ids: string[];
  message: string;
}

/** ノード同士の外形の隙間がこれ未満なら「近すぎる」 */
const MIN_NODE_GAP = 0.5;
/** 内容の中心がキャンバス中央からこれ以上ずれたら警告(centerContent は 0.5 刻みで寄せるため) */
const MAX_CENTER_OFFSET = GRID_STEP / 2;

const onGrid = (v: number) => Math.abs(v / GRID_STEP - Math.round(v / GRID_STEP)) < EPS;
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

function offGrid(doc: IconDoc): Issue[] {
  const issues: Issue[] = [];
  for (const n of doc.nodes) {
    if (!onGrid(n.x) || !onGrid(n.y))
      issues.push({ rule: "off-grid", severity: "error", ids: [n.id], message: `${n.id} が (${fmt(n.x)}, ${fmt(n.y)}) にあり、${GRID_STEP} グリッドに乗っていません` });
  }
  for (const e of doc.edges) {
    const r = e.route;
    if (r.type !== "straight" && r.mid !== undefined && !onGrid(r.mid))
      issues.push({ rule: "off-grid", severity: "error", ids: [e.id], message: `${e.id} の mid ${fmt(r.mid)} がグリッドに乗っていません` });
  }
  return issues;
}

function dangling(doc: IconDoc): Issue[] {
  return doc.edges.flatMap((e): Issue[] => {
    const missing = [e.from, e.to].filter((id) => !findNode(doc, id));
    return missing.length
      ? [{ rule: "dangling-edge", severity: "error", ids: [e.id], message: `${e.id} が存在しないノード ${missing.join(", ")} を参照しています` }]
      : [];
  });
}

/** 点から外形までの距離(内側なら負) */
function distanceToShape(p: Point, node: IconNode, style: Style): number {
  const h = nodeHalfExtent(style, node);
  const dx = Math.abs(p.x - node.x);
  const dy = Math.abs(p.y - node.y);
  if (node.kind !== "square") return Math.hypot(dx, dy) - h;
  const ox = dx - h;
  const oy = dy - h;
  return ox > 0 || oy > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) : Math.max(ox, oy);
}

/** 2ノードの外形の隙間(重なっていれば負)。四角は軸平行の箱として扱う */
function nodeGap(a: IconNode, b: IconNode, style: Style): number {
  const ha = nodeHalfExtent(style, a);
  const hb = nodeHalfExtent(style, b);
  if (a.kind !== "square" && b.kind !== "square") return Math.hypot(a.x - b.x, a.y - b.y) - ha - hb;
  if (a.kind === "square" && b.kind === "square") {
    const ox = Math.abs(a.x - b.x) - ha - hb;
    const oy = Math.abs(a.y - b.y) - ha - hb;
    return ox > 0 || oy > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) : Math.max(ox, oy);
  }
  const [circle, square] = a.kind === "square" ? [b, a] : [a, b];
  return distanceToShape(circle, square, style) - nodeHalfExtent(style, circle);
}

function overlap(doc: IconDoc, style: Style): Issue[] {
  const issues: Issue[] = [];
  for (let i = 0; i < doc.nodes.length; i++) {
    for (let j = i + 1; j < doc.nodes.length; j++) {
      const a = doc.nodes[i]!;
      const b = doc.nodes[j]!;
      const gap = nodeGap(a, b, style);
      if (gap < -EPS) issues.push({ rule: "overlap", severity: "error", ids: [a.id, b.id], message: `${a.id} と ${b.id} が重なっています` });
      else if (gap < MIN_NODE_GAP - EPS)
        issues.push({ rule: "overlap", severity: "warning", ids: [a.id, b.id], message: `${a.id} と ${b.id} の隙間が ${fmt(gap)} で近すぎます(${MIN_NODE_GAP} 以上)` });
    }
  }
  return issues;
}

/** 線分と外形の最短距離。線分上をたどって最小値を探す(外形は凸なので三分探索で足りる) */
function segmentDistance(a: Point, b: Point, node: IconNode, style: Style): number {
  const at = (t: number) => distanceToShape({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, node, style);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (at(m1) < at(m2)) hi = m2;
    else lo = m1;
  }
  return Math.min(at(0), at(1), at((lo + hi) / 2));
}

function edgeThroughNode(doc: IconDoc, style: Style): Issue[] {
  const issues: Issue[] = [];
  const halfWidth = style.stroke.width / 2;
  for (const e of doc.edges) {
    const from = findNode(doc, e.from);
    const to = findNode(doc, e.to);
    if (!from || !to) continue;
    const pts = edgePolyline(style, e.route, from, to);
    for (const n of doc.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      const hit = pts.slice(1).some((p, i) => segmentDistance(pts[i]!, p, n, style) < halfWidth - EPS);
      if (hit) issues.push({ rule: "edge-through-node", severity: "error", ids: [e.id, n.id], message: `${e.id}(${e.from}→${e.to})が ${n.id} に重なっています` });
    }
  }
  return issues;
}

function bounds(doc: IconDoc, style: Style): Issue[] {
  const b = contentBounds(doc, style);
  if (!b) return [];
  const issues: Issue[] = [];
  const p = style.padding;
  const { cols, rows } = doc.canvas;
  if (b.minX < p - EPS || b.minY < p - EPS || b.maxX > cols - p + EPS || b.maxY > rows - p + EPS) {
    const outside = doc.nodes
      .filter((n) => {
        const h = nodeHalfExtent(style, n);
        return n.x - h < p - EPS || n.y - h < p - EPS || n.x + h > cols - p + EPS || n.y + h > rows - p + EPS;
      })
      .map((n) => n.id);
    issues.push({
      rule: "out-of-bounds",
      severity: "error",
      ids: outside,
      message: `内容が余白 ${p} の内側に収まっていません(範囲 x ${fmt(b.minX)}〜${fmt(b.maxX)}, y ${fmt(b.minY)}〜${fmt(b.maxY)})`,
    });
  }
  const dx = (b.minX + b.maxX) / 2 - cols / 2;
  const dy = (b.minY + b.maxY) / 2 - rows / 2;
  if (Math.abs(dx) > MAX_CENTER_OFFSET + EPS || Math.abs(dy) > MAX_CENTER_OFFSET + EPS) {
    issues.push({ rule: "off-center", severity: "warning", ids: [], message: `内容の中心が中央から (${fmt(dx)}, ${fmt(dy)}) ずれています。centerContent で直せます` });
  }
  return issues;
}

/** 同じ役割(種類と接続数が同じ)のノードでサイズがばらばら */
function inconsistentSize(doc: IconDoc): Issue[] {
  const degree = new Map<string, number>();
  for (const e of doc.edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const groups = new Map<string, IconNode[]>();
  for (const n of doc.nodes) {
    const key = `${n.kind}/${degree.get(n.id) ?? 0}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const issues: Issue[] = [];
  for (const [key, nodes] of groups) {
    const sizes = new Set(nodes.map((n) => n.size));
    if (nodes.length < 2 || sizes.size < 2) continue;
    const [kind, deg] = key.split("/");
    issues.push({
      rule: "inconsistent-size",
      severity: "warning",
      ids: nodes.map((n) => n.id),
      message: `接続数 ${deg} の ${kind} でサイズが混在しています(${[...sizes].join(", ")})。normalizeSize で揃えられます`,
    });
  }
  return issues;
}

export function lint(doc: IconDoc, style: Style): Issue[] {
  return [
    ...dangling(doc),
    ...offGrid(doc),
    ...overlap(doc, style),
    ...edgeThroughNode(doc, style),
    ...bounds(doc, style),
    ...inconsistentSize(doc),
  ];
}
