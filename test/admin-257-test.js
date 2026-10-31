#!/usr/bin/env node
/** 1.9.257: 赛程「全部」按竞彩编号平铺，取消联赛分块标题。 */
'use strict';

const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
ok(/VERSION=1\.9\.264/.test(ver) && /VERSION_CODE=300/.test(ver), 'VERSION.txt 1.9.264 / 300');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const bodyFn = appJs.match(/function scheduleBodyHtml[\s\S]*?^}/m)?.[0] || '';
ok(!/lg-group/.test(bodyFn), 'scheduleBodyHtml: no league section groups');
ok(/ls-list/.test(bodyFn), 'scheduleBodyHtml: flat ls-list');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-257');
process.exit(fails ? 1 : 0);
