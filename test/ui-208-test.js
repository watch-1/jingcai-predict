'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const syncJs = fs.readFileSync(path.join(root, 'tools/sync-bundled-players.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/function tmPortraitUrl/.test(appJs), 'tm portrait url helper');
assert.ok(/function dcAvatarImgError/.test(appJs) || /data-net=/.test(appJs), 'avatar fallback chain');
const genBootJs = fs.readFileSync(path.join(root, 'tools/gen-data-center-boot.js'), 'utf8');
assert.ok(
  /function scheduleHomeTribeHotRecover/.test(appJs) || /global:tribeHot/.test(genBootJs),
  'home hot boot seed or recover',
);
assert.ok(/fillHomeTribeHot/.test(appJs), 'home hot feed loader');
assert.ok(/topkeepers.*payload\.preparing/.test(appJs), 'skip empty keeper boot merge');

assert.ok(/img\.a\.transfermarkt\.technology/.test(serverJs), 'TM host allowlist');
assert.ok(/img\.a\.transfermarkt\.technology/.test(serverJs) && /portrait/.test(serverJs), 'TM portrait path rule');

assert.ok(/ESPN_GRAY_PLACEHOLDER_BYTES/.test(syncJs), 'reject gray NO PHOTO png');

const boot = JSON.parse(bootJs);
assert.ok(boot.slices['epl:playervalues'] && boot.slices['epl:playervalues'].rows.length >= 10, 'epl playervalues boot');
assert.ok(!boot.slices['epl:topkeepers'] || (boot.slices['epl:topkeepers'].rows || []).length > 0, 'no empty keeper boot trap');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/players/manifest.json'), 'utf8'));
assert.ok(manifest.playerIds.length >= 165, 'bundled players ' + manifest.playerIds.length);
let gray5969 = 0;
for (const id of manifest.playerIds) {
  const fp = path.join(root, 'public/assets/players', id + '.png');
  const sz = fs.statSync(fp).size;
  if (sz === 5969) gray5969++;
}
assert.strictEqual(gray5969, 0, 'no gray NO PHOTO placeholders in manifest');

assert.ok(/jc-v1\.9\.2\d\d/.test(swJs), 'SW VER 1.9.2xx');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.2\d\d$/.test(pkg.version), 'package 1.9.2xx');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.2\d\d/.test(ver));
assert.ok(/VERSION_CODE=27\d/.test(ver) || /VERSION_CODE=26\d/.test(ver) || /VERSION_CODE=25\d/.test(ver));

console.log('ui-208-test OK', { players: manifest.playerIds.length });
