/**
 * 線形補間
 *
 * イベントは連続して発生しないんで、間の座標を計算する必要があるんや
 */
export const lerp = (x: number, y: number, _x: number, _y: number) => {
	const a = _x - x;
	const b = _y - y;
	const len = Math.max(...[a, b].map(Math.abs)) || 1;
	const _a = a / len;
	const _b = b / len;
	return [...new Array(len).keys()].map((i) =>
		[i * _a + x, i * _b + y].map(Math.round),
	);
};
