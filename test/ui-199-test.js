'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(/function ensureTribeCatalog\(opts\)/.test(appJs), 'ensureTribeCatalog accepts opts');
assert.ok(/tribeCat\._settled/.test(appJs) || /cat\._settled/.test(appJs), 'settled flag on empty catalog');
assert.ok(/empty-but-settled must NOT re-enter/.test(appJs), 'documents 1.9.198 re-entry fix');
assert.ok(/function fetchTribeBootPackOnce/.test(appJs), 'timed boot fetch helper');
assert.ok(/AbortController/.test(appJs) && /data-center-boot\.json/.test(appJs), 'boot uses AbortController');
assert.ok(/cache:\s*cache \|\| 'no-store'/.test(appJs) || /cache:\s*'no-store'/.test(appJs), 'prefer no-store boot');
assert.ok(/function rebuildTribeCatalogFromCache/.test(appJs), 'rebuild after standings fill');
assert.ok(/ensureTribeCatalog\(\{\s*force:\s*true\s*\}\)/.test(appJs), 'tribeReload forces reload');
assert.ok(/Belt-and-suspenders: never leave spinner stuck/.test(appJs)
  || /if \(S\.tribeCatBusy\)/.test(appJs), 'finally clears tribeCatBusy');
assert.ok(/Promise\.race\(\[work,\s*timed\]\)/.test(appJs), 'PTR race timeout');
assert.ok(/ptr\.classList\.remove\('loading'\)/.test(appJs), 'PTR clears loading class');
// standings → tribe rebuild hook
assert.ok(/standings refresh can fill tribe after purge/.test(appJs)
  && /rebuildTribeCatalogFromCache\(\{\s*renderIfTribe:\s*true\s*\}\)/.test(appJs),
  'loadDataCenter rebuilds tribe after standings');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.267');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.267/.test(ver));
assert.ok(/VERSION_CODE=303/.test(ver));
assert.ok(/jc-v1\.9\.267/.test(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')));
assert.ok(/version:"1\.9\.267"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.267\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-303\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.267.md')));

console.log('ui-199-test OK');
