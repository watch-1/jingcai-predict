'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

assert.ok(/preview 381/.test(appJs) && /preview 381/.test(css), '381 notes present');
assert.ok(/function afterCompositorIdle/.test(appJs), 'double-rAF + delay helper');
assert.ok(/OVERLAY_TEARDOWN_MS = 80/.test(appJs), 'teardown waits ~80ms after two frames');
assert.ok(/function swapOverlayHtml/.test(appJs) && /function teardownOverlayEl/.test(appJs), 'swap and teardown helpers');
assert.ok(/function freezeOverlayEl/.test(appJs) && /overlay-teardown/.test(appJs), 'freeze before clear');
assert.ok(/bumpOverlayEpoch/.test(appJs), 'epoch cancels a stale clear if a new sheet opens');

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

const closeSheet = extractNamed(appJs, 'closeSheet');
assert.ok(/teardownOverlayEl/.test(closeSheet), 'closeSheet uses delayed teardown');
assert.ok(!/requestAnimationFrame\(clear\)/.test(closeSheet), 'closeSheet no longer clears on a single rAF');

const openSheet = extractNamed(appJs, 'openSheetHtml');
assert.ok(/swapOverlayHtml/.test(openSheet), 'openSheetHtml swaps offscreen');
assert.ok(!/classList\.remove\('hidden'\)[\s\S]{0,80}innerHTML\s*=/.test(openSheet), 'openSheetHtml does not show then write live');
assert.ok(!/innerHTML\s*=\s*html/.test(openSheet), 'openSheetHtml does not assign innerHTML itself');

const swap = extractNamed(appJs, 'swapOverlayHtml');
assert.ok(/classList\.add\('hidden'\)/.test(swap) && /innerHTML/.test(swap), 'swap writes while hidden');
assert.ok((/overlay-teardown/.test(swap) || /freezeOverlayEl/.test(swap)) && /afterCompositorIdle/.test(swap), 'visible swap freezes then waits');

const renderRadar = extractNamed(appJs, 'renderRadarExpand');
assert.ok(/swapOverlayHtml/.test(renderRadar), 'radar expand does not live-replace a visible tree');
assert.ok(!/el\.innerHTML\s*=/.test(renderRadar), 'renderRadarExpand has no live innerHTML assign');

const closeRadar = extractNamed(appJs, 'closeRadarExpand');
assert.ok(/teardownOverlayEl/.test(closeRadar), 'closeRadarExpand uses the same delayed teardown');

assert.ok(/#sheet\.overlay-teardown/.test(css) && /#radar-expand\.overlay-teardown/.test(css), 'teardown CSS hides without a live clear');
assert.ok(/#sheet,\s*\n#sheet\.sheet-mask/.test(css) || /#sheet,\n#sheet\.sheet-mask/.test(css) || /#dialog\.dialog-mask/.test(css), 'mask chrome is in the filter-off list');
assert.ok(/#dialog/.test(css) && /backdrop-filter:\s*none/.test(css), 'dialog/sheet/radar filters off');
assert.ok(!/#sheet[^{}]*\{[^}]*backdrop-filter:\s*blur/.test(css), 'no blur left on #sheet rule');

const syncWx = extractNamed(appJs, 'syncHeroWeatherMotion');
assert.ok(/overlayBusy/.test(syncWx), 'weather pauses while an overlay is open');
assert.ok(/wx-paused/.test(syncWx) && /ensureWxPanLoop/.test(syncWx), 'weather resumes from the same pan loop, no remount');

const appBackSrc = appJs.slice(appJs.indexOf('window.__appBack'), appJs.indexOf('window.__appBack') + 900);
assert.ok(/catch/.test(appBackSrc), '__appBack swallows errors');
assert.ok(/return 1/.test(appBackSrc), 'errors must not exit the Android activity');

assert.ok(/softPatchMatchHero/.test(appJs), '379 tab-hero soft patch kept');
assert.ok(/function tickWxPan/.test(appJs) && /--wx-pan-x/.test(css), '380 weather pan kept');
assert.ok(/sx, sy = 0\.78, 0\.30/.test(fs.readFileSync(path.join(root, 'tools/gen-weather-377.py'), 'utf8')), 'sun stays at 0.78, 0.30');
assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B kept');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + css), 'no token in the public pack');
assert.ok(!/setLayerType/.test(fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8')), 'WebView is not forced to software layer');

console.log('ui-381-test OK', { version: '2.1.5.382', cache: '216lu33' });
