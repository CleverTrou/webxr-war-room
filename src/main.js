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
let elapsedTime = 0;
let prevTime = performance.now();
let environmentGroup;
const MOVE_SPEED = 3;
const _moveVec = new THREE.Vector3();
let hoveredRing = null;

// desktop look
let isPointerLocked = false;
let yaw = 0, pitch = 0;
const keysDown = {};

// ── init ─────────────────────────────────────────────────────────────
document.fonts.ready.then(() => {
  try {
    init();
    animate();
  } catch (e) {
    console.error('Init failed:', e);
    const el = document.getElementById('hud');
    if (el) {
      el.style.color = 'red';
      el.textContent = `ERROR: ${e.message}`;
    }
  }
});

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('scene-container').appendChild(renderer.domElement);

  const vrButton = VRButton.createButton(renderer);
  document.getElementById('vr-button-container').appendChild(vrButton);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a28);
  scene.fog = new THREE.Fog(0x2a2a28, 25, 45);

  cameraRig = new THREE.Group();
  scene.add(cameraRig);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 0);
  cameraRig.add(camera);

  // lights — bright fluorescent-lit bunker
  scene.add(new THREE.AmbientLight(0xfff5e8, 1.0));
  const dir = new THREE.DirectionalLight(0xfff5e0, 1.2);
  dir.position.set(5, 10, 5);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xfff0d0, 0.6);
  dir2.position.set(-5, 8, -5);
  scene.add(dir2);

  // environment
  environmentGroup = new THREE.Group();
  scene.add(environmentGroup);
  buildCommandCenter(environmentGroup);

  // invisible ground for raycasting
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  // ── information panels — 360° circle ───────────────────────────────
  const panelRenderers = [
    { render: renderStatusPanel,     label: 'Incident Status' },
    { render: renderRespondersPanel, label: 'Active Responders' },
    { render: renderTasksPanel,      label: 'Action Items' },
    { render: renderTimelinePanel,   label: 'Incident Timeline' },
    { render: renderMonitoringPanel, label: 'Service Monitoring' },
  ];

  const PANEL_R    = 4;      // distance from center
  const PANEL_Y    = 2.2;    // center height
  const LABEL_Y    = PANEL_Y + 1.6;
  const panelCount = panelRenderers.length;

  panelRenderers.forEach((def, i) => {
    const angle = (i / panelCount) * Math.PI * 2;   // evenly spaced
    const x = Math.sin(angle) * PANEL_R;
    const z = -Math.cos(angle) * PANEL_R;            // angle 0 = in front (-Z)
    const rotY = Math.atan2(-x, -z);                 // face center

    const canvas  = def.render();
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const geo  = new THREE.PlaneGeometry(3.5, 2.625);
    const mat  = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, PANEL_Y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);

    addTextLabel(def.label, [x, LABEL_Y, z], rotY);
  });

  // ── teleport markers ──────────────────────────────────────────────
  const teleportPositions = [[0, 0.01, 0]];  // center

  // inner ring — close reading distance from each panel
  for (let i = 0; i < panelCount; i++) {
    const a = (i / panelCount) * Math.PI * 2;
    teleportPositions.push([Math.sin(a) * 2.2, 0.01, -Math.cos(a) * 2.2]);
  }
  // inner ring — between panels
  for (let i = 0; i < panelCount; i++) {
    const a = ((i + 0.5) / panelCount) * Math.PI * 2;
    teleportPositions.push([Math.sin(a) * 2.0, 0.01, -Math.cos(a) * 2.0]);
  }
  // outer ring — stepped back from each panel
  for (let i = 0; i < panelCount; i++) {
    const a = (i / panelCount) * Math.PI * 2;
    teleportPositions.push([Math.sin(a) * 5.0, 0.01, -Math.cos(a) * 5.0]);
  }
  // outer ring — between panels
  for (let i = 0; i < panelCount; i++) {
    const a = ((i + 0.5) / panelCount) * Math.PI * 2;
    teleportPositions.push([Math.sin(a) * 5.0, 0.01, -Math.cos(a) * 5.0]);
  }

  teleportPositions.forEach(pos => {
    // solid circle = full click target
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 32),
      new THREE.MeshBasicMaterial({ color: 0x80ffea, side: THREE.DoubleSide, transparent: true, opacity: 0.15 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(...pos);
    disc.userData.isTeleport = true;
    disc.userData.target = new THREE.Vector3(...pos);
    scene.add(disc);
    teleportMarkers.push(disc);

    // ring outline on top for visual
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.3, 32),
      new THREE.MeshBasicMaterial({ color: 0x80ffea, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos[0], pos[1] + 0.005, pos[2]);
    disc.userData.ringOverlay = ring;
    scene.add(ring);
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

  // Unified click: try teleport first, only lock pointer if nothing was hit
  renderer.domElement.addEventListener('click', e => {
    if (renderer.xr.isPresenting) return;

    if (!isPointerLocked) {
      // raycast from actual mouse position
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(teleportMarkers);
      if (hits.length > 0) {
        const target = hits[0].object.userData.target;
        cameraRig.position.set(target.x, 0, target.z);
        return;  // teleported — don't lock pointer
      }
      // no ring hit — lock pointer for FPS look
      renderer.domElement.requestPointerLock();
    } else {
      // pointer-locked: raycast from screen center (crosshair)
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = raycaster.intersectObjects(teleportMarkers);
      if (hits.length > 0) {
        const target = hits[0].object.userData.target;
        cameraRig.position.set(target.x, 0, target.z);
      }
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = (document.pointerLockElement === renderer.domElement);
    renderer.domElement.style.cursor = isPointerLocked ? 'none' : '';
  });

  document.addEventListener('mousemove', e => {
    if (isPointerLocked) {
      yaw   -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    } else if (!renderer.xr.isPresenting) {
      // hover detection for teleport markers
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(teleportMarkers);
      const newHover = hits.length > 0 ? hits[0].object : null;
      if (newHover !== hoveredRing) {
        if (hoveredRing) {
          hoveredRing.material.color.setHex(0x80ffea);
          hoveredRing.material.opacity = 0.15;
          if (hoveredRing.userData.ringOverlay) {
            hoveredRing.userData.ringOverlay.material.color.setHex(0x80ffea);
          }
          hoveredRing.scale.set(1, 1, 1);
        }
        hoveredRing = newHover;
        if (hoveredRing) {
          hoveredRing.material.color.setHex(0xffffff);
          hoveredRing.material.opacity = 0.35;
          if (hoveredRing.userData.ringOverlay) {
            hoveredRing.userData.ringOverlay.material.color.setHex(0xffffff);
          }
          hoveredRing.scale.set(1.3, 1.3, 1.3);
        }
      }
      renderer.domElement.style.cursor = hoveredRing ? 'pointer' : '';
    }
  });

  // WASD
  document.addEventListener('keydown', e => { keysDown[e.code] = true; });
  document.addEventListener('keyup',   e => { keysDown[e.code] = false; });

  // resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // AR passthrough
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    if (session && session.environmentBlendMode === 'alpha-blend') {
      environmentGroup.visible = false;
      scene.background = null;
      scene.fog = null;
    }
  });
  renderer.xr.addEventListener('sessionend', () => {
    environmentGroup.visible = true;
    scene.background = new THREE.Color(0x2a2a28);
    scene.fog = new THREE.Fog(0x2a2a28, 25, 45);
  });

  updateHud();
}

// ── command center environment ───────────────────────────────────────
function buildCommandCenter(group) {
  // ── materials: cold-war bunker palette ──
  const concrete     = new THREE.MeshStandardMaterial({ color: 0x8a8a85, roughness: 0.95, metalness: 0.05 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x7a7a75, roughness: 0.95, metalness: 0.05 });
  const steel        = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.5, metalness: 0.7 });
  const darkSteel    = new THREE.MeshStandardMaterial({ color: 0x4e5358, roughness: 0.6, metalness: 0.6 });
  const olive        = new THREE.MeshStandardMaterial({ color: 0x6a7560, roughness: 0.8, metalness: 0.2 });
  const cream        = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, metalness: 0.05 });
  const crtGreen     = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
  const crtDim       = new THREE.MeshBasicMaterial({ color: 0x1a6633 });
  const crtAmber     = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const redLight     = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  const warmWhite    = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  const darkScreen   = new THREE.MeshBasicMaterial({ color: 0x0a1a0a });

  // ── floor: industrial tile pattern ──
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x5e5e5a, roughness: 0.9, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  group.add(floor);

  // floor grid lines (tile look)
  for (let i = -12; i <= 12; i += 2) {
    const lineH = new THREE.Mesh(new THREE.BoxGeometry(28, 0.005, 0.03), darkSteel);
    lineH.position.set(0, 0.001, i);
    group.add(lineH);
    const lineV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 28), darkSteel);
    lineV.position.set(i, 0.001, 0);
    group.add(lineV);
  }

  // raised center platform (commander's station)
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.0, 0.15, 8),
    steel
  );
  platform.position.y = 0.075;
  group.add(platform);

  // ── walls: octagonal bunker ──
  const wallR = 12;
  const wallH = 6;
  const wallSides = 12;
  for (let i = 0; i < wallSides; i++) {
    const angle = (i / wallSides) * Math.PI * 2;
    const nextAngle = ((i + 1) / wallSides) * Math.PI * 2;
    const x1 = Math.sin(angle) * wallR, z1 = -Math.cos(angle) * wallR;
    const x2 = Math.sin(nextAngle) * wallR, z2 = -Math.cos(nextAngle) * wallR;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const segW = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const wallPanel = new THREE.Mesh(
      new THREE.BoxGeometry(segW, wallH, 0.3),
      i % 3 === 0 ? concreteDark : concrete
    );
    wallPanel.position.set(cx, wallH / 2, cz);
    wallPanel.lookAt(0, wallH / 2, 0);
    group.add(wallPanel);
  }

  // ── ceiling: dropped panels with fluorescent lights ──
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(12.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x7a7a75, roughness: 0.9, metalness: 0.05, side: THREE.BackSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wallH;
  group.add(ceiling);

  // fluorescent light strips (cross pattern)
  const lightStrips = [
    { pos: [0, wallH - 0.05, -3], size: [6, 0.05, 0.3] },
    { pos: [0, wallH - 0.05, 3], size: [6, 0.05, 0.3] },
    { pos: [-3, wallH - 0.05, 0], size: [0.3, 0.05, 6] },
    { pos: [3, wallH - 0.05, 0], size: [0.3, 0.05, 6] },
    { pos: [0, wallH - 0.05, 0], size: [8, 0.05, 0.3] },
    { pos: [0, wallH - 0.05, 0], size: [0.3, 0.05, 8] },
  ];
  lightStrips.forEach(ls => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(...ls.size), warmWhite);
    strip.position.set(...ls.pos);
    group.add(strip);
  });

  // ── tiered console desks (outer ring) ──
  const deskCount = 12;
  for (let i = 0; i < deskCount; i++) {
    const angle = (i / deskCount) * Math.PI * 2;
    const r = 9.5;
    const x = Math.sin(angle) * r;
    const z = -Math.cos(angle) * r;

    // desk body
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.8), olive);
    desk.position.set(x, 0.4, z);
    desk.lookAt(0, 0.4, 0);
    group.add(desk);

    // desk top surface
    const surface = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.7), cream);
    surface.position.set(x, 0.82, z);
    surface.lookAt(0, 0.82, 0);
    group.add(surface);

    // CRT monitor (boxy)
    const monR = r - 0.25;
    const mx = Math.sin(angle) * monR;
    const mz = -Math.cos(angle) * monR;
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), darkSteel);
    monitor.position.set(mx, 1.15, mz);
    monitor.lookAt(0, 1.15, 0);
    group.add(monitor);

    // CRT screen face
    const screenR = r - 0.51;
    const sx = Math.sin(angle) * screenR;
    const sz = -Math.cos(angle) * screenR;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.35), darkScreen);
    screen.position.set(sx, 1.17, sz);
    screen.lookAt(0, 1.17, 0);
    group.add(screen);

    // blinking indicator lights on desk front
    for (let j = 0; j < 4; j++) {
      const indicator = new THREE.Mesh(
        new THREE.CircleGeometry(0.025, 8),
        j === 0 ? redLight : (j === 1 ? crtAmber : crtGreen)
      );
      const ir = r + 0.01;
      const ix = Math.sin(angle) * ir;
      const iz = -Math.cos(angle) * ir;
      indicator.position.set(
        ix + Math.cos(angle) * (j - 1.5) * 0.15,
        0.65,
        iz + Math.sin(angle) * (j - 1.5) * 0.15
      );
      indicator.lookAt(
        ix + Math.cos(angle) * (j - 1.5) * 0.15 + Math.sin(angle),
        0.65,
        iz + Math.sin(angle) * (j - 1.5) * 0.15 - Math.cos(angle)
      );
      group.add(indicator);
    }
  }

  // ── large wall screens (big boards like Houston) ──
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const sr = wallR - 0.4;
    const sx = Math.sin(angle) * sr;
    const sz = -Math.cos(angle) * sr;

    // big screen backing
    const backing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.5, 0.1), darkSteel);
    backing.position.set(sx, 3.8, sz);
    backing.lookAt(0, 3.8, 0);
    group.add(backing);

    // screen face
    const sfr = sr - 0.06;
    const sfx = Math.sin(angle) * sfr;
    const sfz = -Math.cos(angle) * sfr;
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), darkScreen);
    screenFace.position.set(sfx, 3.8, sfz);
    screenFace.lookAt(0, 3.8, 0);
    group.add(screenFace);

    // green scan line effect (horizontal lines on big screen)
    for (let line = 0; line < 6; line++) {
      const lr = sr - 0.07;
      const lx = Math.sin(angle) * lr;
      const lz = -Math.cos(angle) * lr;
      const scanLine = new THREE.Mesh(
        new THREE.PlaneGeometry(3.8, 0.02),
        line % 2 === 0 ? crtDim : crtGreen
      );
      scanLine.position.set(lx, 2.9 + line * 0.35, lz);
      scanLine.lookAt(0, 2.9 + line * 0.35, 0);
      group.add(scanLine);
    }

    // "STATUS" label strip above screen
    const labelR = sr - 0.07;
    const lbx = Math.sin(angle) * labelR;
    const lbz = -Math.cos(angle) * labelR;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.15), crtAmber);
    label.position.set(lbx, 5.15, lbz);
    label.lookAt(0, 5.15, 0);
    group.add(label);
  }

  // ── equipment racks (tall cabinets between wall screens) ──
  for (let i = 0; i < 5; i++) {
    const angle = ((i + 0.5) / 5) * Math.PI * 2;
    const rr = wallR - 0.5;
    const rx = Math.sin(angle) * rr;
    const rz = -Math.cos(angle) * rr;

    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.0, 5.0, 0.6), darkSteel);
    rack.position.set(rx, 2.5, rz);
    rack.lookAt(0, 2.5, 0);
    group.add(rack);

    // blinking LEDs on rack
    for (let j = 0; j < 10; j++) {
      const ledR = rr - 0.31;
      const lx = Math.sin(angle) * ledR;
      const lz = -Math.cos(angle) * ledR;
      const led = new THREE.Mesh(
        new THREE.CircleGeometry(0.02, 6),
        j % 3 === 0 ? redLight : (j % 3 === 1 ? crtAmber : crtGreen)
      );
      led.position.set(
        lx + Math.cos(angle) * ((j % 2) - 0.5) * 0.3,
        0.8 + j * 0.45,
        lz + Math.sin(angle) * ((j % 2) - 0.5) * 0.3
      );
      led.lookAt(0, 0.8 + j * 0.45, 0);
      group.add(led);
    }
  }

  // ── lighting: bright fluorescent bunker ──
  // strong central overhead
  const mainLight = new THREE.PointLight(0xfff5e0, 2.0, 30);
  mainLight.position.set(0, 5.8, 0);
  group.add(mainLight);

  // ring of overhead lights around perimeter (like fluorescent banks)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const overheadLight = new THREE.PointLight(0xfff0d0, 1.2, 18);
    overheadLight.position.set(Math.sin(angle) * 7, 5.5, -Math.cos(angle) * 7);
    group.add(overheadLight);
  }

  // fill at desk level so consoles are visible
  const deskFill = new THREE.PointLight(0xffe8c0, 0.8, 20);
  deskFill.position.set(0, 2.0, 0);
  group.add(deskFill);

  // subtle green uplight from CRT screens
  const greenUp = new THREE.PointLight(0x33ff66, 0.3, 12);
  greenUp.position.set(0, 1.5, 0);
  group.add(greenUp);
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

