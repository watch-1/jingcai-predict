/**
 * 自有球员×场次事实库 (1.9.61)
 * - SQLite: data/player-match.sqlite
 * - Facts append/upsert idempotent by (matchId, playerId)
 * - Tags (keyPlayer score, line) may be recomputed
 * - AI slice: compressed recent rows for DeepSeek prematch (bounded tokens)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./db');

const DB_PATH = () => path.join(DATA_DIR, 'player-match.sqlite');

const DEFAULT_RECENT_MATCHES = 4;
const DEFAULT_TOP_PER_MATCH = 5;
const MAX_ROWS_PER_SIDE = 24;
const MAX_TOTAL_ROWS = 48;
const MAX_KEY_PLAYERS = 8;

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH());
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 3000');
  _db.exec(`
CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  fixture_id INTEGER,
  date TEXT,
  home_team_id TEXT,
  away_team_id TEXT,
  home_name TEXT,
  away_name TEXT,
  home_name_zh TEXT,
  away_name_zh TEXT,
  competition TEXT,
  opponent_si REAL,
  ft TEXT,
  source TEXT,
  fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_team_id, date);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_team_id, date);
CREATE INDEX IF NOT EXISTS idx_matches_fixture ON matches(fixture_id);

CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT,
  side TEXT,
  name_en TEXT,
  name_zh TEXT,
  position TEXT,
  position_zh TEXT,
  minutes REAL,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  shots REAL,
  shots_on REAL,
  key_passes REAL,
  tackles REAL,
  passes REAL,
  passes_accuracy REAL,
  rating REAL,
  yellow INTEGER DEFAULT 0,
  red INTEGER DEFAULT 0,
  saves REAL,
  captain INTEGER DEFAULT 0,
  substitute INTEGER DEFAULT 0,
  photo TEXT,
  source TEXT,
  fetched_at TEXT,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pms_team_date ON player_match_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats(player_id);

CREATE TABLE IF NOT EXISTS player_tags (
  player_id TEXT PRIMARY KEY,
  team_id TEXT,
  name_en TEXT,
  name_zh TEXT,
  line TEXT,
  key_player_score REAL,
  appearances INTEGER DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tags_team ON player_tags(team_id);
CREATE INDEX IF NOT EXISTS idx_tags_score ON player_tags(key_player_score DESC);

CREATE TABLE IF NOT EXISTS match_outcomes (
  match_id TEXT PRIMARY KEY,
  fixture_id INTEGER,
  date TEXT,
  league TEXT,
  home_team_id TEXT,
  away_team_id TEXT,
  home_name TEXT,
  away_name TEXT,
  ft TEXT,
  result TEXT,
  pred_lean TEXT,
  pred_conf REAL,
  pred_pick_text TEXT,
  speak_mode TEXT,
  market_lean TEXT,
  lean_hit INTEGER,
  market_hit INTEGER,
  amplify_hit INTEGER,
  has_actual_stats INTEGER DEFAULT 0,
  snippet TEXT,
  hard_test_available INTEGER DEFAULT 0,
  source TEXT,
  generated_at TEXT,
  fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outcomes_date ON match_outcomes(date);
CREATE INDEX IF NOT EXISTS idx_outcomes_lean_hit ON match_outcomes(lean_hit);

CREATE TABLE IF NOT EXISTS match_process_compare (
  match_id TEXT NOT NULL,
  side TEXT NOT NULL,
  metric TEXT NOT NULL,
  actual REAL,
  recent_avg REAL,
  delta REAL,
  missing INTEGER DEFAULT 0,
  fetched_at TEXT,
  PRIMARY KEY (match_id, side, metric)
);
CREATE INDEX IF NOT EXISTS idx_mpc_match ON match_process_compare(match_id);
CREATE INDEX IF NOT EXISTS idx_mpc_side ON match_process_compare(side, match_id);

CREATE TABLE IF NOT EXISTS hard_test_episodes (
  match_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  side TEXT,
  date TEXT,
  team_name TEXT,
  opponent_id TEXT,
  opponent TEXT,
  opponent_si REAL,
  opponent_band TEXT,
  schedule_si REAL,
  schedule_band TEXT,
  is_hard_test INTEGER DEFAULT 0,
  moisture_tag TEXT,
  moisture_label_zh TEXT,
  mechanism_tags TEXT,
  collapse_n INTEGER,
  core_collapse INTEGER,
  brief_summary_zh TEXT,
  metrics_json TEXT,
  ft TEXT,
  result TEXT,
  league TEXT,
  created_at TEXT,
  fetched_at TEXT,
  PRIMARY KEY (match_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_hte_team_date ON hard_test_episodes(team_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_hte_hard ON hard_test_episodes(team_id, is_hard_test, date DESC);
CREATE INDEX IF NOT EXISTS idx_hte_match ON hard_test_episodes(match_id);
`);
  return _db;
}

function closeDb() {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function lineFromPos(position, positionZh) {
  const p = String(position || '').toUpperCase();
  const zh = String(positionZh || '');
  if (p === 'G' || /Goalkeeper|门将/i.test(position || '') || /门将/.test(zh)) return 'GK';
  if (p === 'D' || /Defend/i.test(position || '') || /后卫/.test(zh)) return 'DEF';
  if (p === 'M' || /Midfield/i.test(position || '') || /中场/.test(zh)) return 'MID';
  if (p === 'F' || /Attack|Forward/i.test(position || '') || /前锋/.test(zh)) return 'FWD';
  return 'MID';
}

/** Local key-player score for one match row (same spirit as fixture-players.selectKeyPlayers). */
function rowScore(p) {
  const r = p.rating != null ? Number(p.rating) : 0;
  const g = Number(p.goals) || 0;
  const a = Number(p.assists) || 0;
  const m = p.minutes != null ? Math.min(Number(p.minutes), 90) / 90 : 0;
  const sh = Number(p.shots) || 0;
  const kp = Number(p.keyPasses) || 0;
  const tk = Number(p.tackles) || 0;
  return r * 1.2 + g * 2.5 + a * 1.8 + m * 0.5 + sh * 0.12 + kp * 0.25 + tk * 0.1;
}

function playerLabel(row) {
  const zh = row.name_zh || row.nameZh || '';
  if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  return row.name_en || row.name || row.nameEn || '?';
}

/**
 * Upsert one fixture-players payload into the warehouse.
 * Idempotent by (match_id, player_id).
 * @returns {{ ok: boolean, matchId: string, players: number, reason?: string }}
 */
function upsertFromFixturePayload(payload) {
  if (!payload || !payload.ok) return { ok: false, matchId: '', players: 0, reason: 'bad_payload' };
  const fixtureId = payload.fixtureId != null ? Number(payload.fixtureId) : null;
  const matchId = String(payload.matchId || (fixtureId != null ? 'f:' + fixtureId : '') || '');
  if (!matchId) return { ok: false, matchId: '', players: 0, reason: 'no_match_id' };

  const fetchedAt = payload.fetchedAt || new Date().toISOString();
  const source = payload.source || 'api-football';
  const db = getDb();

  const upsertMatch = db.prepare(`
INSERT INTO matches (
  match_id, fixture_id, date, home_team_id, away_team_id,
  home_name, away_name, home_name_zh, away_name_zh,
  competition, opponent_si, ft, source, fetched_at
) VALUES (
  @match_id, @fixture_id, @date, @home_team_id, @away_team_id,
  @home_name, @away_name, @home_name_zh, @away_name_zh,
  @competition, @opponent_si, @ft, @source, @fetched_at
)
ON CONFLICT(match_id) DO UPDATE SET
  fixture_id=COALESCE(excluded.fixture_id, matches.fixture_id),
  date=COALESCE(NULLIF(excluded.date,''), matches.date),
  home_team_id=COALESCE(NULLIF(excluded.home_team_id,''), matches.home_team_id),
  away_team_id=COALESCE(NULLIF(excluded.away_team_id,''), matches.away_team_id),
  home_name=COALESCE(NULLIF(excluded.home_name,''), matches.home_name),
  away_name=COALESCE(NULLIF(excluded.away_name,''), matches.away_name),
  home_name_zh=COALESCE(NULLIF(excluded.home_name_zh,''), matches.home_name_zh),
  away_name_zh=COALESCE(NULLIF(excluded.away_name_zh,''), matches.away_name_zh),
  competition=COALESCE(NULLIF(excluded.competition,''), matches.competition),
  ft=COALESCE(NULLIF(excluded.ft,''), matches.ft),
  source=excluded.source,
  fetched_at=excluded.fetched_at
`);

  const upsertPlayer = db.prepare(`
INSERT INTO player_match_stats (
  match_id, player_id, team_id, side, name_en, name_zh,
  position, position_zh, minutes, goals, assists, shots, shots_on,
  key_passes, tackles, passes, passes_accuracy, rating,
  yellow, red, saves, captain, substitute, photo, source, fetched_at
) VALUES (
  @match_id, @player_id, @team_id, @side, @name_en, @name_zh,
  @position, @position_zh, @minutes, @goals, @assists, @shots, @shots_on,
  @key_passes, @tackles, @passes, @passes_accuracy, @rating,
  @yellow, @red, @saves, @captain, @substitute, @photo, @source, @fetched_at
)
ON CONFLICT(match_id, player_id) DO UPDATE SET
  team_id=excluded.team_id,
  side=excluded.side,
  name_en=COALESCE(NULLIF(excluded.name_en,''), player_match_stats.name_en),
  name_zh=COALESCE(NULLIF(excluded.name_zh,''), player_match_stats.name_zh),
  position=excluded.position,
  position_zh=excluded.position_zh,
  minutes=excluded.minutes,
  goals=excluded.goals,
  assists=excluded.assists,
  shots=excluded.shots,
  shots_on=excluded.shots_on,
  key_passes=excluded.key_passes,
  tackles=excluded.tackles,
  passes=excluded.passes,
  passes_accuracy=excluded.passes_accuracy,
  rating=excluded.rating,
  yellow=excluded.yellow,
  red=excluded.red,
  saves=excluded.saves,
  captain=excluded.captain,
  substitute=excluded.substitute,
  photo=excluded.photo,
  source=excluded.source,
  fetched_at=excluded.fetched_at
`);

  const homeTeamId = String(payload.homeTeamId || '');
  const awayTeamId = String(payload.awayTeamId || '');
  const homePlayers = (payload.home && payload.home.players) || [];
  const awayPlayers = (payload.away && payload.away.players) || [];

  const tx = db.transaction(() => {
    upsertMatch.run({
      match_id: matchId,
      fixture_id: fixtureId,
      date: payload.date || '',
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_name: payload.homeName || (payload.home && payload.home.name) || '',
      away_name: payload.awayName || (payload.away && payload.away.name) || '',
      home_name_zh: payload.homeNameZh || (payload.home && payload.home.nameZh) || '',
      away_name_zh: payload.awayNameZh || (payload.away && payload.away.nameZh) || '',
      competition: payload.competition || payload.league || '',
      opponent_si: payload.opponentSi != null ? Number(payload.opponentSi) : null,
      ft: payload.ft || '',
      source,
      fetched_at: fetchedAt,
    });

    let n = 0;
    const ingest = (list, side, teamId) => {
      for (const p of list) {
        if (!p || !p.id) continue;
        upsertPlayer.run({
          match_id: matchId,
          player_id: String(p.id),
          team_id: teamId || '',
          side,
          name_en: p.name || '',
          name_zh: p.nameZh || '',
          position: p.position || '',
          position_zh: p.positionZh || '',
          minutes: num(p.minutes),
          goals: Number(p.goals) || 0,
          assists: Number(p.assists) || 0,
          shots: num(p.shots),
          shots_on: num(p.shotsOn),
          key_passes: num(p.keyPasses),
          tackles: num(p.tackles),
          passes: num(p.passes),
          passes_accuracy: num(p.passesAccuracy),
          rating: num(p.rating),
          yellow: Number(p.yellow) || 0,
          red: Number(p.red) || 0,
          saves: num(p.saves),
          captain: p.captain ? 1 : 0,
          substitute: p.substitute ? 1 : 0,
          photo: p.photo || '',
          source,
          fetched_at: fetchedAt,
        });
        n++;
      }
    };
    ingest(homePlayers, 'home', homeTeamId);
    ingest(awayPlayers, 'away', awayTeamId);
    return n;
  });

  const players = tx();
  // Recompute tags for teams involved (non-fatal)
  try {
    if (homeTeamId) recomputeTagsForTeam(homeTeamId);
    if (awayTeamId) recomputeTagsForTeam(awayTeamId);
  } catch (e) {
    console.warn('player-match-db tags', e.message);
  }
  return { ok: true, matchId, players, fixtureId };
}

