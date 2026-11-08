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
assert.strictEqual(logo.smPhotoProxy('http://cdn.sportmonks.com/images/soccer/players/2/18.png'), '');
assert.strictEqual(logo.smPhotoProxy('https://example.com/images/soccer/players/2/18.png'), '');
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
assert.ok(/placeholder\\\.\(\?:png\|jpe\?g\|webp\)/.test(appJs.slice(appJs.indexOf('function smPlayerPhotoUrl'), appJs.indexOf('function smCircGauge'))));

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=2\.0\.8/.test(ver));
assert.ok(/VERSION_CODE=325/.test(ver));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '2.0.8');
assert.ok(/jc-v2\.0\.8/.test(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')));
assert.ok(/"version":"2\.0\.8"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.0\.8\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-325\}"/.test(apkSh));
const mani = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
assert.ok(/android:versionCode="325"/.test(mani));
assert.ok(/android:versionName="2\.0\.8"/.test(mani));
assert.ok(/rewriteFields\(report, req, \['html', 'componentsSmHtml'\]\)/.test(fs.readFileSync(path.join(root, 'server.js'), 'utf8')));

console.log('predict-logo-apk-test OK');