// ── HUD ──────────────────────────────────────────────────────────────
function updateHud() {
  const el = document.getElementById('hud');
  if (!el) return;
  const vrSupported = navigator.xr !== undefined;
  el.innerHTML = `
    <strong style="color:#80ffea">WebXR Incident War Room</strong><br>
    VR: ${vrSupported ? '✓ Supported' : '✗ Not available'}<br><br>
    <em>Desktop:</em> Click a cyan ring to teleport<br>
    Click empty space to lock mouse → look around<br>
    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrow keys to walk<br>
    Press <kbd>Esc</kbd> to unlock mouse<br><br>
    <em>Quest 2:</em> Click "Enter VR" button<br>
    Trigger on cyan rings to teleport<br>
    Push thumbstick to walk freely
  `;
}

// ── animate ──────────────────────────────────────────────────────────
function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  // manual delta time — avoids Three.js Clock getElapsedTime/getDelta conflict
  const now = performance.now();
  const dt  = (now - prevTime) / 1000;
  prevTime  = now;
  elapsedTime += dt;

  // pulse teleport markers
  teleportMarkers.forEach((m, i) => {
    if (m === hoveredRing) {
      m.material.opacity = 0.35;
      if (m.userData.ringOverlay) m.userData.ringOverlay.material.opacity = 0.9;
    } else {
      m.material.opacity = 0.08 + 0.08 * Math.sin(elapsedTime * 2 + i);
      if (m.userData.ringOverlay) {
        m.userData.ringOverlay.material.opacity = 0.35 + 0.2 * Math.sin(elapsedTime * 2 + i);
      }
    }
  });

  // VR thumbstick locomotion
  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        const x = Math.abs(axes[2]) > 0.15 ? axes[2] : 0;
        const z = Math.abs(axes[3]) > 0.15 ? axes[3] : 0;
        if (x !== 0 || z !== 0) {
          const headQuat = camera.getWorldQuaternion(new THREE.Quaternion());
          _moveVec.set(x, 0, z).applyQuaternion(headQuat);
          _moveVec.y = 0;
          _moveVec.normalize().multiplyScalar(MOVE_SPEED * dt * Math.max(Math.abs(x), Math.abs(z)));
          cameraRig.position.add(_moveVec);
          break;
        }
      }
    }
  }

  // desktop look (requires pointer lock)
  if (!renderer.xr.isPresenting && isPointerLocked) {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // desktop WASD / arrow keys (always active, no pointer lock needed)
  if (!renderer.xr.isPresenting) {
    let mx = 0, mz = 0;
    if (keysDown['KeyW'] || keysDown['ArrowUp'])    mz -= 1;
    if (keysDown['KeyS'] || keysDown['ArrowDown'])   mz += 1;
    if (keysDown['KeyA'] || keysDown['ArrowLeft'])   mx -= 1;
    if (keysDown['KeyD'] || keysDown['ArrowRight'])  mx += 1;
    if (mx !== 0 || mz !== 0) {
      _moveVec.set(mx, 0, mz).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      _moveVec.multiplyScalar(MOVE_SPEED * dt);
      cameraRig.position.add(_moveVec);
    }
  }

  renderer.render(scene, camera);
}
