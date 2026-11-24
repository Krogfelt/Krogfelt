// AgentManager: binder server-data til væsner, stationer, labels og effekter.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Creature } from './creature.js';
import { STATION_ACTIVITIES, activityInfo, escapeHtml } from './text.js';
import { polar } from './world.js';

const DONE_CELEBRATE = 1.8; // sekunder fejring ved stationen før agenten går hjem

export class AgentManager {
  constructor(scene, world, { onSelect } = {}) {
    this.scene = scene;
    this.world = world;
    this.onSelect = onSelect;
    this.items = new Map();     // id -> { data, creature, label, location, doneAt }
    this.leaving = [];
    this.particles = [];
    this.confetti = [];
    this.flowT = 0;
    this.selected = null;
    this.particleGeo = new THREE.SphereGeometry(0.05, 10, 8);
    this.confettiGeo = new THREE.PlaneGeometry(0.09, 0.05);
  }

  // ----------------------------------------------------------- data
  sync(list) {
    const ids = new Set(list.map((a) => a.id));
    for (const id of [...this.items.keys()]) if (!ids.has(id)) this.remove(id);
    list.forEach((a) => this.upsert(a));
  }

  upsert(data) {
    let it = this.items.get(data.id);
    if (!it) {
      const creature = new Creature({ id: data.id, color: data.color, species: data.species });
      const home = this.homeFor(data);
      creature.root.position.copy(home);
      this.scene.add(creature.root);
      const label = this.makeLabel(data);
      creature.root.add(label.obj);
      it = { data, creature, label, location: 'home', doneAt: 0 };
      this.items.set(data.id, it);
      this.burst(home.clone().setY(0.6), data.color, 26);
      if (data.slot != null) this.world.setHomeColor(data.slot, data.color);
    }
    const prev = it.data;
    it.data = data;
    if (data.activity === 'done' && prev.activity !== 'done') {
      it.doneAt = performance.now() / 1000;
      this.burst(it.creature.position.clone().setY(1.2), data.color, 60);
    }
    it.creature.waitingKind = data.waiting_kind;
    it.creature.setHelpers(data.helpers || 0);
    this.updateLabel(it);
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    if (it.data.slot != null) {
      this.world.setStationAgent(it.data.slot, null, 'off');
      this.world.setHomeColor(it.data.slot, null);
    }
    it.label.el.remove();
    it.creature.root.remove(it.label.obj);
    it.creature.removing = true;
    this.burst(it.creature.position.clone().setY(0.6), it.data.color, 30);
    this.leaving.push(it.creature);
    if (this.selected === id) this.selected = null;
  }

