'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const mapPath = path.join(root, 'public/assets/crests/sporttery-map.json');
const manifestPath = path.join(root, 'public/assets/crests/manifest.json');
const crestDir = path.join(root, 'public/assets/crests');

assert.ok(/function bundledCrestFor/.test(appJs), 'bundledCrestFor');
assert.ok(/function normalizeSportteryCrestMap/.test(appJs), 'normalizeSportteryCrestMap');
assert.ok(/CFG\.sportteryCrests \|\| CFG\.bundledSportteryCrests/.test(appJs), 'map loaded from CFG at startup');
assert.ok(/sporttery-map\.json/.test(appJs), 'map also loaded from assets JSON');
assert.ok(/Never treat unmapped bare jingcai ids as ESPN ids/.test(appJs), 'namespace safeguard comment');
assert.ok(/Never treat jingcai ids as ESPN ids/.test(appJs), '359 Armenia comment kept');

const extract = (name) => {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}\\n');
  const m = appJs.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
};

const athleticTsdb = 'https://r2.thesportsdb.com/images/media/team/badge/68w7fe1639408210.png';
const arsenalTsdb = 'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png';
const kashimaEspn = 'https://a.espncdn.com/i/teamlogos/soccer/500/7115.png';
const wanderersEspn = 'https://a.espncdn.com/i/teamlogos/soccer/500/13696.png';
const armFlag = 'https://a.espncdn.com/i/teamlogos/countries/500/arm.png';

const stub = `
const BUNDLED_CREST_BASE = 'assets/crests/';
let _bundledCrestIds = new Set(['83','88','93','122','132','137','166','359','367','7115','13696']);
let _sportteryCrests = { '506': '93', '137': '132', '166': '122', '510': '88' };
` + [
  extract('bundledCrestPath'),
  extract('isNationalFlagLogo'),
  extract('espnIdFromCrestLogo'),
  extract('isJingcaiOrSportteryLogo'),
  extract('isEspnNamespaceClubLogo'),
  extract('bundledCrestFor'),
].join('\n');

const api = new Function(stub + '; return { bundledCrestPath, isNationalFlagLogo, espnIdFromCrestLogo, bundledCrestFor };')();

assert.strictEqual(
  api.bundledCrestFor(athleticTsdb, '506'),
  'assets/crests/93.png',
  '体彩 506 + Athletic TSDB logo resolves to packed ESPN 93, not 506.png'
);
assert.strictEqual(
  api.bundledCrestFor(arsenalTsdb, '359'),
  '',
  '体彩 id 359 colliding with Arsenal ESPN id still does not open 359.png'
);
assert.strictEqual(
  api.bundledCrestFor(arsenalTsdb, '367'),
  '',
  'unmapped 体彩 367 + TSDB logo does not open Tottenham 367.png'
);
assert.strictEqual(
  api.bundledCrestFor(kashimaEspn, '551'),
  'assets/crests/7115.png',
  'Friday ESPN logo 7115 (鹿岛) resolves from the URL, not the 体彩 teamId'
);
assert.strictEqual(
  api.bundledCrestFor(wanderersEspn, '1686'),
  'assets/crests/13696.png',
  'Friday ESPN logo 13696 (西悉尼) resolves from the URL'
);
assert.strictEqual(
  api.bundledCrestFor('', '99999'),
  '',
  'unmapped 体彩 id + no espn URL stays unbundled'
);
assert.strictEqual(
  api.bundledCrestFor('https://example.com/unknown/badge.png', '99999'),
  '',
  'unmapped id + unknown logo stays unbundled'
);
assert.strictEqual(
  api.bundledCrestFor(armFlag, '359'),
  '',
  'Armenia flag must not use a mapped or packed club crest'
);
assert.strictEqual(
  api.bundledCrestFor('https://r2.thesportsdb.com/images/media/team/badge/01ogkh1716960412.png', '137'),
  'assets/crests/132.png',
  '拜仁 体彩 137 maps to packed Bayern ESPN 132, not Werder 137.png'
);
assert.ok(!fs.existsSync(path.join(crestDir, '506.png')), 'do not pack Athletic under 体彩 id 506');
assert.ok(!fs.existsSync(path.join(crestDir, '137.png')) || true, '137.png may exist as Werder; must not be used for 拜仁');

// Packed files + official map (written by sync-bundled-crests.js)
assert.ok(fs.existsSync(mapPath), 'sporttery-map.json exists');
assert.ok(fs.existsSync(manifestPath), 'manifest.json exists');
const mapDoc = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const map = mapDoc.map || mapDoc.sportteryCrests || mapDoc;
assert.ok(map && typeof map === 'object', 'map object');
assert.strictEqual(String(map['506']), '93', 'official map 506 → Athletic 93');
assert.notStrictEqual(String(map['137'] || ''), '137', '拜仁 must not map to colliding ESPN id 137');
assert.strictEqual(String(map['137']), '132', 'official map 137 → Bayern 132');
assert.ok(['88', '88.png'].includes(String(map['510'])), '西班牙人 maps to Espanyol ESPN 88, not 83 or 510');
assert.ok(['13696', '13696.png'].includes(String(map['1686'])), '西悉尼 maps to ESPN 13696');
assert.ok(['7115', '7115.png'].includes(String(map['551'])), '鹿岛 maps to ESPN 7115');
const fileOf = (tid) => {
  let id = String(map[tid] || '');
  if (id.endsWith('.png')) id = id.slice(0, -4);
  return id;
};
for (const tid of ['1686', '1096', '552', '886', '551', '558', '138', '705', '243', '745', '137', '166', '198', '194', '506', '510']) {
  const fileId = fileOf(tid);
  assert.ok(fileId, 'friday team ' + tid + ' is in the map');
  assert.ok(/^\d+$/.test(fileId) || /^jc-\d+$/.test(fileId), 'friday ' + tid + ' uses ESPN or jc- prefix, got ' + fileId);
  assert.notStrictEqual(fileId, tid, 'friday 体彩 id ' + tid + ' is not used as the packed filename (collision risk)');
  assert.ok(fs.existsSync(path.join(crestDir, fileId + '.png')), 'packed file exists for ' + tid + ' → ' + fileId);
  const st = fs.statSync(path.join(crestDir, fileId + '.png'));
  assert.ok(st.size > 400, 'packed file for ' + tid + ' is a real image');
}
assert.ok(fs.existsSync(path.join(crestDir, '7115.png')) && fs.statSync(path.join(crestDir, '7115.png')).size > 400, '7115.png packed');
assert.ok(fs.existsSync(path.join(crestDir, '13696.png')) && fs.statSync(path.join(crestDir, '13696.png')).size > 400, '13696.png packed');
assert.ok(Array.isArray(manifest.teamIds) && manifest.teamIds.map(String).includes('7115'), 'manifest lists 7115');
assert.ok(manifest.sportteryCrests && manifest.sportteryCrests['506'] === '93', 'manifest embeds the map');

console.log('ui-crest-sporttery-map-test OK');
