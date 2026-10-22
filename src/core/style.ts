import { NODE_SHAPES, type IconNode, type NodeShape, type SizeToken } from "./model.js";

// スタイル定義。unit 以外の数値はすべてグリッド単位。

export interface Style {
  /** 1グリッドあたりの px */
  unit: number;
  /** キャンバス外周の余白 */
  padding: number;
  stroke: { width: number; color: string; linecap: "round" | "butt" | "square" };
  /**
   * 形ごとの外形サイズ。circle は直径、square は一辺、それ以外は外接円の直径。
   * 多角形は同じ数値だと小さく見えるので、見た目の大きさがそろうように大きめにする
   */
  node: Record<NodeShape, Record<SizeToken, number>>;
  /** fill: core の中心の塗りの大きさ(外形サイズに対する比) */
  core: number;
  radius: { edgeCorner: number; square: number };
  /** 破線・点線の [線, 間隔]。点線は線 0 + 丸い線端で点になる */
  dash: { dashed: [number, number]; dotted: [number, number] };
  /** 矢印。size は矢じりの辺の長さ、angle は開き角の半分(度)、gap はノードとの隙間 */
  arrow: { size: number; angle: number; gap: number };
  background: string;
}

// 値は docs/reference.png に合わせて調整したもの
export const DEFAULT_STYLE: Style = {
  unit: 24,
  padding: 1,
  stroke: { width: 0.3, color: "#222222", linecap: "round" },
  node: {
    circle: { s: 1.3, m: 2.0, l: 2.8 },
    square: { s: 1.2, m: 1.8, l: 2.4 },
    diamond: { s: 1.7, m: 2.6, l: 3.4 },
    hexagon: { s: 1.5, m: 2.2, l: 3.0 },
    triangle: { s: 1.7, m: 2.5, l: 3.4 },
  },
  core: 0.4,
  radius: { edgeCorner: 0.75, square: 0.12 },
  dash: { dashed: [0.6, 0.55], dotted: [0, 0.6] },
  arrow: { size: 0.7, angle: 35, gap: 0.25 },
  background: "transparent",
};

/** ノードの外形サイズ */
export function nodeDiameter(style: Style, node: Pick<IconNode, "shape" | "size">): number {
  return style.node[node.shape][node.size];
}

/** ノード中心から外接矩形の辺までの距離(配置・はみ出し判定用) */
export function nodeHalfExtent(style: Style, node: Pick<IconNode, "shape" | "size">): number {
  return nodeDiameter(style, node) / 2;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 部分的な style.json を既定値で補って読む。旧形式の node.dot / node.ring は circle として扱う */
export function parseStyle(value: unknown): Style {
  if (!isObj(value)) throw new Error("style.json がオブジェクトではありません");
  const v = value;
  const node = isObj(v.node) ? { ...v.node } : {};
  if (!node.circle && isObj(node.dot)) node.circle = node.dot;
  const shapes = Object.fromEntries(
    NODE_SHAPES.map((s) => [s, { ...DEFAULT_STYLE.node[s], ...(isObj(node[s]) ? node[s] : {}) }]),
  ) as Style["node"];
  const merged: Style = {
    unit: (v.unit as number) ?? DEFAULT_STYLE.unit,
    padding: (v.padding as number) ?? DEFAULT_STYLE.padding,
    stroke: { ...DEFAULT_STYLE.stroke, ...(isObj(v.stroke) ? v.stroke : {}) } as Style["stroke"],
    node: shapes,
    core: (v.core as number) ?? DEFAULT_STYLE.core,
    radius: { ...DEFAULT_STYLE.radius, ...(isObj(v.radius) ? v.radius : {}) } as Style["radius"],
    dash: { ...DEFAULT_STYLE.dash, ...(isObj(v.dash) ? v.dash : {}) } as Style["dash"],
    arrow: { ...DEFAULT_STYLE.arrow, ...(isObj(v.arrow) ? v.arrow : {}) } as Style["arrow"],
    background: (v.background as string) ?? DEFAULT_STYLE.background,
  };
  if (!(merged.unit > 0)) throw new Error("style.unit は正の数です");
  if (!(merged.stroke.width > 0)) throw new Error("style.stroke.width は正の数です");
  return merged;
}
