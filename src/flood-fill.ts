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
