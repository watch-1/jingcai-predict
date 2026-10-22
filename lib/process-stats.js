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
  if (r === 'no_af_team') return '未能映射到过程数据球队（队名/ID 未匹配）';
  if (r === 'no_fixtures') return '暂无完场场次可用于过程统计';
  if (r === 'no_stats') return '近期场次暂无技术统计（或队名映射到错误球队）';
  if (r === 'quota') return '数据源配额紧张，暂未拉取';
  if (r === 'suspended') return '第三方数据账户暂不可用';
  if (r === 'no_key') return '过程数据源暂未就绪';
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

/** Pick first non-empty value from AF type map (exact then case-insensitive). */
function pickStat(m, names) {
  if (!m) return null;
  for (const n of names) {
    if (m[n] != null && m[n] !== '') return m[n];
  }
  const lower = {};
  for (const [k, v] of Object.entries(m)) lower[String(k).toLowerCase()] = v;
  for (const n of names) {
    const v = lower[String(n).toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return null;
}

/**
 * Derive passesPct from Total passes / Passes accurate when AF omits Passes %.
 * Mutates and returns the side-stats object. Safe on already-filled values.
 */
function derivePassesPct(st) {
  if (!st || typeof st !== 'object') return st;
  if (st.passesPct != null && Number.isFinite(Number(st.passesPct))) return st;
  const tot = Number(st.totalPasses);
  const acc = Number(st.passesAccurate);
  if (Number.isFinite(tot) && tot > 0 && Number.isFinite(acc) && acc >= 0) {
    st.passesPct = round1(100 * (acc / tot));
  }
  return st;
}

/** Recompute averages from samples after enriching per-fixture side stats (rolling cache). */
function enrichRollingPayload(payload) {
  if (!payload || !payload.ok) return payload;
  const samples = (payload.samples || []).map((s) => {
    if (!s || !s.stats) return s;
    return { ...s, stats: derivePassesPct({ ...s.stats }) };
  });
  const sos = computeSosAdjustedAverages(samples);
  return {
    ...payload,
    samples,
    averages: computeAverages(samples),
    averagesAdjusted: sos.averagesAdjusted,
    sos: {
      ok: sos.ok,
      coverage: sos.coverage,
      covered: sos.covered,
      n: sos.n,
      avgSi: sos.avgSi,
      noteZh: sos.noteZh,
    },
  };
}

/** Normalize one side's statistics array from AF /fixtures/statistics */
function sideStats(arr) {
  const m = {};
  for (const s of arr || []) {
    if (s && s.type != null) m[s.type] = s.value;
  }
  const out = {
    possession: parsePct(pickStat(m, ['Ball Possession', 'Possession'])),
    shots: parseNum(pickStat(m, ['Total Shots', 'Shots'])),
    shotsOnTarget: parseNum(pickStat(m, ['Shots on Goal', 'Shots on Target', 'Shots On Goal'])),
    corners: parseNum(pickStat(m, ['Corner Kicks', 'Corners'])),
    yellowCards: parseNum(pickStat(m, ['Yellow Cards'])),
    redCards: parseNum(pickStat(m, ['Red Cards'])),
    attacks: parseNum(pickStat(m, ['Attacks', 'attacks', 'Total Attacks'])),
    dangerousAttacks: parseNum(pickStat(m, ['Dangerous Attacks', 'dangerous_attacks', 'Dangerous attacks'])),
    passesPct: parsePct(pickStat(m, [
      'Passes %', 'Pass Accuracy', 'Passes accurate %', 'Accurate Passes %',
      'Pass Percentage', 'Passes Accuracy', 'Accurate passes %',
    ])),
    expectedGoals: parseNum(pickStat(m, ['expected_goals', 'Expected Goals', 'xG', 'Expected goals'])),
    totalPasses: parseNum(pickStat(m, ['Total passes', 'Passes', 'Total Passes'])),
    passesAccurate: parseNum(pickStat(m, ['Passes accurate', 'Accurate Passes', 'Passes Accurate'])),
  };
  return derivePassesPct(out);
}

function fixtureStatsPath(fixtureId) {
  return path.join(FIXTURE_STATS_DIR(), String(fixtureId) + '.json');
}

function loadFixtureStats(fixtureId) {
  const disk = readJson(fixtureStatsPath(fixtureId), null);
  if (disk && disk.byTeam) {
    // Enrich legacy disk caches: AF often omits Passes % but keeps totals.
    let dirty = false;
    for (const tid of Object.keys(disk.byTeam)) {
      const before = disk.byTeam[tid] && disk.byTeam[tid].passesPct;
      disk.byTeam[tid] = derivePassesPct(disk.byTeam[tid] || {});
      if (before == null && disk.byTeam[tid].passesPct != null) dirty = true;
    }
    if (dirty) {
      try { writeJson(fixtureStatsPath(fixtureId), disk); } catch (_) {}
    }
    return disk;
  }
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


/* ---------- 1.9.56 Opponent strength (SoS) de-watering ---------- */

const EUROPEAN_CUP_SI = [
  { re: /champions\s*league|欧冠|UEFA Champions/i, si: 1.22, band: 'ucl', labelZh: '欧冠级' },
  { re: /europa\s*league|欧联|欧罗巴|UEFA Europa(?!\s*Conference)/i, si: 1.12, band: 'uel', labelZh: '欧联级' },
  { re: /conference\s*league|欧协联|UEFA Europa Conference/i, si: 1.08, band: 'uecl', labelZh: '欧协联级' },
];

const DOMESTIC_TOP_RE = /premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|eredivisie|primeira|scottish\s*premiership|德甲|英超|西甲|意甲|法甲|荷甲/i;
const DOMESTIC_MID_RE = /championship|2\.?\s*bundesliga|ligue\s*2|serie\s*b|segunda|keuken\s*kampioen|英冠|德乙|法乙|意乙/i;

/** Normalize team name for fuzzy standings match. */
function normTeamName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\b(fc|cf|sc|ac|as|ss|sv|vfb|vfl|tsg|rb|1)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let _standingsIndexCache = null;
let _standingsIndexAt = 0;

/**
 * Build name→{rank,n,points,league} index from ESPN standings disks (no network).
 * Refreshed at most every 30 min in-process.
 */
function loadStandingsStrengthIndex() {
  if (_standingsIndexCache && Date.now() - _standingsIndexAt < 30 * 60 * 1000) {
    return _standingsIndexCache;
  }
  const idx = new Map(); // normName → { rank, n, points, leagueEn, si, band, labelZh }
  const dir = path.join(DATA_DIR, 'live-stats', 'espn', 'tables');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^standings-/.test(f) && f.endsWith('.json')); } catch { files = []; }
  for (const f of files) {
    if (/uefa\.champions|uefa\.europa/i.test(f)) continue; // cup tables: use league-name SI instead
    const disk = readJson(path.join(dir, f), null);
    const payload = disk && (disk.payload || disk);
    const rows = (payload && payload.rows) || [];
    if (!rows.length) continue;
    const n = rows.length;
    const leagueEn = (payload && payload.leagueEn) || f;
    for (const r of rows) {
      if (!r || r.rank == null) continue;
      const rank = Number(r.rank);
      if (!Number.isFinite(rank) || rank < 1) continue;
      const names = [r.team, r.teamZh].filter(Boolean);
      // percentile: rank 1 → strong (high SI), last → weak
      const pct = n <= 1 ? 0.5 : (rank - 1) / (n - 1);
      let si = 1.18 - pct * 0.36; // ~1.18 top … ~0.82 bottom
      let band = 'mid';
      let labelZh = '联赛中游';
      if (pct <= 0.28) { band = 'top'; labelZh = '联赛上游'; }
      else if (pct >= 0.72) { band = 'bottom'; labelZh = '联赛下游'; }
      si = Math.round(si * 100) / 100;
      for (const name of names) {
        const key = normTeamName(name);
        if (!key || key.length < 2) continue;
        const prev = idx.get(key);
        // Prefer denser / more complete tables (higher n) when duplicate names
        if (!prev || (n >= (prev.n || 0))) {
          idx.set(key, {
            rank, n, points: r.points, leagueEn, si, band, labelZh, team: r.team || name,
          });
        }
      }
    }
  }
  _standingsIndexCache = idx;
  _standingsIndexAt = Date.now();
  return idx;
}

function lookupOpponentInStandings(opponentName) {
  const idx = loadStandingsStrengthIndex();
  const key = normTeamName(opponentName);
  if (!key) return null;
  if (idx.has(key)) return idx.get(key);
  // soft contains match (avoid very short keys)
  if (key.length >= 4) {
    let best = null;
    for (const [k, v] of idx.entries()) {
      if (k.length < 4) continue;
      if (k.includes(key) || key.includes(k)) {
        if (!best || k.length < best._klen) best = { ...v, _klen: k.length };
      }
    }
    if (best) {
      delete best._klen;
      return best;
    }
  }
  return null;
}

function leagueCompetitionSi(leagueName) {
  const lg = String(leagueName || '');
  if (!lg) return null;
  for (const row of EUROPEAN_CUP_SI) {
    if (row.re.test(lg)) return { si: row.si, band: row.band, labelZh: row.labelZh, source: 'competition' };
  }
  if (DOMESTIC_TOP_RE.test(lg)) return { si: 1.0, band: 'domestic_top', labelZh: '顶级联赛', source: 'competition' };
  if (DOMESTIC_MID_RE.test(lg)) return { si: 0.94, band: 'domestic_2', labelZh: '次级联赛', source: 'competition' };
  return null;
}

/**
 * Estimate opponent strength for one recent fixture sample.
 * @returns {{ si: number, band: string, labelZh: string, source: string, rank?: number } | null}
 */
function estimateOpponentStrength(sample) {
  if (!sample) return null;
  const cup = leagueCompetitionSi(sample.league);
  const standing = lookupOpponentInStandings(sample.opponent);
  if (cup && (cup.band === 'ucl' || cup.band === 'uel' || cup.band === 'uecl')) {
    // European cups: start from cup SI; nudge by standings if opponent found in domestic table
    let si = cup.si;
    if (standing && standing.si != null) {
      // blend: cup baseline + domestic rank signal
      si = Math.round(((cup.si * 0.65) + (standing.si * 0.35)) * 100) / 100;
    }
    si = Math.max(0.75, Math.min(1.30, si));
    return {
      si, band: cup.band, labelZh: cup.labelZh + (standing ? `·${standing.labelZh}` : ''),
      source: standing ? 'cup+standings' : 'competition',
      rank: standing ? standing.rank : undefined,
    };
  }
  if (standing && standing.si != null) {
    let si = standing.si;
    if (cup && cup.band === 'domestic_2') si = Math.round(si * 0.96 * 100) / 100;
    si = Math.max(0.75, Math.min(1.30, si));
    return {
      si, band: standing.band, labelZh: standing.labelZh,
      source: 'standings', rank: standing.rank,
    };
  }
  if (cup) {
    return { si: cup.si, band: cup.band, labelZh: cup.labelZh, source: 'competition' };
  }
  // Unknown league / opponent — do not invent
  return null;
}

function roundMetric(key, n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (key === 'expectedGoals') return Math.round(n * 100) / 100;
  return Math.round(n * 10) / 10;
}

/**
 * Strength-adjusted averages: offensive-ish metrics scaled by opponent SI
 * (tougher schedule → boost; weak schedule → damp). Missing SI → sample excluded
 * from adjusted series (raw averages still use all samples).
 */
function computeSosAdjustedAverages(samples) {
  const list = samples || [];
  const annotated = [];
  let covered = 0;
  for (const s of list) {
    const est = estimateOpponentStrength(s);
    if (est && est.si != null) {
      covered += 1;
      annotated.push({ sample: s, si: est.si, est });
    } else {
      annotated.push({ sample: s, si: null, est: null });
    }
  }
  const n = list.length;
  const coverage = n ? covered / n : 0;
  const usable = annotated.filter(a => a.si != null && a.sample && a.sample.stats);
  const adjusted = {};
  const rawForCompare = {};
  if (usable.length >= 2 && coverage >= 0.5) {
    for (const k of METRIC_KEYS) {
      const adjVals = [];
      const rawVals = [];
      for (const a of usable) {
        const st = derivePassesPct({ ...(a.sample.stats || {}) });
        const v = st[k];
        if (v == null || !Number.isFinite(Number(v))) continue;
        rawVals.push(Number(v));
        // Scale by SI: vs strong opp, observed output understates underlying level
        adjVals.push(Number(v) * a.si);
      }
      adjusted[k] = adjVals.length ? roundMetric(k, adjVals.reduce((x, y) => x + y, 0) / adjVals.length) : null;
      rawForCompare[k] = rawVals.length ? roundMetric(k, rawVals.reduce((x, y) => x + y, 0) / rawVals.length) : null;
    }
  }
  const avgSi = usable.length
    ? Math.round((usable.reduce((s, a) => s + a.si, 0) / usable.length) * 100) / 100
    : null;
  let noteZh = '';
  let adjustedOk = false;
  if (usable.length >= 2 && coverage >= 0.5) {
    adjustedOk = true;
    noteZh = `已按对手强度修正（覆盖 ${covered}/${n} 场，场均对手强度指数 ${avgSi}；欧战/联赛排名，缺资料场次未臆造）。`;
  } else if (n === 0) {
    noteZh = '无场次，无法做强度修正。';
  } else {
    noteZh = `对手强度资料不足（覆盖 ${covered}/${n} 场），场均未做强度修正。`;
  }
  return {
    ok: adjustedOk,
    coverage: Math.round(coverage * 100) / 100,
    covered,
    n,
    avgSi,
    averagesAdjusted: adjustedOk ? adjusted : null,
    noteZh,
    samples: annotated.map(a => ({
      fixtureId: a.sample && a.sample.fixtureId,
      opponent: a.sample && a.sample.opponent,
      league: a.sample && a.sample.league,
      si: a.si,
      band: a.est && a.est.band,
      labelZh: a.est && a.est.labelZh,
      source: a.est && a.est.source,
    })),
  };
}

function computeAverages(samples) {
  const averages = {};
  const enriched = (samples || []).map((s) => {
    if (!s || !s.stats) return s;
    return { ...s, stats: derivePassesPct({ ...s.stats }) };
  });
  for (const k of METRIC_KEYS) {
    // avg() already skips nulls — partial samples still yield a metric
    averages[k] = round1(avg(enriched.map(s => s && s.stats && s.stats[k])));
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
      noteZh: '过程数据源暂未就绪，过程数据暂不可用。',
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
      noteZh: '未能映射到过程数据球队（竞彩队名/ID 未匹配）。',
    };
  }

  const afTeamId = afEntry.afTeamId;
  const cacheFile = rollingCachePath(afTeamId, lim);
  const disk = readJson(cacheFile, null);
  if (disk && disk.at && disk.payload && Date.now() - disk.at < ROLLING_TTL_MS && disk.payload.ok) {
    const enriched = enrichRollingPayload(disk.payload);
    // Persist re-derived metrics (e.g. passesPct from totals) so subsequent hits stay filled.
    if (enriched && enriched.averages
      && ((disk.payload.averages || {}).passesPct == null)
      && enriched.averages.passesPct != null) {
      try { writeJson(cacheFile, { at: disk.at, payload: enriched }); } catch (_) {}
    }
    return { ...enriched, cached: true };
  }

  let fixtures;
  try {
    fixtures = await listRecentFinishedFixtures(afTeamId, lim, { allowFetch: quotaAllows() });
  } catch (e) {
    if (disk && disk.payload && disk.at && Date.now() - disk.at < ROLLING_STALE_MS) {
      return { ...enrichRollingPayload(disk.payload), cached: true, stale: true, staleError: e.message };
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
        ? '第三方数据账户暂不可用，过程数据暂不可用。'
        : ('拉取近期赛程失败：' + (e.message || '')),
    };
  }

  if (!fixtures.length) {
    if (disk && disk.payload && disk.payload.ok) {
      return { ...enrichRollingPayload(disk.payload), cached: true, stale: true };
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
      return { ...enrichRollingPayload(disk.payload), cached: true, stale: true, staleError: fetchErr.message };
    }
    return {
      ok: false,
      reason: 'suspended',
      teamId: String(sportteryTeamId || ''),
      afTeamId,
      n: 0,
      averages: null,
      samples: [],
      noteZh: '第三方数据账户暂不可用，过程数据暂不可用。配置就绪后将自动启用。',
    };
  }

  if (!samples.length) {
    if (disk && disk.payload && disk.payload.ok) {
      return { ...enrichRollingPayload(disk.payload), cached: true, stale: true };
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
  let payload = {
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
      : `近 ${samples.length} 场完场过程数据均值（磁盘缓存）。`,
    fetchedAt: new Date().toISOString(),
  };
  payload = enrichRollingPayload(payload);
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
      noteZh: '过程数据源暂未就绪。模块已就绪，配置后将自动点亮。',
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
      noteZh: '第三方数据账户暂不可用，近期过程数据暂不可用。战绩/交锋仍来自综合赛程与竞彩历史；配置就绪后本模块将自动启用。',
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
    noteZh = '第三方数据账户暂不可用，近期过程数据暂不可用。战绩/交锋仍来自综合赛程与竞彩历史；配置就绪后本模块将自动启用。';
  } else if (!anyOk && reasons.includes('no_key')) {
    noteZh = '过程数据源暂未就绪，过程数据暂不可用。';
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
    // Do not expose API daily quota / remaining in user-facing noteZh (ops still get quota in JSON).
    noteZh = `过程数据：${bits.join(' / ')}。来自综合赛程与技术统计均值；比赛统计已永久缓存到磁盘。`;
    if (homeRoll.stale || awayRoll.stale) noteZh += '（含缓存/略旧数据）';
    const sosBits = [];
    if (homeRoll.ok && homeRoll.sos) sosBits.push(`${home || '主队'}${homeRoll.sos.ok ? '已按对手强度修正' : '未做强度修正'}`);
    if (awayRoll.ok && awayRoll.sos) sosBits.push(`${away || '客队'}${awayRoll.sos.ok ? '已按对手强度修正' : '未做强度修正'}`);
    if (sosBits.length) noteZh += ' ' + sosBits.join('；') + '。';
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
    return { lean: null, score: 0, edges, missing: ['过程数据整体不可用'], usedSos: false };
  }
  const hOk = !!(process.home && process.home.ok && process.home.averages);
  const aOk = !!(process.away && process.away.ok && process.away.averages);
  if (!hOk) missing.push('主队过程数据缺失');
  if (!aOk) missing.push('客队过程数据缺失');
  if (!hOk || !aOk) {
    return { lean: null, score: 0, edges, missing, usedSos: false };
  }
  const hSosOk = !!(process.home.sos && process.home.sos.ok && process.home.averagesAdjusted);
  const aSosOk = !!(process.away.sos && process.away.sos.ok && process.away.averagesAdjusted);
  const usedSos = hSosOk && aSosOk;
  if (hSosOk && !aSosOk) missing.push('客队对手强度覆盖不足，过程对比未用强度修正');
  if (aSosOk && !hSosOk) missing.push('主队对手强度覆盖不足，过程对比未用强度修正');
  const h = usedSos ? process.home.averagesAdjusted : process.home.averages;
  const a = usedSos ? process.away.averagesAdjusted : process.away.averages;
  if (usedSos) edges.push('过程对比已按双方对手强度修正');
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
  return { lean, score, edges, missing: [...new Set(missing)], usedSos: !!usedSos };
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
  let text = `近期过程数据：${parts.join('；')}。`;
  if (scored.usedSos) text += '场均对比优先使用「强度修正场均」（已按对手强度修正）。';
  else {
    const hNote = process.home && process.home.sos && process.home.sos.noteZh;
    const aNote = process.away && process.away.sos && process.away.sos.noteZh;
    if (hNote || aNote) text += `强度修正：${[hNote, aNote].filter(Boolean).join(' / ')}`;
  }
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
  derivePassesPct,
  enrichRollingPayload,
  pickStat,
  normalizeFixtureStatistics,
  computeAverages,
  computeSosAdjustedAverages,
  estimateOpponentStrength,
  lookupOpponentInStandings,
  leagueCompetitionSi,
  normTeamName,
  getFixtureStatisticsCached,
  loadFixtureStats,
  QUOTA_RESERVE,
  ROLLING_TTL_MS,
};
