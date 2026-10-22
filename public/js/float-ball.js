/**
 * Floating soccer ball overlay for 首页 / 赛程 / 预测.
 * Ball-local canvas + virtual full-screen physics.
 * 1.9.123: restore pre-122 visual size; keep drag isolation; cut GPU cost.
 * No rubber V lines. Ghost goal only while sling charging / flight.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ACTIVE_ROUTES = new Set(['home', 'schedule', 'predict']);
const GLB_URL = 'demos/assets/soccer_ball.glb?v=1.9.147';

const STATE = { REST: 0, DRAG: 1, SETTLE: 2, SLING: 3, FLY: 4, CELEBRATE: 5 };

let root, canvas, hitEl, slingZoneEl, ghostEl, goalFrame;
let renderer, scene, camera, ball, shadow, placeholder, placeholderMat;
let glbReady = false;
let glbFailed = false;
let glbLoadTimer = 0;
let W = 1, H = 1, worldHalfW = 1, worldHalfH = 1;
let localCss = 168;
let hitCss = 64;
let cachedTabH = 54;
let state = STATE.REST;
let active = false;
let started = false;
let raf = 0;
let lastT = 0;
let dragLite = false; // lighter effects while dragging
let pendingPointer = null; // rAF-coalesce pointer moves
let moveRaf = 0;
let idleFrames = 0;

const BALL_R = 0.44;
const ORTHO_HALF = BALL_R * 2.75; // 1.9.123: restore pre-122 frustum (visual size)
let ballPos = new THREE.Vector3();
let vel = new THREE.Vector3();
let targetPos = new THREE.Vector3();
let dragOffset = new THREE.Vector3();
let slingAnchor = new THREE.Vector3();

let pointerId = null;
let pressStart = 0;
let pressStartY = 0;
let pressMoved = false;
let longArmed = false;
let longTimer = 0;
let lastPointer = { x: 0, y: 0 };
let lastMoveT = 0;
let dragVelHist = [];
let celebrateT = 0;
let fromSling = false;

const LONG_MS = 280;
const TAP_MAX_MOVE = 12;
const SLING_ZONE_FRAC = 0.14;
const SLING_PULL_PX = 52;
const SLING_PULL_PX_EDGE = 20;
const EDGE_DAMP = 0.82;
const AIR_DAMP = 0.988;
const SOFT_STOP_DAMP = 0.88;
const MAX_PULL = 3.2;
const SHOT_SCALE = 9.5;
const DRAG_MAX_SPEED = MAX_PULL * SHOT_SCALE * 0.42;
const DRAG_MIN_SPEED = 0.55;
const DRAG_VEL_SAMPLES = 6;
const DRAG_VEL_WINDOW_MS = 90;

let particles, pPos, pCol, pVel, pGeo, pMat;
const MAX_P = 12;
let lastGhostShow = null;

function setBusy(v) {
  try { window.__fbBusy = !!v; } catch (_) {}
}

function setTabPress(on) {
  const tb = document.getElementById('tabbar');
  if (tb) tb.classList.toggle('fb-tab-press', !!on);
}

function refreshTabHeight() {
  const tb = document.getElementById('tabbar');
  if (tb && !tb.classList.contains('hidden')) {
    cachedTabH = Math.max(48, tb.getBoundingClientRect().height);
    return cachedTabH;
  }
  try {
    const cs = getComputedStyle(document.documentElement);
    const th = parseFloat(cs.getPropertyValue('--tab-h')) || 54;
    const sb = parseFloat(cs.getPropertyValue('--safe-b')) || 0;
    cachedTabH = th + (Number.isFinite(sb) ? sb : 0);
  } catch (_) {
    cachedTabH = 54;
  }
  return cachedTabH;
}

function tabbarHeight() {
  // Hot path (drag/tick): never force layout — use cached height from resize/show
  return cachedTabH || 54;
}

function tabFloorScreenY(extraPad = 14) {
  const r = Math.max(22, ballScreenR());
  return H - tabbarHeight() - r - extraPad;
}

function restScreenY() {
  return tabFloorScreenY(16);
}

function restWorld() {
  return screenToWorld(W * 0.78, restScreenY());
}

function minBallWorldY(allowSlingDip) {
  const pad = allowSlingDip ? 6 : 16;
  return screenToWorld(0, tabFloorScreenY(pad)).y;
}

function useCssFallbackBall(reason) {
  if (glbFailed) return;
  glbFailed = true;
  glbReady = false;
  clearTimeout(glbLoadTimer);
  glbLoadTimer = 0;
  if (placeholder && ball) {
    ball.remove(placeholder);
    placeholder.geometry.dispose();
    placeholderMat.dispose();
    placeholder = null;
  }
  hide();
  try { delete window.JCFloatBall; } catch (_) { window.JCFloatBall = undefined; }
  try {
    if (window.JCFloatBallFallback) window.JCFloatBallFallback.mount();
    const hash = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0].split('/')[0];
    if (window.JCFloatBall && window.JCFloatBall.syncRoute) {
      window.JCFloatBall.syncRoute(hash || 'home');
    }
  } catch (_) {}
  try { console.warn('[float-ball] using CSS fallback (' + (reason || 'unknown') + ')'); } catch (_) {}
}

function ensureDom() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'float-ball-root';
  root.className = 'float-ball-root hidden';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="fb-ghost-goal" id="fbGhostGoal" aria-hidden="true">
      <div class="fb-goal-label">GOAL</div>
      <div class="fb-goal-frame" id="fbGoalFrame"></div>
    </div>
    <div class="fb-sling-zone" id="fbSlingZone" aria-hidden="true"></div>
    <canvas id="fbCanvas" class="fb-canvas"></canvas>
    <div class="fb-hit" id="fbHit" role="button" aria-label="足球"></div>
  `;
  document.body.appendChild(root);
  canvas = root.querySelector('#fbCanvas');
  hitEl = root.querySelector('#fbHit');
  slingZoneEl = root.querySelector('#fbSlingZone');
  ghostEl = root.querySelector('#fbGhostGoal');
  goalFrame = root.querySelector('#fbGoalFrame');
}

function updateGhostGoal() {
  if (!ghostEl) return;
  const show = state === STATE.SLING || (state === STATE.FLY && fromSling) || state === STATE.CELEBRATE;
  ghostEl.classList.toggle('on', show);
}

function updateSlingZone() {
  if (!slingZoneEl) return;
  const on = state === STATE.SLING;
  slingZoneEl.classList.toggle('active', on);
  setTabPress(on);
}

function softToast(msg) {
  try {
    if (typeof window.toast === 'function') { window.toast(msg, 900); return; }
  } catch (_) {}
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(softToast._t);
  softToast._t = setTimeout(() => el.classList.add('hidden'), 900);
}

function pickDpr() {
  const dpr = window.devicePixelRatio || 1;
  // Same CSS size as pre-122; modest DPR only (do NOT inflate canvas to "sharpen")
  if (dpr >= 2.5) return Math.min(dpr, 2);
  if (dpr >= 1.75) return Math.min(dpr, 1.75);
  return Math.min(dpr, 1.5);
}

function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    // 1.9.123: NO desynchronized — it caused WebView compositor thrashing / blank home frames
    stencil: false, depth: true, preserveDrawingBuffer: false
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  try { renderer.setPixelRatio(pickDpr()); } catch (_) {}

  scene = new THREE.Scene();
  // Ortho camera follows ball — sharp local render
  camera = new THREE.OrthographicCamera(-ORTHO_HALF, ORTHO_HALF, ORTHO_HALF, -ORTHO_HALF, 0.1, 40);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xf5f7ff, 0x1a2a1a, 0.7));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(3.5, 6, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d4fc, 0.28);
  fill.position.set(-4, 2, 3);
  scene.add(fill);

  ball = new THREE.Group();
  scene.add(ball);
  placeholderMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0, roughness: 0.42, metalness: 0.04
  });
  placeholder = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), placeholderMat);
  placeholder.visible = false;
  ball.add(placeholder);

  const shadowGeo = new THREE.CircleGeometry(BALL_R * 1.15, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false
  });
  shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.z = -0.05;
  scene.add(shadow);

  pGeo = new THREE.BufferGeometry();
  pPos = new Float32Array(MAX_P * 3);
  pCol = new Float32Array(MAX_P * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pMat = new THREE.PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 1,
    depthWrite: false, sizeAttenuation: true
  });
  particles = new THREE.Points(pGeo, pMat);
  particles.visible = false;
  scene.add(particles);
  pVel = [];
  for (let i = 0; i < MAX_P; i++) pVel.push({ x: 0, y: 0, life: 0, life: 0 });

  clearTimeout(glbLoadTimer);
  glbLoadTimer = setTimeout(() => {
    if (!glbReady && !glbFailed) useCssFallbackBall('timeout');
  }, 12000);
  new GLTFLoader().load(GLB_URL, (gltf) => {
    clearTimeout(glbLoadTimer);
    glbLoadTimer = 0;
    const model = gltf.scene;
    fitBallModel(model);
    ball.remove(placeholder);
    placeholder.geometry.dispose();
    placeholderMat.dispose();
    placeholder = null;
    ball.add(model);
    glbReady = true;
  }, undefined, (err) => {
    clearTimeout(glbLoadTimer);
    glbLoadTimer = 0;
    try { console.warn('[float-ball] GLB load failed', err); } catch (_) {}
    useCssFallbackBall('load');
  });

  resizeLocalCanvas();
}

function fitBallModel(rootObj) {
  const box = new THREE.Box3().setFromObject(rootObj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  rootObj.scale.setScalar((BALL_R * 2) / maxDim);
  box.setFromObject(rootObj);
  rootObj.position.sub(box.getCenter(new THREE.Vector3()));
  rootObj.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      m.side = THREE.FrontSide;
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.05);
      if ('roughness' in m && m.roughness != null) m.roughness = Math.max(0.35, Math.min(0.7, m.roughness));
      if ('envMapIntensity' in m) m.envMapIntensity = 0.85;
      if (m.map) {
        m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 4);
        m.map.needsUpdate = true;
      }
      m.needsUpdate = true;
    }
  });
}

/** Virtual full-screen frustum for physics (not for rendering). */
function updatePhysicsFrustum() {
  const dist = 12;
  const vFov = (42 * Math.PI) / 180;
  worldHalfH = Math.tan(vFov / 2) * dist;
  worldHalfW = worldHalfH * (W / Math.max(1, H));
}

