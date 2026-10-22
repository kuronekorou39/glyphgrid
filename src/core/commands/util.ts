import { NODE_KINDS, SIZE_TOKENS, requireNode, validateRoute, type IconDoc, type IconNode, type NodeKind, type Route, type SizeToken } from "../model.js";

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

export function kind(v: unknown): NodeKind {
  if (!NODE_KINDS.includes(v as NodeKind)) throw new Error(`kind は ${NODE_KINDS.join(" | ")} のいずれかです(${JSON.stringify(v)})`);
  return v as NodeKind;
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
