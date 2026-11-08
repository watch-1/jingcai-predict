'use strict';
// 2.0.6: predict headshots must not stay root-relative. APK WebView is file://.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const logo = require('../lib/logo-proxy');
const heat = require('../lib/heat-pitch');
const surface = require('../lib/predict-surface');
const pc = require('../lib/predict-components');

const PHOTO = 'https://cdn.sportmonks.com/images/soccer/players/2/18.png';
const PLACE = 'https://cdn.sportmonks.com/images/soccer/placeholder.png';
const API = 'http://120.77.152.74:8088';

assert.strictEqual(logo.smPhotoProxy(''), '');
assert.strictEqual(logo.smPhotoProxy(PLACE), '');
const httpUp = logo.smPhotoProxy('http://cdn.sportmonks.com/images/soccer/players/2/18.png');
assert.ok(httpUp.includes(encodeURIComponent('https://cdn.sportmonks.com/images/soccer/players/2/18.png')), httpUp);
assert.strictEqual(logo.smPhotoProxy('https://example.com/images/soccer/players/2/18.png'), '');
const TM = 'https://img.a.transfermarkt.technology/portrait/header/12345.jpg';
assert.ok(logo.smPhotoProxy(TM).includes(encodeURIComponent(TM)));
assert.strictEqual(logo.smPhotoProxy('https://media.api-sports.io/football/players/0.png'), '');
assert.strictEqual(logo.smPhotoProxy('https://a.espncdn.com/i/headshots/soccer/players/full/nophoto.png'), '');
assert.strictEqual(logo.smPhotoProxy('https://r2.thesportsdb.com/images/media/player/cutout/abc.png').includes('/api/logo?url='), true);
const rel = logo.smPhotoProxy(PHOTO);
assert.ok(rel.startsWith('/api/logo?url='), rel);
assert.ok(rel.includes(encodeURIComponent(PHOTO)));
assert.strictEqual(logo.smPhotoProxy('/api/logo?url=' + encodeURIComponent(PLACE)), '');
assert.ok(logo.isPlaceholderPhoto(PLACE));
assert.ok(!logo.isPlaceholderPhoto(PHOTO));

const abs = logo.smPhotoProxy(PHOTO, API);
assert.ok(abs.startsWith(API + '/api/logo?url='), abs);
assert.strictEqual(logo.smPhotoProxy(abs, API), abs);

const req = {
  protocol: 'http',
  get(name) { return name === 'host' ? '120.77.152.74:8088' : ''; },
};
assert.strictEqual(logo.originFromRequest(req), API);
assert.strictEqual(logo.originFromRequest({ protocol: 'http', get() { return 'bad host'; } }), '');

