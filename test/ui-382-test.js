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

assert.ok(/app\.js\?v=216/.test(index) && /style\.css\?v=216/.test(index), 'app.js and style are cache-busted');
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

assert.ok(/function applySmFormSide/.test(appJs) && /function normalizeSmForm/.test(appJs), 'form side is a CSS data-side flip');
const formCase = appJs.slice(appJs.indexOf("case 'smFormSide'"), appJs.indexOf("case 'openMvSheet'"));
assert.ok(/applySmFormSide/.test(formCase), 'form tab applies data-side without rebuilding the list');
assert.ok(!/n\.hidden\s*=/.test(formCase), 'form tab does not live-toggle hidden on a built list');

const formHtml = surface.renderFormHtml({
  players: {
    home: [{ name: 'Home P', nameZh: '主将', image: '', label: '前锋', goals: 1, assists: 0, shots: 2, passPct: 80, tackles: 1, rating: 7, jersey: '9' }],
    away: [{ name: 'Away P', nameZh: '客将', image: '', label: '后卫', goals: 0, assists: 0, shots: 1, passPct: 70, tackles: 2, rating: 6.5, jersey: '4' }],
  },
  homeName: '哈萨克',
  awayName: '斯洛伐克',
});
assert.ok(/sm-form-pane/.test(formHtml) && /sm-form-panes/.test(formHtml), 'both form sides are panes in the tree');
assert.ok(!/<template/.test(formHtml), 'form HTML no longer uses templates');
assert.ok(/data-for="home"/.test(formHtml) && /data-for="away"/.test(formHtml), 'panes are keyed by side');
assert.ok(!/sm-form-list[^>]*\bhidden\b/.test(formHtml), 'no prebuilt hidden form list');
assert.ok(formHtml.includes('主将') && formHtml.includes('客将'), 'both rosters are in the markup');


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
