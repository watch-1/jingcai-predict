'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/function espnIdFromCrestLogo/.test(appJs), 'espnIdFromCrestLogo');
assert.ok(/function formatHeroRank/.test(appJs), 'formatHeroRank');
assert.ok(/function bundledCrestFor/.test(appJs), 'bundledCrestFor');
assert.ok(/Never treat jingcai ids as ESPN ids/.test(appJs), 'comment: jingcai ≠ ESPN');
assert.ok(/bundledCrestFor\(logo, tid\)/.test(appJs), 'hydrate uses bundledCrestFor');
assert.ok(!/const bundled = bundledCrestPath\(tid\)/.test(appJs), 'no tid-only bundled path in consumers');
assert.ok(/tid:' \+ tid \+ '\|' : ''\) \+ 'url:' \+ url/.test(appJs), 'cache key includes logo URL');
assert.ok(/hero-lg-block/.test(appJs) && /hero-edge-mid/.test(appJs), 'title+time in nav mid block');
assert.ok(/formatHeroRank\(x\.homeRank/.test(appJs) && /formatHeroRank\(x\.awayRank/.test(appJs), 'hero ranks localized');
assert.ok(!/tm-mv-h-\$\{esc\(id\)\}/.test(appJs), 'hero no longer paints tm-mv');
assert.ok(/matchEdgeNavBar\(favBtn, leagueHeroMark\(x\)\)/.test(appJs), 'league mark moved into nav');
assert.ok(!/<span class="hero-lg-plate">/.test(appJs), 'league icon not wrapped in plate');

assert.ok(/preview 367/.test(css), '367 css section');
assert.ok(!/rgba\(236, 232, 224/.test(css), 'no cream league plate');
assert.ok(/drop-shadow\(0 1px 2px rgba\(0, 0, 0, \.55\)\)/.test(css), 'soft icon shadow');
assert.ok(/\.hero-lg-block/.test(css), 'tight title+time block');
assert.ok(/\.hero\.hero--weather \.tm \.tm-mv \{[\s\S]*display: none/.test(css), 'hide leftover hero 身价');

assert.ok(/216lu18/.test(index), 'cache 216lu18');
assert.ok(!/216lu17/.test(index), 'no stale 216lu17');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.367\}"/.test(apkSh), 'apk default 2.1.5.367');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-367\}"/.test(apkSh), 'apk default 367');

// Evaluate the pure helpers by extracting them.
const extract = (name) => {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}\\n');
  const m = appJs.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
};
const stub = `
function bundledCrestPath(teamId) {
  const tid = String(teamId || '');
  if (['359','367','86'].includes(tid)) return 'assets/crests/' + tid + '.png';
  return '';
}
` + extract('isNationalFlagLogo') + extract('espnIdFromCrestLogo') + extract('isJingcaiOrSportteryLogo') + extract('bundledCrestFor') + extract('crestCacheKey') + extract('formatHeroRank');

const fns = { bundledCrestPath() {}, isNationalFlagLogo() {}, espnIdFromCrestLogo() {}, bundledCrestFor() {}, crestCacheKey() {}, formatHeroRank() {} };
// eslint-disable-next-line no-new-func
const run = new Function(stub + '; return { isNationalFlagLogo, espnIdFromCrestLogo, bundledCrestFor, crestCacheKey, formatHeroRank };');
const api = run();

const armFlag = 'https://a.espncdn.com/i/teamlogos/countries/500/arm.png';
const cypFlag = 'https://a.espncdn.com/i/teamlogos/countries/500/cyp.png';
const arsenalEspn = 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png';
const spursEspn = 'https://a.espncdn.com/i/teamlogos/soccer/500/367.png';
const tsdb = 'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png';

assert.strictEqual(api.isNationalFlagLogo(armFlag), true, 'armenia flag detected');
assert.strictEqual(api.isNationalFlagLogo(arsenalEspn), false, 'club espn logo is not a flag');
assert.strictEqual(api.espnIdFromCrestLogo(arsenalEspn), '359');
assert.strictEqual(api.espnIdFromCrestLogo(armFlag), '');
assert.strictEqual(api.bundledCrestFor(armFlag, '359'), '', 'Armenia jingcai 359 must not use Arsenal file');
assert.strictEqual(api.bundledCrestFor(cypFlag, '367'), '', 'Cyprus jingcai 367 must not use Tottenham file');
assert.strictEqual(api.bundledCrestFor(arsenalEspn, '359'), 'assets/crests/359.png', 'explicit ESPN logo still uses bundled file');
assert.strictEqual(api.bundledCrestFor(spursEspn, '1'), 'assets/crests/367.png', 'ESPN id comes from URL, not jingcai tid');
assert.strictEqual(api.bundledCrestFor(tsdb, '359'), '', 'no jingcai-id fallback for non-ESPN logos');

const armKey = api.crestCacheKey(armFlag, '359');
const arsKey = api.crestCacheKey(arsenalEspn, '359');
assert.ok(armKey.includes('url:' + armFlag), 'flag cache key includes URL');
assert.ok(arsKey.includes('url:' + arsenalEspn), 'club cache key includes URL');
assert.notStrictEqual(armKey, arsKey, 'Armenia and Arsenal do not share a cache key');
assert.notStrictEqual(armKey, 'tid:359', 'do not use tid-only key when a logo URL is present');
assert.strictEqual(api.crestCacheKey('', '359'), 'tid:359', 'tid-only only when no URL');

assert.strictEqual(api.formatHeroRank('[Group 24]'), '[小组24]');
assert.strictEqual(api.formatHeroRank('[Group 23]'), '[小组23]');
assert.strictEqual(api.formatHeroRank('[荷乙8]'), '[荷乙8]');
assert.strictEqual(api.formatHeroRank(''), '');

console.log('ui-367-test OK');
