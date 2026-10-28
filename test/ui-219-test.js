'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

const resultsBody = appJs.match(/function resultsBodyHtml[\s\S]*?^}/m)?.[0] || '';
assert.ok(/matchCard\(x, \{ odds: false \}\)/.test(resultsBody), '开奖: live/upcoming cards without odds grid');
assert.ok(!/matchCard\(x\)\)/.test(resultsBody.replace(/matchCard\(x, \{ odds: false \}\)/g, '')), '开奖: no bare matchCard with default odds');

assert.ok(/function schChannelsHtml/.test(appJs) && /计算器/.test(appJs.match(/function schChannelsHtml[\s\S]*?^}/m)?.[0] || ''), '赛程: 计算器 tab');
assert.ok(/function scheduleCalcHtml/.test(appJs) && /function openCalcSubmitSheet/.test(appJs), '赛程: calculator panel + submit');
assert.ok(/function calcFrom/.test(appJs) && /2 \* \(mult/.test(appJs), 'calc: 2 yuan/note combinatorial math');
assert.ok(/data-act="calcSubmit"/.test(appJs), 'calc: submit action');

assert.ok(/id="calcbar"/.test(html), 'index: calcbar mount');
assert.ok(/\.calcbar/.test(css) && /\.calc-card/.test(css), 'calc UI styles');

assert.ok(/jc-v1\.9\.236/.test(swJs), 'SW VER 1.9.236');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.236');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.236/.test(ver));
assert.ok(/VERSION_CODE=273/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.236');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.236\}"/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-273\}"/.test(apkSh), 'build-apk default VERSION_CODE');

assert.ok(/simultaneousWinPrizeRange/.test(appJs), 'calc: predicted prize uses simultaneous-win totals');
assert.ok(/bets \+= c\.reduce/.test(appJs), 'calc: expands note count');
assert.ok(/中奖试算/.test(appJs.match(/function openCalcSubmitSheet[\s\S]*?^}/m)?.[0] || ''), 'submit sheet shows prize figure');

assert.ok(/function calcMatchClosed/.test(appJs) && /kickoff\(x\)/.test(appJs.match(/function calcMatchClosed[\s\S]*?^}/m)?.[0] || ''), 'calc: close picks after kickoff/live/ft');
assert.ok(/function purgeCalcSelClosed/.test(appJs), 'calc: purge stale selections');
assert.ok(/crsPoolKey\(hg, ag\)/.test(appJs.match(/function calcMoreCrsBand[\s\S]*?^}/m)?.[0] || ''), 'calc more: CRS uses sporttery pool keys');
assert.ok(/body\.sheet-on/.test(css) && /calc-more-scroll/.test(css), 'calc sheet scroll lock styles');

console.log('ui-219-test OK');
