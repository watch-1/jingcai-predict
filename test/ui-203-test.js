'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const crestDir = path.join(root, 'public/assets/crests');

assert.ok(/function bundledCrestPath/.test(appJs), 'bundledCrestPath');
assert.ok(/if \(_bundledCrestIds === null\) return ''/.test(appJs), 'manifest race: no bundled path before manifest');
assert.ok(/const crestOpts = r\.teamId \? \{ teamId: r\.teamId/.test(appJs), 'data standings/clubvalues teamId');
assert.ok(/teamCrestOpts = r\.teamId/.test(appJs), 'scorers list teamId for badge');
assert.ok(!/await Promise\.race\(\[work, timed\]\);\s*\n\s*try \{ await work/.test(appJs), 'PTR no unbounded re-await after race');
assert.ok(/function hydrateTribeCrests/.test(appJs), 'hydrateTribeCrests');
assert.ok(/onBundled && !img\.dataset\.triedFb/.test(appJs), 'hydrate does not overwrite loading bundled');

const boot = JSON.parse(bootJs);
assert.ok(boot.slices && boot.slices['csl:standings'], 'boot pack includes csl:standings');
const uclRows = boot.slices['ucl:standings'].tables[0].rows.length;
assert.ok(uclRows >= 30, 'ucl boot standings covers league phase (' + uclRows + ')');

const manifest = JSON.parse(fs.readFileSync(path.join(crestDir, 'manifest.json'), 'utf8'));
assert.ok(Array.isArray(manifest.teamIds) && manifest.teamIds.length >= 120, 'bundled manifest team count');
const cslIds = new Set();
for (const r of boot.slices['csl:standings'].tables[0].rows) {
  if (r.teamId) cslIds.add(String(r.teamId));
}
for (const id of cslIds) {
  assert.ok(manifest.teamIds.includes(id), 'CSL team in manifest ' + id);
  assert.ok(fs.existsSync(path.join(crestDir, id + '.png')), 'CSL crest png ' + id);
}

assert.ok(/jc-v1\.9\.203/.test(swJs), 'SW VER 1.9.203');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.203');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.203/.test(ver));
assert.ok(/VERSION_CODE=240/.test(ver));
assert.ok(/version:"1\.9\.203"/.test(fs.readFileSync(path.join(root, 'public/config.js'), 'utf8')));
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.203\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-240\}"/.test(apkSh));
const mani = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
assert.ok(/android:versionCode="240"/.test(mani));
assert.ok(/android:versionName="1\.9\.203"/.test(mani));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.203.md')));

console.log('ui-203-test OK', { crests: manifest.teamIds.length, uclRows, cslTeams: cslIds.size });
