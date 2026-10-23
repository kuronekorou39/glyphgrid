import { BOX_DEFAULTS, DEFAULT_FILL, DEFAULT_SIZE, allIds, isBox, nextId, requireNode, type IconNode } from "../model.js";
import type { Command } from "./types.js";
import { boxProps, type BoxProps, clone, fill, idList, num, optNum, pickNodes, shapeAndFill, shiftMids, size, str } from "./util.js";

export const addNode: Command = (doc, _style, args) => {
  const next = clone(doc);
  const id = args.id === undefined ? nextId(allIds(doc), "n") : str(args.id, "id");
  if (allIds(doc).includes(id)) throw new Error(`id "${id}" はすでに使われています`);
  const look = shapeAndFill(args);
  if (!look.shape) throw new Error("shape を指定してください");
  const node: IconNode = {
    id,
    shape: look.shape,
    fill: look.fill ?? DEFAULT_FILL,
    x: num(args.x, "x"),
    y: num(args.y, "y"),
    size: args.size === undefined ? DEFAULT_SIZE : size(args.size),
  };
  if (isBox(look.shape)) {
    // 箱の形は w / h などを持つ。省略した値は既定値で埋めて、JSON を見れば大きさがわかるようにする
    const { h, ...defaults } = BOX_DEFAULTS[look.shape];
    Object.assign(node, look.shape === "text" ? defaults : { ...defaults, h }, boxProps(args));
    if (look.shape === "text") delete node.h;
  } else {
    Object.assign(node, sizedProps(node, boxProps(args)));
  }
  next.nodes.push(node);
  return next;
};

/** 箱の形(frame / table / text)の大きさや属性を変える。指定した項目だけ変わる */
export const setBox: Command = (doc, _style, args) => {
  const props = boxProps(args);
  if (!Object.keys(props).length) throw new Error("w / h / cols / rows / header / tab / lines / badge のどれかを指定してください");
  const next = clone(doc);
  for (const node of pickNodes(next, idList(args.ids))) Object.assign(node, isBox(node.shape) ? props : sizedProps(node, props));
  return next;
};

/** 箱以外の形が持てる属性は w(直径)と badge だけ */
function sizedProps(node: IconNode, props: BoxProps): BoxProps {
  const extra = Object.keys(props).filter((k) => k !== "w" && k !== "badge");
  if (extra.length) throw new Error(`${node.id} は ${node.shape} なので ${extra.join(", ")} は使えません(w と badge のみ)`);
  return props;
}

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
    // 箱の形にするときは足りない属性を既定値で補い、箱でなくするときは箱の属性を消す
    if (isBox(look.shape)) {
      const { h, ...defaults } = BOX_DEFAULTS[look.shape];
      for (const [k, v] of Object.entries(look.shape === "text" ? defaults : { ...defaults, h }))
        if (node[k as keyof IconNode] === undefined) Object.assign(node, { [k]: v });
      if (look.shape === "text") delete node.h;
      if (look.shape !== "table") delete node.cols, delete node.rows;
      if (look.shape !== "text") delete node.lines;
    } else {
      for (const k of ["w", "h", "cols", "rows", "header", "tab", "lines"] as const) delete node[k];
    }
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
