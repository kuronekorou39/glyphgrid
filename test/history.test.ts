import { describe, expect, it } from "vitest";
import { createHistory, push, redo, undo } from "../src/core/history.js";
import { build } from "./helpers.js";

const d0 = build([]);
const d1 = build([{ op: "addNode", kind: "dot", x: 6, y: 6 }]);
const d2 = build([{ op: "addNode", kind: "ring", x: 6, y: 6 }]);

describe("history", () => {
  it("push → undo → redo", () => {
    let h = push(push(createHistory(d0), d1), d2);
    expect(h.present).toBe(d2);
    h = undo(h);
    expect(h.present).toBe(d1);
    h = undo(h);
    expect(h.present).toBe(d0);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(d1);
  });

  it("undo 後に push すると redo 先は捨てる", () => {
    const h = push(undo(push(push(createHistory(d0), d1), d2)), d2);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it("内容が同じなら積まない", () => {
    const h = createHistory(d1);
    expect(push(h, structuredClone(d1))).toBe(h);
  });
});
