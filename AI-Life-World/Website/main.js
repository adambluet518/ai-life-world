import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============================================================
// AI LIFE WORLD — Phase 1 Prototype
// Low-poly 3D world + spherical creature + first-person player
// ============================================================

const CONFIG = {
  apiUrl: 'http://localhost:1234/v1',
  modelName: 'local-model',
  decisionInterval: 10,
  worldSize: 120,
  creatureSpeed: 2.2,
  playerSpeed: 8,
  playerJump: 7,
  gravity: 22
};

// ------------------------------------------------------------
// State
// ------------------------------------------------------------
const state = {
  clock: new THREE.Clock(),
  fps: 0,
  frameCount: 0,
  lastFpsTime: 0,
  startTime: Date.now(),
  creature: {
    name: 'Orb',
    ageMinutes: 0,
    energy: 100,
    goal: 'Explore the world',
    activity: 'Idle',
    position: new THREE.Vector3(0, 1.2, 0),
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1),
    wanderTimer: 0,
    wanderTarget: null
  },
  player: {
    velocity: new THREE.Vector3(),
    onGround: false
  },
  keys: {},
  activityLog: [],
  memories: []
};

// ------------------------------------------------------------
// DOM helpers
// ------------------------------------------------------------
function $(id) { return document.getElementById(id); }

function logActivity(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  state.activityLog.unshift(entry);
  if (state.activityLog.length > 40) state.activityLog.pop();
  const box = $('activity-log');
  if (box) {
    box.innerHTML = state.activityLog.map(e => `<div class="log-entry">${e}</div>`).join('');
  }
}

function addMemory(msg) {
  state.memories.unshift(msg);
  if (state.memories.length > 30) state.memories.pop();
  const box = $('memory-log');
  if (box) {
    box.innerHTML = state.memories.map(e => `<div class="log-entry">${e}</div>`).join('');
  }
}

// ------------------------------------------------------------
// Three.js setup
// ------------------------------------------------------------
const canvas = $('world-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e0);
scene.fog = new THREE.Fog(0x87b8e0, 40, 110);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.2, 8);

// Lighting
const ambient = new THREE.AmbientLight(0xb0c4de, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.15);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x88bbff, 0x446633, 0.35);
scene.add(hemi);

// ------------------------------------------------------------
// Terrain
// ------------------------------------------------------------
function createTerrain() {
  const size = CONFIG.worldSize;
  const segments = 48;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h =
      Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.8 +
      Math.sin(x * 0.15 + 1.2) * 0.7 +
      Math.cos(z * 0.12) * 0.5;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a8c3f,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

const terrain = createTerrain();

// Simple height sampling (approximate from noise function)
function getTerrainHeight(x, z) {
  return (
    Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.8 +
    Math.sin(x * 0.15 + 1.2) * 0.7 +
    Math.cos(z * 0.12) * 0.5
  );
}

// ------------------------------------------------------------
// Environment objects
// ------------------------------------------------------------
function createTree(x, z) {
  const group = new THREE.Group();
  const h = getTerrainHeight(x, z);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a22, flatShading: true, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);

  // Foliage (low-poly cone stack)
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, flatShading: true, roughness: 0.85 });
  const sizes = [1.6, 1.3, 1.0];
  const heights = [1.8, 1.5, 1.2];
  let y = 2.0;
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(sizes[i], heights[i], 7),
      foliageMat
    );
    cone.position.y = y + heights[i] * 0.35;
    cone.castShadow = true;
    group.add(cone);
    y += heights[i] * 0.55;
  }

  group.position.set(x, h, z);
  group.name = 'tree';
  scene.add(group);
  return group;
}

function createRock(x, z, scale = 1) {
  const h = getTerrainHeight(x, z);
  const geo = new THREE.DodecahedronGeometry(0.7 * scale, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a6a6a,
    flatShading: true,
    roughness: 0.95
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, h + 0.35 * scale, z);
  rock.rotation.set(Math.random() * 1, Math.random() * 2, Math.random() * 1);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.name = 'rock';
  scene.add(rock);
  return rock;
}

function createPond(cx, cz, radius = 6) {
  const h = getTerrainHeight(cx, cz) - 0.15;
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a8ab8,
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85
  });
  const pond = new THREE.Mesh(geo, mat);
  pond.position.set(cx, h, cz);
  pond.receiveShadow = true;
  pond.name = 'pond';
  scene.add(pond);

  // Simple shore ring
  const ringGeo = new THREE.RingGeometry(radius - 0.15, radius + 0.9, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a5a,
    roughness: 0.95,
    flatShading: true
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(cx, h + 0.02, cz);
  scene.add(ring);

  return pond;
}

function createGrassPatch(x, z) {
  const h = getTerrainHeight(x, z);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d8a35, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.45 + Math.random() * 0.25, 4),
      mat
    );
    blade.position.set(
      (Math.random() - 0.5) * 0.8,
      0.2,
      (Math.random() - 0.5) * 0.8
    );
    blade.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(blade);
  }
  group.position.set(x, h, z);
  scene.add(group);
  return group;
}

