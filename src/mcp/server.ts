// MCP サーバー。Claude などの LLM が、人と同じコマンド群で sets/ のアイコンを編集する。
// 書き込んだファイルは開発サーバーの監視で Web UI に即時反映される。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  COMMANDS,
  EDGE_ARROWS,
  EDGE_DASHES,
  NODE_FILLS,
  NODE_SHAPES,
  SIZE_TOKENS,
  applyOps,
  formatDoc,
  lint,
  renderSvg,
  type Issue,
  type Op,
} from "../core/index.js";
import { renderSheet } from "../core/render/sheet.js";
import { toPng } from "../server/png.js";
import { createSetsApi } from "../server/sets-api.js";

const INSTRUCTIONS = `glyphgrid: グリッド上のノード + エッジでアイコンを作るツール。
座標はグリッド単位(0.5 刻み)。キャンバスの既定は 12×12、外周 padding 1 の内側に収める。

作業手順:
1. create_icon で空のアイコンを作る(既存なら get_icon で中身を見る)
2. apply_ops でノードとエッジを追加する。座標はおおまかでよく、align / distribute / radial などで整え、最後に tidy
3. 結果の lint が空になるまで直す
4. render で PNG を見て確認する。セット全体の統一感は render の icon 省略(シート)で確認する

要素:
- ノード shape: ${NODE_SHAPES.join(" | ")} / fill: ${NODE_FILLS.join(" | ")} / size: ${SIZE_TOKENS.join(" | ")}
  記号マーク check / cross / sparkle(AI)/ cursor(操作)は size で大きさが決まる
  箱 frame(画面・入れ物。header でタイトルバー、tab でフォルダ形)/ table(cols・rows、header で見出し行を塗る)/ text(文字の代わりの横棒を lines 本)は w・h で大きさを決める
  frame / table の内側に置いたノードは入れ子として扱う(重なりにならない)。表のセルに置くときは、セルの中心が 0.5 グリッドに乗るよう w を cols の倍数にする
- エッジ route(短縮形): straight | hv | vh | hvh[:mid] | vhv[:mid] | hdh[:mid[:span]] | vdv[:mid[:span]]
  hvh の mid は縦の幹の x、vhv の mid は横の幹の y。同じ始点で同じ mid のエッジは幹を共有する(分岐)
- エッジ dash: ${EDGE_DASHES.join(" | ")} / arrow: ${EDGE_ARROWS.join(" | ")}
- addNode / connect に id を付けると、同じ ops の後続から参照できる
寸法・線幅・色は style.json で決まり、アイコン側では変えない。見た目をセット全体で変えたいときは update_style を使う。`;

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });
const fail = (e: unknown): CallToolResult => ({ content: [{ type: "text", text: `エラー: ${(e as Error).message}` }], isError: true });
const png = (svg: string, scale: number) => ({ type: "image" as const, data: toPng(svg, scale).toString("base64"), mimeType: "image/png" });

function formatIssues(issues: Issue[]): string {
  if (!issues.length) return "lint: 問題なし";
  return ["lint:", ...issues.map((i) => `  ${i.severity} ${i.rule}: ${i.message}`)].join("\n");
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** オブジェクトだけを再帰的に重ねる(配列や値は置き換え) */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base[k], v);
  return out;
}

const setArg = z.string().describe("セット名(sets/ 直下のディレクトリ名)");
const iconArg = z.string().describe("アイコン名(拡張子 .icon.json を除いたファイル名)");
const scaleArg = z.number().positive().max(8).optional().describe("PNG の倍率(既定 1。1 で 1 グリッド = style.unit px)");

