#!/usr/bin/env node
// node tools/make-icons.js
// Locked Design G hi-res master (tools/yunqiumi-icon-g-hires-master.jpg, 1024²)
// → public/icons/*.png + android/res/mipmap-*/ic_launcher.png
// Raster Lanczos downscale only. Does not redraw the mark or invent an SVG.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_JPG = path.join(ROOT, 'tools/yunqiumi-icon-g-hires-master.jpg');
const SRC_PNG = path.join(ROOT, 'tools/yunqiumi-icon-g.png');
const SRC = fs.existsSync(SRC_JPG) ? SRC_JPG : SRC_PNG;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yunqiumi-icon-'));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
  }
  return r;
}

function imageSize(p) {
  const buf = fs.readFileSync(p);
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0xd9) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xc2) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error('unsupported image: ' + p);
}

// Master is an iOS-style squircle on a black or near-white canvas.
// Flood-fill only corner-connected canvas pixels (black, white, gray AA)
// with navy sampled from the icon edge. Cloud / ball whites stay interior.
function fullBleedNavy(src, outPng) {
  const { w, h } = imageSize(src);
  const rawPath = path.join(TMP, 'src.rgb');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath]);
  const buf = fs.readFileSync(rawPath);
  if (buf.length !== w * h * 3) throw new Error('raw size mismatch');

  const idx = (x, y) => (y * w + x) * 3;
  const lum = (i) => (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
  const isCornerFill = (i) => {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const L = lum(i);
    const chroma = mx - mn;
    if (L < 18) return true; // black canvas
    if (L >= 160 && chroma <= 28) return true; // white canvas
    if (L >= 72 && L <= 150 && chroma <= 24) return true; // squircle AA fringe
    return false;
  };

  // Navy from the top-middle, a few percent in (skip canvas / AA).
  let navy = null;
  const mx = Math.floor(w / 2);
  for (let y = Math.max(2, Math.round(h * 0.02)); y < h; y++) {
    const i = idx(mx, y);
    const L = lum(i);
    if (L >= 20 && L < 80) {
      navy = [buf[i], buf[i + 1], buf[i + 2]];
      break;
    }
  }
  if (!navy) throw new Error('could not sample navy fill color');

  const seen = Buffer.alloc(w * h);
  const stack = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 3;
    if (!isCornerFill(i)) continue;
    buf[i] = navy[0];
    buf[i + 1] = navy[1];
    buf[i + 2] = navy[2];
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const filledRaw = path.join(TMP, 'filled.rgb');
  fs.writeFileSync(filledRaw, buf);
  run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', filledRaw,
    '-frames:v', '1', outPng,
  ]);
}

function scalePng(src, size, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=${size}:${size}:flags=lanczos`,
    dest,
  ]);
  console.log('icon', dest);
}

function maskable(src, size, dest) {
  // Keep a little safe-zone padding so OS masks do not clip the ball.
  const inner = Math.round(size * 0.80);
  const pad = Math.round((size - inner) / 2);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=${inner}:${inner}:flags=lanczos,pad=${size}:${size}:${pad}:${pad}:color=0x${navyHex()}`,
    dest,
  ]);
  console.log('icon', dest);
}

let _navyHex;
function navyHex() {
  if (_navyHex) return _navyHex;
  const full = path.join(TMP, 'fullbleed.png');
  const { w } = imageSize(full);
  const rawPath = path.join(TMP, 'fb.rgb');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', full,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath]);
  const buf = fs.readFileSync(rawPath);
  const i = (Math.max(2, Math.round(w * 0.02)) * w + Math.floor(w / 2)) * 3;
  _navyHex = [buf[i], buf[i + 1], buf[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('');
  return _navyHex;
}

(function main() {
  if (!fs.existsSync(SRC)) throw new Error('missing locked artwork ' + SRC);
  const { w, h } = imageSize(SRC);
  if (w !== h) throw new Error(`master must be square, got ${w}x${h}`);
  try {
    const full = path.join(TMP, 'fullbleed.png');
    fullBleedNavy(SRC, full);

    scalePng(full, 192, path.join(ROOT, 'public/icons/icon-192.png'));
    scalePng(full, 512, path.join(ROOT, 'public/icons/icon-512.png'));
    scalePng(full, 180, path.join(ROOT, 'public/icons/apple-touch-icon.png'));
    maskable(full, 512, path.join(ROOT, 'public/icons/icon-maskable-512.png'));

    const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    for (const [d, s] of Object.entries(dens)) {
      scalePng(full, s, path.join(ROOT, `android/res/mipmap-${d}/ic_launcher.png`));
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})();
