import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  DEFAULT_STYLE,
  applyOp,
  createHistory,
  findNode,
  lint,
  pushHistory,
  redo,
  undo,
  type History,
  type IconDoc,
  type Op,
  type Style,
} from "../core/index.js";
import { api, onFileChange, type AppInfo, type SetInfo } from "./api.js";
import { AppPanel } from "./AppPanel.js";
import { Canvas } from "./Canvas.js";
import { Inspector, LintPanel, Sidebar, Toolbar } from "./Panels.js";
import { NODE_FILLS } from "../core/index.js";
import { SHAPE_KEYS, type EdgeLook, type NodeLook, type Tool } from "./tools.js";

/** 編集が止まってから保存するまでの待ち時間(ms) */
const SAVE_DELAY = 300;

const sameDoc = (a: IconDoc, b: IconDoc) => JSON.stringify(a) === JSON.stringify(b);

export function App() {
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [set, setSet] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [thumbs, setThumbs] = useState<Record<string, IconDoc>>({});
  const [history, setHistory] = useState<History | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [nodeLook, setNodeLook] = useState<NodeLook>({ shape: "circle", fill: "solid" });
  const [edgeLook, setEdgeLook] = useState<EdgeLook>({ route: "straight", dash: "solid", arrow: "none" });
  const [status, setStatus] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  const doc = history?.present ?? null;
  // ファイル監視のハンドラから最新の状態を読むための参照
  const live = useRef({ set, icon, history, saved: null as IconDoc | null });
  live.current = { ...live.current, set, icon, history };

  const report = (e: unknown) => setStatus(`エラー: ${(e as Error).message}`);

  // ---- 読み込み ----

  useEffect(() => {
    api.info().then(setAppInfo).catch(report);
    api
      .listSets()
      .then((list) => {
        setSets(list);
        const params = new URLSearchParams(location.search);
        const first = list.find((s) => s.name === params.get("set")) ?? list[0];
        if (first) {
          setSet(first.name);
          setIcon(params.get("icon") ?? first.icons[0] ?? null);
        }
      })
      .catch(report);
  }, []);

  useEffect(() => {
    if (!set) return;
    api.readStyle(set).then(setStyle).catch(report);
    const info = sets.find((s) => s.name === set);
    Promise.all((info?.icons ?? []).map(async (name) => [name, await api.readIcon(set, name)] as const))
      .then((entries) => setThumbs(Object.fromEntries(entries)))
      .catch(report);
  }, [set, sets]);

  useEffect(() => {
    if (!set || !icon) return;
    api
      .readIcon(set, icon)
      .then((d) => {
        live.current.saved = d;
        setHistory(createHistory(d));
        setSelection([]);
        rememberInUrl(set, icon);
      })
      .catch(report);
  }, [set, icon]);

  // ---- 保存(編集が止まったら書き込む) ----

  useEffect(() => {
    if (!doc || !set || !icon) return;
    if (live.current.saved && sameDoc(live.current.saved, doc)) return;
    const timer = setTimeout(() => {
      api
        .writeIcon(set, icon, doc)
        .then(() => {
          live.current.saved = doc;
          setStatus("保存しました");
        })
        .catch(report);
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [doc, set, icon]);

  // ---- ファイル監視(Claude Code などが JSON を書き換えたら反映する) ----

  useEffect(
    () =>
      onFileChange(async (ev) => {
        const cur = live.current;
        if (ev.set !== cur.set) {
          if (!sets.some((s) => s.name === ev.set)) api.listSets().then(setSets).catch(report);
          return;
        }
        if (ev.icon === null) {
          api.readStyle(ev.set).then(setStyle).catch(report);
          setStatus("style.json を再読み込みしました");
          return;
        }
        let d: IconDoc;
        try {
          d = await api.readIcon(ev.set, ev.icon);
        } catch {
          // 削除された、または書きかけで読めない。一覧だけ更新する
          api.listSets().then(setSets).catch(report);
          return;
        }
        setThumbs((t) => ({ ...t, [ev.icon!]: d }));
        setSets((list) =>
          list.map((s) => (s.name === ev.set && !s.icons.includes(ev.icon!) ? { ...s, icons: [...s.icons, ev.icon!].sort() } : s)),
        );
        if (ev.icon === cur.icon && cur.history && !sameDoc(d, cur.history.present)) {
          live.current.saved = d;
          setHistory((h) => (h ? pushHistory(h, d) : createHistory(d)));
          setStatus("外部の変更を反映しました");
        }
      }),
    [sets],
  );

  // ---- 編集 ----

  const commit = useCallback((next: IconDoc) => {
    setHistory((h) => (h ? pushHistory(h, next) : h));
  }, []);

  const exec = useCallback(
    (op: Op) => {
      const h = live.current.history;
      if (!h) return;
      try {
        const next = applyOp(h.present, style, op);
        setHistory(pushHistory(h, next));
        if (op.op === "addNode") {
          const added = next.nodes[next.nodes.length - 1];
          if (added) setSelection([added.id]);
        }
        setStatus("");
      } catch (e) {
        report(e);
      }
    },
    [style],
  );

  // 消えた id を選択から外す
  useEffect(() => {
    if (!doc) return;
    setSelection((sel) => {
      const kept = sel.filter((id) => findNode(doc, id) || doc.edges.some((e) => e.id === id));
      return kept.length === sel.length ? sel : kept;
    });
  }, [doc]);

  const selectedNodes = doc ? selection.filter((id) => findNode(doc, id)) : [];
  const selectedEdges = doc ? selection.filter((id) => doc.edges.some((e) => e.id === id)) : [];

  /** 新しいエッジの見た目を変える。エッジを選択中ならそれにも適用する */
  const changeEdgeLook = (change: Partial<EdgeLook>) => {
    setEdgeLook((l) => ({ ...l, ...change }));
    if (!selectedEdges.length) return;
    if (change.route) exec({ op: "setRoute", ids: selectedEdges, route: change.route });
    if (change.dash) exec({ op: "setDash", ids: selectedEdges, dash: change.dash });
    if (change.arrow) exec({ op: "setArrow", ids: selectedEdges, arrow: change.arrow });
  };

  const deleteSelection = () => {
    if (!doc || !selection.length) return;
    let next = doc;
    try {
      if (selectedEdges.length) next = applyOp(next, style, { op: "disconnect", ids: selectedEdges });
      if (selectedNodes.length) next = applyOp(next, style, { op: "removeNode", ids: selectedNodes });
      commit(next);
      setSelection([]);
    } catch (e) {
      report(e);
    }
  };

  // ---- キーボード ----

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        setHistory((h) => (h ? (e.shiftKey ? redo(h) : undo(h)) : h));
      } else if (mod && key === "y") {
        setHistory((h) => (h ? redo(h) : h));
      } else if (mod && key === "a") {
        if (doc) setSelection(doc.nodes.map((n) => n.id));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key.startsWith("Arrow") && selectedNodes.length) {
        const step = e.shiftKey ? 1 : 0.5;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        exec({ op: "nudge", ids: selectedNodes, dx, dy });
      } else if (e.key === "Escape") {
        setSelection([]);
        setTool("select");
      } else if (!mod) {
        const shape = SHAPE_KEYS[key];
        if (key === "v") setTool("select");
        else if (key === "c") setTool("connect");
        else if (key === "f") setNodeLook((l) => ({ ...l, fill: NODE_FILLS[(NODE_FILLS.indexOf(l.fill) + 1) % NODE_FILLS.length]! }));
        else if (shape) {
          setNodeLook((l) => ({ ...l, shape }));
          setTool("node");
        } else return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const issues = useMemo(() => (doc ? lint(doc, style) : []), [doc, style]);

  const createIcon = (name: string) => {
    if (!set) return;
    api
      .createIcon(set, name)
      .then((d) => {
        setThumbs((t) => ({ ...t, [name]: d }));
        setSets((list) => list.map((s) => (s.name === set ? { ...s, icons: [...new Set([...s.icons, name])].sort() } : s)));
        setIcon(name);
      })
      .catch(report);
  };

  const thumbsWithCurrent = icon && doc ? { ...thumbs, [icon]: doc } : thumbs;

  return (
    <div class="app">
      <Sidebar
        sets={sets}
        set={set}
        icon={icon}
        thumbs={thumbsWithCurrent}
        style={style}
        onSet={(s) => {
          setSet(s);
          setIcon(sets.find((x) => x.name === s)?.icons[0] ?? null);
        }}
        onIcon={setIcon}
        onCreate={createIcon}
      />
      <Toolbar
        tool={tool}
        nodeLook={nodeLook}
        edgeLook={edgeLook}
        style={style}
        selectedNodes={selectedNodes}
        canUndo={!!history?.past.length}
        canRedo={!!history?.future.length}
        onTool={setTool}
        onNodeLook={setNodeLook}
        onEdgeLook={changeEdgeLook}
        onOp={exec}
        onUndo={() => setHistory((h) => (h ? undo(h) : h))}
        onRedo={() => setHistory((h) => (h ? redo(h) : h))}
      />
      <main class="stage">
        {doc ? (
          <Canvas
            doc={doc}
            style={style}
            selection={selection}
            issues={issues}
            tool={tool}
            nodeLook={nodeLook}
            edgeLook={edgeLook}
            onSelect={setSelection}
            onCommit={commit}
            onOp={exec}
          />
        ) : (
          <p class="empty">{sets.length ? "アイコンを選んでください" : "sets/ にセットがありません"}</p>
        )}
      </main>
      <aside class="inspector">
        {doc && <Inspector doc={doc} selection={selection} onOp={exec} />}
        {doc && <LintPanel issues={issues} onSelect={setSelection} />}
        {appInfo && <AppPanel info={appInfo} />}
        <section class="panel help">
          <h2>操作</h2>
          <p>
            ドラッグで移動 / 空白ドラッグで範囲選択 / Shift で追加選択 / Alt+ドラッグ か「接続」ツールでつなぐ / 矢印で 0.5 移動(Shift で 1)/
            Delete で削除 / Ctrl+Z・Ctrl+Shift+Z
          </p>
        </section>
      </aside>
      <footer class="status">{status}</footer>
    </div>
  );
}

/** 再読み込みしても同じアイコンを開けるよう URL に残す */
function rememberInUrl(set: string, icon: string) {
  const url = new URL(location.href);
  url.searchParams.set("set", set);
  url.searchParams.set("icon", icon);
  window.history.replaceState(null, "", url);
}
