// main.js — WebXR Incident War Room entry point
import * as THREE from 'three';
import { VRButton }        from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import {
  renderStatusPanel,
  renderRespondersPanel,
  renderTasksPanel,
  renderTimelinePanel,
  renderMonitoringPanel,
} from './panels.js';

// ── globals ──────────────────────────────────────────────────────────
let camera, scene, renderer;
let cameraRig;
let controller0, controller1;
let raycaster, tempMatrix;
const teleportMarkers = [];
const clock = new THREE.Clock();
let environmentGroup;   // holds all room geometry — hidden in AR mode
const MOVE_SPEED = 3;  // meters per second for thumbstick locomotion
const _moveVec = new THREE.Vector3();

// desktop look
let isPointerLocked = false;
let yaw = 0, pitch = 0;

// ── init ─────────────────────────────────────────────────────────────
document.fonts.ready.then(() => { init(); animate(); });

function init() {
  // renderer — alpha:true needed for AR passthrough
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('scene-container').appendChild(renderer.domElement);

  // VR / AR button
  const vrButton = VRButton.createButton(renderer);
  document.getElementById('vr-button-container').appendChild(vrButton);

  // scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06101c);
  scene.fog = new THREE.Fog(0x06101c, 18, 35);

  // camera rig (for teleportation)
  cameraRig = new THREE.Group();
  scene.add(cameraRig);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 0);
  cameraRig.add(camera);

  // lights
  scene.add(new THREE.AmbientLight(0x405068, 1.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 5);
  scene.add(dir);
  const point = new THREE.PointLight(0x80ffea, 0.8, 25);
  point.position.set(0, 6, 0);
  scene.add(point);

  // ── environment (hidden in AR passthrough) ─────────────────────────
  environmentGroup = new THREE.Group();
  scene.add(environmentGroup);
  buildCommandCenter(environmentGroup);

  // invisible ground plane for raycasting (always present)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  // ── information panels ────────────────────────────────────────────
  const panelDefs = [
    { render: renderStatusPanel,     pos: [0,   2.2, -4],  label: 'Incident Status' },
    { render: renderRespondersPanel, pos: [-4,  2.2, -2],  label: 'Active Responders', rotY: Math.PI / 5 },
    { render: renderTasksPanel,      pos: [4,   2.2, -2],  label: 'Action Items',      rotY: -Math.PI / 5 },
    { render: renderTimelinePanel,   pos: [-3.5,2.2,  2],  label: 'Incident Timeline',  rotY: Math.PI / 3 },
    { render: renderMonitoringPanel, pos: [3.5, 2.2,  2],  label: 'Service Monitoring', rotY: -Math.PI / 3 },
  ];

  panelDefs.forEach(def => {
    const canvas  = def.render();
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const geo  = new THREE.PlaneGeometry(3.5, 2.625);
    const mat  = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...def.pos);
    if (def.rotY) mesh.rotation.y = def.rotY;
    scene.add(mesh);

    addTextLabel(def.label, [def.pos[0], def.pos[1] + 1.6, def.pos[2]], def.rotY || 0);
  });

  // ── teleport markers ──────────────────────────────────────────────
  const teleportPositions = [
    // center
    [0,    0.01,  0],
    // inner ring — close viewing positions for each panel
    [ 0,    0.01, -2.5],    // front of status
    [-2.5,  0.01, -1.5],    // left-front (responders)
    [ 2.5,  0.01, -1.5],    // right-front (tasks)
    [-2.2,  0.01,  1.5],    // left-rear (timeline)
    [ 2.2,  0.01,  1.5],    // right-rear (monitoring)
    // mid ring — between panels
    [-1.5,  0.01,  0],      // left of center
    [ 1.5,  0.01,  0],      // right of center
    [ 0,    0.01,  1.5],    // behind center
    [-3.5,  0.01,  0],      // far left
    [ 3.5,  0.01,  0],      // far right
    // outer ring — stepped-back overview positions
    [ 0,    0.01, -4.5],    // far front
    [-4,    0.01, -3],      // far left-front
    [ 4,    0.01, -3],      // far right-front
    [-4.5,  0.01,  1],      // far left
    [ 4.5,  0.01,  1],      // far right
    [-3,    0.01,  3.5],    // far left-rear
    [ 3,    0.01,  3.5],    // far right-rear
    [ 0,    0.01,  4],      // far rear center
    // corridor positions
    [-1,    0.01, -4],      // left of status panel
    [ 1,    0.01, -4],      // right of status panel
  ];

  teleportPositions.forEach(pos => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 32),
      new THREE.MeshBasicMaterial({ color: 0x80ffea, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(...pos);
    ring.userData.isTeleport = true;
    ring.userData.target = new THREE.Vector3(...pos);
    scene.add(ring);
    teleportMarkers.push(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 32),
      new THREE.MeshBasicMaterial({ color: 0x80ffea, transparent: true, opacity: 0.15 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pos[0], pos[1] + 0.005, pos[2]);
    scene.add(disc);
  });

  // ── VR controllers ────────────────────────────────────────────────
  raycaster  = new THREE.Raycaster();
  tempMatrix = new THREE.Matrix4();

  const factory = new XRControllerModelFactory();

  controller0 = renderer.xr.getController(0);
  controller0.addEventListener('selectstart', onSelect);
  cameraRig.add(controller0);
  cameraRig.add(renderer.xr.getControllerGrip(0));

  controller1 = renderer.xr.getController(1);
  controller1.addEventListener('selectstart', onSelect);
  cameraRig.add(controller1);
  cameraRig.add(renderer.xr.getControllerGrip(1));

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -8),
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x80ffea });
  controller0.add(new THREE.Line(lineGeo.clone(), lineMat.clone()));
  controller1.add(new THREE.Line(lineGeo.clone(), lineMat.clone()));

  // ── desktop controls ──────────────────────────────────────────────
  renderer.domElement.addEventListener('click', () => {
    if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = (document.pointerLockElement === renderer.domElement);
  });
  document.addEventListener('mousemove', e => {
    if (!isPointerLocked) return;
    yaw   -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  });
  document.addEventListener('mousedown', e => {
    if (!isPointerLocked || renderer.xr.isPresenting) return;
    const mouse = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(teleportMarkers);
    if (hits.length > 0) {
      const target = hits[0].object.userData.target;
      cameraRig.position.set(target.x, 0, target.z);
    }
  });

  // resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── AR passthrough detection ──────────────────────────────────────
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    if (session && session.environmentBlendMode === 'alpha-blend') {
      // AR passthrough device — hide room, clear background
      environmentGroup.visible = false;
      scene.background = null;
      scene.fog = null;
    }
  });
  renderer.xr.addEventListener('sessionend', () => {
    environmentGroup.visible = true;
    scene.background = new THREE.Color(0x06101c);
    scene.fog = new THREE.Fog(0x06101c, 18, 35);
  });

  updateHud();
}

