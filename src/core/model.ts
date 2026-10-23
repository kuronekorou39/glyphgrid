// アイコンのデータモデル。座標はすべてグリッド単位。

/** 基本の形。size トークンで大きさが決まる */
/** 基本の形。size トークンで大きさが決まる。point は描かれない点で、線だけの模様の端や中継点に使う */
export const BASIC_SHAPES = ["circle", "square", "diamond", "hexagon", "triangle", "point"] as const;
/** 記号マーク。size トークンで大きさが決まる。check / cross は線だけで描き、fill は使わない */
export const MARK_SHAPES = ["check", "cross", "sparkle", "cursor"] as const;
/**
 * 箱の形。大きさは w / h(グリッド単位)で決まり、size は使わない。
 * frame: 角丸の枠(header でタイトルバー)。中に他の要素を入れられる(画面、Case など)
 * table: 行と列の格子(header で見出し行を塗る)
 * text: 文字の代わりの横棒を lines 本並べる(高さは行数で決まり h は使わない)
 */
export const BOX_SHAPES = ["frame", "table", "text"] as const;
export const SIZED_SHAPES = [...BASIC_SHAPES, ...MARK_SHAPES] as const;
export const NODE_SHAPES = [...SIZED_SHAPES, ...BOX_SHAPES] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];
export type SizedShape = (typeof SIZED_SHAPES)[number];
export type BoxShape = (typeof BOX_SHAPES)[number];

export const isBox = (shape: NodeShape): shape is BoxShape => (BOX_SHAPES as readonly string[]).includes(shape);
/** 中に他の要素を入れられる形 */
export const isContainer = (shape: NodeShape) => shape === "frame" || shape === "table";
/** 中に他の要素を入れられるノード。w で直径を決めた circle(レンズなど)も入れ物になる */
export const isContainerNode = (node: Pick<IconNode, "shape" | "w">) => isContainer(node.shape) || (node.shape === "circle" && node.w !== undefined);

/** 箱の形を w / h なしで追加したときの既定値 */
export const BOX_DEFAULTS: Record<BoxShape, { w: number; h: number; cols?: number; rows?: number; lines?: number }> = {
  frame: { w: 4, h: 3 },
  table: { w: 4, h: 3, cols: 2, rows: 3 },
  text: { w: 3, h: 0, lines: 1 },
};

/** solid: 塗り、outline: 白抜き、core: 白抜き + 中心に同じ形の小さな塗り */
export const NODE_FILLS = ["solid", "outline", "core"] as const;
export type NodeFill = (typeof NODE_FILLS)[number];

export const SIZE_TOKENS = ["s", "m", "l"] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

/** 旧形式(version 1)の kind。入力では shape + fill の別名として受け付ける */
export const LEGACY_KINDS: Record<string, { shape: NodeShape; fill: NodeFill }> = {
  dot: { shape: "circle", fill: "solid" },
  ring: { shape: "circle", fill: "outline" },
  square: { shape: "square", fill: "outline" },
};

export interface IconNode {
  id: string;
  shape: NodeShape;
  fill: NodeFill;
  x: number;
  y: number;
  size: SizeToken;
  /** 箱の形(frame / table / text)の幅と高さ。x, y は中心 */
  w?: number;
  h?: number;
  /** table の列数と行数 */
  cols?: number;
  rows?: number;
  /** frame はタイトルバー、table は見出し行の塗り */
  header?: boolean;
  /** frame をフォルダの形(左上にタブ)にする。Case や入れ物を、中の画面と見分けるために使う */
  tab?: boolean;
  /**
   * 枠や表の線の上に重ねて置く(バッジ)。重なった部分の枠の線は切り抜き、lint の重なりにもしない。
   * ウィンドウの角に AI の記号を添える、などに使う
   */
  badge?: boolean;
  /** text の行数 */
  lines?: number;
}

export type OrthoBend = "hv" | "vh" | "hvh" | "vhv";
export type SlantBend = "hdh" | "vdv";

