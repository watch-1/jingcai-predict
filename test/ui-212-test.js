'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/function matchCardMeta/.test(appJs) && /function matchScoreColumn/.test(appJs), 'shared match row helpers');
assert.ok(/matchCardMeta\(m\)/.test(appJs) && /matchTeamsRow\(m, row\)/.test(appJs), 'matchCard uses reference layout');
assert.ok(/matchCardMeta\(row/.test(appJs) && /matchScoreColumn\(row\)/.test(appJs), 'scoreCard uses reference layout');
assert.ok(!/leagueChips\(model\.day, S\.rsLeague, 'rlg'\)/.test(appJs), '开奖: no league chip row');
assert.ok(!/data-rlg/.test(appJs), '开奖: no rlg chip handler');
assert.ok(/rs-body--flush/.test(appJs) && /\.rs-body--flush/.test(css), '开奖 content flush under date bar');
assert.ok(/\.match-meta/.test(css) && /\.match-st\.red/.test(css), 'reference meta + red status styles');

console.log('ui-212-test OK');
