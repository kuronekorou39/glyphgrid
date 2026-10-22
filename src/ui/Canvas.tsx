import { useMemo, useRef, useState } from "preact/hooks";
import { applyOp, edgePathData, findNode, nodeHalfExtent, renderSvg, type IconDoc, type IconNode, type Issue, type Op, type Style } from "../core/index.js";
import { nodeBounds, outline, signedDistance } from "../core/shape.js";
import { GRID_STEP, snap } from "../core/commands/util.js";
import type { EdgeLook, NodeLook, Tool } from "./tools.js";

interface Props {
  doc: IconDoc;
  style: Style;
  selection: string[];
  issues: Issue[];
  tool: Tool;
  nodeLook: NodeLook;
  edgeLook: EdgeLook;
  onSelect: (ids: string[]) => void;
  onCommit: (doc: IconDoc) => void;
  onOp: (op: Op) => void;
}

interface Pt {
  x: number;
  y: number;
}

type Drag =
  | { kind: "move"; start: Pt; base: IconDoc; ids: string[]; preview: IconDoc }
  | { kind: "connect"; from: string; at: Pt }
  | { kind: "band"; start: Pt; at: Pt; base: string[] };

/** キャンバス外周に見せる余白(グリッド単位) */
const MARGIN = 1;
/** ノードの外形よりこれだけ外側までをクリックの当たりにする */
const HIT_MARGIN = 0.25;

/** 選択や lint の印。円と記号マークは円、それ以外は外接矩形で囲む */
function Ring({ node, style, margin, stroke }: { node: IconNode; style: Style; margin: number; stroke?: string }) {
  const u = style.unit;
  if (node.shape === "circle" || ["check", "cross", "sparkle", "cursor"].includes(node.shape)) {
    return <circle cx={node.x * u} cy={node.y * u} r={(nodeHalfExtent(style, node) + margin) * u} stroke={stroke} />;
  }
  const b = nodeBounds(style, node);
  return (
    <rect
      x={(b.minX - margin) * u}
      y={(b.minY - margin) * u}
      width={(b.maxX - b.minX + 2 * margin) * u}
      height={(b.maxY - b.minY + 2 * margin) * u}
      rx={4}
      stroke={stroke}
    />
  );
}

