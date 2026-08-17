import { LinkedList } from "./linked-list.js";

let g_layer_container: HTMLElement | null = null;
let g_width: number;
let g_height: number;
let g_dot_size: number;
let g_lower: LayeredCanvas; // 背景用
let g_upper: LayeredCanvas; // 描画検出用
let g_serial_number = 0;
let g_layers: (LayeredCanvas | null)[] = [];

/**
 * インポート先から書き換え可能な入れ物
 */
export class Config<T> {
	#value: T;
	#reactive: (() => void) | null;
	constructor(defaultValue: T, reactive?: () => void) {
		this.#value = defaultValue;
		this.#reactive = reactive ?? null;
	}
	get value() {
		return this.#value;
	}
	set value(next: T) {
		this.#value = next;
		this.#reactive?.();
	}
}

/**
 * ペンの色
 */
export const color = new Config("#222222"); // 濃いめの黒（自然な線画）

/**
 * ブラシの太さ
 */
export const brushSize = new Config(2);

/**
 * ペンの太さ
 */
export const penSize = new Config(16);

/**
 * 消しゴムの太さ
 */
export const eraserSize = new Config(32);

/**
 * 左右反転
 */
export const flipped = new Config(false, () => {
	if (g_layer_container)
		g_layer_container.style.transform = `scaleX(${flipped.value ? -1 : 1})`;
});

/**
 * 1ドットの大きさ
 */
export const getDotSize = () => g_dot_size;

/**
 * 1ドットの大きさを変更する
 *
 * @param dotPenScale ドットペンの太さの倍率（1が最小）
 * @param maxDotCount ドットを最大でいくつに分割するか（解像度的な意味）
 * @param canvasLength 分割対象（幅か高さのどちらに合わせるか）
 */
export const setDotSize = (
	dotPenScale = 1,
	maxDotCount = 64,
	canvasLength = g_height,
) => {
	g_dot_size = Math.floor(Math.floor(canvasLength / maxDotCount) * dotPenScale);
	resetTranslation();
};

let accDx = 0;
let accDy = 0;
let snappedX = 0;
let snappedY = 0;
let offsetX = 0;
let offsetY = 0;
let translating: ImageData | null = null;
const resetTranslation = () => {
	accDx = 0;
	accDy = 0;
	snappedX = 0;
	snappedY = 0;
	offsetX = 0;
	offsetY = 0;
	translating = null;
	resetSelectionMoveByDot();
	resetSelectionRotateByDot();
};

let selMoveAccDx = 0;
let selMoveAccDy = 0;
let selMoveSnappedDx = 0;
let selMoveSnappedDy = 0;
/**
 * moveSelectionByDot()の累積差分をリセット
 *
 * 新しいドラッグ操作の開始時や選択範囲そのものが変わったタイミングで呼ぶ
 */
const resetSelectionMoveByDot = () => {
	selMoveAccDx = 0;
	selMoveAccDy = 0;
	selMoveSnappedDx = 0;
	selMoveSnappedDy = 0;
};

let selRotateAcc = 0;
let selRotateSnapped = 0;
/**
 * rotateSelectionByDot()の累積角度をリセット
 *
 * 新しいドラッグ操作の開始時や選択範囲そのものが変わったタイミングで呼ぶ
 */
const resetSelectionRotateByDot = () => {
	selRotateAcc = 0;
	selRotateSnapped = 0;
};

/**
 * 範囲選択の矩形
 */
export type SelectionRect = {
	x: number;
	y: number;
	w: number;
	h: number;
};

let g_sel_layer: LayeredCanvas | null = null;
let g_sel_rect: SelectionRect | null = null;
let g_sel_floating: HTMLCanvasElement | null = null; // レイヤーから浮かせた選択範囲の画像
let g_sel_base: ImageData | null = null; // 浮かせた部分を除いたレイヤーの画像
let g_sel_angle = 0; // 選択範囲の回転角度[度]。常にg_sel_floating（原本）からの絶対角度
let g_sel_pixelated = false; // ドット基準の操作（*ByDot系）が一度でも行われたか。trueの間は補間せずニアレストネイバーで描画する
let g_sel_mask: HTMLCanvasElement | null = null; // 自由形状選択のマスク（矩形選択時はnull）。選択時点のg_sel_rectと同サイズ
let g_sel_points: [number, number][] | null = null; // 自由形状選択の頂点（選択時点の絶対座標）。矩形選択時はnull
let g_sel_origin: SelectionRect | null = null; // 自由形状選択時点の矩形。以後の移動・拡縮・回転の基準として使う

