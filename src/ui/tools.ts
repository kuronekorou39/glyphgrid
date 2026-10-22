import type { NodeKind } from "../core/index.js";

export type Tool = "select" | "connect" | NodeKind;

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "選択", key: "v" },
  { tool: "connect", label: "接続", key: "c" },
  { tool: "dot", label: "● 塗り丸", key: "1" },
  { tool: "ring", label: "○ 白抜き丸", key: "2" },
  { tool: "square", label: "□ 四角", key: "3" },
];

/** 新しいエッジの線種(route の短縮形) */
export const ROUTES: { value: string; label: string }[] = [
  { value: "straight", label: "直線" },
  { value: "hv", label: "直角 横→縦" },
  { value: "vh", label: "直角 縦→横" },
  { value: "hvh", label: "直角 横→縦→横" },
  { value: "vhv", label: "直角 縦→横→縦" },
  { value: "hdh", label: "斜め 横→斜→横" },
  { value: "vdv", label: "斜め 縦→斜→縦" },
];
