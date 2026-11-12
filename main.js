import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============================================================
// AI LIFE WORLD — Phase 2
// Real LM Studio decisions + talk + chop / plant / dig / build
// ============================================================

const CONFIG = {
  apiUrl: 'http://localhost:1234/v1',
  modelName: '',
  decisionInterval: 12,
  worldSize: 120,
  creatureSpeed: 2.4,
  playerSpeed: 8,
  playerJump: 7,
  gravity: 22
};

const state = {
  clock: new THREE.Clock(),
  fps: 0,
  frameCount: 0,
  lastFpsTime: 0,
  startTime: Date.now(),
  lmOnline: false,
  nextDecisionAt: 0,
  deciding: false,
  creature: {
    name: 'Orb',
    ageMinutes: 0,
    energy: 100,
    goal: 'Explore and learn about this world',
    activity: 'Idle',
    position: new THREE.Vector3(0, 1.2, 0),
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1),
    inventory: { logs: 0, dirt: 0, seeds: 0 },
    distanceTraveled: 0,
    treesChopped: 0,
    treesPlanted: 0,
    dirtScooped: 0,
    housesBuilt: 0,
    locationsVisited: new Set(),
    lastActionResult: 'Just woke up.'
  },
  player: { velocity: new THREE.Vector3(), onGround: false },
  keys: {},
  activityLog: [],
  memories: [],
  decisionLog: [],
  chatLog: [],
  achievements: {
    first_steps: false,
    explorer: false,
    lumberjack: false,
    builder: false,
    gardener: false,
    digger: false
  },
  worldObjects: {
    trees: [],
    rocks: [],
    ponds: [],
    houses: [],
    dirtPiles: []
  }
};

function $(id) { return document.getElementById(id); }

function logActivity(msg) {
  const time = new Date().toLocaleTimeString();
  state.activityLog.unshift(`[${time}] ${msg}`);
  if (state.activityLog.length > 50) state.activityLog.pop();
  const box = $('activity-log');
  if (box) box.innerHTML = state.activityLog.map(e => `<div class="log-entry">${e}</div>`).join('');
}

function addMemory(msg) {
  state.memories.unshift(msg);
  if (state.memories.length > 40) state.memories.pop();
  const box = $('memory-log');
  if (box) box.innerHTML = state.memories.map(e => `<div class="log-entry">${e}</div>`).join('');
}

function logDecision(msg) {
  state.decisionLog.unshift(msg);
  if (state.decisionLog.length > 20) state.decisionLog.pop();
  const box = $('decision-log');
  if (box) box.innerHTML = state.decisionLog.map(e => `<div class="log-entry">${e}</div>`).join('');
}

