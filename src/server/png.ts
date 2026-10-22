// SVG 文字列を PNG にする(Node 専用。CLI と MCP サーバーで共有する)
import { Resvg } from "@resvg/resvg-js";

export function toPng(svg: string, scale = 1): Buffer {
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale } }).render().asPng();
}
