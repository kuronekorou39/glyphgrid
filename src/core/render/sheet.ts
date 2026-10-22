import type { IconDoc } from "../model.js";
import type { Style } from "../style.js";
import { fmt, renderSvg } from "./svg.js";

export interface SheetOptions {
  columns?: number;
  /** セル間の余白(px) */
  gap?: number;
  background?: string;
}

/** セット内のアイコンを格子状に並べた1枚の SVG(見比べ用) */
export function renderSheet(docs: IconDoc[], style: Style, opts: SheetOptions = {}): string {
  const columns = Math.max(1, opts.columns ?? Math.ceil(Math.sqrt(docs.length)));
  const gap = opts.gap ?? style.unit * 2;
  const cellW = Math.max(1, ...docs.map((d) => d.canvas.cols)) * style.unit;
  const cellH = Math.max(1, ...docs.map((d) => d.canvas.rows)) * style.unit;
  const rows = Math.max(1, Math.ceil(docs.length / columns));
  const width = gap + columns * (cellW + gap);
  const height = gap + rows * (cellH + gap);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}">`];
  const bg = opts.background ?? "#ffffff";
  if (bg !== "transparent") parts.push(`<rect width="${fmt(width)}" height="${fmt(height)}" fill="${bg}"/>`);
  docs.forEach((doc, i) => {
    const x = gap + (i % columns) * (cellW + gap);
    const y = gap + Math.floor(i / columns) * (cellH + gap);
    parts.push(renderSvg(doc, style).trimEnd().replace(/^<svg xmlns="[^"]*"/, `<svg x="${fmt(x)}" y="${fmt(y)}"`));
  });
  parts.push("</svg>");
  return parts.join("\n") + "\n";
}