function resizeLocalCanvas() {
  if (!renderer || !canvas) return;
  // 1.9.123: restore ~3.4× / max 220 CSS — raise buffer via DPR only, never CSS diameter
  const visualR = Math.max(28, Math.min(48, ballScreenR()));
  localCss = Math.round(Math.min(220, Math.max(150, visualR * 3.4)));
  canvas.style.width = localCss + 'px';
  canvas.style.height = localCss + 'px';
  renderer.setPixelRatio(pickDpr());
  renderer.setSize(localCss, localCss, false);
  camera.left = -ORTHO_HALF;
  camera.right = ORTHO_HALF;
  camera.top = ORTHO_HALF;
  camera.bottom = -ORTHO_HALF;
  camera.updateProjectionMatrix();
  syncHitSize(true);
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  refreshTabHeight();
  updatePhysicsFrustum();
  resizeLocalCanvas();
  if (state === STATE.REST && active) {
    ballPos.copy(restWorld());
    targetPos.copy(ballPos);
  }
  syncCanvasAndHit();
}

function screenToWorld(sx, sy) {
  const ndcX = (sx / W) * 2 - 1;
  const ndcY = -(sy / H) * 2 + 1;
  return new THREE.Vector3(ndcX * worldHalfW, ndcY * worldHalfH, 0);
}

