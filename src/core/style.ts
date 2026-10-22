import type { IconNode, NodeKind, SizeToken } from "./model.js";

// スタイル定義。unit 以外の数値はすべてグリッド単位。

export interface Style {
  /** 1グリッドあたりの px */
  unit: number;
  /** キャンバス外周の余白 */
  padding: number;
  stroke: { width: number; color: string; linecap: "round" | "butt" | "square" };
  /** dot: 直径、ring: 外径、square: 一辺 */
  node: Record<NodeKind, Record<SizeToken, number>>;
  radius: { edgeCorner: number; square: number };
  background: string;
}

// 値は docs/reference.png に合わせて調整したもの
export const DEFAULT_STYLE: Style = {
  unit: 24,
  padding: 1,
  stroke: { width: 0.3, color: "#222222", linecap: "round" },
  node: {
    dot: { s: 1.3, m: 2.0, l: 2.8 },
    ring: { s: 1.3, m: 1.9, l: 2.6 },
    square: { s: 1.2, m: 1.8, l: 2.4 },
  },
  radius: { edgeCorner: 0.75, square: 0.12 },
  background: "transparent",
};

/** ノードの外形サイズ(直径 or 一辺) */
export function nodeDiameter(style: Style, node: Pick<IconNode, "kind" | "size">): number {
  return style.node[node.kind][node.size];
}

/** ノード中心から外形までの距離(円は半径、四角は一辺の半分) */
export function nodeHalfExtent(style: Style, node: Pick<IconNode, "kind" | "size">): number {
  return nodeDiameter(style, node) / 2;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 部分的な style.json を既定値で補って読む */
export function parseStyle(value: unknown): Style {
  if (!isObj(value)) throw new Error("style.json がオブジェクトではありません");
  const v = value;
  const node = isObj(v.node) ? v.node : {};
  const merged: Style = {
    unit: (v.unit as number) ?? DEFAULT_STYLE.unit,
    padding: (v.padding as number) ?? DEFAULT_STYLE.padding,
    stroke: { ...DEFAULT_STYLE.stroke, ...(isObj(v.stroke) ? v.stroke : {}) } as Style["stroke"],
    node: {
      dot: { ...DEFAULT_STYLE.node.dot, ...(isObj(node.dot) ? node.dot : {}) },
      ring: { ...DEFAULT_STYLE.node.ring, ...(isObj(node.ring) ? node.ring : {}) },
      square: { ...DEFAULT_STYLE.node.square, ...(isObj(node.square) ? node.square : {}) },
    } as Style["node"],
    radius: { ...DEFAULT_STYLE.radius, ...(isObj(v.radius) ? v.radius : {}) } as Style["radius"],
    background: (v.background as string) ?? DEFAULT_STYLE.background,
  };
  if (!(merged.unit > 0)) throw new Error("style.unit は正の数です");
  if (!(merged.stroke.width > 0)) throw new Error("style.stroke.width は正の数です");
  return merged;
}
