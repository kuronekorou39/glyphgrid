// アイコンのデータモデル。座標はすべてグリッド単位。

export const NODE_KINDS = ["dot", "ring", "square"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const SIZE_TOKENS = ["s", "m", "l"] as const;
export type SizeToken = (typeof SIZE_TOKENS)[number];

export interface IconNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  size: SizeToken;
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

export interface IconEdge {
  id: string;
  from: string;
  to: string;
  route: Route;
}

export interface IconDoc {
  version: 1;
  name: string;
  canvas: { cols: number; rows: number };
  nodes: IconNode[];
  edges: IconEdge[];
}

export const DEFAULT_CANVAS = { cols: 12, rows: 12 } as const;
export const DEFAULT_SIZE: SizeToken = "m";
export const STRAIGHT: Route = { type: "straight" };

/** 0.5 刻みのグリッド座標を扱うため、比較はこの誤差で行う */
export const EPS = 1e-6;

export function emptyDoc(name: string, canvas: IconDoc["canvas"] = DEFAULT_CANVAS): IconDoc {
  return { version: 1, name, canvas: { ...canvas }, nodes: [], edges: [] };
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

/** 構造の検証。参照切れ(dangling)は lint の担当なのでここでは見ない */
export function validateDoc(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["ドキュメントがオブジェクトではありません"];
  const d = value as Record<string, unknown>;
  if (d.version !== 1) errors.push("version は 1 です");
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
    if (!NODE_KINDS.includes(node.kind as NodeKind)) errors.push(`${where}: kind が不正です: ${String(node.kind)}`);
    if (!SIZE_TOKENS.includes(node.size as SizeToken)) errors.push(`${where}: size が不正です: ${String(node.size)}`);
    if (!isNum(node.x) || !isNum(node.y)) errors.push(`${where}: x, y は数値です`);
  });
  (d.edges as unknown[]).forEach((e, i) => {
    const edge = e as Record<string, unknown>;
    const where = `edges[${i}]`;
    checkId(edge.id, where);
    if (typeof edge.from !== "string" || typeof edge.to !== "string") errors.push(`${where}: from, to は文字列です`);
    const re = validateRoute(edge.route);
    if (re) errors.push(`${where}: ${re}`);
  });
  return errors;
}

export function parseDoc(value: unknown): IconDoc {
  const errors = validateDoc(value);
  if (errors.length) throw new Error(`アイコン JSON が不正です:\n  ${errors.join("\n  ")}`);
  return value as IconDoc;
}
