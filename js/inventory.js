// 生存背包：记录每种方块/物品的数量

export class Inventory {
  constructor() {
    this.counts = new Map();
  }

  count(id) {
    return this.counts.get(id) || 0;
  }

  has(id, n = 1) {
    return this.count(id) >= n;
  }

  add(id, n = 1) {
    if (n <= 0) return;
    this.counts.set(id, this.count(id) + n);
  }

  remove(id, n = 1) {
    const c = this.count(id);
    if (c < n) return false;
    if (c === n) this.counts.delete(id);
    else this.counts.set(id, c - n);
    return true;
  }

  entries() {
    return [...this.counts.entries()].filter(([, c]) => c > 0);
  }

  clear() {
    this.counts.clear();
  }
}
