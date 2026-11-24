// Procedurelle, nuttede væsner. Ingen eksterne modeller – alt bygges i kode,
// så hvert væsen kan farves og varieres frit (6 originale arter).
import * as THREE from 'three';

const geo = {
  body: new THREE.SphereGeometry(0.5, 48, 32),
  sphere: new THREE.SphereGeometry(1, 32, 20),
  smallSphere: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 24),
  circle: new THREE.CircleGeometry(1, 24),
  mouth: new THREE.TorusGeometry(0.05, 0.014, 8, 20, Math.PI),
  ring: new THREE.RingGeometry(0.55, 0.68, 48),
  capsule: new THREE.CapsuleGeometry(0.07, 0.36, 8, 16),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
};

const darkMat = new THREE.MeshPhysicalMaterial({ color: '#2b1d2e', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const cheekMat = new THREE.MeshBasicMaterial({ color: '#ff7fa8', transparent: true, opacity: 0.55, depthWrite: false });
const mouthMat = new THREE.MeshStandardMaterial({ color: '#4a2733', roughness: 0.6 });
const pinkMat = new THREE.MeshStandardMaterial({ color: '#ffb3c8', roughness: 0.7 });
const leafMat = new THREE.MeshPhysicalMaterial({ color: '#7ccf6a', roughness: 0.5, sheen: 0.6, sheenColor: '#d8ffcf' });

function plush(color, opts = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.62,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.65),
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
    ...opts,
  });
}

