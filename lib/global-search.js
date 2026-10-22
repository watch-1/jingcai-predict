/**
 * 1.9.119 — consumer global search (teams / players / matches).
 * Local/fast: ESPN standings+scorers disk, squads, crests/TEAM_ZH, in-memory match pools.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const INDEX_TTL_MS = 10 * 60e3;
let _idx = null;
let _idxAt = 0;

const SLUG_TO_KEY = {
  'eng.1': 'epl', 'esp.1': 'laliga', 'ger.1': 'bundesliga', 'ita.1': 'seriea',
  'fra.1': 'ligue1', 'uefa.champions': 'ucl', 'chn.1': 'csl', 'eng.2': 'championship',
  'ned.1': 'eredivisie',
};
const KEY_ZH = {
  epl: '英超', laliga: '西甲', bundesliga: '德甲', seriea: '意甲', ligue1: '法甲',
  ucl: '欧冠', csl: '中超', championship: '英冠', eredivisie: '荷甲',
};

function norm(s) {
  let t = String(s || '');
  try { t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch { /* ignore */ }
  return t.toLowerCase().replace(/&/g, ' ').replace(/[^\w\u4e00-\u9fff\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hay(...parts) {
  return norm(parts.filter(Boolean).join(' '));
}

function scoreHit(q, fields) {
  const nq = norm(q);
  if (!nq || nq.length < 1) return 0;
  let best = 0;
  for (const f of fields) {
    const h = norm(f);
    if (!h) continue;
    if (h === nq) best = Math.max(best, 100);
    else if (h.startsWith(nq)) best = Math.max(best, 90);
    else if (h.includes(nq)) best = Math.max(best, 70);
    else if (nq.length >= 2 && nq.includes(h) && h.length >= 2) best = Math.max(best, 55);
  }
  // token AND: every query token appears somewhere
  if (best < 70) {
    const tokens = nq.split(' ').filter(Boolean);
    if (tokens.length > 1) {
      const blob = fields.map(norm).join(' ');
      if (tokens.every(t => blob.includes(t))) best = Math.max(best, 60);
    }
  }
  return best;
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function loadEspnTable(kind, slug) {
  const p = path.join(DATA_DIR, 'live-stats', 'espn', 'tables', `${kind}-${slug}.json`);
  const j = readJson(p, null);
  if (!j) return null;
  return j.payload || j;
}

function buildTeamIndex(lt) {
  const teams = [];
  const seen = new Set();
  const teamZh = (n) => {
    try { return lt.teamZh(n) || ''; } catch { return ''; }
  };
  for (const [slug, key] of Object.entries(SLUG_TO_KEY)) {
    const payload = loadEspnTable('standings', slug);
    if (!payload) continue;
    const rows = payload.rows || [];
    const tables = payload.tables || [];
    const all = rows.length ? rows : tables.flatMap(t => t.rows || []);
    for (const r of all) {
      const id = String(r.teamId || r.espnTeamId || '');
      if (!id) continue;
      const dedupe = `${key}:${id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const en = r.team || '';
      const zh = r.teamZh || teamZh(en) || '';
      teams.push({
        kind: 'team',
        id,
        name: en,
        nameZh: zh,
        league: key,
        leagueZh: KEY_ZH[key] || payload.leagueZh || '',
        logo: r.logo || (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : ''),
        href: `#/team/${encodeURIComponent(id)}?league=${encodeURIComponent(key)}`,
        sub: ['足球', KEY_ZH[key] || key].filter(Boolean).join(' · '),
        _hay: hay(zh, en, KEY_ZH[key]),
      });
    }
  }
  // Crests: only add if we can map to an ESPN standings team (same zh/en)
  try {
    const crests = readJson(path.join(DATA_DIR, 'crests.json'), {});
    const byZh = new Map();
    const byEn = new Map();
    for (const t of teams) {
      if (t.nameZh) byZh.set(norm(t.nameZh), t);
      if (t.name) byEn.set(norm(t.name), t);
    }
    for (const row of Object.values(crests.teams || {})) {
      if (!row) continue;
      const zh = row.zh || '';
      const en = row.en || '';
      const hit = (zh && byZh.get(norm(zh))) || (en && byEn.get(norm(en)));
      if (hit && row.badge && !hit.logo) hit.logo = row.badge;
      // alias: allow searching crest zh even if standings zh empty (already filled via TEAM_ZH)
      if (hit && zh && !hit.nameZh) hit.nameZh = zh;
    }
  } catch { /* optional */ }
  return teams;
}

function buildPlayerIndex(lt) {
  const players = [];
  const seen = new Set();
  const playerZh = (n) => {
    try { return lt.playerZh(n) || ''; } catch { return ''; }
  };
  const teamZh = (n) => {
    try { return lt.teamZh(n) || ''; } catch { return ''; }
  };

  for (const [slug, key] of Object.entries(SLUG_TO_KEY)) {
    for (const kind of ['scorers', 'assists']) {
      const payload = loadEspnTable(kind, slug);
      if (!payload) continue;
      for (const r of (payload.rows || [])) {
        const id = String(r.playerId || r.espnAthleteId || '');
        if (!id) continue;
        const dedupe = `aplayer:${id}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const en = r.player || '';
        const zh = r.playerZh || playerZh(en) || '';
        const ten = r.team || '';
        const tzh = r.teamZh || teamZh(ten) || '';
        players.push({
          kind: 'player',
          id,
          route: 'aplayer',
          name: en,
          nameZh: zh,
          team: ten,
          teamZh: tzh,
          teamId: r.teamId || r.espnTeamId || null,
          league: key,
          leagueZh: KEY_ZH[key] || '',
          photo: r.photo || '',
          href: `#/aplayer/${encodeURIComponent(id)}?league=${encodeURIComponent(key)}`,
          sub: ['足球', KEY_ZH[key] || '', tzh || ten].filter(Boolean).join(' · '),
          _hay: hay(zh, en, tzh, ten),
        });
      }
    }
  }

  // Squads (TheSportsDB / ESPN roster) → #/player/:id
  const namezh = readJson(path.join(DATA_DIR, 'squads', '_namezh.json'), {});
  const squadDir = path.join(DATA_DIR, 'squads');
  let files = [];
  try { files = fs.readdirSync(squadDir).filter(f => f.endsWith('.json') && !f.startsWith('_')); } catch { files = []; }
  for (const f of files.slice(0, 80)) {
    const sq = readJson(path.join(squadDir, f), null);
    if (!sq || !Array.isArray(sq.players)) continue;
    const teamName = sq.nameEn || '';
    const teamZhName = sq.nameZh || teamZh(teamName) || '';
    const lgHint = String(sq.league || '').toLowerCase();
    let leagueKey = '';
    for (const [k, zh] of Object.entries(KEY_ZH)) {
      if (lgHint.includes(k) || lgHint.includes(zh) || (sq.league && String(sq.league).includes(zh))) {
        leagueKey = k; break;
      }
    }
    for (const p of sq.players) {
      const id = String(p.id || '');
      if (!id || /^(af|espn|fx):/i.test(id)) continue;
      // Prefer aplayer if already indexed from scorers
      if (seen.has(`aplayer:${id}`)) continue;
      const dedupe = `player:${id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const en = p.name || '';
      const zh = p.nameZh || namezh[id] || playerZh(en) || '';
      players.push({
        kind: 'player',
        id,
        route: 'player',
        name: en,
        nameZh: zh,
        team: teamName,
        teamZh: teamZhName,
        teamId: sq.teamId || null,
        league: leagueKey || '',
        leagueZh: KEY_ZH[leagueKey] || '',
        photo: p.photo || '',
        href: `#/player/${encodeURIComponent(id)}`,
        sub: ['足球', teamZhName || teamName, KEY_ZH[leagueKey] || ''].filter(Boolean).join(' · '),
        _hay: hay(zh, en, teamZhName, teamName),
      });
    }
  }

  // AF/ESPN detail-teamsquad caches
  const ltDir = path.join(DATA_DIR, 'league-tables');
  let dfiles = [];
  try { dfiles = fs.readdirSync(ltDir).filter(f => f.startsWith('detail-teamsquad-') && f.endsWith('.json')); } catch { dfiles = []; }
  for (const f of dfiles.slice(0, 120)) {
    const disk = readJson(path.join(ltDir, f), null);
    const payload = disk && (disk.payload || disk);
    const squad = (payload && payload.squad) || [];
    if (!Array.isArray(squad) || !squad.length) continue;
    const teamId = String(f).replace(/^detail-teamsquad-/, '').replace(/-x\.json$/, '');
    for (const p of squad) {
      const id = String(p.playerId || p.id || p.espnAthleteId || '');
      if (!id || /^(af|espn|fx):/i.test(id)) continue;
      if (seen.has(`aplayer:${id}`) || seen.has(`player:${id}`)) continue;
      const en = p.player || p.name || '';
      const zh = p.playerZh || p.nameZh || playerZh(en) || '';
      const isEspnish = /^\d{1,7}$/.test(id); // ESPN athlete ids are typically shorter
      const route = isEspnish ? 'aplayer' : 'player';
      seen.add(`${route}:${id}`);
      const href = route === 'aplayer'
        ? `#/aplayer/${encodeURIComponent(id)}?league=epl`
        : `#/player/${encodeURIComponent(id)}`;
      players.push({
        kind: 'player',
        id,
        route,
        name: en,
        nameZh: zh,
        team: p.team || '',
        teamZh: p.teamZh || '',
        teamId: p.teamId || teamId || null,
        league: '',
        leagueZh: '',
        photo: p.photo || '',
        href,
        sub: ['足球', p.teamZh || p.team || ''].filter(Boolean).join(' · '),
        _hay: hay(zh, en, p.teamZh, p.team),
      });
    }
  }

  return players;
}

