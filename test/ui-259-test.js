'use strict';
// 1.9.259: 赛程/开奖列表 未开赛「VS」与比分中心列同宽，队名水平位置对齐。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.271/.test(ver));
assert.ok(/VERSION_CODE=307/.test(ver));
assert.ok(/jc-v1\.9\.271/.test(swJs));
assert.strictEqual(pkg.version, '1.9.271');
assert.strictEqual(cfg.version, '1.9.271');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.271\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-307\}"/.test(apkSh));

assert.ok(/--match-mid-col:\s*120px/.test(css), 'shared center column token');

const mcGrid = css.match(/\.mc-teams \{[^}]+\}/);
assert.ok(mcGrid, 'mc-teams rule');
assert.ok(/minmax\(0,\s*1fr\)\s+var\(--match-mid-col\)\s+minmax\(0,\s*1fr\)/.test(mcGrid[0]),
  'mc-teams uses fixed shared center track (not auto)');

const lsGrid = css.match(/\.ls-body \{[\s\S]*?\}/);
assert.ok(lsGrid, 'ls-body rule');
assert.ok(/minmax\(0,\s*1fr\)\s+var\(--match-mid-col\)\s+minmax\(0,\s*1fr\)/.test(lsGrid[0]),
  'ls-body uses the same shared center track');

assert.ok(!/\.mc-mid \{[^}]*min-width:\s*62px/.test(css), 'old 62px mc-mid floor removed');
assert.ok(!/\.ls-mid \{[^}]*min-width:\s*62px/.test(css), 'old 62px ls-mid floor removed');

const scoreCol = appJs.match(/function matchScoreColumn\([\s\S]*?^\}/m);
assert.ok(scoreCol, 'matchScoreColumn');
assert.ok(/class="vs">VS<\/div>/.test(scoreCol[0]), 'NS rows still render VS in the shared mid cell');
assert.ok(/class="score num"/.test(scoreCol[0]), 'live/FT still render score in the shared mid cell');
assert.ok(/function matchTeamsRow\(/.test(appJs) && /class="mc-mid"/.test(appJs), '开奖/赛程 cards still use mc-mid');
assert.ok(/class="ls-mid"/.test(appJs), 'schedule 比分 list still uses ls-mid');

console.log('ui-259-test OK');
