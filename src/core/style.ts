import { BOX_DEFAULTS, SIZED_SHAPES, isBox, type IconNode, type SizeToken, type SizedShape } from "./model.js";

// スタイル定義。unit 以外の数値はすべてグリッド単位。

export interface Style {
  /** 1グリッドあたりの px */
  unit: number;
  /** キャンバス外周の余白 */
  padding: number;
  stroke: { width: number; color: string; linecap: "round" | "butt" | "square" };
  /**
   * size トークンを使う形の外形サイズ。circle は直径、square は一辺、多角形は外接円の直径、マークは外接する正方形の一辺。
   * 多角形は同じ数値だと小さく見えるので、見た目の大きさがそろうように大きめにする
   */
  node: Record<SizedShape, Record<SizeToken, number>>;
  /** fill: core の中心の塗りの大きさ(外形サイズに対する比) */
  core: number;
  /** edgeCorner: 直角線の角丸、square: 四角の角丸、frame: 枠と表の角丸 */
  radius: { edgeCorner: number; square: number; frame: number };
  /** frame のタイトルバーの高さ(上端から区切り線まで)、フォルダのタブの高さと幅(枠の幅に対する比、上限 tabMax) */
  frame: { header: number; tab: number; tabRatio: number; tabMax: number };
  /** text の行の間隔。2行以上のとき最後の行は lastRatio の長さにする */
  text: { gap: number; lastRatio: number };
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
    check: { s: 1.2, m: 1.8, l: 2.6 },
    cross: { s: 1.0, m: 1.5, l: 2.2 },
    sparkle: { s: 1.5, m: 2.3, l: 3.2 },
    cursor: { s: 1.4, m: 2.0, l: 2.8 },
  },
  core: 0.4,
  radius: { edgeCorner: 0.75, square: 0.12, frame: 0.35 },
  frame: { header: 0.9, tab: 0.8, tabRatio: 0.4, tabMax: 4 },
  text: { gap: 0.8, lastRatio: 0.6 },
  dash: { dashed: [0.6, 0.55], dotted: [0, 0.6] },
  arrow: { size: 0.7, angle: 35, gap: 0.25 },
  background: "transparent",
};

/** 箱の形の幅と高さ。text の高さは行数から決まる(線幅ぶんを含む) */
export function boxSize(style: Style, node: Pick<IconNode, "shape" | "w" | "h" | "lines">): { w: number; h: number } {
  if (!isBox(node.shape)) return { w: 0, h: 0 };
  const d = BOX_DEFAULTS[node.shape];
  const w = node.w ?? d.w;
  if (node.shape === "text") return { w, h: ((node.lines ?? 1) - 1) * style.text.gap + style.stroke.width };
  return { w, h: node.h ?? d.h };
}

/** ノードの外形サイズ。箱の形は幅と高さの大きい方 */
export function nodeDiameter(style: Style, node: Pick<IconNode, "shape" | "size" | "w" | "h" | "lines">): number {
  if (isBox(node.shape)) {
    const b = boxSize(style, node);
    return Math.max(b.w, b.h);
  }
  return style.node[node.shape][node.size];
}

/** ノード中心から外接矩形の辺までの距離の大きい方(おおまかな判定用) */
export function nodeHalfExtent(style: Style, node: Pick<IconNode, "shape" | "size" | "w" | "h" | "lines">): number {
  return nodeDiameter(style, node) / 2;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const merge = <T extends object>(base: T, v: unknown): T => ({ ...base, ...(isObj(v) ? v : {}) }) as T;

/** 部分的な style.json を既定値で補って読む。旧形式の node.dot / node.ring は circle として扱う */
export function parseStyle(value: unknown): Style {
  if (!isObj(value)) throw new Error("style.json がオブジェクトではありません");
  const v = value;
  const node = isObj(v.node) ? { ...v.node } : {};
  if (!node.circle && isObj(node.dot)) node.circle = node.dot;
  const shapes = Object.fromEntries(SIZED_SHAPES.map((s) => [s, merge(DEFAULT_STYLE.node[s], node[s])])) as Style["node"];
  const merged: Style = {
    unit: (v.unit as number) ?? DEFAULT_STYLE.unit,
    padding: (v.padding as number) ?? DEFAULT_STYLE.padding,
    stroke: merge(DEFAULT_STYLE.stroke, v.stroke),
    node: shapes,
    core: (v.core as number) ?? DEFAULT_STYLE.core,
    radius: merge(DEFAULT_STYLE.radius, v.radius),
    frame: merge(DEFAULT_STYLE.frame, v.frame),
    text: merge(DEFAULT_STYLE.text, v.text),
    dash: merge(DEFAULT_STYLE.dash, v.dash),
    arrow: merge(DEFAULT_STYLE.arrow, v.arrow),
    background: (v.background as string) ?? DEFAULT_STYLE.background,
  };
  if (!(merged.unit > 0)) throw new Error("style.unit は正の数です");
  if (!(merged.stroke.width > 0)) throw new Error("style.stroke.width は正の数です");
  return merged;
}