export function Canvas({ doc, style, selection, issues, tool, nodeLook, edgeLook, onSelect, onCommit, onOp }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const shown = drag?.kind === "move" ? drag.preview : doc;
  const u = style.unit;
  const { cols, rows } = shown.canvas;

  const iconSvg = useMemo(() => renderSvg(shown, style), [shown, style]);

  const toGrid = (e: PointerEvent): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x / u, y: p.y / u };
  };

  /** 点の下にあるノード。枠の中に置いたものが選べるよう、重なっていれば面積の小さいものを優先する */
  const nodeAt = (p: Pt) => {
    const area = (n: IconNode) => {
      const b = nodeBounds(style, n);
      return (b.maxX - b.minX) * (b.maxY - b.minY);
    };
    return shown.nodes
      .filter((n) => signedDistance(outline(style, n, -HIT_MARGIN), p) <= 0)
      .sort((a, b) => area(a) - area(b))[0];
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toGrid(e);
    const node = nodeAt(p);
    const edgeId = (e.target as Element).closest?.("[data-edge]")?.getAttribute("data-edge");

    if (tool === "node") {
      if (node) onSelect([node.id]);
      else onOp({ op: "addNode", ...nodeLook, x: snap(p.x), y: snap(p.y) });
      return;
    }
    if (node && (tool === "connect" || e.altKey)) {
      setDrag({ kind: "connect", from: node.id, at: p });
      return;
    }
    if (node) {
      let ids = selection;
      if (e.shiftKey) ids = selection.includes(node.id) ? selection.filter((id) => id !== node.id) : [...selection, node.id];
      else if (!selection.includes(node.id)) ids = [node.id];
      onSelect(ids);
      const moving = ids.filter((id) => findNode(doc, id));
      if (moving.includes(node.id)) setDrag({ kind: "move", start: p, base: doc, ids: moving, preview: doc });
      return;
    }
    if (edgeId) {
      onSelect(e.shiftKey ? [...selection.filter((id) => id !== edgeId), edgeId] : [edgeId]);
      return;
    }
    setDrag({ kind: "band", start: p, at: p, base: e.shiftKey ? selection : [] });
    if (!e.shiftKey) onSelect([]);
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = toGrid(e);
    setHover({ x: snap(p.x), y: snap(p.y) });
    if (!drag) return;
    if (drag.kind === "move") {
      const dx = snap(p.x - drag.start.x);
      const dy = snap(p.y - drag.start.y);
      const preview = dx || dy ? applyOp(drag.base, style, { op: "nudge", ids: drag.ids, dx, dy }) : drag.base;
      if (preview !== drag.preview) setDrag({ ...drag, preview });
    } else if (drag.kind === "connect") setDrag({ ...drag, at: p });
    else {
      setDrag({ ...drag, at: p });
      const [x0, x1] = [Math.min(drag.start.x, p.x), Math.max(drag.start.x, p.x)];
      const [y0, y1] = [Math.min(drag.start.y, p.y), Math.max(drag.start.y, p.y)];
      const inside = doc.nodes.filter((n) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1).map((n) => n.id);
      onSelect([...new Set([...drag.base, ...inside])]);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "move" && drag.preview !== drag.base) onCommit(drag.preview);
    if (drag.kind === "connect") {
      const target = nodeAt(toGrid(e));
      if (target && target.id !== drag.from) onOp({ op: "connect", from: drag.from, to: target.id, ...edgeLook });
    }
    setDrag(null);
  };

  const issueColor = (i: Issue) => (i.severity === "error" ? "var(--error)" : "var(--warning)");
  const fromNode = drag?.kind === "connect" ? findNode(shown, drag.from) : undefined;

  return (
    <svg
      ref={svgRef}
      class={`canvas tool-${tool}`}
      viewBox={`${-MARGIN * u} ${-MARGIN * u} ${(cols + 2 * MARGIN) * u} ${(rows + 2 * MARGIN) * u}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      {/* グリッドと余白 */}
      <rect class="paper" width={cols * u} height={rows * u} />
      <rect
        class="safe-area"
        x={style.padding * u}
        y={style.padding * u}
        width={(cols - 2 * style.padding) * u}
        height={(rows - 2 * style.padding) * u}
      />
      <g class="grid">
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line class={i === cols / 2 ? "center" : ""} x1={i * u} y1={0} x2={i * u} y2={rows * u} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line class={i === rows / 2 ? "center" : ""} x1={0} y1={i * u} x2={cols * u} y2={i * u} />
        ))}
      </g>

      {/* 書き出しと同じ描画関数の結果をそのまま重ねる */}
      <g class="icon" dangerouslySetInnerHTML={{ __html: iconSvg }} />

      {/* lint マーカー */}
      <g class="markers">
        {issues.flatMap((issue) =>
          issue.ids.map((id) => {
            const n = findNode(shown, id);
            if (n) return <Ring node={n} style={style} margin={0.35} stroke={issueColor(issue)} />;
            const d = edgePathData(shown, style, id);
            return d ? <path d={d} stroke={issueColor(issue)} stroke-width={style.stroke.width * u * 2.5} opacity={0.35} /> : null;
          }),
        )}
      </g>

      {/* 選択表示 */}
      <g class="selection">
        {selection.map((id) => {
          const n = findNode(shown, id);
          if (n) return <Ring node={n} style={style} margin={0.2} />;
          const d = edgePathData(shown, style, id);
          return d ? <path class="edge-selected" d={d} stroke-width={style.stroke.width * u * 2.5} /> : null;
        })}
      </g>

      {/* エッジの当たり判定(ノードは座標から判定する) */}
      <g class="hit">
        {shown.edges.map((e) => {
          const d = edgePathData(shown, style, e.id);
          return d ? <path data-edge={e.id} d={d} stroke-width={Math.max(style.stroke.width * 3, 0.6) * u} /> : null;
        })}
      </g>

      {hover && tool === "node" && !drag && (
        <circle class="cursor" cx={hover.x * u} cy={hover.y * u} r={GRID_STEP * u * 0.4} />
      )}
      {drag?.kind === "connect" && fromNode && (
        <line class="connect-preview" x1={fromNode.x * u} y1={fromNode.y * u} x2={drag.at.x * u} y2={drag.at.y * u} />
      )}
      {drag?.kind === "band" && (
        <rect
          class="band"
          x={Math.min(drag.start.x, drag.at.x) * u}
          y={Math.min(drag.start.y, drag.at.y) * u}
          width={Math.abs(drag.at.x - drag.start.x) * u}
          height={Math.abs(drag.at.y - drag.start.y) * u}
        />
      )}
    </svg>
  );
}
