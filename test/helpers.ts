import { expect } from "vitest";
import { DEFAULT_STYLE, applyOps, emptyDoc, type IconDoc, type Op } from "../src/core/index.js";

export const style = DEFAULT_STYLE;

/** ops で doc を組み立てる(テストでも LLM と同じ入口を使う) */
export function build(ops: Op[], doc: IconDoc = emptyDoc("test")): IconDoc {
  return applyOps(doc, style, ops);
}

export function pos(doc: IconDoc, id: string) {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return { x: n.x, y: n.y };
}

export function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
}
