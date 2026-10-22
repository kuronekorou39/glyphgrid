import type { IconDoc } from "../model.js";
import type { Style } from "../style.js";
import { connect, disconnect, setRoute } from "./edges.js";
import { align, centerContent, distribute, mirror, normalizeSize, radial, snapToGrid } from "./layout.js";
import { addNode, moveNode, nudge, removeNode, setKind, setSize } from "./nodes.js";
import { tidy } from "./tidy.js";
import type { Args, CommandDef } from "./types.js";

export type { Args, Command, CommandDef } from "./types.js";

export const COMMANDS: Record<string, CommandDef> = {
  addNode: { run: addNode, params: ["kind", "x", "y", "size?", "id?"], summary: "ノードを追加する" },
  removeNode: { run: removeNode, params: ["ids"], summary: "ノードと接続エッジを削除する" },
  moveNode: { run: moveNode, params: ["id", "x", "y"], summary: "ノードを移動する" },
  nudge: { run: nudge, params: ["ids", "dx", "dy"], summary: "ノードを相対移動する" },
  setKind: { run: setKind, params: ["ids", "kind"], summary: "種類を変える" },
  setSize: { run: setSize, params: ["ids", "size"], summary: "サイズを変える" },
  connect: { run: connect, params: ["from", "to", "route?", "id?"], summary: "エッジを作る" },
  disconnect: { run: disconnect, params: ["ids"], summary: "エッジを消す" },
  setRoute: { run: setRoute, params: ["ids", "route"], summary: "線種を変える" },
  align: { run: align, params: ["ids", "mode"], summary: "中心座標を揃える" },
  distribute: { run: distribute, params: ["ids", "direction"], summary: "等間隔に並べる(両端は固定)" },
  normalizeSize: { run: normalizeSize, params: ["ids", "size?"], summary: "サイズを揃える" },
  snapToGrid: { run: snapToGrid, params: ["ids?"], summary: "0.5 グリッドに吸着させる" },
  mirror: { run: mirror, params: ["ids", "axis", "about?"], summary: "鏡像を複製する" },
  radial: { run: radial, params: ["center", "ids", "startAngle?", "radius?"], summary: "中心の周りに等角度で配置する" },
  centerContent: { run: centerContent, params: [], summary: "内容をキャンバス中央に寄せる" },
  tidy: { run: tidy, params: [], summary: "吸着・重複除去・幹の共有化・中央寄せ" },
};

export interface Op extends Args {
  op: string;
}

export function applyOp(doc: IconDoc, style: Style, op: Op): IconDoc {
  const def = COMMANDS[op.op];
  if (!def) throw new Error(`未知のコマンドです: ${String(op.op)}(使えるもの: ${Object.keys(COMMANDS).join(", ")})`);
  const { op: _name, ...args } = op;
  return def.run(doc, style, args);
}

/** ops を順に適用する。途中で失敗したら何番目の op かを添えて投げる(doc は変更されない) */
export function applyOps(doc: IconDoc, style: Style, ops: Op[]): IconDoc {
  if (!Array.isArray(ops)) throw new Error("ops は配列です");
  return ops.reduce((d, op, i) => {
    try {
      return applyOp(d, style, op);
    } catch (e) {
      throw new Error(`ops[${i}] (${String(op?.op)}): ${(e as Error).message}`);
    }
  }, doc);
}

/** CLI の位置引数(と key=value)を Args に割り当てる */
export function argsFromCli(name: string, argv: string[]): Args {
  const def = COMMANDS[name];
  if (!def) throw new Error(`未知のコマンドです: ${name}`);
  const args: Args = {};
  const positional: string[] = [];
  for (const a of argv) {
    const m = /^([A-Za-z]\w*)=(.*)$/s.exec(a);
    if (m) args[m[1]!] = m[2];
    else positional.push(a);
  }
  const params = def.params.map((p) => ({ name: p.replace(/\?$/, ""), optional: p.endsWith("?") }));
  if (positional.length > params.length) throw new Error(`${name} の引数が多すぎます(${def.params.join(" ")})`);
  positional.forEach((v, i) => (args[params[i]!.name] = v));
  const missing = params.filter((p) => !p.optional && args[p.name] === undefined).map((p) => p.name);
  if (missing.length) throw new Error(`${name} に必要な引数がありません: ${missing.join(", ")}(${def.params.join(" ")})`);
  return args;
}
