'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(/calcbar-mult-wrap/.test(appJs) && /openCalcMultSheet/.test(appJs), 'calcbar: mult opens keypad sheet');
assert.ok(/openCalcComboSheet/.test(appJs) && /calc-combo-btns/.test(appJs), 'calcbar: combo bottom sheet buttons');
assert.ok(/openCalcMultSheet/.test(appJs) && /calc-mult-pad/.test(appJs), 'calcbar: mult keypad sheet');
assert.ok(/预测奖金.*calcbar-prize/.test(appJs), 'calcbar: predicted prize range row');
assert.ok(/function calcSubmitSheetOpen/.test(appJs), 'calcbar: sheet-open guard for type/mult');
assert.ok(/calcSubmitSheetOpen\(\)\) return openCalcSubmitSheet/.test(appJs), 'calcType/calcMult refresh bar when sheet closed');

assert.ok(/bonus-opt-prize-range/.test(appJs), 'bonus opt footer: prize range markup');
assert.ok(/totals\.min\.toFixed/.test(appJs) && /totals\.max\.toFixed/.test(appJs), 'bonus opt footer: min/max from totals');
assert.ok(/simultaneousWinPrizeRange/.test(appJs), 'predicted prize range uses simultaneous-win sums');

assert.ok(!/b8d4ff/.test(css), 'calc-card: no harsh blue gradient stop');
assert.ok(/\.calc-card[\s\S]*?border: 0/.test(css), 'calc-card: no outline border');
assert.ok(/\.calcbar\.has-sel/.test(css), 'calcbar: selected-state layout');

console.log('calc-bar-230-test OK');