/**
 * Recompute player_tags for a sporttery team id from recent appearances.
 */
function recomputeTagsForTeam(teamId, { lookback = 12 } = {}) {
  const tid = String(teamId || '');
  if (!tid) return 0;
  const db = getDb();
  const rows = db.prepare(`
SELECT p.*, m.date AS match_date
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.team_id = ?
ORDER BY m.date DESC
LIMIT 800
`).all(tid);

  const byPlayer = new Map();
  for (const r of rows) {
    const pid = String(r.player_id);
    if (!byPlayer.has(pid)) {
      byPlayer.set(pid, { rows: [], name_en: r.name_en, name_zh: r.name_zh, position: r.position, position_zh: r.position_zh });
    }
    const bucket = byPlayer.get(pid);
    if (bucket.rows.length < lookback) bucket.rows.push(r);
    if (r.name_zh) bucket.name_zh = r.name_zh;
    if (r.name_en) bucket.name_en = r.name_en;
    if (r.position) bucket.position = r.position;
    if (r.position_zh) bucket.position_zh = r.position_zh;
  }

  const upsertTag = db.prepare(`
INSERT INTO player_tags (player_id, team_id, name_en, name_zh, line, key_player_score, appearances, updated_at)
VALUES (@player_id, @team_id, @name_en, @name_zh, @line, @key_player_score, @appearances, @updated_at)
ON CONFLICT(player_id) DO UPDATE SET
  team_id=excluded.team_id,
  name_en=COALESCE(NULLIF(excluded.name_en,''), player_tags.name_en),
  name_zh=COALESCE(NULLIF(excluded.name_zh,''), player_tags.name_zh),
  line=excluded.line,
  key_player_score=excluded.key_player_score,
  appearances=excluded.appearances,
  updated_at=excluded.updated_at
`);

  const now = new Date().toISOString();
  let n = 0;
  const tx = db.transaction(() => {
    for (const [pid, info] of byPlayer) {
      const played = info.rows.filter(r => (r.minutes || 0) > 0);
      if (!played.length) continue;
      const avg = played.reduce((s, r) => s + rowScore(r), 0) / played.length;
      // slight boost for consistency (appearances)
      const score = avg + Math.min(played.length, 8) * 0.05;
      upsertTag.run({
        player_id: pid,
        team_id: tid,
        name_en: info.name_en || '',
        name_zh: info.name_zh || '',
        line: lineFromPos(info.position, info.position_zh),
        key_player_score: Math.round(score * 100) / 100,
        appearances: played.length,
        updated_at: now,
      });
      n++;
    }
  });
  tx();
  return n;
}

/**
 * Import all on-disk fixture-players caches into SQLite.
 */
function backfillFromDiskCaches() {
  const dir = path.join(DATA_DIR, 'live-stats', 'fixture-players');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  } catch {
    return { ok: false, imported: 0, players: 0, reason: 'no_cache_dir' };
  }
  let imported = 0;
  let players = 0;
  const errors = [];
  for (const f of files) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const r = upsertFromFixturePayload(payload);
      if (r.ok) {
        imported++;
        players += r.players;
      }
    } catch (e) {
      errors.push({ file: f, error: e.message });
    }
  }
  return { ok: true, imported, players, files: files.length, errors: errors.slice(0, 5) };
}

/** Upsert lean match shell (no player rows) — used by review/history backfill. */
function upsertMatchShell(row) {
  if (!row || !row.match_id) return { ok: false, reason: 'no_match_id' };
  const db = getDb();
  const fetchedAt = row.fetched_at || new Date().toISOString();
  db.prepare(`
INSERT INTO matches (
  match_id, fixture_id, date, home_team_id, away_team_id,
  home_name, away_name, home_name_zh, away_name_zh,
  competition, opponent_si, ft, source, fetched_at
) VALUES (
  @match_id, @fixture_id, @date, @home_team_id, @away_team_id,
  @home_name, @away_name, @home_name_zh, @away_name_zh,
  @competition, @opponent_si, @ft, @source, @fetched_at
)
ON CONFLICT(match_id) DO UPDATE SET
  fixture_id=COALESCE(excluded.fixture_id, matches.fixture_id),
  date=COALESCE(NULLIF(excluded.date,''), matches.date),
  home_team_id=COALESCE(NULLIF(excluded.home_team_id,''), matches.home_team_id),
  away_team_id=COALESCE(NULLIF(excluded.away_team_id,''), matches.away_team_id),
  home_name=COALESCE(NULLIF(excluded.home_name,''), matches.home_name),
  away_name=COALESCE(NULLIF(excluded.away_name,''), matches.away_name),
  home_name_zh=COALESCE(NULLIF(excluded.home_name_zh,''), matches.home_name_zh),
  away_name_zh=COALESCE(NULLIF(excluded.away_name_zh,''), matches.away_name_zh),
  competition=COALESCE(NULLIF(excluded.competition,''), matches.competition),
  ft=COALESCE(NULLIF(excluded.ft,''), matches.ft),
  source=CASE WHEN matches.source = 'api-football' THEN matches.source ELSE excluded.source END,
  fetched_at=CASE WHEN matches.source = 'api-football' THEN matches.fetched_at ELSE excluded.fetched_at END
`).run({
    match_id: String(row.match_id),
    fixture_id: row.fixture_id != null ? Number(row.fixture_id) : null,
    date: row.date || '',
    home_team_id: String(row.home_team_id || ''),
    away_team_id: String(row.away_team_id || ''),
    home_name: row.home_name || '',
    away_name: row.away_name || '',
    home_name_zh: row.home_name_zh || row.home_name || '',
    away_name_zh: row.away_name_zh || row.away_name || '',
    competition: row.competition || '',
    opponent_si: row.opponent_si != null ? Number(row.opponent_si) : null,
    ft: row.ft || '',
    source: row.source || 'shell',
    fetched_at: fetchedAt,
  });
  return { ok: true, matchId: String(row.match_id) };
}

function bool01(v) {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return null;
}

/**
 * Upsert lean review outcome (no HTML). Also upserts a match shell.
 * @param {object} review post-match review payload (disk.payload)
 */
