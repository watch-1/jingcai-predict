'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(/const CALC_MULT_MAX = 99999/.test(appJs), 'calc: mult max constant 99999');
assert.ok(/function clampCalcMult/.test(appJs), 'calc: clampCalcMult helper');
assert.ok(!/max="99"/.test(appJs), 'mult inputs not capped at 99');
assert.ok((appJs.match(/max="\$\{CALC_MULT_MAX\}"/g) || []).length >= 2, 'plan + calc submit inputs use CALC_MULT_MAX');
assert.ok(/clampCalcMult\(S\.calcMult/.test(appJs), 'calc: stepper uses clampCalcMult');
assert.ok(/clampCalcMult\(S\.mult/.test(appJs), 'plan: stepper/input uses clampCalcMult');
assert.ok(/S\.mult = clampCalcMult\(S\.mult\)/.test(appJs), 'plan sheet clamps mult on open');

const submitFn = appJs.match(/function openCalcSubmitSheet[\s\S]*?^}/m)?.[0] || '';
assert.ok(/calcResultMatchBlock/.test(submitFn), 'calc result: crest match block');
assert.ok(/types--stack/.test(submitFn), 'calc result: vertical parlay types');

assert.ok(/胜平负\/让球/.test(appJs), 'more plays: WDL section');
assert.ok(/calc-more-crs-band/.test(appJs), 'more plays: CRS bands');
assert.ok(/calc-more-ttg-wrap/.test(appJs), 'more plays: TTG sidebar grid');
assert.ok(/calc-more-hafu-wrap/.test(appJs), 'more plays: HAFU sidebar grid');

assert.ok(/\.calc-more-sheet--official/.test(css), 'css: official more-plays sheet');
assert.ok(/\.calc-rc-match/.test(css), 'css: calc result match crest layout');
assert.ok(/\.types--stack/.test(css), 'css: vertical types stack');

console.log('ui-calc-official-test OK');
