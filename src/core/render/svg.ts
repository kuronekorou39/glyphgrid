import { arrowAt, edgePolyline, roundedPath, type PathCmd, type Point } from "../geometry.js";
import { MARK_SHAPES, findNode, isBox, type IconDoc, type IconEdge, type IconNode } from "../model.js";
import { outline } from "../shape.js";
import { boxSize, nodeDiameter, type Style } from "../style.js";

const MARK_SET = new Set<string>(MARK_SHAPES);

/** px 値を小数3桁まで、末尾の 0 を落として出力する */
export function fmt(v: number): string {
  const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

const px = (p: Point, unit: number) => `${fmt(p.x * unit)} ${fmt(p.y * unit)}`;

function pathData(cmds: PathCmd[], unit: number): string {
  let out = "";
  let cur: Point | undefined;
  for (const cmd of cmds) {
    if (cmd.c === "L" && cur && Math.abs(cur.x - cmd.p.x) < 1e-9 && Math.abs(cur.y - cmd.p.y) < 1e-9) continue;
    if (cmd.c === "A") out += `A${fmt(cmd.r * unit)} ${fmt(cmd.r * unit)} 0 0 ${cmd.sweep} ${px(cmd.p, unit)}`;
    else out += `${cmd.c}${px(cmd.p, unit)}`;
    cur = cmd.p;
  }
  return out;
}

/**
 * ノード1つ分の要素。線は親の <g> の stroke を使う。
 * 塗りの多角形も線幅の半分だけ内側に描いて線を重ねるので、外形サイズがそろい、角も白抜きと同じく丸くなる。
 */
function shapeElement(node: IconNode, style: Style, filled: boolean, scale = 1): string {
  const u = style.unit;
  const w = style.stroke.width;
  const fill = filled ? ` fill="${style.stroke.color}"` : "";
  const size = nodeDiameter(style, node) * scale;
  switch (node.shape) {
    case "circle":
      return filled
        ? `<circle cx="${fmt(node.x * u)}" cy="${fmt(node.y * u)}" r="${fmt((size / 2) * u)}"${fill} stroke="none"/>`
        : `<circle cx="${fmt(node.x * u)}" cy="${fmt(node.y * u)}" r="${fmt(((size - w) / 2) * u)}"/>`;
    case "square": {
      const side = size - w;
      const rx = style.radius.square > 0 ? ` rx="${fmt(style.radius.square * u)}"` : "";
      return `<rect x="${fmt((node.x - side / 2) * u)}" y="${fmt((node.y - side / 2) * u)}" width="${fmt(side * u)}" height="${fmt(side * u)}"${rx}${fill}/>`;
    }
    default: {
      const o = outline(style, node, w / 2, scale);
      if (o.type !== "poly") return "";
      return `<path d="M${o.pts.map((p) => px(p, u)).join("L")}Z"${fill}/>`;
    }
  }
}

/** マークの形。[-1, 1] の正方形に収めた座標で持ち、描くときに大きさを掛ける */
const MARK_PATHS: Record<"check" | "cross", Point[][]> = {
  check: [[{ x: -0.78, y: 0.02 }, { x: -0.26, y: 0.54 }, { x: 0.78, y: -0.52 }]],
  cross: [
    [{ x: -0.62, y: -0.62 }, { x: 0.62, y: 0.62 }],
    [{ x: 0.62, y: -0.62 }, { x: -0.62, y: 0.62 }],
  ],
};

/** マウスカーソル(矢印ポインタ)の輪郭。先端が左上 */
const CURSOR: Point[] = [
  { x: -0.62, y: -0.95 },
  { x: -0.62, y: 0.68 },
  { x: -0.17, y: 0.28 },
  { x: 0.13, y: 0.95 },
  { x: 0.42, y: 0.83 },
  { x: 0.12, y: 0.18 },
  { x: 0.62, y: 0.18 },
];

/** 4方向に尖ったきらめき(AI の記号)。内側の頂点は外側の SPARKLE_INNER 倍 */
const SPARKLE_INNER = 0.3;
const SPARKLE: Point[] = Array.from({ length: 8 }, (_, i) => {
  const a = -Math.PI / 2 + (Math.PI / 4) * i;
  const r = i % 2 === 0 ? 1 : SPARKLE_INNER;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
});

function markElement(node: IconNode, style: Style): string {
  const u = style.unit;
  // 線幅ぶん内側に収めて、外形サイズを他の形とそろえる
  const s = Math.max(0, nodeDiameter(style, node) / 2 - style.stroke.width / 2);
  const at = (p: Point) => ({ x: node.x + p.x * s, y: node.y + p.y * s });
  if (node.shape === "check" || node.shape === "cross") {
    return `<path d="${MARK_PATHS[node.shape].map((line) => `M${line.map((p) => px(at(p), u)).join("L")}`).join("")}"/>`;
  }
  const pts = node.shape === "cursor" ? CURSOR : SPARKLE;
  const fill = node.fill === "solid" ? ` fill="${style.stroke.color}"` : "";
  return `<path d="M${pts.map((p) => px(at(p), u)).join("L")}Z"${fill}/>`;
}

/** フォルダの輪郭(左上にタブ)。角は枠と同じ半径で丸める */
function folderPath(left: number, top: number, right: number, bottom: number, r: number, style: Style): string {
  const f = style.frame;
  const tabH = Math.min(f.tab, (bottom - top) / 3);
  const tabW = Math.min((right - left) * f.tabRatio, f.tabMax);
  const body = top + tabH;
  const midX = (left + right) / 2;
  // 辺の途中から始めて同じ点で終えると、roundedPath で全部の角を丸めた閉じた形になる
  const pts = [
    { x: midX, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
    { x: left + tabW, y: top },
    { x: left + tabW + tabH, y: body },
    { x: right, y: body },
    { x: right, y: bottom },
    { x: midX, y: bottom },
  ];
  return pathData(roundedPath(pts, r), style.unit) + "Z";
}

/** frame / table / text。線の中心が外形から線幅の半分だけ内側にくるように描く */
function boxElement(node: IconNode, style: Style): string {
  const u = style.unit;
  const w = style.stroke.width;
  const b = boxSize(style, node);
  const left = node.x - b.w / 2 + w / 2;
  const right = node.x + b.w / 2 - w / 2;
  const top = node.y - b.h / 2 + w / 2;
  const bottom = node.y + b.h / 2 - w / 2;
  const line = (x1: number, y1: number, x2: number, y2: number) => `M${px({ x: x1, y: y1 }, u)}L${px({ x: x2, y: y2 }, u)}`;

  if (node.shape === "text") {
    const n = node.lines ?? 1;
    const d = Array.from({ length: n }, (_, i) => {
      const y = node.y - ((n - 1) * style.text.gap) / 2 + i * style.text.gap;
      const end = n > 1 && i === n - 1 ? left + (right - left) * style.text.lastRatio : right;
      return line(left, y, end, y);
    });
    return `<path d="${d.join("")}"/>`;
  }

  const r = Math.min(style.radius.frame, (right - left) / 2, (bottom - top) / 2);
  const solid = node.shape === "frame" && node.fill === "solid";
  const fillAttr = solid ? ` fill="${style.stroke.color}"` : "";
  const out = [
    node.shape === "frame" && node.tab
      ? `<path d="${folderPath(left, top, right, bottom, r, style)}"${fillAttr}/>`
      : `<rect x="${fmt(left * u)}" y="${fmt(top * u)}" width="${fmt((right - left) * u)}" height="${fmt((bottom - top) * u)}"${r > 0 ? ` rx="${fmt(r * u)}"` : ""}${fillAttr}/>`,
  ];
  if (node.shape === "frame") {
    if (node.header && !solid) {
      const y = node.y - b.h / 2 + style.frame.header + (node.tab ? style.frame.tab : 0);
      out.push(`<path d="${line(left, y, right, y)}"/>`);
    }
    return out.join("\n");
  }

  // table:列と行の区切り線。header なら1行目を塗る
  const cols = node.cols ?? 1;
  const rows = node.rows ?? 1;
  const cw = (right - left) / cols;
  const rh = (bottom - top) / rows;
  if (node.header) {
    const hb = top + rh;
    const k = 0.5523 * r; // 円弧を3次ベジェで近似する係数
    const d =
      `M${px({ x: left, y: hb }, u)}L${px({ x: left, y: top + r }, u)}` +
      `C${px({ x: left, y: top + r - k }, u)} ${px({ x: left + r - k, y: top }, u)} ${px({ x: left + r, y: top }, u)}` +
      `L${px({ x: right - r, y: top }, u)}` +
      `C${px({ x: right - r + k, y: top }, u)} ${px({ x: right, y: top + r - k }, u)} ${px({ x: right, y: top + r }, u)}` +
      `L${px({ x: right, y: hb }, u)}Z`;
    out.push(`<path d="${d}" fill="${style.stroke.color}"/>`);
  }
  const d: string[] = [];
  for (let i = 1; i < cols; i++) d.push(line(left + cw * i, top, left + cw * i, bottom));
  for (let j = 1; j < rows; j++) d.push(line(left, top + rh * j, right, top + rh * j));
  if (d.length) out.push(`<path d="${d.join("")}"/>`);
  return out.join("\n");
}

function renderNode(node: IconNode, style: Style): string {
  if (isBox(node.shape)) return boxElement(node, style);
  if (MARK_SET.has(node.shape)) return markElement(node, style);
  if (node.fill === "solid") return shapeElement(node, style, true);
  const ring = shapeElement(node, style, false);
  return node.fill === "core" ? ring + "\n" + shapeElement(node, style, true, style.core) : ring;
}

function edgePoints(doc: IconDoc, style: Style, edge: IconEdge): Point[] {
  const from = findNode(doc, edge.from);
  const to = findNode(doc, edge.to);
  if (!from || !to) return [];
  return edgePolyline(style, edge.route, from, to, edge.arrow);
}

/** エッジの線の path の d 属性(px)。描くものが無ければ空文字 */
export function edgePathData(doc: IconDoc, style: Style, edgeId: string): string {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return "";
  return pathData(roundedPath(edgePoints(doc, style, edge), style.radius.edgeCorner), style.unit);
}

/** 矢じり(先端 tip、線の向き from→tip)の d 属性 */
function arrowHead(from: Point, tip: Point, style: Style): string {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y);
  if (len < 1e-9) return "";
  const ux = (tip.x - from.x) / len;
  const uy = (tip.y - from.y) / len;
  const a = (style.arrow.angle * Math.PI) / 180;
  const s = style.arrow.size;
  const wing = (sign: number) => ({
    x: tip.x - s * (ux * Math.cos(a) - sign * uy * Math.sin(a)),
    y: tip.y - s * (uy * Math.cos(a) + sign * ux * Math.sin(a)),
  });
  return `M${px(wing(1), style.unit)}L${px(tip, style.unit)}L${px(wing(-1), style.unit)}`;
}

function renderEdge(doc: IconDoc, style: Style, edge: IconEdge): string[] {
  const pts = edgePoints(doc, style, edge);
  if (pts.length < 2) return [];
  const u = style.unit;
  const d = pathData(roundedPath(pts, style.radius.edgeCorner), u);
  const dash = edge.dash ? ` stroke-dasharray="${style.dash[edge.dash].map((v) => fmt(v * u)).join(" ")}"` : "";
  const out = [`<path d="${d}"${dash}/>`];
  const heads: string[] = [];
  if (arrowAt(edge, "end")) heads.push(arrowHead(pts[pts.length - 2]!, pts[pts.length - 1]!, style));
  if (arrowAt(edge, "start")) heads.push(arrowHead(pts[1]!, pts[0]!, style));
  if (heads.length) out.push(`<path d="${heads.join("")}"/>`);
  return out;
}

export function renderSvg(doc: IconDoc, style: Style): string {
  const u = style.unit;
  const width = fmt(doc.canvas.cols * u);
  const height = fmt(doc.canvas.rows * u);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ];
  if (style.background && style.background !== "transparent") {
    lines.push(`<rect width="${width}" height="${height}" fill="${style.background}"/>`);
  }
  lines.push(
    `<g fill="none" stroke="${style.stroke.color}" stroke-width="${fmt(style.stroke.width * u)}" stroke-linecap="${style.stroke.linecap}" stroke-linejoin="round">`,
  );
  // 描画順:箱(枠・表・テキスト行)→ エッジ → それ以外のノード。枠の中に置いたものが枠に隠れないようにする
  for (const node of doc.nodes) if (isBox(node.shape)) lines.push(renderNode(node, style));
  for (const edge of doc.edges) lines.push(...renderEdge(doc, style, edge));
  for (const node of doc.nodes) if (!isBox(node.shape)) lines.push(renderNode(node, style));
  lines.push("</g>", "</svg>");
  return lines.join("\n") + "\n";
}
