// src/flood-fill.ts
var floodFill = (data, width, height, startX, startY, fillColor) => {
  const getPixel = (x, y) => {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };
  const setPixel = (x, y, color2) => {
    const index = (y * width + x) * 4;
    [data[index], data[index + 1], data[index + 2], data[index + 3]] = color2;
  };
  const colorsMatch = (a, b) => a.every((value, i) => value === b[i]);
  const targetColor = getPixel(startX, startY);
  if (colorsMatch(targetColor, fillColor)) return null;
  const queue = [[startX, startY]];
  while (queue.length > 0) {
    const item = queue.pop();
    if (!item) break;
    const [x, y] = item;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const currentColor = getPixel(x, y);
    if (!colorsMatch(currentColor, targetColor)) continue;
    setPixel(x, y, fillColor);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return data;
};

// src/linked-list.ts
var LinkedList = class {
  #cursor;
  constructor() {
    const node = { value: null, prev: null, next: null };
    this.#cursor = node;
  }
  /**
   * 履歴を1つ追加
   */
  add(value) {
    const node = {
      value,
      prev: this.#cursor,
      next: null
    };
    this.#cursor.next = node;
    this.#cursor = node;
  }
  /**
   * 履歴を1つ戻す
   */
  undo() {
    const { prev } = this.#cursor;
    if (prev === null || prev.value === null) return null;
    this.#cursor = prev;
    return this.#cursor.value;
  }
  /**
   * 履歴を1つ進める
   */
  redo() {
    const { next } = this.#cursor;
    if (next === null || next.value === null) return null;
    this.#cursor = next;
    return this.#cursor.value;
  }
};

// src/layered-canvas.ts
var g_layer_container = null;
var g_width;
var g_height;
var g_dot_size;
var g_lower;
var g_upper;
var g_serial_number = 0;
var g_layers = [];
var Config = class {
  #value;
  #reactive;
  constructor(defaultValue, reactive) {
    this.#value = defaultValue;
    this.#reactive = reactive ?? null;
  }
  get value() {
    return this.#value;
  }
  set value(next) {
    this.#value = next;
    this.#reactive?.();
  }
};
var color = new Config("#222222");
var brushSize = new Config(2);
var penSize = new Config(16);
var eraserSize = new Config(32);
var flipped = new Config(false, () => {
  if (g_layer_container)
    g_layer_container.style.transform = `scaleX(${flipped.value ? -1 : 1})`;
});
var getDotSize = () => g_dot_size;
var setDotSize = (dotPenScale = 1, maxDotCount = 64, canvasLength = g_height) => {
  g_dot_size = Math.floor(Math.floor(canvasLength / maxDotCount) * dotPenScale);
  resetTranslation();
};
var accDx = 0;
var accDy = 0;
var snappedX = 0;
var snappedY = 0;
var offsetX = 0;
var offsetY = 0;
var translating = null;
var resetTranslation = () => {
  accDx = 0;
  accDy = 0;
  snappedX = 0;
  snappedY = 0;
  offsetX = 0;
  offsetY = 0;
  translating = null;
};
var getLayers = () => g_layers.filter((v) => v !== null);
var insertAfter = (sp1, sp2) => g_layer_container?.insertBefore(sp1, sp2.nextSibling);
var setLayers = (layers) => {
  for (const layer of g_layers) {
    layer?.canvas.remove();
  }
  g_layers = layers;
  refresh();
  let el = g_lower.canvas;
  for (const layer of g_layers) {
    if (layer) {
      insertAfter(layer.canvas, el);
      el = layer.canvas;
    }
  }
};
var lowerLayer = new Config(null);
var upperLayer = new Config(null);
var init = (mountTarget, width = 640, height = 360) => {
  const layerContainer = document.createElement("div");
  mountTarget.innerHTML = "";
  mountTarget.append(layerContainer);
  g_layer_container = layerContainer;
  g_width = Math.floor(width);
  g_height = Math.floor(height);
  layerContainer.innerHTML = "";
  layerContainer.style.position = "relative";
  layerContainer.style.zIndex = "0";
  layerContainer.style.display = "inline-block";
  layerContainer.style.width = `${width}px`;
  layerContainer.style.height = `${height}px`;
  g_serial_number = 0;
  g_lower = new LayeredCanvas("");
  g_upper = new LayeredCanvas("");
  g_upper.canvas.style.zIndex = String(2 ** 16 + 3);
  lowerLayer.value = g_lower;
  upperLayer.value = g_upper;
  g_layers = [];
};
var getXY = (e) => {
  const { clientX, clientY } = e;
  const rect = g_upper.canvas.getBoundingClientRect();
  let x = Math.floor(clientX - rect.left);
  const y = Math.floor(clientY - rect.top);
  if (flipped.value) x = g_width - x;
  return [x, y, e.buttons];
};
var onClick = (callback) => {
  g_upper.canvas.addEventListener(
    "click",
    (e) => requestAnimationFrame(() => callback(...getXY(e))),
    { passive: true }
  );
  g_upper.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  g_upper.canvas.addEventListener("auxclick", (e) => {
    e.preventDefault();
    requestAnimationFrame(() => callback(...getXY(e)));
  });
};
var onDraw = (callback) => {
  g_upper.canvas.addEventListener(
    "pointerdown",
    (e) => {
      resetTranslation();
      g_upper.canvas.setPointerCapture(e.pointerId);
      drawing = true;
      requestAnimationFrame(() => callback(...getXY(e)));
    },
    { passive: true }
  );
  g_upper.canvas.addEventListener(
    "pointermove",
    (e) => {
      if (drawing) {
        for (const ev of e.getCoalescedEvents()) {
          requestAnimationFrame(() => callback(...getXY(ev)));
        }
        requestAnimationFrame(() => callback(...getXY(e)));
      }
    },
    { passive: true }
  );
  g_upper.canvas.addEventListener("touchstart", (e) => e.preventDefault());
  g_upper.canvas.addEventListener("touchmove", (e) => e.preventDefault());
};
var drawing = false;
var onDrawn = (callback) => {
  g_upper.canvas.addEventListener(
    "pointerup",
    (e) => {
      g_upper.canvas.releasePointerCapture(e.pointerId);
      drawing = false;
      requestAnimationFrame(() => callback(...getXY(e)));
    },
    { passive: true }
  );
};
var LayeredCanvas = class {
  canvas;
  ctx;
  /**
   * レイヤー名
   */
  name;
  /**
   * 内部レイヤーリストの添え字
   */
  index;
  /**
   * レイヤーの描画履歴
   */
  history = new LinkedList();
  /**
   * 差分検出用ハッシュ
   */
  hash = 0;
  /**
   * レイヤーの可視性
   */
  #visible = true;
  /**
   * レイヤーの不透明度[%]
   */
  #opacity = 100;
  /**
   * レイヤーロック
   */
  locked = false;
  /**
   * 使用済みレイヤー
   */
  used = false;
  /**
   * レイヤーの一意なid
   */
  uuid;
  constructor(name = "", uuid = "") {
    this.name = name;
    this.uuid = uuid || crypto.randomUUID();
    const canvas = document.createElement("canvas");
    g_layer_container?.append(canvas);
    canvas.width = g_width;
    canvas.height = g_height;
    canvas.style.position = "absolute";
    canvas.style.zIndex = String(++g_serial_number);
    canvas.style.left = "0";
    canvas.style.top = "0";
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to get 2D rendering context");
    this.ctx = ctx;
    g_layers.push(this);
    this.index = g_layers.length - 1;
    this.trace();
  }
  /**
   * ストレージなどに一時保存可能なレイヤー情報
   */
  get meta() {
    const { name, index, hash, visible, opacity, locked, used, uuid } = this;
    return { name, index, hash, visible, opacity, locked, used, uuid };
  }
  /**
   * ストレージなどに一時保存可能なレイヤー情報
   */
  set meta(meta) {
    this.name = meta.name;
    this.index = meta.index;
    this.hash = meta.hash;
    this.visible = meta.visible;
    this.opacity = meta.opacity;
    this.locked = meta.locked;
    this.used = meta.used;
    this.uuid = meta.uuid;
  }
  /**
   * レイヤーの削除
   */
  delete() {
    g_layers[this.index] = null;
    this.canvas.remove();
  }
  /**
   * 1つ背面のレイヤー
   */
  get below() {
    const layer = g_layers.slice(0, this.index).findLast((v) => v);
    return layer ? layer : null;
  }
  /**
   * 1つ前面のレイヤー
   */
  get above() {
    const layer = g_layers.slice(this.index + 1).find((v) => v);
    return layer ? layer : null;
  }
  /**
   * レイヤーの入れ替え
   */
  swap(to) {
    const from = this.index;
    if (to === from) return;
    const that = g_layers[to];
    if (!that) return;
    [g_layers[from], g_layers[to]] = [g_layers[to], g_layers[from]];
    [this.index, that.index] = [that.index, this.index];
    [this.canvas.style.zIndex, that.canvas.style.zIndex] = [
      that.canvas.style.zIndex,
      this.canvas.style.zIndex
    ];
  }
  /**
   * レイヤーの可視性
   */
  get visible() {
    return this.#visible;
  }
  /**
   * レイヤーの可視性
   */
  set visible(visible) {
    this.#visible = visible;
    this.canvas.style.visibility = this.#visible ? "visible" : "hidden";
  }
  /**
   * 編集可能 = ロック解除 & 表示中
   */
  get editable() {
    return !this.locked && this.#visible;
  }
  /**
   * レイヤーの不透明度[%] 0-100
   */
  get opacity() {
    return this.#opacity;
  }
  /**
   * レイヤーの不透明度[%] 0-100
   */
  set opacity(opacity) {
    this.#opacity = opacity;
    this.canvas.style.opacity = `${opacity}%`;
  }
  /**
   * レイヤーのUint8ClampedArray
   */
  get data() {
    return this.ctx.getImageData(0, 0, g_width, g_height).data;
  }
  /**
   * レイヤーのUint8ClampedArray
   */
  set data(data) {
    const imageData = this.ctx.createImageData(g_width, g_height);
    imageData.data.set(data);
    this.ctx.putImageData(imageData, 0, 0);
  }
  /**
   * 差分検出
   */
  modified() {
    const hash = calcHash(this.data);
    if (this.hash !== hash) {
      this.hash = hash;
      this.used = true;
      return true;
    }
    return false;
  }
  /**
   * レイヤーの描画履歴の保存
   */
  trace() {
    this.history.add(this.data);
  }
  /**
   * レイヤーの描画履歴を1つ戻す
   */
  undo() {
    if (!this.editable) return;
    const data = this.history.undo();
    if (!data) return;
    this.data = data;
  }
  /**
   * レイヤーの描画履歴を1つ進める
   */
  redo() {
    if (!this.editable) return;
    const data = this.history.redo();
    if (!data) return;
    this.data = data;
  }
  /**
   * 全消し
   */
  clear() {
    if (!this.editable) return;
    this.ctx.clearRect(0, 0, g_width, g_height);
  }
  /**
   * 塗りつぶし
   */
  fill(color2) {
    if (!this.editable) return;
    this.ctx.fillStyle = color2;
    this.ctx.fillRect(0, 0, g_width, g_height);
  }
  /**
   * 貼り付け
   */
  paste(image) {
    if (!this.editable) return;
    const { width, height } = image;
    const ratio = Math.min(g_width / width, g_height / height);
    const w = width * ratio | 0;
    const h = height * ratio | 0;
    const offsetX2 = g_width - w >> 1;
    const offsetY2 = g_height - h >> 1;
    this.ctx.drawImage(image, offsetX2, offsetY2, w, h);
  }
  /**
   * ドット基準で平行移動
   *
   * @param dx x差分
   * @param dy y差分
   */
  translateByDot(dx, dy) {
    if (!this.editable) return;
    const size = g_dot_size;
    accDx += dx;
    accDy += dy;
    const newSnappedX = Math.round(accDx / size) * size;
    const newSnappedY = Math.round(accDy / size) * size;
    if (newSnappedX !== snappedX || newSnappedY !== snappedY) {
      if (!translating)
        translating = this.ctx.getImageData(0, 0, g_width, g_height);
      this.clear();
      this.ctx.putImageData(translating, newSnappedX, newSnappedY);
      snappedX = newSnappedX;
      snappedY = newSnappedY;
    }
  }
  /**
   * 平行移動
   *
   * @param dx x差分
   * @param dy y差分
   */
  translate(dx, dy) {
    if (!this.editable) return;
    if (!translating)
      translating = this.ctx.getImageData(0, 0, g_width, g_height);
    offsetX += dx;
    offsetY += dy;
    this.clear();
    this.ctx.putImageData(
      translating,
      Math.floor(offsetX),
      Math.floor(offsetY)
    );
  }
  /**
   * ドット基準の消しゴム
   */
  eraseByDot(x, y) {
    if (!this.editable) return;
    const size = g_dot_size;
    const _x = Math.floor(x / size) * size;
    const _y = Math.floor(y / size) * size;
    this.ctx.clearRect(_x, _y, size, size);
  }
  /**
   * ドット基準のペン
   */
  drawByDot(x, y) {
    if (!this.editable) return;
    this.ctx.fillStyle = color.value;
    const size = g_dot_size;
    const _x = Math.floor(x / size) * size;
    const _y = Math.floor(y / size) * size;
    this.ctx.fillRect(_x, _y, size, size);
  }
  /**
   * 消しゴム
   */
  erase(x, y) {
    if (!this.editable) return;
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.beginPath();
    this.ctx.arc(x, y, eraserSize.value >> 1, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = "source-over";
  }
  /**
   * ペン
   */
  draw(x, y) {
    if (!this.editable) return;
    this.ctx.fillStyle = color.value;
    const size = penSize.value;
    const radius = size >> 1;
    this.ctx.fillRect(x - radius, y - radius, size, size);
  }
  /**
   * ブラシ
   */
  drawLine(fromX, fromY, toX, toY) {
    if (!this.editable) return;
    this.ctx.strokeStyle = color.value;
    this.ctx.lineWidth = brushSize.value;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
  }
};
var render = () => {
  const canvas = document.createElement("canvas");
  canvas.width = g_width;
  canvas.height = g_height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to get 2D rendering context");
  for (const layer of g_layers) {
    if (!layer || !layer.visible) continue;
    ctx.globalAlpha = layer.opacity / 100;
    ctx.drawImage(layer.canvas, 0, 0);
  }
  return canvas;
};
var dropper = (x, y) => {
  const ctx = render().getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, g_width, g_height);
  const index = (y * g_width + x) * 4;
  const [r, g, b, a] = data.subarray(index, index + 4);
  return [r, g, b, a];
};
var refresh = () => {
  g_serial_number = 2;
  const layers = getLayers();
  for (const [i, layer] of layers.entries()) {
    layer.index = i;
    layer.canvas.style.zIndex = String(++g_serial_number);
  }
  g_layers = layers;
};
var calcHash = (data) => {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

// src/lerp.ts
var lerp = (x, y, _x, _y) => {
  const a = _x - x;
  const b = _y - y;
  const len = Math.max(...[a, b].map(Math.abs)) || 1;
  const _a = a / len;
  const _b = b / len;
  return [...new Array(len).keys()].map(
    (i) => [i * _a + x, i * _b + y].map(Math.round)
  );
};
export {
  Config,
  LayeredCanvas,
  LinkedList,
  brushSize,
  color,
  dropper,
  eraserSize,
  flipped,
  floodFill,
  getDotSize,
  getLayers,
  getXY,
  init,
  lerp,
  lowerLayer,
  onClick,
  onDraw,
  onDrawn,
  penSize,
  refresh,
  render,
  setDotSize,
  setLayers,
  upperLayer
};
