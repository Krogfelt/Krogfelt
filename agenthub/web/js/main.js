// Agent Hub – opstart af 3D-scene, rendering-pipeline og sammenkobling.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World } from './world.js';
import { AgentManager } from './agents.js';
import { UI } from './ui.js';
import { Connection, api } from './net.js';
import { SimConnection } from './sim.js';

const container = document.getElementById('app');
const params = new URLSearchParams(location.search);
const quality = params.get('quality') || 'high';
// Preview: ingen backend – agenterne simuleres i browseren (fx delt side på claude.ai)
const preview = !!window.AGENTHUB_PREVIEW || params.has('preview');
const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : mobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
// Smalle/høje skærme (mobil på højkant) skal have kameraet længere væk for at se hele hubben
const homeCam = () => (camera.aspect < 0.8 ? new THREE.Vector3(0, 17, 30) : camera.aspect < 1.2 ? new THREE.Vector3(0, 13, 24) : new THREE.Vector3(0, 10.5, 19));
let HOME_CAM = homeCam();
const HOME_TARGET = new THREE.Vector3(0, 0.9, 0);
camera.position.copy(HOME_CAM);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 34;
controls.maxPolarAngle = 1.38;
controls.enablePan = true;
controls.autoRotateSpeed = 0.35;

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : mobile ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.5, 1.35);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------- verden + agenter
const world = new World(scene, { shadowSize: mobile ? 1024 : 2048 });
const ui = new UI({ onSelect: (id) => select(id), onDemo: (on) => toggleDemo(on) });
const agents = new AgentManager(scene, world, { onSelect: (id) => select(id) });

// ---------------------------------------------------------------- kamera-fokus
let focus = null; // { id } eller null
const camGoal = { pos: null, target: null };
let lastInteraction = performance.now();

function select(id) {
  if (id && focus?.id === id) id = null; // klik igen = slip
  focus = id ? { id } : null;
  agents.select(id);
  ui.select(id);
  if (!id) { camGoal.pos = HOME_CAM.clone(); camGoal.target = HOME_TARGET.clone(); }
}

controls.addEventListener('start', () => {
  lastInteraction = performance.now();
  controls.autoRotate = false;
  camGoal.pos = null; // brugeren tager over
});

window.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

// Klik på væsner
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
labelRenderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
labelRenderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(agents.pickables(), true)[0];
  if (hit?.object.userData.agentId) select(hit.object.userData.agentId);
});
labelRenderer.domElement.addEventListener('dblclick', () => select(null));

// ---------------------------------------------------------------- netværk
async function toggleDemo(on) {
  if (preview) {
    on ? conn.start() : conn.stop();
    ui.setDemo(on);
    return;
  }
  const r = await api(on ? '/api/demo/start' : '/api/demo/stop');
  ui.setDemo(!!r.demo);
}

const Conn = preview ? SimConnection : Connection;
const conn = new Conn({
  onStatus: (ok) => ui.setConnected(ok),
  onMessage: (msg) => {
    switch (msg.type) {
      case 'snapshot': agents.sync(msg.agents); ui.snapshot(msg); break;
      case 'agent': agents.upsert(msg.agent); ui.agent(msg.agent); break;
      case 'remove': agents.remove(msg.id); ui.remove(msg.id); if (focus?.id === msg.id) select(null); break;
      case 'log': ui.addLog(msg.entry); break;
    }
  },
});

// ---------------------------------------------------------------- løkke
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const stats = agents.update(dt, t, camera);
  world.update(dt, t, camera, stats);

  // Kameraføring
  if (focus) {
    const p = agents.positionOf(focus.id);
    if (p) {
      const r0 = Math.hypot(p.x, p.z) || 1;
      // Sigt mellem væsnet og dets hologram, når det er ved stationen
      const target = r0 < 6 ? tmp.set(p.x * 1.12, 1.45, p.z * 1.12) : tmp.set(p.x, 0.9, p.z);
      controls.target.lerp(target, 1 - Math.exp(-4 * dt));
      // Ved stationen: kamera udefra (agenten vender udad), drejet lidt så skærmen ses.
      // Hjemme på puden: kamera inde fra hubben, så træerne ikke kommer i vejen.
      const r = Math.hypot(p.x, p.z);
      const outward = r < 6;
      const a = Math.atan2(p.x, p.z) + (outward ? 0.3 : Math.PI + 0.35);
      const d = outward ? 7 : 5.2;
      const want = new THREE.Vector3(p.x + Math.sin(a) * d, outward ? 3.4 : 2.4, p.z + Math.cos(a) * d);
      camera.position.lerp(want, 1 - Math.exp(-2.5 * dt));
    }
  } else if (camGoal.pos) {
    camera.position.lerp(camGoal.pos, 1 - Math.exp(-2.5 * dt));
    controls.target.lerp(camGoal.target, 1 - Math.exp(-3 * dt));
    if (camera.position.distanceTo(camGoal.pos) < 0.05) camGoal.pos = null;
  }
  if (!focus && performance.now() - lastInteraction > 45000) controls.autoRotate = true;

  controls.update(dt);
  composer.render(dt);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  HOME_CAM = homeCam();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  labelRenderer.setSize(w, h);
});

window.__agenthub = { scene, camera, agents, world, select }; // til fejlsøgning
