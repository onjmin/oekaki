/**
 * RGBA配列
 */
export type RGBA = [number, number, number, number];

/**
 * バケツ
 *
 * 多分bfsやで
 */
export const floodFill = (
	data: Uint8ClampedArray,
	width: number,
	height: number,
	startX: number,
	startY: number,
	fillColor: RGBA,
): Uint8ClampedArray | null => {
	const getPixel = (x: number, y: number): RGBA => {
		const index = (y * width + x) * 4;
		return [data[index], data[index + 1], data[index + 2], data[index + 3]];
	};
	const setPixel = (x: number, y: number, color: RGBA): void => {
		const index = (y * width + x) * 4;
		[data[index], data[index + 1], data[index + 2], data[index + 3]] = color;
	};
	const colorsMatch = (a: RGBA, b: RGBA): boolean =>
		a.every((value, i) => value === b[i]);
	const targetColor = getPixel(startX, startY);
	if (colorsMatch(targetColor, fillColor)) return null;
	const queue: [number, number][] = [[startX, startY]];
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

/**
 * バケツの塗り範囲の指定
 */
export type FloodFillMaskOptions = {
	/**
	 * 色の許容誤差[0-255]
	 *
	 * アンチエイリアスの掛かった線画は境界の画素が中間色になるので、
	 * 0のままだと線の内側に色が乗らない輪ができる。24前後が扱いやすい
	 */
	tolerance?: number;
	/**
	 * 塗り範囲を何画素ぶん膨らませるか
	 *
	 * 線画の下へ少しもぐり込ませて、線と塗りの間の隙間を消すためのもの。
	 * クリスタの「領域拡縮」に当たる。2前後でだいたい消える
	 */
	grow?: number;
};

/**
 * バケツの塗り範囲だけを求める
 *
 * `data`は塗る相手ではなく**範囲を判定する相手**。
 * 線画レイヤーと塗りレイヤーが分かれている絵では、
 * 全レイヤーを合成した画像を渡して、返ってきた範囲を塗りレイヤーへ適用する。
 * クリスタの「他レイヤーを参照」と同じ使い方ができる
 *
 * @returns 塗る画素を1にした長さ`width * height`の配列
 */
export const floodFillMask = (
	data: Uint8ClampedArray,
	width: number,
	height: number,
	startX: number,
	startY: number,
	options: FloodFillMaskOptions = {},
): Uint8Array | null => {
	const x0 = Math.floor(startX);
	const y0 = Math.floor(startY);
	if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return null;
	const tolerance = Math.max(0, options.tolerance ?? 0);
	const grow = Math.max(0, Math.floor(options.grow ?? 0));

	const start = (y0 * width + x0) * 4;
	const tr = data[start];
	const tg = data[start + 1];
	const tb = data[start + 2];
	const ta = data[start + 3];

	const matches = (index: number): boolean => {
		const a = data[index + 3];
		// 透明どうしはRGBが何であれ同じ画素として扱う
		if (ta === 0 || a === 0) return Math.abs(a - ta) <= tolerance;
		return (
			Math.abs(data[index] - tr) <= tolerance &&
			Math.abs(data[index + 1] - tg) <= tolerance &&
			Math.abs(data[index + 2] - tb) <= tolerance &&
			Math.abs(a - ta) <= tolerance
		);
	};

	const mask = new Uint8Array(width * height);
	// 走査線で埋める。1画素ずつ積むより速く、巨大なキューにもならない
	const stack: number[] = [x0, y0];
	while (stack.length > 0) {
		const y = stack.pop() as number;
		let x = stack.pop() as number;
		while (x >= 0 && !mask[y * width + x] && matches((y * width + x) * 4)) x--;
		x++;
		let spanAbove = false;
		let spanBelow = false;
		while (x < width && !mask[y * width + x] && matches((y * width + x) * 4)) {
			mask[y * width + x] = 1;
			if (y > 0) {
				const up = (y - 1) * width + x;
				const ok = !mask[up] && matches(up * 4);
				if (ok && !spanAbove) {
					stack.push(x, y - 1);
					spanAbove = true;
				} else if (!ok) {
					spanAbove = false;
				}
			}
			if (y < height - 1) {
				const down = (y + 1) * width + x;
				const ok = !mask[down] && matches(down * 4);
				if (ok && !spanBelow) {
					stack.push(x, y + 1);
					spanBelow = true;
				} else if (!ok) {
					spanBelow = false;
				}
			}
			x++;
		}
	}
	if (grow > 0) growMask(mask, width, height, grow);
	return mask;
};

/**
 * 塗り範囲を上下左右へ1画素ずつ膨らませる
 */
export const growMask = (
	mask: Uint8Array,
	width: number,
	height: number,
	amount: number,
): Uint8Array => {
	for (let step = 0; step < amount; step++) {
		const previous = mask.slice();
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const index = y * width + x;
				if (previous[index]) continue;
				if (
					(x > 0 && previous[index - 1]) ||
					(x < width - 1 && previous[index + 1]) ||
					(y > 0 && previous[index - width]) ||
					(y < height - 1 && previous[index + width])
				) {
					mask[index] = 1;
				}
			}
		}
	}
	return mask;
};

/**
 * 求めた塗り範囲を実際に画素へ書き込む
 *
 * @param data 塗る相手（`LayeredCanvas.data`）
 * @param mask `floodFillMask`が返した範囲
 * @param fillColor 塗る色
 * @param alpha 0〜1。1未満なら元の色と混ぜる
 * @param alphaLocked trueなら既に色がある画素にしか塗らない
 */
export const paintMask = (
	data: Uint8ClampedArray,
	mask: Uint8Array,
	fillColor: RGBA,
	alpha = 1,
	alphaLocked = false,
): Uint8ClampedArray => {
	const a = Math.min(1, Math.max(0, alpha));
	const [fr, fg, fb, fa] = fillColor;
	const sourceAlpha = (fa / 255) * a;
	if (sourceAlpha === 0) return data;
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i]) continue;
		const index = i * 4;
		const destinationAlpha = data[index + 3];
		if (alphaLocked && destinationAlpha === 0) continue;
		if (sourceAlpha >= 1 && !alphaLocked) {
			data[index] = fr;
			data[index + 1] = fg;
			data[index + 2] = fb;
			data[index + 3] = 255;
			continue;
		}
		// source-over。透明ロック中は元のアルファを保つ
		const da = destinationAlpha / 255;
		const outAlpha = alphaLocked ? da : sourceAlpha + da * (1 - sourceAlpha);
		if (outAlpha === 0) continue;
		const blend = (source: number, destination: number) =>
			(source * sourceAlpha + destination * da * (1 - sourceAlpha)) / outAlpha;
		data[index] = blend(fr, data[index]);
		data[index + 1] = blend(fg, data[index + 1]);
		data[index + 2] = blend(fb, data[index + 2]);
		data[index + 3] = Math.round(outAlpha * 255);
	}
	return data;
};
