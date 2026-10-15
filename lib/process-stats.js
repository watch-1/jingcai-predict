/**
 * Rolling process / pitch stats for pre-match intel (API-Football).
 * Resolve team → recent finished fixtures → /fixtures/statistics → averages.
 *
 * Quota (account Pro ~7500 req/day; still cache aggressively):
 * - Per-fixture statistics cached forever under data/live-stats/fixture-stats/
 * - Team fixture lists reuse match-stats team-form disk cache when present
 * - Team rolling summary cached ≥12h under data/live-stats/process-rolling/
 * - Skip remote fetches when remaining quota ≤ QUOTA_RESERVE or key missing/suspended
 * - Prefer ESPN for form/lineups elsewhere; this module is AF-only for process metrics
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const FIXTURE_STATS_DIR = () => path.join(DATA_DIR, 'live-stats', 'fixture-stats');
const ROLLING_DIR = () => path.join(DATA_DIR, 'live-stats', 'process-rolling');
const FORM_CACHE_DIR = () => path.join(DATA_DIR, 'live-stats', 'team-form');
const ROLLING_TTL_MS = 12 * 60 * 60 * 1000;
const ROLLING_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_RESERVE = 25;
/** Max new /fixtures/statistics calls per getRollingProcessStats invocation */
const MAX_FETCH_PER_CALL = 6;
const METRIC_KEYS = [
  'possession', 'shots', 'shotsOnTarget', 'passesPct', 'corners',
  'attacks', 'dangerousAttacks', 'expectedGoals',
];

let suspendedUntil = 0; // epoch ms — avoid hammering a suspended key
function markSuspended() { suspendedUntil = Date.now() + 30 * 60 * 1000; }
function isMarkedSuspended() { return Date.now() < suspendedUntil; }

const METRIC_ZH = {
  possession: '控球率',
  shots: '射门',
  shotsOnTarget: '射正',
  passesPct: '传球成功率',
  corners: '角球',
  attacks: '进攻',
  dangerousAttacks: '危险进攻',
  expectedGoals: '预期进球 xG',
};

