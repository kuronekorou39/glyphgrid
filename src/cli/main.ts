#!/usr/bin/env node
// glyphgrid CLI。ファイル I/O はこのディレクトリだけで行う。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  COMMANDS,
  DEFAULT_STYLE,
  applyOp,
  applyOps,
  argsFromCli,
  emptyDoc,
  formatDoc,
  parseDoc,
  parseStyle,
  renderSvg,
  type IconDoc,
  type Op,
  type Style,
} from "../core/index.js";
import { renderSheet } from "../core/render/sheet.js";

const ICON_EXT = ".icon.json";
const STYLE_FILE = "style.json";

const USAGE = `glyphgrid <command> [args]

  new <set>/<name> [--cols 12] [--rows 12] [--root .]   空のアイコンを sets/ に作る
  apply <icon.json> <ops.json|->                         ops を一括適用して上書き保存
  run <icon.json> <command> [args...]                    単発コマンド(key=value でも指定可)
  tidy <icon.json>                                       整形して上書き保存
  export <icon.json|set-dir> --format svg|png --out <dir> [--scale 1]
  sheet <set-dir> --out sheet.png|sheet.svg [--columns n] [--scale 1]
  commands                                               コマンド一覧

共通オプション: --style <style.json>(省略時はアイコンの親ディレクトリから探す)
  --dry-run(apply / run / tidy で保存せず結果を表示)`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(["dry-run", "help"]);

function parseArgv(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) flags[k!] = v;
      else if (BOOLEAN_FLAGS.has(k!) || i + 1 >= argv.length) flags[k!] = true;
      else flags[k!] = argv[++i]!;
    } else positional.push(a);
  }
  return { positional, flags };
}

function flagStr(p: Parsed, name: string): string | undefined {
  const v = p.flags[name];
  return typeof v === "string" ? v : undefined;
}

function flagNum(p: Parsed, name: string, fallback: number): number {
  const v = flagStr(p, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} は正の数です`);
  return n;
}

function readJson(path: string): unknown {
  const text = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path} の JSON を読めません: ${(e as Error).message}`);
  }
}

const readDoc = (path: string): IconDoc => parseDoc(readJson(path));

/** アイコンの親ディレクトリを上にたどって style.json を探す */
function findStyle(start: string): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, STYLE_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function loadStyle(p: Parsed, target: string): Style {
  const explicit = flagStr(p, "style");
  const isDir = existsSync(target) && statSync(target).isDirectory();
  const path = explicit ?? findStyle(isDir ? target : dirname(target));
  return path ? parseStyle(readJson(path)) : DEFAULT_STYLE;
}

/** アイコンファイル、またはセットのディレクトリ(icons/ を含む)からアイコン一覧を得る */
function listIcons(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  const dir = existsSync(join(target, "icons")) ? join(target, "icons") : target;
  return readdirSync(dir)
    .filter((f) => f.endsWith(ICON_EXT))
    .sort()
    .map((f) => join(dir, f));
}

function iconBaseName(path: string): string {
  return basename(path).replace(ICON_EXT, "").replace(/\.json$/, "");
}

function toPng(svg: string, scale: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale } }).render().asPng();
}

function saveDoc(p: Parsed, path: string, doc: IconDoc): void {
  const text = formatDoc(doc);
  if (p.flags["dry-run"]) process.stdout.write(text);
  else {
    writeFileSync(path, text);
    console.log(`更新しました: ${path}(ノード ${doc.nodes.length}、エッジ ${doc.edges.length})`);
  }
}

function need(p: Parsed, n: number, usage: string): string[] {
  if (p.positional.length < n) throw new Error(`使い方: glyphgrid ${usage}`);
  return p.positional;
}

