'use strict';
// 1.9.272: fav-star must not shift kickoff time; list live poll must not reset / skip new-day ids.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const lsJs = fs.readFileSync(path.join(root, 'lib/live-scores.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const main = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');

assert.ok(/VERSION=1\.9\.273/.test(ver));
assert.ok(/VERSION_CODE=309/.test(ver));
assert.ok(/jc-v1\.9\.273/.test(swJs));
assert.strictEqual(pkg.version, '1.9.273');
assert.strictEqual(cfg.version, '1.9.273');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.273\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-309\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.272.md')));
assert.ok(/package="com\.tiicai\.jingcai"/.test(androidManifest), 'package id unchanged');
assert.ok(/android:versionCode="309"/.test(androidManifest));
assert.ok(/android:versionName="1\.9\.273"/.test(androidManifest));

// 1) fav star reserved column — time is not a sibling that space-between can shove inward
const metaFn = appJs.match(/function matchCardMeta\([\s\S]*?^\}/m);
assert.ok(metaFn, 'matchCardMeta present');
assert.ok(/match-meta-time/.test(metaFn[0]) && /match-meta-fav/.test(metaFn[0]), 'time + reserved fav slot');
assert.ok(/always reserve the fav-star column/.test(appJs), 'reserve-slot comment');
assert.ok(/\.match-meta-fav\s*\{/.test(css) && /\.match-meta-time\s*\{/.test(css), 'meta time/fav CSS');
assert.ok(/display:\s*inline-flex/.test(css.match(/\.match-meta-r\s*\{[^}]+\}/)[0]), 'right cluster is a row');
// star is inside the reserved slot, not a third flex child of .match-meta
assert.ok(!/<span class="match-meta-r">\$\{esc\(m\.time/.test(metaFn[0]), 'time no longer a lone flex sibling');

// 2) list live refresh — confirmed lag fixes
assert.ok(/if \(S\.liveScorePoll\) return;/.test(appJs), 'poll interval is not reset on every render');
assert.ok(/const missing = list\.some\(id => !\(S\.liveScores && S\.liveScores\[id\]\)\)/.test(appJs),
  '35s TTL does not skip missing ids');
assert.ok(/function kickScheduleLiveRefresh\(/.test(appJs), 'date/tab kick helper');
assert.ok(/function onScheduleForeground\(/.test(appJs), 'foreground helper');
assert.ok(/kickScheduleLiveRefresh\(\)/.test(appJs.match(/function commitSchDate[\s\S]*?^\}/m)[0]),
  'date change fetches that day immediately');
assert.ok(/switchingTab \|\| canRestore/.test(appJs) && /kickScheduleLiveRefresh\(\)/.test(appJs),
  'TAB_KEEP / tab switch kicks live fetch');
assert.ok(/addEventListener\('pageshow'/.test(appJs), 'WebView pageshow fallback');
assert.ok(/sectionDirty/.test(appJs) && /prevKind === 'ft' \|\| kind === 'ft'/.test(appJs),
  'FT kind change rebuilds 已结束 section');
assert.ok(/sporttery still NS \/ omitted after KO/.test(lsJs), 'AF live=all after KO even if sporttery NS');
assert.ok(/S\._favsLiveKick/.test(appJs), 'favs page one-shot live refresh');

// invariants kept
assert.ok(/--match-mid-col:\s*120px/.test(css), 'desktop mid token remains 120px');
assert.ok(/已结束/.test(appJs), 'finished separator copy');
assert.ok(/score num is-live/.test(appJs), 'live blue scores');
assert.ok(/POST_NOTIFICATIONS/.test(androidManifest), 'notify permission kept');
assert.ok(/goal_alerts/.test(main), 'goal channel id kept');
assert.ok(!/JPUSH_APPKEY=/.test(main), 'JPush wiring untouched in MainActivity');

console.log('ui-271-test OK');