export type Route =
  | { type: "straight" }
  // hvh: mid は垂直幹の x 座標。vhv: mid は水平幹の y 座標。
  // 同じ始点から出て同じ mid を持つエッジは幹を共有する(分岐の表現)
  | { type: "ortho"; bend: OrthoBend; mid?: number }
  // hdh: 水平→斜め→水平。斜め区間の中心 x が mid、横幅が span(既定 1)
  // vdv: 垂直→斜め→垂直。斜め区間の中心 y が mid、縦幅が span
  | { type: "slant"; bend: SlantBend; mid?: number; span?: number };

/** 省略時は実線 */
export const EDGE_DASHES = ["solid", "dashed", "dotted"] as const;
export type EdgeDash = (typeof EDGE_DASHES)[number];

/** 省略時は矢印なし */
export const EDGE_ARROWS = ["none", "end", "start", "both"] as const;
export type EdgeArrow = (typeof EDGE_ARROWS)[number];

export interface IconEdge {
  id: string;
  from: string;
  to: string;
  route: Route;
  dash?: Exclude<EdgeDash, "solid">;
  arrow?: Exclude<EdgeArrow, "none">;
}

export const DOC_VERSION = 2;

export interface IconDoc {
  version: typeof DOC_VERSION;
  name: string;
  canvas: { cols: number; rows: number };
  nodes: IconNode[];
  edges: IconEdge[];
}

export const DEFAULT_CANVAS = { cols: 12, rows: 12 } as const;
export const DEFAULT_SIZE: SizeToken = "m";
export const DEFAULT_FILL: NodeFill = "outline";
export const STRAIGHT: Route = { type: "straight" };

/** 0.5 刻みのグリッド座標を扱うため、比較はこの誤差で行う */
export const EPS = 1e-6;

export function emptyDoc(name: string, canvas: IconDoc["canvas"] = DEFAULT_CANVAS): IconDoc {
  return { version: DOC_VERSION, name, canvas: { ...canvas }, nodes: [], edges: [] };
}

export function findNode(doc: IconDoc, id: string): IconNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

export function requireNode(doc: IconDoc, id: string): IconNode {
  const node = findNode(doc, id);
  if (!node) throw new Error(`ノード "${id}" が見つかりません`);
  return node;
}

export function requireEdge(doc: IconDoc, id: string): IconEdge {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) throw new Error(`エッジ "${id}" が見つかりません`);
  return edge;
}

/** prefix + 連番で、既存と重ならない id を返す */
export function nextId(existing: Iterable<string>, prefix: string): string {
  const used = new Set(existing);
  let max = 0;
  for (const id of used) {
    const m = id.startsWith(prefix) ? /^\d+$/.exec(id.slice(prefix.length)) : null;
    if (m) max = Math.max(max, Number(m[0]));
  }
  return `${prefix}${max + 1}`;
}

export function allIds(doc: IconDoc): string[] {
  return [...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id)];
}

// ---- 検証 ----

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateRoute(route: unknown): string | null {
  if (!route || typeof route !== "object") return "route がオブジェクトではありません";
  const r = route as Record<string, unknown>;
  switch (r.type) {
    case "straight":
      return null;
    case "ortho":
      if (!["hv", "vh", "hvh", "vhv"].includes(r.bend as string)) return `ortho の bend が不正です: ${String(r.bend)}`;
      if (r.mid !== undefined && !isNum(r.mid)) return "ortho の mid は数値です";
      return null;
    case "slant":
      if (!["hdh", "vdv"].includes(r.bend as string)) return `slant の bend が不正です: ${String(r.bend)}`;
      if (r.mid !== undefined && !isNum(r.mid)) return "slant の mid は数値です";
      if (r.span !== undefined && !(isNum(r.span) && r.span >= 0)) return "slant の span は 0 以上の数値です";
      return null;
    default:
      return `route.type が不正です: ${String(r.type)}`;
  }
}

/** version 1(kind を持つノード)を現在の形式に変換する。それ以外はそのまま返す */
export function migrate(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const d = value as Record<string, unknown>;
  if (d.version !== 1 || !Array.isArray(d.nodes)) return value;
  return {
    ...d,
    version: DOC_VERSION,
    nodes: d.nodes.map((n: Record<string, unknown>) => {
      const legacy = typeof n.kind === "string" ? LEGACY_KINDS[n.kind] : undefined;
      if (!legacy) return n;
      const { kind: _kind, ...rest } = n;
      return { id: rest.id, ...legacy, ...rest };
    }),
  };
}

