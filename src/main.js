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
let cameraRig;                       // group that teleportation moves
let controller0, controller1;
let raycaster, tempMatrix;
const teleportMarkers = [];
const clock = new THREE.Clock();

// desktop look
let isPointerLocked = false;
let yaw = 0, pitch = 0;

// ── init ─────────────────────────────────────────────────────────────
document.fonts.ready.then(() => init());
animate();

function init() {
  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('scene-container').appendChild(renderer.domElement);

  // VR button
  const vrButton = VRButton.createButton(renderer);
  document.getElementById('vr-button-container').appendChild(vrButton);

  // scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1929);
  scene.fog = new THREE.Fog(0x0a1929, 20, 40);

  // camera rig (for teleportation)
  cameraRig = new THREE.Group();
  scene.add(cameraRig);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 0);    // standing eye-height
  cameraRig.add(camera);

  // lights
  scene.add(new THREE.AmbientLight(0x404060, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 5);
  scene.add(dir);
  const point = new THREE.PointLight(0x64ffda, 0.6, 20);
  point.position.set(0, 5, 0);
  scene.add(point);

  // floor grid
  const grid = new THREE.GridHelper(30, 60, 0x1e3a5f, 0x0f2a4a);
  scene.add(grid);

  // subtle ground plane for raycasting
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

    const geo  = new THREE.PlaneGeometry(3.5, 2.625);  // 4:3 aspect
    const mat  = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...def.pos);
    if (def.rotY) mesh.rotation.y = def.rotY;
    scene.add(mesh);

    // floating label above panel
    addTextLabel(def.label, [def.pos[0], def.pos[1] + 1.6, def.pos[2]], def.rotY || 0);
  });

  // ── teleport markers (cyan glowing circles) ───────────────────────
  const teleportPositions = [
    [0,    0.01,  0],      // center
    [0,    0.01, -2.5],    // front of status panel
    [-3,   0.01, -0.5],    // near responders
    [3,    0.01, -0.5],    // near tasks
    [0,    0.01,  2.5],    // between timeline & monitoring
  ];

  teleportPositions.forEach(pos => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.35, 32),
      new THREE.MeshBasicMaterial({ color: 0x64ffda, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(...pos);
    ring.userData.isTeleport = true;
    ring.userData.target = new THREE.Vector3(...pos);
    scene.add(ring);
    teleportMarkers.push(ring);

    // inner glow disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.25, 32),
      new THREE.MeshBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0.15 })
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

  // controller ray visuals
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -8),
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x64ffda });
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
  // click-to-teleport on desktop
  document.addEventListener('mousedown', e => {
    if (!isPointerLocked || renderer.xr.isPresenting) return;
    const mouse = new THREE.Vector2(0, 0); // center of screen
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

  // update HUD
  updateHud();
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
  c.fillStyle = 'rgba(10,25,41,0.85)';
  c.fillRect(0, 0, 512, 64);
  c.fillStyle = '#64ffda';
  c.font = 'bold 28px Inter, sans-serif';
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
    <strong style="color:#64ffda">WebXR Incident War Room</strong><br>
    VR: ${vrSupported ? '✓ Supported' : '✗ Not available'}<br><br>
    <em>Desktop:</em> Click to lock mouse → look around<br>
    Click on a cyan ring to teleport<br>
    Press <kbd>Esc</kbd> to release mouse<br><br>
    <em>Quest 2:</em> Click "Enter VR" button<br>
    Point controller at cyan circles → pull trigger
  `;
}

// ── animate ──────────────────────────────────────────────────────────
function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  const t = clock.getElapsedTime();

  // pulse teleport markers
  teleportMarkers.forEach((m, i) => {
    m.material.opacity = 0.45 + 0.3 * Math.sin(t * 2 + i);
  });

  // desktop look
  if (!renderer.xr.isPresenting && isPointerLocked) {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  renderer.render(scene, camera);
}
