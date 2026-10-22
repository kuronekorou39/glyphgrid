import { DEFAULT_FILL, DEFAULT_SIZE, allIds, nextId, requireNode } from "../model.js";
import type { Command } from "./types.js";
import { clone, fill, idList, num, optNum, pickNodes, shapeAndFill, shiftMids, size, str } from "./util.js";

export const addNode: Command = (doc, _style, args) => {
  const next = clone(doc);
  const id = args.id === undefined ? nextId(allIds(doc), "n") : str(args.id, "id");
  if (allIds(doc).includes(id)) throw new Error(`id "${id}" はすでに使われています`);
  const look = shapeAndFill(args);
  if (!look.shape) throw new Error("shape を指定してください");
  next.nodes.push({
    id,
    shape: look.shape,
    fill: look.fill ?? DEFAULT_FILL,
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

/** 形を変える。fill も渡すか、旧形式の kind 名(dot | ring | square)を渡すと塗りも変わる */
export const setShape: Command = (doc, _style, args) => {
  const look = shapeAndFill(args);
  if (!look.shape) throw new Error("shape を指定してください");
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) {
    node.shape = look.shape;
    if (look.fill) node.fill = look.fill;
  }
  return next;
};

export const setFill: Command = (doc, _style, args) => {
  const f = fill(args.fill);
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) node.fill = f;
  return next;
};

export const setSize: Command = (doc, _style, args) => {
  const s = size(args.size);
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) node.size = s;
  return next;
};