function upsertOutcomeFromReview(review) {
  if (!review || !review.matchId) return { ok: false, reason: 'no_match_id' };
  const matchId = String(review.matchId);
  const pred = review.prediction || {};
  const fb = review.leanFeedback || {};
  const predAngle = Array.isArray(review.angles)
    ? review.angles.find(a => a && a.key === 'prediction')
    : null;
  const leanHit = fb.available ? bool01(fb.leanHit) : (predAngle && predAngle.hasData ? bool01(predAngle.hit) : null);
  const marketHit = fb.available ? bool01(fb.marketHit) : null;
  const amplifyHit = fb.available && fb.amplified ? bool01(fb.amplifyHit) : null;
  const snippet = Array.isArray(review.intelSnippets) && review.intelSnippets[0]
    ? String(review.intelSnippets[0]).slice(0, 280)
    : (predAngle && predAngle.text ? String(predAngle.text).slice(0, 280) : '');
  const fetchedAt = new Date().toISOString();
  const fixtureId = review.fixtureId != null ? Number(review.fixtureId) : null;

  upsertMatchShell({
    match_id: matchId,
    fixture_id: fixtureId,
    date: review.date || '',
    home_team_id: review.homeTeamId || '',
    away_team_id: review.awayTeamId || '',
    home_name: review.home || '',
    away_name: review.away || '',
    home_name_zh: review.home || '',
    away_name_zh: review.away || '',
    competition: review.league || '',
    ft: review.ft || '',
    source: 'post-match-review',
    fetched_at: fetchedAt,
  });

  const db = getDb();
  db.prepare(`
INSERT INTO match_outcomes (
  match_id, fixture_id, date, league, home_team_id, away_team_id,
  home_name, away_name, ft, result,
  pred_lean, pred_conf, pred_pick_text, speak_mode, market_lean,
  lean_hit, market_hit, amplify_hit, has_actual_stats, snippet,
  hard_test_available, source, generated_at, fetched_at
) VALUES (
  @match_id, @fixture_id, @date, @league, @home_team_id, @away_team_id,
  @home_name, @away_name, @ft, @result,
  @pred_lean, @pred_conf, @pred_pick_text, @speak_mode, @market_lean,
  @lean_hit, @market_hit, @amplify_hit, @has_actual_stats, @snippet,
  @hard_test_available, @source, @generated_at, @fetched_at
)
ON CONFLICT(match_id) DO UPDATE SET
  fixture_id=COALESCE(excluded.fixture_id, match_outcomes.fixture_id),
  date=COALESCE(NULLIF(excluded.date,''), match_outcomes.date),
  league=COALESCE(NULLIF(excluded.league,''), match_outcomes.league),
  home_team_id=COALESCE(NULLIF(excluded.home_team_id,''), match_outcomes.home_team_id),
  away_team_id=COALESCE(NULLIF(excluded.away_team_id,''), match_outcomes.away_team_id),
  home_name=COALESCE(NULLIF(excluded.home_name,''), match_outcomes.home_name),
  away_name=COALESCE(NULLIF(excluded.away_name,''), match_outcomes.away_name),
  ft=COALESCE(NULLIF(excluded.ft,''), match_outcomes.ft),
  result=COALESCE(NULLIF(excluded.result,''), match_outcomes.result),
  pred_lean=COALESCE(NULLIF(excluded.pred_lean,''), match_outcomes.pred_lean),
  pred_conf=COALESCE(excluded.pred_conf, match_outcomes.pred_conf),
  pred_pick_text=COALESCE(NULLIF(excluded.pred_pick_text,''), match_outcomes.pred_pick_text),
  speak_mode=COALESCE(NULLIF(excluded.speak_mode,''), match_outcomes.speak_mode),
  market_lean=COALESCE(NULLIF(excluded.market_lean,''), match_outcomes.market_lean),
  lean_hit=COALESCE(excluded.lean_hit, match_outcomes.lean_hit),
  market_hit=COALESCE(excluded.market_hit, match_outcomes.market_hit),
  amplify_hit=COALESCE(excluded.amplify_hit, match_outcomes.amplify_hit),
  has_actual_stats=MAX(excluded.has_actual_stats, match_outcomes.has_actual_stats),
  snippet=COALESCE(NULLIF(excluded.snippet,''), match_outcomes.snippet),
  hard_test_available=MAX(excluded.hard_test_available, match_outcomes.hard_test_available),
  source=excluded.source,
  generated_at=COALESCE(NULLIF(excluded.generated_at,''), match_outcomes.generated_at),
  fetched_at=excluded.fetched_at
`).run({
    match_id: matchId,
    fixture_id: fixtureId,
    date: review.date || '',
    league: review.league || '',
    home_team_id: String(review.homeTeamId || ''),
    away_team_id: String(review.awayTeamId || ''),
    home_name: review.home || '',
    away_name: review.away || '',
    ft: review.ft || '',
    result: review.result || '',
    pred_lean: pred.lean || fb.lean || '',
    pred_conf: pred.conf != null ? Number(pred.conf) : (fb.conf != null ? Number(fb.conf) : null),
    pred_pick_text: pred.pickText || fb.pickText || '',
    speak_mode: pred.speakMode || fb.speakMode || '',
    market_lean: pred.marketLean || fb.marketLean || '',
    lean_hit: leanHit,
    market_hit: marketHit,
    amplify_hit: amplifyHit,
    has_actual_stats: review.hasActualStats ? 1 : 0,
    snippet,
    hard_test_available: (review.hardTest && review.hardTest.available) ? 1 : 0,
    source: 'post-match-review',
    generated_at: review.generatedAt || '',
    fetched_at: fetchedAt,
  });
  const compare = upsertProcessCompareFromReview(review);
  const hard = upsertHardTestFromReview(review);
  return {
    ok: true,
    matchId,
    leanHit,
    hasActualStats: !!review.hasActualStats,
    compareRows: compare.rows || 0,
    hardEpisodes: hard.written || 0,
  };
}


/**
 * Upsert 指标对照 rows from review.deltas (actual / recentAvg / Δ). No HTML / no AI narrative.
 */
function upsertProcessCompareFromReview(review) {
  if (!review || !review.matchId) return { ok: false, rows: 0, reason: 'no_match_id' };
  const matchId = String(review.matchId);
  const deltas = review.deltas || {};
  const fetchedAt = new Date().toISOString();
  const db = getDb();
  const stmt = db.prepare(`
INSERT INTO match_process_compare (
  match_id, side, metric, actual, recent_avg, delta, missing, fetched_at
) VALUES (
  @match_id, @side, @metric, @actual, @recent_avg, @delta, @missing, @fetched_at
)
ON CONFLICT(match_id, side, metric) DO UPDATE SET
  actual=excluded.actual,
  recent_avg=excluded.recent_avg,
  delta=excluded.delta,
  missing=excluded.missing,
  fetched_at=excluded.fetched_at
`);
  let rows = 0;
  const writeSide = (side) => {
    const sideD = deltas[side];
    if (!sideD || typeof sideD !== 'object') return;
    for (const [metric, d] of Object.entries(sideD)) {
      if (!d || typeof d !== 'object') continue;
      stmt.run({
        match_id: matchId,
        side,
        metric: String(metric),
        actual: num(d.actual),
        recent_avg: num(d.baseline != null ? d.baseline : d.recentAvg),
        delta: num(d.delta),
        missing: d.missing ? 1 : 0,
        fetched_at: fetchedAt,
      });
      rows++;
    }
  };
  const tx = db.transaction(() => {
    writeSide('home');
    writeSide('away');
  });
  tx();
  return { ok: true, matchId, rows };
}

/**
 * Upsert hard-test episodes (metrics + tags + SI). Prefer review.hardTest sides; else build via team-evidence.
 * Does NOT store AI long-form narrative.
 */
function upsertHardTestFromReview(review) {
  if (!review || !review.matchId) return { ok: false, written: 0, reason: 'no_match_id' };
  const matchId = String(review.matchId);
  const fetchedAt = new Date().toISOString();
  let homeEp = review.hardTest && review.hardTest.home ? review.hardTest.home : null;
  let awayEp = review.hardTest && review.hardTest.away ? review.hardTest.away : null;
  if ((!homeEp && !awayEp) && review.hasActualStats && review.deltas) {
    try {
      const te = require('./team-evidence');
      homeEp = te.buildEpisodeForSide({ review, side: 'home' });
      awayEp = te.buildEpisodeForSide({ review, side: 'away' });
    } catch (_) {}
  }
  const db = getDb();
  const stmt = db.prepare(`
INSERT INTO hard_test_episodes (
  match_id, team_id, side, date, team_name, opponent_id, opponent,
  opponent_si, opponent_band, schedule_si, schedule_band,
  is_hard_test, moisture_tag, moisture_label_zh, mechanism_tags,
  collapse_n, core_collapse, brief_summary_zh, metrics_json,
  ft, result, league, created_at, fetched_at
) VALUES (
  @match_id, @team_id, @side, @date, @team_name, @opponent_id, @opponent,
  @opponent_si, @opponent_band, @schedule_si, @schedule_band,
  @is_hard_test, @moisture_tag, @moisture_label_zh, @mechanism_tags,
  @collapse_n, @core_collapse, @brief_summary_zh, @metrics_json,
  @ft, @result, @league, @created_at, @fetched_at
)
ON CONFLICT(match_id, team_id) DO UPDATE SET
  side=excluded.side,
  date=COALESCE(NULLIF(excluded.date,''), hard_test_episodes.date),
  team_name=COALESCE(NULLIF(excluded.team_name,''), hard_test_episodes.team_name),
  opponent_id=COALESCE(NULLIF(excluded.opponent_id,''), hard_test_episodes.opponent_id),
  opponent=COALESCE(NULLIF(excluded.opponent,''), hard_test_episodes.opponent),
  opponent_si=COALESCE(excluded.opponent_si, hard_test_episodes.opponent_si),
  opponent_band=COALESCE(NULLIF(excluded.opponent_band,''), hard_test_episodes.opponent_band),
  schedule_si=COALESCE(excluded.schedule_si, hard_test_episodes.schedule_si),
  schedule_band=COALESCE(NULLIF(excluded.schedule_band,''), hard_test_episodes.schedule_band),
  is_hard_test=excluded.is_hard_test,
  moisture_tag=excluded.moisture_tag,
  moisture_label_zh=excluded.moisture_label_zh,
  mechanism_tags=excluded.mechanism_tags,
  collapse_n=excluded.collapse_n,
  core_collapse=excluded.core_collapse,
  brief_summary_zh=COALESCE(NULLIF(excluded.brief_summary_zh,''), hard_test_episodes.brief_summary_zh),
  metrics_json=COALESCE(NULLIF(excluded.metrics_json,''), hard_test_episodes.metrics_json),
  ft=COALESCE(NULLIF(excluded.ft,''), hard_test_episodes.ft),
  result=COALESCE(NULLIF(excluded.result,''), hard_test_episodes.result),
  league=COALESCE(NULLIF(excluded.league,''), hard_test_episodes.league),
  created_at=COALESCE(NULLIF(excluded.created_at,''), hard_test_episodes.created_at),
  fetched_at=excluded.fetched_at
`);
  let written = 0;
  const writeEp = (ep) => {
    if (!ep || !ep.teamId) return;
    if (String(ep.teamId).startsWith('name:')) return;
    const metrics = ep.thisMatchVsRecent || ep.metrics || null;
    stmt.run({
      match_id: matchId,
      team_id: String(ep.teamId),
      side: ep.side || '',
      date: ep.date || review.date || '',
      team_name: ep.teamName || '',
      opponent_id: ep.opponentId != null ? String(ep.opponentId) : '',
      opponent: ep.opponent || '',
      opponent_si: num(ep.opponentStrength != null ? ep.opponentStrength : ep.opponentSi),
      opponent_band: ep.opponentBand || '',
      schedule_si: num(ep.scheduleSoftnessBefore),
      schedule_band: ep.scheduleBand || '',
      is_hard_test: ep.isHardTest ? 1 : 0,
      moisture_tag: ep.moistureTag || '',
      moisture_label_zh: ep.moistureLabelZh || '',
      mechanism_tags: JSON.stringify(Array.isArray(ep.mechanismTags) ? ep.mechanismTags.slice(0, 8) : []),
      collapse_n: ep.collapseN != null ? Number(ep.collapseN) : null,
      core_collapse: ep.coreCollapse != null ? Number(ep.coreCollapse) : null,
      brief_summary_zh: ep.briefSummaryZh ? String(ep.briefSummaryZh).slice(0, 400) : '',
      metrics_json: metrics ? JSON.stringify(metrics) : '',
      ft: ep.ft || review.ft || '',
      result: ep.result || review.result || '',
      league: ep.league || review.league || '',
      created_at: ep.createdAt || fetchedAt,
      fetched_at: fetchedAt,
    });
    written++;
  };
  const tx = db.transaction(() => {
    writeEp(homeEp);
    writeEp(awayEp);
  });
  tx();
  return { ok: true, matchId, written };
}