export function createGlyphgridServer(setsDir: string): McpServer {
  const api = createSetsApi(setsDir);
  const server = new McpServer({ name: "glyphgrid", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_sets",
    { description: "セットとアイコンの一覧を返す", inputSchema: {} },
    async () => {
      try {
        const sets = api.listSets();
        return text(sets.length ? sets.map((s) => `${s.name}: ${s.icons.join(", ") || "(空)"}`).join("\n") : "セットがありません");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_commands",
    { description: "apply_ops で使えるコマンドと引数の一覧を返す", inputSchema: {} },
    async () =>
      text(
        Object.entries(COMMANDS)
          .map(([name, def]) => `${name}(${def.params.join(", ")}): ${def.summary}`)
          .join("\n"),
      ),
  );

  server.registerTool(
    "get_icon",
    { description: "アイコンの JSON と lint 結果を返す", inputSchema: { set: setArg, icon: iconArg } },
    async ({ set, icon }) => {
      try {
        const doc = api.readIcon(set, icon);
        return text(`${formatDoc(doc)}\n${formatIssues(lint(doc, api.readStyle(set)))}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_icon",
    {
      description: "空のアイコンを作る。セットがなければ既定のスタイルで作る",
      inputSchema: {
        set: setArg,
        icon: iconArg,
        cols: z.number().int().positive().optional().describe("キャンバスの横グリッド数(既定 12)"),
        rows: z.number().int().positive().optional().describe("キャンバスの縦グリッド数(既定 12)"),
      },
    },
    async ({ set, icon, cols, rows }) => {
      try {
        const doc = api.createIcon(set, icon, { cols: cols ?? 12, rows: rows ?? 12 });
        return text(`作成しました: ${set}/${icon}(${doc.canvas.cols}×${doc.canvas.rows})`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "apply_ops",
    {
      description:
        "ops 配列を順に適用して保存し、結果の JSON と lint を返す。途中の op が失敗したら何も保存しない。preview: true で PNG も返す",
      inputSchema: {
        set: setArg,
        icon: iconArg,
        ops: z.array(z.looseObject({ op: z.string() })).describe('例: [{"op":"addNode","id":"a","shape":"circle","fill":"solid","x":2,"y":6}]'),
        dryRun: z.boolean().optional().describe("true なら保存せずに結果だけ返す"),
        preview: z.boolean().optional().describe("true なら結果の PNG も返す"),
      },
    },
    async ({ set, icon, ops, dryRun, preview }) => {
      try {
        const style = api.readStyle(set);
        const doc = applyOps(api.readIcon(set, icon), style, ops as Op[]);
        if (!dryRun) api.writeIcon(set, icon, doc);
        const summary = `${dryRun ? "(保存していません)" : "保存しました"}: ${set}/${icon}、ノード ${doc.nodes.length}、エッジ ${doc.edges.length}`;
        const result = text(`${summary}\n${formatDoc(doc)}\n${formatIssues(lint(doc, style))}`);
        if (preview) result.content.push(png(renderSvg(doc, style), 1));
        return result;
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "lint",
    { description: "アイコン(省略時はセット全体)を検査する", inputSchema: { set: setArg, icon: iconArg.optional() } },
    async ({ set, icon }) => {
      try {
        const style = api.readStyle(set);
        const names = icon ? [icon] : (api.listSets().find((s) => s.name === set)?.icons ?? []);
        return text(names.map((n) => `${n}\n${formatIssues(lint(api.readIcon(set, n), style))}`).join("\n\n") || "アイコンがありません");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "render",
    {
      description: "アイコンを PNG で返す。icon を省略するとセット全体を並べたシートを返す(統一感の確認用)",
      inputSchema: { set: setArg, icon: iconArg.optional(), scale: scaleArg },
    },
    async ({ set, icon, scale }) => {
      try {
        const style = api.readStyle(set);
        if (icon) return { content: [png(renderSvg(api.readIcon(set, icon), { ...style, background: "#ffffff" }), scale ?? 1)] };
        const names = api.listSets().find((s) => s.name === set)?.icons ?? [];
        if (!names.length) return text("アイコンがありません");
        return { content: [text(names.join(", ")).content[0]!, png(renderSheet(names.map((n) => api.readIcon(set, n)), style), scale ?? 1)] };
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_style",
    { description: "セットの style.json を返す(数値はグリッド単位、unit だけ px)", inputSchema: { set: setArg } },
    async ({ set }) => {
      try {
        return text(JSON.stringify(api.readStyle(set), null, 2));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_style",
    {
      description: "style.json の一部を書き換える(オブジェクトは再帰的に重ねる)。セット内の全アイコンの見た目が変わる",
      inputSchema: {
        set: setArg,
        patch: z.record(z.string(), z.unknown()).describe('例: {"stroke": {"width": 0.25}, "node": {"circle": {"m": 2.2}}}'),
      },
    },
    async ({ set, patch }) => {
      try {
        const style = api.writeStyle(set, deepMerge(api.readStyle(set), patch));
        return text(`更新しました: ${set}/style.json\n${JSON.stringify(style, null, 2)}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
