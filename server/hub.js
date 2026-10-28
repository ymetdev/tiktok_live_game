// Per-channel event hub: SSE fan-out to the game page(s) watching a channel.
export class Hub {
  constructor() { this.clients = new Map(); this.seq = 0; } // channel -> Set<res>
  add(channel, res) { (this.clients.get(channel) || this.clients.set(channel, new Set()).get(channel)).add(res); res.on('close', () => this.clients.get(channel)?.delete(res)); }
  publish(channel, msg) {
    const set = this.clients.get(channel); if (!set || !set.size) return; const data = `id: ${++this.seq}\ndata: ${JSON.stringify(msg)}\n\n`;
    for (const r of set) { try { r.write(data); } catch { set.delete(r); } }
  }
  count(channel) { return this.clients.get(channel)?.size || 0; }
  heartbeat() { for (const set of this.clients.values()) for (const r of set) { try { r.write(': ka\n\n'); } catch { set.delete(r); } } }
}
