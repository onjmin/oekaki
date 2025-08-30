# oekaki
レイヤー概念があるお絵描きパッケージ

## 特徴
- フルスクラッチ
  - ブラウザ組み込みのAPIのみを使用
  - きっかけはSvelteアプリから読み込む用途やったが、Svelteにも非依存な設計
- TypeScript製
  - vscode上で型の安全性が守られる
- **おんJ民が作っている**  
  質問や相談はフォーラムで: [質問フォーラム](https://unj.netlify.app)

## リンク集
- 👀 [DEMO](https://unj.netlify.app/oekaki/demo)
- 🛫 [仕様書](https://onjmin.github.io/oekaki)
- 🌟 [GitHubリポジトリ](https://github.com/onjmin/oekaki)
- 🌴 [npmパッケージ](https://www.npmjs.com/package/@onjmin/oekaki)

## 注意点
- スポイトは標準非搭載
  - アクティブなレイヤーか、1番手前のレイヤーから採るのか派閥がありそうだったからな
  - その他にもCSSなど、個人の実装に幅がありそうなものは非搭載なんやが
    - oekakiに生えてるメソッドを駆使すれば勝手にお前らが実装できるで
- `React,Vue` 対応について
  - 主は `React,Vue` やったことないからわからん！
  - Svelteでの使用実績があるから `React,Vue` でも動くんちゃうか？
    - もしそのままだと使えず、正式に公開するならreact-oekakiみたいな派生を公開するもんやと思うで

## インストール
```sh
npm i @onjmin/oekaki
```

## サンプルコード
### Node.jsへの静的なimport
```ts
import * as oekaki from "@onjmin/oekaki";
```

### ブラウザへのダイナミックインポート
```js
const oekaki = await import("https://cdn.jsdelivr.net/npm/@onjmin/oekaki/dist/index.min.mjs");
```

### 使用例
- `TypeScript,Svelte` の使用例は [リンク先](https://github.com/onjmin/unj/blob/main/src/client/parts/OekakiPart.svelte)

---

- コピペで試せるようにtsじゃなくjsで書いてるやで
- クソ長くてすまんな
- 代わりと言っては何やが色々とカスタマイズの余地があるやで

```js
// ブラウザへのダイナミックインポート
const oekaki = await import("https://cdn.jsdelivr.net/npm/@onjmin/oekaki/dist/index.mjs");

// canvasの入れ物を用意する。セレクタで取ってくる方法も可
const wrapper = document.createElement("div");
document.body.append(wrapper);
// ここまで

// 幅と高さは自由に指定可能。後から変更不可
const width = 640;
const height = 360;
// ここまで

oekaki.init(wrapper, width, height); // 初期化。これ以外の引数なし

// 省略可。レイヤーの最前面と最背面にCSSを当てたい人向け。GIMPの透過背景やトレス台など
upperLayer = oekaki.upperLayer.value;
lowerLayer = oekaki.lowerLayer.value;
if (upperLayer) upperLayer.canvas.classList.add("upper-canvas");
if (lowerLayer) lowerLayer.canvas.classList.add("lower-canvas");
// ここまで

// 適当な背景
lowerLayer.canvas.style.backgroundColor = '#fff';
lowerLayer.canvas.style.backgroundImage = `
  linear-gradient(45deg, #eee 25%, transparent 25%),
  linear-gradient(-45deg, #eee 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, #eee 75%),
  linear-gradient(-45deg, transparent 75%, #eee 75%)
`;
lowerLayer.canvas.style.backgroundSize = '16px 16px';
lowerLayer.canvas.style.backgroundPosition = `
  0 0,
  0 8px,
  8px -8px,
  -8px 0px
`;
// ここまで

let mode = 1;

// イベントリスナの登録
let prevX = null;
let prevY = null;
oekaki.onDraw((x, y, buttons) => { // 描き始め・描いてる途中に発火
  if (prevX === null) prevX = x;
  if (prevY === null) prevY = y;
  if (!activeLayer?.locked) {
    if (mode === 1) { // 滑らかな線画
      activeLayer?.drawLine(x, y, prevX, prevY);
    } else {
      const lerps = oekaki.lerp(x, y, prevX, prevY); // 線形補完
      switch (mode) {
        case 2: // アンチエイリアスがない線画
          for (const [x, y] of lerps) activeLayer?.draw(x, y);
          break;
        case 3: // 消しゴム
          for (const [x, y] of lerps) activeLayer?.erase(x, y);
          break;
        case 4: // ドット絵用のペン
          for (const [x, y] of lerps) activeLayer?.drawByDot(x, y);
          break;
        case 5: // ドット絵用の消しゴム
          for (const [x, y] of lerps) activeLayer?.eraseByDot(x, y);
          break;
      }
    }
  }
  prevX = x;
  prevY = y;
});
const fin = () => {
  if (activeLayer?.modified()) { // 描画差分検出
    activeLayer.trace(); // undo/redo出来るように登録
  }
};
oekaki.onDrawn((x, y, buttons) => { // 描き終わりに発火
  prevX = null;
  prevY = null;
  if (activeLayer?.locked) return;
  if (mode === 6) {
    oekaki.floodFill(activeLayer.data, width, height, x, y, [ // 緑色でバケツ塗り
      0,
      255,
      0,
      255,
    ]);
    if (data) activeLayer.data = data;
  }
  fin();
});
oekaki.onClick((x, y, buttons) => {}); // 右クリック禁止するために取り合えず要る。またはPC限定ショートカットを登録する用
// ここまで

// 1枚の画像にして保存（後でこの関数を実行してみてね）
const save = () => {
  const dataURL = oekaki.render().toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = "drawing.png";
  link.click();
};
// ここまで

// ドットブラシの設定
// height基準で最大64マスになるように分割し、ドットペンを3x3マスの太さに設定
oekaki.setDotSize(3, 64, height);
console.log(oekaki.getDotSize()); // 3x3の実際のpxを取得

// ペンの設定
oekaki.color.value = "#FF0000"; // ペンの色を赤色に変更
oekaki.color.value = "#FF0000";     // ペンの色を赤に設定
oekaki.penSize.value = 4;           // 通常ペンのサイズを4pxに設定
oekaki.brushSize.value = 10;        // ブラシサイズを10pxに設定
oekaki.eraserSize.value = 12;       // 消しゴムサイズを12pxに設定
oekaki.setDotSize(8);       // ドットペンを8x8の太さに設定
// ここまで

const layer1 = new oekaki.LayeredCanvas("レイヤー #1"); // 1枚目のレイヤー新規作成
const layer2 = new oekaki.LayeredCanvas("レイヤー #2"); // 2枚目のレイヤー新規作成
const layer3 = new oekaki.LayeredCanvas("レイヤー #3"); // 3枚目のレイヤー新規作成

console.log(oekaki.getLayers()) // レイヤーのリストを取得

// activeLayer = layer1; // レイヤー1に切り替え
activeLayer = layer2; // レイヤー2に切り替え
// activeLayer = layer3; // レイヤー3に切り替え

// activeLayer = oekaki.getLayers()[0]; // レイヤー1に切り替え
// activeLayer = oekaki.getLayers()[1]; // レイヤー2に切り替え
// activeLayer = oekaki.getLayers()[2]; // レイヤー3に切り替え
```

## ライセンス / License

- **AGPL-3.0**  
  本プロジェクト全体には AGPL-3.0 ライセンスが適用されます。詳細は [`LICENSE`](./LICENSE) をご覧ください。

## 開発者 / Author
+ [おんJ民](https://github.com/onjmin)