function rowToHardEpisode(r) {
  if (!r) return null;
  let mechanismTags = [];
  try { mechanismTags = JSON.parse(r.mechanism_tags || '[]'); } catch { mechanismTags = []; }
  let thisMatchVsRecent = null;
  try { thisMatchVsRecent = r.metrics_json ? JSON.parse(r.metrics_json) : null; } catch { thisMatchVsRecent = null; }
  return {
    matchId: r.match_id,
    date: r.date || '',
    side: r.side || '',
    teamId: r.team_id,
    teamName: r.team_name || '',
    opponentId: r.opponent_id || '',
    opponent: r.opponent || '',
    opponentStrength: r.opponent_si,
    opponentBand: r.opponent_band || null,
    scheduleSoftnessBefore: r.schedule_si,
    scheduleBand: r.schedule_band || null,
    thisMatchVsRecent,
    collapseN: r.collapse_n,
    coreCollapse: r.core_collapse,
    isHardTest: !!r.is_hard_test,
    moistureTag: r.moisture_tag || '',
    moistureLabelZh: r.moisture_label_zh || '',
    mechanismTags,
    briefSummaryZh: r.brief_summary_zh || '',
    ft: r.ft || null,
    result: r.result || null,
    league: r.league || '',
    createdAt: r.created_at || null,
    source: 'sqlite',
  };
}

/** Prefer DB hard-test episodes for a team (predict / evidence). */
function getHardTestEpisodesForTeam(teamId, { limit = 3, hardOnly = false } = {}) {
  const tid = String(teamId || '');
  if (!tid || tid.startsWith('name:')) return [];
  const db = getDb();
  const lim = Math.max(1, Math.min(24, Number(limit) || 3));
  let rows;
  if (hardOnly) {
    rows = db.prepare(`
SELECT * FROM hard_test_episodes
WHERE team_id = ?
  AND (is_hard_test = 1 OR moisture_tag IN ('高','中'))
ORDER BY date DESC, match_id DESC
LIMIT ?
`).all(tid, lim);
  } else {
    rows = db.prepare(`
SELECT * FROM hard_test_episodes
WHERE team_id = ?
ORDER BY date DESC, match_id DESC
LIMIT ?
`).all(tid, lim);
  }
  return rows.map(rowToHardEpisode).filter(Boolean);
}

function getHardTestEpisodesForMatch(matchId) {
  const mid = String(matchId || '');
  if (!mid) return [];
  const db = getDb();
  return db.prepare(`SELECT * FROM hard_test_episodes WHERE match_id = ?`).all(mid).map(rowToHardEpisode);
}

/**
 * Structured 指标对照 for one match: { home: {metric:{actual,recentAvg,delta,missing}}, away: ... }
 */
function getProcessCompareForMatch(matchId) {
  const mid = String(matchId || '');
  if (!mid) return { home: {}, away: {}, rows: 0 };
  const db = getDb();
  const rows = db.prepare(`
SELECT side, metric, actual, recent_avg, delta, missing
FROM match_process_compare WHERE match_id = ?
`).all(mid);
  const out = { home: {}, away: {}, rows: rows.length };
  for (const r of rows) {
    const side = r.side === 'away' ? 'away' : 'home';
    out[side][r.metric] = {
      actual: r.actual,
      recentAvg: r.recent_avg,
      baseline: r.recent_avg,
      delta: r.delta,
      missing: !!r.missing,
    };
  }
  return out;
}

function countTable(name) {
  try {
    return getDb().prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
  } catch {
    return 0;
  }
}

/** Import all on-disk post-match-reviews/*.json into match_outcomes (+ match shells). No DeepSeek / no AF. */
function backfillFromReviewCaches() {
  const dir = path.join(DATA_DIR, 'post-match-reviews');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  } catch {
    return { ok: false, imported: 0, reason: 'no_review_dir' };
  }
  let imported = 0;
  let evidence = 0;
  let compareRows = 0;
  let hardEpisodes = 0;
  const errors = [];
  for (const f of files) {
    try {
      const disk = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const review = disk && disk.payload ? disk.payload : disk;
      if (!review || !review.ok || !review.matchId) continue;
      const r = upsertOutcomeFromReview(review);
      if (r.ok) {
        imported++;
        compareRows += r.compareRows || 0;
        hardEpisodes += r.hardEpisodes || 0;
      }
      // Dual-write JSON team-evidence memory (predict fallback) when stats exist
      if (review.hasActualStats) {
        try {
          const te = require('./team-evidence');
          const er = te.recordFromReview(review);
          if (er && er.ok) evidence++;
        } catch (e) {
          errors.push({ file: f, error: 'evidence:' + e.message });
        }
      }
    } catch (e) {
      errors.push({ file: f, error: e.message });
    }
  }
  return {
    ok: true, imported, evidence, compareRows, hardEpisodes,
    files: files.length, errors: errors.slice(0, 5),
  };
}

/**
 * Upsert match shells from data/history/results.jsonl (竞彩历史完场).
 * Facts only — no API-Football, no DeepSeek. Skip nothing needed; upsert is cheap.
 */
function backfillMatchShellsFromHistory({ maxRows = 20000 } = {}) {
  const file = path.join(DATA_DIR, 'history', 'results.jsonl');
  if (!fs.existsSync(file)) return { ok: false, imported: 0, reason: 'no_results_jsonl' };
  const lim = Math.max(1, Math.min(50000, Number(maxRows) || 20000));
  let imported = 0;
  let scanned = 0;
  const errors = [];
  const rl = fs.readFileSync(file, 'utf8').split(/\n+/);
  for (const line of rl) {
    if (!line.trim()) continue;
    if (scanned >= lim) break;
    scanned++;
    try {
      const row = JSON.parse(line);
      const matchId = String(row.matchId || row.id || '');
      if (!matchId) continue;
      const ft = row.ft || (row.homeScore != null && row.awayScore != null
        ? `${row.homeScore}:${row.awayScore}` : '');
      upsertMatchShell({
        match_id: matchId,
        fixture_id: row.fixtureId != null ? Number(row.fixtureId) : null,
        date: row.matchDate || row.date || '',
        home_team_id: row.homeTeamId != null ? String(row.homeTeamId) : '',
        away_team_id: row.awayTeamId != null ? String(row.awayTeamId) : '',
        home_name: row.home || '',
        away_name: row.away || '',
        home_name_zh: row.home || '',
        away_name_zh: row.away || '',
        competition: row.league || '',
        ft,
        source: 'results-history',
        fetched_at: new Date().toISOString(),
      });
      imported++;
    } catch (e) {
      if (errors.length < 5) errors.push({ error: e.message });
    }
  }
  return { ok: true, imported, scanned, errors };
}


/**
 * Leagues that never (or almost never) appear on 中国竞彩 sporttery slate.
 * Used to skip future AF/local shell writes — do not mass-delete existing af: rows.
 */
const NEVER_ON_JINGCAI_RE = /friendly|friendlies|club\s*friendly|友谊|热身|youth|u-?1[89]|u-?2[01]|reserve|reserves|women'?s|女足|amateur|业余|regional|地区联|cup\s*winners|world\s*cup\s*qual.*oceania|ofc\b|vanarama|national\s*league|league\s*two|英丁|荷丙|德丙|法丙|意丙|西乙B|segunda\s*b/i;

/**
 * Competitions commonly sold on 竞彩 (CN + EN aliases). Mapped sporttery fixtures
 * always win; this is a secondary allow when competition text is present.
 */
