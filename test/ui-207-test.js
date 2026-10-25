'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const liveJs = fs.readFileSync(path.join(root, 'lib/live-stats.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/function liveStatsNeedsEventsRetry/.test(appJs), 'events gap detector');
assert.ok(/function scheduleLiveStatsRecover/.test(appJs), 'live-stats recover scheduler');
assert.ok(/function matchExpectsLiveStats/.test(appJs), 'match expects live stats');
assert.ok(/function waitForLiveStatsNetworkReady/.test(appJs), 'cold-start network wait');
assert.ok(/function primeDataSliceFromBoot/.test(appJs), 'boot prime before skeleton');
assert.ok(/cache: 'force-cache'/.test(appJs), 'boot force-cache first paint');
assert.ok(/bootPack: !!payload.bootPack/.test(appJs), 'persist bootPack flag');

assert.ok(/function liveEventsLikelyMissing/.test(liveJs), 'server events gap');
assert.ok(/EVENTS_EMPTY_LIVE_MS/.test(liveJs), 'short TTL for empty live events');

const boot = JSON.parse(bootJs);
assert.ok(boot.slices['epl:topassists'] && boot.slices['epl:topassists'].rows.length >= 10, 'epl assists boot');
assert.ok(boot.slices['ligue1:playervalues'] && boot.slices['ligue1:playervalues'].rows.length >= 5, 'ligue1 playervalues boot');
assert.ok(boot.slices['epl:topkeepers'] && boot.slices['epl:topkeepers'].preparing, 'epl topkeepers preparing boot');

assert.ok(/jc-v1\.9\.207/.test(swJs), 'SW VER 1.9.207');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.207');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.207/.test(ver));
assert.ok(/VERSION_CODE=244/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.207');
assert.strictEqual(cfg.bundledPlayerIds.length, 255, '255 bundled players from 1.9.206 pack');

console.log('ui-207-test OK');
