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
  scene.background = new THREE.Color(0x06101c);
  scene.fog = new THREE.Fog(0x06101c, 18, 35);

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

  // floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 64),
    new THREE.MeshStandardMaterial({ color: 0x0e1a2a, roughness: 0.9, metalness: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  group.add(floor);

  const floorRing = new THREE.Mesh(new THREE.RingGeometry(5.5, 5.6, 64), glowDim);
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.005;
  group.add(floorRing);

  const centerDisc = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 6), glowDim);
  centerDisc.rotation.x = -Math.PI / 2;
  centerDisc.position.y = 0.005;
  group.add(centerDisc);

  // circular wall
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 8, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x141e30, roughness: 0.85, metalness: 0.2, side: THREE.BackSide })
  );
  wall.position.y = 4;
  group.add(wall);

  // ceiling
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshStandardMaterial({ color: 0x0c1520, roughness: 0.9, metalness: 0.1, side: THREE.BackSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 8;
  group.add(ceiling);

  const ceilRing = new THREE.Mesh(new THREE.RingGeometry(3, 3.15, 48), glowCyan);
  ceilRing.rotation.x = Math.PI / 2;
  ceilRing.position.y = 7.98;
  group.add(ceilRing);

  // wall accent strips
  [1.0, 4.0, 7.0].forEach(h => {
    const strip = new THREE.Mesh(
      new THREE.CylinderGeometry(10.95, 10.95, 0.04, 48, 1, true),
      glowDim
    );
    strip.position.y = h;
    group.add(strip);
  });

  // console banks
  const consoleCount = 12;
  for (let i = 0; i < consoleCount; i++) {
    const angle = (i / consoleCount) * Math.PI * 2;
    const r = 9.5;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.6), medMetal);
    consoleBody.position.set(x, 0.6, z);
    consoleBody.lookAt(0, 0.6, 0);
    group.add(consoleBody);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.5), lightTrim);
    top.position.set(x, 1.22, z);
    top.lookAt(0, 1.22, 0);
    top.rotation.x -= 0.3;
    group.add(top);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), screenGlow);
    const sx = Math.sin(angle) * (r - 0.31);
    const sz = Math.cos(angle) * (r - 0.31);
    screen.position.set(sx, 2.0, sz);
    screen.lookAt(0, 2.0, 0);
    group.add(screen);

    const border = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), glowDim);
    const bx = Math.sin(angle) * (r - 0.32);
    const bz = Math.cos(angle) * (r - 0.32);
    border.position.set(bx, 2.0, bz);
    border.lookAt(0, 2.0, 0);
    group.add(border);

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

  // tall equipment racks
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 10.2;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.4), darkMetal);
    rack.position.set(x, 2.5, z);
    rack.lookAt(0, 2.5, 0);
    group.add(rack);

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

  // overhead lights
  const light1 = new THREE.PointLight(0x80ffea, 0.3, 15);
  light1.position.set(0, 7, 0);
  group.add(light1);
  const light2 = new THREE.PointLight(0x3060a0, 0.4, 20);
  light2.position.set(0, 5, 0);
  group.add(light2);
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