/** 構造の検証。参照切れ(dangling)は lint の担当なのでここでは見ない */
export function validateDoc(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["ドキュメントがオブジェクトではありません"];
  const d = value as Record<string, unknown>;
  if (d.version !== DOC_VERSION) errors.push(`version は ${DOC_VERSION} です`);
  if (typeof d.name !== "string") errors.push("name は文字列です");
  const c = d.canvas as Record<string, unknown> | undefined;
  if (!c || !isNum(c.cols) || !isNum(c.rows) || c.cols <= 0 || c.rows <= 0) errors.push("canvas は { cols, rows } の正の数です");
  if (!Array.isArray(d.nodes)) errors.push("nodes は配列です");
  if (!Array.isArray(d.edges)) errors.push("edges は配列です");
  if (errors.length) return errors;

  const ids = new Set<string>();
  const checkId = (id: unknown, where: string) => {
    if (typeof id !== "string" || id === "") errors.push(`${where}: id は空でない文字列です`);
    else if (ids.has(id)) errors.push(`${where}: id "${id}" が重複しています`);
    else ids.add(id);
  };
  (d.nodes as unknown[]).forEach((n, i) => {
    const node = n as Record<string, unknown>;
    const where = `nodes[${i}]`;
    checkId(node.id, where);
    if (!NODE_SHAPES.includes(node.shape as NodeShape)) errors.push(`${where}: shape が不正です: ${String(node.shape)}`);
    if (!NODE_FILLS.includes(node.fill as NodeFill)) errors.push(`${where}: fill が不正です: ${String(node.fill)}`);
    if (!SIZE_TOKENS.includes(node.size as SizeToken)) errors.push(`${where}: size が不正です: ${String(node.size)}`);
    if (!isNum(node.x) || !isNum(node.y)) errors.push(`${where}: x, y は数値です`);
    for (const k of ["w", "h"] as const) if (node[k] !== undefined && !(isNum(node[k]) && node[k] > 0)) errors.push(`${where}: ${k} は正の数です`);
    for (const k of ["cols", "rows", "lines"] as const)
      if (node[k] !== undefined && !(Number.isInteger(node[k]) && (node[k] as number) >= 1)) errors.push(`${where}: ${k} は 1 以上の整数です`);
    if (node.header !== undefined && typeof node.header !== "boolean") errors.push(`${where}: header は true / false です`);
    if (node.tab !== undefined && typeof node.tab !== "boolean") errors.push(`${where}: tab は true / false です`);
    if (node.badge !== undefined && typeof node.badge !== "boolean") errors.push(`${where}: badge は true / false です`);
    if (isBox(node.shape as NodeShape) && (node.w === undefined || (node.shape !== "text" && node.h === undefined)))
      errors.push(`${where}: ${String(node.shape)} には w${node.shape === "text" ? "" : " と h"} が必要です`);
  });
  (d.edges as unknown[]).forEach((e, i) => {
    const edge = e as Record<string, unknown>;
    const where = `edges[${i}]`;
    checkId(edge.id, where);
    if (typeof edge.from !== "string" || typeof edge.to !== "string") errors.push(`${where}: from, to は文字列です`);
    const re = validateRoute(edge.route);
    if (re) errors.push(`${where}: ${re}`);
    if (edge.dash !== undefined && !["dashed", "dotted"].includes(edge.dash as string)) errors.push(`${where}: dash が不正です: ${String(edge.dash)}`);
    if (edge.arrow !== undefined && !["end", "start", "both"].includes(edge.arrow as string)) errors.push(`${where}: arrow が不正です: ${String(edge.arrow)}`);
  });
  return errors;
}

export function parseDoc(value: unknown): IconDoc {
  const migrated = migrate(value);
  const errors = validateDoc(migrated);
  if (errors.length) throw new Error(`アイコン JSON が不正です:\n  ${errors.join("\n  ")}`);
  return migrated as IconDoc;
}
