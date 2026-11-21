'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const weatherSrc = fs.readFileSync(path.join(root, 'lib/match-weather.js'), 'utf8');
const factsSrc = fs.readFileSync(path.join(root, 'lib/sm-matchfacts.js'), 'utf8');

assert.ok(/216mf388|216mf389|216mf390|216mf391|216mf392|216mf393|216mf394|216mf395|216mf397|216mf398|216mf399|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 388+');
assert.ok(!/216mf387/.test(indexHtml), 'index.html cache stamp moved off 387');

assert.ok(/gc-solo/.test(appJs) && /gc-solo-row/.test(appJs), 'one-sided goal clock uses a solo layout');
assert.ok(/没有放进对照，不编造场均/.test(appJs), 'incomplete side is omitted, not invented');
assert.ok(/gc-kit\.gc-solo \.gc-solo-row/.test(css) && /\.gc-kit \.gc-rows/.test(css));
assert.ok(/轴与另一侧对齐/.test(appJs) === false, 'old one-side overlap copy is gone');

assert.ok(/mf-pl-av/.test(appJs) && /mf-pl-av/.test(css), 'player leader cards include a photo slot');
assert.ok(/smPlayerPhotoUrl\(p\.image\)/.test(appJs));

assert.ok(/showLabel \? \('<span>' \+ esc\(mfFmt\(mean, kind\)\)/.test(appJs), 'mean tick renders its numeric value');
assert.ok(/\.mf-track \.mn span/.test(css), 'mean value has a label style');

assert.ok(/function clubPin/.test(weatherSrc) && /fidFromSiblingPacks/.test(weatherSrc));
assert.ok(/function officialZh|officialZh \|\| leagueLabel/.test(factsSrc), 'matchfacts prefer official 竞彩 league names');
assert.ok(/function smPlayerCdn/.test(factsSrc) && /playerId: xg\.playerId/.test(factsSrc));

const facts = require(path.join(root, 'lib/sm-matchfacts.js'));
assert.strictEqual(facts.smPlayerCdn(18), 'https://cdn.sportmonks.com/images/soccer/players/18/18.png');
assert.strictEqual(facts.smPlayerCdn(7), 'https://cdn.sportmonks.com/images/soccer/players/7/7.png');
assert.strictEqual(facts.smPlayerCdn(5641049), 'https://cdn.sportmonks.com/images/soccer/players/25/5641049.png');
assert.strictEqual(facts.smPlayerCdn(219859), 'https://cdn.sportmonks.com/images/soccer/players/19/219859.png');
assert.strictEqual(facts.smPlayerCdn(0), '');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-wx-388-'));
fs.mkdirSync(path.join(dir, 'sm-matchfacts'));
fs.writeFileSync(path.join(dir, 'sm-matchfacts', '2042839.json'), JSON.stringify({ smFixtureId: 19621739, ok: true }));
const prev = process.env.DATA_DIR;
process.env.DATA_DIR = dir;
try {
  delete require.cache[require.resolve(path.join(root, 'lib/match-weather.js'))];
  const wx = require(path.join(root, 'lib/match-weather.js'));
  assert.strictEqual(Number(wx.fidFromSiblingPacks('2042839')), 19621739);
  assert.strictEqual(wx.fidFromSiblingPacks('missing'), null);
} finally {
  if (prev == null) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
}


const wx = require(path.join(root, 'lib/match-weather.js'));
assert.strictEqual(wx.storeTtl({ ok: false, reason: 'upstream' }), 60 * 1000, 'upstream weather misses expire in 60s');
assert.ok(wx.storeTtl({ ok: false, reason: 'no-fixture' }) >= 10 * 60 * 1000);


const onloadLine = appJs.split(/\n/).find((l) => l.includes('onload="this.parentNode.classList.add'));
assert.ok(onloadLine, 'crest onload line present');
assert.doesNotThrow(() => new Function(onloadLine), 'crest onload line must parse');
console.log('mf-leader-388-test ok');

