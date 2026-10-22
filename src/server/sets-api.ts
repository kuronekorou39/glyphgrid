// 開発サーバー用:sets/ 配下の読み書き API と、ファイル変更の通知。
// ブラウザからは /api/... で呼ぶ。Tauri 化(M4)でこの層を置き換える。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";
import { DEFAULT_STYLE, emptyDoc, formatDoc, parseDoc, parseStyle } from "../core/index.js";

const ICON_EXT = ".icon.json";
const SAFE_NAME = /^[\w.-]+$/;
export const CHANGE_EVENT = "glyphgrid:change";

export interface SetInfo {
  name: string;
  icons: string[];
}

export interface ChangeEvent {
  set: string;
  /** アイコン名。style.json の変更なら null */
  icon: string | null;
}

function safe(name: string, what: string): string {
  if (!SAFE_NAME.test(name) || name.startsWith(".")) throw new HttpError(400, `${what} の名前が不正です: ${name}`);
  return name;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createSetsApi(setsDir: string) {
  const setDir = (set: string) => join(setsDir, safe(set, "セット"));
  const iconPath = (set: string, icon: string) => join(setDir(set), "icons", `${safe(icon, "アイコン")}${ICON_EXT}`);

  return {
    listSets(): SetInfo[] {
      if (!existsSync(setsDir)) return [];
      return readdirSync(setsDir)
        .filter((name) => SAFE_NAME.test(name) && statSync(join(setsDir, name)).isDirectory())
        .sort()
        .map((name) => {
          const dir = join(setsDir, name, "icons");
          const icons = existsSync(dir)
            ? readdirSync(dir).filter((f) => f.endsWith(ICON_EXT)).map((f) => f.slice(0, -ICON_EXT.length)).sort()
            : [];
          return { name, icons };
        });
    },

    readStyle(set: string) {
      const path = join(setDir(set), "style.json");
      return existsSync(path) ? parseStyle(JSON.parse(readFileSync(path, "utf8"))) : DEFAULT_STYLE;
    },

    readIcon(set: string, icon: string) {
      const path = iconPath(set, icon);
      if (!existsSync(path)) throw new HttpError(404, `アイコンがありません: ${set}/${icon}`);
      return parseDoc(JSON.parse(readFileSync(path, "utf8")));
    },

    /** 検証してから整形して書く。内容が同じなら書かない(監視の無駄な発火を防ぐ) */
    writeIcon(set: string, icon: string, body: unknown) {
      const path = iconPath(set, icon);
      if (!existsSync(path)) throw new HttpError(404, `アイコンがありません: ${set}/${icon}`);
      const text = formatDoc(parseDoc(body));
      if (readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== text) writeFileSync(path, text);
    },

    createIcon(set: string, icon: string) {
      const path = iconPath(set, icon);
      if (existsSync(path)) throw new HttpError(409, `すでにあります: ${set}/${icon}`);
      mkdirSync(join(setDir(set), "icons"), { recursive: true });
      const stylePath = join(setDir(set), "style.json");
      if (!existsSync(stylePath)) writeFileSync(stylePath, JSON.stringify(DEFAULT_STYLE, null, 2) + "\n");
      const doc = emptyDoc(icon);
      writeFileSync(path, formatDoc(doc));
      return doc;
    },

    /** 変更されたファイルのパスを、通知用の { set, icon } にする。対象外なら null */
    classify(file: string): ChangeEvent | null {
      const parts = relative(setsDir, file).split(sep);
      if (parts[0] === ".." || parts.length < 2) return null;
      const set = parts[0]!;
      if (parts.length === 2 && parts[1] === "style.json") return { set, icon: null };
      if (parts.length === 3 && parts[1] === "icons" && parts[2]!.endsWith(ICON_EXT)) return { set, icon: parts[2]!.slice(0, -ICON_EXT.length) };
      return null;
    },
  };
}

export type SetsApi = ReturnType<typeof createSetsApi>;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch {
        reject(new HttpError(400, "JSON を読めません"));
      }
    });
    req.on("error", reject);
  });
}

/** /api 以下のルーティング。該当しなければ false */
export async function handle(api: SetsApi, method: string, url: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = decodeURIComponent(url.split("?")[0]!);
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  try {
    let m: RegExpExecArray | null;
    if (path === "/api/sets" && method === "GET") send(200, api.listSets());
    else if ((m = /^\/api\/sets\/([^/]+)\/style$/.exec(path)) && method === "GET") send(200, api.readStyle(m[1]!));
    else if ((m = /^\/api\/sets\/([^/]+)\/icons\/([^/]+)$/.exec(path))) {
      if (method === "GET") send(200, api.readIcon(m[1]!, m[2]!));
      else if (method === "PUT") {
        api.writeIcon(m[1]!, m[2]!, await readBody(req));
        send(200, { ok: true });
      } else if (method === "POST") send(201, api.createIcon(m[1]!, m[2]!));
      else return false;
    } else return false;
  } catch (e) {
    send(e instanceof HttpError ? e.status : 400, { error: (e as Error).message });
  }
  return true;
}

export function setsApiPlugin(setsDir: string): Plugin {
  const api = createSetsApi(setsDir);
  return {
    name: "glyphgrid-sets-api",
    configureServer(server) {
      server.watcher.add(setsDir);
      const notify = (file: string) => {
        const ev = api.classify(file);
        if (ev) server.ws.send({ type: "custom", event: CHANGE_EVENT, data: ev });
      };
      server.watcher.on("change", notify);
      server.watcher.on("add", notify);
      server.watcher.on("unlink", notify);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        handle(api, req.method ?? "GET", req.url, req, res).then((handled) => {
          if (!handled) next();
        });
      });
    },
  };
}