// Populate world
function populateWorld() {
  // Trees
  const treePositions = [
    [-18, -12], [-22, 8], [-8, 22], [12, 18], [25, 5],
    [18, -20], [5, -25], [-15, -28], [30, -12], [-28, 15],
    [8, 8], [-5, -8], [22, 22], [-25, -5], [15, -8]
  ];
  treePositions.forEach(([x, z]) => createTree(x, z));

  // Rocks
  const rockPositions = [
    [6, 4, 1], [-10, 6, 0.8], [14, -6, 1.2], [-4, -14, 0.7],
    [20, 12, 0.9], [-18, 20, 1.1], [3, 25, 0.6], [-22, -18, 1.0]
  ];
  rockPositions.forEach(([x, z, s]) => createRock(x, z, s));

  // Pond
  createPond(-8, 10, 5.5);
  createPond(18, -14, 4);

  // Grass patches
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 80;
    const z = (Math.random() - 0.5) * 80;
    createGrassPatch(x, z);
  }
}

populateWorld();

// ------------------------------------------------------------
// Creature (sphere with eyes)
// ------------------------------------------------------------
function createCreature() {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.9, 16, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x5ec8e0,
    roughness: 0.35,
    metalness: 0.15,
    flatShading: false
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.name = 'body';
  group.add(body);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.18, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
  const pupilGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.32, 0.25, 0.72);
  group.add(leftEye);
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(-0.32, 0.25, 0.88);
  group.add(leftPupil);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.32, 0.25, 0.72);
  group.add(rightEye);
  const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
  rightPupil.position.set(0.32, 0.25, 0.88);
  group.add(rightPupil);

  // Soft glow
  const glow = new THREE.PointLight(0x5ec8e0, 0.6, 6);
  glow.position.set(0, 0.3, 0);
  group.add(glow);

  group.position.copy(state.creature.position);
  group.name = 'creature';
  scene.add(group);
  return group;
}

const creatureMesh = createCreature();

// ------------------------------------------------------------
// Player controls
// ------------------------------------------------------------
const controls = new PointerLockControls(camera, document.body);

document.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});

controls.addEventListener('lock', () => {
  $('controls-hint').style.opacity = '0.4';
});
controls.addEventListener('unlock', () => {
  $('controls-hint').style.opacity = '1';
});

document.addEventListener('keydown', (e) => {
  state.keys[e.code] = true;
  if (e.code === 'Escape') controls.unlock();
});
document.addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
});

function updatePlayer(dt) {
  const speed = CONFIG.playerSpeed;
  const velocity = state.player.velocity;

  // Horizontal movement relative to camera
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  let moveX = 0;
  let moveZ = 0;
  if (state.keys['KeyW']) moveZ += 1;
  if (state.keys['KeyS']) moveZ -= 1;
  if (state.keys['KeyA']) moveX -= 1;
  if (state.keys['KeyD']) moveX += 1;

  if (moveX !== 0 || moveZ !== 0) {
    const dir = new THREE.Vector3();
    dir.addScaledVector(forward, moveZ);
    dir.addScaledVector(right, moveX);
    dir.normalize();
    velocity.x = dir.x * speed;
    velocity.z = dir.z * speed;
  } else {
    velocity.x *= 0.85;
    velocity.z *= 0.85;
  }

  // Jump
  if (state.keys['Space'] && state.player.onGround) {
    velocity.y = CONFIG.playerJump;
    state.player.onGround = false;
  }

  // Gravity
  velocity.y -= CONFIG.gravity * dt;

  // Apply
  camera.position.x += velocity.x * dt;
  camera.position.y += velocity.y * dt;
  camera.position.z += velocity.z * dt;

  // Ground collision
  const groundY = getTerrainHeight(camera.position.x, camera.position.z) + 1.7;
  if (camera.position.y < groundY) {
    camera.position.y = groundY;
    velocity.y = 0;
    state.player.onGround = true;
  }

  // World bounds
  const half = CONFIG.worldSize * 0.45;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -half, half);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -half, half);
}

