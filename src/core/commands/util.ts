import {
  EDGE_ARROWS,
  EDGE_DASHES,
  LEGACY_KINDS,
  NODE_FILLS,
  NODE_SHAPES,
  SIZE_TOKENS,
  requireNode,
  validateRoute,
  type IconDoc,
  type IconEdge,
  type IconNode,
  type NodeFill,
  type NodeShape,
  type Route,
  type SizeToken,
} from "../model.js";

/** コマンドの出力座標は 0.5 グリッド刻みにそろえる */
export const GRID_STEP = 0.5;

export function snap(v: number, step = GRID_STEP): number {
  const r = Math.round(v / step) * step;
  return Object.is(r, -0) ? 0 : r;
}

export function clone(doc: IconDoc): IconDoc {
  return structuredClone(doc);
}

export function num(v: unknown, name: string): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${name} は数値です(${JSON.stringify(v)})`);
  return n;
}

export function optNum(v: unknown, name: string): number | undefined {
  return v === undefined ? undefined : num(v, name);
}

export function str(v: unknown, name: string): string {
  if (typeof v !== "string" || v === "") throw new Error(`${name} は空でない文字列です`);
  return v;
}

export function shape(v: unknown): NodeShape {
  if (!NODE_SHAPES.includes(v as NodeShape)) throw new Error(`shape は ${NODE_SHAPES.join(" | ")} のいずれかです(${JSON.stringify(v)})`);
  return v as NodeShape;
}

export function fill(v: unknown): NodeFill {
  if (!NODE_FILLS.includes(v as NodeFill)) throw new Error(`fill は ${NODE_FILLS.join(" | ")} のいずれかです(${JSON.stringify(v)})`);
  return v as NodeFill;
}

/**
 * args から形と塗りを読む。旧形式の kind(dot | ring | square)や、
 * shape に kind 名を渡した場合も受け付ける。指定のない項目は undefined
 */
export function shapeAndFill(args: Record<string, unknown>): { shape?: NodeShape; fill?: NodeFill } {
  const legacyName = [args.kind, args.shape].find((v) => typeof v === "string" && v in LEGACY_KINDS) as string | undefined;
  if (args.kind !== undefined && !legacyName) throw new Error(`kind は ${Object.keys(LEGACY_KINDS).join(" | ")} のいずれかです(${JSON.stringify(args.kind)})`);
  const legacy = legacyName ? LEGACY_KINDS[legacyName] : undefined;
  return {
    shape: legacy?.shape ?? (args.shape === undefined ? undefined : shape(args.shape)),
    fill: args.fill === undefined ? legacy?.fill : fill(args.fill),
  };
}

function posInt(v: unknown, name: string): number {
  const n = num(v, name);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} は 1 以上の整数です(${JSON.stringify(v)})`);
  return n;
}

function bool(v: unknown, name: string): boolean {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  throw new Error(`${name} は true か false です(${JSON.stringify(v)})`);
}

export type BoxProps = Pick<IconNode, "w" | "h" | "cols" | "rows" | "header" | "tab" | "lines">;

/** 箱の形の属性(w / h / cols / rows / header / lines)のうち、指定されたものだけを読む */
export function boxProps(args: Record<string, unknown>): BoxProps {
  const out: BoxProps = {};
  for (const k of ["w", "h"] as const) {
    if (args[k] === undefined) continue;
    const n = num(args[k], k);
    if (!(n > 0)) throw new Error(`${k} は正の数です`);
    out[k] = n;
  }
  for (const k of ["cols", "rows", "lines"] as const) if (args[k] !== undefined) out[k] = posInt(args[k], k);
  if (args.header !== undefined) out.header = bool(args.header, "header");
  if (args.tab !== undefined) out.tab = bool(args.tab, "tab");
  return out;
}

/** dash を読む。"solid" は省略(undefined)として返す */
export function dash(v: unknown): IconEdge["dash"] {
  const d = oneOf(v, EDGE_DASHES, "dash");
  return d === "solid" ? undefined : d;
}

/** arrow を読む。"none" は省略(undefined)として返す */
export function arrow(v: unknown): IconEdge["arrow"] {
  const a = oneOf(v, EDGE_ARROWS, "arrow");
  return a === "none" ? undefined : a;
}

export function size(v: unknown): SizeToken {
  if (!SIZE_TOKENS.includes(v as SizeToken)) throw new Error(`size は ${SIZE_TOKENS.join(" | ")} のいずれかです(${JSON.stringify(v)})`);
  return v as SizeToken;
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], name: string): T {
  if (!options.includes(v as T)) throw new Error(`${name} は ${options.join(" | ")} のいずれかです(${JSON.stringify(v)})`);
  return v as T;
}

/** ids を配列で受ける。CLI 由来のカンマ区切り文字列も受け付ける */
export function idList(v: unknown, name = "ids"): string[] {
  const list = typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v;
  if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) throw new Error(`${name} は id の配列です`);
  return list as string[];
}

/** id 群から(重複を除いて)ノードを引く。存在しなければエラー */
export function pickNodes(doc: IconDoc, ids: string[]): IconNode[] {
  return [...new Set(ids)].map((id) => requireNode(doc, id));
}

/**
 * route をオブジェクトまたは短縮文字列で受ける。
 * 短縮形: straight | hv | vh | hvh[:mid] | vhv[:mid] | hdh[:mid[:span]] | vdv[:mid[:span]]
 */
export function route(v: unknown): Route {
  if (v === undefined) return { type: "straight" };
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{")) return route(JSON.parse(s));
    const [bend, a, b] = s.split(":");
    const mid = a === undefined || a === "" ? undefined : num(a, "mid");
    if (bend === "straight") return { type: "straight" };
    if (bend === "hv" || bend === "vh") return { type: "ortho", bend };
    if (bend === "hvh" || bend === "vhv") return mid === undefined ? { type: "ortho", bend } : { type: "ortho", bend, mid };
    if (bend === "hdh" || bend === "vdv") {
      const r: Route = { type: "slant", bend };
      if (mid !== undefined) r.mid = mid;
      if (b !== undefined) r.span = num(b, "span");
      return r;
    }
    throw new Error(`route の短縮形が不正です: ${s}`);
  }
  const err = validateRoute(v);
  if (err) throw new Error(err);
  return structuredClone(v as Route);
}

/** route の mid が x と y のどちらの座標か */
export function midAxis(r: Route): "x" | "y" | null {
  if (r.type === "straight") return null;
  if (r.bend === "hvh" || r.bend === "hdh") return "x";
  if (r.bend === "vhv" || r.bend === "vdv") return "y";
  return null;
}

/** 両端がともに移動したエッジは、幹の位置(mid)も一緒に動かす */
export function shiftMids(doc: IconDoc, moved: Set<string>, dx: number, dy: number): void {
  for (const e of doc.edges) {
    if (!moved.has(e.from) || !moved.has(e.to)) continue;
    const r = e.route;
    if (r.type === "straight" || r.mid === undefined) continue;
    const axis = midAxis(r);
    if (axis === "x") r.mid = r.mid + dx;
    if (axis === "y") r.mid = r.mid + dy;
  }
}
