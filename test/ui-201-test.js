'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/const CREST_IDB_NAME = 'jc-crests-v1'/.test(appJs), 'crest IDB name');
assert.ok(/function crestCacheKey/.test(appJs), 'crestCacheKey');
assert.ok(/function crestIdbGet/.test(appJs), 'crestIdbGet');
assert.ok(/function crestIdbPut/.test(appJs), 'crestIdbPut');
assert.ok(/function crestIdbClear/.test(appJs), 'crestIdbClear');
assert.ok(/function warmCrestCacheForTeams/.test(appJs), 'warmCrestCacheForTeams');
assert.ok(/function hydrateTribeCrests/.test(appJs), 'hydrateTribeCrests');
assert.ok(/function crestCacheFromRemote/.test(appJs), 'crestCacheFromRemote');
assert.ok(/_crestMem\.has\(ckey\)/.test(appJs), 'badge prefers mem blob');
assert.ok(/data-crest-key=/.test(appJs), 'badge data-crest-key');
assert.ok(/teamId:\s*t\.teamId/.test(appJs), 'tribe grid passes teamId');
assert.ok(/hydrateTribeCrests\(main\)/.test(appJs), 'softPatch hydrates');
assert.ok(/warmCrestCacheForTeams\(cat\.teams/.test(appJs), 'catalog warms crests');
assert.ok(/await crestIdbClear\(\)/.test(appJs), 'clearCache clears crest IDB');
assert.ok(/r\.name === 'tribe' \|\| r\.name === 'tribe-club'/.test(appJs), 'render hydrates tribe');

assert.ok(/const CREST_CACHE = 'jc-crests-v1'/.test(swJs), 'SW durable crest cache');
assert.ok(/k !== VER && k !== CREST_CACHE/.test(swJs), 'SW activate keeps crest cache');
assert.ok(/staleWhileRevalidate\(CREST_CACHE/.test(swJs), 'logo uses CREST_CACHE');
assert.ok(/jc-v1\.9\.201/.test(swJs), 'SW VER 1.9.201');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.201');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.201/.test(ver));
assert.ok(/VERSION_CODE=238/.test(ver));
assert.ok(/version:"1\.9\.201"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.201\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-238\}"/.test(apkSh));
const mani = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
assert.ok(/android:versionCode="238"/.test(mani));
assert.ok(/android:versionName="1\.9\.201"/.test(mani));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.201.md')));

console.log('ui-201-test OK');
