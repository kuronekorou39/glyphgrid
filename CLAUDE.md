# glyphgrid

グリッド上の「ノード + エッジ」でアイコンを作るエディタ。人は GUI、LLM は CLI / JSON で、同じコマンド群を使う。
対象はグラフ構造のアイコンのみ(自由曲線・テキスト・グラデーションはやらない)。

## 構成

- `src/core/`:モデル・スタイル・描画・コマンド。純粋関数のみ。I/O と DOM 依存を持ち込まない(Node とブラウザ両方で動かす)
- `src/cli/`:CLI。ファイル I/O は cli / server / mcp だけ
- `src/server/`:Node 側の共通処理。`sets/` の読み書き API、Vite 開発サーバー用の `/api` と変更通知、PNG 化
- `src/mcp/`:MCP サーバー(stdio、`.mcp.json` で登録)。core のコマンドをそのまま道具として公開する
- `src/ui/`:Web UI(Preact)。キャンバスは core の `renderSvg` をそのまま重ねて表示する。`api.ts` がブラウザ(/api)と Tauri(invoke)を切り替える
- `src-tauri/`:デスクトップアプリ。Rust はファイル I/O・変更監視・MCP(HTTP)の子プロセス起動だけ。検証と整形は TS の core で行う
- `sets/<set>/style.json` + `icons/*.icon.json`:1セット1スタイル。スタイルを変えればセット全体が揃って変わる
- 型の定義は `src/core/model.ts`、スタイルは `src/core/style.ts`

## 設計ルール

- 座標はグリッド単位(px はスタイルの `unit`)。0.5 刻みまで。コマンドの出力も 0.5 刻みに丸める
- 座標の微調整はしない。整形はコマンド(align / distribute / radial / tidy など)で行う
- コマンドは `(doc, style, args) => doc`。ops 配列(`[{ "op": "align", "ids": [...], "mode": "center-y" }]`)で一括適用できる
- 描画:エッジが先、ノードが後。エッジはノードの外形で切る(背景で隠さない)。線幅・色はスタイルからのみ取る
- 迷ったら「LLM が ops だけで同じ結果を出せるか」を基準にする

## 要素

- ノード:`shape`(circle / square / diamond / hexagon / triangle)× `fill`(solid / outline / core)× `size`(s / m / l)。実寸は style.json
- 記号マーク:check / cross / sparkle / cursor / pen。size で大きさが決まる。線を切る位置や重なりは外接円で判定する
- 箱:frame(`header` でタイトルバー、`tab` でフォルダ形、`corner` で角折りのページ形)/ table(`cols` `rows`、`header` で見出し行)/ text(`lines` 本の横棒)。`w` `h` で大きさを決め、size は使わない
- 描画順は 箱 → エッジ → その他のノード。frame / table の内側に収まったノードは入れ子で、lint の重なり・貫通の対象外
- エッジ:`route` に加えて `dash`(dashed / dotted)と `arrow`(end / start / both)。省略時は実線・矢印なし
- 旧形式(version 1 の `kind`: dot / ring / square)は読み込み時に変換する。ops でも `kind` や `shape: "dot"` を別名として受け付ける
- 要素を足すときは「形・塗り・線の種類」のようにトークンとして足し、寸法やパターンは style.json に置く

## CLI と MCP

`npm run glyphgrid -- <command>`。`commands` でコマンドと引数順の一覧が出る。
route の短縮形:`straight` `hv` `vh` `hvh[:mid]` `vhv[:mid]` `hdh[:mid[:span]]` `vdv[:mid[:span]]`(hdh は水平→斜め→水平)。
同じ始点で同じ mid を持つ hvh / vhv は幹を共有する(分岐の表現)。
LLM の作業手順:`create_icon` → `apply_ops`(最後に `tidy`)→ lint が空になるまで直す → `render` の PNG を目視確認(MCP がなければ CLI の `new` / `apply` / `lint` / `export`)。

## 規約

- コマンドには必ずテストを書く。描画は SVG スナップショットで守る
- 数値比較は誤差 1e-6 を許容する
- 参考資料(`docs/`、`CLAUDE_init.md` など)はリポジトリに入れない

## マイルストーン

- M1 core + CLI(完了)
- M2 Web UI(完了。`npm run dev`)
- M3 lint、スタイル変更時の一括再書き出し(`export --watch`)(完了)
- M4 MCP サーバー、Tauri 化(完了。`npm run app`。MCP は Node が必要で、リポジトリ外へ配布するなら MCP の単体実行ファイル化が要る)
