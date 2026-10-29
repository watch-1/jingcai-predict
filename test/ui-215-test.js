'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/function isMarketUpset/.test(appJs), '开奖爆冷 helper');
assert.ok(/rs-upset-tag/.test(appJs) && /今日爆冷/.test(appJs), '开奖爆冷角标与日汇总');
assert.ok(!/resultTags\(r\)/.test(appJs), '开奖卡片不再渲染底部命中标签');
assert.ok(!/赔率热门.*命中/.test(appJs.split('function resultsBodyHtml')[1] || ''), '日汇总无赔率热门长文案');

assert.ok(/\.rs-body \.mc-result \.rs-upset-tag/.test(css), '爆冷角标样式');
assert.ok(/\.rs-body \.mc-result \.match-meta \{ font-size: 10px/.test(css), '开奖场次信息更小');
assert.ok(/\.rs-body \.mc-result \.mc-teams \.badge[^}]*width: 24px/.test(css), '开奖队徽略大');

assert.ok(/jc-v1\.9\.24\d/.test(swJs), 'SW VER current');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.24\d/.test(pkg.version), 'package version');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.24\d/.test(ver));
assert.ok(/VERSION_CODE=27\d/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.ok(/^1\.9\.24\d/.test(cfg.version), 'config version');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.24/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-27/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-215-test OK');
