import type { IconDoc } from "./model.js";

/** 1行に収める JSON。`{"a": 1, "b": {"c": 2}}` のように区切りの後に空白を入れる */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")}}`;
  }
  return JSON.stringify(v);
}

/**
 * アイコン JSON を書き出す。ノードとエッジは1要素1行にして、
 * 人と LLM が読みやすく、差分も追いやすい形にする。
 */
export function formatDoc(doc: IconDoc): string {
  const list = (items: unknown[]) => (items.length ? `[\n    ${items.map(inline).join(",\n    ")}\n  ]` : "[]");
  return [
    "{",
    `  "version": ${doc.version},`,
    `  "name": ${JSON.stringify(doc.name)},`,
    `  "canvas": ${inline(doc.canvas)},`,
    `  "nodes": ${list(doc.nodes)},`,
    `  "edges": ${list(doc.edges)}`,
    "}",
    "",
  ].join("\n");
}
