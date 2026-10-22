# glyphgrid

グリッド上のノード(塗り丸・白抜き丸・角丸四角)とエッジ(直線・直角線・斜め線)で、統一デザインのアイコンを作るツール。
人は GUI で、LLM は CLI / JSON で、同じコマンド群を使って編集する。

## 使い方

```
npm install
npm run glyphgrid -- new sample/foo                       # sets/sample/icons/foo.icon.json を作る
npm run glyphgrid -- apply sets/sample/icons/foo.icon.json ops.json
npm run glyphgrid -- export sets/sample --format png --out out
npm run glyphgrid -- sheet sets/sample --out out/sheet.png
npm run glyphgrid -- commands                             # コマンド一覧
```

ops の例:

```json
[
  { "op": "addNode", "id": "a", "kind": "dot", "x": 2, "y": 6 },
  { "op": "addNode", "id": "b", "kind": "ring", "x": 10, "y": 2 },
  { "op": "connect", "from": "a", "to": "b", "route": "hvh:6" },
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
