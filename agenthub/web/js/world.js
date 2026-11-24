// Verdenen: svævende ø, himmel, lys, den centrale hub med arbejdsstationer og kernen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { StationScreen } from './screens.js';

export const STATION_COUNT = 8;
export const R = { work: 3.55, desk: 4.45, holo: 4.75, home: 8.6, hub: 6.4, island: 16 };
const GAP = Math.PI / STATION_COUNT;  // vinkel midt mellem to stationer

export const polar = (r, a, y = 0) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadowed(o, cast = true, receive = true) {
  o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.stations = [];
    this.buildSky();
    this.buildLights();
    this.buildIsland();
    this.buildHub();
    this.buildCore();
    this.buildDecor();
    this.buildFireflies();
  }

  // ------------------------------------------------------------ himmel/lys
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#7fa8ff') },
        mid: { value: new THREE.Color('#f4cdf0') },
        bottom: { value: new THREE.Color('#ffe2c4') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.65, h)) : mix(mid, bottom, smoothstep(0.0, -0.5, h));
        gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog('#f2d4ee', 50, 150);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#e4ecff', '#e9c9b4', 0.95));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.9);
    sun.position.set(9, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -17; s.right = 17; s.top = 17; s.bottom = -17; s.near = 1; s.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#c9b8ff', 0.6);
    rim.position.set(-10, 6, -12);
    this.scene.add(rim);
  }

  // ------------------------------------------------------------ øen
  buildIsland() {
    const grass = new THREE.MeshStandardMaterial({ color: '#a9dc98', roughness: 0.95 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R.island, R.island - 0.6, 1.0, 128), grass);
    top.position.y = -0.5;
    top.receiveShadow = true;
    this.scene.add(top);
    const dirt = new THREE.MeshStandardMaterial({ color: '#c9a58a', roughness: 1, flatShading: true });
    const under = new THREE.Mesh(new THREE.ConeGeometry(R.island - 0.6, 9, 24, 3), dirt);
    under.rotation.x = Math.PI;
    under.position.y = -5.5;
    this.scene.add(under);
    // lidt kanter af sten
    const rng = mulberry32(7);
    const rock = new THREE.MeshStandardMaterial({ color: '#b89a86', roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 1.1, 0), rock);
      r.position.copy(polar(R.island - 1.2 - rng() * 1.5, a, -1.6 - rng() * 2.5));
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      this.scene.add(r);
    }
  }

  // ------------------------------------------------------------ hubben
  buildHub() {
    const floorMat = new THREE.MeshPhysicalMaterial({ color: '#e9e1f7', roughness: 0.42, clearcoat: 0.4 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R.hub, R.hub + 0.1, 0.1, 128), floorMat);
    floor.position.y = 0.03;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
    this.edgeMat = glow('#8fd3ff', 2.4);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R.hub, 0.035, 8, 160), this.edgeMat);
    edge.rotation.x = Math.PI / 2; edge.position.y = 0.09;
    this.scene.add(edge);
    const inner = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.06, 96), glow('#c9a7ff', 2.0));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.085;
    this.scene.add(inner);

    const deskMat = new THREE.MeshPhysicalMaterial({ color: '#fdfbff', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#3b3555', roughness: 0.5 });
    const deskGeo = new RoundedBoxGeometry(1.55, 0.09, 0.72, 4, 0.035);
    const kbGeo = new RoundedBoxGeometry(0.62, 0.035, 0.2, 3, 0.012);
    const cushionGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.14, 40);

    for (let i = 0; i < STATION_COUNT; i++) {
      const angle = (i / STATION_COUNT) * Math.PI * 2 + GAP;
      const g = new THREE.Group();
      g.position.copy(polar(R.desk, angle));
      g.rotation.y = angle;

      const desk = new THREE.Mesh(deskGeo, deskMat); desk.position.y = 0.42; g.add(desk);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 20), deskMat); leg.position.y = 0.2; g.add(leg);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 32), deskMat); base.position.y = 0.06; g.add(base);

      const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fd3ff'), toneMapped: false, transparent: true, opacity: 0.5 });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.018, 0.02), trimMat);
      trim.position.set(0, 0.42, -0.365); g.add(trim);

      const kb = new THREE.Mesh(kbGeo, darkMat); kb.position.set(0, 0.485, -0.18); g.add(kb);
      const keyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fd3ff'), toneMapped: false, transparent: true, opacity: 0.25 });
      const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.15), keyMat);
      keys.rotation.x = -Math.PI / 2; keys.position.set(0, 0.505, -0.18); g.add(keys);

      // Projektor + lysstråle
      const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.07, 24), darkMat);
      proj.position.set(0, 0.5, 0.2); g.add(proj);
      const beamMat = new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.1, 1.2, 24, 1, true), beamMat);
      beam.position.set(0, 1.1, 0.27); g.add(beam);
      shadowed(g);
      beam.castShadow = false; keys.castShadow = false; trim.castShadow = false;
      this.scene.add(g);

      // Hologram-skærm (vender altid mod kameraet)
      const screen = new StationScreen();
      const holoMat = new THREE.MeshBasicMaterial({ map: screen.texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, opacity: 0.95 });
      const holo = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.09), holoMat);
      holo.position.copy(polar(R.holo, angle, 2.25));
      holo.renderOrder = 2;
      this.scene.add(holo);

      // Hjemmeplads (pude)
      const cushionMat = new THREE.MeshPhysicalMaterial({ color: '#efe6ff', roughness: 0.8, sheen: 1, sheenColor: '#ffffff' });
      const cushion = new THREE.Mesh(cushionGeo, cushionMat);
      cushion.position.copy(polar(R.home, angle, 0.04));
      cushion.receiveShadow = true; cushion.castShadow = true;
      this.scene.add(cushion);

      this.stations.push({
        index: i, angle, group: g, screen, holo, holoMat, keyMat, beamMat, trimMat, cushionMat,
        workPos: polar(R.work, angle), deskPos: polar(R.desk, angle), homePos: polar(R.home, angle),
        agent: null, activity: 'off', busy: 0,
      });
    }
  }

  pathToStation(i) {
    const a = this.stations[i].angle + GAP;
    return [polar(6.0, a), polar(R.work, a), this.stations[i].workPos.clone()];
  }

  pathToHome(i) {
    const a = this.stations[i].angle + GAP;
    return [polar(R.work, a), polar(6.0, a), this.stations[i].homePos.clone()];
  }

  // ------------------------------------------------------------ kernen
  buildCore() {
    const core = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.4, 48), white);
    ped.position.y = 0.25;
    core.add(shadowed(ped));
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fe6ff').multiplyScalar(2.6), toneMapped: false }));
    top.rotation.x = Math.PI / 2; top.position.y = 0.46;
    core.add(top);

    this.crystalMat = new THREE.MeshPhysicalMaterial({
      color: '#bfe6ff', emissive: '#5aa8ff', emissiveIntensity: 1.2,
      roughness: 0.12, metalness: 0.05, clearcoat: 1, flatShading: true,
    });
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.crystalMat);
    this.crystal.scale.set(1, 1.45, 1);
    this.crystal.position.y = 1.75;
    this.crystal.castShadow = true;
    core.add(this.crystal);

    this.orbitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c9a7ff').multiplyScalar(2.4), toneMapped: false });
    this.orbits = [0, 1].map((k) => {
      const o = new THREE.Mesh(new THREE.TorusGeometry(1.05 + k * 0.25, 0.022, 8, 96), this.orbitMat);
      o.position.y = 1.75;
      core.add(o);
      return o;
    });
    this.coreLight = new THREE.PointLight('#8fc8ff', 6, 9, 1.6);
    this.coreLight.position.y = 1.8;
    core.add(this.coreLight);
    this.scene.add(core);
    this.coreTop = new THREE.Vector3(0, 1.75, 0);
    this.coreEnergy = 0;
  }

  // ------------------------------------------------------------ pynt
  buildDecor() {
    const rng = mulberry32(42);
    const trunk = new THREE.MeshStandardMaterial({ color: '#b98a6a', roughness: 0.9 });
    const leaves = ['#9edb8f', '#b8e8a0', '#ffc4dc', '#ffd9a8', '#a6e3d4'].map((c) =>
      new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.7, sheen: 0.8, sheenColor: '#ffffff' }));
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const placed = [];
    const free = (p, d) => placed.every((q) => q.distanceTo(p) > d);

    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const front = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.55; // undgå at dække kameraet
      if (front) continue;
      const r = 10.8 + rng() * 4.2;
      const p = polar(r, a);
      if (!free(p, 1.8)) continue;
      placed.push(p);
      const t = new THREE.Group();
      t.position.copy(p);
      const h = 0.8 + rng() * 0.9;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 10), trunk);
      tr.position.y = h / 2; t.add(tr);
      const lm = leaves[Math.floor(rng() * leaves.length)];
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const s = 0.75 - k * 0.18 + rng() * 0.15;
        const b = new THREE.Mesh(sphere, lm);
        b.scale.setScalar(s);
        b.position.set((rng() - 0.5) * 0.3, h + 0.35 + k * 0.5, (rng() - 0.5) * 0.3);
        t.add(b);
      }
      t.scale.setScalar(0.9 + rng() * 0.6);
      t.userData.sway = rng() * 10;
      this.scene.add(shadowed(t));
    }

    // Svampe
    const stem = new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.8 });
    const cap = new THREE.MeshPhysicalMaterial({ color: '#ff8f8f', roughness: 0.4, clearcoat: 0.6 });
    const dot = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const p = polar(7 + rng() * 8, a);
      if (!free(p, 1.0) || Math.hypot(p.x, p.z) < 7.2) continue;
      placed.push(p);
      const m = new THREE.Group(); m.position.copy(p);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 12), stem); s.position.y = 0.13; m.add(s);
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap); c.position.y = 0.24; m.add(c);
      for (let k = 0; k < 4; k++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dot);
        const da = k * 1.6 + rng();
        d.position.set(Math.cos(da) * 0.12, 0.38, Math.sin(da) * 0.12); m.add(d);
      }
      m.scale.setScalar(0.7 + rng() * 0.8);
      this.scene.add(shadowed(m));
    }

    // Blomster
    const petal = ['#ffffff', '#ffd6e8', '#fff0a8', '#d9c8ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    const fGeo = new THREE.SphereGeometry(0.06, 10, 8);
    for (let i = 0; i < 120; i++) {
      const a = rng() * Math.PI * 2;
      const r = 6.9 + rng() * 8.6;
      const f = new THREE.Mesh(fGeo, petal[Math.floor(rng() * petal.length)]);
      f.position.copy(polar(r, a, 0.05));
      f.scale.y = 0.6;
      this.scene.add(f);
    }

    // Skyer
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffe9f6', emissiveIntensity: 0.15 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(sphere, cloudMat);
        b.scale.set(1.4 + rng() * 1.6, 0.9 + rng() * 0.8, 1.2 + rng());
        b.position.set(k * 1.5 - n * 0.75, rng() * 0.6, (rng() - 0.5) * 1.2);
        c.add(b);
      }
      const a = rng() * Math.PI * 2;
      c.position.copy(polar(28 + rng() * 22, a, -6 + rng() * 16));
      c.rotation.y = a;
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  buildFireflies() {
    const n = 140;
    const pos = new Float32Array(n * 3);
    this.ffBase = [];
    const rng = mulberry32(99);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 3 + rng() * 13, y = 0.4 + rng() * 4.5;
      this.ffBase.push([a, r, y, rng() * 10]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,180,0.8)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.PointsMaterial({ size: 0.22, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#fff2c0').multiplyScalar(2.2), toneMapped: false });
    this.fireflies = new THREE.Points(geo, mat);
    this.scene.add(this.fireflies);
  }

  // ------------------------------------------------------------ opdatering
  update(dt, t, camera, { working = 0, waiting = 0 } = {}) {
    // Kerne: energi følger antallet af arbejdende agenter
    const target = Math.min(1, working / 3);
    this.coreEnergy += (target - this.coreEnergy) * (1 - Math.exp(-2 * dt));
    const e = this.coreEnergy;
    this.crystal.rotation.y += dt * (0.4 + e * 2.2);
    this.crystal.position.y = 1.75 + Math.sin(t * 1.6) * 0.08;
    this.crystalMat.emissiveIntensity = 0.9 + e * 2.2 + Math.sin(t * 3) * 0.15;
    if (waiting > 0) {
      const p = 0.5 + Math.sin(t * 5) * 0.5;
      this.crystalMat.emissive.setRGB(1, 0.55 + p * 0.2, 0.3);
      this.coreLight.color.setRGB(1, 0.7, 0.45);
    } else {
      this.crystalMat.emissive.set('#5aa8ff');
      this.coreLight.color.set('#8fc8ff');
    }
    this.coreLight.intensity = 4 + e * 10;
    this.orbits[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.4, t * (0.5 + e), 0);
    this.orbits[1].rotation.set(Math.PI / 2 + Math.cos(t * 0.5) * 0.5, -t * (0.4 + e), 0.3);

    // Stationer
    for (const s of this.stations) {
      s.screen.update(dt);
      const yaw = Math.atan2(camera.position.x - s.holo.position.x, camera.position.z - s.holo.position.z);
      s.holo.rotation.y = yaw;
      const on = s.activity !== 'off';
      s.busy += ((on ? 1 : 0) - s.busy) * (1 - Math.exp(-4 * dt));
      s.holo.visible = s.busy > 0.02;
      s.holo.scale.set(0.2 + s.busy * 0.8, 0.05 + s.busy * 0.95, 1);
      s.holoMat.opacity = s.busy * 0.95;
      const typing = s.activity === 'coding' || s.activity === 'terminal';
      s.keyMat.opacity = typing ? 0.45 + Math.abs(Math.sin(t * 18 + s.index)) * 0.5 : 0.18;
      s.beamMat.opacity = s.busy * 0.14 + (on ? Math.sin(t * 4 + s.index) * 0.03 : 0);
    }

    // Ildfluer
    const arr = this.fireflies.geometry.attributes.position.array;
    this.ffBase.forEach(([a, r, y, ph], i) => {
      const aa = a + Math.sin(t * 0.1 + ph) * 0.3;
      arr[i * 3] = Math.sin(aa) * r + Math.sin(t * 0.7 + ph) * 0.4;
      arr[i * 3 + 1] = y + Math.sin(t * 0.9 + ph * 2) * 0.35;
      arr[i * 3 + 2] = Math.cos(aa) * r + Math.cos(t * 0.6 + ph) * 0.4;
    });
    this.fireflies.geometry.attributes.position.needsUpdate = true;
    this.clouds.rotation.y += dt * 0.006;
  }

  setStationAgent(i, agent, activity) {
    const s = this.stations[i];
    if (!s) return;
    s.agent = agent;
    s.activity = activity;
    s.screen.set(agent, activity);
    const c = new THREE.Color(agent?.color || '#8fd3ff');
    s.trimMat.color.copy(c).multiplyScalar(2.4);
    s.trimMat.opacity = agent ? 0.95 : 0.35;
    s.keyMat.color.copy(c).multiplyScalar(1.4);
    s.beamMat.color.copy(c);
  }

  setHomeColor(i, color) {
    const s = this.stations[i];
    if (!s) return;
    s.cushionMat.color.set(color ? new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45) : '#efe6ff');
  }
}
