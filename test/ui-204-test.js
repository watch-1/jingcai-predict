'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const playerDir = path.join(root, 'public/assets/players');

assert.ok(/function mergeStandingsPreferTeamIds/.test(appJs), 'standings teamId merge');
assert.ok(/function bundledPlayerPath/.test(appJs), 'bundledPlayerPath');
assert.ok(/function dcPlayerPhotoSrc/.test(appJs), 'dcPlayerPhotoSrc');
assert.ok(/scheduleDcBodyWatchdog/.test(appJs), 'DC skeleton watchdog');
assert.ok(/loadDataCenterBootPack\(\)/.test(appJs) && /fetchTribeBootPackOnce/.test(appJs), 'boot pack no-store');

const boot = JSON.parse(bootJs);
const l1 = boot.slices['ligue1:standings'];
assert.ok(l1 && l1.tables[0].rows.every((r) => r.teamId), 'ligue1 boot standings all have teamId');
const csl = boot.slices['csl:standings'].tables[0].rows;
assert.ok(csl.some((r) => r.teamZh === '大连英博'), 'Dalian Yingbo zh');
assert.ok(csl.some((r) => r.teamZh === '深圳新鹏城'), 'Shenzhen zh');

const manifest = JSON.parse(fs.readFileSync(path.join(playerDir, 'manifest.json'), 'utf8'));
assert.ok(manifest.playerIds && manifest.playerIds.length >= 80, 'bundled player count');
for (const id of manifest.playerIds.slice(0, 5)) {
  assert.ok(fs.existsSync(path.join(playerDir, id + '.png')), 'player png ' + id);
}

assert.ok(/jc-v1\.9\.204/.test(swJs), 'SW VER 1.9.204');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.204');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.204/.test(ver));
assert.ok(/VERSION_CODE=241/.test(ver));
assert.ok(fs.existsSync(path.join(root, 'tools/sync-bundled-players.js')));

console.log('ui-204-test OK', { players: manifest.playerIds.length });