function worldToScreen(v) {
  return {
    x: ((v.x / worldHalfW) + 1) * 0.5 * W,
    y: ((-v.y / worldHalfH) + 1) * 0.5 * H,
  };
}

function ballScreenR() {
  if (!worldHalfW) return 36;
  return (BALL_R / worldHalfW) * (W / 2);
}

function syncHitSize(force) {
  if (!hitEl) return;
  const r = Math.max(40, Math.round(ballScreenR() * 2.35));
  if (!force && r === hitCss) return;
  hitCss = r;
  // Layout write ONLY on resize / show — never every drag frame
  hitEl.style.width = r + 'px';
  hitEl.style.height = r + 'px';
}

function syncCanvasAndHit() {
  if (!canvas || !hitEl) return;
  const s = worldToScreen(ballPos);
  const half = localCss / 2;
  const hx = hitCss / 2;
  // Transform-only — compositor layer, no reflow of home content
  canvas.style.transform = `translate3d(${(s.x - half).toFixed(2)}px, ${(s.y - half).toFixed(2)}px, 0)`;
  hitEl.style.transform = `translate3d(${(s.x - hx).toFixed(2)}px, ${(s.y - hx).toFixed(2)}px, 0)`;
}

function syncLocalCamera() {
  // Ball rendered at origin of ortho view; we move camera with ballPos via group offset:
  // Keep ball at world ballPos; camera looks at ballPos
  camera.position.set(ballPos.x, ballPos.y, 10);
  camera.lookAt(ballPos.x, ballPos.y, 0);
}

