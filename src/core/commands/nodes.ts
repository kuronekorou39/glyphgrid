import { DEFAULT_SIZE, allIds, nextId, requireNode } from "../model.js";
import type { Command } from "./types.js";
import { clone, idList, kind, num, optNum, pickNodes, shiftMids, size, str } from "./util.js";

export const addNode: Command = (doc, _style, args) => {
  const next = clone(doc);
  const id = args.id === undefined ? nextId(allIds(doc), "n") : str(args.id, "id");
  if (allIds(doc).includes(id)) throw new Error(`id "${id}" はすでに使われています`);
  next.nodes.push({
    id,
    kind: kind(args.kind),
    x: num(args.x, "x"),
    y: num(args.y, "y"),
    size: args.size === undefined ? DEFAULT_SIZE : size(args.size),
  });
  return next;
};

export const removeNode: Command = (doc, _style, args) => {
  const ids = new Set(idList(args.ids ?? args.id, "id"));
  pickNodes(doc, [...ids]);
  const next = clone(doc);
  next.nodes = next.nodes.filter((n) => !ids.has(n.id));
  next.edges = next.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
  return next;
};

export const moveNode: Command = (doc, _style, args) => {
  const next = clone(doc);
  const node = requireNode(next, str(args.id, "id"));
  node.x = num(args.x, "x");
  node.y = num(args.y, "y");
  return next;
};

export const nudge: Command = (doc, _style, args) => {
  const ids = idList(args.ids);
  const dx = optNum(args.dx, "dx") ?? 0;
  const dy = optNum(args.dy, "dy") ?? 0;
  const next = clone(doc);
  for (const node of pickNodes(next, ids)) {
    node.x += dx;
    node.y += dy;
  }
  shiftMids(next, new Set(ids), dx, dy);
  return next;
};

export const setKind: Command = (doc, _style, args) => {
  const k = kind(args.kind);
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) node.kind = k;
  return next;
};

export const setSize: Command = (doc, _style, args) => {
  const s = size(args.size);
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) node.size = s;
  return next;
};
