// WebSocket-forbindelse til serveren med automatisk genforbindelse.
export class Connection {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.delay = 500;
    this.connect();
    setInterval(() => { if (this.ws?.readyState === 1) this.ws.send('ping'); }, 20000);
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.delay = 500; this.onStatus?.(true); };
    ws.onmessage = (e) => {
      try { this.onMessage?.(JSON.parse(e.data)); } catch (err) { console.error(err); }
    };
    ws.onclose = () => {
      this.onStatus?.(false);
      setTimeout(() => this.connect(), this.delay);
      this.delay = Math.min(this.delay * 1.6, 5000);
    };
    ws.onerror = () => ws.close();
  }
}

export async function api(path) {
  const r = await fetch(path, { method: 'POST' });
  return r.json();
}