function hitTestBall(sx, sy) {
  const s = worldToScreen(ballPos);
  const dx = sx - s.x, dy = sy - s.y;
  const r = ballScreenR() * 2.35;
  return dx * dx + dy * dy <= r * r;
}

function inSlingZone(sy) {
  return sy >= H * (1 - SLING_ZONE_FRAC);
}
function ballInSlingZone() {
  return inSlingZone(worldToScreen(ballPos).y);
}
function slingChargeReady(sy) {
  if (!inSlingZone(sy) && !ballInSlingZone()) return false;
  const roomBelow = Math.max(0, H - pressStartY);
  const pull = sy - pressStartY;
  if (roomBelow < 14) return longArmed && pull >= 4;
  if (roomBelow < SLING_PULL_PX + 12) {
    const need = Math.min(SLING_PULL_PX_EDGE, Math.max(12, roomBelow * 0.45));
    return pull >= Math.min(need, roomBelow - 2);
  }
  return pull >= SLING_PULL_PX;
}

function getGoalRect() {
  const r = goalFrame.getBoundingClientRect();
  const post = 5, crossbar = 5;
  return {
    left: r.left + post,
    right: r.right - post,
    top: r.top + crossbar,
    bottom: r.bottom,
  };
}

function clearDragVelHist() { dragVelHist.length = 0; }
function pushDragVelSample(vx, vy, t) {
  dragVelHist.push({ vx, vy, t });
  while (dragVelHist.length > DRAG_VEL_SAMPLES) dragVelHist.shift();
}
function sampleDragFlick() {
  const now = performance.now();
  let samples = dragVelHist.filter((s) => now - s.t <= DRAG_VEL_WINDOW_MS);
  if (!samples.length) samples = dragVelHist.slice(-3);
  if (!samples.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0, wsum = 0;
  for (let i = 0; i < samples.length; i++) {
    const w = 1 + i * 0.35;
    sx += samples[i].vx * w;
    sy += samples[i].vy * w;
    wsum += w;
  }
  return { x: sx / wsum, y: sy / wsum };
}

function enterSlingIfNeeded() {
  if (state === STATE.SLING) return;
  state = STATE.SLING;
  fromSling = true;
  slingAnchor.copy(ballPos);
  slingAnchor.x = THREE.MathUtils.clamp(slingAnchor.x, -worldHalfW * 0.75, worldHalfW * 0.75);
  updateSlingZone();
  updateGhostGoal();
}

function beginSoftStop() {
  state = STATE.SETTLE;
  fromSling = false;
  setDragLite(false);
  if (vel.length() < 0.05) vel.set(0, 0, 0);
  updateSlingZone();
  updateGhostGoal();
  setBusy(false);
}

function onDown(e) {
  if (!active || pointerId !== null) return;
  const sx = e.clientX, sy = e.clientY;
  if (!hitTestBall(sx, sy)) return;

  if (state === STATE.FLY || state === STATE.SETTLE || state === STATE.CELEBRATE) {
    vel.set(0, 0, 0);
    particles.visible = false;
    slingZoneEl.classList.remove('active');
    setTabPress(false);
    fromSling = false;
  }

  pointerId = e.pointerId;
  setBusy(true);
  idleFrames = 0;
  try { hitEl.setPointerCapture(pointerId); } catch (_) {}
  pressStart = performance.now();
  pressStartY = sy;
  pressMoved = false;
  longArmed = false;
  lastPointer.x = sx; lastPointer.y = sy;
  lastMoveT = performance.now();
  clearDragVelHist();
  clearTimeout(longTimer);
  longTimer = setTimeout(() => {
    longArmed = true;
    if (pointerId !== null && state === STATE.DRAG && slingChargeReady(lastPointer.y)) {
      enterSlingIfNeeded();
    }
  }, LONG_MS);

  const pw = screenToWorld(sx, sy);
  dragOffset.copy(ballPos).sub(pw);
  vel.set(0, 0, 0);
  state = STATE.DRAG;
  fromSling = false;
  setDragLite(true);
  updateGhostGoal();
  e.preventDefault();
  e.stopPropagation();
}

function setDragLite(on) {
  dragLite = !!on;
  if (!shadow || !shadow.material) return;
  // Cheaper composite while dragging: softer shadow, no extra work on page
  shadow.material.opacity = on ? 0.1 : 0.2;
  if (root) root.classList.toggle('fb-dragging', on);
}

function applyPointerMove(sx, sy, now) {
  if (Math.hypot(sx - lastPointer.x, sy - lastPointer.y) > TAP_MAX_MOVE) pressMoved = true;
  const dtSec = Math.max(0.004, (now - lastMoveT) / 1000);
  if (state === STATE.DRAG || state === STATE.SLING) {
    const w0 = screenToWorld(lastPointer.x, lastPointer.y);
    const w1 = screenToWorld(sx, sy);
    pushDragVelSample((w1.x - w0.x) / dtSec, (w1.y - w0.y) / dtSec, now);
  }
  lastPointer.x = sx; lastPointer.y = sy;
  lastMoveT = now;

  const pw = screenToWorld(sx, sy);
  targetPos.copy(pw).add(dragOffset);
  const margin = BALL_R * 1.2;
  const charging = state === STATE.SLING || slingChargeReady(sy);
  targetPos.x = Math.max(-worldHalfW + margin, Math.min(worldHalfW - margin, targetPos.x));
  const minY = minBallWorldY(charging);
  targetPos.y = Math.max(minY, Math.min(worldHalfH - margin, targetPos.y));

  if (state === STATE.DRAG || state === STATE.SLING) {
    if (slingChargeReady(sy)) {
      enterSlingIfNeeded();
      const pull = targetPos.clone().sub(slingAnchor);
      if (pull.y > 0) pull.y *= 0.12;
      const len = pull.length();
      if (len > MAX_PULL) pull.multiplyScalar(MAX_PULL / len);
      targetPos.copy(slingAnchor).add(pull);
      if (targetPos.y > slingAnchor.y - 0.12) {
        targetPos.y = slingAnchor.y - 0.12 - Math.abs(pull.x) * 0.04;
      }
      targetPos.y = Math.max(minBallWorldY(true), targetPos.y);
    } else if (state === STATE.SLING) {
      state = STATE.DRAG;
      fromSling = false;
      slingZoneEl.classList.remove('active');
      setTabPress(false);
      updateGhostGoal();
    }
  }
}

function onMove(e) {
  if (e.pointerId !== pointerId) return;
  // Coalesce multi-fire pointermoves into one physics update per frame
  pendingPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (!moveRaf) {
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      if (!pendingPointer || pointerId === null) return;
      const p = pendingPointer;
      pendingPointer = null;
      applyPointerMove(p.x, p.y, p.t);
    });
  }
  e.preventDefault();
}

