import { edgePolyline, roundedPath, type PathCmd, type Point } from "../geometry.js";
import { findNode, type IconDoc, type IconNode } from "../model.js";
import { nodeDiameter, type Style } from "../style.js";

/** px 値を小数3桁まで、末尾の 0 を落として出力する */
export function fmt(v: number): string {
  const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function pathData(cmds: PathCmd[], unit: number): string {
  const px = (p: Point) => `${fmt(p.x * unit)} ${fmt(p.y * unit)}`;
  let out = "";
  let cur: Point | undefined;
  for (const cmd of cmds) {
    if (cmd.c === "L" && cur && Math.abs(cur.x - cmd.p.x) < 1e-9 && Math.abs(cur.y - cmd.p.y) < 1e-9) continue;
    if (cmd.c === "A") out += `A${fmt(cmd.r * unit)} ${fmt(cmd.r * unit)} 0 0 ${cmd.sweep} ${px(cmd.p)}`;
    else out += `${cmd.c}${px(cmd.p)}`;
    cur = cmd.p;
  }
  return out;
}

function renderNode(node: IconNode, style: Style): string {
  const u = style.unit;
  const w = style.stroke.width;
  const size = nodeDiameter(style, node);
  const cx = fmt(node.x * u);
  const cy = fmt(node.y * u);
  switch (node.kind) {
    case "dot":
      return `<circle cx="${cx}" cy="${cy}" r="${fmt((size / 2) * u)}" fill="${style.stroke.color}" stroke="none"/>`;
    case "ring":
      return `<circle cx="${cx}" cy="${cy}" r="${fmt(((size - w) / 2) * u)}"/>`;
    case "square": {
      const side = size - w;
      const rx = style.radius.square > 0 ? ` rx="${fmt(style.radius.square * u)}"` : "";
      return `<rect x="${fmt((node.x - side / 2) * u)}" y="${fmt((node.y - side / 2) * u)}" width="${fmt(side * u)}" height="${fmt(side * u)}"${rx}/>`;
    }
  }
}

/** エッジの path の d 属性(px)。描くものが無ければ空文字 */
export function edgePathData(doc: IconDoc, style: Style, edgeId: string): string {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return "";
  const from = findNode(doc, edge.from);
  const to = findNode(doc, edge.to);
  if (!from || !to) return "";
  const pts = edgePolyline(style, edge.route, from, to);
  return pathData(roundedPath(pts, style.radius.edgeCorner), style.unit);
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
  for (const edge of doc.edges) {
    const d = edgePathData(doc, style, edge.id);
    if (d) lines.push(`<path d="${d}"/>`);
  }
  for (const node of doc.nodes) lines.push(renderNode(node, style));
  lines.push("</g>", "</svg>");
  return lines.join("\n") + "\n";
}
