// Holografiske skærme: en canvas pr. arbejdsstation der tegner hvad agenten laver.
import * as THREE from 'three';

const W = 512, H = 320;
const MONO = '"Cascadia Code", Consolas, "SF Mono", monospace';
const SANS = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

const KW = ['def', 'return', 'const', 'if', 'for', 'import', 'class', 'async', 'await', 'let', 'from', 'else'];
const ID = ['user', 'cart', 'total', 'items', 'render', 'state', 'config', 'data', 'result', 'props', 'session', 'order'];
const COL = { kw: '#ff8fd8', id: '#9fe6ff', str: '#b6f5a0', num: '#ffd479', pun: '#c8c6e8', cm: '#7f86b8' };

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }

function codeLine() {
  const indent = Math.floor(Math.random() * 3);
  const r = Math.random();
  let toks;
  if (r < 0.15) toks = [['cm', '# ' + rnd(['TODO: valider input', 'beregn total', 'hent data', 'opdater UI'])]];
  else if (r < 0.4) toks = [['kw', rnd(KW) + ' '], ['id', rnd(ID)], ['pun', ' = '], ['str', `"${rnd(ID)}"`]];
  else if (r < 0.65) toks = [['id', rnd(ID)], ['pun', '.'], ['id', rnd(ID)], ['pun', '('], ['num', String(Math.floor(Math.random() * 99))], ['pun', ')']];
  else toks = [['kw', rnd(KW) + ' '], ['id', rnd(ID)], ['pun', ' => '], ['id', rnd(ID)], ['pun', ' + '], ['num', '1']];
  return { indent, toks, len: toks.reduce((n, t) => n + t[1].length, 0) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clip(ctx, text, maxW) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text ?? '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

export class StationScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.agent = null;
    this.activity = 'off';
    this.t = 0;
    this.acc = 1;
    this.lines = Array.from({ length: 14 }, codeLine);
    this.typed = 0;
    this.term = [];
  }

  set(agent, activity) {
    const key = activity + '|' + (agent?.detail || '');
    if (key !== this.key) {
      this.key = key;
      this.t = 0;
      this.typed = 0;
      this.term = [];
      this.lines = Array.from({ length: 14 }, codeLine);
    }
    this.agent = agent;
    this.activity = activity;
  }

  update(dt) {
    this.t += dt;
    this.acc += dt;
    const fps = this.activity === 'off' ? 4 : 14;
    if (this.acc < 1 / fps) return;
    this.acc = 0;
    this.draw();
    this.texture.needsUpdate = true;
  }

  draw() {
    const c = this.ctx, a = this.agent, t = this.t;
    c.clearRect(0, 0, W, H);
    const accent = a?.color || '#8fd3ff';
    const waiting = this.activity === 'waiting';
    const pulse = 0.5 + Math.sin(t * 6) * 0.5;

    // Baggrund
    roundRect(c, 4, 4, W - 8, H - 8, 22);
    const g = c.createLinearGradient(0, 0, 0, H);
    if (waiting) {
      const red = a?.waiting_kind === 'permission';
      g.addColorStop(0, red ? `rgba(120,20,45,${0.78 + pulse * 0.12})` : `rgba(110,70,10,${0.78 + pulse * 0.12})`);
      g.addColorStop(1, 'rgba(30,10,30,0.82)');
    } else if (this.activity === 'done') {
      g.addColorStop(0, 'rgba(20,90,70,0.82)'); g.addColorStop(1, 'rgba(10,30,40,0.82)');
    } else {
      g.addColorStop(0, 'rgba(22,26,70,0.80)'); g.addColorStop(1, 'rgba(10,12,40,0.84)');
    }
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = waiting ? `rgba(255,120,140,${0.5 + pulse * 0.5})` : accent; c.globalAlpha = 0.9; c.stroke(); c.globalAlpha = 1;

    if (this.activity === 'off') return this.drawIdle();

    // Header
    c.fillStyle = accent; c.globalAlpha = 0.22; c.fillRect(6, 6, W - 12, 46); c.globalAlpha = 1;
    c.fillStyle = accent; c.beginPath(); c.arc(32, 29, 9, 0, Math.PI * 2); c.fill();
    c.font = `600 22px ${SANS}`; c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
    c.fillText(clip(c, a?.name || '', 220), 50, 30);
    c.font = `500 18px ${SANS}`; c.fillStyle = 'rgba(255,255,255,0.75)'; c.textAlign = 'right';
    c.fillText(HEAD[this.activity] || '', W - 22, 30);
    c.textAlign = 'left';

    const fn = DRAW[this.activity] || DRAW.tool;
    fn.call(this, c, a, t);
  }

  drawIdle() {
    const c = this.ctx, t = this.t;
    c.globalAlpha = 0.35 + Math.sin(t * 1.5) * 0.15;
    c.strokeStyle = '#9fe6ff'; c.lineWidth = 3;
    const cx = W / 2, cy = H / 2 - 10;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = t * 0.6 + (i * Math.PI) / 2;
      const x = cx + Math.cos(ang) * 40, y = cy + Math.sin(ang) * 40;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
    c.font = `600 24px ${SANS}`; c.fillStyle = '#cfe9ff'; c.textAlign = 'center';
    c.fillText('Ledig station', cx, cy + 84);
    c.textAlign = 'left'; c.globalAlpha = 1;
  }
}

