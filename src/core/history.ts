import type { IconDoc } from "./model.js";

/** doc のスナップショット履歴。すべて新しいオブジェクトを返す */
export interface History {
  past: IconDoc[];
  present: IconDoc;
  future: IconDoc[];
}

/** 保持するアンドゥの段数 */
const HISTORY_LIMIT = 200;

export function createHistory(doc: IconDoc): History {
  return { past: [], present: doc, future: [] };
}

/** 新しい状態を積む。現在と同じ内容なら何もしない */
export function push(h: History, doc: IconDoc): History {
  if (doc === h.present || JSON.stringify(doc) === JSON.stringify(h.present)) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: doc, future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}
