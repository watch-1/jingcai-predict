// Persist finished 竞彩赛果 beyond sporttery's rolling results window (see RESULT_DAYS in server.js).
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const KEEP_DAYS = 14;

function resultsSeenPath() {
  return path.join(DATA_DIR, 'results-seen.json');
}

function bjDate(offsetDays) {
  return new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
}

function issueKey(r) {
  return r.businessDate || r.date || '';
}

function loadResultsSeen() {
  try {
    const j = JSON.parse(fs.readFileSync(resultsSeenPath(), 'utf8'));
    return (j && typeof j.byId === 'object' && j.byId) ? j.byId : {};
  } catch {
    return {};
  }
}

function pruneAndSaveResultsSeen(byId) {
  const cutoff = bjDate(-KEEP_DAYS);
  const out = {};
  for (const [id, r] of Object.entries(byId || {})) {
    if (!r || !r.id || !r.full) continue;
    const bd = issueKey(r);
    if (bd && bd < cutoff) continue;
    out[String(id)] = {
      id: String(r.id),
      num: r.num || '',
      league: r.league || '',
      leagueColor: r.leagueColor || null,
      date: r.date || '',
      time: r.time || '',
      businessDate: r.businessDate || null,
      home: r.home || '',
      away: r.away || '',
      homeLogo: r.homeLogo || '',
      awayLogo: r.awayLogo || '',
      homeTeamId: r.homeTeamId || '',
      awayTeamId: r.awayTeamId || '',
      half: r.half || '',
      full: String(r.full).trim(),
      goalLine: r.goalLine != null ? String(r.goalLine) : '',
      winFlag: r.winFlag || '',
      had: r.had || null,
      status: r.status || '完场',
    };
  }
  try {
    fs.mkdirSync(path.dirname(resultsSeenPath()), { recursive: true });
    fs.writeFileSync(resultsSeenPath(), JSON.stringify({ savedAt: new Date().toISOString(), byId: out }));
  } catch (e) {
    console.warn('[results] seen save failed', e.message);
  }
  return out;
}

/** Merge disk archive into live results list (by match id). */
function mergeSeenIntoResults(list) {
  const byId = new Map((list || []).map(r => [String(r.id), r]));
  const seen = loadResultsSeen();
  let merged = 0;
  for (const [id, r] of Object.entries(seen)) {
    if (!r || !r.full) continue;
    const cur = byId.get(id);
    if (!cur) {
      byId.set(id, r);
      merged++;
    } else if (!cur.full) {
      byId.set(id, { ...cur, ...r, had: cur.had || r.had });
      merged++;
    }
  }
  return { data: [...byId.values()], merged };
}

/** Upsert any finished rows from a fresh results payload into the archive. */
function recordResultsFromList(list) {
  if (!list || !list.length) return;
  const seen = loadResultsSeen();
  for (const r of list) {
    if (!r || !r.id || !r.full) continue;
    const id = String(r.id);
    seen[id] = { ...(seen[id] || {}), ...r, id };
  }
  pruneAndSaveResultsSeen(seen);
}

function winFlagFromFull(full) {
  const parts = String(full || '').trim().split(':');
  const hg = Number(parts[0]);
  const ag = Number(parts[1]);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return '';
  return hg > ag ? 'H' : hg === ag ? 'D' : 'A';
}

/** Map results-seen / schedule-seen row → match-stats history JSONL shape. */
function toHistoryFormRow(r) {
  if (!r || !r.id) return null;
  const ft = String(r.full || r.ft || '').trim();
  if (!ft || !/^\d+:\d+$/.test(ft)) return null;
  const winFlag = r.winFlag || winFlagFromFull(ft);
  const matchDate = r.date || r.matchDate || '';
  if (!matchDate) return null;
  return {
    matchId: Number(r.id) || String(r.id),
    matchDate,
    home: r.home || '',
    away: r.away || '',
    homeTeamId: r.homeTeamId != null && r.homeTeamId !== '' ? Number(r.homeTeamId) : '',
    awayTeamId: r.awayTeamId != null && r.awayTeamId !== '' ? Number(r.awayTeamId) : '',
    ft,
    winFlag,
    league: r.league || '',
    _formSource: 'archive',
  };
}

/**
 * Recent finished 竞彩 rows persisted by the live results pipeline (≤14d).
 * Fills the gap before batch `history/results.jsonl` catches up.
 */
function loadRecentFormHistoryRows() {
  const byId = new Map();
  for (const r of Object.values(loadResultsSeen())) {
    const row = toHistoryFormRow(r);
    if (row) byId.set(String(row.matchId), row);
  }
  try {
    const schedPath = path.join(DATA_DIR, 'schedule-seen.json');
    const j = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
    for (const r of Object.values((j && j.byId) || {})) {
      const row = toHistoryFormRow(r);
      if (!row) continue;
      const id = String(row.matchId);
      if (!byId.has(id)) byId.set(id, row);
    }
  } catch (_) {}
  return [...byId.values()];
}

function scheduleRowToResult(m) {
  const full = m && m.full && String(m.full).trim();
  if (!m || !m.id || !full) return null;
  const goalLine = (m.hhad && m.hhad.goalLine) || m.goalLine || '';
  return {
    id: String(m.id),
    num: m.num || '',
    league: m.league || '',
    leagueColor: m.leagueColor || null,
    date: m.date || '',
    time: m.time || '',
    businessDate: m.businessDate || null,
    home: m.home || '',
    away: m.away || '',
    homeLogo: m.homeLogo || '',
    awayLogo: m.awayLogo || '',
    homeTeamId: m.homeTeamId || '',
    awayTeamId: m.awayTeamId || '',
    half: m.half || '',
    full,
    goalLine: goalLine != null ? String(goalLine) : '',
    had: m.had || null,
    status: m.status || '完场',
  };
}

/** Pull finished scores from schedule / seen-cache stubs when results window aged out. */
function absorbScheduleFinished(list, scheduleList) {
  const byId = new Map((list || []).map(r => [String(r.id), r]));
  let added = 0;
  for (const m of scheduleList || []) {
    const row = scheduleRowToResult(m);
    if (!row) continue;
    const id = String(row.id);
    const cur = byId.get(id);
    if (!cur || !cur.full) {
      byId.set(id, cur ? { ...cur, ...row, had: cur.had || row.had } : row);
      added++;
    }
  }
  return { data: [...byId.values()], added };
}

module.exports = {
  KEEP_DAYS,
  loadResultsSeen,
  mergeSeenIntoResults,
  recordResultsFromList,
  absorbScheduleFinished,
  pruneAndSaveResultsSeen,
  scheduleRowToResult,
  winFlagFromFull,
  toHistoryFormRow,
  loadRecentFormHistoryRows,
};
