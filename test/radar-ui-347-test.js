'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(app.includes('function radarLowChips'), 'low-value chip helper');
assert.ok(app.includes("p.lowValueChip || '参考价值偏低'"), 'compact chip copy');
assert.ok(app.includes('p.lowValueNote'), 'expand uses the full 参考价值偏低：窗口仅 Y 场 / X 分钟 sentence');
assert.ok(app.includes('thinPoolNote') || app.includes('样本偏少'), 'thin-pool copy');
const lowFn = app.slice(app.indexOf('function radarLowChips'), app.indexOf('function playerRadarMeta'));
assert.ok(!lowFn.includes('示意'), 'low-value chips must not use 示意 wording');

const preview = app.slice(app.indexOf('function playerRadarPreview'), app.indexOf('function playerRadarCardHtml'));
assert.ok(preview.includes('radarLowChips(p, false)'), 'compact card shows the low-value chip');
assert.ok(preview.includes('playerRadarMeta'), 'one-line meta kept');
assert.ok(preview.includes('rk-chip'), 'winger chip still present');

const poolHtml = app.slice(app.indexOf('function radarPlayerPoolHtml'), app.indexOf('function radarPlayerH2hHtml') > 0 ? app.indexOf('function radarPlayerH2hHtml') : app.length);
assert.ok(poolHtml.includes('rk-cap warn'), 'expand page shows the fuller low-value sentence');
assert.ok(poolHtml.includes('lowValueNote'), 'full note on expand');

assert.ok(app.includes('openRadarPlayerPicker') && app.includes('radarLowChips(p, false)'), '更换球员 list shows the chip');
assert.ok(css.includes('.rk-chip.low'), 'low-value chip style (not 示意)');
assert.ok(css.includes('.sm-radar-card .meta'), 'meta still one-line');

// no layout regressions
assert.ok(app.includes('rk-radar-board') && !app.includes('function radarContribRingHtml'), '345 in-flow board kept');
assert.ok(app.includes('data-act="radarContrib"') && app.includes('data-act="radarExpandBack"'), '346 jumps + back kept');
const sizeM = preview.match(/compact:\\s*true,\\s*size:\\s*(\\d+)/) || preview.match(/compact:\s*true,\s*size:\s*(\d+)/);
assert.ok(sizeM && Number(sizeM[1]) >= 120 && Number(sizeM[1]) <= 132, 'compact tiles kept');
assert.ok(css.includes('.sm-kit.sm-value { padding: 10px 10px 8px'), '身价 tightness kept');
assert.ok(!preview.includes('暂按前锋对照') || preview.includes('rk-chip'), 'winger is a chip');

console.log('radar UI 347 source tests OK');
