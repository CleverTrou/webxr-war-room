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
  const concrete     = new THREE.MeshStandardMaterial({ color: 0x908a82, roughness: 0.95, metalness: 0.05 });
  const concreteLt   = new THREE.MeshStandardMaterial({ color: 0xa09a92, roughness: 0.95, metalness: 0.05 });
  const steel        = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.4, metalness: 0.7 });
  const darkSteel    = new THREE.MeshStandardMaterial({ color: 0x50555a, roughness: 0.5, metalness: 0.6 });
  const olive        = new THREE.MeshStandardMaterial({ color: 0x6a7560, roughness: 0.8, metalness: 0.2 });
  const cream        = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.85, metalness: 0.05 });
  const beige        = new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.8, metalness: 0.1 });
  const black        = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
  const brown        = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85, metalness: 0.1 });
  const crtGreen     = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
  const crtDim       = new THREE.MeshBasicMaterial({ color: 0x229944 });
  const crtAmber     = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const redLight     = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  const warmWhite    = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  const darkScreen   = new THREE.MeshBasicMaterial({ color: 0x0c3010 });
  const screenGlow   = new THREE.MeshBasicMaterial({ color: 0x1a5a20 });
  const blueGrey     = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: 0.7, metalness: 0.3 });
  const yellow       = new THREE.MeshStandardMaterial({ color: 0xddcc44, roughness: 0.7, metalness: 0.1 });

  // helper: add a mesh to the group
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  // ══════════════════════════════════════════════════════════════════
  // FLOOR
  // ══════════════════════════════════════════════════════════════════
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x686862, roughness: 0.9, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  group.add(floor);

  // tile grid lines
  for (let i = -12; i <= 12; i += 1.5) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(28, 0.005, 0.02), darkSteel);
    h.position.set(0, 0.001, i);
    group.add(h);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 28), darkSteel);
    v.position.set(i, 0.001, 0);
    group.add(v);
  }

  // raised center platform
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.12, 8), steel);
  plat.position.y = 0.06;
  group.add(plat);

  // yellow/black hazard stripe ring around platform
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.005, 0.12),
      i % 2 === 0 ? yellow : black
    );
    stripe.position.set(Math.sin(a) * 2.0, 0.005, -Math.cos(a) * 2.0);
    stripe.rotation.y = a;
    group.add(stripe);
  }

  // ══════════════════════════════════════════════════════════════════
  // WALLS — 12-sided bunker
  // ══════════════════════════════════════════════════════════════════
  const wallR = 12, wallH = 6, wallSides = 12;
  for (let i = 0; i < wallSides; i++) {
    const a1 = (i / wallSides) * Math.PI * 2;
    const a2 = ((i + 1) / wallSides) * Math.PI * 2;
    const x1 = Math.sin(a1) * wallR, z1 = -Math.cos(a1) * wallR;
    const x2 = Math.sin(a2) * wallR, z2 = -Math.cos(a2) * wallR;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const segW = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(segW, wallH, 0.3), concrete);
    panel.position.set(cx, wallH / 2, cz);
    panel.lookAt(0, wallH / 2, 0);
    group.add(panel);

    // horizontal concrete trim strips at 1/3 and 2/3 height
    for (const ht of [2.0, 4.0]) {
      const faceMid = (wallR - 0.16);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(segW - 0.1, 0.08, 0.02), concreteLt);
      const tx = (x1 + x2) / 2 * (faceMid / wallR);
      const tz = (z1 + z2) / 2 * (faceMid / wallR);
      trim.position.set(tx, ht, tz);
      trim.lookAt(0, ht, 0);
      group.add(trim);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // CEILING with dropped panel grid and fluorescent fixtures
  // ══════════════════════════════════════════════════════════════════
  const ceil = new THREE.Mesh(
    new THREE.CircleGeometry(12.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x908880, roughness: 0.9, metalness: 0.05, side: THREE.BackSide })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = wallH;
  group.add(ceil);

  // ceiling grid (T-bar)
  for (let i = -10; i <= 10; i += 2.5) {
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, 0.03), steel);
    bar1.position.set(0, wallH - 0.03, i);
    group.add(bar1);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 24), steel);
    bar2.position.set(i, wallH - 0.03, 0);
    group.add(bar2);
  }

  // fluorescent light fixtures (rectangular boxes with glowing face)
  const fixturePositions = [
    [0, 0], [-4, -4], [4, -4], [-4, 4], [4, 4],
    [-7, 0], [7, 0], [0, -7], [0, 7]
  ];
  fixturePositions.forEach(([fx, fz]) => {
    // fixture housing
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), steel);
    housing.position.set(fx, wallH - 0.08, fz);
    group.add(housing);
    // glowing tube
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.25), warmWhite);
    tube.position.set(fx, wallH - 0.13, fz);
    group.add(tube);
  });

  // ══════════════════════════════════════════════════════════════════
  // CONSOLE WORKSTATIONS (12 around perimeter)
  // ══════════════════════════════════════════════════════════════════
  const deskCount = 12;
  for (let i = 0; i < deskCount; i++) {
    const angle = (i / deskCount) * Math.PI * 2;
    const r = 9.2;
    const x = Math.sin(angle) * r;
    const z = -Math.cos(angle) * r;
    const fwd = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)); // toward center
    const right = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

    // desk body (L-shaped console)
    const deskMain = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.9), olive);
    deskMain.position.set(x, 0.375, z);
    deskMain.lookAt(0, 0.375, 0);
    group.add(deskMain);

    // desk top
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 0.85), cream);
    top.position.set(x, 0.77, z);
    top.lookAt(0, 0.77, 0);
    group.add(top);

    // desk front panel (knee panel) darker
    const kneePanelR = r + 0.44;
    const kx = Math.sin(angle) * kneePanelR;
    const kz = -Math.cos(angle) * kneePanelR;
    const kneePanel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.04), darkSteel);
    kneePanel.position.set(kx, 0.35, kz);
    kneePanel.lookAt(0, 0.35, 0);
    group.add(kneePanel);

    // CRT monitor — chunky bezel
    const monR = r - 0.15;
    const mx = Math.sin(angle) * monR;
    const mz = -Math.cos(angle) * monR;

    // monitor body (deep CRT box)
    const monBody = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.45), beige);
    monBody.position.set(mx, 1.0, mz);
    monBody.lookAt(0, 1.0, 0);
    group.add(monBody);

    // screen bezel (dark frame)
    const bezelR = monR - 0.22;
    const bx = Math.sin(angle) * bezelR;
    const bz = -Math.cos(angle) * bezelR;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.03), darkSteel);
    bezel.position.set(bx, 1.0, bz);
    bezel.lookAt(0, 1.0, 0);
    group.add(bezel);

    // screen face (dark green CRT)
    const screenR = monR - 0.24;
    const sx = Math.sin(angle) * screenR;
    const sz = -Math.cos(angle) * screenR;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), darkScreen);
    screen.position.set(sx, 1.0, sz);
    screen.lookAt(0, 1.0, 0);
    group.add(screen);

    // CRT scan lines on screen
    for (let sl = 0; sl < 4; sl++) {
      const slR = monR - 0.245;
      const slx = Math.sin(angle) * slR;
      const slz = -Math.cos(angle) * slR;
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.01), crtDim);
      scan.position.set(slx, 0.88 + sl * 0.08, slz);
      scan.lookAt(0, 0.88 + sl * 0.08, 0);
      group.add(scan);
    }

    // simulated text data lines on screen (bright green "readout")
    const textWidths = [0.26, 0.18, 0.30, 0.14, 0.22, 0.28];
    for (let tl = 0; tl < 6; tl++) {
      const tlR = monR - 0.246;
      const tlx = Math.sin(angle) * tlR;
      const tlz = -Math.cos(angle) * tlR;
      const w = textWidths[(i + tl) % textWidths.length];
      const textLine = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.008), crtGreen);
      // offset left to simulate left-aligned text
      const leftOff = -(0.15 - w / 2);
      textLine.position.set(
        tlx + Math.cos(angle) * leftOff,
        0.87 + tl * 0.042,
        tlz + Math.sin(angle) * leftOff
      );
      textLine.lookAt(
        Math.cos(angle) * leftOff,
        0.87 + tl * 0.042,
        Math.sin(angle) * leftOff
      );
      group.add(textLine);
    }

    // keyboard on desk
    const kbR = r + 0.1;
    const kbx = Math.sin(angle) * kbR;
    const kbz = -Math.cos(angle) * kbR;
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.15), beige);
    keyboard.position.set(kbx, 0.8, kbz);
    keyboard.lookAt(0, 0.8, 0);
    group.add(keyboard);
    // key area (darker inset)
    const keyR = kbR + 0.005;
    const keyx = Math.sin(angle) * keyR;
    const keyz = -Math.cos(angle) * keyR;
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.12), darkSteel);
    keys.position.set(keyx, 0.815, keyz);
    keys.rotation.x = -Math.PI / 2;
    group.add(keys);

    // desk phone (to the right of monitor)
    const phR = r - 0.05;
    const phx = Math.sin(angle) * phR + Math.cos(angle) * 0.7;
    const phz = -Math.cos(angle) * phR + Math.sin(angle) * 0.7;
    const phoneBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.22), darkSteel);
    phoneBase.position.set(phx, 0.81, phz);
    group.add(phoneBase);
    const handset = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.2), black);
    handset.position.set(phx, 0.86, phz);
    group.add(handset);

    // coffee mug (to the left)
    const mugR = r + 0.15;
    const mugx = Math.sin(angle) * mugR - Math.cos(angle) * 0.65;
    const mugz = -Math.cos(angle) * mugR - Math.sin(angle) * 0.65;
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8), cream);
    mug.position.set(mugx, 0.835, mugz);
    group.add(mug);

    // chair
    const chairR = r + 0.9;
    const chx = Math.sin(angle) * chairR;
    const chz = -Math.cos(angle) * chairR;
    // seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.4), brown);
    seat.position.set(chx, 0.45, chz);
    seat.lookAt(0, 0.45, 0);
    group.add(seat);
    // backrest
    const backR = chairR + 0.18;
    const bkx = Math.sin(angle) * backR;
    const bkz = -Math.cos(angle) * backR;
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.35, 0.04), brown);
    backrest.position.set(bkx, 0.7, bkz);
    backrest.lookAt(0, 0.7, 0);
    group.add(backrest);
    // chair pedestal
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), darkSteel);
    pedestal.position.set(chx, 0.22, chz);
    group.add(pedestal);
    // chair base star
    const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 5), darkSteel);
    cbase.position.set(chx, 0.02, chz);
    group.add(cbase);

    // indicator light panel on desk front
    for (let j = 0; j < 5; j++) {
      const indR = r + 0.46;
      const ix = Math.sin(angle) * indR + Math.cos(angle) * (j - 2) * 0.12;
      const iz = -Math.cos(angle) * indR + Math.sin(angle) * (j - 2) * 0.12;
      const mat = j === 0 ? redLight : (j < 3 ? crtAmber : crtGreen);
      const ind = new THREE.Mesh(new THREE.CircleGeometry(0.02, 8), mat);
      ind.position.set(ix, 0.55, iz);
      ind.lookAt(ix + Math.sin(angle), 0.55, iz - Math.cos(angle));
      group.add(ind);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // BIG WALL SCREENS (5 — matching panel positions)
  // ══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const sr = wallR - 0.3;
    const sx = Math.sin(angle) * sr;
    const sz = -Math.cos(angle) * sr;

    // screen frame (thick steel border)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 0.15), darkSteel);
    frame.position.set(sx, 3.8, sz);
    frame.lookAt(0, 3.8, 0);
    group.add(frame);

    // inner screen bezel
    const ibR = sr - 0.08;
    const ibx = Math.sin(angle) * ibR;
    const ibz = -Math.cos(angle) * ibR;
    const innerFrame = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 0.05), steel);
    innerFrame.position.set(ibx, 3.8, ibz);
    innerFrame.lookAt(0, 3.8, 0);
    group.add(innerFrame);

    // screen face
    const sfR = sr - 0.1;
    const sfx = Math.sin(angle) * sfR;
    const sfz = -Math.cos(angle) * sfR;
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), screenGlow);
    screenFace.position.set(sfx, 3.8, sfz);
    screenFace.lookAt(0, 3.8, 0);
    group.add(screenFace);

    // CRT phosphor grid lines (horizontal)
    for (let line = 0; line < 8; line++) {
      const lr = sr - 0.11;
      const lx = Math.sin(angle) * lr;
      const lz = -Math.cos(angle) * lr;
      const scan = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.015),
        line % 3 === 0 ? crtGreen : crtDim
      );
      scan.position.set(lx, 2.95 + line * 0.25, lz);
      scan.lookAt(0, 2.95 + line * 0.25, 0);
      group.add(scan);
    }

    // vertical grid lines
    for (let vl = 0; vl < 5; vl++) {
      const vlR = sr - 0.11;
      const vlx = Math.sin(angle) * vlR;
      const vlz = -Math.cos(angle) * vlR;
      const vline = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 1.8), crtDim);
      // offset along the wall face
      const off = (vl - 2) * 0.8;
      vline.position.set(
        vlx + Math.cos(angle) * off,
        3.8,
        vlz + Math.sin(angle) * off
      );
      vline.lookAt(
        Math.cos(angle) * off,
        3.8,
        Math.sin(angle) * off
      );
      group.add(vline);
    }

    // simulated data blocks on screen (text readout areas)
    const dataR = sr - 0.12;
    // left data column - text lines
    for (let dl = 0; dl < 6; dl++) {
      const dx = Math.sin(angle) * dataR;
      const dz = -Math.cos(angle) * dataR;
      const w = 0.8 + ((i + dl) % 3) * 0.3;
      const dline = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.04), crtGreen);
      const leftOff = -1.2;
      dline.position.set(
        dx + Math.cos(angle) * leftOff,
        3.2 + dl * 0.18,
        dz + Math.sin(angle) * leftOff
      );
      dline.lookAt(
        Math.cos(angle) * leftOff,
        3.2 + dl * 0.18,
        Math.sin(angle) * leftOff
      );
      group.add(dline);
    }
    // right side - bar chart simulation
    for (let bar = 0; bar < 5; bar++) {
      const bx = Math.sin(angle) * dataR;
      const bz = -Math.cos(angle) * dataR;
      const barH = 0.3 + ((i * 3 + bar * 7) % 5) * 0.2;
      const barMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, barH),
        bar === 2 ? crtAmber : crtGreen
      );
      const rightOff = 0.6 + bar * 0.22;
      barMesh.position.set(
        bx + Math.cos(angle) * rightOff,
        2.95 + barH / 2,
        bz + Math.sin(angle) * rightOff
      );
      barMesh.lookAt(
        Math.cos(angle) * rightOff,
        2.95 + barH / 2,
        Math.sin(angle) * rightOff
      );
      group.add(barMesh);
    }

    // amber status label above screen
    const labR = sr - 0.11;
    const labx = Math.sin(angle) * labR;
    const labz = -Math.cos(angle) * labR;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.12), crtAmber);
    label.position.set(labx, 5.15, labz);
    label.lookAt(0, 5.15, 0);
    group.add(label);

    // small red/green status dots flanking label
    for (const side of [-1, 1]) {
      const dotR = sr - 0.11;
      const dx = Math.sin(angle) * dotR + Math.cos(angle) * side * 1.2;
      const dz = -Math.cos(angle) * dotR + Math.sin(angle) * side * 1.2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), side < 0 ? redLight : crtGreen);
      dot.position.set(dx, 5.15, dz);
      dot.lookAt(0, 5.15, 0);
      group.add(dot);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // EQUIPMENT RACKS (between wall screens)
  // ══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 5; i++) {
    const angle = ((i + 0.5) / 5) * Math.PI * 2;
    const rr = wallR - 0.4;
    const rx = Math.sin(angle) * rr;
    const rz = -Math.cos(angle) * rr;

    // rack cabinet
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 0.7), darkSteel);
    rack.position.set(rx, 2.6, rz);
    rack.lookAt(0, 2.6, 0);
    group.add(rack);

    // rack face plate (slightly lighter)
    const fpR = rr - 0.36;
    const fpx = Math.sin(angle) * fpR;
    const fpz = -Math.cos(angle) * fpR;
    const faceplate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 4.8), blueGrey);
    faceplate.position.set(fpx, 2.6, fpz);
    faceplate.lookAt(0, 2.6, 0);
    group.add(faceplate);

    // rack unit dividers (horizontal lines)
    for (let ru = 0; ru < 12; ru++) {
      const ruR = rr - 0.37;
      const rux = Math.sin(angle) * ruR;
      const ruz = -Math.cos(angle) * ruR;
      const divider = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.01), steel);
      divider.position.set(rux, 0.5 + ru * 0.4, ruz);
      divider.lookAt(0, 0.5 + ru * 0.4, 0);
      group.add(divider);
    }

    // blinking LEDs (varied colors)
    for (let j = 0; j < 12; j++) {
      const ledR = rr - 0.38;
      const row = Math.floor(j / 3);
      const col = j % 3;
      const lx = Math.sin(angle) * ledR + Math.cos(angle) * (col - 1) * 0.2;
      const lz = -Math.cos(angle) * ledR + Math.sin(angle) * (col - 1) * 0.2;
      const mat = col === 0 ? redLight : (col === 1 ? crtAmber : crtGreen);
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.02, 6), mat);
      led.position.set(lx, 0.7 + row * 1.1, lz);
      led.lookAt(0, 0.7 + row * 1.1, 0);
      group.add(led);
    }

    // ventilation grille at top
    const ventR = rr - 0.37;
    const vx = Math.sin(angle) * ventR;
    const vz = -Math.cos(angle) * ventR;
    for (let vs = 0; vs < 4; vs++) {
      const vslot = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.02), black);
      vslot.position.set(vx, 4.8 + vs * 0.08, vz);
      vslot.lookAt(0, 4.8 + vs * 0.08, 0);
      group.add(vslot);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // CABLE TRAYS on ceiling
  // ══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(20, 0.04, 0.3), darkSteel);
    tray.position.set(0, wallH - 0.15, 0);
    tray.rotation.y = angle;
    group.add(tray);
    // cable bundles
    const cable = new THREE.Mesh(new THREE.BoxGeometry(18, 0.06, 0.12), black);
    cable.position.set(0, wallH - 0.2, 0);
    cable.rotation.y = angle;
    group.add(cable);
  }

  // ══════════════════════════════════════════════════════════════════
  // WALL DETAILS: pipes, conduit, fire extinguisher, signs
  // ══════════════════════════════════════════════════════════════════

  // vertical pipe runs (between every other wall segment)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 12;
    const pipeR = wallR - 0.2;
    const px = Math.sin(angle) * pipeR;
    const pz = -Math.cos(angle) * pipeR;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, wallH, 8), steel);
    pipe.position.set(px, wallH / 2, pz);
    group.add(pipe);
    // pipe brackets
    for (const bh of [1.5, 3.0, 4.5]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.08), steel);
      bracket.position.set(px, bh, pz);
      bracket.lookAt(0, bh, 0);
      group.add(bracket);
    }
  }

  // fire extinguisher (on one wall)
  {
    const fAngle = Math.PI * 0.35;
    const fR = wallR - 0.25;
    const fx = Math.sin(fAngle) * fR;
    const fz = -Math.cos(fAngle) * fR;
    const extBody = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6, metalness: 0.3 }));
    extBody.position.set(fx, 1.2, fz);
    group.add(extBody);
    const extTop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.08, 8), darkSteel);
    extTop.position.set(fx, 1.4, fz);
    group.add(extTop);
  }

  // wall clock
  {
    const cAngle = Math.PI * 1.15;
    const cR = wallR - 0.2;
    const cx = Math.sin(cAngle) * cR;
    const cz = -Math.cos(cAngle) * cR;
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), cream);
    clockFace.position.set(cx, 4.8, cz);
    clockFace.lookAt(0, 4.8, 0);
    group.add(clockFace);
    const clockRim = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.27, 24), darkSteel);
    clockRim.position.set(cx * 0.998, 4.8, cz * 0.998);
    clockRim.lookAt(0, 4.8, 0);
    group.add(clockRim);
  }

  // ══════════════════════════════════════════════════════════════════
  // CENTER AREA: commander's podium
  // ══════════════════════════════════════════════════════════════════
  // podium desk
  const podium = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.5), olive);
  podium.position.set(0, 0.57, 0);
  group.add(podium);
  const podiumTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.48), cream);
  podiumTop.position.set(0, 1.025, 0);
  group.add(podiumTop);

  // podium phone
  const pPhone = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.2), darkSteel);
  pPhone.position.set(0.4, 1.07, 0);
  group.add(pPhone);
  const pHandset = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.18), 
    new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.7, metalness: 0.2 })); // red phone!
  pHandset.position.set(0.4, 1.1, 0);
  group.add(pHandset);

  // ══════════════════════════════════════════════════════════════════
  // RAILING around center area
  // ══════════════════════════════════════════════════════════════════
  const railR = 3.0;
  const railPosts = 12;
  for (let i = 0; i < railPosts; i++) {
    const a = (i / railPosts) * Math.PI * 2;
    const rpx = Math.sin(a) * railR;
    const rpz = -Math.cos(a) * railR;
    // post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), steel);
    post.position.set(rpx, 0.45, rpz);
    group.add(post);
  }
  // top rail (ring)
  const topRail = new THREE.Mesh(new THREE.TorusGeometry(railR, 0.02, 6, 48), steel);
  topRail.rotation.x = Math.PI / 2;
  topRail.position.y = 0.9;
  group.add(topRail);
  // mid rail
  const midRail = new THREE.Mesh(new THREE.TorusGeometry(railR, 0.015, 6, 48), steel);
  midRail.rotation.x = Math.PI / 2;
  midRail.position.y = 0.5;
  group.add(midRail);

  // ══════════════════════════════════════════════════════════════════
  // LIGHTING
  // ══════════════════════════════════════════════════════════════════
  const mainLight = new THREE.PointLight(0xfff5e0, 2.0, 30);
  mainLight.position.set(0, 5.5, 0);
  group.add(mainLight);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const oLight = new THREE.PointLight(0xfff0d0, 1.0, 16);
    oLight.position.set(Math.sin(a) * 7, 5.5, -Math.cos(a) * 7);
    group.add(oLight);
  }

  const deskFill = new THREE.PointLight(0xffe8c0, 0.8, 20);
  deskFill.position.set(0, 2.0, 0);
  group.add(deskFill);

  const greenUp = new THREE.PointLight(0x33ff66, 0.2, 12);
  greenUp.position.set(0, 1.2, 0);
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