// ── command center environment ───────────────────────────────────────
function buildCommandCenter(group) {
  const darkMetal  = new THREE.MeshStandardMaterial({ color: 0x1a2235, roughness: 0.8, metalness: 0.3 });
  const medMetal   = new THREE.MeshStandardMaterial({ color: 0x253350, roughness: 0.7, metalness: 0.4 });
  const lightTrim  = new THREE.MeshStandardMaterial({ color: 0x3a5070, roughness: 0.6, metalness: 0.5 });
  const glowCyan   = new THREE.MeshBasicMaterial({ color: 0x80ffea });
  const glowDim    = new THREE.MeshBasicMaterial({ color: 0x2a6060 });
  const screenGlow = new THREE.MeshBasicMaterial({ color: 0x0a2a3a });

  // ── floor ──────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 64),
    new THREE.MeshStandardMaterial({ color: 0x0e1a2a, roughness: 0.9, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  group.add(floor);

  // floor accent ring
  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(5.5, 5.6, 64),
    glowDim
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.005;
  group.add(floorRing);

  // center floor emblem
  const centerDisc = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 6),
    glowDim
  );
  centerDisc.rotation.x = -Math.PI / 2;
  centerDisc.position.y = 0.005;
  group.add(centerDisc);

  // ── circular wall ──────────────────────────────────────────────────
  const wallGeo = new THREE.CylinderGeometry(11, 11, 8, 48, 1, true);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x141e30, roughness: 0.85, metalness: 0.2, side: THREE.BackSide
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 4;
  group.add(wall);

  // ── ceiling ────────────────────────────────────────────────────────
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshStandardMaterial({ color: 0x0c1520, roughness: 0.9, metalness: 0.1, side: THREE.BackSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 8;
  group.add(ceiling);

  // ceiling light ring
  const ceilRing = new THREE.Mesh(
    new THREE.RingGeometry(3, 3.15, 48),
    glowCyan
  );
  ceilRing.rotation.x = Math.PI / 2;
  ceilRing.position.y = 7.98;
  group.add(ceilRing);

  // ── accent light strips on wall (horizontal bands) ─────────────────
  [1.0, 4.0, 7.0].forEach(h => {
    const strip = new THREE.Mesh(
      new THREE.CylinderGeometry(10.95, 10.95, 0.04, 48, 1, true),
      glowDim
    );
    strip.position.y = h;
    group.add(strip);
  });

  // ── console banks around perimeter ─────────────────────────────────
  const consoleCount = 12;
  for (let i = 0; i < consoleCount; i++) {
    const angle = (i / consoleCount) * Math.PI * 2;
    const r = 9.5;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    // console body
    const consoleBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.2, 0.6),
      medMetal
    );
    consoleBody.position.set(x, 0.6, z);
    consoleBody.lookAt(0, 0.6, 0);
    group.add(consoleBody);

    // console top (angled surface)
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.05, 0.5),
      lightTrim
    );
    top.position.set(x, 1.22, z);
    top.lookAt(0, 1.22, 0);
    top.rotation.x -= 0.3;
    group.add(top);

    // screen on console
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.8),
      screenGlow
    );
    const sx = Math.sin(angle) * (r - 0.31);
    const sz = Math.cos(angle) * (r - 0.31);
    screen.position.set(sx, 2.0, sz);
    screen.lookAt(0, 2.0, 0);
    group.add(screen);

    // screen border glow
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.9),
      glowDim
    );
    border.position.set(sx, 2.0, sz + (Math.cos(angle) > 0 ? -0.001 : 0.001));
    border.lookAt(0, 2.0, 0);
    border.position.z = sz; // re-center
    const bx = Math.sin(angle) * (r - 0.32);
    const bz = Math.cos(angle) * (r - 0.32);
    border.position.set(bx, 2.0, bz);
    border.lookAt(0, 2.0, 0);
    group.add(border);

    // small indicator lights on console face
    for (let row = 0; row < 3; row++) {
      const light = new THREE.Mesh(
        new THREE.CircleGeometry(0.03, 8),
        row === 0 ? glowCyan : glowDim
      );
      const lx = Math.sin(angle) * (r - 0.01);
      const lz = Math.cos(angle) * (r - 0.01);
      light.position.set(lx, 0.4 + row * 0.15, lz);
      light.lookAt(0, 0.4 + row * 0.15, 0);
      group.add(light);
    }
  }

  // ── tall equipment racks between some consoles ─────────────────────
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 10.2;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 5, 0.4),
      darkMetal
    );
    rack.position.set(x, 2.5, z);
    rack.lookAt(0, 2.5, 0);
    group.add(rack);

    // rack lights
    for (let j = 0; j < 8; j++) {
      const led = new THREE.Mesh(
        new THREE.CircleGeometry(0.02, 6),
        j % 3 === 0 ? glowCyan : glowDim
      );
      const lx = Math.sin(angle) * (r - 0.21);
      const lz = Math.cos(angle) * (r - 0.21);
      led.position.set(lx, 0.8 + j * 0.5, lz);
      led.lookAt(0, 0.8 + j * 0.5, 0);
      group.add(led);
    }
  }

  // ── overhead point lights for atmosphere ───────────────────────────
  const overhead1 = new THREE.PointLight(0x80ffea, 0.3, 15);
  overhead1.position.set(0, 7, 0);
  group.add(overhead1);
  const overhead2 = new THREE.PointLight(0x3060a0, 0.4, 20);
  overhead2.position.set(0, 5, 0);
  group.add(overhead2);
}