function ensureIndex() {
  if (_idx && Date.now() - _idxAt < INDEX_TTL_MS) return _idx;
  const lt = require('./league-tables');
  const teams = buildTeamIndex(lt);
  const players = buildPlayerIndex(lt);
  _idx = { teams, players, builtAt: new Date().toISOString() };
  _idxAt = Date.now();
  return _idx;
}

function searchMatches(q, pools, limit) {
  const nq = norm(q);
  if (!nq) return [];
  const out = [];
  const seen = new Set();
  for (const m of pools || []) {
    if (!m || m.id == null) continue;
    const id = String(m.id);
    if (seen.has(id)) continue;
    const fields = [m.home, m.away, m.homeEn, m.awayEn, m.league, m.num];
    const sc = scoreHit(q, fields);
    if (sc < 55) continue;
    seen.add(id);
    const date = m.date || '';
    const time = m.time || '';
    const when = [date, time].filter(Boolean).join(' ');
    out.push({
      kind: 'match',
      id,
      name: `${m.home || ''} vs ${m.away || ''}`,
      nameZh: `${m.home || ''} vs ${m.away || ''}`,
      home: m.home,
      away: m.away,
      homeLogo: m.homeLogo || '',
      awayLogo: m.awayLogo || '',
      league: m.league || '',
      date,
      time,
      status: m.status || '',
      href: `#/match/${encodeURIComponent(id)}`,
      sub: ['足球', m.league || '', when].filter(Boolean).join(' · '),
      _score: sc,
    });
  }
  out.sort((a, b) => b._score - a._score || String(b.date).localeCompare(String(a.date)));
  return out.slice(0, limit).map(({ _score, ...rest }) => rest);
}

