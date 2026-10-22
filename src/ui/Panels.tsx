import { useState } from "preact/hooks";
import {
  EDGE_ARROWS,
  EDGE_DASHES,
  NODE_FILLS,
  NODE_SHAPES,
  SIZE_TOKENS,
  findNode,
  isBox,
  renderSvg,
  type IconDoc,
  type EdgeArrow,
  type EdgeDash,
  type IconEdge,
  type IconNode,
  type Issue,
  type Op,
  type Route,
  type Style,
} from "../core/index.js";
import type { SetInfo } from "./api.js";
import {
  ARROW_LABELS,
  DASH_LABELS,
  FILL_LABELS,
  ROUTES,
  SHAPE_LABELS,
  lookIcon,
  type EdgeLook,
  type NodeLook,
  type Tool,
} from "./tools.js";

// ---- 共通の入力部品 ----

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label class="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
        {value === "" && (
          <option value="" disabled>
            変更…
          </option>
        )}
        {options.map((o) => (
          <option value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, step = 0.5, onChange }: { label: string; value: number | undefined; step?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label class="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        placeholder="自動"
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </label>
  );
}

const shapeOptions = NODE_SHAPES.map((s) => ({ value: s, label: SHAPE_LABELS[s] }));
const fillOptions = NODE_FILLS.map((f) => ({ value: f, label: FILL_LABELS[f] }));
const sizeOptions = SIZE_TOKENS.map((s) => ({ value: s, label: s }));
const dashOptions = EDGE_DASHES.map((d) => ({ value: d, label: DASH_LABELS[d] }));
const arrowOptions = EDGE_ARROWS.map((a) => ({ value: a, label: ARROW_LABELS[a] }));

/** 複数選択で値がそろっていればその値、ばらばらなら "" */
function common<T>(items: T[], get: (x: T) => string): string {
  const values = new Set(items.map(get));
  return values.size === 1 ? [...values][0]! : "";
}

// ---- サイドバー(セットとアイコンの一覧) ----

interface SidebarProps {
  sets: SetInfo[];
  set: string | null;
  icon: string | null;
  thumbs: Record<string, IconDoc>;
  style: Style;
  onSet: (set: string) => void;
  onIcon: (icon: string) => void;
  onCreate: (name: string) => void;
}

export function Sidebar({ sets, set, icon, thumbs, style, onSet, onIcon, onCreate }: SidebarProps) {
  const [name, setName] = useState("");
  const current = sets.find((s) => s.name === set);
  const thumbStyle = { ...style, background: "transparent" };
  return (
    <aside class="sidebar">
      <label class="field">
        <span>セット</span>
        <select value={set ?? ""} onChange={(e) => onSet((e.target as HTMLSelectElement).value)}>
          {sets.map((s) => (
            <option value={s.name}>{s.name}</option>
          ))}
        </select>
      </label>
      <ul class="icon-list">
        {current?.icons.map((name) => (
          <li class={name === icon ? "active" : ""} onClick={() => onIcon(name)}>
            <span class="thumb" dangerouslySetInnerHTML={{ __html: thumbs[name] ? renderSvg(thumbs[name]!, thumbStyle) : "" }} />
            <span class="name">{name}</span>
          </li>
        ))}
      </ul>
      <form
        class="new-icon"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
          setName("");
        }}
      >
        <input placeholder="新しいアイコン名" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button type="submit">追加</button>
      </form>
    </aside>
  );
}

// ---- ツールバー ----

