import type { IconDoc } from "../model.js";
import type { Style } from "../style.js";

/** ops 配列や CLI から来る引数。値の型はコマンド側で検証・変換する */
export type Args = Record<string, unknown>;

export type Command = (doc: IconDoc, style: Style, args: Args) => IconDoc;

export interface CommandDef {
  run: Command;
  /** CLI の `run` で位置引数を割り当てる順序。末尾の ? は省略可 */
  params: string[];
  summary: string;
}
