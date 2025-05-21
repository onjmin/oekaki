type ListNode<T> = {
	value: T | null;
	prev: ListNode<T> | null;
	next: ListNode<T> | null;
};

/**
 * お絵描きの履歴に特化した連結リスト
 *
 * 余計な変換がないんでUint8ClampedArrayを履歴に使うとええぞ
 */
export class LinkedList<T> {
	#cursor: ListNode<T>;
	constructor() {
		const node = { value: null, prev: null, next: null };
		this.#cursor = node;
	}
	/**
	 * 履歴を1つ追加
	 */
	add(value: T) {
		const node: ListNode<T> = {
			value,
			prev: this.#cursor,
			next: null,
		};
		this.#cursor.next = node;
		this.#cursor = node;
	}
	/**
	 * 履歴を1つ戻す
	 */
	undo(): T | null {
		const { prev } = this.#cursor;
		if (prev === null || prev.value === null) return null;
		this.#cursor = prev;
		return this.#cursor.value;
	}
	/**
	 * 履歴を1つ進める
	 */
	redo(): T | null {
		const { next } = this.#cursor;
		if (next === null || next.value === null) return null;
		this.#cursor = next;
		return this.#cursor.value;
	}
}
