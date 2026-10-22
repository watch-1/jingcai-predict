#!/usr/bin/env node
'use strict';
/**
 * 竞彩-优先 structured DB backfill (1.9.68+)
 *
 * Policy (default --prefer=jingcai):
 *   - Prefer sporttery/竞彩-mapped fixtures; skip leagues that never appear on 中国竞彩
 *     (friendlies, youth/reserve/obscure). Do not mass-delete existing af: shells —
 *     just deprioritize / skip future writes. Soft-hide af: in internal player-db UI.
 *   - Prefer filling player gaps on matches that already have process/compare/hard-test
 *     but UI shows「暂无球员行」(AF /fixtures/players).
 *
 * Phase 1 — local caches only (no AF / no DeepSeek):
 *   fixture-players, post-match-reviews, fixture-stats+team-form, results.jsonl
 *   With prefer=jingcai, local phase skips creating NEW non-竞彩 af: shells.
 *
 * Phase 2 — optional AF gap fill (--af-cap=N):
 *   Rate-limited. skipAi. NEVER DeepSeek.
 *   Cap ~1000 new calls only when remaining-after ≥ LIVE_RESERVE (3000).
 *
 * Usage:
 *   node tools/backfill-player-match-db.js
 *   node tools/backfill-player-match-db.js --af-cap=400 --players
 *   node tools/backfill-player-match-db.js --af-cap=200 --players --player-gaps
 *   node tools/backfill-player-match-db.js --af-cap=400 --resume --prefer=jingcai
 *   node tools/backfill-player-match-db.js --af-cap=200 --prefer=mixed --include-non-jingcai
 *   node tools/backfill-player-match-db.js --af-cap=350 --players --player-gaps --prefer=jingcai --include-non-jingcai
 *
 * Flags:
 *   --prefer=jingcai|mixed|non   default jingcai (skip never-on-竞彩 / unmapped af:)
 *   --players                    also fetch /fixtures/players
 *   --player-gaps                prioritize (or with prefer=jingcai: only) compare-present
 *                                matches missing player rows
 *   --include-non-jingcai        allow af: / unmapped futures even when prefer=jingcai
 *   --include-friendlies         allow Friendly leagues
 *   --resume                     continue from data/backfill-state.json
 *
 * Resume: data/backfill-state.json stores last AF cursor; --resume continues.
 * Check AF /status before Phase 2; respect daily headroom.
 */
const fs = require('fs');
const path = require('path');
const pmdb = require('../lib/player-match-db');
const { DATA_DIR } = require('../lib/db');

/** Load /opt/jingcai/.env (or project .env) into process.env for AF key. */
(function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].trim().replace(/^["']|["']$/g, '');
        if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
      }
      break;
    } catch (_) {}
  }
})();

const args = process.argv.slice(2);
function argNum(name, def, min, max) {
  const a = args.find(x => x.startsWith(`--${name}=`));
  if (!a) return def;
  const n = Number(a.split('=')[1]);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function hasFlag(name) {
  return args.includes(`--${name}`) || args.includes(`--${name}=1`) || args.includes(`--${name}=true`);
}

const AF_CAP = argNum('af-cap', 0, 0, 4000);
const AF_DELAY_MS = argNum('af-delay-ms', 900, 200, 5000);
const AF_STATUS_EVERY = argNum('af-status-every', 40, 5, 200);
const PREFER = (args.find(a => a.startsWith('--prefer=')) || '--prefer=jingcai').split('=')[1];
const WANT_PLAYERS = hasFlag('players');
const PLAYER_GAPS = hasFlag('player-gaps');
const INCLUDE_FRIENDLIES = hasFlag('include-friendlies');
const INCLUDE_NON_JINGCAI = hasFlag('include-non-jingcai');
const MIN_DATE = (args.find(a => a.startsWith('--min-date=')) || '--min-date=2025-07-01').split('=')[1];
const RESUME = hasFlag('resume');
const LOCAL_ONLY = hasFlag('local-only') || AF_CAP === 0;
const STATE_PATH = path.join(DATA_DIR, 'backfill-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
function saveState(st) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
  } catch (e) { console.warn('state save', e.message); }
}

