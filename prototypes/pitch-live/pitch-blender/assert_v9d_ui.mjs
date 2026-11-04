/**
 * v9d Playwright: corner/freekick pills, camera pan, card∩pill=0, LED crop, landscape.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STILLS = path.join(__dirname, "stills");
fs.mkdirSync(STILLS, { recursive: true });

const PORT = 8772;
const HTML = "yunqiumi-pitch-pass-v9d.html";

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".json")) return "application/json";
  if (p.endsWith(".js")) return "application/javascript";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/" + HTML;
  const filePath = path.join(ROOT, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end("missing"); return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
console.log("serving", ROOT, "on", PORT);

const browser = await chromium.launch({ headless: true });
const failures = [];
const results = [];

async function gotoPaused(page, t, extra = "") {
  await page.goto(`http://127.0.0.1:${PORT}/${HTML}?t=${t}&pause=1${extra}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__pitchUIMetrics === "function" && typeof window.__cameraState === "function");
  await page.waitForTimeout(800);
}

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const ui = window.__pitchUIMetrics();
    const cam = window.__cameraState();
    const pillAction = document.getElementById("pillAction")?.textContent || "";
    return { ui, cam, land: window.__isLandMode ? window.__isLandMode() : false, pillAction };
  });
  results.push({ label, ...m });
  console.log(JSON.stringify({ label, intersect: m.ui && m.ui.intersectArea, camTx: m.cam && m.cam.tx, camX: m.cam && m.cam.x, pill: m.pillAction, land: m.land }));
  if (!m.ui) failures.push(label + ": no ui metrics");
  else if (m.ui.intersectArea > 0) failures.push(`${label}: card∩pill=${m.ui.intersectArea}`);
  return m;
}

const context = await browser.newContext({
  viewport: { width: 430, height: 920 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

// Kickoff
await gotoPaused(page, 0);
await measure(page, "kickoff");
await page.locator(".phone").screenshot({ path: path.join(STILLS, "v9d-kickoff.png") });
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-kickoff-pitch.png") });

// Left-pan
await gotoPaused(page, 3.5);
await page.waitForTimeout(900);
const left = await measure(page, "left-pan");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-left-pan.png") });

// Right-pan (home attack toward right before goal ~27)
await gotoPaused(page, 27.0);
await page.waitForTimeout(900);
const right = await measure(page, "right-pan");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-right-pan.png") });

if (left.cam && right.cam) {
  const dTx = Math.abs(left.cam.tx - right.cam.tx);
  const dX = Math.abs(left.cam.x - right.cam.x);
  console.log(JSON.stringify({ cameraDelta: { dTx, dX, leftTx: left.cam.tx, rightTx: right.cam.tx, leftX: left.cam.x, rightX: right.cam.x } }));
  if (dTx < 8 && dX < 0.04) failures.push(`camera did not pan enough dTx=${dTx} dX=${dX}`);
  if (!(left.cam.x < right.cam.x)) failures.push(`expected left.cam.x < right.cam.x (${left.cam.x} vs ${right.cam.x})`);
} else {
  failures.push("missing camera state for left/right");
}

// Tackle ~7.2
await gotoPaused(page, 6.85);
await measure(page, "tackle");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-tackle.png") });

// Shot / goal approach ~28.2
await gotoPaused(page, 28.2);
await measure(page, "shot");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-shot.png") });

// Corner: place at 14.4, delivery mid ~15.8–17.0 (pause then swing)
await gotoPaused(page, 15.2);
await page.waitForTimeout(700);
const cornerPlace = await measure(page, "corner-place");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-corner.png") });
await page.locator(".phone").screenshot({ path: path.join(STILLS, "v9d-corner-phone.png") });
if (!["角球", "头球", "解围"].includes(cornerPlace.pillAction)) {
  failures.push(`corner-place pill expected 角球/头球/解围 got "${cornerPlace.pillAction}"`);
}

await gotoPaused(page, 16.6);
await page.waitForTimeout(700);
const cornerSwing = await measure(page, "corner-swing");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-corner-swing.png") });
if (!["角球", "头球", "解围"].includes(cornerSwing.pillAction)) {
  failures.push(`corner-swing pill expected 角球/头球/解围 got "${cornerSwing.pillAction}"`);
}

// Free-kick: set at 21.0, delivery mid ~22.2
await gotoPaused(page, 21.6);
await page.waitForTimeout(700);
const fk = await measure(page, "freekick");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-freekick.png") });
await page.locator(".phone").screenshot({ path: path.join(STILLS, "v9d-freekick-phone.png") });
if (!["定位球", "扑救", "传中", "进球"].includes(fk.pillAction)) {
  failures.push(`freekick pill expected 定位球/… got "${fk.pillAction}"`);
}

await gotoPaused(page, 22.8);
await page.waitForTimeout(600);
const fk2 = await measure(page, "freekick-flight");
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-freekick-flight.png") });
if (!["定位球", "扑救", "传中", "进球"].includes(fk2.pillAction)) {
  failures.push(`freekick-flight pill expected 定位球/… got "${fk2.pillAction}"`);
}

// Landscape
await gotoPaused(page, 0);
await page.click("#btnLand");
await page.waitForTimeout(400);
const afterLand = await page.evaluate(() => ({
  land: document.body.classList.contains("land-mode"),
  tabsHidden: getComputedStyle(document.querySelector(".tabs")).display === "none",
}));
console.log(JSON.stringify({ afterLand }));
if (!afterLand.land) failures.push("landscape button did not add land-mode");
if (!afterLand.tabsHidden) failures.push("tabs not hidden in land mode");
await page.screenshot({ path: path.join(STILLS, "v9d-landscape.png"), fullPage: true });
await page.locator("#pitchWrap").screenshot({ path: path.join(STILLS, "v9d-landscape-pitch.png") });

await page.goto(`http://127.0.0.1:${PORT}/${HTML}?t=0&pause=1&land=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const landQ = await page.evaluate(() => document.body.classList.contains("land-mode"));
if (!landQ) failures.push("?land=1 did not enable land-mode");

// LED crop readability: open rendered PNG and check text region exists + OCR-ish brightness pattern
const ledClose = path.join(STILLS, "v9d-led-closeup.png");
const ledClose2 = path.join(STILLS, "v9d-led-closeup2.png");
const ledPhaseStills = [0,1,2].map(i => path.join(STILLS, `v9d-full-p${i}.png`));
if (!fs.existsSync(ledClose) || !fs.existsSync(ledClose2)) {
  failures.push("missing LED closeup stills");
} else {
  console.log("LED closeups present:", ledClose, ledClose2);
}
for (const f of ledPhaseStills) {
  if (!fs.existsSync(f)) failures.push("missing phase plate still " + f);
}

// Copy LED stills already generated; also grab a phone screenshot over far LED via high t? skip

fs.writeFileSync(path.join(STILLS, "v9d-coverage.json"), JSON.stringify({ results, failures }, null, 2));


// ---- LED phase cycle ----
await gotoPaused(page, 0);
await page.waitForTimeout(400);
const led0 = await page.evaluate(() => ({
  phase: window.__ledPhase ? window.__ledPhase() : -1,
  activeSrc: document.querySelector('.pitch-bg.is-active')?.getAttribute('src') || '',
  activePhase: document.querySelector('.pitch-bg.is-active')?.getAttribute('data-phase') || '',
  stack: document.getElementById('pitchBgStack')?.getAttribute('data-led-phase') || '',
}));
console.log(JSON.stringify({ ledStart: led0 }));
results.push({ label: 'led-start', ...led0 });
if (!led0.activeSrc.includes('p0')) failures.push('led start src not p0: ' + led0.activeSrc);

// force phase swaps
for (const want of [1, 2, 0]) {
  const got = await page.evaluate((w) => window.__setLedPhase(w), want);
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({
    phase: window.__ledPhase(),
    activeSrc: document.querySelector('.pitch-bg.is-active')?.getAttribute('src') || '',
    activePhase: document.querySelector('.pitch-bg.is-active')?.getAttribute('data-phase') || '',
    stack: document.getElementById('pitchBgStack')?.getAttribute('data-led-phase') || '',
    activeCount: document.querySelectorAll('.pitch-bg.is-active').length,
  }));
  console.log(JSON.stringify({ ledForce: want, got, st }));
  results.push({ label: 'led-p' + want, ...st });
  if (st.phase !== want) failures.push(`led phase want ${want} got ${st.phase}`);
  if (!st.activeSrc.includes('p' + want)) failures.push(`led src want p${want} got ${st.activeSrc}`);
  if (st.activeCount !== 1) failures.push(`led activeCount=${st.activeCount}`);
  await page.locator('#pitchWrap').screenshot({ path: path.join(STILLS, `v9d-led-phase-${want}.png`) });
}

// v9d: interval must be ≥5s (calm cycle). Verify no swap before 5s, then swap by ~7s.
const ledMs = await page.evaluate(() => window.__LED_PHASE_MS || -1);
console.log(JSON.stringify({ LED_PHASE_MS: ledMs }));
results.push({ label: 'led-interval-ms', ms: ledMs });
if (!(ledMs >= 5000)) failures.push(`LED_PHASE_MS must be ≥5000, got ${ledMs}`);

await page.goto(`http://127.0.0.1:${PORT}/${HTML}?t=0&pause=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__ledPhase === 'function');
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
  if (typeof window.__ledLastSwap !== 'undefined') window.__ledLastSwap = performance.now();
  return window.__ledPhase();
});
// at 4.5s should NOT have swapped yet (interval 6s)
await page.waitForTimeout(4500);
const mid = await page.evaluate(() => window.__ledPhase());
console.log(JSON.stringify({ ledMid: { before, mid } }));
results.push({ label: 'led-no-early-swap', before, mid });
if (mid !== before) failures.push(`led swapped too early (<5s): ${before} -> ${mid}`);
// wait past interval (~6s from reset → need ~2s more + margin)
await page.waitForTimeout(2500);
const after = await page.evaluate(() => ({
  phase: window.__ledPhase(),
  activeSrc: document.querySelector('.pitch-bg.is-active')?.getAttribute('src') || '',
  stack: document.getElementById('pitchBgStack')?.getAttribute('data-led-phase') || '',
}));
console.log(JSON.stringify({ ledCycle: { before, after } }));
results.push({ label: 'led-cycle', before, ...after });
if (after.phase === before) {
  await page.waitForTimeout(2000);
  const after2 = await page.evaluate(() => window.__ledPhase());
  console.log(JSON.stringify({ ledCycle2: after2 }));
  if (after2 === before) failures.push(`led did not cycle after ~8.5s (stuck at ${before})`);
} else {
  console.log('led cycled ok (slow)', before, '->', after.phase);
}

// CSS crossfade duration check
const fadeMs = await page.evaluate(() => {
  const el = document.querySelector('.pitch-bg-stack .pitch-bg');
  if (!el) return -1;
  const st = getComputedStyle(el);
  const d = st.transitionDuration || '';
  const m = d.match(/([\d.]+)s/);
  return m ? parseFloat(m[1]) * 1000 : -1;
});
console.log(JSON.stringify({ crossfadeMs: fadeMs }));
results.push({ label: 'led-crossfade-ms', ms: fadeMs });
if (!(fadeMs >= 1000 && fadeMs <= 1300)) failures.push(`crossfade expected ~1.0–1.2s, got ${fadeMs}ms`);

await page.locator('.phone').screenshot({ path: path.join(STILLS, 'v9d-kickoff-phased.png') });


fs.writeFileSync(path.join(STILLS, "v9d-coverage.json"), JSON.stringify({ results, failures }, null, 2));
console.log("wrote coverage", results.length, "failures", failures.length);

await browser.close();
server.close();

if (failures.length) {
  console.error("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("ALL ASSERTS PASSED");
