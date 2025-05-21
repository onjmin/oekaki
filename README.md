# oekaki
レイヤー概念があるお絵描きパッケージ

# 特徴
- フルスクラッチ
  - ブラウザ組み込みのAPIのみを使用
  - きっかけはSvelteアプリから読み込む用途やったが、Svelteにも非依存な設計
- TypeScript製
  - vscode上で型の安全性が守られる
- おんJ民が作っている
  - 日本語で質問できる
  - 質問用フォーラム
    - https://hayabusa.open2ch.net/test/read.cgi/livejupiter/1747569891
    - https://discord.gg/vXt32n38BK
    - https://unj.netlify.app

# DEMO
https://unj.netlify.app/oekaki/demo

# 注意点
- Volta/pnpm使用
  - Bun製パッケージ->Volta/pnpm環境に一発で導入できないことがあったりするので
  その逆パターンもあるかもしれないので注意
  - cdn経由で読み込んで型定義を自作すればどんな環境でも導入可能やろうな
- スポイトは標準非搭載
  - 1枚のレイヤーか
  - その他にもCSSなど、個人の実装に幅がありそうなものは非搭載なんやが
  oekakiに生えてるメソッドを駆使すれば勝手にお前らが実装できるで
- React・Vue対応について
  - 主はReact・Vueやったことないからわからん！
  - Svelteでアプリで運用中やからReact・Vueでも動くんちゃうか？
    - もしそのままだと使えず、正式に公開するならreact-oekakiみたいな派生を公開することになるやで

# サンプルコード
## 読み込み
### node
```ts
import * as oekaki from "@onjmin/oekaki";
```

### ブラウザ
#### 動的インポートの場合
```js
const oekaki = await import("https://cdn.jsdelivr.net/npm/@onjmin/oekaki/dist/index.mjs");
```



## 実行
※コピペで試せるようにtsじゃなくjsで書いてるやで。ts & Svelteでの本番環境の使用例はリンク先
https://github.com/onjmin/unj/blob/main/src/client/parts/OekakiPart.svelte#L210-L319

クソ長くてすまんな
代わりに色々とカスタマイズの余地があるやで

```js
// ブラウザの場合の動的インポート
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
//

const activeLayer = new oekaki.LayeredCanvas("レイヤー #1"); // 1枚目のレイヤー新規作成

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
          for (const [x, y] of lerps) activeLayer?.drawDot(x, y);
          break;
        case 5: // ドット絵用の消しゴム
          for (const [x, y] of lerps) activeLayer?.eraseDot(x, y);
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

new oekaki.LayeredCanvas("レイヤー #2"); // 2枚目のレイヤー新規作成
new oekaki.LayeredCanvas("レイヤー #3"); // 3枚目のレイヤー新規作成

console.log(oekaki.getLayers()) // レイヤーのリストを取得

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
```