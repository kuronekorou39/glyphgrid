import { arrowAt, edgePolyline, roundedPath, type PathCmd, type Point } from "../geometry.js";
import { findNode, type IconDoc, type IconEdge, type IconNode } from "../model.js";
import { outline } from "../shape.js";
import { nodeDiameter, type Style } from "../style.js";

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

function renderNode(node: IconNode, style: Style): string {
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
  // 描画順はエッジが先、ノードが後
  for (const edge of doc.edges) lines.push(...renderEdge(doc, style, edge));
  for (const node of doc.nodes) lines.push(renderNode(node, style));
  lines.push("</g>", "</svg>");
  return lines.join("\n") + "\n";
}