const SPORTTERY_SELLABLE_RE = /英超|西甲|意甲|德甲|法甲|英冠|英甲|荷甲|葡超|比甲|苏超|土超|奥甲|瑞士超|瑞超|挪超|丹超|芬超|波超|捷甲|希腊超|俄超|乌超|中超|日职|日乙|韩职|澳超|美职|沙职|巴甲|阿甲|墨超|欧冠|欧罗巴|欧联|欧协联|亚冠|世预赛|世界杯|欧国联|亚洲杯|美洲杯|非洲杯|金杯|俱世界杯|解放者|南美杯|足总杯|联赛杯|国王杯|德国杯|意大利杯|法国杯|荷兰杯|premier\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|championship|eredivisie|primeira|pro\s*league|scottish\s*premiership|super\s*lig|chinese\s*super|j\.?\s*league|k\s*league|a-?league|mls|saudi\s*pro|uefa\s*champions|uefa\s*europa|conference\s*league|afc\s*champions|world\s*cup|nations\s*league|copa\s*america|asian\s*cup/i;

function leagueNeverOnJingcai(league) {
  const s = String(league || '').trim();
  if (!s) return false; // unknown → do not hard-block; mapping decides
  if (NEVER_ON_JINGCAI_RE.test(s)) return true;
  return false;
}

function leagueLikelyOnJingcai(league) {
  const s = String(league || '').trim();
  if (!s) return false;
  if (leagueNeverOnJingcai(s)) return false;
  return SPORTTERY_SELLABLE_RE.test(s);
}

/** True when fixture is sporttery-mapped or competition is known to sell on 竞彩. */
function isJingcaiPriorityFixture(sport, league) {
  if (sport && sport.matchId && !String(sport.matchId).startsWith('af:')) return true;
  if (leagueLikelyOnJingcai(league)) return true;
  return false;
}

/**
 * Index finished AF fixtures from team-form (+ fixture-map sporttery links).
 * Used to turn fixture-stats caches into structured DB rows (incl. non-竞彩).
 */
function indexFinishedFixturesFromCaches() {
  const byFid = new Map();
  const formDir = path.join(DATA_DIR, 'live-stats', 'team-form');
  try {
    for (const f of fs.readdirSync(formDir).filter(x => x.endsWith('.json'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(formDir, f), 'utf8'));
        const raw = (j.payload && j.payload.raw) || [];
        for (const row of raw) {
          const fx = row && row.fixture;
          if (!fx || fx.id == null) continue;
          const short = fx.status && fx.status.short;
          if (short && short !== 'FT' && short !== 'AET' && short !== 'PEN') continue;
          const fid = String(fx.id);
          if (byFid.has(fid)) continue;
          const th = row.teams && row.teams.home;
          const ta = row.teams && row.teams.away;
          const gh = row.goals && row.goals.home;
          const ga = row.goals && row.goals.away;
          byFid.set(fid, {
            fixtureId: Number(fid),
            date: String(fx.date || '').slice(0, 10),
            homeAfId: th && th.id != null ? Number(th.id) : null,
            awayAfId: ta && ta.id != null ? Number(ta.id) : null,
            home: (th && th.name) || '',
            away: (ta && ta.name) || '',
            league: (row.league && row.league.name) || '',
            ft: (gh != null && ga != null) ? `${gh}:${ga}` : '',
            source: 'team-form',
          });
        }
      } catch (_) {}
    }
  } catch (_) {}

  // fixture-map: attach sporttery match ids when known
  const fidToSporttery = new Map();
  try {
    const map = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'live-stats', 'fixture-map.json'), 'utf8'));
    for (const [k, v] of Object.entries(map || {})) {
      if (!k.startsWith('m:') || !v || v.fixtureId == null) continue;
      const fid = String(v.fixtureId);
      const mid = String(v.sportteryMatchId || k.slice(2));
      fidToSporttery.set(fid, {
        matchId: mid,
        homeTeamId: v.homeTeamId != null ? String(v.homeTeamId) : '',
        awayTeamId: v.awayTeamId != null ? String(v.awayTeamId) : '',
        home: v.homeEn || '',
        away: v.awayEn || '',
        date: v.date || '',
      });
    }
  } catch (_) {}

  // afTeamId → sportteryTeamId
  const afToSporttery = new Map();
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'live-stats', 'team-id-cache.json'), 'utf8'));
    for (const v of Object.values(cache || {})) {
      if (!v || v.afTeamId == null) continue;
      const sid = v.sportteryTeamId != null ? String(v.sportteryTeamId) : '';
      if (sid) afToSporttery.set(String(v.afTeamId), sid);
    }
  } catch (_) {}

  return { byFid, fidToSporttery, afToSporttery };
}

function loadRollingAverages(afTeamId, excludeFixtureId) {
  if (afTeamId == null) return null;
  const rollDir = path.join(DATA_DIR, 'live-stats', 'process-rolling');
  let best = null;
  try {
    const files = fs.readdirSync(rollDir).filter(f => f.startsWith(String(afTeamId) + '-') && f.endsWith('.json'));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(rollDir, f), 'utf8'));
        const p = j && j.payload;
        if (!p || !p.ok || !p.averages) continue;
        let av = p.averages;
        if (excludeFixtureId && Array.isArray(p.samples)) {
          const filtered = p.samples.filter(s => String(s.fixtureId) !== String(excludeFixtureId));
          if (filtered.length && filtered.length !== p.samples.length) {
            // lightweight re-average
            const keys = Object.keys(av);
            const sums = {};
            const ns = {};
            for (const k of keys) { sums[k] = 0; ns[k] = 0; }
            for (const s of filtered) {
              const st = s.stats || {};
              for (const k of keys) {
                if (st[k] != null && Number.isFinite(Number(st[k]))) {
                  sums[k] += Number(st[k]);
                  ns[k]++;
                }
              }
            }
            av = {};
            for (const k of keys) av[k] = ns[k] ? Math.round((sums[k] / ns[k]) * 10) / 10 : null;
          }
        }
        if (!best || (p.n || 0) > (best.n || 0)) best = { averages: av, n: p.n || 0, sos: p.sos || null };
      } catch (_) {}
    }
  } catch (_) {}
  return best;
}

function resultFromFt(ft) {
  if (!ft || !/^\d+:\d+$/.test(String(ft))) return null;
  const [h, a] = String(ft).split(':').map(Number);
  if (h > a) return 'H';
  if (h < a) return 'A';
  return 'D';
}

function computeDeltasLocal(actual, baselineAvgs) {
  const METRIC_KEYS = [
    'possession', 'shots', 'shotsOnTarget', 'passesPct', 'corners',
    'attacks', 'dangerousAttacks', 'expectedGoals',
  ];
  const deltas = {};
  for (const k of METRIC_KEYS) {
    const act = actual && actual[k] != null && Number.isFinite(Number(actual[k])) ? Number(actual[k]) : null;
    const base = baselineAvgs && baselineAvgs[k] != null && Number.isFinite(Number(baselineAvgs[k]))
      ? Number(baselineAvgs[k]) : null;
    if (act == null && base == null) {
      deltas[k] = { actual: null, baseline: null, delta: null, missing: true };
      continue;
    }
    if (act == null || base == null) {
      deltas[k] = { actual: act, baseline: base, delta: null, missing: true };
      continue;
    }
    const round1 = (n) => Math.round(n * 10) / 10;
    deltas[k] = {
      actual: round1(act),
      baseline: round1(base),
      delta: round1(act - base),
      missing: false,
    };
  }
  return deltas;
}

/**
 * Upsert structured rows from one fixture-stats cache + form meta. No AF / no DeepSeek.
 */
