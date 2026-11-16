'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const surface = require('../lib/sm-surface');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/216lu33/.test(index), 'cache 216lu33');
assert.ok(!/216lu32/.test(index), 'no stale 216lu32');
assert.ok(/app\.js\?v=216lu33/.test(index), 'app.js cache-busted');
assert.ok(/style\.css\?v=216lu33/.test(index), 'style cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.382\}"/.test(apkSh), 'apk default 2.1.5.382');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-382\}"/.test(apkSh), 'apk default 382');

assert.ok(/preview 382/.test(appJs), '382 notes present');

const extractNamed = (src, name) => {
  const startAsync = src.indexOf('async function ' + name);
  const start = src.indexOf('function ' + name);
  let from = start;
  if (startAsync >= 0 && (start < 0 || startAsync < start)) from = startAsync;
  assert.ok(from >= 0, 'found ' + name);
  let i = src.indexOf('{', from);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  assert.fail('unterminated ' + name);
};

const swap = extractNamed(appJs, 'swapOverlayHtml');
assert.ok(/afterCompositorIdle\(writeOffscreen/.test(swap), 'first open of a hidden overlay also waits before write');
assert.ok(!/else writeOffscreen\(\)/.test(swap), 'hidden first-open is not an immediate write');
assert.ok(/afterCompositorIdle\(\(\) => \{[\s\S]*classList\.remove\('hidden'\)/.test(swap), 'waits again before removing hidden / unfreezing');
assert.ok(/onIdle/.test(swap), 'idle callback runs after reveal settles');

const renderRadar = extractNamed(appJs, 'renderRadarExpand');
assert.ok(/onIdle/.test(renderRadar) && /bindRadarBoardFit/.test(renderRadar), 'bindRadarBoardFit is scheduled on idle');
const onShow = renderRadar.slice(renderRadar.indexOf('onShow:'), renderRadar.indexOf('onIdle:'));
assert.ok(!/bindRadarBoardFit/.test(onShow), 'bindRadarBoardFit is not in the reveal / onShow frame');
assert.ok(!/getBoundingClientRect/.test(onShow), 'no layout measure in the reveal frame');

assert.ok(/function swapSlotHtml/.test(appJs), 'shared offscreen slot swap helper');

const formCase = appJs.slice(appJs.indexOf("case 'smFormSide'"), appJs.indexOf("case 'mvOpenPlayer'") > 0 ? appJs.indexOf("case 'openMvSheet'") : appJs.length);
assert.ok(/swapSlotHtml/.test(formCase), 'form tab uses hide-wait-write-show');
assert.ok(!/n\.hidden\s*=/.test(formCase), 'form tab does not live-toggle hidden on a built list');
assert.ok(/sm-form-src/.test(formCase) && /sm-form-mount/.test(formCase), 'form tab reads the inactive side from a template');

const formHtml = surface.renderFormHtml({
  players: {
    home: [{ name: 'Home P', nameZh: '主将', image: '', label: '前锋', goals: 1, assists: 0, shots: 2, passPct: 80, tackles: 1, rating: 7, jersey: '9' }],
    away: [{ name: 'Away P', nameZh: '客将', image: '', label: '后卫', goals: 0, assists: 0, shots: 1, passPct: 70, tackles: 2, rating: 6.5, jersey: '4' }],
  },
  homeName: '哈萨克',
  awayName: '斯洛伐克',
});
assert.ok(/sm-form-mount/.test(formHtml), 'active form side is mounted');
assert.strictEqual((formHtml.match(/class="sm-form-src"/g) || []).length, 2, 'both sides stored in templates');
assert.ok(/data-for="home"/.test(formHtml) && /data-for="away"/.test(formHtml), 'templates are keyed by side');
assert.ok(!/sm-form-list[^>]*\bhidden\b/.test(formHtml), 'no prebuilt hidden form list');
assert.ok(formHtml.includes('主将') && formHtml.includes('客将'), 'both rosters are in the markup (mount + templates)');
const mountStart = formHtml.indexOf('sm-form-mount');
const firstTpl = formHtml.indexOf('<template');
assert.ok(mountStart >= 0 && firstTpl > mountStart, 'mount comes before templates');
assert.ok(formHtml.slice(mountStart, firstTpl).includes('主将'), 'home starts in the mount');
assert.ok(!formHtml.slice(mountStart, firstTpl).includes('客将'), 'away is not in the live mount');

// 381 teardown invariants still hold
assert.ok(/function teardownOverlayEl/.test(appJs) && /function closeSheet/.test(appJs), '381 teardown kept');
assert.ok(/teardownOverlayEl/.test(extractNamed(appJs, 'closeSheet')), 'closeSheet still delayed');
assert.ok(/swapOverlayHtml/.test(extractNamed(appJs, 'openSheetHtml')), 'openSheetHtml still swaps offscreen');
assert.ok(/teardownOverlayEl/.test(extractNamed(appJs, 'closeRadarExpand')), 'closeRadarExpand still delayed');
assert.ok(/overlayBusy/.test(extractNamed(appJs, 'syncHeroWeatherMotion')), 'weather still pauses while overlays are open');
assert.ok(/softPatchMatchHero/.test(appJs), 'softPatchMatchHero stays');
assert.ok(/function tickWxPan/.test(appJs) && /--wx-pan-x/.test(css), '380 weather pan kept');
assert.ok(/sx, sy = 0\.78, 0\.30/.test(fs.readFileSync(path.join(root, 'tools/gen-weather-377.py'), 'utf8')), 'sun stays at 0.78, 0.30');
assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B kept');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + css), 'no token in the public pack');
assert.ok(!/setLayerType/.test(fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8')), 'WebView is not forced to software layer');

const appBackSrc = appJs.slice(appJs.indexOf('window.__appBack'), appJs.indexOf('window.__appBack') + 900);
assert.ok(/catch/.test(appBackSrc) && /return 1/.test(appBackSrc), '__appBack still returns 1 on error');

console.log('ui-382-test OK', { version: '2.1.5.382', cache: '216lu33' });