function onUp(e) {
  if (e.pointerId !== pointerId) return;
  clearTimeout(longTimer);
  try { hitEl.releasePointerCapture(pointerId); } catch (_) {}
  pointerId = null;
  if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
  if (pendingPointer) {
    applyPointerMove(pendingPointer.x, pendingPointer.y, pendingPointer.t);
    pendingPointer = null;
  }
  setDragLite(false);

  if (state === STATE.SLING) {
    const pull = ballPos.clone().sub(slingAnchor);
    const power = Math.min(pull.length(), MAX_PULL);
    setTabPress(false);
    if (power < 0.25) {
      slingZoneEl.classList.remove('active');
      beginSoftStop();
    } else {
      const dir = pull.clone().normalize().multiplyScalar(-1);
      if (dir.y < 0.2) dir.y = 0.2 + Math.abs(dir.x) * 0.3;
      dir.normalize();
      vel.copy(dir).multiplyScalar(power * SHOT_SCALE);
      slingZoneEl.classList.remove('active');
      fromSling = true;
      state = STATE.FLY;
      updateGhostGoal();
      setBusy(true);
    }
  } else if (state === STATE.DRAG) {
    if (!pressMoved) {
      beginSoftStop();
    } else {
      const flick = sampleDragFlick();
      let speed = Math.hypot(flick.x, flick.y);
      if (speed < DRAG_MIN_SPEED) {
        beginSoftStop();
      } else {
        if (speed > DRAG_MAX_SPEED) {
          const s = DRAG_MAX_SPEED / speed;
          flick.x *= s; flick.y *= s;
        }
        vel.set(flick.x, flick.y, 0);
        fromSling = false;
        state = STATE.FLY;
        updateGhostGoal();
        setBusy(true);
      }
    }
  } else {
    beginSoftStop();
  }
  e.preventDefault();
}