/** 竞彩中文短名 → API-Football 可搜英文（无 crest 英文 / 短名易撞车时用） */
const AF_ZH_EN = {
  '贝西克塔': 'Besiktas', '贝西克塔斯': 'Besiktas',
  '费内巴切': 'Fenerbahce', '加拉塔萨': 'Galatasaray', '加拉塔萨雷': 'Galatasaray',
  '霍芬海姆': 'Hoffenheim', '布鲁日': 'Club Brugge', '林茨': 'LASK',
  '达姆施塔': 'Darmstadt', '达姆施塔特': 'Darmstadt',
  '沃夫斯堡': 'Wolfsburg', '沃尔夫斯堡': 'Wolfsburg',
  '奈梅亨': 'NEC Nijmegen', '赫尔辛基': 'HJK Helsinki',
  '托林斯': 'Torreense', '托特纳姆': 'Tottenham', '热刺': 'Tottenham',
  '桑德兰': 'Sunderland', '波兹南': 'Lech Poznan', '莱赫波兹南': 'Lech Poznan',
  '凯尔特人': 'Celtic', '圣吉联合': 'Union Saint Gilloise', '圣吉罗斯联合': 'Union Saint Gilloise',
  '萨尔茨堡': 'Red Bull Salzburg', '红牛萨尔茨堡': 'Red Bull Salzburg',
  '奥林匹亚': 'Olympiakos Piraeus', '奥林匹亚科斯': 'Olympiakos Piraeus',
  '格风暴': 'Sturm Graz', '格拉茨风暴': 'Sturm Graz',
  '哥本哈根': 'FC Copenhagen', '克拉约瓦': 'Universitatea Craiova',
  '利雅胜利': 'Al Nassr', '伯恩茅斯': 'Bournemouth', '水晶宫': 'Crystal Palace',
  '巴黎圣曼': 'Paris Saint Germain', '巴黎圣日耳曼': 'Paris Saint Germain', '巴黎': 'Paris Saint Germain',
  '曼城': 'Manchester City', '曼联': 'Manchester United',
  '吉达国民': 'Al Ahli Jeddah', '维拉': 'Aston Villa', '贝蒂斯': 'Real Betis',
  // Homonym-safe official names (Porto≠Brazil Porto; Roma≠Slovenia Roma)
  '波尔图': 'FC Porto', '罗马': 'AS Roma', '皇马': 'Real Madrid',
  '拉齐奥': 'Lazio', '热那亚': 'Genoa', '切尔西': 'Chelsea',
  '国际米兰': 'Inter', '国米': 'Inter', '尤文': 'Juventus', '尤文图斯': 'Juventus',
  'AC米兰': 'AC Milan', '米兰': 'AC Milan',
  // England (often missing crest EN)
  '诺维奇': 'Norwich', '伯恩利': 'Burnley', '米尔沃尔': 'Millwall', '诺丁汉': 'Nottingham Forest',
  '伍尔弗': 'Wolves', '林肯城': 'Lincoln', '纽卡斯尔': 'Newcastle', '伊普斯': 'Ipswich',
  '利兹联': 'Leeds', '考文垂': 'Coventry', '西汉姆联': 'West Ham', '南安普敦': 'Southampton',
  // DE / FR / NL / Nordics
  '科隆': 'Koln', '门兴': 'Monchengladbach', '纽伦堡': 'Nurnberg', '科特布斯': 'Cottbus',
  '勒芒': 'Le Mans', '蒙彼利埃': 'Montpellier', '昂热': 'Angers', '罗德兹': 'Rodez',
  '洛里昂': 'Lorient', '阿贾克斯': 'Ajax', '格罗宁根': 'Groningen',
  '博德闪耀': 'Bodo', '罗森博格': 'Rosenborg', '佐加顿斯': 'Djurgarden',
  '吉维森特': 'Gil Vicente', '埃夫斯堡': 'Elfsborg', '汉坎': 'Hacken',
  '布鲁马波': 'Brommapojkarna', '天狼星': 'Sirius', '萨普斯堡': 'Sarpsborg',
  '前进之鹰': 'Go Ahead Eagles', '特尔斯达': 'Telstar', 'SBV精英': 'Excelsior', '奥斯': 'FC Oss',
  // Spain
  '拉科': 'Deportivo La Coruna', '毕尔巴鄂': 'Athletic Club', '桑坦德': 'Racing Santander',
  '阿拉维斯': 'Alaves', '马拉加': 'Malaga',
  // Asia / A-League / MLS
  '磐田喜悦': 'Jubilo Iwata', '鹿岛鹿角': 'Kashima', '清水鼓动': 'Shimizu',
  '横滨水手': 'Yokohama', '福冈黄蜂': 'Avispa Fukuoka', '长崎航海': 'V-varen Nagasaki',
  '全北现代': 'Jeonbuk', '蔚山现代': 'Ulsan Hyundai', '济州SK': 'Jeju', '富川FC': 'Bucheon',
  '悉尼FC': 'Sydney', '西悉尼': 'Western Sydney', '墨胜利': 'Melbourne Victory',
  '中央海岸': 'Central Coast', '珀斯': 'Perth Glory', '麦克阿瑟': 'Macarthur',
  '洛城银河': 'Los Angeles Galaxy', '圣路易城': 'St Louis City',
  '迪拜连接': 'Al Wasl', '曼谷港务': 'Port FC', '拉普大学': 'Universidad de Chile',
  '宫崎牛鸟': 'Tegevajaro Miyazaki', '维多利亚': 'Vitoria',
};