function upsertStructuredFromFixtureCache(meta, statsPack, maps) {
  if (!meta || !meta.fixtureId || !statsPack || !statsPack.byTeam) {
    return { ok: false, reason: 'bad_input' };
  }
  const fid = String(meta.fixtureId);
  const sport = maps.fidToSporttery.get(fid);
  const matchId = sport ? sport.matchId : ('af:' + fid);

  // Prefer sporttery team ids when known
  let homeTeamId = sport && sport.homeTeamId ? sport.homeTeamId : '';
  let awayTeamId = sport && sport.awayTeamId ? sport.awayTeamId : '';
  if (!homeTeamId && meta.homeAfId != null) {
    homeTeamId = maps.afToSporttery.get(String(meta.homeAfId)) || String(meta.homeAfId);
  }
  if (!awayTeamId && meta.awayAfId != null) {
    awayTeamId = maps.afToSporttery.get(String(meta.awayAfId)) || String(meta.awayAfId);
  }

  const homeName = (sport && sport.home) || meta.home || '';
  const awayName = (sport && sport.away) || meta.away || '';
  const date = (sport && sport.date) || meta.date || '';
  const ft = meta.ft || '';
  const league = meta.league || '';

  // Side stats by AF team id (fallback: two-team order)
  let homeStats = meta.homeAfId != null ? statsPack.byTeam[String(meta.homeAfId)] : null;
  let awayStats = meta.awayAfId != null ? statsPack.byTeam[String(meta.awayAfId)] : null;
  const ids = Object.keys(statsPack.byTeam || {});
  if ((!homeStats || !awayStats) && ids.length === 2) {
    if (!homeStats && !awayStats) {
      homeStats = statsPack.byTeam[ids[0]];
      awayStats = statsPack.byTeam[ids[1]];
      if (meta.homeAfId == null) meta.homeAfId = Number(ids[0]);
      if (meta.awayAfId == null) meta.awayAfId = Number(ids[1]);
    } else if (!homeStats) {
      const oid = ids.find(id => id !== String(meta.awayAfId)) || ids[0];
      homeStats = statsPack.byTeam[oid];
      meta.homeAfId = Number(oid);
    } else if (!awayStats) {
      const oid = ids.find(id => id !== String(meta.homeAfId)) || ids[1];
      awayStats = statsPack.byTeam[oid];
      meta.awayAfId = Number(oid);
    }
  }
  if (!homeStats && !awayStats) return { ok: false, reason: 'no_side_stats', matchId };

  const homeBase = loadRollingAverages(meta.homeAfId, fid);
  const awayBase = loadRollingAverages(meta.awayAfId, fid);
  const homeDeltas = homeStats ? computeDeltasLocal(homeStats, homeBase && homeBase.averages) : null;
  const awayDeltas = awayStats ? computeDeltasLocal(awayStats, awayBase && awayBase.averages) : null;

  upsertMatchShell({
    match_id: matchId,
    fixture_id: Number(fid),
    date,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_name: homeName,
    away_name: awayName,
    home_name_zh: homeName,
    away_name_zh: awayName,
    competition: league,
    ft,
    source: sport ? 'fixture-stats+map' : 'fixture-stats+form',
    fetched_at: new Date().toISOString(),
  });

  const review = {
    ok: true,
    matchId,
    home: homeName,
    away: awayName,
    homeTeamId,
    awayTeamId,
    league,
    date,
    ft: ft || null,
    result: resultFromFt(ft),
    fixtureId: Number(fid),
    hasActualStats: true,
    deltas: { home: homeDeltas, away: awayDeltas },
    actual: { home: homeStats || null, away: awayStats || null },
    baselines: {
      home: homeBase,
      away: awayBase,
      source: (homeBase || awayBase) ? 'rolling-cache' : 'none',
    },
    prediction: null,
    leanFeedback: null,
    generatedAt: new Date().toISOString(),
    noteZh: '本地 fixture-stats 回填（无 DeepSeek）',
    version: '1.9.66',
  };

  try {
    const te = require('./team-evidence');
    review.hardTest = te.buildHardTestBlock(review);
    try { te.recordFromReview(review); } catch (_) {}
  } catch (_) {}

  const r = upsertOutcomeFromReview(review);
  return {
    ok: !!r.ok,
    matchId,
    fixtureId: Number(fid),
    jingcai: !!sport,
    compareRows: r.compareRows || 0,
    hardEpisodes: r.hardEpisodes || 0,
  };
}

/**
 * Ingest all fixture-stats JSON that have team-form (or map) metadata into SQLite.
 * Covers 竞彩-mapped and non-竞彩 AF fixtures. Never calls API-Football / DeepSeek.
 */
function backfillFromFixtureStatsCaches({ skipExisting = true, skipNonJingcai = false } = {}) {
  const maps = indexFinishedFixturesFromCaches();
  const dir = path.join(DATA_DIR, 'live-stats', 'fixture-stats');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  } catch {
    return { ok: false, imported: 0, reason: 'no_stats_dir' };
  }

  const hasCompare = new Set();
  if (skipExisting) {
    try {
      const db = getDb();
      for (const row of db.prepare('SELECT DISTINCT match_id FROM match_process_compare').all()) {
        hasCompare.add(String(row.match_id));
      }
    } catch (_) {}
  }

  let imported = 0;
  let skipped = 0;
  let noMeta = 0;
  let jingcai = 0;
  let nonJingcai = 0;
  let compareRows = 0;
  let hardEpisodes = 0;
  const errors = [];

  for (const f of files) {
    const fid = f.replace(/\.json$/, '');
    try {
      const meta = maps.byFid.get(fid);
      if (!meta) {
        // Try map-only: create thin meta from fixture-map
        const sport = maps.fidToSporttery.get(fid);
        if (!sport) { noMeta++; continue; }
        // map has no AF team ids — load stats and assign by order
        const pack = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const thin = {
          fixtureId: Number(fid),
          date: sport.date || '',
          homeAfId: null,
          awayAfId: null,
          home: sport.home || '',
          away: sport.away || '',
          league: '',
          ft: '',
          source: 'fixture-map',
        };
        const matchId = sport.matchId;
        if (skipExisting && hasCompare.has(matchId)) { skipped++; continue; }
        const r = upsertStructuredFromFixtureCache(thin, pack, maps);
        if (r.ok) {
          imported++;
          jingcai++;
          compareRows += r.compareRows || 0;
          hardEpisodes += r.hardEpisodes || 0;
        }
        continue;
      }
      const sport = maps.fidToSporttery.get(fid);
      const matchId = sport ? sport.matchId : ('af:' + fid);
      if (skipNonJingcai && !isJingcaiPriorityFixture(sport, meta.league)) {
        skipped++;
        continue;
      }
      if (leagueNeverOnJingcai(meta.league) && !sport) { skipped++; continue; }
      if (skipExisting && hasCompare.has(matchId)) { skipped++; continue; }

      const pack = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const r = upsertStructuredFromFixtureCache(meta, pack, maps);
      if (r.ok) {
        imported++;
        if (r.jingcai) jingcai++; else nonJingcai++;
        compareRows += r.compareRows || 0;
        hardEpisodes += r.hardEpisodes || 0;
      }
    } catch (e) {
      if (errors.length < 8) errors.push({ file: f, error: e.message });
    }
  }

  return {
    ok: true,
    files: files.length,
    metaIndex: maps.byFid.size,
    mappedJingcai: maps.fidToSporttery.size,
    imported,
    skipped,
    noMeta,
    jingcai,
    nonJingcai,
    compareRows,
    hardEpisodes,
    errors,
  };
}

/**
 * Full local-cache backfill: fixture-players → player stats; reviews → outcomes;
 * fixture-stats+form → compare/hard-test; results.jsonl → match shells.
 * Never calls API-Football or DeepSeek.
 */
function fullBackfillFromLocalCaches(opts = {}) {
  const before = statsSummary();
  const players = backfillFromDiskCaches();
  const reviews = backfillFromReviewCaches();
  const statsStruct = backfillFromFixtureStatsCaches({
    skipExisting: opts.skipExisting !== false,
    skipNonJingcai: !!opts.skipNonJingcai,
  });
  const shells = backfillMatchShellsFromHistory(opts.history || {});
  const after = statsSummary();
  return {
    ok: true,
    before,
    after,
    players,
    reviews,
    statsStruct,
    shells,
    grew: {
      matches: after.matches - before.matches,
      playerRows: after.playerRows - before.playerRows,
      tags: after.tags - before.tags,
      outcomes: (after.outcomes || 0) - (before.outcomes || 0),
      processCompare: (after.processCompare || 0) - (before.processCompare || 0),
      hardTestEpisodes: (after.hardTestEpisodes || 0) - (before.hardTestEpisodes || 0),
      bytes: (after.bytes || 0) - (before.bytes || 0),
    },
    noteZh: '仅本地缓存回填，未调用 API-Football / DeepSeek',
  };
}

function listRecentOutcomes({ limit = 30 } = {}) {
  const db = getDb();
  const lim = Math.max(1, Math.min(100, Number(limit) || 30));
  return db.prepare(`
SELECT * FROM match_outcomes
ORDER BY date DESC, match_id DESC
LIMIT ?
`).all(lim);
}

function recentMatchesForTeam(teamId, { limit = DEFAULT_RECENT_MATCHES, excludeMatchId = '' } = {}) {
  const tid = String(teamId || '');
  if (!tid) return [];
  const db = getDb();
  const rows = db.prepare(`
SELECT * FROM matches
WHERE (home_team_id = ? OR away_team_id = ?)
  AND (? = '' OR match_id != ?)
ORDER BY date DESC
LIMIT ?
`).all(tid, tid, String(excludeMatchId || ''), String(excludeMatchId || ''), Math.max(1, Math.min(12, limit)));
  return rows;
}

