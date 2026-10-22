import { allIds, nextId, requireEdge, requireNode, type IconEdge } from "../model.js";
import type { Args, Command } from "./types.js";
import { arrow, clone, dash, idList, route, str } from "./util.js";

/** dash / arrow の指定を edge に反映する。既定値(solid / none)はキーごと消す */
function applyLook(edge: IconEdge, args: Args): void {
  if (args.dash !== undefined) {
    const d = dash(args.dash);
    if (d) edge.dash = d;
    else delete edge.dash;
  }
  if (args.arrow !== undefined) {
    const a = arrow(args.arrow);
    if (a) edge.arrow = a;
    else delete edge.arrow;
  }
}

const edgeIds = (args: Args) => idList(args.ids ?? args.id, "id");

export const connect: Command = (doc, _style, args) => {
  const from = str(args.from, "from");
  const to = str(args.to, "to");
  requireNode(doc, from);
  requireNode(doc, to);
  if (from === to) throw new Error("同じノード同士はつなげません");
  const id = args.id === undefined ? nextId(allIds(doc), "e") : str(args.id, "id");
  if (allIds(doc).includes(id)) throw new Error(`id "${id}" はすでに使われています`);
  const next = clone(doc);
  const edge: IconEdge = { id, from, to, route: route(args.route) };
  applyLook(edge, args);
  next.edges.push(edge);
  return next;
};

export const disconnect: Command = (doc, _style, args) => {
  const ids = new Set(edgeIds(args));
  for (const id of ids) requireEdge(doc, id);
  const next = clone(doc);
  next.edges = next.edges.filter((e) => !ids.has(e.id));
  return next;
};

export const setRoute: Command = (doc, _style, args) => {
  const r = route(args.route);
  const next = clone(doc);
  for (const id of edgeIds(args)) requireEdge(next, id).route = structuredClone(r);
  return next;
};

/** 線種(solid | dashed | dotted)を変える */
export const setDash: Command = (doc, _style, args) => {
  if (args.dash === undefined) throw new Error("dash を指定してください");
  const next = clone(doc);
  for (const id of edgeIds(args)) applyLook(requireEdge(next, id), { dash: args.dash });
  return next;
};

/** 矢印(none | end | start | both)を変える */
export const setArrow: Command = (doc, _style, args) => {
  if (args.arrow === undefined) throw new Error("arrow を指定してください");
  const next = clone(doc);
  for (const id of edgeIds(args)) applyLook(requireEdge(next, id), { arrow: args.arrow });
  return next;
};

/** 向きを反転する(from と to を入れ替える)。線の形は変えず、矢印が逆を向く */
export const reverse: Command = (doc, _style, args) => {
  const next = clone(doc);
  for (const id of edgeIds(args)) {
    const e = requireEdge(next, id);
    [e.from, e.to] = [e.to, e.from];
    const r = e.route;
    // hv を逆からたどると vh になる。hvh / vhv / slant は mid が座標なのでそのままでよい
    if (r.type === "ortho" && (r.bend === "hv" || r.bend === "vh")) r.bend = r.bend === "hv" ? "vh" : "hv";
  }
  return next;
};
