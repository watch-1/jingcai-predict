'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientWx = fs.readFileSync(path.join(root, 'public/js/match-weather.js'), 'utf8');

assert.ok(/216lu26/.test(index), 'cache 216lu26');
assert.ok(!/216lu25/.test(index), 'no stale 216lu25');
assert.ok(/js\/nt-flags\.js\?v=216lu26/.test(index), 'nt-flags.js is loaded');
assert.ok(/data-center-boot-slices\.js\?v=216lu26/.test(index), 'boot slices cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.375\}"/.test(apkSh), 'apk default 2.1.5.375');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-375\}"/.test(apkSh), 'apk default 375');

assert.ok(/preview 370/.test(css), '370 css (sky/rain) left in place');
assert.ok(!/wx-drift-sky/.test(css), 'no hitchy alternate sky keyframe');
assert.ok(/@keyframes wx-pan-sky/.test(css) && /translate3d\(-50%/.test(css), 'one-way 50% sky pan');
assert.ok(/52s linear infinite/.test(css), 'sky pan is linear, not ease-in-out');
assert.ok(!/hero-wx-drops/.test(css), 'no lens droplet canvas CSS');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-sky::before/.test(css), 'sky pan pauses on wx-paused');

assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(!/assets\/weather\/drops\.png/.test(appJs), 'no filled droplet sticker sheet');
assert.ok(!/function bindHeroRainDrops/.test(appJs), 'bindHeroRainDrops removed');
assert.ok(/rectangularFlagSrc/.test(appJs), 'rectangular NT flags kept');
assert.ok(/function formatHeroRank/.test(appJs) && /小组/.test(appJs), '小组 label kept');
assert.ok(/hero-lg-block/.test(appJs), 'title+time block kept');
assert.ok(/function officialStatusZh/.test(appJs), 'Selling/Define are translated');
assert.ok(/officialStatusZh\(statusLab/.test(appJs), 'hero uses officialStatusZh');

assert.ok(/function resolveFlagIso2/.test(appJs), 'name+logo flag resolver');
assert.ok(/function matchTeamBadge/.test(appJs), 'match badges pass league');
assert.ok(/classList\.contains\('flag'\)/.test(appJs), 'hydrateTribeCrests skips flags');
assert.ok(/function acceptMatchPayload/.test(appJs), 'client sample fallback guard');
assert.ok(/warmVisibleScheduleDay/.test(appJs), 'day tab warms in the background');

assert.ok(/\.badge\.crest\.flag/.test(css), 'list flags have rectangular CSS');
assert.ok(/12\.6vw/.test(css) && /8\.4vw/.test(css), 'hero flags slightly smaller than fig 4');
assert.ok(/max-width:\s*66px/.test(css) && /max-height:\s*44px/.test(css), 'hero flag max slightly under 72×48');
assert.ok(!/width:\s*13\.8vw/.test(css), 'fig-4 13.8vw hero flag size retired');

assert.ok(/liveFallbackPayload/.test(serverJs), 'server uses last-good live fallback');
assert.ok(!/mergeSeenIntoResults\(sampleData\)/.test(serverJs), 'sample is not merged into live results');
assert.ok(/nearby-prefetch/.test(serverJs), 'nearby prefetch job is wired');
assert.ok(/reason: 'timeout'/.test(serverJs), 'live-stats has a hard timeout');
assert.ok(/peekCachedPayload/.test(serverJs), 'live-stats does not refresh the slate to enrich');
assert.ok(/upload\.wikimedia\.org/.test(serverJs), 'logo proxy allows wikimedia');

assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');
assert.ok(/flagcdn\.com/.test(serverJs), 'logo proxy still allows flagcdn');

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

const enrichFn = extractNamed(appJs, 'enrichMatchDetail');
assert.ok(!/await loadLiveStats/.test(enrichFn), 'enrichMatchDetail does not await loadLiveStats');
assert.ok(/loadLiveStats\(x\)\.then/.test(enrichFn), 'kicked-off live-stats runs in the background');
assert.ok(!/await loadLiveStats/.test(extractNamed(appJs, 'ensureMatchWeather')), 'weather path still has no loadLiveStats');

const extract = (name) => {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}\\n');
  const m = appJs.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
};
const mapStart = appJs.indexOf('const FLAG_CODE_TO_ISO2 = {');
const mapEnd = appJs.indexOf('};', mapStart);
assert.ok(mapStart >= 0 && mapEnd > mapStart, 'FLAG_CODE_TO_ISO2');
const stub = appJs.slice(mapStart, mapEnd + 2) + ';\n'
  + extract('isNationalFlagLogo')
  + extract('flagIso2FromLogo')
  + extract('flagcdnUrl')
  + extract('bundledFlagPath')
  + extract('rectangularFlagSrc');
const api = new Function(stub + '; return { isNationalFlagLogo, flagIso2FromLogo, flagcdnUrl, bundledFlagPath, rectangularFlagSrc };')();
assert.strictEqual(api.flagIso2FromLogo('https://a.espncdn.com/i/teamlogos/countries/500/arm.png'), 'am');
assert.strictEqual(api.rectangularFlagSrc('https://a.espncdn.com/i/teamlogos/countries/500/arm.png'), 'assets/flags/am.png');
assert.strictEqual(api.flagIso2FromLogo('https://a.espncdn.com/i/teamlogos/soccer/500/359.png'), '');

assert.ok(/版本 /.test(appJs) && /构建 /.test(appJs), 'about line still renders 版本 / 构建');

/* ── 375: photo heuristic, bundled first, omit below-cutoff, instant detail ── */
assert.ok(/function playerIdNamespace/.test(appJs), 'playerIdNamespace');
assert.ok(/function isAfEspnIdPhotoUrl/.test(appJs), 'isAfEspnIdPhotoUrl');
assert.ok(/function filterScorerRowsForDisplay/.test(appJs), 'filterScorerRowsForDisplay');
assert.ok(/function bundledPlayerPathForRow/.test(appJs), 'bundledPlayerPathForRow');
assert.ok(/function afPlayerDetailHtml/.test(appJs), 'afPlayerDetailHtml');
assert.ok(/function teamDetailFirstHtml/.test(appJs), 'teamDetailFirstHtml');
assert.ok(/function stashDetailHintFromEl/.test(appJs), 'stashDetailHintFromEl');
assert.ok(/function hydratePlayerPhotos/.test(appJs), 'hydratePlayerPhotos');
assert.ok(/PHOTO_IDB_NAME/.test(appJs), 'player photo IDB');
assert.ok(/function saveOfficialPlayerPhoto/.test(appJs), 'incremental official photo save');
assert.ok(/DC_PHOTO_QUALITY_BAR = 10/.test(appJs), 'top-10 quality bar');

const photoStub = [
  'const API = "";',
  'const IS_APP = true;',
  'const BUNDLED_PLAYER_BASE = "assets/players/";',
  'const _bundledPlayerIds = new Set(["384482", "259481", "tm-687626"]);',
  'const _photoMem = new Map();',
  'function playerIdForBundledPhoto(row) { return row && row.playerId != null ? String(row.playerId) : ""; }',
  extractNamed(appJs, 'playerIdNamespace'),
  extractNamed(appJs, 'isAfEspnIdPhotoUrl'),
  extractNamed(appJs, 'pickDcNetworkPhoto'),
  extractNamed(appJs, 'bundledPlayerPath'),
  extractNamed(appJs, 'bundledPlayerPathForRow'),
  extractNamed(appJs, 'dcPlayerPhotoSrc'),
  'const DC_PHOTO_QUALITY_BAR = 10;',
  extractNamed(appJs, 'leaderRowHasUsablePhoto'),
  extractNamed(appJs, 'filterScorerRowsForDisplay'),
  'function espnSoccerHeadshotUrl(id){ return id ? "https://a.espncdn.com/i/headshots/soccer/players/full/"+id+".png" : ""; }',
  'function tmPortraitUrl(id){ return id ? "https://img.a.transfermarkt.technology/portrait/header/"+id+".jpg" : ""; }',
].join('\n');
const photoApi = new Function(photoStub + '; return { playerIdNamespace, isAfEspnIdPhotoUrl, pickDcNetworkPhoto, bundledPlayerPath, bundledPlayerPathForRow, dcPlayerPhotoSrc, filterScorerRowsForDisplay, leaderRowHasUsablePhoto };')();

// (1) AF photo is kept when playerId is the AF id
const afRow = {
  playerId: '12345',
  afPlayerId: '12345',
  photo: 'https://media.api-sports.io/football/players/12345.png',
  idNs: 'af',
};
assert.strictEqual(photoApi.playerIdNamespace(afRow), 'af');
assert.strictEqual(photoApi.isAfEspnIdPhotoUrl(afRow.photo, afRow.playerId, afRow), false, 'real AF photo is not dropped');
assert.ok(photoApi.pickDcNetworkPhoto(afRow).includes('media.api-sports.io/football/players/12345'), 'AF url kept');

// invented AF url from an ESPN id is dropped
const espnRow = {
  playerId: '384482',
  espnAthleteId: '384482',
  photo: 'https://media.api-sports.io/football/players/384482.png',
};
assert.strictEqual(photoApi.playerIdNamespace(espnRow), 'espn');
assert.strictEqual(photoApi.isAfEspnIdPhotoUrl(espnRow.photo, espnRow.playerId, espnRow), true, 'AF url built from ESPN id is skipped');
assert.strictEqual(photoApi.pickDcNetworkPhoto(espnRow), '', 'invented AF url not used');

// (2) top-10 / any packed id prefers the bundled path (no /api/logo flicker)
const bundledRow = { playerId: '384482', photo: 'https://example.com/remote.png' };
assert.strictEqual(photoApi.dcPlayerPhotoSrc(bundledRow), 'assets/players/384482.png', 'bundled path first');
const tmRow = { tmId: '687626', player: 'Moisés Caicedo' };
assert.strictEqual(photoApi.dcPlayerPhotoSrc(tmRow), 'assets/players/tm-687626.png', 'tm- bundled path');

// (3) below-cutoff rows without photos are omitted; top 10 stay
const rows = [];
for (let i = 1; i <= 15; i++) {
  rows.push({
    rank: i,
    player: 'P' + i,
    playerId: i <= 10 ? '384482' : (i === 12 ? '259481' : ''),
    photo: i === 12 ? 'https://a.espncdn.com/i/headshots/soccer/players/full/259481.png' : '',
  });
}
// ranks 11,13,14,15 have no usable photo; 12 has bundled 259481
const kept = photoApi.filterScorerRowsForDisplay(rows);
const keptRanks = kept.map((r) => r.rank);
assert.deepStrictEqual(keptRanks.filter((n) => n <= 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'top 10 always kept');
assert.ok(keptRanks.includes(12), 'rank 12 with photo kept');
assert.ok(!keptRanks.includes(11) && !keptRanks.includes(13) && !keptRanks.includes(15), 'below-cutoff without photo omitted');

// (4) detail pages can paint from a list hint without waiting on /team or /player
const pageAf = extractNamed(appJs, 'pageAfPlayer');
assert.ok(/findDcLeaderRow/.test(pageAf) && /afPlayerDetailHtml/.test(pageAf), 'aplayer first paint uses list hint html');
assert.ok(!/await api\(\s*'\/af-player'/.test(pageAf), 'pageAfPlayer itself does not await /af-player');
assert.ok(/fillAfPlayer\(id, lg, \{ soft: !!instant \}\)/.test(pageAf), 'enrich is background/soft when hint exists');

const pageT = extractNamed(appJs, 'pageTeam');
assert.ok(/teamDetailFirstHtml/.test(pageT) && /findDcTeamRow/.test(pageT), 'team first paint uses list/standings hint');
assert.ok(!/await api\(/.test(pageT), 'pageTeam itself does not await /team');
assert.ok(/fillTeam\(id, lg, \{ soft: !!instant \}\)/.test(pageT), 'team enrich is soft when hint/cache exists');

const pageP = extractNamed(appJs, 'pagePlayer');
assert.ok(/findSquadPlayerHint|findDcLeaderRow/.test(pageP), 'pagePlayer uses a list/squad hint');
assert.ok(!/await api\(\s*'\/player'/.test(pageP), 'pagePlayer itself does not await /player');

const fillTeam = extractNamed(appJs, 'fillTeam');
assert.ok(/soft/.test(fillTeam), 'fillTeam honors soft (keep painted hint on failure)');

// Pack: Gustavo Varela / 384482 has a real photo
const playerDir = path.join(root, 'public/assets/players');
const manifest = JSON.parse(fs.readFileSync(path.join(playerDir, 'manifest.json'), 'utf8'));
assert.ok(manifest.playerIds.includes('384482'), 'Varela 384482 is in the photo manifest');
const varela = path.join(playerDir, '384482.png');
assert.ok(fs.existsSync(varela), '384482.png packed');
const vbuf = fs.readFileSync(varela);
assert.ok(vbuf.length > 1200, 'varela photo size');
assert.ok(!(vbuf.length === 5192 && crypto.createHash('md5').update(vbuf).digest('hex') === '430d67fd79ad0a355b212d5780886e34'), 'varela is not the AF placeholder');
assert.ok(vbuf[0] === 0x89 && vbuf[1] === 0x50, 'varela is a PNG');
assert.ok(manifest.playerIds.length >= 400, 'expanded photo pack (' + manifest.playerIds.length + ')');

const boot = JSON.parse(fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8'));
const sa = boot.slices['seriea:topscorers'];
assert.ok(sa && sa.rows && sa.rows[0], 'seriea topscorers boot');
assert.strictEqual(String(sa.rows[0].playerId), '384482');
assert.ok(/Varela/i.test(sa.rows[0].player), 'boot #1 is Varela');
assert.ok((sa.rows[0].goals || 0) >= 9, 'boot goals are current (9+)');

console.log('ui-375-test OK', { photos: manifest.playerIds.length, varelaBytes: vbuf.length });
