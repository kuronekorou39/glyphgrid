import { allIds, nextId, requireEdge, requireNode } from "../model.js";
import type { Command } from "./types.js";
import { clone, idList, route, str } from "./util.js";

export const connect: Command = (doc, _style, args) => {
  const from = str(args.from, "from");
  const to = str(args.to, "to");
  requireNode(doc, from);
  requireNode(doc, to);
  if (from === to) throw new Error("同じノード同士はつなげません");
  const id = args.id === undefined ? nextId(allIds(doc), "e") : str(args.id, "id");
  if (allIds(doc).includes(id)) throw new Error(`id "${id}" はすでに使われています`);
  const next = clone(doc);
  next.edges.push({ id, from, to, route: route(args.route) });
  return next;
};

export const disconnect: Command = (doc, _style, args) => {
  const ids = new Set(idList(args.ids ?? args.id, "id"));
  for (const id of ids) requireEdge(doc, id);
  const next = clone(doc);
  next.edges = next.edges.filter((e) => !ids.has(e.id));
  return next;
};

export const setRoute: Command = (doc, _style, args) => {
  const r = route(args.route);
  const next = clone(doc);
  for (const id of idList(args.ids ?? args.id, "id")) requireEdge(next, id).route = structuredClone(r);
  return next;
};
