'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const bootPath = path.join(__dirname, '..', 'public', 'data-center-boot.json');
assert.ok(fs.existsSync(bootPath), 'data-center-boot.json exists');
const j = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
assert.ok(j.slices && typeof j.slices === 'object', 'boot pack has slices');
const keys = Object.keys(j.slices);
assert.ok(keys.length >= 12, 'expected many slices, got ' + keys.length);
const eplSt = j.slices['epl:standings'];
assert.ok(eplSt && eplSt.ok && eplSt.tables && eplSt.tables[0].rows.length, 'epl standings slice');
const l1Sc = j.slices['ligue1:topscorers'];
assert.ok(l1Sc && l1Sc.rows && l1Sc.rows.length, 'ligue1 topscorers slice');
console.log('data-center-boot-test ok', { slices: keys.length, generatedAt: j.generatedAt });