function addChat(who, msg) {
  state.chatLog.push({ who, msg });
  if (state.chatLog.length > 30) state.chatLog.shift();
  const box = $('chat-log');
  if (box) {
    box.innerHTML = state.chatLog.map(c => {
      const ccls = c.who === 'player' ? 'player' : c.who === 'creature' ? 'creature' : 'system';
      const p = c.who === 'player' ? 'You: ' : c.who === 'creature' ? 'Orb: ' : '';
      return `<div class="log-entry ${ccls}">${p}${c.msg}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
}

// ------------------------------------------------------------
// Three.js
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
scene.add(new THREE.HemisphereLight(0x88bbff, 0x446633, 0.35));

function getTerrainHeight(x, z) {
  return (
    Math.sin(x * 0.08) * Math.cos(z * 0.07) * 1.8 +
    Math.sin(x * 0.15 + 1.2) * 0.7 +
    Math.cos(z * 0.12) * 0.5
  );
}

function createTerrain() {
  const size = CONFIG.worldSize;
  const segments = 48;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getTerrainHeight(x, z));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a8c3f, roughness: 0.9, metalness: 0.05, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
createTerrain();

// ------------------------------------------------------------
// World objects
// ------------------------------------------------------------
function createTree(x, z, id) {
  const group = new THREE.Group();
  const h = getTerrainHeight(x, z);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c3a22, flatShading: true, roughness: 0.9 })
  );
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, flatShading: true, roughness: 0.85 });
  const sizes = [1.6, 1.3, 1.0];
  const heights = [1.8, 1.5, 1.2];
  let y = 2.0;
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(sizes[i], heights[i], 7), foliageMat);
    cone.position.y = y + heights[i] * 0.35;
    cone.castShadow = true;
    group.add(cone);
    y += heights[i] * 0.55;
  }
  group.position.set(x, h, z);
  group.userData = { type: 'tree', id, chopped: false };
  scene.add(group);
  state.worldObjects.trees.push(group);
  return group;
}

function createRock(x, z, scale = 1) {
  const h = getTerrainHeight(x, z);
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.7 * scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x6a6a6a, flatShading: true, roughness: 0.95 })
  );
  rock.position.set(x, h + 0.35 * scale, z);
  rock.rotation.set(Math.random(), Math.random() * 2, Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.userData = { type: 'rock' };
  scene.add(rock);
  state.worldObjects.rocks.push(rock);
  return rock;
}

function createPond(cx, cz, radius = 5.5) {
  const h = getTerrainHeight(cx, cz) - 0.15;
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a8ab8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 })
  );
  pond.position.set(cx, h, cz);
  pond.receiveShadow = true;
  pond.userData = { type: 'pond' };
  scene.add(pond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.15, radius + 0.9, 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95, flatShading: true })
  );
  ring.position.set(cx, h + 0.02, cz);
  scene.add(ring);
  state.worldObjects.ponds.push(pond);
  return pond;
}

function createHouse(x, z) {
  const group = new THREE.Group();
  const h = getTerrainHeight(x, z);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, flatShading: true, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, flatShading: true, roughness: 0.85 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 3.2), wallMat);
  base.position.y = 1.0;
  base.castShadow = true;
  group.add(base);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), roofMat);
  roof.position.y = 2.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x3a2a12, flatShading: true })
  );
  door.position.set(0, 0.6, 1.65);
  group.add(door);

  group.position.set(x, h, z);
  group.userData = { type: 'house' };
  scene.add(group);
  state.worldObjects.houses.push(group);
  return group;
}

function createDirtPile(x, z) {
  const h = getTerrainHeight(x, z);
  const pile = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, flatShading: true, roughness: 1 })
  );
  pile.position.set(x, h + 0.25, z);
  pile.scale.y = 0.55;
  pile.castShadow = true;
  pile.userData = { type: 'dirt' };
  scene.add(pile);
  state.worldObjects.dirtPiles.push(pile);
  return pile;
}

function createStump(x, z) {
  const h = getTerrainHeight(x, z);
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a2e18, flatShading: true, roughness: 0.95 })
  );
  stump.position.set(x, h + 0.25, z);
  stump.castShadow = true;
  stump.userData = { type: 'stump' };
  scene.add(stump);
  return stump;
}

function populateWorld() {
  const treePos = [
    [-18, -12], [-22, 8], [-8, 22], [12, 18], [25, 5],
    [18, -20], [5, -25], [-15, -28], [30, -12], [-28, 15],
    [8, 8], [-5, -8], [22, 22], [-25, -5], [15, -8],
    [-12, 14], [10, -18], [28, 18], [-30, -20], [0, 28]
  ];
  treePos.forEach(([x, z], i) => createTree(x, z, i));

  [[6, 4, 1], [-10, 6, 0.8], [14, -6, 1.2], [-4, -14, 0.7],
   [20, 12, 0.9], [-18, 20, 1.1], [3, 25, 0.6], [-22, -18, 1.0]
  ].forEach(([x, z, s]) => createRock(x, z, s));

  createPond(-8, 10, 5.5);
  createPond(18, -14, 4);
}
populateWorld();

// ------------------------------------------------------------
// Creature
// ------------------------------------------------------------
function createCreature() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x5ec8e0, roughness: 0.35, metalness: 0.15 })
  );
  body.castShadow = true;
  group.add(body);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a });
  [[-0.32, 0.25, 0.72], [0.32, 0.25, 0.72]].forEach(([x, y, z]) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), eyeMat);
    eye.position.set(x, y, z);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pupilMat);
    pupil.position.set(x, y, z + 0.16);
    group.add(pupil);
  });

  const glow = new THREE.PointLight(0x5ec8e0, 0.55, 6);
  glow.position.set(0, 0.3, 0);
  group.add(glow);

  group.position.copy(state.creature.position);
  scene.add(group);
  return group;
}
const creatureMesh = createCreature();

// ------------------------------------------------------------
// Player
// ------------------------------------------------------------
const controls = new PointerLockControls(camera, document.body);
document.addEventListener('click', (e) => {
  if (e.target.closest('#panels') || e.target.closest('input') || e.target.closest('button')) return;
  if (!controls.isLocked) controls.lock();
});
controls.addEventListener('lock', () => { $('controls-hint').style.opacity = '0.35'; });
controls.addEventListener('unlock', () => { $('controls-hint').style.opacity = '1'; });

document.addEventListener('keydown', (e) => {
  state.keys[e.code] = true;
  if (e.code === 'Escape') controls.unlock();
  if (e.code === 'Enter' && document.activeElement === $('chat-input')) {
    sendChat();
  }
});
document.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

function updatePlayer(dt) {
  const velocity = state.player.velocity;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  let mx = 0, mz = 0;
  if (state.keys['KeyW']) mz += 1;
  if (state.keys['KeyS']) mz -= 1;
  if (state.keys['KeyA']) mx -= 1;
  if (state.keys['KeyD']) mx += 1;

  if (mx || mz) {
    const dir = new THREE.Vector3().addScaledVector(forward, mz).addScaledVector(right, mx).normalize();
    velocity.x = dir.x * CONFIG.playerSpeed;
    velocity.z = dir.z * CONFIG.playerSpeed;
  } else {
    velocity.x *= 0.85;
    velocity.z *= 0.85;
  }

  if (state.keys['Space'] && state.player.onGround) {
    velocity.y = CONFIG.playerJump;
    state.player.onGround = false;
  }
  velocity.y -= CONFIG.gravity * dt;

  camera.position.x += velocity.x * dt;
  camera.position.y += velocity.y * dt;
  camera.position.z += velocity.z * dt;

  const groundY = getTerrainHeight(camera.position.x, camera.position.z) + 1.7;
  if (camera.position.y < groundY) {
    camera.position.y = groundY;
    velocity.y = 0;
    state.player.onGround = true;
  }
  const half = CONFIG.worldSize * 0.45;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -half, half);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -half, half);
}

// ------------------------------------------------------------
// Observations for AI (text only — no vision needed)
// ------------------------------------------------------------
function getNearbyObjects(radius = 18) {
  const c = state.creature.position;
  const nearby = [];
  state.worldObjects.trees.forEach(t => {
    if (t.userData.chopped) return;
    const d = c.distanceTo(t.position);
    if (d < radius) nearby.push({ type: 'tree', id: t.userData.id, distance: +d.toFixed(1), x: +t.position.x.toFixed(1), z: +t.position.z.toFixed(1) });
  });
  state.worldObjects.rocks.forEach(r => {
    const d = c.distanceTo(r.position);
    if (d < radius) nearby.push({ type: 'rock', distance: +d.toFixed(1), x: +r.position.x.toFixed(1), z: +r.position.z.toFixed(1) });
  });
  state.worldObjects.ponds.forEach(p => {
    const d = c.distanceTo(p.position);
    if (d < radius + 4) nearby.push({ type: 'pond', distance: +d.toFixed(1), x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1) });
  });
  state.worldObjects.houses.forEach(h => {
    const d = c.distanceTo(h.position);
    if (d < radius) nearby.push({ type: 'house', distance: +d.toFixed(1), x: +h.position.x.toFixed(1), z: +h.position.z.toFixed(1) });
  });
  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, 8);
}

function buildObservation() {
  const c = state.creature;
  const nearby = getNearbyObjects();
  const inv = c.inventory;
  const invStr = `logs:${inv.logs} dirt:${inv.dirt} seeds:${inv.seeds}`;
  const mem = state.memories.slice(0, 5).join(' | ') || 'none';
  return {
    position: { x: +c.position.x.toFixed(1), y: +c.position.y.toFixed(1), z: +c.position.z.toFixed(1) },
    energy: Math.round(c.energy),
    goal: c.goal,
    inventory: invStr,
    lastResult: c.lastActionResult,
    nearby,
    recentMemories: mem
  };
}

// ------------------------------------------------------------
// Allowed actions (validated by code)
// ------------------------------------------------------------
const ALLOWED_ACTIONS = [
  'move_forward', 'move_backward', 'turn_left', 'turn_right', 'stop',
  'examine', 'rest',
  'chop_tree', 'collect_log', 'plant_tree',
  'scoop_dirt', 'place_dirt',
  'build_house',
  'set_goal'
];

function findNearestTree(maxDist = 4) {
  const c = state.creature.position;
  let best = null, bestD = maxDist;
  for (const t of state.worldObjects.trees) {
    if (t.userData.chopped) continue;
    const d = c.distanceTo(t.position);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

function executeAction(actionObj) {
  const c = state.creature;
  const action = (actionObj.action || '').toLowerCase().trim();
  const reason = actionObj.reason || '';
  let result = '';

  if (!ALLOWED_ACTIONS.includes(action) && action !== 'set_goal') {
    result = `Unknown action "${action}". Ignored.`;
    c.lastActionResult = result;
    return result;
  }

  switch (action) {
    case 'move_forward': {
      const dist = Math.min(Number(actionObj.distance) || 3, 8);
      const old = c.position.clone();
      c.position.addScaledVector(c.direction, dist);
      c.position.y = getTerrainHeight(c.position.x, c.position.z) + 1.05;
      const half = CONFIG.worldSize * 0.42;
      c.position.x = THREE.MathUtils.clamp(c.position.x, -half, half);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -half, half);
      const moved = old.distanceTo(c.position);
      c.distanceTraveled += moved;
      c.energy = Math.max(5, c.energy - moved * 1.5);
      c.activity = 'Moving forward';
      result = `Moved forward ${moved.toFixed(1)}m.`;
      break;
    }
    case 'move_backward': {
      const dist = Math.min(Number(actionObj.distance) || 2, 5);
      c.position.addScaledVector(c.direction, -dist);
      c.position.y = getTerrainHeight(c.position.x, c.position.z) + 1.05;
      c.energy = Math.max(5, c.energy - dist * 1.2);
      c.activity = 'Moving backward';
      result = `Moved backward ${dist}m.`;
      break;
    }
    case 'turn_left': {
      const deg = Math.min(Number(actionObj.degrees) || 45, 120);
      const rad = THREE.MathUtils.degToRad(deg);
      c.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
      c.activity = 'Turning left';
      result = `Turned left ${deg}°.`;
      break;
    }
    case 'turn_right': {
      const deg = Math.min(Number(actionObj.degrees) || 45, 120);
      const rad = THREE.MathUtils.degToRad(-deg);
      c.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
      c.activity = 'Turning right';
      result = `Turned right ${deg}°.`;
      break;
    }
    case 'stop': {
      c.velocity.set(0, 0, 0);
      c.activity = 'Stopped';
      result = 'Stopped.';
      break;
    }
    case 'examine': {
      const nearby = getNearbyObjects(6);
      if (nearby.length === 0) {
        result = 'Nothing interesting close by.';
      } else {
        const n = nearby[0];
        result = `Examined a ${n.type} about ${n.distance}m away.`;
        addMemory(`Examined ${n.type} at distance ${n.distance}.`);
      }
      c.activity = 'Examining';
      c.energy = Math.max(5, c.energy - 2);
      break;
    }
    case 'rest': {
      c.energy = Math.min(100, c.energy + 25);
      c.activity = 'Resting';
      result = 'Rested and recovered energy.';
      break;
    }
    case 'chop_tree': {
      const tree = findNearestTree(4.5);
      if (!tree) {
        result = 'No tree close enough to chop (need to be within ~4m).';
      } else if (c.energy < 15) {
        result = 'Too tired to chop. Need more energy.';
      } else {
        tree.userData.chopped = true;
        scene.remove(tree);
        const idx = state.worldObjects.trees.indexOf(tree);
        if (idx >= 0) state.worldObjects.trees.splice(idx, 1);
        createStump(tree.position.x, tree.position.z);
        c.inventory.logs += 2;
        c.inventory.seeds += 1;
        c.treesChopped += 1;
        c.energy = Math.max(5, c.energy - 18);
        c.activity = 'Chopping tree';
        result = `Chopped a tree. Gained 2 logs and 1 seed. Logs now: ${c.inventory.logs}.`;
        addMemory(`Chopped a tree. Now have ${c.inventory.logs} logs.`);
        logActivity(`Orb chopped a tree. Logs: ${c.inventory.logs}`);
        checkAchievements();
      }
      break;
    }
    case 'collect_log': {
      if (c.inventory.logs > 0) {
        result = `Carrying ${c.inventory.logs} log(s).`;
      } else {
        result = 'No logs to collect. Chop a tree first.';
      }
      c.activity = 'Checking inventory';
      break;
    }
    case 'plant_tree': {
      if (c.inventory.seeds < 1) {
        result = 'No seeds. Chop a tree to get seeds.';
      } else if (c.energy < 10) {
        result = 'Too tired to plant.';
      } else {
        const px = c.position.x + c.direction.x * 2.5;
        const pz = c.position.z + c.direction.z * 2.5;
        createTree(px, pz, 1000 + state.creature.treesPlanted);
        c.inventory.seeds -= 1;
        c.treesPlanted += 1;
        c.energy = Math.max(5, c.energy - 10);
        c.activity = 'Planting tree';
        result = `Planted a new tree. Seeds left: ${c.inventory.seeds}.`;
        addMemory(`Planted a tree. Total planted: ${c.treesPlanted}.`);
        logActivity('Orb planted a tree.');
        checkAchievements();
      }
      break;
    }
    case 'scoop_dirt': {
      if (c.energy < 8) {
        result = 'Too tired to dig.';
      } else {
        c.inventory.dirt += 1;
        c.dirtScooped += 1;
        c.energy = Math.max(5, c.energy - 8);
        c.activity = 'Scooping dirt';
        createDirtPile(c.position.x - c.direction.x * 1.2, c.position.z - c.direction.z * 1.2);
        result = `Scooped dirt. Dirt held: ${c.inventory.dirt}.`;
        addMemory(`Scooped dirt. Holding ${c.inventory.dirt}.`);
        logActivity(`Orb scooped dirt. Dirt: ${c.inventory.dirt}`);
        checkAchievements();
      }
      break;
    }
    case 'place_dirt': {
      if (c.inventory.dirt < 1) {
        result = 'No dirt to place.';
      } else {
        c.inventory.dirt -= 1;
        const px = c.position.x + c.direction.x * 1.5;
        const pz = c.position.z + c.direction.z * 1.5;
        createDirtPile(px, pz);
        c.activity = 'Placing dirt';
        result = `Placed a dirt pile. Dirt left: ${c.inventory.dirt}.`;
        logActivity('Orb placed dirt.');
      }
      break;
    }
    case 'build_house': {
      if (c.inventory.logs < 6) {
        result = `Need 6 logs to build a house. Currently have ${c.inventory.logs}.`;
      } else if (c.energy < 25) {
        result = 'Too tired to build. Rest first.';
      } else {
        const px = c.position.x + c.direction.x * 4;
        const pz = c.position.z + c.direction.z * 4;
        createHouse(px, pz);
        c.inventory.logs -= 6;
        c.housesBuilt += 1;
        c.energy = Math.max(5, c.energy - 30);
        c.activity = 'Building house';
        result = `Built a small house! Logs left: ${c.inventory.logs}.`;
        addMemory(`Built a house. Total houses: ${c.housesBuilt}.`);
        logActivity('Orb built a small house!');
        checkAchievements();
      }
      break;
    }
    case 'set_goal': {
      const g = (actionObj.goal || actionObj.new_goal || '').trim();
      if (g) {
        c.goal = g.slice(0, 80);
        result = `New goal set: ${c.goal}`;
        addMemory(`Set goal: ${c.goal}`);
      } else {
        result = 'No goal text provided.';
      }
      c.activity = 'Thinking about goals';
      break;
    }
    default:
      result = `Action "${action}" not handled.`;
  }

  if (actionObj.new_goal && action !== 'set_goal') {
    c.goal = String(actionObj.new_goal).slice(0, 80);
  }

  c.lastActionResult = result;
  $('last-decision').textContent = `${action}: ${result}`;
  logDecision(`${action} → ${result}${reason ? ' (' + reason + ')' : ''}`);
  return result;
}

// ------------------------------------------------------------
// AI decision via LM Studio
// ------------------------------------------------------------
function buildPrompt(obs) {
  return `You are Orb, a small spherical creature living in a 3D world. You make your own decisions.

Current state:
- Position: ${JSON.stringify(obs.position)}
- Energy: ${obs.energy}/100
- Goal: ${obs.goal}
- Inventory: ${obs.inventory}
- Last result: ${obs.lastResult}
- Nearby objects: ${JSON.stringify(obs.nearby)}
- Recent memories: ${obs.recentMemories}

Allowed actions (pick ONE):
move_forward, move_backward, turn_left, turn_right, stop, examine, rest,
chop_tree, plant_tree, scoop_dirt, place_dirt, build_house, set_goal

Rules:
- You can only do one action now.
- chop_tree needs a tree within ~4 meters.
- plant_tree needs at least 1 seed (you get seeds by chopping).
- build_house needs 6 logs.
- scoop_dirt always works but costs energy.
- Prefer exploring, learning, and eventually building when you have materials.
- Keep responses short.

Reply with ONLY a JSON object, no markdown, no extra text:
{"action":"move_forward","distance":3,"reason":"short reason","new_goal":"optional new goal"}

Valid extra fields depending on action:
- move_forward / move_backward: distance (1-8)
- turn_left / turn_right: degrees (15-120)
- set_goal: goal (string)
`;
}

async function askLMStudio(prompt) {
  const url = CONFIG.apiUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    messages: [
      { role: 'system', content: 'You are a careful creature AI. Always reply with a single valid JSON object only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 180,
    stream: false
  };
  if (CONFIG.modelName) body.model = CONFIG.modelName;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return text;
}

function parseAction(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function runAIDecision() {
  if (state.deciding) return;
  state.deciding = true;
  $('brain-status').textContent = 'Thinking...';
  $('sim-status').textContent = 'AI deciding';

  try {
    const obs = buildObservation();
    const prompt = buildPrompt(obs);
    const raw = await askLMStudio(prompt);
    const actionObj = parseAction(raw);

    if (!actionObj || !actionObj.action) {
      logDecision('AI reply was not valid JSON. Ignoring.');
      $('brain-status').textContent = 'Bad reply';
    } else {
      executeAction(actionObj);
      $('brain-status').textContent = 'OK';
      state.lmOnline = true;
      $('lm-status').textContent = 'Online';
      $('lm-status').className = 'value online';
    }
  } catch (err) {
    logDecision(`AI error: ${err.message}`);
    $('brain-status').textContent = 'Error';
    state.lmOnline = false;
    $('lm-status').textContent = 'Offline';
    $('lm-status').className = 'value offline';
    executeAction({ action: 'move_forward', distance: 2 + Math.random() * 3, reason: 'AI offline fallback' });
  }

  state.deciding = false;
  state.nextDecisionAt = performance.now() + CONFIG.decisionInterval * 1000;
  $('sim-status').textContent = 'Running';
}

// ------------------------------------------------------------
// Chat with creature
// ------------------------------------------------------------
async function sendChat() {
  const input = $('chat-input');
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  addChat('player', text);
  logActivity(`You said: ${text}`);

  if (state.deciding) return;
  state.deciding = true;
  $('brain-status').textContent = 'Replying...';

  try {
    const obs = buildObservation();
    const prompt = `You are Orb, a small spherical creature. The human just said: "${text}"

Your state: energy ${obs.energy}, goal "${obs.goal}", inventory ${obs.inventory}, nearby ${JSON.stringify(obs.nearby.slice(0, 4))}

Reply with a short friendly spoken response (1-2 sentences) AND optionally one action.
Return ONLY JSON:
{"say":"your spoken reply","action":"optional_action","reason":"why","new_goal":"optional"}

Allowed actions: move_forward, turn_left, turn_right, examine, rest, chop_tree, plant_tree, scoop_dirt, build_house, set_goal, stop
If you only want to talk, set action to "stop".
`;

    const raw = await askLMStudio(prompt);
    const obj = parseAction(raw);
    if (obj) {
      if (obj.say) addChat('creature', obj.say);
      else addChat('creature', '...');
      if (obj.action && obj.action !== 'stop') {
        executeAction(obj);
      }
      if (obj.new_goal) state.creature.goal = String(obj.new_goal).slice(0, 80);
    } else {
      addChat('creature', "I'm not sure how to answer that right now.");
    }
    state.lmOnline = true;
    $('lm-status').textContent = 'Online';
    $('lm-status').className = 'value online';
  } catch (err) {
    addChat('creature', "(can't reach my thoughts right now — is LM Studio running?)");
    state.lmOnline = false;
    $('lm-status').textContent = 'Offline';
    $('lm-status').className = 'value offline';
  }

  state.deciding = false;
  $('brain-status').textContent = state.lmOnline ? 'OK' : 'Offline';
}

$('chat-send').addEventListener('click', sendChat);

// ------------------------------------------------------------
// Achievements
// ------------------------------------------------------------
function checkAchievements() {
  const c = state.creature;
  const a = state.achievements;
  if (!a.first_steps && c.distanceTraveled >= 10) {
    a.first_steps = true;
    unlockAch('first_steps');
  }
  if (!a.explorer && c.locationsVisited.size >= 5) {
    a.explorer = true;
    unlockAch('explorer');
  }
  if (!a.lumberjack && c.treesChopped >= 3) {
    a.lumberjack = true;
    unlockAch('lumberjack');
  }
  if (!a.builder && c.housesBuilt >= 1) {
    a.builder = true;
    unlockAch('builder');
  }
  if (!a.gardener && c.treesPlanted >= 2) {
    a.gardener = true;
    unlockAch('gardener');
  }
  if (!a.digger && c.dirtScooped >= 5) {
    a.digger = true;
    unlockAch('digger');
  }
}

function unlockAch(id) {
  const el = document.querySelector(`.achievement[data-id="${id}"]`);
  if (el) {
    el.classList.remove('locked');
    el.classList.add('unlocked');
  }
  logActivity(`Achievement unlocked: ${id}`);
  addMemory(`Earned achievement: ${id}`);
}

// ------------------------------------------------------------
// Creature visual update
// ------------------------------------------------------------
function updateCreatureVisual(dt) {
  const c = state.creature;
  c.ageMinutes = (Date.now() - state.startTime) / 60000;

  const locKey = `${Math.round(c.position.x / 10)}_${Math.round(c.position.z / 10)}`;
  c.locationsVisited.add(locKey);

  if (c.activity === 'Idle' || c.activity === 'Resting' || c.activity === 'Looking around') {
    c.energy = Math.min(100, c.energy + dt * 1.5);
  }

  const bob = Math.sin(Date.now() * 0.004) * 0.07;
  creatureMesh.position.set(c.position.x, c.position.y + bob, c.position.z);

  if (c.direction.lengthSq() > 0.01) {
    const look = creatureMesh.position.clone().add(c.direction);
    creatureMesh.lookAt(look);
  }

  checkAchievements();
}

// ------------------------------------------------------------
// UI
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
  const inv = c.inventory;
  $('creature-inv').textContent = `logs ${inv.logs} · dirt ${inv.dirt} · seeds ${inv.seeds}`;
  $('creature-pos').textContent = `${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)}`;

  const remain = Math.max(0, (state.nextDecisionAt - performance.now()) / 1000);
  $('next-decision').textContent = state.deciding ? 'now' : `${remain.toFixed(0)}s`;

  state.frameCount++;
  const now = performance.now();
  if (now - state.lastFpsTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFpsTime = now;
    $('fps-counter').textContent = state.fps;
  }
}

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

$('test-connection-btn').addEventListener('click', async () => {
  const url = $('api-url').value.trim().replace(/\/$/, '');
  const resultEl = $('connection-result');
  resultEl.textContent = 'Testing...';
  resultEl.className = 'connection-result';
  try {
    const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = data.data || [];
    resultEl.textContent = `Connected. Models: ${models.length}`;
    resultEl.className = 'connection-result success';
    $('lm-status').textContent = 'Online';
    $('lm-status').className = 'value online';
    state.lmOnline = true;
    logActivity('LM Studio connected.');
  } catch (err) {
    resultEl.textContent = `Failed: ${err.message}`;
    resultEl.className = 'connection-result error';
    $('lm-status').textContent = 'Offline';
    $('lm-status').className = 'value offline';
    state.lmOnline = false;
  }
});

$('force-decision-btn').addEventListener('click', () => {
  state.nextDecisionAt = 0;
  runAIDecision();
});

$('save-settings-btn').addEventListener('click', () => {
  CONFIG.apiUrl = $('api-url').value.trim();
  CONFIG.modelName = $('model-name').value.trim();
  CONFIG.decisionInterval = parseInt($('decision-interval').value, 10) || 12;
  try {
    localStorage.setItem('ailifeworld_settings', JSON.stringify({
      apiUrl: CONFIG.apiUrl,
      modelName: CONFIG.modelName,
      decisionInterval: CONFIG.decisionInterval
    }));
  } catch (_) {}
  logActivity('Settings saved.');
});

try {
  const saved = JSON.parse(localStorage.getItem('ailifeworld_settings') || '{}');
  if (saved.apiUrl) { CONFIG.apiUrl = saved.apiUrl; $('api-url').value = saved.apiUrl; }
  if (saved.modelName) { CONFIG.modelName = saved.modelName; $('model-name').value = saved.modelName; }
  if (saved.decisionInterval) {
    CONFIG.decisionInterval = saved.decisionInterval;
    $('decision-interval').value = saved.decisionInterval;
  }
} catch (_) {}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(state.clock.getDelta(), 0.05);

  if (controls.isLocked) updatePlayer(dt);
  updateCreatureVisual(dt);
  updateUI();

  if (performance.now() >= state.nextDecisionAt && !state.deciding) {
    runAIDecision();
  }

  renderer.render(scene, camera);
}

logActivity('World loaded. Orb is awake.');
addMemory('Woke up in a green world.');
addMemory('I can chop trees, plant, dig, and build if I gather enough.');
state.nextDecisionAt = performance.now() + 4000;
animate();
console.log('AI Life World Phase 2');
