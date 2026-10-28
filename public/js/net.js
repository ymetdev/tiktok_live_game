// Server connection for the game page: SSE event stream (auto-reconnect) + small REST helper with the channel token.
export class Net {
  constructor(token, channel = 'main') { this.token = token; this.channel = channel; this.handlers = new Set(); this.connected = false; }
  async api(path, body, method = body === undefined ? 'GET' : 'POST') {
    const r = await fetch(`/api/${path}`, { method, headers: { 'x-channel-token': this.token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status }); return j;
  }
  // retry transient failures (server restart / Render cold start) so an OBS page never dies on a blip
  async retry(path, body, tries = 8) { for (let i = 0; ; i++) { try { return await this.api(path, body); } catch (e) { if (e.status && e.status < 500 && e.status !== 429) throw e; if (i >= tries) throw e; await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** i))); } } }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  start() {
    const es = new EventSource(`/api/stream?channel=${encodeURIComponent(this.channel)}`);
    es.onopen = () => { this.connected = true; }; es.onerror = () => { this.connected = false; };
    es.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch { return; } for (const h of this.handlers) h(d); };
    this.es = es;
  }
}