function onCancel(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  clearTimeout(longTimer);
  if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
  pendingPointer = null;
  setDragLite(false);
  slingZoneEl.classList.remove('active');
  setTabPress(false);
  beginSoftStop();
}

function triggerCelebrate(at) {
  state = STATE.CELEBRATE;
  celebrateT = 0;
  softToast('⚽');
  particles.visible = true;
  const colors = [[1, 0.85, 0.2], [1, 0.4, 0.2], [0.4, 1, 0.5], [1, 1, 1], [0.3, 0.8, 1]];
  for (let i = 0; i < MAX_P; i++) {
    pPos[i * 3] = at.x; pPos[i * 3 + 1] = at.y; pPos[i * 3 + 2] = 0.1;
    const c = colors[i % colors.length];
    pCol[i * 3] = c[0]; pCol[i * 3 + 1] = c[1]; pCol[i * 3 + 2] = c[2];
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    pVel[i].x = Math.cos(a) * sp;
    pVel[i].y = Math.sin(a) * sp + 1.2;
    pVel[i].life = 0.4 + Math.random() * 0.3;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
  vel.set(0, 0, 0);
  setTabPress(false);
  updateGhostGoal();
}

function checkGoal() {
  if (!fromSling || !goalFrame) return false;
  const s = worldToScreen(ballPos);
  const g = getGoalRect();
  const inside =
    s.x > g.left && s.x < g.right &&
    s.y > g.top && s.y < g.bottom;
  const approaching = vel.y > 0.35;
  if (inside && approaching) {
    triggerCelebrate(ballPos.clone());
    return true;
  }
  return false;
}

function showFollowSpin(dt) {
  const dx = targetPos.x - ballPos.x;
  const dy = targetPos.y - ballPos.y;
  ball.rotation.y += dx * 3.5 * dt * 60 * 0.02;
  ball.rotation.x -= dy * 3.5 * dt * 60 * 0.02;
}
function spinFromVel(dt) {
  ball.rotation.y += vel.x * 0.35 * dt * 60 * 0.02;
  ball.rotation.x -= vel.y * 0.35 * dt * 60 * 0.02;
}
function bounceEdges() {
  const m = BALL_R * 1.05;
  if (ballPos.x > worldHalfW - m) { ballPos.x = worldHalfW - m; vel.x = -Math.abs(vel.x) * EDGE_DAMP; }
  else if (ballPos.x < -worldHalfW + m) { ballPos.x = -worldHalfW + m; vel.x = Math.abs(vel.x) * EDGE_DAMP; }
  if (ballPos.y > worldHalfH - m) { ballPos.y = worldHalfH - m; vel.y = -Math.abs(vel.y) * EDGE_DAMP; }
  const floorY = minBallWorldY(state === STATE.SLING || (state === STATE.FLY && fromSling));
  if (ballPos.y < floorY) {
    ballPos.y = floorY;
    if (vel.y < 0) vel.y = Math.abs(vel.y) * EDGE_DAMP;
  }
}
function updateParticles(dt) {
  let alive = false;
  for (let i = 0; i < MAX_P; i++) {
    const v = pVel[i];
    if (v.life <= 0) { pPos[i * 3 + 1] = -999; continue; }
    alive = true;
    v.life -= dt; v.y -= 6 * dt;
    pPos[i * 3] += v.x * dt;
    pPos[i * 3 + 1] += v.y * dt;
    pCol[i * 3] *= 0.98;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
  pMat.opacity = alive ? Math.max(0, 1 - celebrateT * 0.9) : 0;
}

function tick(now) {
  if (!active || !renderer || document.hidden) {
    raf = 0;
    return;
  }
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.022, (now - lastT) / 1000 || 0.016);
  lastT = now;

  if (state === STATE.DRAG) {
    ballPos.lerp(targetPos, 1 - Math.pow(0.001, dt));
    showFollowSpin(dt);
  } else if (state === STATE.SLING) {
    ballPos.lerp(targetPos, 1 - Math.pow(0.0008, dt));
    showFollowSpin(dt);
  } else if (state === STATE.SETTLE) {
    ballPos.addScaledVector(vel, dt);
    vel.multiplyScalar(Math.pow(SOFT_STOP_DAMP, dt * 60));
    bounceEdges();
    spinFromVel(dt);
    if (vel.length() < 0.08) {
      vel.set(0, 0, 0);
      state = STATE.REST;
      setBusy(false);
    }
  } else if (state === STATE.FLY) {
    ballPos.addScaledVector(vel, dt);
    vel.multiplyScalar(Math.pow(AIR_DAMP, dt * 60));
    bounceEdges();
    spinFromVel(dt);
    if (!checkGoal()) {
      if (vel.length() < 0.32) beginSoftStop();
    }
  } else if (state === STATE.CELEBRATE) {
    celebrateT += dt;
    updateParticles(dt);
    if (celebrateT > 0.85) {
      particles.visible = false;
      pMat.opacity = 1;
      const home = restWorld();
      ballPos.copy(home);
      targetPos.copy(home);
      vel.set(0, 0, 0);
      slingZoneEl.classList.remove('active');
      setTabPress(false);
      fromSling = false;
      state = STATE.REST;
      updateGhostGoal();
      setBusy(false);
    }
  } else {
    ball.rotation.y += dt * 0.2;
    ball.rotation.x += dt * 0.05;
  }

  const floorY = minBallWorldY(state === STATE.SLING);
  if (ballPos.y < floorY) ballPos.y = floorY;

  ball.position.copy(ballPos);
  shadow.position.x = ballPos.x + 0.05;
  shadow.position.y = ballPos.y - 0.09;

  syncLocalCamera();
  syncCanvasAndHit();

  const wantGhost = state === STATE.SLING || (state === STATE.FLY && fromSling) || state === STATE.CELEBRATE;
  if (wantGhost !== lastGhostShow) {
    lastGhostShow = wantGhost;
    updateGhostGoal();
  }

  // Idle: keep slow spin but skip every other WebGL frame on high-DPR (cuts GPU thrash)
  const moving = state !== STATE.REST;
  if (!moving) {
    idleFrames++;
    if (idleFrames % 2 === 1 && (window.devicePixelRatio || 1) > 2) {
      return;
    }
  } else {
    idleFrames = 0;
  }

  renderer.render(scene, camera);
}

function ensureLoop() {
  if (!active || document.hidden) return;
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function start() {
  if (started) return;
  ensureDom();
  initThree();
  resize();
  ballPos.copy(restWorld());
  targetPos.copy(ballPos);
  hitEl.addEventListener('pointerdown', onDown);
  hitEl.addEventListener('pointermove', onMove);
  hitEl.addEventListener('pointerup', onUp);
  hitEl.addEventListener('pointercancel', onCancel);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setTabPress(false);
    } else if (active) {
      ensureLoop();
    }
  });
  started = true;
  lastT = performance.now();
  raf = requestAnimationFrame(tick);
}

