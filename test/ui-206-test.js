'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const syncJs = fs.readFileSync(path.join(root, 'tools/sync-bundled-players.js'), 'utf8');
const playerDir = path.join(root, 'public/assets/players');

const AF_PLACEHOLDER_MD5 = '430d67fd79ad0a355b212d5780886e34';

assert.ok(/function isAfEspnIdPhotoUrl/.test(appJs), 'reject AF placeholder URLs with ESPN id');
assert.ok(/function pickDcNetworkPhoto/.test(appJs), 'network photo picks non-junk url');
assert.ok(!/af-id-fallback/.test(fs.readFileSync(path.join(root, 'lib/espn-tables.js'), 'utf8')), 'no ESPN→AF id photo fallback');
assert.ok(/AF_PLACEHOLDER_MD5/.test(syncJs), 'sync detects AF placeholder png');
assert.ok(/optimizePlayerPng/.test(syncJs), 'sync compresses headshots');

const manifest = JSON.parse(fs.readFileSync(path.join(playerDir, 'manifest.json'), 'utf8'));
assert.ok(manifest.playerIds.length >= 240, 'bundled player count ~full boards (' + manifest.playerIds.length + ')');
assert.ok(manifest.playerIds.includes('231388'), 'Mbappé bundled');
assert.ok(manifest.playerIds.includes('252107'), 'Vinícius bundled');
assert.ok(manifest.playerIds.includes('253989'), 'Haaland bundled');
assert.ok(manifest.playerIds.includes('362150'), 'Yamal bundled');

let bad = 0;
let bytes = 0;
for (const id of manifest.playerIds) {
  const fp = path.join(playerDir, id + '.png');
  assert.ok(fs.existsSync(fp), 'png ' + id);
  const buf = fs.readFileSync(fp);
  bytes += buf.length;
  if (buf.length === 5192 && crypto.createHash('md5').update(buf).digest('hex') === AF_PLACEHOLDER_MD5) bad++;
  assert.ok(buf.length > 1200, 'png size ok ' + id);
}
assert.strictEqual(bad, 0, 'no API-Football placeholder pngs in manifest');

assert.ok(/bundledPlayerIds/.test(cfgJs), 'config lists bundled player ids');
assert.ok(/version:"1\.9\.206"/.test(cfgJs), 'config version 1.9.206');

assert.ok(/jc-v1\.9\.206/.test(swJs), 'SW VER 1.9.206');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.206');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.206/.test(ver));
assert.ok(/VERSION_CODE=243/.test(ver));

console.log('ui-206-test OK', {
  players: manifest.playerIds.length,
  mb: (bytes / 1048576).toFixed(2),
});
