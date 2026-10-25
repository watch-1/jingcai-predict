'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const crestDir = path.join(root, 'public/assets/crests');

assert.ok(/function bundledCrestPath/.test(appJs), 'bundledCrestPath');
assert.ok(/BUNDLED_CREST_BASE = 'assets\/crests\/'/.test(appJs), 'bundled crest base path');
assert.ok(/BUNDLED_CREST_BASE \+ tid \+ '\.png'/.test(appJs), 'bundled crest file pattern');
assert.ok(/const bundled = bundledCrestPath\(tid\)/.test(appJs), 'badge uses bundledCrestPath');
assert.ok(/data-fb=/.test(appJs), 'badge bundled→api fallback');
assert.ok(!/warmCrestCacheForTeams\(cat\.teams[^)]*\)\.then\(paint\)/.test(appJs), 'catalog does not gate paint on warm');
assert.ok(/paint\(\);\s*\n\s*try \{ warmCrestCacheForTeams/.test(appJs), 'paint before warm crest');
assert.ok(/function hydrateTribeCrests/.test(appJs), 'hydrateTribeCrests');
assert.ok(/Promise\.all\(jobs\)\.catch/.test(appJs), 'hydrate does not await remote jobs');
assert.ok(!/if \(jobs\.length\) await Promise\.all\(jobs\)/.test(appJs), 'no blocking hydrate await');

const manifest = JSON.parse(fs.readFileSync(path.join(crestDir, 'manifest.json'), 'utf8'));
assert.ok(Array.isArray(manifest.teamIds) && manifest.teamIds.length >= 80, 'bundled manifest team count');
for (const id of manifest.teamIds.slice(0, 12)) {
  assert.ok(fs.existsSync(path.join(crestDir, id + '.png')), 'crest png ' + id);
}
assert.ok(fs.existsSync(path.join(root, 'tools/sync-bundled-crests.js')), 'sync script');

assert.ok(/jc-v1\.9\.202/.test(swJs), 'SW VER 1.9.202');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.202');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.202/.test(ver));
assert.ok(/VERSION_CODE=239/.test(ver));
assert.ok(/version:"1\.9\.202"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.202\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-239\}"/.test(apkSh));
const mani = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
assert.ok(/android:versionCode="239"/.test(mani));
assert.ok(/android:versionName="1\.9\.202"/.test(mani));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.202.md')));

console.log('ui-202-test OK');