interface ToolbarProps {
  tool: Tool;
  nodeLook: NodeLook;
  edgeLook: EdgeLook;
  style: Style;
  selectedNodes: string[];
  canUndo: boolean;
  canRedo: boolean;
  onTool: (t: Tool) => void;
  onNodeLook: (l: NodeLook) => void;
  onEdgeLook: (l: Partial<EdgeLook>) => void;
  onOp: (op: Op) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar(p: ToolbarProps) {
  const ids = p.selectedNodes;
  const btn = (label: string, op: Op, min: number, title?: string) => (
    <button disabled={ids.length < min} title={title} onClick={() => p.onOp(op)}>
      {label}
    </button>
  );
  const pick = <T extends string>(value: T, options: { value: T; label: string }[], onChange: (v: T) => void, title: string) => (
    <select value={value} title={title} onChange={(e) => onChange((e.target as HTMLSelectElement).value as T)}>
      {options.map((o) => (
        <option value={o.value}>{o.label}</option>
      ))}
    </select>
  );
  return (
    <header class="toolbar">
      <div class="group">
        <button class={p.tool === "select" ? "on" : ""} title="選択(V)" onClick={() => p.onTool("select")}>
          選択
        </button>
        <button class={p.tool === "connect" ? "on" : ""} title="接続(C)" onClick={() => p.onTool("connect")}>
          接続
        </button>
      </div>
      <div class="group">
        {NODE_SHAPES.map((shape, i) => (
          <button
            class={`shape ${p.tool === "node" && p.nodeLook.shape === shape ? "on" : ""}`}
            title={`${SHAPE_LABELS[shape]}を置く(${i + 1})`}
            onClick={() => {
              p.onNodeLook({ ...p.nodeLook, shape });
              p.onTool("node");
            }}
            dangerouslySetInnerHTML={{ __html: lookIcon({ ...p.nodeLook, shape }, p.style) }}
          />
        ))}
        {pick(p.nodeLook.fill, fillOptions, (fill) => p.onNodeLook({ ...p.nodeLook, fill }), "置くノードの塗り(F で切り替え)")}
      </div>
      <div class="group">
        {pick(p.edgeLook.route, ROUTES, (route) => p.onEdgeLook({ route }), "新しいエッジの経路(選択中のエッジにも適用)")}
        {pick(p.edgeLook.dash, dashOptions, (dash) => p.onEdgeLook({ dash }), "新しいエッジの線種(選択中のエッジにも適用)")}
        {pick(p.edgeLook.arrow, arrowOptions, (arrow) => p.onEdgeLook({ arrow }), "新しいエッジの矢印(選択中のエッジにも適用)")}
      </div>
      <div class="group">
        {btn("左", { op: "align", ids, mode: "left" }, 2, "左揃え")}
        {btn("中", { op: "align", ids, mode: "center-x" }, 2, "左右中央揃え")}
        {btn("右", { op: "align", ids, mode: "right" }, 2, "右揃え")}
        {btn("上", { op: "align", ids, mode: "top" }, 2, "上揃え")}
        {btn("中", { op: "align", ids, mode: "center-y" }, 2, "上下中央揃え")}
        {btn("下", { op: "align", ids, mode: "bottom" }, 2, "下揃え")}
        {btn("横等間隔", { op: "distribute", ids, direction: "horizontal" }, 3)}
        {btn("縦等間隔", { op: "distribute", ids, direction: "vertical" }, 3)}
        {btn("サイズ揃え", { op: "normalizeSize", ids }, 2)}
        {btn("左右反転複製", { op: "mirror", ids, axis: "x" }, 1)}
        {btn("上下反転複製", { op: "mirror", ids, axis: "y" }, 1)}
        {btn("放射配置", { op: "radial", center: ids[0], ids: ids.slice(1) }, 3, "最初に選んだノードを中心に、残りを等角度で並べる")}
      </div>
      <div class="group">
        {btn("吸着", { op: "snapToGrid" }, 0)}
        {btn("中央寄せ", { op: "centerContent" }, 0)}
        {btn("tidy", { op: "tidy" }, 0)}
        <button disabled={!p.canUndo} onClick={p.onUndo} title="Ctrl+Z">
          元に戻す
        </button>
        <button disabled={!p.canRedo} onClick={p.onRedo} title="Ctrl+Shift+Z">
          やり直す
        </button>
      </div>
    </header>
  );
}

// ---- インスペクタ ----

interface InspectorProps {
  doc: IconDoc;
  selection: string[];
  onOp: (op: Op) => void;
}

function routeShorthand(r: Route): string {
  return r.type === "straight" ? "straight" : r.bend;
}

function NodeFields({ nodes, onOp }: { nodes: IconNode[]; onOp: (op: Op) => void }) {
  const ids = nodes.map((n) => n.id);
  return (
    <>
      <Select label="形" value={common(nodes, (n) => n.shape) as IconNode["shape"] | ""} options={shapeOptions} onChange={(shape) => onOp({ op: "setShape", ids, shape })} />
      <Select label="塗り" value={common(nodes, (n) => n.fill) as IconNode["fill"] | ""} options={fillOptions} onChange={(fill) => onOp({ op: "setFill", ids, fill })} />
      <Select label="サイズ" value={common(nodes, (n) => n.size) as IconNode["size"] | ""} options={sizeOptions} onChange={(size) => onOp({ op: "setSize", ids, size })} />
    </>
  );
}

/** frame / table / text の大きさと属性 */
function BoxFields({ node: n, onOp }: { node: IconNode; onOp: (op: Op) => void }) {
  const set = (props: Record<string, unknown>) => onOp({ op: "setBox", ids: [n.id], ...props });
  const positive = (v: number | undefined) => v !== undefined && v > 0;
  return (
    <>
      <NumberField label="幅" value={n.w} onChange={(v) => positive(v) && set({ w: v })} />
      {n.shape !== "text" && <NumberField label="高さ" value={n.h} onChange={(v) => positive(v) && set({ h: v })} />}
      {n.shape === "table" && (
        <>
          <NumberField label="列" step={1} value={n.cols} onChange={(v) => positive(v) && set({ cols: Math.round(v!) })} />
          <NumberField label="行" step={1} value={n.rows} onChange={(v) => positive(v) && set({ rows: Math.round(v!) })} />
        </>
      )}
      {n.shape === "text" && <NumberField label="行数" step={1} value={n.lines} onChange={(v) => positive(v) && set({ lines: Math.round(v!) })} />}
      {n.shape !== "text" && (
        <label class="field">
          <span>{n.shape === "table" ? "見出し" : "タイトル"}</span>
          <input type="checkbox" checked={!!n.header} onChange={(e) => set({ header: (e.target as HTMLInputElement).checked })} />
        </label>
      )}
      {n.shape === "frame" && (
        <label class="field">
          <span>タブ</span>
          <input type="checkbox" checked={!!n.tab} onChange={(e) => set({ tab: (e.target as HTMLInputElement).checked })} />
        </label>
      )}
    </>
  );
}

function EdgeLookFields({ edges, onOp }: { edges: IconEdge[]; onOp: (op: Op) => void }) {
  const ids = edges.map((e) => e.id);
  return (
    <>
      <Select label="線種" value={common(edges, (e) => e.dash ?? "solid") as EdgeDash | ""} options={dashOptions} onChange={(dash) => onOp({ op: "setDash", ids, dash })} />
      <Select label="矢印" value={common(edges, (e) => e.arrow ?? "none") as EdgeArrow | ""} options={arrowOptions} onChange={(arrow) => onOp({ op: "setArrow", ids, arrow })} />
      <div class="field">
        <span />
        <button onClick={() => onOp({ op: "reverse", ids })}>向きを反転</button>
      </div>
    </>
  );
}

export function Inspector({ doc, selection, onOp }: InspectorProps) {
  const nodes = selection.map((id) => findNode(doc, id)).filter((n) => !!n);
  const edges = selection.map((id) => doc.edges.find((e) => e.id === id)).filter((e) => !!e);

  if (nodes.length === 1 && edges.length === 0) {
    const n = nodes[0]!;
    return (
      <section class="panel">
        <h2>ノード {n.id}</h2>
        <NodeFields nodes={nodes} onOp={onOp} />
        <NumberField label="x" value={n.x} onChange={(v) => v !== undefined && onOp({ op: "moveNode", id: n.id, x: v, y: n.y })} />
        <NumberField label="y" value={n.y} onChange={(v) => v !== undefined && onOp({ op: "moveNode", id: n.id, x: n.x, y: v })} />
        {isBox(n.shape) && <BoxFields node={n} onOp={onOp} />}
      </section>
    );
  }

  if (edges.length === 1 && nodes.length === 0) {
    const e = edges[0]!;
    const r = e.route;
    const setRoute = (route: Route) => onOp({ op: "setRoute", id: e.id, route });
    const withMid = r.type !== "straight" && r.bend !== "hv" && r.bend !== "vh" ? r : null;
    return (
      <section class="panel">
        <h2>エッジ {e.id}</h2>
        <p class="muted">
          {e.from} → {e.to}
        </p>
        <Select label="経路" value={routeShorthand(r)} options={ROUTES} onChange={(route) => onOp({ op: "setRoute", id: e.id, route })} />
        {withMid && <NumberField label="mid" value={withMid.mid} onChange={(v) => setRoute({ ...withMid, mid: v })} />}
        {r.type === "slant" && <NumberField label="span" value={r.span} onChange={(v) => setRoute({ ...r, span: v })} />}
        <EdgeLookFields edges={edges} onOp={onOp} />
      </section>
    );
  }

  if (selection.length) {
    return (
      <section class="panel">
        <h2>{selection.length} 個を選択中</h2>
        <p class="muted">
          ノード {nodes.length}、エッジ {edges.length}
        </p>
        {nodes.length > 0 && <NodeFields nodes={nodes} onOp={onOp} />}
        {edges.length > 0 && <EdgeLookFields edges={edges} onOp={onOp} />}
      </section>
    );
  }

  return (
    <section class="panel">
      <h2>{doc.name}</h2>
      <p class="muted">
        {doc.canvas.cols} × {doc.canvas.rows}、ノード {doc.nodes.length}、エッジ {doc.edges.length}
      </p>
    </section>
  );
}

// ---- lint 結果 ----

export function LintPanel({ issues, onSelect }: { issues: Issue[]; onSelect: (ids: string[]) => void }) {
  return (
    <section class="panel">
      <h2>lint {issues.length ? `(${issues.length})` : ""}</h2>
      {issues.length === 0 ? (
        <p class="ok">問題なし</p>
      ) : (
        <ul class="issues">
          {issues.map((i) => (
            <li class={i.severity} onClick={() => onSelect(i.ids)}>
              <b>{i.rule}</b>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
