'use strict';

const live = require('./live-stats');
const { loadScheduleRows } = require('./admin-membership');
const { shanghaiDayStr } = require('./admin-time');

function kickoffMs(m) {
  const d = m.matchDate || m.date || '';
  const t = m.matchTime || m.time || '00:00';
  const iso = String(d).slice(0, 10) + 'T' + String(t).slice(0, 5) + ':00+08:00';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isLiveMatch(m, now = Date.now()) {
  const st = String(m.matchStatus || m.status || '');
  if (/live|进行/i.test(st)) return true;
  const ko = kickoffMs(m);
  if (ko == null) return false;
  if (ko > now) return false;
  if (/finish|完|FT|Ended/i.test(st)) return false;
  if (m.homeScore != null && m.awayScore != null && /finish|完/i.test(st)) return false;
  return now - ko < 3 * 3600e3;
}

function isFinished(m) {
  const st = String(m.matchStatus || m.status || '');
  return /finish|完|FT|Ended|Closed/i.test(st);
}

async function probeLiveEventsLag(rows) {
  let lag = 0;
  const issues = [];
  const liveRows = (rows || []).filter((m) => isLiveMatch(m)).slice(0, 12);
  for (const m of liveRows) {
    const mid = String(m.matchId || m.id || '');
    if (!mid) continue;
    try {
      const payload = await live.getLiveStats({
        matchId: mid,
        homeTeamId: m.homeTeamId || m.homeId,
        awayTeamId: m.awayTeamId || m.awayId,
        homeName: m.homeTeamName || m.home,
        awayName: m.awayTeamName || m.away,
        kickoffAt: kickoffMs(m),
      });
      if (live.liveEventsLikelyMissing && live.liveEventsLikelyMissing(payload)) {
        lag++;
        issues.push({
          matchId: mid,
          label: `${m.homeTeamName || m.home || '?'} vs ${m.awayTeamName || m.away || '?'}`,
          reason: payload.eventsError ? 'eventsError' : 'score/events gap',
        });
      }
    } catch (e) {
      issues.push({ matchId: mid, label: mid, reason: e.message });
    }
  }
  return { lag, issues, scanned: liveRows.length };
}

async function buildMatchHealthReport() {
  const sched = loadScheduleRows();
  const rows = sched.rows || [];
  const day = shanghaiDayStr();
  const todayRows = rows.filter((m) => {
    const md = String(m.matchDate || m.date || '').slice(0, 10);
    return md === day;
  });
  const liveCount = todayRows.filter((m) => isLiveMatch(m)).length;
  const unfinished = todayRows.filter((m) => !isFinished(m) && kickoffMs(m) != null && kickoffMs(m) <= Date.now()).length;
  let playerGap = null;
  try {
    playerGap = require('./player-match-db').overview().playerGapJingcai;
  } catch { /* */ }

  let lagInfo = { lag: 0, issues: [], scanned: 0 };
  try {
    lagInfo = await probeLiveEventsLag(todayRows.length ? todayRows : rows);
  } catch { /* */ }

  const alignmentNotes = [];
  try {
    const map = live.loadMap && live.loadMap();
    if (map && typeof map === 'object') {
      for (const m of todayRows.slice(0, 30)) {
        const mid = String(m.matchId || m.id || '');
        if (!mid) continue;
        const homeTeamId = m.homeTeamId || m.homeId;
        const date = m.matchDate || m.date;
        const keyParts = [mid, homeTeamId, m.awayTeamId || m.awayId, date].filter(Boolean).join('|');
        const hit = Object.keys(map).some((k) => k.includes(mid) || k.startsWith(String(homeTeamId)));
        if (!hit) {
          alignmentNotes.push({
            matchId: mid,
            sporttery: `${m.homeTeamName || m.home || '?'} vs ${m.awayTeamName || m.away || '?'}`,
            afMapped: false,
          });
        }
      }
    }
  } catch { /* */ }

  return {
    ok: true,
    day,
    scheduleSource: sched.source,
    todayCount: todayRows.length,
    liveCount,
    unfinished,
    eventsLagCount: lagInfo.lag,
    eventsLagSamples: lagInfo.issues.slice(0, 20),
    afUnmappedSamples: alignmentNotes.slice(0, 15),
    playerGapJingcai: playerGap,
    noteZh: '只读运维视图；force refresh 仅在已有 live-stats 缓存路径下隐式刷新。',
  };
}

module.exports = {
  buildMatchHealthReport,
  probeLiveEventsLag,
  isLiveMatch,
};
