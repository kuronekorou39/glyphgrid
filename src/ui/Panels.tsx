import { useState } from "preact/hooks";
import { NODE_KINDS, SIZE_TOKENS, findNode, renderSvg, type IconDoc, type Issue, type Op, type Route, type Style } from "../core/index.js";
import type { SetInfo } from "./api.js";
import { ROUTES, TOOLS, type Tool } from "./tools.js";

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
  route: string;
  selectedNodes: string[];
  canUndo: boolean;
  canRedo: boolean;
  onTool: (t: Tool) => void;
  onRoute: (r: string) => void;
  onOp: (op: Op) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({ tool, route, selectedNodes: ids, canUndo, canRedo, onTool, onRoute, onOp, onUndo, onRedo }: ToolbarProps) {
  const btn = (label: string, op: Op, min: number, title?: string) => (
    <button disabled={ids.length < min} title={title} onClick={() => onOp(op)}>
      {label}
    </button>
  );
  return (
    <header class="toolbar">
      <div class="group">
        {TOOLS.map((t) => (
          <button class={tool === t.tool ? "on" : ""} title={`ショートカット: ${t.key}`} onClick={() => onTool(t.tool)}>
            {t.label}
          </button>
        ))}
        <select value={route} title="新しいエッジの線種(選択中のエッジにも適用)" onChange={(e) => onRoute((e.target as HTMLSelectElement).value)}>
          {ROUTES.map((r) => (
            <option value={r.value}>{r.label}</option>
          ))}
        </select>
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
        <button disabled={!canUndo} onClick={onUndo} title="Ctrl+Z">
          元に戻す
        </button>
        <button disabled={!canRedo} onClick={onRedo} title="Ctrl+Shift+Z">
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

function routeShorthand(r: Route): string {
  return r.type === "straight" ? "straight" : r.bend;
}

export function Inspector({ doc, selection, onOp }: InspectorProps) {
  const nodes = selection.map((id) => findNode(doc, id)).filter((n) => !!n);
  const edges = selection.map((id) => doc.edges.find((e) => e.id === id)).filter((e) => !!e);

  if (nodes.length === 1 && edges.length === 0) {
    const n = nodes[0]!;
    return (
      <section class="panel">
        <h2>ノード {n.id}</h2>
        <label class="field">
          <span>種類</span>
          <select value={n.kind} onChange={(e) => onOp({ op: "setKind", ids: [n.id], kind: (e.target as HTMLSelectElement).value })}>
            {NODE_KINDS.map((k) => (
              <option value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>サイズ</span>
          <select value={n.size} onChange={(e) => onOp({ op: "setSize", ids: [n.id], size: (e.target as HTMLSelectElement).value })}>
            {SIZE_TOKENS.map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </label>
        <NumberField label="x" value={n.x} onChange={(v) => v !== undefined && onOp({ op: "moveNode", id: n.id, x: v, y: n.y })} />
        <NumberField label="y" value={n.y} onChange={(v) => v !== undefined && onOp({ op: "moveNode", id: n.id, x: n.x, y: v })} />
      </section>
    );
  }

  if (edges.length === 1 && nodes.length === 0) {
    const e = edges[0]!;
    const r = e.route;
    const setRoute = (route: Route) => onOp({ op: "setRoute", id: e.id, route });
    const hasMid = r.type !== "straight" && r.bend !== "hv" && r.bend !== "vh" ? r : null;
    return (
      <section class="panel">
        <h2>エッジ {e.id}</h2>
        <p class="muted">
          {e.from} → {e.to}
        </p>
        <label class="field">
          <span>線種</span>
          <select
            value={routeShorthand(r)}
            onChange={(ev) => onOp({ op: "setRoute", id: e.id, route: (ev.target as HTMLSelectElement).value })}
          >
            {ROUTES.map((x) => (
              <option value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
        {hasMid && (
          <NumberField label="mid" value={hasMid.mid} onChange={(v) => setRoute({ ...hasMid, mid: v })} />
        )}
        {r.type === "slant" && <NumberField label="span" value={r.span} onChange={(v) => setRoute({ ...r, span: v })} />}
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
        {nodes.length > 0 && (
          <label class="field">
            <span>サイズ</span>
            <select value="" onChange={(e) => onOp({ op: "setSize", ids: nodes.map((n) => n.id), size: (e.target as HTMLSelectElement).value })}>
              <option value="" disabled>
                変更…
              </option>
              {SIZE_TOKENS.map((s) => (
                <option value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
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
