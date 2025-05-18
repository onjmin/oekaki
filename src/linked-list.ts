type ListNode<T> = {
	value: T | null;
	prev: ListNode<T> | null;
	next: ListNode<T> | null;
};

/**
 * お絵描きログ特化型の連結リスト
 */
export class LinkedList<T> {
	#cursor: ListNode<T>;
	constructor() {
		const node = { value: null, prev: null, next: null };
		this.#cursor = node;
	}
	add(value: T) {
		const node: ListNode<T> = {
			value,
			prev: this.#cursor,
			next: null,
		};
		this.#cursor.next = node;
		this.#cursor = node;
	}
	undo(): T | null {
		const { prev } = this.#cursor;
		if (prev === null || prev.value === null) return null;
		this.#cursor = prev;
		return this.#cursor.value;
	}
	redo(): T | null {
		const { next } = this.#cursor;
		if (next === null || next.value === null) return null;
		this.#cursor = next;
		return this.#cursor.value;
	}
}