/**
 * 選択範囲の解除（全レイヤー共通）
 *
 * 浮いている選択範囲はレイヤーに反映済みのため、状態を破棄するだけでええんやで
 */
export const clearSelection = () => {
	g_sel_layer = null;
	g_sel_rect = null;
	g_sel_floating = null;
	g_sel_base = null;
	g_sel_angle = 0;
	g_sel_pixelated = false;
	g_sel_mask = null;
	g_sel_points = null;
	g_sel_origin = null;
	resetSelectionMoveByDot();
	resetSelectionRotateByDot();
	if (g_upper) g_upper.ctx.clearRect(0, 0, g_width, g_height);
};

/**
 * 選択範囲の点線枠を最前面のレイヤーに描く
 *
 * 自由形状選択の場合は選択時点の頂点を現在の移動・拡縮・回転量に合わせて変形してから描く
 * （g_sel_floatingのラスター変形と同じ計算をして、見た目を一致させる）
 */
const drawMarquee = () => {
	const ctx = g_upper.ctx;
	ctx.clearRect(0, 0, g_width, g_height);
	if (!g_sel_rect) return;
	ctx.save();
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	if (g_sel_points && g_sel_origin) {
		const { x, y, w, h } = g_sel_rect;
		const { x: ox, y: oy, w: ow, h: oh } = g_sel_origin;
		const scaleX = ow > 0 ? w / ow : 1;
		const scaleY = oh > 0 ? h / oh : 1;
		const cx = x + w / 2;
		const cy = y + h / 2;
		const ocx = ox + ow / 2;
		const ocy = oy + oh / 2;
		const rad = (g_sel_angle * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		g_sel_points.forEach(([px, py], i) => {
			const rx = (px - ocx) * scaleX;
			const ry = (py - ocy) * scaleY;
			const tx = cx + rx * cos - ry * sin;
			const ty = cy + rx * sin + ry * cos;
			if (i === 0) ctx.moveTo(tx, ty);
			else ctx.lineTo(tx, ty);
		});
		ctx.closePath();
	} else {
		const { x, y, w, h } = g_sel_rect;
		ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1);
	}
	ctx.strokeStyle = "#ffffff";
	ctx.stroke();
	ctx.strokeStyle = "#000000";
	ctx.lineDashOffset = 4;
	ctx.stroke();
	ctx.restore();
};

/**
 * レイヤーリストを取得
 *
 * 内部レイヤーリストは削除されると添え字そのままnullになるんやが
 * この関数はnullを除外したレイヤーリストを返すんやで
 */
export const getLayers = () => g_layers.filter((v) => v !== null);

const insertAfter = (sp1: HTMLCanvasElement, sp2: HTMLCanvasElement) =>
	g_layer_container?.insertBefore(sp1, sp2.nextSibling);

/**
 * レイヤーリストを読み込む
 *
 * init()不要の差し替え
 * @param layers getLayers()から取得できる値
 */
