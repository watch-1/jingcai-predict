'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');

assert.ok(/function tryMergeBootPackSlice/.test(appJs), 'boot slice merge on data tab');
assert.ok(/function playerIdForBundledPhoto/.test(appJs), 'playerIdForBundledPhoto');
assert.ok(/loadDataCenterBootPack\(\{ force: true \}\)/.test(appJs), 'boot pack retry');
assert.ok(/dcAbortInflightSlice/.test(appJs), 'watchdog aborts hung DC fetch');
assert.ok(/mergeDcRowsPreferIdentity/.test(appJs), 'network refresh keeps photo/playerId');

const boot = JSON.parse(bootJs);
const pv = boot.slices['laliga:playervalues'];
assert.ok(pv && pv.rows && pv.rows.length >= 10, 'laliga playervalues boot slice');
assert.ok(pv.rows[0].playerId === '362150', 'Yamal playerId in boot');
assert.ok(pv.rows[1].playerId === '231388', 'Mbappé playerId in boot');
assert.ok(pv.rows[0].labelZh && !pv.rows[0].photo, 'boot playervalues slim (no remote photo URLs)');

assert.ok(/bundledPlayerIds/.test(cfgJs), 'config lists bundled player ids');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/players/manifest.json'), 'utf8'));
assert.ok(manifest.playerIds.length >= 115, 'bundled player count grew with 身价前排');
assert.ok(manifest.playerIds.includes('362150'), 'Yamal photo bundled');
assert.ok(manifest.playerIds.includes('252107'), 'Vini photo bundled');

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\./.test(ver));
assert.ok(/VERSION_CODE=24[4-9]/.test(ver) || /VERSION_CODE=25\d/.test(ver) || /VERSION_CODE=26\d/.test(ver) || /VERSION_CODE=27\d/.test(ver));

console.log('ui-205-test OK', { players: manifest.playerIds.length, bootKb: Math.round(bootJs.length / 1024) });