  homeFor(data) {
    if (data.slot != null) return this.world.stations[data.slot].homePos.clone();
    // Overløb (flere end 8 agenter): ydre ring
    let h = 0;
    for (const ch of data.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return polar(11, (h % 360) * Math.PI / 180);
  }

  // ----------------------------------------------------------- labels
  makeLabel(data) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `<div class="bubble"></div><div class="name"></div>`;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onSelect?.(data.id); });
    const obj = new CSS2DObject(el);
    obj.position.set(0, 1.42, 0);
    return { el, obj, bubble: el.querySelector('.bubble'), name: el.querySelector('.name') };
  }

  updateLabel(it) {
    const d = it.data;
    const info = activityInfo(d);
    it.label.el.style.setProperty('--c', d.color);
    it.label.name.textContent = d.name;
    it.label.bubble.innerHTML = `<span class="em">${info.emoji}</span><span class="tx">${escapeHtml(info.text)}</span>`;
    it.label.el.classList.toggle('waiting', !!d.waiting);
    it.label.el.classList.toggle('perm', d.waiting && d.waiting_kind === 'permission');
    it.label.el.classList.toggle('sleep', d.activity === 'sleeping');
    it.label.el.classList.toggle('selected', this.selected === d.id);
  }

  select(id) {
    this.selected = id;
    for (const it of this.items.values()) this.updateLabel(it);
  }

  // ----------------------------------------------------------- effekter
  burst(pos, color, n) {
    const palette = [color, '#ffffff', '#ffd36e', '#ff9ec7', '#8fd3ff'];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.confettiGeo, new THREE.MeshBasicMaterial({ color: palette[i % palette.length], side: THREE.DoubleSide, transparent: true }));
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, up = 2.5 + Math.random() * 3;
      m.userData = { v: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), up, Math.sin(a) * (1 + Math.random() * 2)), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 1.6 + Math.random() * 0.8 };
      this.scene.add(m);
      this.confetti.push(m);
    }
  }

  emitFlow(station, color) {
    const m = new THREE.Mesh(this.particleGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false, transparent: true }));
    const from = this.world.coreTop.clone();
    const to = station.holo.position.clone();
    const mid = from.clone().lerp(to, 0.5); mid.y += 1.4;
    m.userData = { curve: new THREE.QuadraticBezierCurve3(from, mid, to), t: 0, speed: 0.7 + Math.random() * 0.4 };
    this.scene.add(m);
    this.particles.push(m);
  }

  // ----------------------------------------------------------- hovedløkke
  update(dt, t, camera) {
    const now = performance.now() / 1000;
    let working = 0, waiting = 0;

    for (const it of this.items.values()) {
      const d = it.data, c = it.creature;
      const slot = d.slot;
      const hasStation = slot != null;
      const atStation = STATION_ACTIVITIES.has(d.activity);
      if (atStation) working++;
      if (d.waiting) waiting++;

      // Hvor skal agenten være?
      let want = it.location;
      if (atStation) want = 'station';
      else if (d.activity === 'waiting') want = it.location; // bliv hvor du er
      else if (d.activity === 'done') want = now - it.doneAt > DONE_CELEBRATE ? 'home' : it.location;
      else want = 'home';
      if (!hasStation) want = 'home';

      if (want !== it.location && !it.moving) {
        if (want === 'station') c.walkTo(this.world.pathToStation(slot));
        else c.walkTo(hasStation ? this.world.pathToHome(slot) : [this.homeFor(d)]);
        it.moving = want;
      }
      if (it.moving && c.path.length === 0) {
        it.location = it.moving;
        it.moving = null;
      }

      // Animation + retning
      const there = !it.moving;
      if (there && it.location === 'station') {
        c.anim = d.activity === 'done' ? 'done' : (d.waiting ? 'waiting' : d.activity);
        c.faceCamera = d.waiting || d.activity === 'done';
        c.faceTarget = this.world.stations[slot].deskPos;
      } else {
        c.anim = d.waiting ? 'waiting' : (d.activity === 'done' ? (there && it.location === 'home' ? 'idle' : 'done') : (d.activity === 'sleeping' ? 'sleeping' : (atStation ? 'thinking' : 'idle')));
        c.faceCamera = true;
      }

      // Stationens skærm
      if (hasStation) {
        const st = this.world.stations[slot];
        const screenAct = there && it.location === 'station'
          ? (d.waiting ? 'waiting' : d.activity)
          : (d.activity === 'done' && now - it.doneAt < DONE_CELEBRATE + 1 ? 'done' : 'off');
        if (st.activity !== screenAct || st.agent !== d) this.world.setStationAgent(slot, d, screenAct);
        if (there && it.location === 'station' && atStation && !d.waiting) {
          st.flowAcc = (st.flowAcc || 0) + dt;
          if (st.flowAcc > 0.28) { st.flowAcc = 0; this.emitFlow(st, d.color); }
        }
      }

      c.update(dt, t, camera);
    }

    // Agenter der forlader hubben
    this.leaving = this.leaving.filter((c) => {
      c.update(dt, t, camera);
      if (c.removeT > 0.6) { this.scene.remove(c.root); c.dispose(); return false; }
      return true;
    });

    // Data-partikler fra kernen til skærmene
    this.particles = this.particles.filter((m) => {
      const u = m.userData;
      u.t += dt * u.speed;
      if (u.t >= 1) { this.scene.remove(m); m.material.dispose(); return false; }
      m.position.copy(u.curve.getPoint(u.t));
      m.material.opacity = Math.sin(u.t * Math.PI);
      return true;
    });

    // Konfetti
    this.confetti = this.confetti.filter((m) => {
      const u = m.userData;
      u.life -= dt;
      u.v.y -= 6 * dt;
      u.v.multiplyScalar(1 - 0.9 * dt);
      m.position.addScaledVector(u.v, dt);
      if (m.position.y < 0.05) { m.position.y = 0.05; u.v.set(0, 0, 0); }
      m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt; m.rotation.z += u.spin.z * dt;
      m.material.opacity = Math.min(1, u.life * 2);
      if (u.life <= 0) { this.scene.remove(m); m.material.dispose(); return false; }
      return true;
    });

    return { working, waiting, total: this.items.size };
  }

  pickables() {
    return [...this.items.values()].map((it) => it.creature.root);
  }

  positionOf(id) {
    return this.items.get(id)?.creature.position;
  }
}
