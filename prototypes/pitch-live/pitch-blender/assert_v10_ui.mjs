import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "yunqiumi-pitch-pass-v10.html");
const STILLS = path.join(__dirname, "stills");
fs.mkdirSync(STILLS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];
const results = [];

async function open(viewport, query = "pause=1&t=0.4") {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("file://" + HTML + "?" + query, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  return { ctx, page };
}

// Portrait phone (~375 forces old min-height bug)
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  const m = await page.evaluate(() => {
    const wrap = document.getElementById("pitchWrap").getBoundingClientRect();
    const bg = getComputedStyle(document.getElementById("pitchBg"));
    const proj = window.__projectCss(0, 0);
    const mid = window.__projectCss(0.5, 0.5);
    const br = window.__projectCss(1, 0);
    // sampleBall carry at t~0.5 (within first segment carry window)
    const s = (typeof sampleBall === "undefined") ? null : null;
    return {
      wrapW: wrap.width, wrapH: wrap.height, ar: wrap.width / wrap.height,
      objectFit: bg.objectFit,
      bl: proj, mid, br,
      world: !!document.getElementById("pitchWorld"),
    };
  });
  // Force evaluate sample via exposing — call through frame loop state
  const carry = await page.evaluate(() => {
    // demoT set via URL; read pill action after jumping t
    return true;
  });
  await page.goto("file://" + HTML + "?pause=1&t=0.5", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const action = await page.evaluate(() => document.getElementById("pillAction").textContent);
  const metrics = await page.evaluate(() => window.__pitchUIMetrics());
  results.push({ label: "portrait390", m, action, metrics });
  const arOk = Math.abs(m.ar - 16 / 9) < 0.002;
  const fitOk = m.objectFit === "fill";
  const worldOk = m.world;
  const carryOk = action === "带球";
  const overlapOk = metrics && metrics.intersectArea === 0;
  if (!arOk) failures.push(`portrait AR=${m.ar} not 16/9`);
  if (!fitOk) failures.push(`object-fit=${m.objectFit}`);
  if (!worldOk) failures.push("missing pitch-world");
  if (!carryOk) failures.push(`expected 带球 at t=0.5 got ${action}`);
  if (!overlapOk) failures.push(`card∩pill=${metrics && metrics.intersectArea}`);
  await page.locator(".phone").screenshot({ path: path.join(STILLS, "v10-portrait-carry.png") });
  await ctx.close();
}

// Narrow 375 viewport (old bug case)
{
  const { ctx, page } = await open({ width: 375, height: 812 }, "pause=1&t=1.0");
  const m = await page.evaluate(() => {
    const wrap = document.getElementById("pitchWrap").getBoundingClientRect();
    return {
      ar: wrap.width / wrap.height,
      fit: getComputedStyle(document.getElementById("pitchBg")).objectFit,
      bl: window.__projectCss(0, 0),
      br: window.__projectCss(1, 0),
    };
  });
  results.push({ label: "portrait375", m });
  if (Math.abs(m.ar - 16 / 9) > 0.002) failures.push(`375 AR=${m.ar}`);
  if (m.fit !== "fill") failures.push(`375 fit=${m.fit}`);
  // With fill, css mapping is linear: bl.x should equal (156.88/1600)*W
  const expectBlX = (156.88 / 1600) * (m.bl.wrap.w);
  const d = Math.abs(m.bl.css.x - expectBlX);
  if (d > 0.05) failures.push(`375 bl css drift ${d}`);
  await page.locator(".phone").screenshot({ path: path.join(STILLS, "v10-portrait375.png") });
  await ctx.close();
}

// Wide demo
{
  const { ctx, page } = await open({ width: 900, height: 900 }, "pause=1&t=0.5&w=720");
  const m = await page.evaluate(() => {
    const wrap = document.getElementById("pitchWrap").getBoundingClientRect();
    return {
      ar: wrap.width / wrap.height,
      fit: getComputedStyle(document.getElementById("pitchBg")).objectFit,
      action: document.getElementById("pillAction").textContent,
      bl: window.__projectCss(0, 0),
    };
  });
  results.push({ label: "wide720", m });
  if (Math.abs(m.ar - 16 / 9) > 0.002) failures.push(`wide AR=${m.ar}`);
  const expectBlX = (156.88 / 1600) * m.bl.wrap.w;
  if (Math.abs(m.bl.css.x - expectBlX) > 0.05) failures.push("wide bl drift");
  await page.locator(".phone").screenshot({ path: path.join(STILLS, "v10-wide-carry.png") });
  await ctx.close();
}

// Land mode mapping
{
  const { ctx, page } = await open({ width: 1280, height: 720 }, "pause=1&t=3.0&land=1");
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const wrap = document.getElementById("pitchWrap").getBoundingClientRect();
    const bl = window.__projectCss(0, 0);
    const expectX = (156.88 / 1600) * wrap.width;
    const expectY = (651.73 / 900) * wrap.height;
    return {
      land: document.body.classList.contains("land-mode"),
      fit: getComputedStyle(document.getElementById("pitchBg")).objectFit,
      wrap: { w: wrap.width, h: wrap.height, ar: wrap.width / wrap.height },
      bl: bl.css,
      expect: { x: expectX, y: expectY },
      dx: bl.css.x - expectX,
      dy: bl.css.y - expectY,
    };
  });
  results.push({ label: "land", m });
  if (!m.land) failures.push("land mode off");
  if (Math.abs(m.dx) > 0.1 || Math.abs(m.dy) > 0.1) failures.push(`land bl drift dx=${m.dx} dy=${m.dy}`);
  await page.screenshot({ path: path.join(STILLS, "v10-land.png") });
  await ctx.close();
}

// Mid sequence still has carry after receive
{
  const { ctx, page } = await open({ width: 390, height: 844 }, "pause=1&t=9.25");
  await page.waitForTimeout(400);
  const action = await page.evaluate(() => document.getElementById("pillAction").textContent);
  results.push({ label: "post-tackle-carry", action });
  if (action !== "带球") failures.push(`t=9.25 expected 带球 got ${action}`);
  await page.locator(".phone").screenshot({ path: path.join(STILLS, "v10-away-carry.png") });
  await ctx.close();
}

fs.writeFileSync(path.join(STILLS, "v10-coverage.json"), JSON.stringify({ results, failures }, null, 2));
console.log("failures", failures.length, failures);
console.log("results labels", results.map(r => r.label));
await browser.close();
process.exit(failures.length ? 1 : 0);
