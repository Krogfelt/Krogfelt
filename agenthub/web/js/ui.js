// HTML-overlay: topbar, agentpanel, hændelseslog, toasts og lyd.
import { SPECIES_NAME, activityInfo, escapeHtml, timeAgo } from './text.js';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor({ onSelect, onDemo }) {
    this.onSelect = onSelect;
    this.onDemo = onDemo;
    this.agents = new Map();
    this.log = [];
    this.demo = false;
    this.muted = (() => { try { return localStorage.getItem('agenthub.muted') === '1'; } catch { return false; } })();
    this.selected = null;
    this.clockSkew = 0;

    $('#btn-demo').addEventListener('click', () => this.onDemo?.(!this.demo));
    $('#empty-demo').addEventListener('click', () => this.onDemo?.(true));
    $('#btn-sound').addEventListener('click', () => this.setMuted(!this.muted));
    $('#btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-hidden'));
    $('#log-head').addEventListener('click', () => $('#log').classList.toggle('open'));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('panel-hidden');
    });
    this.setMuted(this.muted);
    setInterval(() => this.renderCards(), 1000);
  }

  setConnected(ok) {
    $('#conn').classList.toggle('ok', ok);
    $('#conn-text').textContent = ok ? 'Forbundet' : 'Forbinder…';
  }

  setDemo(on) {
    this.demo = on;
    $('#btn-demo').textContent = on ? '■ Stop demo' : '▶ Demo';
    $('#btn-demo').classList.toggle('active', on);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('agenthub.muted', m ? '1' : '0'); } catch { /* ignorer */ }
    $('#btn-sound').textContent = m ? '🔇' : '🔔';
  }

  // --------------------------------------------------------- data
  snapshot(msg) {
    this.clockSkew = Date.now() / 1000 - (msg.server_time || Date.now() / 1000);
    this.agents = new Map(msg.agents.map((a) => [a.id, a]));
    this.log = msg.log || [];
    this.setDemo(!!msg.demo);
    this.renderCards(); this.renderLog();
  }

  agent(a) {
    const prev = this.agents.get(a.id);
    this.agents.set(a.id, a);
    if (a.waiting && !(prev && prev.waiting)) {
      const perm = a.waiting_kind === 'permission';
      this.toast(`${perm ? '❗' : '💬'} <b>${escapeHtml(a.name)}</b> ${perm ? 'venter på din tilladelse' : 'venter på dit svar'}`, perm ? 'perm' : 'input');
      this.chime(perm);
    }
    if (a.activity === 'done' && prev && prev.activity !== 'done') this.chime(false, true);
    this.renderCards();
  }

  remove(id) { this.agents.delete(id); this.renderCards(); }

  addLog(entry) {
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.renderLog();
  }

  select(id) { this.selected = id; this.renderCards(); }

  // --------------------------------------------------------- render
  renderCards() {
    const list = [...this.agents.values()];
    const rank = (a) => (a.waiting ? 0 : a.activity === 'idle' || a.activity === 'done' || a.activity === 'sleeping' ? 2 : 1);
    list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const nowS = Date.now() / 1000 - this.clockSkew;

    const working = list.filter((a) => rank(a) === 1).length;
    const waiting = list.filter((a) => a.waiting).length;
    $('#stat-work').textContent = working;
    $('#stat-wait').textContent = waiting;
    $('#stat-total').textContent = list.length;
    $('#chip-wait').classList.toggle('alert', waiting > 0);
    document.title = waiting ? `(${waiting}) Agent Hub – venter på dig` : 'Agent Hub';
    $('#empty').classList.toggle('show', list.length === 0);

    const html = list.map((a) => {
      const info = activityInfo(a);
      const cls = ['card', a.waiting ? 'waiting' : '', a.waiting_kind === 'permission' && a.waiting ? 'perm' : '', this.selected === a.id ? 'selected' : ''].join(' ');
      return `<div class="${cls}" data-id="${escapeHtml(a.id)}" style="--c:${a.color}">
        <div class="card-top"><span class="dot"></span><span class="nm">${escapeHtml(a.name)}</span><span class="sp">${SPECIES_NAME[a.species] || ''}</span></div>
        <div class="st"><span>${info.emoji}</span> ${escapeHtml(info.text)}</div>
        ${a.detail ? `<div class="dt" title="${escapeHtml(a.detail)}">${escapeHtml(a.detail)}</div>` : ''}
        <div class="meta"><span>🛠 ${a.tool_count}</span><span>✏️ ${a.edit_count}</span>${a.helpers ? `<span>🐣 ${a.helpers}</span>` : ''}<span class="ago">${timeAgo(nowS - a.last_event)}</span></div>
      </div>`;
    }).join('');
    const box = $('#cards');
    if (box.dataset.html !== html) {
      box.innerHTML = html;
      box.dataset.html = html;
      box.querySelectorAll('.card').forEach((el) => el.addEventListener('click', () => this.onSelect?.(el.dataset.id)));
    }
  }

  renderLog() {
    const rows = this.log.slice(-40).reverse().map((e) => {
      const d = new Date(e.t * 1000);
      const hh = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<div class="row k-${e.kind}"><span class="tm">${hh}</span><span class="who" style="--c:${e.color}">${escapeHtml(e.name)}</span><span class="tx">${escapeHtml(e.text)}</span></div>`;
    }).join('');
    $('#log-rows').innerHTML = rows || '<div class="row muted">Ingen hændelser endnu</div>';
    const last = this.log[this.log.length - 1];
    $('#log-last').innerHTML = last ? `<b style="color:${last.color}">${escapeHtml(last.name)}</b> ${escapeHtml(last.text)}` : '';
  }

  toast(html, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 5000);
  }

  chime(urgent, happy = false) {
    if (this.muted) return;
    try {
      this.ac = this.ac || new AudioContext();
      const ac = this.ac;
      if (ac.state === 'suspended') ac.resume();
      const notes = happy ? [784, 988, 1175] : urgent ? [880, 660, 880] : [660, 880];
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = ac.currentTime + i * 0.12;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(happy ? 0.06 : 0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(t0); o.stop(t0 + 0.4);
      });
    } catch { /* lyd er valgfri */ }
  }
}