function playersForMatchSide(matchId, side, { top = DEFAULT_TOP_PER_MATCH } = {}) {
  const db = getDb();
  const rows = db.prepare(`
SELECT * FROM player_match_stats
WHERE match_id = ? AND side = ?
`).all(String(matchId), side);
  return rows
    .filter(r => (r.minutes || 0) > 0)
    .map(r => ({ ...r, _score: rowScore(r) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, Math.max(1, Math.min(10, top)));
}

function recentRowsForPlayer(playerId, teamId, { limit = 3 } = {}) {
  const db = getDb();
  return db.prepare(`
SELECT p.*, m.date AS match_date, m.home_name_zh, m.away_name_zh, m.home_name, m.away_name, m.ft
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.player_id = ? AND (? = '' OR p.team_id = ?)
ORDER BY m.date DESC
LIMIT ?
`).all(String(playerId), String(teamId || ''), String(teamId || ''), Math.max(1, Math.min(8, limit)));
}

function findPlayerIdsByNames(names, teamId) {
  const list = (names || []).map(n => String(n || '').trim()).filter(Boolean);
  if (!list.length) return [];
  const db = getDb();
  const found = [];
  const seen = new Set();
  for (const name of list) {
    const rows = db.prepare(`
SELECT DISTINCT player_id, name_en, name_zh, team_id FROM player_match_stats
WHERE team_id = ?
  AND (
    name_zh = ? OR name_en = ?
    OR name_zh LIKE ? OR name_en LIKE ?
    OR ? LIKE '%' || name_zh || '%' OR ? LIKE '%' || name_en || '%'
  )
LIMIT 5
`).all(String(teamId || ''), name, name, '%' + name + '%', '%' + name + '%', name, name);
    for (const r of rows) {
      if (seen.has(r.player_id)) continue;
      // Prefer exact / strong contains
      const zh = r.name_zh || '';
      const en = r.name_en || '';
      const hit = zh === name || en === name
        || (zh && name.includes(zh)) || (en && name.toLowerCase().includes(en.toLowerCase()))
        || (zh && zh.includes(name)) || (en && en.toLowerCase().includes(name.toLowerCase()));
      if (!hit && zh.length < 2) continue;
      seen.add(r.player_id);
      found.push(r);
    }
  }
  return found;
}

function formatRowLine(r, meta) {
  const date = String((meta && meta.date) || r.match_date || r.date || '').slice(5, 10);
  const opp = (meta && meta.opponent) || '';
  const pos = r.position_zh || r.position || '';
  const cell = (v) => (v == null || v === '' ? '-' : String(v));
  const rating = r.rating != null ? Number(r.rating).toFixed(1) : '-';
  return [
    date || '-',
    opp || '-',
    playerLabel(r),
    pos || '-',
    cell(r.shots),
    cell(r.shots_on),
    cell(r.key_passes),
    cell(r.tackles),
    cell(r.goals),
    cell(r.assists),
    rating,
    cell(r.minutes),
  ].join('|');
}

function opponentLabel(match, teamId) {
  const tid = String(teamId || '');
  const isHome = String(match.home_team_id) === tid;
  const oppZh = isHome
    ? (match.away_name_zh || match.away_name)
    : (match.home_name_zh || match.home_name);
  const prefix = isHome ? '主' : '客';
  return prefix + 'vs' + (oppZh || '对手');
}

/**
 * Build compressed player slice for upcoming match → DeepSeek evidence.
 * @param {object} m sporttery match { id, home, away, homeTeamId, awayTeamId }
 * @param {object} opts
 * @param {object[]} [opts.injuryItems] injuries.facts.items from predict-report
 */
function buildPlayerSliceForMatch(m, opts = {}) {
  const recentN = Math.max(2, Math.min(6, Number(opts.recentMatches) || DEFAULT_RECENT_MATCHES));
  const topPer = Math.max(3, Math.min(8, Number(opts.topPerMatch) || DEFAULT_TOP_PER_MATCH));
  const excludeMatchId = String((m && m.id) || '');
  const homeId = String((m && m.homeTeamId) || '');
  const awayId = String((m && m.awayTeamId) || '');

  const empty = {
    hasData: false,
    used: false,
    tableText: '',
    rows: [],
    keyPlayers: [],
    injuryImpact: [],
    caps: { recentMatches: recentN, topPerMatch: topPer, maxRows: MAX_TOTAL_ROWS },
    noteZh: '近几场球员表现样本不足',
  };

  if (!homeId && !awayId) return empty;

  let db;
  try { db = getDb(); } catch (e) {
    return { ...empty, noteZh: '球员库不可用', reason: e.message };
  }

  // Ensure we have some data — soft backfill if empty
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM player_match_stats').get();
  if (!cnt || !cnt.n) {
    try { backfillFromDiskCaches(); } catch {}
  }

  const header = '日期|对手|球员|位置|射门|射正|关键传|抢断|进球|助攻|评分|分钟';
  const allRows = [];
  const tableBlocks = [];
  const keyAgg = new Map(); // playerId -> { scoreSum, n, label, line, side, teamZh }

  const processSide = (teamId, teamZh, sideLabel) => {
    if (!teamId) return;
    const matches = recentMatchesForTeam(teamId, { limit: recentN, excludeMatchId });
    if (!matches.length) return;
    const lines = [];
    let sideRowCount = 0;
    for (const match of matches) {
      if (sideRowCount >= MAX_ROWS_PER_SIDE) break;
      const side = String(match.home_team_id) === String(teamId) ? 'home' : 'away';
      const tops = playersForMatchSide(match.match_id, side, { top: topPer });
      const opp = opponentLabel(match, teamId);
      for (const r of tops) {
        if (sideRowCount >= MAX_ROWS_PER_SIDE) break;
        if (allRows.length >= MAX_TOTAL_ROWS) break;
        const line = formatRowLine(r, { date: match.date, opponent: opp });
        lines.push(line);
        allRows.push({
          matchId: match.match_id,
          date: match.date,
          opponent: opp,
          side: sideLabel,
          playerId: r.player_id,
          name: playerLabel(r),
          position: r.position_zh || r.position,
          shots: r.shots,
          shotsOn: r.shots_on,
          keyPasses: r.key_passes,
          tackles: r.tackles,
          goals: r.goals,
          assists: r.assists,
          rating: r.rating,
          minutes: r.minutes,
          score: r._score,
        });
        sideRowCount++;
        const pid = String(r.player_id);
        if (!keyAgg.has(pid)) {
          keyAgg.set(pid, {
            playerId: pid,
            label: playerLabel(r),
            line: lineFromPos(r.position, r.position_zh),
            side: sideLabel,
            teamZh,
            scoreSum: 0,
            n: 0,
            goals: 0,
            assists: 0,
          });
        }
        const k = keyAgg.get(pid);
        k.scoreSum += r._score;
        k.n += 1;
        k.goals += Number(r.goals) || 0;
        k.assists += Number(r.assists) || 0;
        if (playerLabel(r) !== '?') k.label = playerLabel(r);
      }
    }
    if (lines.length) {
      tableBlocks.push(`【${teamZh || sideLabel} 近${matches.length}场贡献者】\n${header}\n${lines.join('\n')}`);
    }
  };

  processSide(homeId, (m && m.home) || '主队', 'home');
  processSide(awayId, (m && m.away) || '客队', 'away');

  // Injury intersection → pull those players' recent rows even if not top contributors
  const injuryImpact = [];
  const injuryItems = (opts.injuryItems || []).slice(0, 20);
  if (injuryItems.length && (homeId || awayId)) {
    const nameBySide = { home: [], away: [] };
    for (const it of injuryItems) {
      const nm = it.playerZh || it.player || '';
      if (!nm) continue;
      // rough side: prefer teamZh/team match
      const t = String(it.teamZh || it.team || '').toLowerCase();
      const h = String((m && m.home) || '').toLowerCase();
      const a = String((m && m.away) || '').toLowerCase();
      let side = null;
      if (t && h && (t.includes(h) || h.includes(t))) side = 'home';
      else if (t && a && (t.includes(a) || a.includes(t))) side = 'away';
      else if (it.teamId && String(it.teamId) === homeId) side = 'home';
      else if (it.teamId && String(it.teamId) === awayId) side = 'away';
      if (side === 'home') nameBySide.home.push(nm);
      else if (side === 'away') nameBySide.away.push(nm);
      else {
        nameBySide.home.push(nm);
        nameBySide.away.push(nm);
      }
    }
    const injLines = [];
    for (const [side, names] of [['home', nameBySide.home], ['away', nameBySide.away]]) {
      const tid = side === 'home' ? homeId : awayId;
      if (!tid || !names.length) continue;
      const hits = findPlayerIdsByNames(names, tid);
      for (const hit of hits.slice(0, 4)) {
        const recent = recentRowsForPlayer(hit.player_id, tid, { limit: 2 });
        if (!recent.length) continue;
        const avgScore = recent.reduce((s, r) => s + rowScore(r), 0) / recent.length;
        const why = avgScore >= 8
          ? '近场核心贡献者伤停，攻击/控制或受影响'
          : avgScore >= 6.5
            ? '近场有稳定出场与贡献，伤停需计入阵容折损'
            : '近场有出场记录，伤停影响偏边缘';
        injuryImpact.push({
          playerId: hit.player_id,
          name: playerLabel(hit),
          side,
          teamZh: side === 'home' ? (m && m.home) : (m && m.away),
          avgScore: Math.round(avgScore * 100) / 100,
          why,
        });
        for (const r of recent) {
          if (allRows.length >= MAX_TOTAL_ROWS) break;
          const isHome = String(r.side) === 'home';
          const oppFixed = (isHome ? '主vs' : '客vs') + (
            isHome
              ? (r.away_name_zh || r.away_name || '对手')
              : (r.home_name_zh || r.home_name || '对手')
          );
          injLines.push(formatRowLine(r, { date: r.match_date, opponent: oppFixed }) + '|伤停关联');
        }
      }
    }
    if (injLines.length) {
      tableBlocks.push(`【伤停球员近场】\n${header}|注\n${injLines.slice(0, 8).join('\n')}`);
    }
  }

  const keyPlayers = [...keyAgg.values()]
    .map(k => ({
      playerId: k.playerId,
      name: k.label,
      line: k.line,
      side: k.side,
      teamZh: k.teamZh,
      score: Math.round((k.scoreSum / Math.max(1, k.n)) * 100) / 100,
      samples: k.n,
      goals: k.goals,
      assists: k.assists,
      why: [
        k.line && k.line !== 'MID' ? `线位${k.line}` : null,
        k.goals ? `${k.goals}球` : null,
        k.assists ? `${k.assists}助` : null,
        `近${k.n}场均分${Math.round((k.scoreSum / Math.max(1, k.n)) * 10) / 10}`,
      ].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KEY_PLAYERS);

  const tableText = tableBlocks.join('\n\n').slice(0, 3500);
  const hasData = allRows.length >= 3;

  return {
    hasData,
    used: hasData,
    tableText,
    rows: allRows,
    keyPlayers,
    injuryImpact,
    caps: {
      recentMatches: recentN,
      topPerMatch: topPer,
      maxRows: MAX_TOTAL_ROWS,
      rowCount: allRows.length,
      keyCount: keyPlayers.length,
    },
    noteZh: hasData
      ? `已纳入近几场球员表现（${allRows.length}行/${keyPlayers.length}关键）`
      : '近几场球员表现样本不足',
  };
}

/** Compact JSON for evidence pack (Chinese keys, bounded). */
function sliceToEvidencePack(slice) {
  if (!slice || !slice.hasData) {
    return { 有数据: false };
  }
  return {
    有数据: true,
    近几场表现表: (slice.tableText || '').slice(0, 3200),
    关键球员: (slice.keyPlayers || []).slice(0, MAX_KEY_PLAYERS).map(k => ({
      姓名: k.name,
      线位: k.line,
      侧: k.side === 'home' ? '主' : '客',
      队: k.teamZh,
      分: k.score,
      因: k.why,
    })),
    伤停冲击: (slice.injuryImpact || []).slice(0, 6).map(x => ({
      姓名: x.name,
      侧: x.side === 'home' ? '主' : '客',
      因: x.why,
    })),
    说明: slice.noteZh,
    行数: slice.caps && slice.caps.rowCount,
  };
}

function statsSummary() {
  const matches = countTable('matches');
  const players = countTable('player_match_stats');
  const tags = countTable('player_tags');
  const outcomes = countTable('match_outcomes');
  const processCompare = countTable('match_process_compare');
  const hardTestEpisodes = countTable('hard_test_episodes');
  let bytes = null;
  try { bytes = fs.statSync(DB_PATH()).size; } catch {}
  return {
    matches, playerRows: players, tags, outcomes,
    processCompare, hardTestEpisodes,
    path: DB_PATH(), bytes,
  };
}

function queryPlayerByName(nameLike, { limit = 20 } = {}) {
  const db = getDb();
  const q = '%' + String(nameLike || '') + '%';
  return db.prepare(`
SELECT p.*, m.date, m.home_name_zh, m.away_name_zh, m.ft, m.match_id
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.name_en LIKE ? OR p.name_zh LIKE ?
ORDER BY m.date DESC
LIMIT ?
`).all(q, q, Math.max(1, Math.min(50, limit)));
}

module.exports = {
  DB_PATH,
  getDb,
  closeDb,
  upsertFromFixturePayload,
  upsertMatchShell,
  upsertOutcomeFromReview,
  upsertProcessCompareFromReview,
  upsertHardTestFromReview,
  getHardTestEpisodesForTeam,
  getHardTestEpisodesForMatch,
  getProcessCompareForMatch,
  backfillFromDiskCaches,
  backfillFromReviewCaches,
  backfillMatchShellsFromHistory,
  backfillFromFixtureStatsCaches,
  indexFinishedFixturesFromCaches,
  upsertStructuredFromFixtureCache,
  fullBackfillFromLocalCaches,
  leagueNeverOnJingcai,
  leagueLikelyOnJingcai,
  isJingcaiPriorityFixture,
  listRecentOutcomes,
  recomputeTagsForTeam,
  buildPlayerSliceForMatch,
  sliceToEvidencePack,
  rowScore,
  lineFromPos,
  playerLabel,
  statsSummary,
  queryPlayerByName,
  recentMatchesForTeam,
  DEFAULT_RECENT_MATCHES,
  DEFAULT_TOP_PER_MATCH,
  MAX_TOTAL_ROWS,
  MAX_KEY_PLAYERS,
};

/** ---------- Browse helpers (read-only UI /api/player-db) ---------- */

function overview() {
  const db = getDb();
  const matches = db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  const playerRows = db.prepare('SELECT COUNT(*) AS n FROM player_match_stats').get().n;
  const tags = db.prepare('SELECT COUNT(*) AS n FROM player_tags').get().n;
  const lastRow = db.prepare(`
SELECT MAX(fetched_at) AS last_fetched FROM (
  SELECT fetched_at FROM matches
  UNION ALL
  SELECT fetched_at FROM player_match_stats
)`).get();
  let mtime = null;
  try {
    mtime = fs.statSync(DB_PATH()).mtime.toISOString();
  } catch {}
  const outcomes = countTable('match_outcomes');
  const processCompare = countTable('match_process_compare');
  const hardTestEpisodes = countTable('hard_test_episodes');
  let bytes = null;
  try { bytes = fs.statSync(DB_PATH()).size; } catch {}
  let jingcaiMatches = 0;
  let afShells = 0;
  let playerGapJingcai = 0;
  try {
    jingcaiMatches = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE match_id NOT LIKE 'af:%'").get().n;
    afShells = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE match_id LIKE 'af:%'").get().n;
    playerGapJingcai = db.prepare(`
SELECT COUNT(*) AS n FROM matches m
WHERE m.match_id NOT LIKE 'af:%'
  AND m.fixture_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM match_process_compare c WHERE c.match_id = m.match_id)
  AND NOT EXISTS (SELECT 1 FROM player_match_stats p WHERE p.match_id = m.match_id)
`).get().n;
  } catch (_) {}
  return {
    matches,
    playerRows,
    tags,
    outcomes,
    processCompare,
    hardTestEpisodes,
    jingcaiMatches,
    afShells,
    playerGapJingcai,
    bytes,
    path: DB_PATH(),
    lastFetchedAt: lastRow && lastRow.last_fetched || null,
    fileMtime: mtime,
  };
}

function listRecentMatches({ limit = 30, hideAfShells = true } = {}) {
  const db = getDb();
  const lim = Math.max(1, Math.min(100, Number(limit) || 30));
  const where = hideAfShells ? "WHERE m.match_id NOT LIKE 'af:%'" : '';
  return db.prepare(`
SELECT m.match_id, m.fixture_id, m.date, m.ft, m.competition,
  m.home_name, m.away_name, m.home_name_zh, m.away_name_zh,
  m.home_team_id, m.away_team_id, m.fetched_at,
  (SELECT COUNT(*) FROM player_match_stats p WHERE p.match_id = m.match_id) AS player_count,
  CASE WHEN m.match_id LIKE 'af:%' THEN 1 ELSE 0 END AS is_af_shell
FROM matches m
${where}
ORDER BY m.date DESC, m.match_id DESC
LIMIT ?
`).all(lim);
}

function searchBrowse({ q = '', matchId = '', limit = 40 } = {}) {
  const db = getDb();
  const lim = Math.max(1, Math.min(100, Number(limit) || 40));
  const mid = String(matchId || '').trim();
  if (mid) {
    return db.prepare(`
SELECT p.match_id, p.player_id, p.team_id, p.side, p.name_en, p.name_zh,
  p.position, p.position_zh, p.minutes, p.goals, p.assists, p.shots, p.shots_on,
  p.key_passes, p.tackles, p.rating, p.fetched_at,
  m.date, m.ft, m.home_name_zh, m.away_name_zh, m.home_name, m.away_name
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.match_id = ?
ORDER BY p.side, p.rating DESC NULLS LAST, p.minutes DESC
LIMIT ?
`).all(mid, lim);
  }
  const term = String(q || '').trim();
  if (!term) {
    return db.prepare(`
SELECT p.match_id, p.player_id, p.team_id, p.side, p.name_en, p.name_zh,
  p.position, p.position_zh, p.minutes, p.goals, p.assists, p.shots, p.shots_on,
  p.key_passes, p.tackles, p.rating, p.fetched_at,
  m.date, m.ft, m.home_name_zh, m.away_name_zh, m.home_name, m.away_name
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
ORDER BY m.date DESC, p.rating DESC NULLS LAST
LIMIT ?
`).all(lim);
  }
  const like = '%' + term + '%';
  return db.prepare(`
SELECT p.match_id, p.player_id, p.team_id, p.side, p.name_en, p.name_zh,
  p.position, p.position_zh, p.minutes, p.goals, p.assists, p.shots, p.shots_on,
  p.key_passes, p.tackles, p.rating, p.fetched_at,
  m.date, m.ft, m.home_name_zh, m.away_name_zh, m.home_name, m.away_name
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.name_en LIKE ? OR p.name_zh LIKE ?
   OR m.home_name LIKE ? OR m.away_name LIKE ?
   OR m.home_name_zh LIKE ? OR m.away_name_zh LIKE ?
   OR p.match_id LIKE ? OR CAST(m.fixture_id AS TEXT) LIKE ?
ORDER BY m.date DESC, p.rating DESC NULLS LAST
LIMIT ?
`).all(like, like, like, like, like, like, like, like, lim);
}

function getMatchDetail(matchId) {
  const db = getDb();
  const mid = String(matchId || '').trim();
  if (!mid) return null;
  const match = db.prepare('SELECT * FROM matches WHERE match_id = ?').get(mid);
  if (!match) return null;
  const players = db.prepare(`
SELECT * FROM player_match_stats
WHERE match_id = ?
ORDER BY side, rating DESC NULLS LAST, minutes DESC, name_en
`).all(mid);
  let outcome = null;
  try { outcome = db.prepare('SELECT * FROM match_outcomes WHERE match_id = ?').get(mid) || null; } catch {}
  const processCompare = getProcessCompareForMatch(mid);
  const hardTest = getHardTestEpisodesForMatch(mid);
  return { match, players, outcome, processCompare, hardTest };
}

function getPlayerDetail(playerId, { limit = 30 } = {}) {
  const db = getDb();
  const pid = String(playerId || '').trim();
  if (!pid) return null;
  const lim = Math.max(1, Math.min(100, Number(limit) || 30));
  const tag = db.prepare('SELECT * FROM player_tags WHERE player_id = ?').get(pid);
  const rows = db.prepare(`
SELECT p.*, m.date, m.ft, m.home_name_zh, m.away_name_zh, m.home_name, m.away_name,
  m.competition, m.home_team_id, m.away_team_id
FROM player_match_stats p
JOIN matches m ON m.match_id = p.match_id
WHERE p.player_id = ?
ORDER BY m.date DESC, p.match_id DESC
LIMIT ?
`).all(pid, lim);
  if (!rows.length && !tag) return null;
  const head = rows[0] || tag || {};
  return {
    playerId: pid,
    nameEn: head.name_en || (tag && tag.name_en) || '',
    nameZh: head.name_zh || (tag && tag.name_zh) || '',
    tag: tag || null,
    rows,
  };
}

module.exports.overview = overview;
module.exports.listRecentMatches = listRecentMatches;
module.exports.searchBrowse = searchBrowse;
module.exports.getMatchDetail = getMatchDetail;
module.exports.getPlayerDetail = getPlayerDetail;
module.exports.listRecentOutcomes = listRecentOutcomes;
