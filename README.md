# glyphgrid

グリッド上のノード(円・四角などの形、チェック・カーソルなどの記号、画面の枠・表・テキスト行)とエッジ(直線・直角線・斜め線、破線・矢印)で、統一デザインのアイコンを作るツール。
人は GUI で、LLM は CLI / JSON で、同じコマンド群を使って編集する。

## エディタ

```
npm install
npm run dev        # http://localhost:5173 を開く
```

`sets/` の JSON を CLI などで書き換えると、画面に即座に反映される。

デスクトップアプリ(Tauri。Rust と MSVC ビルドツールが必要):

```
npm run app        # 開発版を起動
npm run app:build  # インストーラを作る
```

アプリは起動中だけ MCP サーバー(`http://127.0.0.1:7331/mcp`)を内蔵する。右パネルの「アプリ」に Claude Code での登録コマンドが出る。
環境変数 `GLYPHGRID_SETS`(sets の場所)、`GLYPHGRID_MCP_PORT`、`GLYPHGRID_ROOT`(MCP を動かすリポジトリ)で変えられる。

## MCP サーバー

Claude Code でこのリポジトリを開くと `.mcp.json` の `glyphgrid` サーバーが使える(初回に承認が必要)。
アイコンの作成・ops の適用・lint・PNG での確認・スタイル変更ができ、書き換えはエディタに即座に反映される。
他のクライアントからは `npm run mcp`(stdio)で起動する。

## CLI

```
npm run glyphgrid -- new sample/foo                       # sets/sample/icons/foo.icon.json を作る
npm run glyphgrid -- apply sets/sample/icons/foo.icon.json ops.json
npm run glyphgrid -- lint sets/sample                    # 問題があれば終了コード 1
npm run glyphgrid -- export sets/sample --format png --out out   # --watch で変更を監視して書き出し直す
npm run glyphgrid -- sheet sets/sample --out out/sheet.png
npm run glyphgrid -- commands                             # コマンド一覧
```

ops の例:

```json
[
  { "op": "addNode", "id": "a", "shape": "circle", "fill": "solid", "x": 2, "y": 6 },
  { "op": "addNode", "id": "b", "shape": "diamond", "fill": "outline", "x": 10, "y": 2 },
  { "op": "connect", "from": "a", "to": "b", "route": "hvh:6", "arrow": "end" },
  { "op": "tidy" }
]
```

## 開発

```
npm test
npm run typecheck
```

## ライセンス

MIT