const handlers: Record<string, (p: Parsed) => void> = {
  new(p) {
    const [, spec] = need(p, 2, "new <set>/<name>");
    const m = /^([^/\\]+)[/\\]([^/\\]+)$/.exec(spec!);
    if (!m) throw new Error("new の引数は <set>/<name> の形です");
    const [, set, name] = m as unknown as [string, string, string];
    const setDir = join(flagStr(p, "root") ?? ".", "sets", set);
    const iconPath = join(setDir, "icons", `${name}${ICON_EXT}`);
    if (existsSync(iconPath)) throw new Error(`すでにあります: ${iconPath}`);
    mkdirSync(dirname(iconPath), { recursive: true });
    const stylePath = join(setDir, STYLE_FILE);
    if (!existsSync(stylePath)) {
      writeFileSync(stylePath, JSON.stringify(DEFAULT_STYLE, null, 2) + "\n");
      console.log(`作成しました: ${stylePath}`);
    }
    const doc = emptyDoc(name, { cols: flagNum(p, "cols", 12), rows: flagNum(p, "rows", 12) });
    writeFileSync(iconPath, formatDoc(doc));
    console.log(`作成しました: ${iconPath}`);
  },

  apply(p) {
    const [, iconPath, opsPath] = need(p, 3, "apply <icon.json> <ops.json|->");
    const ops = readJson(opsPath!) as Op[];
    saveDoc(p, iconPath!, applyOps(readDoc(iconPath!), loadStyle(p, iconPath!), ops));
  },

  run(p) {
    const [, iconPath, name, ...rest] = need(p, 3, "run <icon.json> <command> [args...]");
    const op: Op = { op: name!, ...argsFromCli(name!, rest) };
    saveDoc(p, iconPath!, applyOp(readDoc(iconPath!), loadStyle(p, iconPath!), op));
  },

  tidy(p) {
    const [, iconPath] = need(p, 2, "tidy <icon.json>");
    saveDoc(p, iconPath!, applyOp(readDoc(iconPath!), loadStyle(p, iconPath!), { op: "tidy" }));
  },

  export(p) {
    const [, target] = need(p, 2, "export <icon.json|set-dir> --format svg|png --out <dir>");
    const format = flagStr(p, "format") ?? "svg";
    if (format !== "svg" && format !== "png") throw new Error("--format は svg か png です");
    const out = flagStr(p, "out") ?? "out";
    const scale = flagNum(p, "scale", 1);
    const style = loadStyle(p, target!);
    mkdirSync(out, { recursive: true });
    for (const file of listIcons(target!)) {
      const svg = renderSvg(readDoc(file), style);
      const dest = join(out, `${iconBaseName(file)}.${format}`);
      writeFileSync(dest, format === "svg" ? svg : toPng(svg, scale));
      console.log(dest);
    }
  },

  sheet(p) {
    const [, target] = need(p, 2, "sheet <set-dir> --out sheet.png");
    const out = flagStr(p, "out") ?? "sheet.png";
    const style = loadStyle(p, target!);
    const docs = listIcons(target!).map(readDoc);
    if (!docs.length) throw new Error(`アイコンがありません: ${target}`);
    const columns = flagStr(p, "columns") ? flagNum(p, "columns", 3) : undefined;
    const svg = renderSheet(docs, style, { columns });
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, out.endsWith(".svg") ? svg : toPng(svg, flagNum(p, "scale", 1)));
    console.log(out);
  },

  commands() {
    for (const [name, def] of Object.entries(COMMANDS)) {
      console.log(`  ${`${name} ${def.params.join(" ")}`.padEnd(44)}${def.summary}`);
    }
  },
};

function main(argv: string[]): number {
  const p = parseArgv(argv);
  const cmd = p.positional[0];
  if (!cmd || p.flags.help || cmd === "help") {
    console.log(USAGE);
    return cmd ? 0 : 1;
  }
  const handler = handlers[cmd];
  if (!handler) {
    console.error(`未知のコマンドです: ${cmd}\n\n${USAGE}`);
    return 1;
  }
  try {
    handler(p);
    return 0;
  } catch (e) {
    console.error(`エラー: ${(e as Error).message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