function show() {
  if (glbFailed) {
    try {
      if (window.JCFloatBall && window.JCFloatBall.fallback) window.JCFloatBall.show();
    } catch (_) {}
    return;
  }
  start();
  active = true;
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');
  resize();
  if (state === STATE.REST) {
    ballPos.copy(restWorld());
    targetPos.copy(ballPos);
  }
  const floorY = minBallWorldY(false);
  if (ballPos.y < floorY) ballPos.y = floorY;
  syncHitSize(true);
  syncCanvasAndHit();
  lastGhostShow = null;
  updateGhostGoal();
  ensureLoop();
}

function hide() {
  active = false;
  setBusy(false);
  setTabPress(false);
  setDragLite(false);
  if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
  pendingPointer = null;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (pointerId !== null) {
    try { hitEl.releasePointerCapture(pointerId); } catch (_) {}
    pointerId = null;
  }
  if (slingZoneEl) slingZoneEl.classList.remove('active');
  if (ghostEl) ghostEl.classList.remove('on');
  lastGhostShow = false;
  fromSling = false;
  if (state === STATE.DRAG || state === STATE.SLING) {
    state = STATE.REST;
    vel.set(0, 0, 0);
  }
  if (root) {
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
  }
}

function syncRoute(name) {
  if (ACTIVE_ROUTES.has(name)) show();
  else hide();
}

window.JCFloatBall = { syncRoute, show, hide };
try { console.log('[float-ball] ready (1.9.123 size-restored, drag-isolate)'); } catch (_) {}
try {
  const hash = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0].split('/')[0];
  if (ACTIVE_ROUTES.has(hash || 'home')) {
    requestAnimationFrame(() => syncRoute(hash || 'home'));
  }
} catch (_) {}

export { syncRoute, show, hide };