function resolveNameEn(sportteryTeamId, nameEn, nameZh) {
  const zh = String(nameZh || '').trim();
  // Chinese map first for known homonyms (波尔图→FC Porto, 罗马→AS Roma)
  if (zh && AF_ZH_EN[zh]) return AF_ZH_EN[zh];
  const fromArg = String(nameEn || '').trim();
  if (fromArg) {
    // Upgrade bare dangerous crest EN when we know the safer AF search form
    const DANGEROUS = {
      Roma: 'AS Roma', Porto: 'FC Porto', Newcastle: 'Newcastle',
      Leeds: 'Leeds', Burnley: 'Burnley',
    };
    if (DANGEROUS[fromArg]) return DANGEROUS[fromArg];
    return fromArg;
  }
  const fromCrest = crestsEn(sportteryTeamId);
  if (fromCrest) {
    const DANGEROUS = { Roma: 'AS Roma', Porto: 'FC Porto' };
    if (DANGEROUS[fromCrest]) return DANGEROUS[fromCrest];
    return fromCrest;
  }
  const ascii = zh.match(/[A-Za-z][A-Za-z .'-]{2,}/);
  if (ascii) return ascii[0].trim();
  return zh;
}

function reasonNoteZh(side) {
  if (!side) return '暂无过程数据';
  if (side.ok) return '';
  const r = side.reason || '';
  if (r === 'no_af_team') return '未能映射到 API-Football 球队（队名/ID 未匹配）';
  if (r === 'no_fixtures') return '暂无完场场次可用于过程统计';
  if (r === 'no_stats') return '近期场次暂无技术统计（或队名映射到错误球队）';
  if (r === 'quota') return '数据源配额紧张，暂未拉取';
  if (r === 'suspended') return 'API-Football 账户已暂停';
  if (r === 'no_key') return '未配置 API-Football 密钥';
  return side.noteZh || '暂无过程数据';
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function apiKeyPresent() {
  try {
    const live = require('./live-stats');
    return !!(live.apiKeyPresent && live.apiKeyPresent());
  } catch { return false; }
}

function getQuota() {
  try { return require('./live-stats').getQuota(); } catch { return null; }
}

function quotaAllows() {
  const q = getQuota();
  if (!q || q.remaining == null) return true;
  return q.remaining > QUOTA_RESERVE;
}

function crestsEn(teamId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const row = j.teams && j.teams[String(teamId)];
    return (row && row.en) || '';
  } catch { return ''; }
}

function parsePct(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}
function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize one side's statistics array from AF /fixtures/statistics */
function sideStats(arr) {
  const m = {};
  for (const s of arr || []) m[s.type] = s.value;
  return {
    possession: parsePct(m['Ball Possession']),
    shots: parseNum(m['Total Shots']),
    shotsOnTarget: parseNum(m['Shots on Goal']),
    corners: parseNum(m['Corner Kicks']),
    yellowCards: parseNum(m['Yellow Cards']),
    redCards: parseNum(m['Red Cards']),
    attacks: parseNum(m['Attacks'] ?? m['attacks']),
    dangerousAttacks: parseNum(m['Dangerous Attacks'] ?? m['dangerous_attacks']),
    passesPct: parsePct(m['Passes %'] ?? m['Pass Accuracy'] ?? m['Passes accurate %']),
    expectedGoals: parseNum(m['expected_goals'] ?? m['Expected Goals'] ?? m['xG']),
    totalPasses: parseNum(m['Total passes'] ?? m['Passes']),
    passesAccurate: parseNum(m['Passes accurate']),
  };
}

function fixtureStatsPath(fixtureId) {
  return path.join(FIXTURE_STATS_DIR(), String(fixtureId) + '.json');
}

function loadFixtureStats(fixtureId) {
  const disk = readJson(fixtureStatsPath(fixtureId), null);
  if (disk && disk.byTeam) return disk;
  return null;
}

function saveFixtureStats(fixtureId, payload) {
  try { writeJson(fixtureStatsPath(fixtureId), payload); }
  catch (e) { console.warn('process-stats fixture cache', e.message); }
}

/**
 * Parse AF statistics response into { byTeam: { [afTeamId]: sideStats } }
 */
function normalizeFixtureStatistics(list) {
  const byTeam = {};
  for (const row of list || []) {
    const tid = row && row.team && row.team.id;
    if (tid == null) continue;
    byTeam[String(tid)] = sideStats(row.statistics);
  }
  return { byTeam, fetchedAt: new Date().toISOString() };
}

async function fetchFixtureStatistics(fixtureId) {
  const live = require('./live-stats');
  const list = await live.afFetch('/fixtures/statistics?fixture=' + encodeURIComponent(fixtureId));
  const norm = normalizeFixtureStatistics(list);
  if (!Object.keys(norm.byTeam).length) return null;
  saveFixtureStats(fixtureId, { fixtureId: Number(fixtureId), ...norm });
  return loadFixtureStats(fixtureId);
}

async function getFixtureStatisticsCached(fixtureId, { allowFetch = true } = {}) {
  const hit = loadFixtureStats(fixtureId);
  if (hit) return { ...hit, cached: true };
  if (!allowFetch || !apiKeyPresent() || !quotaAllows()) return null;
  try {
    const fresh = await fetchFixtureStatistics(fixtureId);
    return fresh ? { ...fresh, cached: false } : null;
  } catch (e) {
    const msg = String(e.message || '');
    if (/suspend/i.test(msg)) {
      const err = new Error(msg);
      err.code = 'suspended';
      throw err;
    }
    if (/no_key/i.test(msg)) {
      const err = new Error('no_key');
      err.code = 'no_key';
      throw err;
    }
    console.warn('process-stats stats fetch', fixtureId, msg);
    return null;
  }
}

function seasonsToTry(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const current = m >= 7 ? y : y - 1;
  // Prefer current / recent seasons (Pro plan). Keep 2022–2024 as fallback for history depth.
  const prefer = [current, current - 1, current - 2, 2024, 2023, 2022];
  return [...new Set(prefer.filter(s => s >= 2018))];
}

/**
 * Recent FT fixtures for an AF team (reuse form disk cache; else season fetch).
 * Returns [{ fixtureId, date, ts, homeId, awayId, homeName, awayName, league, gh, ga }]
 */
async function listRecentFinishedFixtures(afTeamId, limit, { allowFetch = true } = {}) {
  const lim = Math.max(1, Math.min(15, Number(limit) || 5));
  const formFile = path.join(FORM_CACHE_DIR(), `${Number(afTeamId)}.json`);
  const disk = readJson(formFile, null);
  let raw = (disk && disk.payload && Array.isArray(disk.payload.raw)) ? disk.payload.raw.slice() : [];

  // Refresh when cache thin OR newest FT is older than ~21 days (avoid stuck on last-season form cache).
  const preview0 = extractFinished(raw, afTeamId, lim);
  const newestTs = preview0.length ? (preview0[0].ts || 0) : 0;
  const staleList = !preview0.length || (Date.now() / 1000 - newestTs > 21 * 86400);
  const needFetch = allowFetch && apiKeyPresent() && quotaAllows()
    && (raw.length < lim || staleList || preview0.length < lim);

  if (needFetch) {
    const live = require('./live-stats');
    const seen = new Set(raw.map(r => r && r.fixture && r.fixture.id).filter(Boolean).map(String));
    for (const season of seasonsToTry()) {
      if (!quotaAllows()) break;
      try {
        const batch = await live.afFetch(
          `/fixtures?team=${encodeURIComponent(afTeamId)}&season=${encodeURIComponent(season)}`
        );
        for (const row of batch || []) {
          const fid = row && row.fixture && row.fixture.id;
          const key = fid != null ? String(fid) : '';
          if (!key || seen.has(key)) continue;
          seen.add(key);
          raw.push(row);
        }
        const preview = extractFinished(raw, afTeamId, lim);
        // With Pro, stop once we have enough AND newest is fresh enough
        const freshOk = preview.length && (Date.now() / 1000 - (preview[0].ts || 0) <= 21 * 86400);
        if (preview.length >= lim && freshOk) break;
      } catch (e) {
        console.warn('process-stats fixtures season', season, e.message);
        const msg = String(e.message || '');
        if (/suspend/i.test(msg)) {
          markSuspended();
          const err = new Error(msg);
          err.code = 'suspended';
          throw err;
        }
        // skip inaccessible seasons, try next
        if (/do not have access to this season|season/i.test(msg)) continue;
        break;
      }
    }
    // refresh form cache lightly so match-stats can reuse
    if (raw.length) {
      try {
        writeJson(formFile, {
          at: Date.now(),
          payload: {
            afTeamId: Number(afTeamId),
            seasons: seasonsToTry(),
            fetchedAt: new Date().toISOString(),
            raw,
          },
        });
      } catch (_) {}
    }
  }

  return extractFinished(raw, afTeamId, lim);
}

function extractFinished(raw, afTeamId, limit) {
  const rows = Array.isArray(raw) ? raw.slice() : [];
  rows.sort((a, b) => {
    const ta = (a.fixture && a.fixture.timestamp) || 0;
    const tb = (b.fixture && b.fixture.timestamp) || 0;
    return tb - ta;
  });
  const out = [];
  for (const row of rows) {
    if (!row || !row.fixture || !row.teams || !row.goals) continue;
    const short = (row.fixture.status && row.fixture.status.short) || '';
    if (short && !/^(FT|AET|PEN)$/i.test(short)) continue;
    const gh = row.goals.home, ga = row.goals.away;
    if (gh == null || ga == null) continue;
    const th = row.teams.home, ta = row.teams.away;
    const thId = th && th.id, taId = ta && ta.id;
    const isHome = Number(thId) === Number(afTeamId);
    const isAway = Number(taId) === Number(afTeamId);
    if (!isHome && !isAway) continue;
    out.push({
      fixtureId: row.fixture.id,
      date: String(row.fixture.date || '').slice(0, 10),
      ts: row.fixture.timestamp || 0,
      homeId: thId,
      awayId: taId,
      homeName: (th && th.name) || '',
      awayName: (ta && ta.name) || '',
      league: (row.league && row.league.name) || '',
      gh, ga,
      isHome,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function avg(nums) {
  const xs = nums.filter(n => n != null && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function computeAverages(samples) {
  const averages = {};
  for (const k of METRIC_KEYS) {
    averages[k] = round1(avg(samples.map(s => s.stats && s.stats[k])));
  }
  return averages;
}

async function resolveAfId({ sportteryTeamId, nameEn, nameZh }) {
  const matchStats = require('./match-stats');
  const live = require('./live-stats');
  const sid = String(sportteryTeamId || '');
  // seed known ids into team-id-cache (same as match-stats)
  if (sid && matchStats.AF_TEAM_SEED && matchStats.AF_TEAM_SEED[sid] && live.resolveAfTeamId) {
    try {
      const cacheFile = path.join(DATA_DIR, 'live-stats', 'team-id-cache.json');
      const cache = readJson(cacheFile, {});
      const sKey = 's:' + sid;
      const seededId = matchStats.AF_TEAM_SEED[sid];
      const cur = cache[sKey] && cache[sKey].afTeamId;
      if (!cur || Number(cur) !== Number(seededId)) {
        cache[sKey] = {
          afTeamId: seededId,
          afName: nameEn || nameZh || '',
          sportteryTeamId: sid,
          query: nameEn || nameZh || '',
          mappedAt: new Date().toISOString(),
          seeded: true,
        };
        const nKey = 'n:' + resolveNameEn(sid, nameEn, nameZh).toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (nKey && nKey !== 'n:' && cache[nKey] && Number(cache[nKey].afTeamId) !== Number(seededId)) {
          delete cache[nKey];
        }
        if (cache['n:roma'] && Number(cache['n:roma'].afTeamId) !== Number(seededId) && Number(seededId) === 497) {
          delete cache['n:roma'];
        }
        writeJson(cacheFile, cache);
      }
    } catch (_) {}
  }
  if (!live.resolveAfTeamId) {
    if (sid && matchStats.AF_TEAM_SEED && matchStats.AF_TEAM_SEED[sid]) {
      return { afTeamId: matchStats.AF_TEAM_SEED[sid], afName: nameEn || '' };
    }
    return null;
  }
  const en = resolveNameEn(sid, nameEn, nameZh);
  return live.resolveAfTeamId({
    sportteryTeamId: sid,
    nameEn: en,
    nameZh,
    allowFetch: quotaAllows() && apiKeyPresent(),
  });
}

function rollingCachePath(afTeamId, n) {
  return path.join(ROLLING_DIR(), `${Number(afTeamId)}-n${Number(n)}.json`);
}

/**
 * Build rolling process stats for one team.
 */
async function getTeamRolling({ sportteryTeamId, nameZh, nameEn, limit = 5, fetchBudget }) {
  const lim = Math.max(1, Math.min(15, Number(limit) || 5));
  const budget = fetchBudget || { left: MAX_FETCH_PER_CALL };

  if (!apiKeyPresent()) {
    return {
      ok: false,
      reason: 'no_key',
      teamId: String(sportteryTeamId || ''),
      n: 0,
      averages: null,
      samples: [],
      noteZh: '未配置 API-Football 密钥（API_FOOTBALL_KEY / APISPORTS_KEY），过程数据暂不可用。',
    };
  }

  let afEntry;
  try {
    afEntry = await resolveAfId({
      sportteryTeamId,
      nameEn: resolveNameEn(sportteryTeamId, nameEn, nameZh),
      nameZh,
    });
  } catch (e) {
    return {
      ok: false,
      reason: e.code || 'resolve_error',
      teamId: String(sportteryTeamId || ''),
      n: 0,
      averages: null,
      samples: [],
      noteZh: '球队映射失败：' + (e.message || ''),
    };
  }
  if (!afEntry || !afEntry.afTeamId) {
    return {
      ok: false,
      reason: 'no_af_team',
      teamId: String(sportteryTeamId || ''),
      n: 0,
      averages: null,
      samples: [],
      noteZh: '未能映射到 API-Football 球队（竞彩队名/ID 未匹配，可检查英文名或种子映射）。',
    };
  }

  const afTeamId = afEntry.afTeamId;
  const cacheFile = rollingCachePath(afTeamId, lim);
  const disk = readJson(cacheFile, null);
  if (disk && disk.at && disk.payload && Date.now() - disk.at < ROLLING_TTL_MS && disk.payload.ok) {
    return { ...disk.payload, cached: true };
  }

  let fixtures;
  try {
    fixtures = await listRecentFinishedFixtures(afTeamId, lim, { allowFetch: quotaAllows() });
  } catch (e) {
    if (disk && disk.payload && disk.at && Date.now() - disk.at < ROLLING_STALE_MS) {
      return { ...disk.payload, cached: true, stale: true, staleError: e.message };
    }
    return {
      ok: false,
      reason: e.code || 'fixtures_error',
      teamId: String(sportteryTeamId || ''),
      afTeamId,
      n: 0,
      averages: null,
      samples: [],
      noteZh: /suspend/i.test(String(e.message || ''))
        ? 'API-Football 账户已暂停，过程数据暂不可用。'
        : ('拉取近期赛程失败：' + (e.message || '')),
    };
  }

  if (!fixtures.length) {
    if (disk && disk.payload && disk.payload.ok) {
      return { ...disk.payload, cached: true, stale: true };
    }
    return {
      ok: false,
      reason: 'no_fixtures',
      teamId: String(sportteryTeamId || ''),
      afTeamId,
      n: 0,
      averages: null,
      samples: [],
      noteZh: '暂无该队完场场次可用于过程统计。',
    };
  }

  const samples = [];
  let fetchErr = null;
  for (const fx of fixtures) {
    let pack = null;
    try {
      const allow = budget.left > 0 && quotaAllows();
      pack = await getFixtureStatisticsCached(fx.fixtureId, { allowFetch: allow });
      if (pack && !pack.cached && allow) budget.left -= 1;
    } catch (e) {
      fetchErr = e;
      if (e.code === 'suspended' || e.code === 'no_key') break;
    }
    if (!pack || !pack.byTeam) continue;
    const st = pack.byTeam[String(afTeamId)];
    if (!st) continue;
    const opp = fx.isHome ? fx.awayName : fx.homeName;
    samples.push({
      fixtureId: fx.fixtureId,
      date: fx.date,
      opponent: opp,
      isHome: fx.isHome,
      ft: `${fx.gh}:${fx.ga}`,
      league: fx.league,
      stats: st,
    });
  }

  if (fetchErr && (fetchErr.code === 'suspended' || /suspend/i.test(String(fetchErr.message || '')))) {
    markSuspended();
    if (disk && disk.payload && disk.payload.ok) {
      return { ...disk.payload, cached: true, stale: true, staleError: fetchErr.message };
    }
    return {
      ok: false,
      reason: 'suspended',
      teamId: String(sportteryTeamId || ''),
      afTeamId,
      n: 0,
      averages: null,
      samples: [],
      noteZh: 'API-Football 账户已暂停，过程数据暂不可用。配置有效密钥后将自动启用。',
    };
  }

  if (!samples.length) {
    if (disk && disk.payload && disk.payload.ok) {
      return { ...disk.payload, cached: true, stale: true };
    }
    const reason = !quotaAllows() ? 'quota' : (fetchErr ? 'upstream' : 'no_stats');
    return {
      ok: false,
      reason,
      teamId: String(sportteryTeamId || ''),
      afTeamId,
      n: 0,
      averages: null,
      samples: [],
      noteZh: reason === 'quota'
        ? '数据源配额紧张，暂未拉取过程统计（保留余量给实时/伤停）。'
        : '近期场次暂无技术统计缓存。',
    };
  }

  const averages = computeAverages(samples);
  const payload = {
    ok: true,
    teamId: String(sportteryTeamId || ''),
    afTeamId,
    afName: afEntry.afName || '',
    nameZh: nameZh || '',
    n: samples.length,
    requestedN: lim,
    averages,
    samples,
    source: 'api-football',
    noteZh: samples.length < lim
      ? `近 ${samples.length} 场有过程数据（目标 ${lim}；其余场次暂无统计或配额不足）。`
      : `近 ${samples.length} 场完场过程数据均值（API-Football，磁盘缓存）。`,
    fetchedAt: new Date().toISOString(),
  };
  try { writeJson(cacheFile, { at: Date.now(), payload }); } catch (_) {}
  return { ...payload, cached: false };
}

/**
 * Dual-team rolling process stats for a match.
 * @param {{ homeTeamId?, awayTeamId?, home?, away?, limit?, allowFetch? }} opts
 */
async function getRollingProcessStats(opts = {}) {
  const {
    homeTeamId,
    awayTeamId,
    home = '',
    away = '',
    limit = 5,
  } = opts;
  const lim = Math.max(1, Math.min(15, Number(limit) || 5));
  const budget = { left: MAX_FETCH_PER_CALL };

  if (!apiKeyPresent()) {
    return {
      ok: false,
      available: false,
      reason: 'no_key',
      n: lim,
      home: null,
      away: null,
      metrics: METRIC_KEYS.map(k => ({ key: k, labelZh: METRIC_ZH[k] })),
      noteZh: '未配置 API-Football 密钥（环境变量 API_FOOTBALL_KEY 或 APISPORTS_KEY）。过程数据模块已就绪，配置密钥后将自动点亮。',
      quota: getQuota(),
    };
  }

  if (isMarkedSuspended()) {
    return {
      ok: false,
      available: false,
      reason: 'suspended',
      n: lim,
      home: null,
      away: null,
      metrics: METRIC_KEYS.map(k => ({ key: k, labelZh: METRIC_ZH[k] })),
      noteZh: 'API-Football 账户已暂停，近期过程数据暂不可用。战绩/交锋仍来自 ESPN 与竞彩历史；配置有效密钥后本模块将自动启用。',
      quota: getQuota(),
    };
  }

  const homeRoll = await getTeamRolling({
    sportteryTeamId: homeTeamId,
    nameZh: home,
    nameEn: resolveNameEn(homeTeamId, '', home),
    limit: lim,
    fetchBudget: budget,
  });
  const awayRoll = await getTeamRolling({
    sportteryTeamId: awayTeamId,
    nameZh: away,
    nameEn: resolveNameEn(awayTeamId, '', away),
    limit: lim,
    fetchBudget: budget,
  });

  const reasons = [homeRoll.reason, awayRoll.reason].filter(Boolean);
  const suspended = reasons.includes('suspended')
    || /suspend/i.test(String(homeRoll.noteZh || ''))
    || /suspend/i.test(String(awayRoll.noteZh || ''));
  if (suspended) markSuspended();
  const anyOk = !!(homeRoll.ok || awayRoll.ok);

  let noteZh = '';
  if (suspended && !anyOk) {
    noteZh = 'API-Football 账户已暂停，近期过程数据暂不可用。战绩/交锋仍来自 ESPN 与竞彩历史；配置有效密钥后本模块将自动启用。';
  } else if (!anyOk && reasons.includes('no_key')) {
    noteZh = '未配置 API-Football 密钥，过程数据暂不可用。';
  } else if (!anyOk && reasons.includes('quota')) {
    noteZh = '数据源配额紧张，暂未刷新过程统计；请稍后再试或依赖已有缓存。';
  } else if (!anyOk) {
    noteZh = [homeRoll.noteZh, awayRoll.noteZh].filter(Boolean).join(' ')
      || '近期过程数据暂不可用。';
  } else {
    const bits = [];
    if (homeRoll.ok) bits.push(`${home || '主队'} 近${homeRoll.n}场`);
    else bits.push(`${home || '主队'}：${reasonNoteZh(homeRoll)}`);
    if (awayRoll.ok) bits.push(`${away || '客队'} 近${awayRoll.n}场`);
    else bits.push(`${away || '客队'}：${reasonNoteZh(awayRoll)}`);
    const q = getQuota();
    const quotaHint = (q && q.limit)
      ? `日配额约 ${q.limit} 次（剩余 ${q.remaining != null ? q.remaining : '—'}）`
      : 'Pro 日配额';
    noteZh = `过程数据：${bits.join(' / ')}。来自 API-Football 完场技术统计均值；${quotaHint}，场次统计永久磁盘缓存。`;
    if (homeRoll.stale || awayRoll.stale) noteZh += '（含缓存/略旧数据）';
  }

  return {
    ok: anyOk,
    available: anyOk,
    reason: anyOk ? null : (suspended ? 'suspended' : (reasons[0] || 'unavailable')),
    n: lim,
    home: homeRoll.ok ? homeRoll : { ...homeRoll, averages: homeRoll.averages || null },
    away: awayRoll.ok ? awayRoll : { ...awayRoll, averages: awayRoll.averages || null },
    metrics: METRIC_KEYS.map(k => ({ key: k, labelZh: METRIC_ZH[k] })),
    noteZh,
    quota: getQuota(),
  };
}

/** Key briefing metrics: possession / shots / SOT / pass% / corners / xG */
const BRIEF_METRIC_KEYS = [
  'possession', 'shots', 'shotsOnTarget', 'passesPct', 'corners', 'expectedGoals',
];

function fmtMetricVal(key, v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (key === 'possession' || key === 'passesPct') return (Math.round(n * 10) / 10) + '%';
  if (key === 'expectedGoals') return (Math.round(n * 100) / 100).toFixed(2);
  return String(Math.round(n * 10) / 10);
}

/**
 * Soft process lean from dual averages.
 * @returns {{ lean: 'h'|'a'|'d'|null, score: number, edges: string[], missing: string[] }}
 */
function scoreProcessLean(process) {
  const edges = [];
  const missing = [];
  if (!process || !process.available) {
    return { lean: null, score: 0, edges, missing: ['过程数据整体不可用'] };
  }
  const hOk = !!(process.home && process.home.ok && process.home.averages);
  const aOk = !!(process.away && process.away.ok && process.away.averages);
  if (!hOk) missing.push('主队过程数据缺失');
  if (!aOk) missing.push('客队过程数据缺失');
  if (!hOk || !aOk) {
    return { lean: null, score: 0, edges, missing };
  }
  const h = process.home.averages;
  const a = process.away.averages;
  let score = 0;
  const push = (cond, hWin, hMsg, aMsg, w) => {
    if (!cond) return;
    if (hWin) { score += w; edges.push(hMsg); }
    else { score -= w; edges.push(aMsg); }
  };
  if (h.shots != null && a.shots != null && Math.abs(h.shots - a.shots) >= 2) {
    push(true, h.shots > a.shots,
      `射门主优（${h.shots} vs ${a.shots}）`,
      `射门客优（${a.shots} vs ${h.shots}）`, 0.9);
  }
  if (h.shotsOnTarget != null && a.shotsOnTarget != null && Math.abs(h.shotsOnTarget - a.shotsOnTarget) >= 1.0) {
    push(true, h.shotsOnTarget > a.shotsOnTarget,
      `射正主优（${h.shotsOnTarget} vs ${a.shotsOnTarget}）`,
      `射正客优（${a.shotsOnTarget} vs ${h.shotsOnTarget}）`, 0.85);
  }
  if (h.expectedGoals != null && a.expectedGoals != null && Math.abs(h.expectedGoals - a.expectedGoals) >= 0.25) {
    push(true, h.expectedGoals > a.expectedGoals,
      `xG 主优（${h.expectedGoals} vs ${a.expectedGoals}）`,
      `xG 客优（${a.expectedGoals} vs ${h.expectedGoals}）`, 1.0);
  } else if (h.expectedGoals == null && a.expectedGoals == null) {
    missing.push('双方 xG 暂无');
  } else if (h.expectedGoals == null || a.expectedGoals == null) {
    missing.push(h.expectedGoals == null ? '主队 xG 暂无' : '客队 xG 暂无');
  }
  if (h.corners != null && a.corners != null && Math.abs(h.corners - a.corners) >= 1.2) {
    push(true, h.corners > a.corners,
      `角球主优（${h.corners} vs ${a.corners}）`,
      `角球客优（${a.corners} vs ${h.corners}）`, 0.35);
  }
  if (h.passesPct != null && a.passesPct != null && Math.abs(h.passesPct - a.passesPct) >= 4) {
    push(true, h.passesPct > a.passesPct,
      `传球成功率主优（${h.passesPct}% vs ${a.passesPct}%）`,
      `传球成功率客优（${a.passesPct}% vs ${h.passesPct}%）`, 0.25);
  }
  // possession: style only, tiny weight
  if (h.possession != null && a.possession != null && Math.abs(h.possession - a.possession) >= 6) {
    edges.push(h.possession > a.possession
      ? `控球主高（${h.possession}% vs ${a.possession}%），控球≠胜率`
      : `控球客高（${a.possession}% vs ${h.possession}%），控球≠胜率`);
  }
  for (const k of BRIEF_METRIC_KEYS) {
    if (h[k] == null && a[k] == null) {
      if (k === 'expectedGoals' && missing.some(x => x.includes('xG'))) continue;
      missing.push(`${METRIC_ZH[k] || k} 双方暂无`);
    } else if (h[k] == null) missing.push(`主队${METRIC_ZH[k] || k}暂无`);
    else if (a[k] == null) missing.push(`客队${METRIC_ZH[k] || k}暂无`);
  }
  let lean = 'd';
  if (score >= 0.7) lean = 'h';
  else if (score <= -0.7) lean = 'a';
  else if (score >= 0.3) lean = 'h';
  else if (score <= -0.3) lean = 'a';
  else lean = 'd';
  return { lean, score, edges, missing: [...new Set(missing)] };
}

/** Short Chinese sentence for prediction copy when averages present. */
function formatProcessBlurb(process, homeName, awayName) {
  if (!process || !process.available) return '';
  const h = process.home && process.home.ok && process.home.averages;
  const a = process.away && process.away.ok && process.away.averages;
  if (!h && !a) return '';
  const parts = [];
  const fmtSide = (name, avg, n) => {
    const bits = [];
    for (const k of BRIEF_METRIC_KEYS) {
      const lab = METRIC_ZH[k] || k;
      const fv = fmtMetricVal(k, avg[k]);
      if (fv != null) bits.push(`${lab} ${fv}`);
    }
    // optional extras
    if (avg.dangerousAttacks != null) bits.push(`危险进攻 ${avg.dangerousAttacks}`);
    else if (avg.attacks != null) bits.push(`进攻 ${avg.attacks}`);
    if (!bits.length) return '';
    return `${name} 近${n}场场均：${bits.join('、')}`;
  };
  if (h) parts.push(fmtSide(homeName || '主队', h, process.home.n));
  else parts.push(`${homeName || '主队'}：过程数据暂无`);
  if (a) parts.push(fmtSide(awayName || '客队', a, process.away.n));
  else parts.push(`${awayName || '客队'}：过程数据暂无`);
  if (!parts.length) return '';

  const scored = scoreProcessLean(process);
  let text = `近期过程数据（API-Football）：${parts.join('；')}。`;
  if (scored.edges.length) text += `对比要点：${scored.edges.join('；')}。`;
  if (scored.missing.length) text += `缺项：${scored.missing.join('；')}。`;
  text += '过程指标反映控球/射门等风格与创造机会质量，需结合战绩、排名与竞彩盘面，不作单独结论。';
  return text;
}

module.exports = {
  getRollingProcessStats,
  getTeamRolling,
  formatProcessBlurb,
  scoreProcessLean,
  BRIEF_METRIC_KEYS,
  fmtMetricVal,
  METRIC_KEYS,
  METRIC_ZH,
  AF_ZH_EN,
  resolveNameEn,
  reasonNoteZh,
  sideStats,
  normalizeFixtureStatistics,
  computeAverages,
  getFixtureStatisticsCached,
  loadFixtureStats,
  QUOTA_RESERVE,
  ROLLING_TTL_MS,
};
