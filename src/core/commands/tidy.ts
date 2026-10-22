import { defaultMid } from "../geometry.js";
import { findNode, type IconDoc, type IconEdge } from "../model.js";
import { centerContent, snapToGrid } from "./layout.js";
import type { Command } from "./types.js";
import { clone, snap } from "./util.js";

/** これ以内の距離にある幹(mid)は同じ幹とみなしてまとめる */
const TRUNK_MERGE_DISTANCE = 1;

/** 同じ形に描かれるエッジは同じキーになる。矢印なしの直線だけは向きを区別しない */
function edgeKey(e: IconEdge): string {
  const look = `${e.dash ?? "solid"}|${e.arrow ?? "none"}`;
  if (e.route.type === "straight" && !e.arrow) return `${[e.from, e.to].sort().join("|")}|${look}`;
  return `${e.from}|${e.to}|${JSON.stringify(e.route)}|${look}`;
}

/** 自己ループと、同じ形の重複エッジを取り除く(先に出たものを残す) */
export function dedupeEdges(doc: IconDoc): IconDoc {
  const next = clone(doc);
  const seen = new Set<string>();
  next.edges = next.edges.filter((e) => {
    if (e.from === e.to) return false;
    const key = edgeKey(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return next;
}

/** 同じ始点・同じ曲がり方で、幹の位置が近いエッジの mid をそろえて幹を共有させる */
export function shareTrunks(doc: IconDoc): IconDoc {
  const next = clone(doc);
  const groups = new Map<string, { edge: IconEdge; mid: number }[]>();
  for (const e of next.edges) {
    const r = e.route;
    if (r.type !== "ortho" || (r.bend !== "hvh" && r.bend !== "vhv")) continue;
    const a = findNode(next, e.from);
    const b = findNode(next, e.to);
    if (!a || !b) continue;
    const key = `${e.from}|${r.bend}`;
    const list = groups.get(key) ?? [];
    list.push({ edge: e, mid: r.mid ?? defaultMid(r, a, b)! });
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((p, q) => p.mid - q.mid);
    let cluster: typeof list = [];
    const flush = () => {
      if (cluster.length >= 2) {
        const mid = snap(cluster.reduce((s, c) => s + c.mid, 0) / cluster.length);
        for (const c of cluster) if (c.edge.route.type === "ortho") c.edge.route.mid = mid;
      }
      cluster = [];
    };
    for (const item of list) {
      const last = cluster[cluster.length - 1];
      if (last && item.mid - last.mid > TRUNK_MERGE_DISTANCE) flush();
      cluster.push(item);
    }
    flush();
  }
  return next;
}

/** snapToGrid → 重複エッジ除去 → 幹の共有化 → centerContent */
export const tidy: Command = (doc, style) => {
  let next = snapToGrid(doc, style, {});
  next = dedupeEdges(next);
  next = shareTrunks(next);
  return centerContent(next, style, {});
};