// ── VR teleport handler ──────────────────────────────────────────────
function onSelect(event) {
  const ctrl = event.target;
  tempMatrix.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(teleportMarkers);
  if (hits.length > 0) {
    const target = hits[0].object.userData.target;
    cameraRig.position.set(target.x, 0, target.z);
  }
}

// ── floating text labels ─────────────────────────────────────────────
function addTextLabel(text, pos, rotY) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(6,16,28,0.9)';
  c.fillRect(0, 0, 512, 64);
  c.fillStyle = '#80ffea';
  c.font = '700 30px Inter, sans-serif';
  c.textAlign = 'center';
  c.fillText(text, 256, 42);

  const tex  = new THREE.CanvasTexture(canvas);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const geo  = new THREE.PlaneGeometry(2.5, 0.32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  scene.add(mesh);
}

// ── HUD overlay (desktop) ────────────────────────────────────────────
function updateHud() {
  const el = document.getElementById('hud');
  if (!el) return;
  const vrSupported = navigator.xr !== undefined;
  el.innerHTML = `
    <strong style="color:#80ffea">WebXR Incident War Room</strong><br>
    VR: ${vrSupported ? '✓ Supported' : '✗ Not available'}<br><br>
    <em>Desktop:</em> Click to lock mouse → look around<br>
    Click on a cyan ring to teleport<br>
    Press <kbd>Esc</kbd> to release mouse<br><br>
    <em>Quest 2:</em> Click "Enter VR" button<br>
    Point controller at cyan circles → pull trigger<br>
    Push thumbstick to walk freely
  `;
}

// ── animate ──────────────────────────────────────────────────────────
function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  const t = clock.getElapsedTime();
  const dt = clock.getDelta();

  teleportMarkers.forEach((m, i) => {
    m.material.opacity = 0.45 + 0.3 * Math.sin(t * 2 + i);
  });

  // ── thumbstick smooth locomotion (VR) ──────────────────────────────
  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        // Quest thumbstick is axes[2],axes[3]; apply deadzone
        const x = Math.abs(axes[2]) > 0.15 ? axes[2] : 0;
        const z = Math.abs(axes[3]) > 0.15 ? axes[3] : 0;
        if (x !== 0 || z !== 0) {
          // move relative to head orientation
          const headQuat = camera.getWorldQuaternion(new THREE.Quaternion());
          _moveVec.set(x, 0, z).applyQuaternion(headQuat);
          _moveVec.y = 0; // stay on ground plane
          _moveVec.normalize().multiplyScalar(MOVE_SPEED * dt * Math.max(Math.abs(x), Math.abs(z)));
          cameraRig.position.add(_moveVec);
          break; // use first controller with input
        }
      }
    }
  }

  // desktop look
  if (!renderer.xr.isPresenting && isPointerLocked) {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  renderer.render(scene, camera);
}