async function fetchAfStatus() {
  let key = process.env.API_FOOTBALL_KEY || '';
  if (!key) {
    try {
      const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
      const m = env.match(/^API_FOOTBALL_KEY=(.*)$/m);
      if (m) key = m[1].trim();
    } catch (_) {}
  }
  if (!key) return { ok: false, reason: 'no_key' };
  const r = await fetch('https://v3.football.api-sports.io/status', {
    headers: { 'x-apisports-key': key },
  });
  const j = await r.json();
  const req = j && j.response && j.response.requests;
  const remHdr = r.headers.get('x-ratelimit-requests-remaining');
  const limHdr = r.headers.get('x-ratelimit-requests-limit');
  const current = req && req.current != null ? Number(req.current) : null;
  const limit = req && req.limit_day != null ? Number(req.limit_day) : (limHdr != null ? Number(limHdr) : 7500);
  const remaining = remHdr != null ? Number(remHdr)
    : (current != null && limit != null ? Math.max(0, limit - current) : null);
  // seed live-stats quota tracker
  try {
    const live = require('../lib/live-stats');
    if (live.setQuota) live.setQuota({ remaining, limit, at: Date.now() });
  } catch (_) {}
  return {
    ok: true,
    plan: j.response && j.response.subscription && j.response.subscription.plan,
    current,
    limit,
    remaining,
    active: j.response && j.response.subscription && j.response.subscription.active,
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Build AF gap candidates.
 * Default prefer=jingcai: sporttery-mapped only (skip never-on-竞彩 / unmapped af:),
 * unless --include-non-jingcai. --player-gaps prioritizes compare-present missing players.
 */

/** Big-5 domestic + UEFA club competitions (prefer when expanding beyond 竞彩-mapped). */
function isBig5OrEuroLeague(league) {
  const s = String(league || '').trim();
  if (!s) return false;
  // Exclude 2. Bundesliga / Serie B etc.
  if (/^2\.?\s*Bundesliga$/i.test(s) || /^Serie\s*B$/i.test(s) || /^La\s*Liga\s*2$/i.test(s)) return false;
  return /^(Premier League|La Liga|Serie A|Bundesliga|Ligue 1|UEFA Champions League|UEFA Europa League|UEFA Europa Conference League)$/i.test(s)
    || /英超|西甲|意甲|德甲|法甲|欧冠|欧罗巴|欧联|欧协联/.test(s);
}

function buildAfGapCandidates(state) {
  const maps = pmdb.indexFinishedFixturesFromCaches();
  const hasCompare = new Set();
  try {
    const db = pmdb.getDb();
    for (const row of db.prepare('SELECT DISTINCT match_id FROM match_process_compare').all()) {
      hasCompare.add(String(row.match_id));
    }
  } catch (_) {}

  const statsDir = path.join(DATA_DIR, 'live-stats', 'fixture-stats');
  const playersDir = path.join(DATA_DIR, 'live-stats', 'fixture-players');
  const hasStats = new Set();
  const hasPlayers = new Set();
  try {
    for (const f of fs.readdirSync(statsDir)) {
      if (/^\d+\.json$/.test(f)) hasStats.add(f.replace('.json', ''));
    }
  } catch (_) {}
  try {
    for (const f of fs.readdirSync(playersDir)) {
      if (/^\d+\.json$/.test(f)) hasPlayers.add(f.replace('.json', ''));
    }
  } catch (_) {}

  const done = new Set((state.doneFixtureIds || []).map(String));
  const candidates = [];

  // Also detect DB-level player gaps (compare present, zero player rows)
  const dbPlayerGap = new Set();
  try {
    const db = pmdb.getDb();
    for (const row of db.prepare(`
SELECT m.match_id FROM matches m
WHERE EXISTS (SELECT 1 FROM match_process_compare c WHERE c.match_id = m.match_id)
  AND NOT EXISTS (SELECT 1 FROM player_match_stats p WHERE p.match_id = m.match_id)
`).all()) {
      dbPlayerGap.add(String(row.match_id));
    }
  } catch (_) {}

  for (const [fid, meta] of maps.byFid) {
    // When filling player-gaps, allow revisiting fixtures already marked done for stats
    if (done.has(fid) && !PLAYER_GAPS) continue;
    if (meta.date && MIN_DATE && String(meta.date) < MIN_DATE) continue;
    if (!INCLUDE_FRIENDLIES && pmdb.leagueNeverOnJingcai(meta.league)) continue;
    if (!INCLUDE_FRIENDLIES && meta.league && /friendly/i.test(meta.league)) continue;
    const sport = maps.fidToSporttery.get(fid);
    const afMid = 'af:' + fid;
    let matchId = sport && sport.matchId ? String(sport.matchId) : afMid;
    // Prefer the id that already has process/compare rows (often af: for unmapped shells)
    if (!hasCompare.has(matchId) && hasCompare.has(afMid)) matchId = afMid;
    if (!dbPlayerGap.has(matchId) && dbPlayerGap.has(afMid)) matchId = afMid;
    const jingcai = !!(sport && sport.matchId && !String(sport.matchId).startsWith('af:'));
    const priority = pmdb.isJingcaiPriorityFixture(sport, meta.league);
    const topEuro = isBig5OrEuroLeague(meta.league);

    // Default prefer=jingcai: sporttery-mapped only.
    // --include-non-jingcai expands to priority (五大/欧战/sporttery-sellable) af: shells,
    // still skipping obscure/never-on-竞彩 leagues.
    if (PREFER === 'jingcai' && !jingcai) {
      if (!INCLUDE_NON_JINGCAI) continue;
      if (!priority) continue;
    }

    const needStats = !hasStats.has(fid);
    const needPlayersDisk = WANT_PLAYERS && !hasPlayers.has(fid);
    const needPlayersDb = WANT_PLAYERS && (dbPlayerGap.has(matchId) || needPlayersDisk);
    const needPlayers = needPlayersDb;
    const hasCmp = hasCompare.has(matchId);
    const isPlayerGap = hasCmp && needPlayers;

    if (PLAYER_GAPS) {
      // Only enqueue player-gap rows (compare/hard-test present, players missing)
      if (!isPlayerGap) continue;
    } else {
      // If already have compare and (players ok or not requested), skip
      if (hasCmp && !needPlayers) continue;
      // If have stats but missing compare, local phase should have filled — still allow rebuild
      if (hasCmp && needStats && !needPlayers) continue;
    }

    candidates.push({
      fixtureId: Number(fid),
      matchId,
      jingcai,
      priority,
      topEuro,
      isPlayerGap,
      meta,
      sport,
      needStats: (!PLAYER_GAPS) && (needStats || !hasCmp),
      needPlayers,
      date: meta.date || (sport && sport.date) || '',
    });
  }

  // Supplement: DB player-gaps whose fixture may be missing from team-form index
  if (WANT_PLAYERS) {
    const seenFid = new Set(candidates.map(c => String(c.fixtureId)));
    try {
      const db = pmdb.getDb();
      const rows = db.prepare(`
SELECT m.match_id, m.fixture_id, m.date, m.home_name, m.away_name, m.home_name_zh, m.away_name_zh,
  m.home_team_id, m.away_team_id, m.competition, m.ft
FROM matches m
WHERE m.fixture_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM match_process_compare c WHERE c.match_id = m.match_id)
  AND NOT EXISTS (SELECT 1 FROM player_match_stats p WHERE p.match_id = m.match_id)
`).all();
      for (const row of rows) {
        const fid = String(row.fixture_id);
        if ((done.has(fid) && !PLAYER_GAPS) || seenFid.has(fid)) continue;
        if (row.date && MIN_DATE && String(row.date) < MIN_DATE) continue;
        const isAf = String(row.match_id).startsWith('af:');
        if (isAf && PREFER === 'jingcai' && !INCLUDE_NON_JINGCAI) continue;
        const pri = pmdb.isJingcaiPriorityFixture(null, row.competition);
        if (isAf && PREFER === 'jingcai' && INCLUDE_NON_JINGCAI && !pri) continue;
        const needPlayers = !hasPlayers.has(fid);
        if (!needPlayers && !PLAYER_GAPS) continue;
        if (PLAYER_GAPS && hasPlayers.has(fid)) continue;
        const formMeta = maps.byFid.get(fid) || {};
        const sport = maps.fidToSporttery.get(fid) || {
          matchId: row.match_id,
          homeTeamId: row.home_team_id || String(formMeta.homeAfId || ''),
          awayTeamId: row.away_team_id || String(formMeta.awayAfId || ''),
          home: row.home_name || '',
          away: row.away_name || '',
          date: row.date || '',
        };
        candidates.push({
          fixtureId: Number(fid),
          matchId: String(row.match_id),
          jingcai: !isAf,
          priority: pri || !isAf,
          topEuro: isBig5OrEuroLeague(row.competition),
          isPlayerGap: true,
          meta: {
            fixtureId: Number(fid),
            date: row.date || '',
            home: row.home_name || row.home_name_zh || formMeta.home || '',
            away: row.away_name || row.away_name_zh || formMeta.away || '',
            league: row.competition || formMeta.league || '',
            ft: row.ft || formMeta.ft || '',
            homeAfId: formMeta.homeAfId || null,
            awayAfId: formMeta.awayAfId || null,
          },
          sport,
          needStats: false,
          needPlayers: true,
          date: row.date || '',
        });
        seenFid.add(fid);
      }
    } catch (e) {
      console.warn('db player-gap supplement', e.message);
    }
  }

  // Sort: player-gaps first, then 竞彩, then 五大+欧战, then other priority, then newer dates
  candidates.sort((a, b) => {
    if (a.isPlayerGap !== b.isPlayerGap) return a.isPlayerGap ? -1 : 1;
    if (PREFER === 'jingcai' || PREFER === 'mixed') {
      if (a.jingcai !== b.jingcai) return a.jingcai ? -1 : 1;
      if (!!a.topEuro !== !!b.topEuro) return a.topEuro ? -1 : 1;
      if (a.priority !== b.priority) return a.priority ? -1 : 1;
    } else if (PREFER === 'non') {
      if (a.jingcai !== b.jingcai) return a.jingcai ? 1 : -1;
      if (!!a.topEuro !== !!b.topEuro) return a.topEuro ? -1 : 1;
    }
    return String(b.date).localeCompare(String(a.date));
  });

  const resumeFrom = RESUME && state.resumeFixtureId ? String(state.resumeFixtureId) : '';
  let start = 0;
  if (resumeFrom) {
    const idx = candidates.findIndex(c => String(c.fixtureId) === resumeFrom);
    if (idx >= 0) start = idx; // re-try from that id
  }

  return { candidates, start, maps, hasCompare };
}

async function optionalAfGapFill(cap) {
  if (!cap) return { ok: true, skipped: true, reason: 'af_cap_0' };

  const status0 = await fetchAfStatus();
  console.log('AF_STATUS_BEFORE', JSON.stringify(status0));
  if (!status0.ok) return { ok: false, reason: status0.reason || 'status_fail' };

  // Headroom: leave ≥3000 for live app when possible; never burn below 800 remaining
  const remaining = status0.remaining != null ? status0.remaining : 0;
  const LIVE_RESERVE = 3000;
  const HARD_FLOOR = 800;
  let budget = Math.min(cap, Math.max(0, remaining - LIVE_RESERVE));
  if (remaining - LIVE_RESERVE < 200 && remaining > HARD_FLOOR + 100) {
    // usage already high — prefer smaller slice (~2500 max already via cap; tighten further)
    budget = Math.min(budget, Math.max(0, remaining - HARD_FLOOR - 500));
  }
  if (budget <= 0) {
    return {
      ok: true, skipped: true, reason: 'insufficient_headroom',
      remaining, liveReserve: LIVE_RESERVE, cap,
    };
  }

  const state = loadState();
  const { candidates, start, maps } = buildAfGapCandidates(state);
  console.log(`AF_GAP candidates=${candidates.length} start=${start} budget=${budget} prefer=${PREFER} players=${WANT_PLAYERS} playerGaps=${PLAYER_GAPS}`);

  const ps = require('../lib/process-stats');
  const live = require('../lib/live-stats');
  let fp = null;
  if (WANT_PLAYERS) {
    try { fp = require('../lib/fixture-players'); } catch (_) {}
  }

  let built = 0;
  let fetchedStats = 0;
  let fetchedPlayers = 0;
  let skipped = 0;
  let afCallsEst = 0;
  const errors = [];
  const done = new Set((state.doneFixtureIds || []).map(String));
  const slice = candidates.slice(start);

  const attemptCeiling = Math.max(budget * 3, budget + 50);
  let attempts = 0;
  for (let i = 0; i < slice.length; i++) {
    if (afCallsEst >= budget) {
      console.log(`AF_GAP budget exhausted at i=${i} afCallsEst=${afCallsEst}`);
      break;
    }
    if (attempts >= attemptCeiling) {
      console.log(`AF_GAP attempt ceiling at i=${i} attempts=${attempts} afCallsEst=${afCallsEst}`);
      break;
    }
    const c = slice[i];
    const fid = String(c.fixtureId);
    try {
      // Skip if structured rows appeared since candidate build
      const cmp = pmdb.getProcessCompareForMatch(c.matchId);
      const needStruct = !(cmp && cmp.rows > 0);
      let needStats = c.needStats && needStruct;
      let needPlayers = c.needPlayers;

      if (!needStats && !needPlayers && !needStruct) {
        skipped++;
        done.add(fid);
        continue;
      }

      // Hard skip never-on-竞彩 / unmapped when prefer=jingcai
      // With --include-non-jingcai still require priority (五大/欧战/sellable)
      if (PREFER === 'jingcai' && !c.jingcai) {
        if (!INCLUDE_NON_JINGCAI || !c.priority) {
          skipped++;
          done.add(fid);
          continue;
        }
      }

      if (needStats || needStruct) {
        attempts++;
        const beforeQ = live.getQuota && live.getQuota();
        const hadDisk = !!ps.loadFixtureStats && ps.loadFixtureStats(c.fixtureId);
        const pack = await ps.getFixtureStatisticsCached(c.fixtureId, { allowFetch: true });
        const afterQ = live.getQuota && live.getQuota();
        const usedCall = !hadDisk && (
          (pack && pack.cached === false)
          || (beforeQ && afterQ && beforeQ.remaining != null && afterQ.remaining != null
              && afterQ.remaining < beforeQ.remaining)
          || (!pack && !hadDisk)
        );
        if (usedCall) afCallsEst++;
        if (pack && pack.byTeam && Object.keys(pack.byTeam).length) {
          if (!pack.cached) fetchedStats++;
          const r = pmdb.upsertStructuredFromFixtureCache(c.meta, pack, maps);
          if (r.ok) built++;
        } else {
          errors.push({ fixtureId: c.fixtureId, error: 'no_stats' });
        }
      }

      if (needPlayers && fp && typeof fp.getFixturePlayers === 'function') {
        try {
          const mLike = {
            id: c.matchId,
            fixtureId: c.fixtureId,
            home: c.meta.home,
            away: c.meta.away,
            homeTeamId: (c.sport && c.sport.homeTeamId) || String(c.meta.homeAfId || ''),
            awayTeamId: (c.sport && c.sport.awayTeamId) || String(c.meta.awayAfId || ''),
            homeAfId: c.meta.homeAfId || null,
            awayAfId: c.meta.awayAfId || null,
            date: c.date,
            full: c.meta.ft || '',
            ft: c.meta.ft || '',
            status: c.meta.ft ? 'FT' : '',
          };
          // Prefer disk cache first
          let pl = fp.loadCached && fp.loadCached(c.fixtureId);
          if (pl && pl.ok) {
            pmdb.upsertFromFixturePayload(pl);
          } else {
            pl = await fp.getFixturePlayers(mLike, { allowFetch: true });
            if (pl && pl.ok) {
              if (!pl.cached) { fetchedPlayers++; afCallsEst += Math.max(1, pl.afCalls || 1); }
              pmdb.upsertFromFixturePayload(pl);
            }
          }
        } catch (e) {
          errors.push({ fixtureId: c.fixtureId, error: 'players:' + e.message });
        }
      }

      done.add(fid);
      if ((i + 1) % AF_STATUS_EVERY === 0) {
        const st = await fetchAfStatus();
        console.log(`AF_PROGRESS i=${i + 1} built=${built} stats=${fetchedStats} players=${fetchedPlayers} estCalls=${afCallsEst}`, JSON.stringify(st));
        if (st.ok && st.remaining != null && st.remaining < HARD_FLOOR) {
          console.log('AF_GAP stop: remaining below HARD_FLOOR', st.remaining);
          saveState({
            ...state,
            doneFixtureIds: [...done].slice(-5000),
            resumeFixtureId: fid,
            lastAt: new Date().toISOString(),
            lastStatus: st,
          });
          return {
            ok: true, stopped: 'hard_floor', candidates: candidates.length,
            built, fetchedStats, fetchedPlayers, afCallsEst, budget, errors: errors.slice(0, 8),
            status: st,
          };
        }
      }
      await sleep(AF_DELAY_MS);
    } catch (e) {
      errors.push({ fixtureId: c.fixtureId, error: e.message });
      console.warn('AF_GAP error', c.fixtureId, e.message);
      await sleep(AF_DELAY_MS);
    }
  }

  const status1 = await fetchAfStatus();
  const nextCand = slice.find(c => !done.has(String(c.fixtureId)));
  saveState({
    doneFixtureIds: [...done].slice(-8000),
    resumeFixtureId: nextCand ? String(nextCand.fixtureId) : null,
    lastAt: new Date().toISOString(),
    lastStatus: status1,
    lastBuilt: built,
  });

  return {
    ok: true,
    candidates: candidates.length,
    start,
    built,
    skipped,
    fetchedStats,
    fetchedPlayers,
    afCallsEst,
    budget,
    cap,
    prefer: PREFER,
    resumeNext: nextCand ? nextCand.fixtureId : null,
    statusBefore: status0,
    statusAfter: status1,
    errors: errors.slice(0, 8),
    resumeHint: nextCand
      ? `node tools/backfill-player-match-db.js --af-cap=${cap} --resume${WANT_PLAYERS ? ' --players' : ''}${PLAYER_GAPS ? ' --player-gaps' : ''}${INCLUDE_NON_JINGCAI ? ' --include-non-jingcai' : ''} --prefer=${PREFER}`
      : 'gap queue drained for current criteria',
    playerGaps: PLAYER_GAPS,
  };
}

(async () => {
  const beforeBytes = (() => {
    try { return fs.statSync(pmdb.DB_PATH()).size; } catch { return 0; }
  })();
  const before = pmdb.statsSummary();
  console.log('BEFORE', JSON.stringify({ ...before, bytesHuman: beforeBytes }, null, 2));

  const skipNonJingcai = PREFER === 'jingcai' && !INCLUDE_NON_JINGCAI;
  const r = pmdb.fullBackfillFromLocalCaches({ skipNonJingcai });
  console.log('LOCAL', JSON.stringify({ ...r, skipNonJingcai, prefer: PREFER }, null, 2));

  let af = { ok: true, skipped: true, reason: LOCAL_ONLY ? 'local_only' : 'af_cap_0' };
  if (AF_CAP > 0) {
    try {
      af = await optionalAfGapFill(AF_CAP);
      console.log('AF_GAP', JSON.stringify(af, null, 2));
    } catch (e) {
      console.warn('AF_GAP fatal', e.message);
      af = { ok: false, error: e.message };
    }
  }

  const after = pmdb.statsSummary();
  let afterBytes = after.bytes || 0;
  try { afterBytes = fs.statSync(pmdb.DB_PATH()).size; } catch {}
  console.log('AFTER', JSON.stringify({
    ...after,
    bytes: afterBytes,
    bytesHuman: `${(afterBytes / 1024).toFixed(1)} KiB`,
    deltaBytes: afterBytes - beforeBytes,
  }, null, 2));

  const samples = pmdb.queryPlayerByName('Haaland', { limit: 3 });
  const zh = samples.length ? samples : pmdb.queryPlayerByName('哈兰德', { limit: 3 });
  console.log('samplePlayers', zh.map(x => ({
    date: x.date, name: x.name_zh || x.name_en, goals: x.goals, shots: x.shots, rating: x.rating,
    vs: (x.home_name_zh || '') + ' vs ' + (x.away_name_zh || ''),
  })));
  const outs = pmdb.listRecentOutcomes({ limit: 5 });
  console.log('sampleOutcomes', outs.map(o => ({
    matchId: o.match_id, date: o.date, ft: o.ft,
    lean: o.pred_lean, conf: o.pred_conf, hit: o.lean_hit, snippet: (o.snippet || '').slice(0, 60),
  })));
  const sampleMid = outs[0] && outs[0].match_id;
  if (sampleMid) {
    const cmp = pmdb.getProcessCompareForMatch(sampleMid);
    const ht = pmdb.getHardTestEpisodesForMatch(sampleMid);
    console.log('sampleStructured', {
      matchId: sampleMid,
      compareRows: cmp.rows,
      hardEpisodes: ht.length,
      homeMetrics: Object.keys(cmp.home || {}).slice(0, 4),
      moisture: ht.map(e => ({ side: e.side, tag: e.moistureTag, si: e.opponentStrength })),
    });
  }
  // Confirm predict-path DB reads
  try {
    const te = require('../lib/team-evidence');
    const tid = outs[0] && outs[0].home_team_id;
    if (tid) {
      const eps = te.getTeamEpisodes(tid, { limit: 3 });
      console.log('evidencePreferDb', {
        teamId: tid,
        n: eps.length,
        sources: eps.map(e => e.source || (e.fromDb ? 'db' : 'json')),
      });
    }
    // Also probe an AF-backed team id if present
    const db = pmdb.getDb();
    const afEp = db.prepare(`
SELECT team_id, COUNT(*) c FROM hard_test_episodes
GROUP BY team_id ORDER BY c DESC LIMIT 3
`).all();
    console.log('hardTestTopTeams', afEp);
  } catch (e) {
    console.warn('evidence check', e.message);
  }

  // Distinct compare matches
  try {
    const db = pmdb.getDb();
    console.log('COUNTS', {
      compareMatches: db.prepare('SELECT COUNT(DISTINCT match_id) c FROM match_process_compare').get().c,
      hardMatches: db.prepare('SELECT COUNT(DISTINCT match_id) c FROM hard_test_episodes').get().c,
      afMatches: db.prepare(`SELECT COUNT(*) c FROM matches WHERE match_id LIKE 'af:%'`).get().c,
      jingcaiOutcomes: db.prepare(`SELECT COUNT(*) c FROM match_outcomes WHERE match_id NOT LIKE 'af:%'`).get().c,
    });
  } catch (_) {}

  pmdb.closeDb();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
