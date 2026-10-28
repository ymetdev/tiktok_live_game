// Cutscene queue of the post-match phase. add() after close() is refused: the caller keeps that viewer for the NEXT round
// (their Class is already saved and active; only the cutscene moves).
export class CutsceneQueue {
  constructor() { this.items = new Map(); this.order = []; this.closed = false; }
  add(userId, reason, data = {}) {
    if (this.closed) return false;
    let it = this.items.get(userId);
    if (!it) { it = { userId, reasons: new Set(), data: {} }; this.items.set(userId, it); this.order.push(userId); }
    it.reasons.add(reason); Object.assign(it.data, data); // several reasons (class + gift) = ONE cutscene
    return true;
  }
  close() { this.closed = true; }
  next() { const id = this.order.shift(); if (id === undefined) return null; const it = this.items.get(id); this.items.delete(id); return { userId: id, reasons: [...it.reasons], data: it.data }; }
  get size() { return this.order.length; }
}