const HEAD = {
  coding: '⌨️ Koder', terminal: '🖥️ Terminal', reading: '📖 Læser', exploring: '🔍 Leder',
  browsing: '🌐 Nettet', planning: '📋 Plan', delegating: '🤝 Hjælpere', tool: '🔧 Værktøj',
  thinking: '💭 Tænker', waiting: '❗ Venter', done: '✓ Færdig',
};

const DRAW = {
  coding(c, a, t) {
    c.font = `500 17px ${MONO}`; c.fillStyle = '#ffd479';
    c.fillText(clip(c, '✎ ' + (a?.detail || 'fil'), W - 50), 22, 72);
    this.typed += 1.6;
    const lineH = 20, top = 98;
    let budget = Math.floor(this.typed);
    const visible = 10;
    if (budget > this.lines.slice(0, visible).reduce((n, l) => n + l.len, 0)) {
      const removed = this.lines.shift();
      this.lines.push(codeLine());
      this.typed -= removed.len;
      budget = Math.floor(this.typed);
    }
    c.font = `16px ${MONO}`;
    for (let i = 0; i < visible; i++) {
      const L = this.lines[i];
      let x = 22 + L.indent * 22;
      const y = top + i * lineH;
      c.fillStyle = 'rgba(200,200,255,0.3)'; c.fillText(String(i + 1).padStart(2, ' '), 4, y);
      for (const [k, s] of L.toks) {
        if (budget <= 0) break;
        const part = s.slice(0, budget);
        budget -= part.length;
        c.fillStyle = COL[k]; c.fillText(part, x + 14, y);
        x += c.measureText(part).width;
      }
      if (budget <= 0) {
        if (Math.sin(t * 10) > 0) { c.fillStyle = '#fff'; c.fillRect(x + 16, y - 9, 9, 18); }
        break;
      }
    }
  },

  terminal(c, a, t) {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(14, 60, W - 28, H - 76);
    c.font = `16px ${MONO}`;
    c.fillStyle = '#7dffa8';
    c.fillText(clip(c, '$ ' + (a?.detail || ''), W - 50), 24, 82);
    if (this.term.length < 9 && Math.random() < 0.35) {
      this.term.push(rnd(['  ✓ ok', '  … kører', '  ✓ bestået', '  → bygger modul', '  ⓘ 12 filer', '  ✓ færdig', '  · · ·']));
    }
    this.term.forEach((l, i) => {
      c.fillStyle = l.includes('✓') ? '#9dffb8' : 'rgba(210,255,225,0.7)';
      c.fillText(l, 24, 108 + i * 20);
    });
    // progressbar
    const p = (t * 0.25) % 1;
    c.fillStyle = 'rgba(125,255,168,0.25)'; c.fillRect(24, H - 32, W - 48, 8);
    c.fillStyle = '#7dffa8'; c.fillRect(24, H - 32, (W - 48) * p, 8);
  },

  reading(c, a, t) {
    c.font = `500 17px ${SANS}`; c.fillStyle = '#ffd479';
    c.fillText(clip(c, '📄 ' + (a?.detail || 'dokument'), W - 50), 22, 72);
    c.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(c, 40, 90, W - 80, H - 106, 10); c.fill();
    const scan = (t * 0.6) % 1;
    for (let i = 0; i < 9; i++) {
      const y = 108 + i * 21;
      const w = (W - 120) * (0.55 + ((i * 37) % 40) / 100);
      const hl = Math.abs(i / 9 - scan) < 0.07;
      c.fillStyle = hl ? (a?.color || '#ffd479') : 'rgba(60,60,100,0.35)';
      c.fillRect(60, y, w, 8);
    }
  },

  exploring(c, a, t) { DRAW.browsing.call(this, c, a, t, '🔍', 'match'); },

  browsing(c, a, t, icon = '🌐', unit = 'resultat') {
    c.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(c, 30, 66, W - 60, 40, 20); c.fill();
    c.font = `16px ${SANS}`; c.fillStyle = '#334';
    const full = a?.detail || '';
    const n = Math.min(full.length, Math.floor(t * 18));
    c.fillText(clip(c, `${icon}  ${full.slice(0, n)}${Math.sin(t * 8) > 0 ? '|' : ''}`, W - 100), 48, 87);
    const count = Math.min(4, Math.floor(t * 1.2));
    for (let i = 0; i < count; i++) {
      const y = 122 + i * 46;
      c.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(c, 30, y, W - 60, 38, 10); c.fill();
      c.fillStyle = a?.color || '#9fe6ff'; c.fillRect(44, y + 10, 120 + ((i * 53) % 90), 7);
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(44, y + 23, 220 + ((i * 71) % 120), 5);
    }
    if (count === 0) { c.fillStyle = '#cfe9ff'; c.font = `16px ${SANS}`; c.fillText(`Finder ${unit}er…`, 40, 140); }
  },

  planning(c, a, t) {
    const items = ['Forstå opgaven', 'Læs relevante filer', 'Lav ændringerne', 'Kør tests', 'Opsummér'];
    const done = Math.floor(t * 0.8) % (items.length + 1);
    c.font = `18px ${SANS}`;
    items.forEach((it, i) => {
      const y = 86 + i * 44;
      c.strokeStyle = '#cfe9ff'; c.lineWidth = 2; roundRect(c, 32, y - 13, 26, 26, 6); c.stroke();
      if (i < done) { c.fillStyle = '#7dffa8'; c.font = `bold 20px ${SANS}`; c.fillText('✓', 37, y + 1); c.font = `18px ${SANS}`; }
      c.fillStyle = i < done ? 'rgba(255,255,255,0.5)' : '#fff';
      c.fillText(it, 74, y);
      if (i < done) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(74, y, c.measureText(it).width, 2); }
    });
  },

  delegating(c, a, t) {
    const cx = W / 2, cy = 150;
    c.font = `16px ${SANS}`; c.fillStyle = '#ffd479'; c.textAlign = 'center';
    c.fillText(clip(c, a?.detail || '', W - 60), cx, 76); c.textAlign = 'left';
    const n = Math.max(1, Math.min(4, a?.helpers || 1));
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * 2.2 + Math.PI;
      const x = cx + Math.cos(ang) * 150, y = cy + 60 + Math.sin(ang) * -90;
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
      const p = (t * 0.8 + i * 0.3) % 1;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + (x - cx) * p, cy + (y - cy) * p, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = a?.color || '#9fe6ff'; c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill();
  },

  thinking(c, a, t) {
    c.font = `16px ${SANS}`; c.fillStyle = 'rgba(255,255,255,0.75)';
    wrap(c, a?.last_prompt || a?.detail || '', W - 60, 2).forEach((l, i) => c.fillText(l, 30, 76 + i * 22));
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = k === 0 ? (a?.color || '#9fe6ff') : `rgba(160,220,255,${0.5 - k * 0.15})`;
      c.lineWidth = 3;
      c.beginPath();
      for (let x = 30; x <= W - 30; x += 6) {
        const y = 200 + Math.sin(x * 0.03 + t * (3 + k) + k) * (24 - k * 6) * Math.sin(t * 1.3 + k);
        x === 30 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
  },

  waiting(c, a, t) {
    const red = a?.waiting_kind === 'permission';
    c.textAlign = 'center';
    c.font = `bold 34px ${SANS}`; c.fillStyle = '#fff';
    c.fillText(red ? '⚠ Kræver tilladelse' : '💬 Venter på dig', W / 2, 108);
    c.font = `17px ${SANS}`; c.fillStyle = 'rgba(255,255,255,0.85)';
    wrap(c, a?.detail || '', W - 70, 4).forEach((l, i) => c.fillText(l, W / 2, 158 + i * 24));
    c.font = `600 16px ${SANS}`; c.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 5) * 0.4})`;
    c.fillText('Skift til Claude Code for at svare', W / 2, H - 30);
    c.textAlign = 'left';
  },

  done(c, a, t) {
    const s = Math.min(1, t * 2.5);
    c.strokeStyle = '#7dffa8'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(W / 2 - 50, 160); c.lineTo(W / 2 - 50 + 35 * s, 160 + 35 * s);
    if (s > 0.5) c.lineTo(W / 2 - 15 + 80 * (s - 0.5) * 2, 195 - 90 * (s - 0.5) * 2);
    c.stroke(); c.lineCap = 'butt';
    c.textAlign = 'center'; c.font = `bold 30px ${SANS}`; c.fillStyle = '#fff';
    c.fillText('Færdig!', W / 2, 260);
    c.textAlign = 'left';
  },

  tool(c, a, t) {
    c.textAlign = 'center'; c.font = `17px ${MONO}`; c.fillStyle = '#ffd479';
    c.fillText(clip(c, a?.detail || '', W - 60), W / 2, 90);
    const cx = W / 2, cy = 190;
    c.save(); c.translate(cx, cy); c.rotate(t * 1.5);
    c.strokeStyle = a?.color || '#9fe6ff'; c.lineWidth = 14;
    for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, 38); c.lineTo(0, 54); c.stroke(); }
    c.lineWidth = 10; c.beginPath(); c.arc(0, 0, 36, 0, Math.PI * 2); c.stroke();
    c.restore(); c.textAlign = 'left';
  },
};