export const setLayers = (layers: LayeredCanvas[]) => {
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

/**
 * 背景用
 */
export const lowerLayer = new Config<LayeredCanvas | null>(null);

/**
 * 描画検出用
 */
export const upperLayer = new Config<LayeredCanvas | null>(null);

/**
 * レイヤーキャンバス初期化
 */
export const init = (mountTarget: HTMLElement, width = 640, height = 360) => {
	const layerContainer = document.createElement("div");
	mountTarget.innerHTML = "";
	mountTarget.append(layerContainer);
	g_layer_container = layerContainer;
	g_width = Math.floor(width);
	g_height = Math.floor(height);
	layerContainer.innerHTML = "";
	layerContainer.style.position = "relative";
	layerContainer.style.zIndex = "0"; // スタックコンテキスト
	layerContainer.style.display = "inline-block";
	layerContainer.style.width = `${width}px`;
	layerContainer.style.height = `${height}px`;
	g_serial_number = 0;
	g_sel_layer = null;
	g_sel_rect = null;
	g_sel_floating = null;
	g_sel_base = null;
	g_sel_angle = 0;
	g_sel_pixelated = false;
	g_sel_mask = null;
	g_sel_points = null;
	g_sel_origin = null;
	g_lower = new LayeredCanvas(""); // 1
	g_upper = new LayeredCanvas(""); // 2 (永久欠番)
	g_upper.canvas.style.zIndex = String(2 ** 16 + 3); // レイヤー上限枚数の仮設定65536枚
	lowerLayer.value = g_lower;
	upperLayer.value = g_upper;
	g_layers = [];
};

/**
 * カーソルの座標取得
 */
export const getXY = (e: MouseEvent): [number, number, number] => {
	const { clientX, clientY } = e;
	const rect = g_upper.canvas.getBoundingClientRect();
	let x = Math.floor(clientX - rect.left);
	const y = Math.floor(clientY - rect.top);
	if (flipped.value) x = g_width - x;
	return [x, y, e.buttons];
};

/**
 * ユーザーのクリックイベント
 * PC専用ショートカットを考えるときなどに
 */
export const onClick = (
	callback: (x: number, y: number, buttons: number) => void,
) => {
	g_upper.canvas.addEventListener(
		"click",
		(e) => requestAnimationFrame(() => callback(...getXY(e))),
		{ passive: true },
	);
	g_upper.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
	g_upper.canvas.addEventListener("auxclick", (e) => {
		e.preventDefault();
		requestAnimationFrame(() => callback(...getXY(e)));
	});
};

/**
 * ユーザーの描画中イベント
 */
export const onDraw = (
	callback: (x: number, y: number, buttons: number) => void,
) => {
	g_upper.canvas.addEventListener(
		"pointerdown",
		(e) => {
			resetTranslation();
			g_upper.canvas.setPointerCapture(e.pointerId);
			drawing = true;
			requestAnimationFrame(() => callback(...getXY(e)));
		},
		{ passive: true },
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
		{ passive: true },
	);
	// スクロールとピンチインとピンチアウトを抑止
	g_upper.canvas.addEventListener("touchstart", (e) => e.preventDefault());
	g_upper.canvas.addEventListener("touchmove", (e) => e.preventDefault());
};

let drawing = false;

/**
 * ユーザーの描画完了イベント
 */
export const onDrawn = (
	callback: (x: number, y: number, buttons: number) => void,
) => {
	g_upper.canvas.addEventListener(
		"pointerup",
		(e) => {
			g_upper.canvas.releasePointerCapture(e.pointerId);
			drawing = false;
			requestAnimationFrame(() => callback(...getXY(e)));
		},
		{ passive: true },
	);
};

/**
 * ストレージなどに一時保存可能なレイヤー情報
 */
export type LayeredCanvasMeta = {
	name: string;
	index: number;
	hash: number;
	visible: boolean;
	opacity: number;
	locked: boolean;
	used: boolean;
	uuid: string;
};

/**
 * レイヤークラス
 */
export class LayeredCanvas {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	/**
	 * レイヤー名
	 */
	name: string;
	/**
	 * 内部レイヤーリストの添え字
	 */
	index: number;
	/**
	 * レイヤーの描画履歴
	 */
	history = new LinkedList<Uint8ClampedArray>();
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
	uuid: string;
	constructor(name = "", uuid = "") {
		this.name = name;
		this.uuid = uuid || crypto.randomUUID();
		const canvas = document.createElement("canvas");
		g_layer_container?.append(canvas);
		canvas.width = g_width;
		canvas.height = g_height;
		canvas.style.position = "absolute";
		canvas.style.zIndex = String(++g_serial_number); // 採番は1始まり
		canvas.style.left = "0";
		canvas.style.top = "0";
		canvas.style.touchAction = "none"; // iOS Safari系でpointermoveが間引かれてドット状になるのを防ぐ
		this.canvas = canvas;
		const ctx = canvas.getContext("2d", { willReadFrequently: true }); // 頻繁にgetImageData()を呼び出すための最適化
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
	set meta(meta: LayeredCanvasMeta) {
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
		this.deselect();
		g_layers[this.index] = null; // 欠番
		this.canvas.remove();
	}
	/**
	 * 1つ背面のレイヤー
	 */
	get below(): LayeredCanvas | null {
		const layer = g_layers.slice(0, this.index).findLast((v) => v);
		return layer ? layer : null;
	}
	/**
	 * 1つ前面のレイヤー
	 */
	get above(): LayeredCanvas | null {
		const layer = g_layers.slice(this.index + 1).find((v) => v);
		return layer ? layer : null;
	}
	/**
	 * レイヤーの入れ替え
	 */
	swap(to: number) {
		const from = this.index;
		if (to === from) return;
		const that = g_layers[to];
		if (!that) return;
		[g_layers[from], g_layers[to]] = [g_layers[to], g_layers[from]];
		[this.index, that.index] = [that.index, this.index];
		[this.canvas.style.zIndex, that.canvas.style.zIndex] = [
			that.canvas.style.zIndex,
			this.canvas.style.zIndex,
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
	set visible(visible: boolean) {
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
	set opacity(opacity: number) {
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
	set data(data: Uint8ClampedArray) {
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
	fill(color: string) {
		if (!this.editable) return;
		this.ctx.fillStyle = color;
		this.ctx.fillRect(0, 0, g_width, g_height);
	}
	/**
	 * 貼り付け
	 *
	 * 貼り付け直後は選択状態になり、そのまま移動・拡縮・削除できるんやで
	 */
	paste(
		image:
			| HTMLImageElement
			| HTMLCanvasElement
			| HTMLVideoElement
			| ImageBitmap
			| OffscreenCanvas,
	) {
		if (!this.editable) return;
		clearSelection();
		const { width, height } = image;
		const ratio = Math.min(1, Math.min(g_width / width, g_height / height));
		const w = (width * ratio) | 0;
		const h = (height * ratio) | 0;
		let offsetX = (g_width - w) >> 1;
		let offsetY = (g_height - h) >> 1;
		if (g_dot_size && g_dot_size > 1) {
			offsetX = Math.floor(offsetX / g_dot_size) * g_dot_size;
			offsetY = Math.floor(offsetY / g_dot_size) * g_dot_size;
		}
		const base = this.ctx.getImageData(0, 0, g_width, g_height);
		this.ctx.drawImage(image, offsetX, offsetY, w, h);
		const floating = document.createElement("canvas");
		floating.width = width;
		floating.height = height;
		const ctx = floating.getContext("2d");
		if (!ctx) return;
		ctx.drawImage(image, 0, 0, width, height);
		g_sel_layer = this;
		g_sel_rect = { x: offsetX, y: offsetY, w, h };
		g_sel_floating = floating;
		g_sel_base = base;
		if (g_dot_size && g_dot_size > 1) {
			g_sel_pixelated = true;
		}
		drawMarquee();
	}
	/**
	 * 範囲選択
	 *
	 * 幅・高さが負の場合は正規化し、キャンバス外は切り詰める
	 * 既存の選択範囲は解除される
	 */
	select(x: number, y: number, w: number, h: number) {
		if (!this.editable) return;
		clearSelection();
		let left = x;
		let top = y;
		if (w < 0) {
			left += w;
			w = -w;
		}
		if (h < 0) {
			top += h;
			h = -h;
		}
		const x1 = Math.max(0, Math.floor(left));
		const y1 = Math.max(0, Math.floor(top));
		const x2 = Math.min(g_width, Math.ceil(left + w));
		const y2 = Math.min(g_height, Math.ceil(top + h));
		if (x2 - x1 < 1 || y2 - y1 < 1) return;
		g_sel_layer = this;
		g_sel_rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
		drawMarquee();
	}
	/**
	 * ドット基準の範囲選択
	 *
	 * 始点・終点を1ドット単位のグリッド線にスナップしてから選択する
	 * フラクショナルな位置で切れないので、ドット絵編集で綺麗に選択できるんやで
	 */
	selectByDot(x: number, y: number, w: number, h: number) {
		if (!this.editable) return;
		const size = g_dot_size;
		const snap = (v: number) => Math.round(v / size) * size;
		const sx = snap(x);
		const sy = snap(y);
		const ex = snap(x + w);
		const ey = snap(y + h);
		this.select(sx, sy, ex - sx, ey - sy); // 内部でclearSelection()が呼ばれるため、フラグはこの後に立てる
		if (g_sel_layer === this) g_sel_pixelated = true;
	}
	/**
	 * 自由形状（フリーハンド）の範囲選択
	 *
	 * 頂点列で囲まれた領域を選択する。頂点は自動的に閉じられる（始点と終点を繋ぐ）
	 * 内部的にはバウンディングボックスと同サイズのマスクを作り、以後の移動・拡縮・回転・削除・コピーは
	 * すべてこのマスクの形状に沿って行われる
	 *
	 * @param points 選択したい領域を囲む頂点列（キャンバス座標）。3点未満は無視される
	 */
	selectFreehand(points: [number, number][]) {
		if (!this.editable) return;
		if (points.length < 3) return;
		clearSelection();
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;
		for (const [px, py] of points) {
			minX = Math.min(minX, px);
			minY = Math.min(minY, py);
			maxX = Math.max(maxX, px);
			maxY = Math.max(maxY, py);
		}
		const x1 = Math.max(0, Math.floor(minX));
		const y1 = Math.max(0, Math.floor(minY));
		const x2 = Math.min(g_width, Math.ceil(maxX));
		const y2 = Math.min(g_height, Math.ceil(maxY));
		if (x2 - x1 < 1 || y2 - y1 < 1) return;
		const w = x2 - x1;
		const h = y2 - y1;
		const mask = document.createElement("canvas");
		mask.width = w;
		mask.height = h;
		const mctx = mask.getContext("2d");
		if (!mctx) return;
		mctx.fillStyle = "#fff";
		mctx.beginPath();
		mctx.moveTo(points[0][0] - x1, points[0][1] - y1);
		for (const [px, py] of points.slice(1)) mctx.lineTo(px - x1, py - y1);
		mctx.closePath();
		mctx.fill();
		g_sel_layer = this;
		g_sel_rect = { x: x1, y: y1, w, h };
		g_sel_mask = mask;
		g_sel_points = points.map(([px, py]) => [px, py]);
		g_sel_origin = { x: x1, y: y1, w, h };
		drawMarquee();
	}
	/**
	 * ドット基準の自由形状選択
	 *
	 * 各頂点を1ドット単位のグリッド線にスナップしてからselectFreehand()を呼ぶ
	 * フラクショナルな位置で輪郭が切れないので、ドット絵編集で綺麗に選択できる
	 * 隣接する頂点同士を単純にスナップして繋ぐと斜め45度の辺ができてしまうため、
	 * 各辺の間に直角の角を挟んで階段状（水平・垂直のみ）の輪郭になるよう補正する
	 * 始点と終点を結ぶ閉じる辺にも同様の補正を行う
	 */
	selectFreehandByDot(points: [number, number][]) {
		if (!this.editable) return;
		if (points.length < 3) return;
		const size = g_dot_size;
		const snap = (v: number) => Math.round(v / size) * size;
		// 斜めになる辺の間に、元の移動方向が大きい軸を優先した直角の角を挟む
		const rightAngleCorner = (
			from: [number, number],
			fromRaw: [number, number],
			to: [number, number],
			toRaw: [number, number],
		): [number, number] | null => {
			if (from[0] === to[0] || from[1] === to[1]) return null;
			const dx = toRaw[0] - fromRaw[0];
			const dy = toRaw[1] - fromRaw[1];
			return Math.abs(dx) >= Math.abs(dy) ? [to[0], from[1]] : [from[0], to[1]];
		};
		const snappedPoints: [number, number][] = [];
		let prevRaw: [number, number] | null = null;
		let prevSnapped: [number, number] | null = null;
		for (const [px, py] of points) {
			const snapped: [number, number] = [snap(px), snap(py)];
			if (prevSnapped && prevRaw) {
				const corner = rightAngleCorner(prevSnapped, prevRaw, snapped, [
					px,
					py,
				]);
				if (corner) snappedPoints.push(corner);
			}
			if (
				!prevSnapped ||
				snapped[0] !== prevSnapped[0] ||
				snapped[1] !== prevSnapped[1]
			) {
				snappedPoints.push(snapped);
			}
			prevRaw = [px, py];
			prevSnapped = snapped;
		}
		if (snappedPoints.length >= 2) {
			const first = snappedPoints[0];
			const last = snappedPoints[snappedPoints.length - 1];
			const corner = rightAngleCorner(
				last,
				points[points.length - 1],
				first,
				points[0],
			);
			if (corner) snappedPoints.push(corner);
		}
		this.selectFreehand(snappedPoints); // 内部でclearSelection()が呼ばれるため、フラグはこの後に立てる
		if (g_sel_layer === this) g_sel_pixelated = true;
	}
	/**
	 * このレイヤーの選択範囲
	 *
	 * 他のレイヤーが選択中の場合や未選択の場合はnull
	 */
	get selection(): SelectionRect | null {
		return g_sel_layer === this && g_sel_rect ? { ...g_sel_rect } : null;
	}
	/**
	 * 選択範囲の解除
	 */
	deselect() {
		if (g_sel_layer !== this) return;
		clearSelection();
	}
	/**
	 * 選択範囲の画素をレイヤーから浮かせる
	 *
	 * 最初の移動・拡縮・回転の時に1回だけ実行される
	 * 自由形状選択（g_sel_mask）の場合は、マスクの形状に沿ってのみ浮かせる・消す
	 */
	#lift() {
		if (g_sel_floating || !g_sel_rect) return;
		const { x, y, w, h } = g_sel_rect;
		const floating = document.createElement("canvas");
		floating.width = w;
		floating.height = h;
		const ctx = floating.getContext("2d");
		if (!ctx) throw new Error("Failed to get 2D rendering context");
		ctx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
		if (g_sel_mask) {
			ctx.globalCompositeOperation = "destination-in";
			ctx.drawImage(g_sel_mask, 0, 0);
			ctx.globalCompositeOperation = "source-over";
		}
		if (g_sel_mask) {
			this.ctx.save();
			this.ctx.globalCompositeOperation = "destination-out";
			this.ctx.drawImage(g_sel_mask, x, y);
			this.ctx.restore();
		} else {
			this.ctx.clearRect(x, y, w, h);
		}
		g_sel_base = this.ctx.getImageData(0, 0, g_width, g_height);
		g_sel_floating = floating;
	}
	/**
	 * 浮かせた画素をレイヤーに反映する
	 *
	 * 常にg_sel_floating（原本）から描き直すため、移動・拡縮・回転を繰り返しても画質は劣化しない
	 * g_sel_pixelated中は補間を無効化し、ニアレストネイバーでドット感を保ったまま描画する
	 */
	#renderFloating() {
		if (!g_sel_rect || !g_sel_base || !g_sel_floating) return;
		const { x, y, w, h } = g_sel_rect;
		this.ctx.clearRect(0, 0, g_width, g_height);
		this.ctx.putImageData(g_sel_base, 0, 0);
		const cx = x + w / 2;
		const cy = y + h / 2;
		this.ctx.save();
		this.ctx.imageSmoothingEnabled = !g_sel_pixelated;
		this.ctx.translate(cx, cy);
		this.ctx.rotate((g_sel_angle * Math.PI) / 180);
		this.ctx.drawImage(g_sel_floating, -w / 2, -h / 2, w, h);
		this.ctx.restore();
	}
	/**
	 * 選択範囲の移動
	 *
	 * @param dx x差分
	 * @param dy y差分
	 */
	moveSelection(dx: number, dy: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		this.#lift();
		g_sel_rect.x += dx;
		g_sel_rect.y += dy;
		this.#renderFloating();
		drawMarquee();
	}
	/**
	 * ドット基準で選択範囲を移動
	 *
	 * translateByDot()と同様に、呼び出しをまたいで移動量を累積し
	 * 1ドット分のグリッド線を跨いだ時だけ実際に移動させる
	 * ドラッグ開始時やresetTranslation()呼び出し時に累積はリセットされる
	 * 以降このレイヤーの選択範囲はニアレストネイバーで描画され、ドット感を保つ
	 *
	 * @param dx x差分
	 * @param dy y差分
	 */
	moveSelectionByDot(dx: number, dy: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		g_sel_pixelated = true;
		const size = g_dot_size;
		selMoveAccDx += dx;
		selMoveAccDy += dy;
		const newSnappedDx = Math.round(selMoveAccDx / size) * size;
		const newSnappedDy = Math.round(selMoveAccDy / size) * size;
		const deltaDx = newSnappedDx - selMoveSnappedDx;
		const deltaDy = newSnappedDy - selMoveSnappedDy;
		if (deltaDx === 0 && deltaDy === 0) return;
		this.moveSelection(deltaDx, deltaDy);
		selMoveSnappedDx = newSnappedDx;
		selMoveSnappedDy = newSnappedDy;
	}
	/**
	 * 選択範囲の拡縮
	 *
	 * 左上を基準に選択範囲を指定サイズに変形する
	 * 拡縮は常に最初に浮かせた画像から行われるため、繰り返しても画質は劣化しない
	 */
	resizeSelection(w: number, h: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		if (w < 1 || h < 1) return;
		this.#lift();
		g_sel_rect.w = Math.floor(w);
		g_sel_rect.h = Math.floor(h);
		this.#renderFloating();
		drawMarquee();
	}
	/**
	 * ドット基準で選択範囲を拡縮
	 *
	 * 幅・高さを1ドット単位にスナップしてからresizeSelection()を呼ぶ
	 * 最低でも1ドット分のサイズは確保される
	 * 以降このレイヤーの選択範囲はニアレストネイバーで描画され、ドット感を保つ
	 */
	resizeSelectionByDot(w: number, h: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		g_sel_pixelated = true;
		const size = g_dot_size;
		const sw = Math.max(size, Math.round(w / size) * size);
		const sh = Math.max(size, Math.round(h / size) * size);
		this.resizeSelection(sw, sh);
	}
	/**
	 * 選択範囲の回転
	 *
	 * 選択範囲の中心を軸に、常に最初に浮かせた画像（原本）を基準として回転する
	 * 拡縮と同様に繰り返し呼んでも画質は劣化しない
	 * 選択範囲のw,h（バウンディングボックス）自体は変化しない
	 *
	 * @param deltaAngle 加算する回転角度[度]
	 */
	rotateSelection(deltaAngle: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		this.#lift();
		g_sel_angle = (g_sel_angle + deltaAngle) % 360;
		this.#renderFloating();
		drawMarquee();
	}
	/**
	 * ドット基準で選択範囲を回転
	 *
	 * moveSelectionByDot()と同様に回転量を累積し、90度のグリッド線を跨いだ時だけ実際に回転させる
	 * 90度刻み固定（0/90/180/270度）。中途半端な角度で回転するとドットがグリッドからずれてしまうため
	 * 描画はニアレストネイバー（補間なし）になり、90度刻みなら画素がずれずクッキリ保たれる
	 * #renderFloating()は常にg_sel_floating（原本）から再計算するため、繰り返し回転しても劣化しない
	 * ドラッグ開始時やresetTranslation()呼び出し時に累積はリセットされる
	 *
	 * @param deltaAngle 加算する回転角度[度]
	 */
	rotateSelectionByDot(deltaAngle: number) {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		const step = 90;
		g_sel_pixelated = true;
		selRotateAcc += deltaAngle;
		const newSnapped = Math.round(selRotateAcc / step) * step;
		const delta = newSnapped - selRotateSnapped;
		if (delta === 0) return;
		this.rotateSelection(delta);
		selRotateSnapped = newSnapped;
	}
	/**
	 * 選択範囲の削除
	 *
	 * 選択範囲内の画素を消す。選択枠自体は残る
	 * 自由形状選択の場合は、マスクの形状に沿った部分だけが消える
	 */
	deleteSelection() {
		if (!this.editable || g_sel_layer !== this || !g_sel_rect) return;
		if (g_sel_floating && g_sel_base) {
			this.ctx.clearRect(0, 0, g_width, g_height);
			this.ctx.putImageData(g_sel_base, 0, 0);
			g_sel_floating = null;
			g_sel_base = null;
		} else {
			const { x, y, w, h } = g_sel_rect;
			if (g_sel_mask) {
				this.ctx.save();
				this.ctx.globalCompositeOperation = "destination-out";
				this.ctx.drawImage(g_sel_mask, x, y);
				this.ctx.restore();
			} else {
				this.ctx.clearRect(x, y, w, h);
			}
		}
	}
	/**
	 * 選択範囲の複製
	 *
	 * paste()にそのまま渡せるcanvasを返す。レイヤーは変更されない
	 * 自由形状選択の場合は、マスクの形状に沿った部分だけが複製される（マスク外は透明）
	 */
	copySelection(): HTMLCanvasElement | null {
		if (g_sel_layer !== this || !g_sel_rect) return null;
		const { x, y, w, h } = g_sel_rect;
		const copy = document.createElement("canvas");
		copy.width = w;
		copy.height = h;
		const ctx = copy.getContext("2d");
		if (!ctx) return null;
		if (g_sel_floating) {
			ctx.drawImage(g_sel_floating, 0, 0, w, h);
		} else {
			ctx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
			if (g_sel_mask) {
				ctx.globalCompositeOperation = "destination-in";
				ctx.drawImage(g_sel_mask, 0, 0);
				ctx.globalCompositeOperation = "source-over";
			}
		}
		return copy;
	}
	/**
	 * ドット基準で平行移動
	 *
	 * @param dx x差分
	 * @param dy y差分
	 */
	translateByDot(dx: number, dy: number) {
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
	translate(dx: number, dy: number) {
		if (!this.editable) return;
		if (!translating)
			translating = this.ctx.getImageData(0, 0, g_width, g_height);
		offsetX += dx;
		offsetY += dy;
		this.clear();
		this.ctx.putImageData(
			translating,
			Math.floor(offsetX),
			Math.floor(offsetY),
		);
	}
	/**
	 * ドット基準の消しゴム
	 */
	eraseByDot(x: number, y: number) {
		if (!this.editable) return;
		const size = g_dot_size;
		const _x = Math.floor(x / size) * size;
		const _y = Math.floor(y / size) * size;
		this.ctx.clearRect(_x, _y, size, size);
	}
	/**
	 * ドット基準のペン
	 */
	drawByDot(x: number, y: number) {
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
	erase(x: number, y: number) {
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
	draw(x: number, y: number) {
		if (!this.editable) return;
		this.ctx.fillStyle = color.value;
		const size = penSize.value;
		const radius = size >> 1;
		this.ctx.fillRect(x - radius, y - radius, size, size);
	}
	/**
	 * ブラシ
	 */
	drawLine(fromX: number, fromY: number, toX: number, toY: number) {
		if (!this.editable) return;
		this.ctx.strokeStyle = color.value;
		this.ctx.lineWidth = brushSize.value;
		this.ctx.lineCap = "round";
		this.ctx.beginPath();
		this.ctx.moveTo(fromX, fromY);
		this.ctx.lineTo(toX, toY);
		this.ctx.stroke();
	}
}

/**
 * 全レイヤーを1枚のcanvasに書き出す
 */
export const render = () => {
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

/**
 * スポイト機能
 */
export const dropper = (
	x: number,
	y: number,
): [number, number, number, number] | null => {
	const ctx = render().getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	const { data } = ctx.getImageData(0, 0, g_width, g_height);
	const index = (y * g_width + x) * 4;
	const [r, g, b, a] = data.subarray(index, index + 4);
	return [r, g, b, a];
};

/**
 * nullを詰める
 *
 * 内部レイヤーリストは削除されると添え字そのままnullになる
 * 気が向いたときに掃除すること
 */
export const refresh = () => {
	g_serial_number = 2;
	const layers = getLayers();
	for (const [i, layer] of layers.entries()) {
		layer.index = i;
		layer.canvas.style.zIndex = String(++g_serial_number); // 採番は1始まり
	}
	g_layers = layers;
};

/**
 * 適当なハッシュ関数
 */
const calcHash = (data: Uint8ClampedArray): number => {
	let hash = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < data.length; i++) {
		hash ^= data[i];
		hash = Math.imul(hash, 0x01000193); // FNV prime
	}
	return hash >>> 0;
};
