# glyphgrid

グリッド上の「ノード + エッジ」でアイコンを作るエディタ。人は GUI、LLM は CLI / JSON で、同じコマンド群を使う。
対象はグラフ構造のアイコンのみ(自由曲線・テキスト・グラデーションはやらない)。

## 構成

- `src/core/`:モデル・スタイル・描画・コマンド。純粋関数のみ。I/O と DOM 依存を持ち込まない(Node とブラウザ両方で動かす)
- `src/cli/`:CLI。ファイル I/O はここだけ
- `sets/<set>/style.json` + `icons/*.icon.json`:1セット1スタイル。スタイルを変えればセット全体が揃って変わる
- 型の定義は `src/core/model.ts`、スタイルは `src/core/style.ts`

## 設計ルール

- 座標はグリッド単位(px はスタイルの `unit`)。0.5 刻みまで。コマンドの出力も 0.5 刻みに丸める
- 座標の微調整はしない。整形はコマンド(align / distribute / radial / tidy など)で行う
- コマンドは `(doc, style, args) => doc`。ops 配列(`[{ "op": "align", "ids": [...], "mode": "center-y" }]`)で一括適用できる
- 描画:エッジが先、ノードが後。エッジはノードの外形で切る(背景で隠さない)。線幅・色はスタイルからのみ取る
- 迷ったら「LLM が ops だけで同じ結果を出せるか」を基準にする

## CLI

`npm run glyphgrid -- <command>`。`commands` でコマンドと引数順の一覧が出る。
route の短縮形:`straight` `hv` `vh` `hvh[:mid]` `vhv[:mid]` `hdh[:mid[:span]]` `vdv[:mid[:span]]`(hdh は水平→斜め→水平)。
同じ始点で同じ mid を持つ hvh / vhv は幹を共有する(分岐の表現)。
LLM の作業手順:`new` → ops を `apply`(最後に `tidy`)→ `lint` → `export` / `sheet` の PNG を目視確認。

## 規約

- コマンドには必ずテストを書く。描画は SVG スナップショットで守る
- 数値比較は誤差 1e-6 を許容する
- 参考資料(`docs/`、`CLAUDE_init.md` など)はリポジトリに入れない

## マイルストーン

- M1 core + CLI(完了)
- M2 Web UI:編集、`sets/` のファイル監視、アンドゥ(スナップショット履歴)
- M3 lint(off-grid / overlap / edge-through-node / dangling-edge / out-of-bounds / off-center / inconsistent-size)、スタイル変更時の一括再書き出し
- M4 Tauri 化、MCP サーバー内蔵
