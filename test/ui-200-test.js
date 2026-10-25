'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

assert.ok(/function tribeCatalogNeedsRebuildFromCache/.test(appJs), 'incomplete-catalog helper');
assert.ok(/tribeCatalogNeedsRebuildFromCache\(\)/.test(appJs), 'helper called');
assert.ok(/catLeagues < cacheLeagues/.test(appJs), 'compares league coverage');
assert.ok(/1\.9\.199\/200: standings refresh rebuilds tribe/.test(appJs)
  || /standings refresh rebuilds tribe when catalog empty OR missing/.test(appJs),
  'standings hook documents incomplete rebuild');
assert.ok(/opts && opts\.eager/.test(appJs), 'badge eager option');
assert.ok(/badge\(t\.nameZh, 'tribe', t\.logo, \{\s*eager:\s*true\s*\}\)/.test(appJs), 'tribe grid eager crests');
assert.ok(/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/' \+ r\.teamId/.test(appJs), 'logo fallback from teamId');
assert.ok(/function hardenTribeCrestImgs/.test(appJs), 'crest harden helper');
assert.ok(/hardenTribeCrestImgs\(main\)/.test(appJs), 'softPatch hardens crests');
assert.ok(/boot pack may arrive after ensureTribeCatalog settled/.test(appJs), 'boot pack rebuilds tribe');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.200');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.200/.test(ver));
assert.ok(/VERSION_CODE=237/.test(ver));
assert.ok(/jc-v1\.9\.200/.test(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8'))
  || /1\.9\.200/.test(fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')));
assert.ok(/version:"1\.9\.200"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.200\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-237\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.200.md')));

console.log('ui-200-test OK');
