'use strict';
// 1.9.269: launcher icons are resized from the locked Design G PNG, not a redrawn SVG.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const manifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const makeIcons = fs.readFileSync(path.join(root, 'tools/make-icons.js'), 'utf8');

assert.ok(/VERSION=1\.9\.269/.test(ver));
assert.ok(/VERSION_CODE=305/.test(ver));
assert.ok(/jc-v1\.9\.269/.test(swJs));
assert.strictEqual(pkg.version, '1.9.269');
assert.strictEqual(cfg.version, '1.9.269');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.269\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-305\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.269.md')));

assert.ok(/android:icon="@mipmap\/ic_launcher"/.test(manifest), 'launcher still @mipmap/ic_launcher');
assert.ok(!/android:roundIcon/.test(manifest), 'no separate roundIcon');

const src = path.join(root, 'tools/yunqiumi-icon-g.png');
assert.ok(fs.existsSync(src), 'locked Design G PNG is the source');
assert.ok(/yunqiumi-icon-g\.png/.test(makeIcons), 'make-icons resizes the locked PNG');
assert.ok(!/yunqiumi-icon\.svg/.test(makeIcons), 'make-icons does not render the rejected SVG mark');
assert.ok(!fs.existsSync(path.join(root, 'tools/yunqiumi-icon.svg')), 'rejected SVG mark removed');
assert.ok(!fs.existsSync(path.join(root, 'tools/build-yunqiumi-svg.js')));
assert.ok(!fs.existsSync(path.join(root, 'tools/render-yunqiumi-icon.js')));

function pngSize(p) {
  const buf = fs.readFileSync(p);
  assert.ok(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), len: buf.length, buf };
}
const srcSz = pngSize(src);
assert.strictEqual(srcSz.w, 256, 'locked photo is 256');
assert.strictEqual(srcSz.h, 256);
assert.ok(srcSz.len > 20000, 'locked photo is the illustrated raster, not a tiny stub');

const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(dens)) {
  const p = path.join(root, `android/res/mipmap-${d}/ic_launcher.png`);
  assert.ok(fs.existsSync(p), p);
  const { w, h, len } = pngSize(p);
  assert.strictEqual(w, s, `${d} width`);
  assert.strictEqual(h, s, `${d} height`);
  assert.ok(len > 800, `${d} not an empty/tiny png`);
}

const web = {
  'public/icons/icon-192.png': 192,
  'public/icons/icon-512.png': 512,
  'public/icons/apple-touch-icon.png': 180,
  'public/icons/icon-maskable-512.png': 512,
};
for (const [rel, s] of Object.entries(web)) {
  const { w, h, len } = pngSize(path.join(root, rel));
  assert.strictEqual(w, s, rel + ' width');
  assert.strictEqual(h, s, rel + ' height');
  assert.ok(len > 800, rel + ' not tiny');
}

// Full-bleed opaque RGB (color type 2), not the 1.9.268 SVG screenshots
// which were RGBA (type 6) with transparent rounded corners.
for (const rel of [
  'android/res/mipmap-mdpi/ic_launcher.png',
  'android/res/mipmap-xxxhdpi/ic_launcher.png',
  'public/icons/icon-512.png',
]) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.strictEqual(buf[24], 8, rel + ' 8-bit');
  assert.strictEqual(buf[25], 2, rel + ' RGB full-bleed (not transparent round-rect)');
}

// notification assets stay the small white-circle vectors, not the launcher art
for (const name of ['ic_notify_goal.xml', 'jpush_notification_icon.xml']) {
  const xml = fs.readFileSync(path.join(root, 'android/res/drawable', name), 'utf8');
  assert.ok(/vector/.test(xml) && /M12,2a10,10/.test(xml), name + ' stays white circle');
  assert.ok(!/mipmap/.test(xml));
}

assert.ok(!/sk_[A-Za-z0-9]{8,}/.test(makeIcons + apkSh), 'no invented secrets');

console.log('ui-269-test OK');
