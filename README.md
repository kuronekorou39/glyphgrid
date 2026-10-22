# glyphgrid

グリッド上のノード(円・四角・ひし形・六角形・三角形)とエッジ(直線・直角線・斜め線、破線・矢印)で、統一デザインのアイコンを作るツール。
人は GUI で、LLM は CLI / JSON で、同じコマンド群を使って編集する。

## エディタ

```
npm install
npm run dev        # http://localhost:5173 を開く
```

`sets/` の JSON を CLI などで書き換えると、画面に即座に反映される。

## CLI

```
npm run glyphgrid -- new sample/foo                       # sets/sample/icons/foo.icon.json を作る
npm run glyphgrid -- apply sets/sample/icons/foo.icon.json ops.json
npm run glyphgrid -- lint sets/sample                    # 問題があれば終了コード 1
npm run glyphgrid -- export sets/sample --format png --out out
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
