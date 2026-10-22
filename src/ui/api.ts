import { parseDoc, parseStyle, type IconDoc, type Style } from "../core/index.js";
import type { ChangeEvent, SetInfo } from "../server/sets-api.js";

export type { ChangeEvent, SetInfo };

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

const iconUrl = (set: string, icon: string) => `/api/sets/${encodeURIComponent(set)}/icons/${encodeURIComponent(icon)}`;

export const api = {
  listSets: () => request<SetInfo[]>("GET", "/api/sets"),
  readStyle: async (set: string): Promise<Style> => parseStyle(await request("GET", `/api/sets/${encodeURIComponent(set)}/style`)),
  readIcon: async (set: string, icon: string): Promise<IconDoc> => parseDoc(await request("GET", iconUrl(set, icon))),
  writeIcon: (set: string, icon: string, doc: IconDoc) => request<{ ok: true }>("PUT", iconUrl(set, icon), doc),
  createIcon: async (set: string, icon: string): Promise<IconDoc> => parseDoc(await request("POST", iconUrl(set, icon))),
};

/** sets/ 配下のファイル変更を受け取る(Vite の HMR チャネル経由) */
export function onFileChange(handler: (ev: ChangeEvent) => void): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => {};
  hot.on("glyphgrid:change", handler);
  return () => hot.off("glyphgrid:change", handler);
}