function mesh(g, m, { pos, scale, rot } = {}) {
  const o = new THREE.Mesh(g, m);
  if (pos) o.position.set(...pos);
  if (scale) (typeof scale === 'number') ? o.scale.setScalar(scale) : o.scale.set(...scale);
  if (rot) o.rotation.set(...rot);
  o.castShadow = true;
  return o;
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function dampAngle(a, b, k, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

export class Creature {
  constructor({ id, color, species }) {
    this.id = id;
    this.species = species;
    this.color = new THREE.Color(color);
    this.phase = Math.random() * 10;

    this.root = new THREE.Group();     // position + retning
    this.bob = new THREE.Group();      // hop / squash
    this.root.add(this.bob);

    this.path = [];
    this.speed = 2.3;
    this.walking = false;
    this.yaw = 0;
    this.targetYaw = 0;
    this.faceCamera = true;
    this.anim = 'idle';
    this.blinkT = 2 + Math.random() * 3;
    this.blinkAmt = 0;
    this.spawnT = 0;                   // pop-in animation
    this.removing = false;
    this.removeT = 0;
    this.celebrateT = 0;
    this.pose = { lean: 0, tilt: 0, armL: 0, armR: 0, armLz: 0, armRz: 0, squash: 1, lift: 0 };

    this.build();
    this.root.scale.setScalar(0.001);
    this.root.traverse((o) => { o.userData.agentId = id; });
  }

  build() {
    const bodyMat = plush(this.color);
    this.bodyMat = bodyMat;
    const light = this.color.clone().lerp(new THREE.Color('#ffffff'), 0.55);
    const dark = this.color.clone().multiplyScalar(0.72);
    const bellyMat = plush(light);
    const footMat = plush(dark);

    const b = this.bob;
    this.body = mesh(geo.body, bodyMat, { pos: [0, 0.5, 0], scale: [1, 0.92, 0.95] });
    b.add(this.body);
    b.add(mesh(geo.sphere, bellyMat, { pos: [0, 0.38, 0.2], scale: [0.3, 0.27, 0.27] }));

    // Øjne
    this.eyes = new THREE.Group();
    this.eyes.position.set(0, 0.62, 0);
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.17 * s, 0, 0.415);
      eye.add(mesh(geo.sphere, darkMat, { scale: [0.085, 0.105, 0.06] }));
      eye.add(mesh(geo.smallSphere, shineMat, { pos: [0.028, 0.035, 0.05], scale: 0.026 }));
      eye.add(mesh(geo.smallSphere, shineMat, { pos: [-0.02, -0.035, 0.05], scale: 0.012 }));
      this.eyes.add(eye);
    }
    b.add(this.eyes);

    // Kinder + mund
    for (const s of [-1, 1]) {
      const ch = mesh(geo.circle, cheekMat, { pos: [0.3 * s, 0.52, 0.375], scale: 0.065, rot: [0, 0.68 * s, 0] });
      ch.castShadow = false;
      b.add(ch);
    }
    this.mouth = mesh(geo.mouth, mouthMat, { pos: [0, 0.515, 0.468], rot: [0, 0, Math.PI] });
    b.add(this.mouth);
    this.mouthOpen = mesh(geo.sphere, mouthMat, { pos: [0, 0.5, 0.455], scale: [0.055, 0.045, 0.03] });
    this.mouthOpen.visible = false;
    b.add(this.mouthOpen);

    // Fødder
    this.feet = [-1, 1].map((s) => {
      const f = mesh(geo.sphere, footMat, { pos: [0.19 * s, 0.06, 0.1], scale: [0.13, 0.07, 0.17] });
      b.add(f);
      return f;
    });

    // Arme (pivot ved skulderen)
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.41 * s, 0.52, 0.04);
      pivot.add(mesh(geo.sphere, bodyMat, { pos: [0.06 * s, -0.12, 0], scale: [0.08, 0.12, 0.08] }));
      b.add(pivot);
      return pivot;
    });

    this.buildSpecies(bodyMat, light, dark);
    this.buildProps();

    // Statusring ved fødderne
    this.ringMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geo.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    // Mini-hjælpere (subagenter) der kredser om væsnet
    this.helperGroup = new THREE.Group();
    this.root.add(this.helperGroup);
    this.helpers = [];
  }

  buildSpecies(bodyMat, light, dark) {
    const b = this.bob;
    const add = (o) => { b.add(o); return o; };
    this.wiggle = [];
    switch (this.species) {
      case 'mochi': // katteører
        for (const s of [-1, 1]) {
          const ear = new THREE.Group();
          ear.position.set(0.25 * s, 0.86, -0.02);
          ear.rotation.z = -0.38 * s;
          ear.add(mesh(geo.cone, bodyMat, { scale: [0.13, 0.26, 0.1] }));
          ear.add(mesh(geo.cone, pinkMat, { pos: [0, -0.02, 0.04], scale: [0.075, 0.17, 0.05] }));
          add(ear); this.wiggle.push(ear);
        }
        break;
      case 'pip': // lange kaninører
        for (const s of [-1, 1]) {
          const ear = new THREE.Group();
          ear.position.set(0.15 * s, 0.9, -0.03);
          ear.rotation.z = -0.16 * s;
          ear.add(mesh(geo.capsule, bodyMat, { pos: [0, 0.22, 0], scale: [1, 1, 0.7] }));
          ear.add(mesh(geo.capsule, pinkMat, { pos: [0, 0.22, 0.03], scale: [0.55, 0.85, 0.4] }));
          add(ear); this.wiggle.push(ear);
        }
        break;
      case 'sprout': { // spire med to blade
        const stem = new THREE.Group();
        stem.position.set(0, 0.94, 0);
        stem.add(mesh(geo.cyl, leafMat, { pos: [0, 0.08, 0], scale: [0.022, 0.16, 0.022] }));
        for (const s of [-1, 1]) {
          stem.add(mesh(geo.sphere, leafMat, { pos: [0.1 * s, 0.17, 0], scale: [0.12, 0.035, 0.065], rot: [0, 0, 0.45 * s] }));
        }
        add(stem); this.wiggle.push(stem);
        break;
      }
      case 'zap': { // antenner med lysende kugler
        const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3a0').multiplyScalar(2.2), toneMapped: false });
        this.glowMat = glow;
        for (const s of [-1, 1]) {
          const ant = new THREE.Group();
          ant.position.set(0.16 * s, 0.9, 0);
          ant.rotation.z = -0.35 * s;
          ant.add(mesh(geo.cyl, darkMat, { pos: [0, 0.12, 0], scale: [0.014, 0.24, 0.014] }));
          ant.add(mesh(geo.smallSphere, glow, { pos: [0, 0.26, 0], scale: 0.055 }));
          add(ant); this.wiggle.push(ant);
        }
        break;
      }
      case 'puff': { // fluffy top-tot
        const tuft = new THREE.Group();
        tuft.position.set(0, 0.92, 0);
        const tm = plush(light);
        [[0, 0.04, 0, 0.12], [-0.11, 0, 0.02, 0.09], [0.11, 0, 0.02, 0.09], [0, 0.0, -0.1, 0.09]].forEach(([x, y, z, r]) => {
          tuft.add(mesh(geo.sphere, tm, { pos: [x, y, z], scale: r }));
        });
        add(tuft); this.wiggle.push(tuft);
        break;
      }
      case 'bub': { // lille dino: rygpigge og hale
        const spikeMat = plush(light);
        [[0.92, -0.08, 0.09], [0.78, -0.34, 0.075], [0.55, -0.47, 0.06]].forEach(([y, z, r]) => {
          add(mesh(geo.cone, spikeMat, { pos: [0, y, z], scale: [r, r * 1.6, r], rot: [-0.5 + z, 0, 0] }));
        });
        const tail = new THREE.Group();
        tail.position.set(0, 0.25, -0.42);
        tail.add(mesh(geo.cone, bodyMat, { pos: [0, 0, -0.12], scale: [0.13, 0.3, 0.13], rot: [-Math.PI / 2 - 0.4, 0, 0] }));
        add(tail); this.wiggle.push(tail);
        break;
      }
    }
  }

  buildProps() {
    const b = this.bob;
    // Bog (læser)
    this.book = new THREE.Group();
    const cover = new THREE.MeshStandardMaterial({ color: this.color.clone().multiplyScalar(0.6), roughness: 0.6 });
    const pages = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.9 });
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      half.rotation.y = 0.35 * s;
      half.add(mesh(new THREE.BoxGeometry(0.2, 0.26, 0.015), cover, { pos: [0.1 * s, 0, 0] }));
      half.add(mesh(new THREE.BoxGeometry(0.18, 0.24, 0.02), pages, { pos: [0.095 * s, 0, 0.012] }));
      this.book.add(half);
    }
    this.book.position.set(0, 0.42, 0.55);
    this.book.rotation.x = -0.5;
    this.book.visible = false;
    b.add(this.book);

    // Lup (leder/søger)
    this.lens = new THREE.Group();
    const rim = new THREE.MeshPhysicalMaterial({ color: '#ffcf5a', metalness: 0.6, roughness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cdeeff', transmission: 0.6, transparent: true, opacity: 0.5, roughness: 0.05 });
    this.lens.add(mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 28), rim));
    this.lens.add(mesh(new THREE.CircleGeometry(0.1, 24), glass));
    this.lens.add(mesh(geo.cyl, rim, { pos: [0, -0.17, 0], scale: [0.016, 0.14, 0.016] }));
    this.lens.visible = false;
    this.arms[1].add(this.lens);
    this.lens.position.set(0.05, -0.28, 0.08);

    // Clipboard (planlægger)
    this.clip = new THREE.Group();
    this.clip.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: '#c8925a', roughness: 0.8 })));
    this.clip.add(mesh(new THREE.BoxGeometry(0.2, 0.24, 0.01), pages, { pos: [0, -0.01, 0.015] }));
    this.clip.position.set(-0.05, 0.4, 0.52);
    this.clip.rotation.set(-0.4, 0.3, 0);
    this.clip.visible = false;
    b.add(this.clip);
  }

  // -------------------------------------------------------------- styring
  setHelpers(n) {
    n = Math.min(n, 4);
    while (this.helpers.length < n) {
      const h = new THREE.Group();
      const m = plush(this.color.clone().lerp(new THREE.Color('#ffffff'), 0.3));
      h.add(mesh(geo.sphere, m, { scale: [0.13, 0.12, 0.13] }));
      for (const s of [-1, 1]) h.add(mesh(geo.sphere, darkMat, { pos: [0.045 * s, 0.02, 0.11], scale: [0.022, 0.028, 0.015] }));
      h.scale.setScalar(0.001);
      this.helperGroup.add(h);
      this.helpers.push(h);
    }
    while (this.helpers.length > n) {
      const h = this.helpers.pop();
      this.helperGroup.remove(h);
    }
  }

  walkTo(points) {
    this.path = points.map((p) => p.clone());
  }

  get position() { return this.root.position; }

  // -------------------------------------------------------------- animation
  update(dt, t, camera) {
    const p = this.pose;
    const tt = t + this.phase;

    // Pop-in / pop-out
    if (this.removing) {
      this.removeT += dt;
      const s = Math.max(0.001, 1 - this.removeT * 2.2);
      this.root.scale.setScalar(s);
      this.root.position.y += dt * 1.5;
    } else if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 1.6);
      const x = this.spawnT;
      const elastic = x === 1 ? 1 : 1 - Math.pow(2, -9 * x) * Math.cos(x * 9.5);
      this.root.scale.setScalar(Math.max(0.001, elastic));
    }

    // Bevægelse langs sti
    this.walking = false;
    if (this.path.length) {
      const target = this.path[0];
      const d = new THREE.Vector3(target.x - this.root.position.x, 0, target.z - this.root.position.z);
      const dist = d.length();
      const step = this.speed * dt;
      if (dist <= step) {
        this.root.position.x = target.x; this.root.position.z = target.z;
        this.path.shift();
      } else {
        d.multiplyScalar(step / dist);
        this.root.position.x += d.x; this.root.position.z += d.z;
        this.targetYaw = Math.atan2(d.x, d.z);
      }
      this.walking = true;
    } else if (this.faceCamera && camera) {
      this.targetYaw = Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z);
    } else if (this.faceTarget) {
      this.targetYaw = Math.atan2(this.faceTarget.x - this.root.position.x, this.faceTarget.z - this.root.position.z);
    }
    // Hub-platformen er en smule hævet
    const r = Math.hypot(this.root.position.x, this.root.position.z);
    const floorY = 0.08 * THREE.MathUtils.smoothstep(6.6 - r, 0, 0.4);
    if (!this.removing) this.root.position.y = floorY;

    this.yaw = dampAngle(this.yaw, this.targetYaw, this.walking ? 10 : 5, dt);
    this.root.rotation.y = this.yaw;

    // Mål-positur ud fra animation
    const anim = this.walking ? 'walk' : this.anim;
    let lean = 0, tilt = 0, armL = 0, armR = 0, armLz = 0, armRz = 0, squash = 1, lift = 0;
    let eyesClosed = false, mouthOpen = false;
    this.book.visible = anim === 'reading';
    this.lens.visible = anim === 'exploring' || anim === 'browsing';
    this.clip.visible = anim === 'planning';

    switch (anim) {
      case 'walk': {
        const h = Math.abs(Math.sin(tt * 9));
        lift = h * 0.14;
        squash = 1 + (h < 0.15 ? -0.08 : 0.04);
        armL = Math.sin(tt * 9) * 0.6; armR = -armL;
        armLz = 0.2; armRz = 0.2;
        break;
      }
      case 'coding': case 'terminal': case 'tool': {
        lean = 0.14;
        armL = -1.25 + Math.sin(tt * 22) * 0.18;
        armR = -1.25 + Math.sin(tt * 22 + 1.7) * 0.18;
        lift = Math.abs(Math.sin(tt * 11)) * 0.012;
        tilt = Math.sin(tt * 1.3) * 0.05;
        break;
      }
      case 'reading': {
        lean = 0.1; armL = -1.1; armR = -1.1; armLz = -0.35; armRz = -0.35;
        tilt = Math.sin(tt * 0.8) * 0.08;
        break;
      }
      case 'exploring': case 'browsing': {
        armR = -1.3 + Math.sin(tt * 2.2) * 0.25; armRz = Math.cos(tt * 2.2) * 0.25;
        lean = 0.05; tilt = Math.sin(tt * 1.1) * 0.12;
        lift = Math.abs(Math.sin(tt * 3)) * 0.02;
        break;
      }
      case 'planning': {
        armL = -1.15; armLz = -0.3;
        armR = -1.0 + Math.sin(tt * 14) * 0.12; armRz = -0.25;
        lean = 0.08;
        break;
      }
      case 'delegating': {
        armL = -0.6 + Math.sin(tt * 3) * 0.5; armR = -0.6 + Math.sin(tt * 3 + Math.PI) * 0.5;
        armLz = 0.6; armRz = 0.6;
        lift = Math.abs(Math.sin(tt * 3)) * 0.04;
        break;
      }
      case 'thinking': {
        tilt = Math.sin(tt * 1.2) * 0.14;
        armR = -1.9; armRz = -0.5;   // "hånd under hagen"
        squash = 1 + Math.sin(tt * 2) * 0.015;
        break;
      }
      case 'waiting': {
        const cyc = (tt % 1.3) / 1.3;
        lift = cyc < 0.35 ? Math.sin((cyc / 0.35) * Math.PI) * 0.28 : 0;
        squash = cyc > 0.35 && cyc < 0.45 ? 0.9 : 1;
        armRz = 2.4 + Math.sin(tt * 12) * 0.45;   // vinker
        armLz = 0.3;
        mouthOpen = true;
        break;
      }
      case 'done': {
        this.celebrateT += dt;
        const c = this.celebrateT;
        lift = c < 0.7 ? Math.sin((c / 0.7) * Math.PI) * 0.55 : Math.abs(Math.sin(c * 6)) * 0.05;
        armLz = 2.5; armRz = 2.5;
        mouthOpen = true;
        if (c < 0.7) this.root.rotation.y = this.yaw + (c / 0.7) * Math.PI * 2;
        break;
      }
      case 'sleeping': {
        eyesClosed = true;
        squash = 0.93 + Math.sin(tt * 1.1) * 0.025;
        tilt = 0.18; armLz = 0.15; armRz = 0.15;
        break;
      }
      default: { // idle
        squash = 1 + Math.sin(tt * 2.2) * 0.022;
        tilt = Math.sin(tt * 0.7) * 0.05;
        armLz = 0.18 + Math.sin(tt * 2.2) * 0.05; armRz = armLz;
        const hop = tt % 7;
        if (hop < 0.45) lift = Math.sin((hop / 0.45) * Math.PI) * 0.18;
      }
    }
    if (anim !== 'done') this.celebrateT = 0;

    const k = 12;
    p.lean = damp(p.lean, lean, k, dt);
    p.tilt = damp(p.tilt, tilt, k, dt);
    p.armL = damp(p.armL, armL, k, dt);
    p.armR = damp(p.armR, armR, k, dt);
    p.armLz = damp(p.armLz, armLz, k, dt);
    p.armRz = damp(p.armRz, armRz, k, dt);
    p.squash = damp(p.squash, squash, 18, dt);
    p.lift = damp(p.lift, lift, 25, dt);

    this.bob.position.y = p.lift;
    this.bob.rotation.x = p.lean;
    this.bob.rotation.z = p.tilt;
    this.bob.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
    this.arms[0].rotation.set(p.armL, 0, -p.armLz);  // armLz/armRz = "udad"
    this.arms[1].rotation.set(p.armR, 0, p.armRz);

    // Fødder
    if (this.walking) {
      this.feet[0].position.z = 0.1 + Math.sin(tt * 9) * 0.07;
      this.feet[1].position.z = 0.1 - Math.sin(tt * 9) * 0.07;
    } else {
      this.feet[0].position.z = this.feet[1].position.z = 0.1;
    }

    // Blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkAmt = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blinkAmt = Math.max(0, this.blinkAmt - dt * 8);
    const eyeY = eyesClosed ? 0.12 : 1 - Math.sin(this.blinkAmt * Math.PI) * 0.9;
    this.eyes.scale.y = damp(this.eyes.scale.y, eyeY, 30, dt);
    this.eyes.position.y = 0.62 + (anim === 'reading' ? -0.03 : anim === 'thinking' ? 0.02 : 0);
    this.mouth.visible = !mouthOpen;
    this.mouthOpen.visible = mouthOpen;

    // Ører/antenner vipper
    this.wiggle.forEach((w, i) => {
      w.rotation.x = Math.sin(tt * 3 + i) * (this.walking ? 0.15 : 0.05);
    });
    if (this.glowMat) {
      const g = 1.6 + Math.sin(tt * 4) * 0.6 + (anim === 'coding' || anim === 'terminal' ? 1.2 : 0);
      this.glowMat.color.setRGB(1 * g, 0.95 * g, 0.6 * g);
    }

    // Statusring
    let ringOpacity = 0, ringColor = this.color;
    if (anim === 'waiting') {
      ringOpacity = 0.55 + Math.sin(tt * 8) * 0.35;
      ringColor = this.waitingKind === 'permission' ? RED : AMBER;
      this.ring.scale.setScalar(1 + Math.sin(tt * 8) * 0.08);
    } else if (!this.walking && anim !== 'idle' && anim !== 'sleeping' && anim !== 'done') {
      ringOpacity = 0.35 + Math.sin(tt * 3) * 0.12;
      this.ring.scale.setScalar(1);
    }
    this.ringMat.opacity = damp(this.ringMat.opacity, ringOpacity, 10, dt);
    this.ringMat.color.copy(ringColor);

    // Hjælpere kredser
    this.helpers.forEach((h, i) => {
      const a = tt * 1.6 + (i / this.helpers.length) * Math.PI * 2;
      h.position.set(Math.cos(a) * 0.8, 0.9 + Math.sin(tt * 4 + i) * 0.12, Math.sin(a) * 0.8);
      h.rotation.y = -a;
      const s = Math.min(1, h.scale.x + dt * 3);
      h.scale.setScalar(s);
    });
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material && !SHARED.has(o.material)) o.material.dispose?.();
    });
  }
}

const RED = new THREE.Color('#ff4d6d');
const AMBER = new THREE.Color('#ffb020');
const SHARED = new Set([darkMat, shineMat, cheekMat, mouthMat, pinkMat, leafMat]);
