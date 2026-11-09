/** 进球分钟落库，给进球时段和先丢球用。不是完整球员库。 */
'use strict';

const { db, DATA_DIR } = require('./db');
const fs = require('fs');
const path = require('path');

const EVT_GOAL = 14;
const EVT_OWNGOAL = 15;
const EVT_PENALTY = 16;

function ensureTable() {
  db.exec(`
CREATE TABLE IF NOT EXISTS fixture_goal_events (
  fixture_id INTEGER PRIMARY KEY,
  home_team_id INTEGER,
  away_team_id INTEGER,
  source TEXT NOT NULL DEFAULT 'sportmonks',
  fetched_at INTEGER NOT NULL,
  goals_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fixture_goals_home ON fixture_goal_events(home_team_id);
CREATE INDEX IF NOT EXISTS idx_fixture_goals_away ON fixture_goal_events(away_team_id);
`);
}

ensureTable();

function participantsMeta(fx) {
  const parts = fx.participants || [];
  const home = parts.find(p => p && p.meta && p.meta.location === 'home');
  const away = parts.find(p => p && p.meta && p.meta.location === 'away');
  const hid = home && Number(home.id);
  const aid = away && Number(away.id);
  if (!Number.isFinite(hid) || !Number.isFinite(aid)) return null;
  return { homeId: hid, awayId: aid };
}

function minuteOf(e) {
  const m = Number(e.minute) || 0;
  const x = Number(e.extra_minute) || 0;
  return m + x / 60;
}

function parseGoals(fx, meta) {
  const events = fx.events || [];
  const { homeId, awayId } = meta;
  const goals = [];
  for (const e of events) {
    const tid = Number(e.participant_id);
    if (![EVT_GOAL, EVT_OWNGOAL, EVT_PENALTY].includes(Number(e.type_id))) continue;
    let side = null;
    if (Number(e.type_id) === EVT_OWNGOAL) {
      side = tid === homeId ? 'away' : tid === awayId ? 'home' : null;
    } else {
      side = tid === homeId ? 'home' : tid === awayId ? 'away' : null;
    }
    if (!side) continue;
    goals.push({
      minute: minuteOf(e),
      type_id: Number(e.type_id),
      side,
    });
  }
  goals.sort((a, b) => a.minute - b.minute);
  return goals;
}

function upsertFromFixture(fx, source = 'sportmonks') {
  if (!fx || fx.id == null) return false;
  const meta = participantsMeta(fx);
  if (!meta) return false;
  const goals = parseGoals(fx, meta);
  const now = Date.now();
  const stmt = db.prepare(`
INSERT INTO fixture_goal_events (fixture_id, home_team_id, away_team_id, source, fetched_at, goals_json)
VALUES (@fixture_id, @home_team_id, @away_team_id, @source, @fetched_at, @goals_json)
ON CONFLICT(fixture_id) DO UPDATE SET
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  fetched_at = excluded.fetched_at,
  goals_json = excluded.goals_json
WHERE excluded.fetched_at >= fixture_goal_events.fetched_at OR fixture_goal_events.goals_json = '[]'
`);
  stmt.run({
    fixture_id: Number(fx.id),
    home_team_id: meta.homeId,
    away_team_id: meta.awayId,
    source: String(source || 'sportmonks'),
    fetched_at: now,
    goals_json: JSON.stringify(goals),
  });
  return true;
}

function loadFixtureGoals(fixtureId) {
  const row = db.prepare('SELECT goals_json FROM fixture_goal_events WHERE fixture_id=?').get(Number(fixtureId));
  if (!row) return [];
  try {
    const j = JSON.parse(row.goals_json);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/** @param {number} teamSmId */
function teamRecentGoalProfile(teamSmId, { maxFixtures = 40 } = {}) {
  const tid = Number(teamSmId);
  if (!Number.isFinite(tid)) return null;
  const rows = db.prepare(
    `SELECT fixture_id, home_team_id, away_team_id, goals_json FROM fixture_goal_events
     WHERE home_team_id = ? OR away_team_id = ?
     ORDER BY fetched_at DESC LIMIT ?`
  ).all(tid, tid, maxFixtures);
  const segs = { '0-15': 0, '16-30': 0, '31-45': 0, '46-60': 0, '61-75': 0, '76-90': 0, 'et': 0 };
  let scoredFirst = 0;
  let concededFirst = 0;
  let nFirst = 0;
  let n = 0;
  for (const row of rows) {
    let goals;
    try { goals = JSON.parse(row.goals_json); } catch { continue; }
    if (!Array.isArray(goals) || !goals.length) continue;
    const isHome = Number(row.home_team_id) === tid;
    n += 1;
    const first = goals[0];
    if (first && first.side) {
      nFirst += 1;
      if (first.side === (isHome ? 'home' : 'away')) scoredFirst += 1;
      else concededFirst += 1;
    }
    for (const g of goals) {
      const mine = isHome ? 'home' : 'away';
      if (g.side !== mine) continue;
      const m = Number(g.minute);
      if (!Number.isFinite(m)) continue;
      if (m <= 15) segs['0-15'] += 1;
      else if (m <= 30) segs['16-30'] += 1;
      else if (m <= 45) segs['31-45'] += 1;
      else if (m <= 60) segs['46-60'] += 1;
      else if (m <= 75) segs['61-75'] += 1;
      else if (m <= 90) segs['76-90'] += 1;
      else segs.et += 1;
    }
  }
  return {
    n_fixtures: n,
    segments: segs,
    concede_first_index: nFirst ? concededFirst / nFirst : null,
    score_first_rate: nFirst ? scoredFirst / nFirst : null,
  };
}

function writeProfileMirror(teamSmId, profile) {
  try {
    const dir = path.join(DATA_DIR, 'fixture-goals');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${teamSmId}.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ teamId: teamSmId, updatedAt: Date.now(), ...profile }));
    fs.renameSync(tmp, file);
  } catch { /* optional */ }
}

module.exports = {
  upsertFromFixture,
  loadFixtureGoals,
  teamRecentGoalProfile,
  writeProfileMirror,
  ensureTable,
};
