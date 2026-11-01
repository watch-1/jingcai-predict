#!/usr/bin/env node
// Render tools/yunqiumi-icon.svg → public/icons + android mipmap ic_launcher PNGs via headless Chrome + ffmpeg.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'tools/yunqiumi-icon.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/\swidth="1024"\sheight="1024"/, '');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yunqiumi-icon-'));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
  }
  return r;
}

function screenshot(size, round, out) {
  const htmlPath = path.join(TMP, `icon-${size}-${round ? 'round' : 'sq'}.html`);
  const radius = round ? 'border-radius:22%;' : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden;}
.box{width:${size}px;height:${size}px;overflow:hidden;${radius}}
svg{display:block;width:100%;height:100%;}
</style></head><body><div class="box">${SVG.replace('<svg', `<svg width="${size}" height="${size}"`)}</div></body></html>`;
  fs.writeFileSync(htmlPath, html);
  const shot = path.join(TMP, `shot-${size}-${round ? 'r' : 's'}.png`);
  run(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${shot}`,
    `file://${htmlPath}`,
  ]);
  // Chrome sometimes writes a slightly larger capture; lanczos-scale to exact size.
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run('ffmpeg', ['-y', '-i', shot, '-vf', `scale=${size}:${size}:flags=lanczos`, out]);
  console.log('icon', out);
}

(async () => {
  try {
    await Promise.resolve();
    screenshot(192, false, path.join(ROOT, 'public/icons/icon-192.png'));
    screenshot(512, false, path.join(ROOT, 'public/icons/icon-512.png'));
    screenshot(180, false, path.join(ROOT, 'public/icons/apple-touch-icon.png'));
    // maskable: keep a little safe-zone padding so OS masks do not clip the ball
    const padHtml = path.join(TMP, 'maskable.html');
    fs.writeFileSync(padHtml, `<!DOCTYPE html><html><head><style>
html,body{margin:0;background:#1A2433;width:512px;height:512px;overflow:hidden;}
.box{width:512px;height:512px;display:flex;align-items:center;justify-content:center;}
svg{width:400px;height:400px;display:block;}
</style></head><body><div class="box">${SVG}</div></body></html>`);
    const maskShot = path.join(TMP, 'mask.png');
    run(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--default-background-color=00000000',
      '--window-size=512,512', `--screenshot=${maskShot}`, `file://${padHtml}`,
    ]);
    run('ffmpeg', ['-y', '-i', maskShot, '-vf', 'scale=512:512:flags=lanczos',
      path.join(ROOT, 'public/icons/icon-maskable-512.png')]);
    console.log('icon', 'public/icons/icon-maskable-512.png');

    const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    for (const [d, s] of Object.entries(dens)) {
      screenshot(s, true, path.join(ROOT, `android/res/mipmap-${d}/ic_launcher.png`));
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