// ------------------------------------------------------------
// Creature autonomous movement (simple wander for Phase 1)
// ------------------------------------------------------------
function updateCreature(dt) {
  const c = state.creature;
  c.ageMinutes = (Date.now() - state.startTime) / 60000;

  // Simple wander behavior
  c.wanderTimer -= dt;
  if (c.wanderTimer <= 0 || !c.wanderTarget) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * 12;
    c.wanderTarget = new THREE.Vector3(
      c.position.x + Math.cos(angle) * dist,
      0,
      c.position.z + Math.sin(angle) * dist
    );
    // Keep inside bounds
    const half = CONFIG.worldSize * 0.4;
    c.wanderTarget.x = THREE.MathUtils.clamp(c.wanderTarget.x, -half, half);
    c.wanderTarget.z = THREE.MathUtils.clamp(c.wanderTarget.z, -half, half);
    c.wanderTimer = 4 + Math.random() * 6;
    c.activity = 'Exploring';
    c.goal = 'Wander toward something interesting';
  }

  const toTarget = new THREE.Vector3().subVectors(c.wanderTarget, c.position);
  toTarget.y = 0;
  const dist = toTarget.length();

  if (dist > 0.8) {
    toTarget.normalize();
    c.direction.lerp(toTarget, 0.08);
    c.direction.normalize();
    c.velocity.copy(c.direction).multiplyScalar(CONFIG.creatureSpeed);
    c.activity = 'Moving';
  } else {
    c.velocity.set(0, 0, 0);
    c.activity = 'Looking around';
    c.wanderTimer = Math.min(c.wanderTimer, 1.5);
  }

  // Apply movement
  c.position.x += c.velocity.x * dt;
  c.position.z += c.velocity.z * dt;
  c.position.y = getTerrainHeight(c.position.x, c.position.z) + 1.05;

  // Gentle bob
  const bob = Math.sin(Date.now() * 0.004) * 0.08;
  creatureMesh.position.set(c.position.x, c.position.y + bob, c.position.z);

  // Face movement direction
  if (c.velocity.lengthSq() > 0.01) {
    const lookAt = new THREE.Vector3().copy(creatureMesh.position).add(c.direction);
    creatureMesh.lookAt(lookAt);
  }

  // Energy slowly regenerates / drains a bit while moving
  if (c.activity === 'Moving') {
    c.energy = Math.max(20, c.energy - dt * 1.2);
  } else {
    c.energy = Math.min(100, c.energy + dt * 2.5);
  }
}

// ------------------------------------------------------------
// UI updates
// ------------------------------------------------------------
function updateUI() {
  const c = state.creature;
  $('creature-name').textContent = c.name;
  $('creature-age').textContent = c.ageMinutes < 1
    ? `${Math.floor(c.ageMinutes * 60)}s`
    : `${c.ageMinutes.toFixed(1)} min`;
  $('creature-energy').textContent = Math.round(c.energy);
  $('energy-bar').style.width = `${c.energy}%`;
  $('creature-goal').textContent = c.goal;
  $('creature-activity').textContent = c.activity;
  $('creature-pos').textContent =
    `${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)}`;

  // FPS
  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFpsTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFpsTime = now;
    $('fps-counter').textContent = state.fps;
  }
}

// ------------------------------------------------------------
// Panel toggles
// ------------------------------------------------------------
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById(btn.dataset.panel);
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
  });
});

document.querySelectorAll('.panel-header').forEach(header => {
  header.addEventListener('click', (e) => {
    if (e.target.classList.contains('toggle-btn')) return;
    const btn = header.querySelector('.toggle-btn');
    if (btn) btn.click();
  });
});

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------
$('test-connection-btn').addEventListener('click', async () => {
  const url = $('api-url').value.trim().replace(/\/$/, '');
  const resultEl = $('connection-result');
  resultEl.textContent = 'Testing...';
  resultEl.className = 'connection-result';

  try {
    const res = await fetch(`${url}/models`, { method: 'GET', signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const models = data.data || data.models || [];
      resultEl.textContent = `Connected! Models available: ${models.length || 'unknown'}`;
      resultEl.className = 'connection-result success';
      $('lm-status').textContent = 'Online';
      $('lm-status').className = 'value online';
      logActivity('LM Studio connection successful.');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    resultEl.textContent = `Failed: ${err.message}. Is LM Studio running with server enabled?`;
    resultEl.className = 'connection-result error';
    $('lm-status').textContent = 'Offline';
    $('lm-status').className = 'value offline';
    logActivity('LM Studio connection failed.');
  }
});

$('save-settings-btn').addEventListener('click', () => {
  CONFIG.apiUrl = $('api-url').value.trim();
  CONFIG.modelName = $('model-name').value.trim();
  CONFIG.decisionInterval = parseInt($('decision-interval').value, 10) || 10;
  logActivity('Settings saved locally.');
  try {
    localStorage.setItem('ailifeworld_settings', JSON.stringify({
      apiUrl: CONFIG.apiUrl,
      modelName: CONFIG.modelName,
      decisionInterval: CONFIG.decisionInterval
    }));
  } catch (_) {}
});

// Load settings if present
try {
  const saved = JSON.parse(localStorage.getItem('ailifeworld_settings') || '{}');
  if (saved.apiUrl) {
    CONFIG.apiUrl = saved.apiUrl;
    $('api-url').value = saved.apiUrl;
  }
  if (saved.modelName) {
    CONFIG.modelName = saved.modelName;
    $('model-name').value = saved.modelName;
  }
  if (saved.decisionInterval) {
    CONFIG.decisionInterval = saved.decisionInterval;
    $('decision-interval').value = saved.decisionInterval;
  }
} catch (_) {}

// ------------------------------------------------------------
// Resize
// ------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------
// Main loop
// ------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(state.clock.getDelta(), 0.05);

  if (controls.isLocked) {
    updatePlayer(dt);
  }
  updateCreature(dt);
  updateUI();

  renderer.render(scene, camera);
}

// Initial logs
logActivity('World loaded. Creature "Orb" is awake.');
logActivity('Click the screen to lock mouse and explore.');
addMemory('Woke up in a green world with hills and trees.');
addMemory('Noticed a pond nearby.');

// Start
animate();
console.log('AI Life World — Phase 1 running');