function rankSlice(list, q, limit) {
  const scored = [];
  for (const row of list) {
    const sc = scoreHit(q, [row.nameZh, row.name, row.teamZh, row.team, row.leagueZh, row._hay]);
    if (sc >= 55) scored.push({ ...row, _score: sc });
  }
  scored.sort((a, b) => b._score - a._score
    || ((a.route === 'aplayer') === (b.route === 'aplayer') ? 0 : (a.route === 'aplayer' ? -1 : 1))
    || String(a.nameZh || a.name).localeCompare(String(b.nameZh || b.name), 'zh'));
  return scored.slice(0, limit).map(({ _score, _hay, ...rest }) => rest);
}

/**
 * @param {{ q: string, tab?: string, limit?: number, getMatchPools?: () => Promise<any[]>|any[] }} opts
 */
async function search(opts = {}) {
  const q = String(opts.q || '').trim();
  const tab = String(opts.tab || 'all').toLowerCase();
  const limit = Math.min(40, Math.max(1, Number(opts.limit) || 20));
  if (!q || q.length < 1) {
    return { ok: true, q, tab, teams: [], players: [], matches: [], noteZh: '请输入球队、球员或比赛关键词' };
  }
  const idx = ensureIndex();
  const wantTeams = tab === 'all' || tab === 'teams' || tab === 'team' || tab === '球队';
  const wantPlayers = tab === 'all' || tab === 'players' || tab === 'player' || tab === '球员';
  const wantMatches = tab === 'all' || tab === 'matches' || tab === 'match' || tab === '比赛';

  const per = tab === 'all' ? Math.min(12, limit) : limit;
  const teams = wantTeams ? rankSlice(idx.teams, q, per) : [];
  const players = wantPlayers ? rankSlice(idx.players, q, per) : [];

  let matches = [];
  if (wantMatches && typeof opts.getMatchPools === 'function') {
    let pools = [];
    try {
      const p = opts.getMatchPools();
      pools = await Promise.resolve(p);
    } catch { pools = []; }
    matches = searchMatches(q, pools, per);
  }

  return {
    ok: true,
    q,
    tab,
    teams,
    players,
    matches,
    meta: {
      indexAt: idx.builtAt,
      teamIndex: idx.teams.length,
      playerIndex: idx.players.length,
    },
    noteZh: '搜索本地球队/球员索引与近期赛程；点选可进入详情。',
  };
}

function invalidate() {
  _idx = null;
  _idxAt = 0;
}

module.exports = { search, ensureIndex, invalidate, norm };
