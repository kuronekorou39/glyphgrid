import type { IconNode, NodeShape } from "./model.js";
import { nodeDiameter, type Style } from "./style.js";

export interface Point {
  x: number;
  y: number;
}

/** ノードの外形。多角形の頂点は画面座標で時計回り */
export type Outline = { type: "circle"; c: Point; r: number } | { type: "poly"; pts: Point[] };

/** 正多角形の頂点数と、外接矩形を中央に置くための縦方向のずらし量(外接円半径に対する比) */
const POLYGONS: Partial<Record<NodeShape, { sides: number; shiftY: number }>> = {
  square: { sides: 4, shiftY: 0 },
  diamond: { sides: 4, shiftY: 0 },
  hexagon: { sides: 6, shiftY: 0 },
  // 頂点が上の正三角形は外接円の中心より上下に偏るので、外接矩形の中心をノード中心に合わせる
  triangle: { sides: 3, shiftY: 0.25 },
};

/**
 * 外形を inset だけ内側に寄せた形(負なら外側に広げる)。
 * 描画は線幅の半分だけ内側の線で描くので、inset = 線幅/2 が線の中心線になる
 */
export function outline(style: Style, node: Pick<IconNode, "shape" | "size" | "x" | "y">, inset = 0, scale = 1): Outline {
  const d = nodeDiameter(style, node) * scale;
  const c = { x: node.x, y: node.y };
  if (node.shape === "circle") return { type: "circle", c, r: Math.max(0, d / 2 - inset) };
  if (node.shape === "square") {
    const h = Math.max(0, d / 2 - inset);
    return { type: "poly", pts: [{ x: c.x - h, y: c.y - h }, { x: c.x + h, y: c.y - h }, { x: c.x + h, y: c.y + h }, { x: c.x - h, y: c.y + h }] };
  }
  const { sides, shiftY } = POLYGONS[node.shape]!;
  const R = d / 2;
  const apothem = R * Math.cos(Math.PI / sides);
  const r = R * Math.max(0, (apothem - inset) / apothem);
  // 内側に寄せても形の中心(外接円の中心)は動かさない
  const center = { x: c.x, y: c.y + R * shiftY };
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  });
  return { type: "poly", pts };
}

/** 点から外形までの符号付き距離(内側なら負) */
export function signedDistance(o: Outline, p: Point): number {
  if (o.type === "circle") return Math.hypot(p.x - o.c.x, p.y - o.c.y) - o.r;
  let inside = true;
  let min = Infinity;
  const n = o.pts.length;
  for (let i = 0; i < n; i++) {
    const a = o.pts[i]!;
    const b = o.pts[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // 時計回りの多角形では、内側の点は各辺の右手側(外積が正)にある
    if (ex * (p.y - a.y) - ey * (p.x - a.x) < 0) inside = false;
    const len2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2));
    min = Math.min(min, Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t)));
  }
  return inside ? -min : min;
}

/** 外形上の点を等間隔に近い形で n 個返す(lint の重なり判定用) */
export function boundaryPoints(o: Outline, n = 48): Point[] {
  if (o.type === "circle") {
    return Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return { x: o.c.x + o.r * Math.cos(a), y: o.c.y + o.r * Math.sin(a) };
    });
  }
  const per = Math.max(1, Math.ceil(n / o.pts.length));
  return o.pts.flatMap((a, i) => {
    const b = o.pts[(i + 1) % o.pts.length]!;
    return Array.from({ length: per }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / per, y: a.y + ((b.y - a.y) * k) / per }));
  });
}

/** ノードの実際の外形の外接矩形(多角形は頂点から求めるので、三角形や六角形で余白を取りすぎない) */
export function nodeBounds(style: Style, node: Pick<IconNode, "shape" | "size" | "x" | "y">) {
  const o = outline(style, node);
  if (o.type === "circle") return { minX: o.c.x - o.r, minY: o.c.y - o.r, maxX: o.c.x + o.r, maxY: o.c.y + o.r };
  const xs = o.pts.map((p) => p.x);
  const ys = o.pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
