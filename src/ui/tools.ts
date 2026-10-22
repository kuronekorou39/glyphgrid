import { NODE_SHAPES, renderSvg, type EdgeArrow, type EdgeDash, type NodeFill, type NodeShape, type Style } from "../core/index.js";

export type Tool = "select" | "connect" | "node";

/** 新しく置くノードの見た目 */
export interface NodeLook {
  shape: NodeShape;
  fill: NodeFill;
}

/** 新しく引くエッジの見た目(route は短縮形) */
export interface EdgeLook {
  route: string;
  dash: EdgeDash;
  arrow: EdgeArrow;
}

export const SHAPE_LABELS: Record<NodeShape, string> = {
  circle: "円",
  square: "四角",
  diamond: "ひし形",
  hexagon: "六角形",
  triangle: "三角形",
};

export const FILL_LABELS: Record<NodeFill, string> = {
  solid: "塗り",
  outline: "白抜き",
  core: "中心点",
};

/** 形ツールのショートカット(1〜5) */
export const SHAPE_KEYS: Record<string, NodeShape> = Object.fromEntries(NODE_SHAPES.map((s, i) => [String(i + 1), s]));

export const ROUTES: { value: string; label: string }[] = [
  { value: "straight", label: "直線" },
  { value: "hv", label: "直角 横→縦" },
  { value: "vh", label: "直角 縦→横" },
  { value: "hvh", label: "直角 横→縦→横" },
  { value: "vhv", label: "直角 縦→横→縦" },
  { value: "hdh", label: "斜め 横→斜→横" },
  { value: "vdv", label: "斜め 縦→斜→縦" },
];

export const DASH_LABELS: Record<EdgeDash, string> = { solid: "実線", dashed: "破線", dotted: "点線" };
export const ARROW_LABELS: Record<EdgeArrow, string> = { none: "矢印なし", end: "終点に矢印", start: "始点に矢印", both: "両端に矢印" };

/** ツールバー用の小さなアイコン。実際の描画関数で作るので、見た目が書き出しと一致する */
export function lookIcon(look: NodeLook, style: Style): string {
  const max = Math.max(...Object.values(style.node).map((s) => s.m));
  const side = Math.ceil(max + 0.5);
  return renderSvg(
    {
      version: 2,
      name: "icon",
      canvas: { cols: side, rows: side },
      nodes: [{ id: "a", ...look, x: side / 2, y: side / 2, size: "m" }],
      edges: [],
    },
    { ...style, background: "transparent" },
  );
}
