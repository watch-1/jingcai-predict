#!/usr/bin/env node
/** Hotfix 1.9.255: renderSparkline duplicate const (blank /admin). */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
ok(/VERSION=1\.9\.255/.test(ver) && /VERSION_CODE=291/.test(ver), 'VERSION.txt 1.9.255 / 291');

const adminPath = path.join(__dirname, '../public/admin/admin.js');
try {
  execSync(`node --check ${JSON.stringify(adminPath)}`, { stdio: 'pipe' });
  ok(true, 'node --check public/admin/admin.js');
} catch (e) {
  ok(false, 'node --check public/admin/admin.js');
}

const src = fs.readFileSync(adminPath, 'utf8');
const fnMatch = src.match(/function renderSparkline\([\s\S]*?\n  \}/);
ok(fnMatch, 'renderSparkline function found');
if (fnMatch) {
  const body = fnMatch[0];
  const constVals = (body.match(/\bconst vals\b/g) || []).length;
  ok(constVals === 0, 'renderSparkline has no duplicate const vals');
  ok(body.includes('rawVals') && body.includes('fallbackVals'), 'renderSparkline uses rawVals + fallbackVals');
  ok(body.includes('spark-empty-hint'), 'empty-state markup preserved');
}

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-255');
process.exit(fails ? 1 : 0);
