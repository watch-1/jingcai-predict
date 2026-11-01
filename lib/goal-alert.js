// Shared 关注场次 goal-alert decision (server + tests). Keep in sync with
// public/app.js favGoalAlertDecision / scorePairKey / buildFavGoalNotifyCopy.
'use strict';

function scorePairKey(homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return null;
  const h = Number(homeScore), a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return h + '-' + a;
}

function parseScorePairKey(key) {
  if (key == null || key === '') return null;
  const p = String(key).split('-');
  if (p.length !== 2) return null;
  const h = Number(p[0]), a = Number(p[1]);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { h, a };
}

/**
 * lastNotified: '2-1' or null. alreadyWatching: poller already tracked this live match.
 * nextLive: { homeScore, awayScore }
 * action: seed | notify | skip | watch
 */
function favGoalAlertDecision(lastNotified, nextLive, alreadyWatching) {
  const nextKey = nextLive ? scorePairKey(nextLive.homeScore, nextLive.awayScore) : null;
  if (!nextKey) return { action: 'watch' };
  if (lastNotified === nextKey) return { action: 'skip', key: nextKey };
  const nh = Number(nextLive.homeScore), na = Number(nextLive.awayScore);
  if (lastNotified == null) {
    if (alreadyWatching && (nh > 0 || na > 0)) {
      return { action: 'notify', key: nextKey, homeScore: nh, awayScore: na };
    }
    return { action: 'seed', key: nextKey };
  }
  const last = parseScorePairKey(lastNotified);
  if (!last) return { action: 'seed', key: nextKey };
  if (nh > last.h || na > last.a) {
    return { action: 'notify', key: nextKey, homeScore: nh, awayScore: na };
  }
  return { action: 'seed', key: nextKey };
}

function buildFavGoalNotifyCopy(home, away, homeScore, awayScore, minute, player) {
  const h = home || '主队';
  const a = away || '客队';
  let body = h + ' ' + homeScore + '-' + awayScore + ' ' + a;
  if (player) body += ' · ' + player;
  if (minute != null && Number.isFinite(Number(minute))) body += ' · ' + Number(minute) + "'";
  return { title: '进球提醒', body };
}

module.exports = {
  scorePairKey,
  parseScorePairKey,
  favGoalAlertDecision,
  buildFavGoalNotifyCopy,
};
