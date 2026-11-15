'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

// Compact one-line player-radar meta.
assert.ok(app.includes('function playerRadarMeta'), 'playerRadarMeta helper');
assert.ok(app.includes('poolLabelShort'), 'uses backend short caption');
assert.ok(app.includes('class="meta"'), 'meta sits on its own full-width row');
assert.ok(css.includes('.sm-radar-card .meta'), 'meta CSS');
assert.ok(css.includes('white-space: nowrap'), 'one-line nowrap');
assert.ok(css.includes('text-overflow: ellipsis'), 'ellipsis fallback');

// Preview HTML: chip is the only 暂按前锋对照; sub does not include it.
const previewFn = app.slice(app.indexOf('function playerRadarPreview'), app.indexOf('function playerRadarCardHtml'));
assert.ok(previewFn.includes('rk-chip'), 'winger badge is a chip');
assert.ok(previewFn.includes('playerRadarMeta'), 'preview uses compact meta');
assert.ok(!previewFn.includes('sub">${esc(pool)}</div>${wing}'), 'old stacked sub+chip under name is gone');

const cardFn = app.slice(app.indexOf('function playerRadarCardHtml'), app.indexOf('function paintMatchRadar'));
assert.ok(!cardFn.includes('暂按前锋对照'), 'section caption must not also say 暂按前锋对照');

// Team radar carries contributor labels (344: HTML chips with avatars, not SVG text).
assert.ok(app.includes('function radarTeamContributors'), 'contributor helper');
assert.ok(app.includes('rk-contrib-chip') || app.includes('radarContribChipHtml') || app.includes('radar-contrib'), 'contributor chips (or legacy svg class)');
assert.ok(app.includes('rk-xi-row'), 'expand page lists the theoretical XI');
assert.ok(app.includes('理论最强 11 人'), 'copy names the XI');

console.log('radar UI 343 source tests OK');
