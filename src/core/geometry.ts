import { EPS, type IconNode, type Route } from "./model.js";
import { nodeHalfExtent, type Style } from "./style.js";

export interface Point {
  x: number;
  y: number;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** 3点が一直線上で、かつ折り返していない */
function collinearForward(a: Point, b: Point, c: Point): boolean {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
  return Math.abs(cross) < EPS && dot > 0;
}

/** 長さ0の区間と、まっすぐ続く中間点を取り除く */
export function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) if (!dedup.length || !same(dedup[dedup.length - 1]!, p)) dedup.push(p);
  const out: Point[] = [];
  for (const p of dedup) {
    while (out.length >= 2 && collinearForward(out[out.length - 2]!, out[out.length - 1]!, p)) out.pop();
    out.push(p);
  }
  return out;
}

/** ortho の mid の既定値(始点と終点の中間) */
export function defaultMid(route: Route, a: Point, b: Point): number | undefined {
  if (route.type === "straight") return undefined;
  const horizontalFirst = route.bend === "hvh" || route.bend === "hdh";
  if (route.bend === "hv" || route.bend === "vh") return undefined;
  return horizontalFirst ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
}

/** ノード中心どうしを結ぶ折れ線(切断・角丸の前) */
export function routePoints(route: Route, a: Point, b: Point): Point[] {
  switch (route.type) {
    case "straight":
      return simplify([a, b]);
    case "ortho": {
      const mid = route.mid ?? defaultMid(route, a, b)!;
      switch (route.bend) {
        case "hv":
          return simplify([a, { x: b.x, y: a.y }, b]);
        case "vh":
          return simplify([a, { x: a.x, y: b.y }, b]);
        case "hvh":
          return simplify([a, { x: mid, y: a.y }, { x: mid, y: b.y }, b]);
        case "vhv":
          return simplify([a, { x: a.x, y: mid }, { x: b.x, y: mid }, b]);
      }
      break;
    }
    case "slant": {
      const mid = route.mid ?? defaultMid(route, a, b)!;
      const span = route.span ?? 1;
      if (route.bend === "hdh") {
        const half = (Math.sign(b.x - a.x) * span) / 2;
        return simplify([a, { x: mid - half, y: a.y }, { x: mid + half, y: b.y }, b]);
      }
      const half = (Math.sign(b.y - a.y) * span) / 2;
      return simplify([a, { x: a.x, y: mid - half }, { x: b.x, y: mid + half }, b]);
    }
  }
}

/**
 * エッジを切る位置となる外形。線幅の中心線で切るので、丸い線端がちょうど
 * 白抜き丸・四角の線の内側の縁で止まり、内部に線が入らない。
 */
export function insideTest(style: Style, node: IconNode): (p: Point) => boolean {
  const r = nodeHalfExtent(style, node) - style.stroke.width / 2;
  if (node.kind === "square") {
    return (p) => Math.abs(p.x - node.x) < r - EPS && Math.abs(p.y - node.y) < r - EPS;
  }
  return (p) => Math.hypot(p.x - node.x, p.y - node.y) < r - EPS;
}

/** inside(a) かつ !inside(b) の区間で、外形との交点を二分探索で求める */
function crossing(a: Point, b: Point, inside: (p: Point) => boolean): Point {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const t = (lo + hi) / 2;
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) lo = t;
    else hi = t;
  }
  return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
}

/** 折れ線の先頭側をノードの外形で切る。全体が内側なら空配列 */
function trimStart(points: Point[], inside: (p: Point) => boolean): Point[] {
  let i = 0;
  while (i < points.length && inside(points[i]!)) i++;
  if (i === points.length) return [];
  if (i === 0) return points;
  return [crossing(points[i - 1]!, points[i]!, inside), ...points.slice(i)];
}

/** ノード外形で両端を切った折れ線 */
export function edgePolyline(style: Style, route: Route, from: IconNode, to: IconNode): Point[] {
  let pts = routePoints(route, from, to);
  pts = trimStart(pts, insideTest(style, from));
  pts = trimStart(pts.reverse(), insideTest(style, to)).reverse();
  return pts.length >= 2 && dist(pts[0]!, pts[pts.length - 1]!) > EPS ? pts : [];
}

export type PathCmd =
  | { c: "M" | "L"; p: Point }
  | { c: "A"; r: number; sweep: 0 | 1; p: Point };

/** 折れ点を半径 radius の円弧で丸めたパスコマンド列 */
export function roundedPath(points: Point[], radius: number): PathCmd[] {
  if (points.length < 2) return [];
  const cmds: PathCmd[] = [{ c: "M", p: points[0]! }];
  const n = points.length;
  for (let i = 1; i < n - 1; i++) {
    const prev = points[i - 1]!;
    const p = points[i]!;
    const next = points[i + 1]!;
    const lenIn = dist(prev, p);
    const lenOut = dist(p, next);
    const u = { x: (p.x - prev.x) / lenIn, y: (p.y - prev.y) / lenIn };
    const v = { x: (next.x - p.x) / lenOut, y: (next.y - p.y) / lenOut };
    const turn = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    const tanHalf = Math.tan(turn / 2);
    if (radius <= 0 || turn < 1e-3 || !Number.isFinite(tanHalf)) {
      cmds.push({ c: "L", p });
      continue;
    }
    // 隣の折れ点と区間を分け合うので、中間の区間は半分まで
    const availIn = i - 1 === 0 ? lenIn : lenIn / 2;
    const availOut = i + 1 === n - 1 ? lenOut : lenOut / 2;
    const d = Math.min(radius * tanHalf, availIn, availOut);
    const r = d / tanHalf;
    const cross = u.x * v.y - u.y * v.x;
    cmds.push({ c: "L", p: { x: p.x - u.x * d, y: p.y - u.y * d } });
    cmds.push({ c: "A", r, sweep: cross > 0 ? 1 : 0, p: { x: p.x + v.x * d, y: p.y + v.y * d } });
  }
  cmds.push({ c: "L", p: points[n - 1]! });
  return cmds;
}
