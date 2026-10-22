// sets/ の読み書き。ブラウザでは Vite 開発サーバーの /api、デスクトップアプリでは Tauri のコマンドを使う。
// どちらでも検証と整形はここ(core)で行い、バックエンドはファイルの読み書きだけを受け持つ。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_STYLE, emptyDoc, formatDoc, parseDoc, parseStyle, type IconDoc, type Style } from "../core/index.js";
import type { ChangeEvent, SetInfo } from "../server/sets-api.js";

export type { ChangeEvent, SetInfo };

const CHANGE_EVENT = "glyphgrid:change";

/** デスクトップアプリ(Tauri)の中で動いているか */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AppInfo {
  setsDir: string;
  mcpUrl: string | null;
  mcpError: string | null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${res.status}`);
  return data as T;
}

/** Tauri のコマンドはエラーを文字列で返すので Error にそろえる */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error).message);
  }
}

const iconUrl = (set: string, icon: string) => `/api/sets/${encodeURIComponent(set)}/icons/${encodeURIComponent(icon)}`;
const styleText = () => JSON.stringify(DEFAULT_STYLE, null, 2) + "\n";

export const api = isDesktop
  ? {
      info: () => call<AppInfo>("app_info"),
      listSets: () => call<SetInfo[]>("list_sets"),
      readStyle: async (set: string): Promise<Style> => {
        const raw = await call<unknown>("read_style", { set });
        return raw === null ? DEFAULT_STYLE : parseStyle(raw);
      },
      readIcon: async (set: string, icon: string): Promise<IconDoc> => parseDoc(await call("read_icon", { set, icon })),
      writeIcon: (set: string, icon: string, doc: IconDoc) => call<void>("write_icon", { set, icon, text: formatDoc(parseDoc(doc)) }),
      createIcon: async (set: string, icon: string): Promise<IconDoc> => {
        const doc = emptyDoc(icon);
        await call("create_icon", { set, icon, text: formatDoc(doc), styleText: styleText() });
        return doc;
      },
    }
  : {
      info: async (): Promise<AppInfo | null> => null,
      listSets: () => request<SetInfo[]>("GET", "/api/sets"),
      readStyle: async (set: string): Promise<Style> => parseStyle(await request("GET", `/api/sets/${encodeURIComponent(set)}/style`)),
      readIcon: async (set: string, icon: string): Promise<IconDoc> => parseDoc(await request("GET", iconUrl(set, icon))),
      writeIcon: async (set: string, icon: string, doc: IconDoc) => {
        await request("PUT", iconUrl(set, icon), doc);
      },
      createIcon: async (set: string, icon: string): Promise<IconDoc> => parseDoc(await request("POST", iconUrl(set, icon))),
    };

/** sets/ 配下のファイル変更を受け取る(ブラウザでは Vite の HMR チャネル、アプリでは Tauri のイベント) */
export function onFileChange(handler: (ev: ChangeEvent) => void): () => void {
  if (isDesktop) {
    const unlisten = listen<ChangeEvent>(CHANGE_EVENT, (e) => handler(e.payload));
    return () => void unlisten.then((f) => f());
  }
  const hot = import.meta.hot;
  if (!hot) return () => {};
  hot.on(CHANGE_EVENT, handler);
  return () => hot.off(CHANGE_EVENT, handler);
}