const injury = `<span class="av"><img src="${rel}" alt="" loading="lazy" onerror="this.remove()" /><i class="ph">萨</i></span>`;
const fixed = logo.rewriteLogoHtml(injury, API);
assert.ok(fixed.includes(`src="${API}/api/logo?url=`), fixed);
assert.ok(!/src="\/api\/logo/.test(fixed));
assert.ok(fixed.includes('萨'));
assert.strictEqual(logo.rewriteLogoHtml(fixed, API), fixed);

const phHtml = `<span class="av"><img src="/api/logo?url=${encodeURIComponent(PLACE)}" alt="" /><i class="ph">萨</i></span>`;
const phOut = logo.rewriteLogoHtml(phHtml, API);
assert.ok(!phOut.includes('<img'), phOut);
assert.ok(!phOut.includes('placeholder.png'), phOut);
assert.ok(phOut.includes('萨'));

const svg = `<g class="pr-avatar"><text>萨</text><image href="${rel}" x="1" y="2" width="20" height="20"/></g>`;
const svgOut = logo.rewriteLogoHtml(svg, API);
assert.ok(svgOut.includes(`href="${API}/api/logo?url=`), svgOut);
assert.ok(!/href="\/api\/logo/.test(svgOut));

const pitch = {
  available: true,
  homeAttack: { available: true, lcr: { left: 0.4, central: 0.4, right: 0.2 }, dominant: 'left' },
  awayAttack: { available: true, lcr: { left: 0.3, central: 0.4, right: 0.3 }, dominant: 'central' },
  homeDefend: { available: true, lcr: { left: 0.3, central: 0.4, right: 0.3 }, dominant: 'central' },
  awayDefend: { available: true, lcr: { left: 0.4, central: 0.4, right: 0.2 }, dominant: 'left' },
};
const drawn = heat.renderFullPitchSvg(pitch, {
  home: '蒙彼利埃',
  away: '梅斯',
  avatars: {
    home: [{ role: 'attack', name: '萨卡', player_id: 18, image: PHOTO, sidelined: false }],
    away: [{ role: 'attack', name: '占位', player_id: 19, image: PLACE, sidelined: false }],
  },
});
assert.ok(drawn.includes('/api/logo?url='));
assert.ok(drawn.includes(encodeURIComponent(PHOTO)));
assert.ok(!drawn.includes('placeholder.png'), 'pitch placeholder is a letter, not an image');
assert.ok(drawn.includes('萨'));
assert.strictEqual(surface.avatarSrc(PLACE), '');
assert.ok(surface.avatarSrc(PHOTO).startsWith('/api/logo?url='));

const wave = pc.renderCards([{
  id: 'lanecore',
  name: '通道核心伤停',
  evidence: '弱',
  fired: true,
  markets: ['胜平负'],
  say: '只对上了位置',
  viz: {
    kind: 'cores',
    people: [
      { who: '萨卡', lane: '左路', image: PHOTO, matched: true },
      { who: '占位', lane: '右路', image: PLACE, matched: true },
    ],
  },
}], { skin: 'dqd' });
assert.ok(wave.includes('/api/logo?url='));
assert.ok(wave.includes(encodeURIComponent(PHOTO)));
assert.equal((wave.match(/<img\b/g) || []).length, 1);
assert.ok(!wave.includes('placeholder.png'));

const prev = process.env.PUBLIC_API_BASE;
process.env.PUBLIC_API_BASE = API;
try {
  const fromEnv = logo.smPhotoProxy(PHOTO);
  assert.ok(fromEnv.startsWith(API + '/api/logo?url='), fromEnv);
  assert.strictEqual(logo.originFromRequest(req), API);
  const envSvg = heat.renderFullPitchSvg(pitch, {
    home: '蒙彼利埃',
    away: '梅斯',
    avatars: { home: [{ role: 'attack', name: '萨卡', player_id: 18, image: PHOTO }], away: [] },
  });
  assert.ok(envSvg.includes(`href="${API}/api/logo?url=`), 'server HTML uses public API base');
  assert.ok(!/href="\/api\/logo/.test(envSvg));
} finally {
  if (prev == null) delete process.env.PUBLIC_API_BASE;
  else process.env.PUBLIC_API_BASE = prev;
}

const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const start = appJs.indexOf('function isSmPlaceholderPhoto');
const end = appJs.indexOf('/** 1.9.70:');
assert.ok(start > 0 && end > start, 'client rewriter is in app.js');
const rewrite = new Function('API', `${appJs.slice(start, end)}\nreturn rewritePredictLogoHtml;`)(API);
const clientOut = rewrite(injury + svg);
assert.ok(clientOut.includes(`src="${API}/api/logo?url=`));
assert.ok(clientOut.includes(`href="${API}/api/logo?url=`));
assert.ok(!/="\/api\/logo/.test(clientOut));
const clientPh = rewrite(phHtml);
assert.ok(!clientPh.includes('<img'));
assert.ok(clientPh.includes('萨'));
const sameOrigin = new Function('API', `${appJs.slice(start, end)}\nreturn rewritePredictLogoHtml;`)('');
const webOut = sameOrigin(injury);
assert.ok(webOut.includes('src="/api/logo?url='));
assert.ok(!webOut.includes('http://'));
assert.ok(/return rewritePredictLogoHtml\(h\)/.test(appJs));
assert.ok(/rewritePredictLogoHtml\(pack\.html\)/.test(appJs));
assert.ok(/rewritePredictLogoHtml\(rep\.componentsSmHtml\)/.test(appJs));
assert.ok(/rewritePredictLogoHtml\(pack\.formHtml\)/.test(appJs));
assert.ok(/function smPlayerPhotoUrl/.test(appJs));
assert.ok(/return \(API \|\| ''\) \+ '\/api\/logo\?url='/.test(appJs));
assert.ok(/isSmPlaceholderPhoto\(raw\)/.test(appJs.slice(appJs.indexOf('function smPlayerPhotoUrl'), appJs.indexOf('function smCircGauge'))));
assert.ok(/placeholder\\\.\(\?:png\|jpe\?g\|webp\)/.test(appJs.slice(appJs.indexOf('function isSmPlaceholderPhoto'), appJs.indexOf('function rewritePredictLogoHtml'))));

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=2\.1\.2/.test(ver));
assert.ok(/VERSION_CODE=329/.test(ver));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '2.1.2');
assert.ok(/jc-v2\.1\.2/.test(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')));
assert.ok(/"version":"2\.1\.2"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.2\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-329\}"/.test(apkSh));
const mani = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
assert.ok(/android:versionCode="329"/.test(mani));
assert.ok(/android:versionName="2\.1\.2"/.test(mani));
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert.ok(/rewriteFields\(report, req, \['html', 'componentsSmHtml'\]\)/.test(serverJs));
assert.ok(/isNoPhotoBuffer\(buf, target\)/.test(serverJs));
assert.ok(/isPlaceholderPhoto\(u\.toString\(\)\)/.test(serverJs));

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(w, h, paint) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const px = paint(x, y);
      raw[o++] = px[0]; raw[o++] = px[1]; raw[o++] = px[2]; raw[o++] = px[3];
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', require('zlib').deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const grayCard = solidPng(40, 40, () => [180, 182, 184, 255]);
assert.strictEqual(logo.isNoPhotoBuffer(grayCard), true);
assert.strictEqual(logo.isNoPhotoBuffer(grayCard, 'https://cdn.sportmonks.com/images/soccer/players/2/18.png'), true);
assert.strictEqual(logo.isNoPhotoBuffer(grayCard, 'https://r2.thesportsdb.com/images/media/team/badge/x.png'), false);
assert.strictEqual(logo.isNoPhotoBuffer(solidPng(40, 40, (x, y) => [(x * 17) & 255, (y * 13) & 255, ((x * 3 + y * 5) & 255), 255])), false);
assert.strictEqual(logo.isNoPhotoBuffer(Buffer.from('not a png')), false);
const altHtml = `<img src="/api/logo?url=${encodeURIComponent(PHOTO)}" data-alt="/api/logo?url=${encodeURIComponent(TM)}" />`;
const altOut = logo.rewriteLogoHtml(altHtml, API);
assert.ok(altOut.includes(`data-alt="${API}/api/logo?url=`), altOut);
const clientAlt = rewrite(altHtml);
assert.ok(clientAlt.includes(`data-alt="${API}/api/logo?url=`), clientAlt);
const shot = logo.headshotSources(PLACE, 'Nobody Zzzzz');
assert.strictEqual(shot.src, '');
const shotPhoto = logo.headshotSources(PHOTO, 'Nobody Zzzzz');
assert.ok(shotPhoto.src.includes('/api/logo?url='));

console.log('predict-logo-apk-test OK');
