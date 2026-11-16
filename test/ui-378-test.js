'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/crests/manifest.json'), 'utf8'));

assert.ok(/216lu31/.test(index), 'cache 216lu31');
assert.ok(!/216lu30/.test(index), 'no stale 216lu30');
assert.ok(/js\/nt-flags\.js\?v=216lu31/.test(index), 'nt-flags.js is loaded');
assert.ok(/data-center-boot-slices\.js\?v=216lu31/.test(index), 'boot slices cache-busted');
assert.ok(/js\/match-weather\.js\?v=216lu31/.test(index), 'match-weather cache-busted');
assert.ok(/style\.css\?v=216lu31/.test(index), 'style cache-busted');
assert.ok(/app\.js\?v=216lu31/.test(index), 'app.js cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.380\}"/.test(apkSh), 'apk default 2.1.5.380');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-380\}"/.test(apkSh), 'apk default 380');

assert.ok(/CFG\.bundledCrestIds/.test(appJs), 'CFG.bundledCrestIds seeds the packed set');
assert.ok(/function isJingcaiOrSportteryLogo/.test(appJs), 'sporttery/jingcai logo guard');
assert.ok(/function isEspnNamespaceClubLogo/.test(appJs), 'ESPN-namespace club logo helper');
assert.ok(/bundledCrestFor\(logo, tid, opts\)/.test(appJs), 'badge passes opts into bundledCrestFor');
assert.ok(/data-bundled=/.test(appJs), 'badge stamps data-bundled on packed crests');
assert.ok(/triedBundled/.test(appJs), 'img onerror restores packed crest before letterizing');
assert.ok(/Packed\/local crests must not be letterized|if \(packed \|\| isLocal\)/.test(appJs), 'harden skips 2.8s letter fallback for packed src');
assert.ok(/idNs: 'espn'/.test(appJs), 'data-center / forum pass espn idNs');
assert.ok(/idsFrom\(www\+"\/assets\/crests\/manifest\.json","teamIds"\)/.test(apkSh.replace(/\s+/g, '')), 'APK config.js embeds bundledCrestIds');
assert.ok(/idsFrom\(www\+"\/assets\/players\/manifest\.json","playerIds"\)/.test(apkSh.replace(/\s+/g, '')), 'APK config.js keeps bundledPlayerIds');

// 377 must not regress: sun at upper-right, sunny 关注, rectangular NT flags with contain.
assert.ok(/preview 377/.test(css), '377 notes stay in CSS');
assert.ok(/object-fit:\s*contain\s*!important/.test(css), 'NT flags use object-fit contain');
assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat kept');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + cfgSrc), 'no token in public JS');

const cfgM = cfgSrc.match(/window\.APP_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
assert.ok(cfgM, 'config.js parses');
const CFG = Function('return (' + cfgM[1] + ')')();
const cfgIds = (CFG.bundledCrestIds || []).map(String);
const manIds = (manifest.teamIds || []).map(String);
assert.ok(cfgIds.length >= 160, 'CFG packed crest list is complete');
assert.strictEqual(cfgIds.length, manIds.length, 'CFG ids match manifest length');
assert.ok(manIds.length === new Set(manIds).size, 'manifest ids are unique');

const screenshotClubs = {
  '359': 'Arsenal',
  '331': 'Brighton',
  '382': 'Man City',
  '364': 'Liverpool',
  '363': 'Chelsea',
  '368': 'Everton',
  '349': 'Bournemouth',
  '337': 'Brentford',
  '83': 'Barcelona',
  '86': 'Real Madrid',
  '110': 'Inter',
  '104': 'Roma',
  '103': 'AC Milan',
};
for (const [id, name] of Object.entries(screenshotClubs)) {
  assert.ok(cfgIds.includes(id) && manIds.includes(id), name + ' ' + id + ' is in CFG/manifest');
  const file = path.join(root, 'public/assets/crests', id + '.png');
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 200, name + ' packed file exists');
}

const extractNamed = (src, name) => {
  const startAsync = src.indexOf('async function ' + name);
  const start = src.indexOf('function ' + name);
  let from = start;
  if (startAsync >= 0 && (start < 0 || startAsync < start)) from = startAsync;
  assert.ok(from >= 0, 'found ' + name);
  let i = src.indexOf('{', from);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  assert.fail('unterminated ' + name);
};

const stub = `
const CFG = ${JSON.stringify({ bundledCrestIds: cfgIds })};
const BUNDLED_CREST_BASE = 'assets/crests/';
let _bundledCrestIds = new Set(CFG.bundledCrestIds.map(String));
` + [
  extractNamed(appJs, 'bundledCrestPath'),
  extractNamed(appJs, 'isNationalFlagLogo'),
  extractNamed(appJs, 'espnIdFromCrestLogo'),
  extractNamed(appJs, 'isJingcaiOrSportteryLogo'),
  extractNamed(appJs, 'isEspnNamespaceClubLogo'),
  extractNamed(appJs, 'bundledCrestFor'),
].join('\n');

const api = new Function(stub + '; return { bundledCrestPath, isNationalFlagLogo, espnIdFromCrestLogo, isJingcaiOrSportteryLogo, isEspnNamespaceClubLogo, bundledCrestFor };')();

const arsenalTsdb = 'https://r2.thesportsdb.com/images/media/team/badge/uyhbfe1612467038.png';
const interEspn = 'https://a.espncdn.com/i/teamlogos/soccer/500/110.png';
const sporttery359 = 'https://static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/359.png';
const sporttery367 = 'https://static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/367.png';
const armFlag = 'https://a.espncdn.com/i/teamlogos/countries/500/arm.png';
const cypFlag = 'https://a.espncdn.com/i/teamlogos/countries/500/cyp.png';
const afBadge = 'https://media.api-sports.io/football/teams/42.png';

assert.strictEqual(
  api.bundledCrestFor(arsenalTsdb, '359'),
  'assets/crests/359.png',
  'Arsenal TSDB logo + ESPN teamId 359 uses the packed crest, not /api/logo'
);
assert.ok(!/api\/logo/.test(api.bundledCrestFor(arsenalTsdb, '359')), 'packed path is not a proxy URL');
assert.strictEqual(
  api.bundledCrestFor(interEspn, '110'),
  'assets/crests/110.png',
  'Inter ESPN logo still resolves to the packed 110 crest'
);
assert.strictEqual(
  api.bundledCrestFor(interEspn, '999'),
  'assets/crests/110.png',
  'ESPN logo id wins over a mismatched teamId'
);

assert.strictEqual(
  api.bundledCrestFor(sporttery359, '359'),
  '',
  'sporttery logo + jingcai tid 359 must not get Arsenal packed crest'
);
assert.strictEqual(
  api.bundledCrestFor(sporttery367, '367'),
  '',
  'sporttery logo + jingcai tid 367 must not get Tottenham packed crest'
);
assert.strictEqual(
  api.bundledCrestFor(sporttery359, '359', { idNs: 'espn' }),
  '',
  'jingcai/sporttery URL still wins even if idNs is espn'
);
assert.strictEqual(
  api.bundledCrestFor(armFlag, '359'),
  '',
  'Armenia flag + jingcai/ESPN-colliding 359 must not use Arsenal crest'
);
assert.strictEqual(
  api.bundledCrestFor(cypFlag, '367'),
  '',
  'Cyprus flag + colliding 367 must not use Tottenham crest'
);
assert.strictEqual(
  api.bundledCrestFor('', '359'),
  '',
  'bare teamId with no logo and no espn ns is not treated as an ESPN id'
);
assert.strictEqual(
  api.bundledCrestFor('https://example.com/unknown/badge.png', '359'),
  '',
  'unknown logo namespace + bare teamId is not treated as an ESPN id'
);
assert.strictEqual(
  api.bundledCrestFor('', '359', { idNs: 'espn' }),
  'assets/crests/359.png',
  'explicit espn idNs may use the packed teamId'
);
assert.strictEqual(
  api.bundledCrestFor(arsenalTsdb, '999', { espnTeamId: '359' }),
  'assets/crests/359.png',
  'opts.espnTeamId is accepted'
);
assert.strictEqual(
  api.bundledCrestFor(afBadge, '359'),
  'assets/crests/359.png',
  'api-sports club badge + packed ESPN teamId uses the packed file'
);
assert.ok(api.isNationalFlagLogo(armFlag), 'Armenia mark is a national flag');
assert.ok(!api.isEspnNamespaceClubLogo(armFlag), 'flags are not ESPN club logos');
assert.ok(!api.isEspnNamespaceClubLogo(sporttery359), 'sporttery is not an ESPN club logo');
assert.ok(api.isEspnNamespaceClubLogo(arsenalTsdb), 'TSDB team badge is ESPN-namespace');

// Flag rows stay on rectangular bundled flags, not club crests (source + resolver).
assert.ok(/function rectangularFlagSrc/.test(appJs), 'rectangularFlagSrc kept');
assert.ok(/function bundledFlagPath/.test(appJs), 'bundledFlagPath kept');
assert.ok(/assets\/flags\//.test(appJs), 'bundled flags live under assets/flags');
assert.ok(!/border-radius:\s*50%/.test(css.match(/\.badge\.flag[^{]*\{[\s\S]*?\}/) ? css.match(/\.badge\.flag[^{]*\{[\s\S]*?\}/)[0] : ''), 'flag badge is not forced circular');

const harden = extractNamed(appJs, 'hardenTribeCrestImgs');
assert.ok(/bundledCrestFor/.test(harden), 'harden consults packed path');
assert.ok(/if \(packed \|\| isLocal\)/.test(harden), 'packed/local crests take a no-letter path');
assert.ok(/img\.src = packed/.test(harden), 'failed remote retries the packed file');
const packedIdx = harden.indexOf('if (packed || isLocal)');
const fallIdx = harden.indexOf('img.onerror()');
assert.ok(packedIdx >= 0 && fallIdx > packedIdx, 'letter fallback stays only for un-packed remotes');
assert.ok(/2800/.test(harden), '2.8s timer still exists for un-packed remotes');

const badgeFn = extractNamed(appJs, 'badge');
assert.ok(/bundledCrestFor\(logo, tid, opts\)/.test(badgeFn), 'badge forwards opts');
assert.ok(/data-bundled/.test(badgeFn), 'badge writes data-bundled');
assert.ok(/triedBundled/.test(badgeFn), 'onerror retries packed crest');
assert.ok(/if\(bundled\)\{if\(cur\.indexOf\(bundled\)<0\)\{img\.src=bundled;\}return;\}/.test(badgeFn.replace(/\s+/g, '')), 'failed remote does not clear a good bundled image');

console.log('ui-378-test OK', { crests: cfgIds.length, version: '2.1.5.380', cache: '216lu31' });
