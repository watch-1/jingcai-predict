/**
 * Knockout bracket from Sportmonks Growth fixtures already on the plan.
 * Stages + schedules are core fixture data. No extra package.
 * Round-robin seasons, missing token, and thin draws stay hidden.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const heat = require('./heat-source');

const API = 'https://api.sportmonks.com/v3';
const FRESH_MS = 6 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'sm-bracket', `${String(matchId).replace(/[^\w.-]/g, '_')}.json`);
}

function readCache(matchId) {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(matchId), 'utf8'));
    if (j && j.matchId != null) return j;
  } catch { /* miss */ }
  return null;
}

function writeCache(pack) {
  const file = cacheFile(pack.matchId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack));
  fs.renameSync(tmp, file);
  return pack;
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const KO_NAME = /knock|play-?off|round of\s*\d+|last\s*\d+|quarter|semi[-\s]?final|\bfinal\b|1\/8|1\/4|1\/2|十六|八强|四强|半决赛|决赛|淘汰|八分之一|四分之一/i;

function isLeagueRoundName(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (/^\d+$/.test(s)) return true;
  if (/^(matchday|round|jornada|spieltag|giornata|week)\s*\d+$/i.test(s)) return true;
  if (/regular season|league phase|group stage|championship round|联赛/i.test(s)) return true;
  return false;
}

function isKnockoutLabel(name) {
  const s = String(name || '').trim();
  if (!s || isLeagueRoundName(s)) return false;
  return KO_NAME.test(s);
}

function stageBlob(stage) {
  const type = (stage && stage.type) || {};
  return [stage && stage.name, type.name, type.developer_name, stage && stage.type_name].filter(Boolean).join(' ');
}

function roundRank(name) {
  const s = String(name || '');
  const rules = [
    [/round of 32|1\/16|32强|last 32|十六分之一/, 10],
    [/round of 16|1\/8|16强|last 16|八分之一/, 20],
    [/quarter|1\/4|八强|四分之一/, 30],
    [/semi|半决|四强/, 40],
    [/3rd|third place|三四/, 45],
    [/决赛|\bfinal\b/i, 50],
  ];
  for (const [re, n] of rules) if (re.test(s)) return n;
  return 25;
}

function roundLabelZh(name) {
  const s = String(name || '');
  if (/round of 32|1\/16|last 32/i.test(s)) return '32强';
  if (/round of 16|1\/8|last 16/i.test(s)) return '16强';
  if (/quarter/i.test(s)) return '四分之一决赛';
  if (/semi/i.test(s)) return '半决赛';
  if (/3rd|third place/i.test(s)) return '三四名';
  if (/\bfinal\b|决赛/i.test(s) && !/semi|quarter|半|四分/i.test(s)) return '决赛';
  if (/[\u4e00-\u9fff]/.test(s)) return s;
  return s;
}

function inferFromCount(n) {
  if (n >= 16) return '32强';
  if (n >= 8) return '16强';
  if (n >= 4) return '四分之一决赛';
  if (n === 2) return '半决赛';
  if (n === 1) return '决赛';
  return '';
}

function teamLabel(name) {
  try {
    const zh = require('./league-tables').teamZh(name);
    if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  } catch { /* map optional */ }
  return '';
}

function displayTeam(p) {
  const zh = teamLabel(p && p.name);
  if (zh) return zh;
  const code = String((p && p.short_code) || '').trim();
  if (code) return code.toUpperCase();
  const letters = String((p && p.name) || '').replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase();
}

function goalsFor(fx, participant, location) {
  const scores = (fx && fx.scores) || [];
  const current = scores.filter(s => /CURRENT/i.test(String(s.description || '')));
  const pool = current.length ? current : scores.filter(s => /FT|FULL|2ND_HALF|PEN/i.test(String(s.description || '')));
  const use = pool.length ? pool : scores;
  const hit = use.find(s => {
    if (s.participant_id != null && participant && Number(s.participant_id) === Number(participant.id)) return true;
    const loc = s.score && s.score.participant;
    return loc && location && String(loc).toLowerCase() === location;
  });
  if (!hit || !hit.score || hit.score.goals == null || hit.score.goals === '') return null;
  const n = Number(hit.score.goals);
  return Number.isFinite(n) ? n : null;
}

function sidesOf(fx) {
  const parts = (fx && fx.participants) || [];
  const home = parts.find(p => (p.meta && p.meta.location) === 'home') || parts[0];
  const away = parts.find(p => (p.meta && p.meta.location) === 'away') || parts[1];
  return { home, away };
}

function collectRounds(stages) {
  const out = [];
  for (const st of stages || []) {
    const stageKo = isKnockoutLabel(stageBlob(st));
    const rounds = Array.isArray(st.rounds) && st.rounds.length
      ? st.rounds
      : (Array.isArray(st.fixtures) ? [{ name: st.name, fixtures: st.fixtures, sort_order: st.sort_order }] : []);
    for (const rd of rounds) {
      const ko = stageKo || isKnockoutLabel(rd.name);
      const fixtures = rd.fixtures || [];
      if (!ko || !fixtures.length) continue;
      out.push({
        name: rd.name || st.name || '',
        stageKo,
        fixtures,
        sort: rd.sort_order != null ? rd.sort_order : (st.sort_order || 0),
      });
    }
  }
  return out;
}

function seasonIsCup(stages) {
  const meaningful = (stages || []).filter(st => st && (st.name || (st.rounds && st.rounds.length) || (st.fixtures && st.fixtures.length)));
  if (!meaningful.length) return false;
  return meaningful.every(st => isKnockoutLabel(stageBlob(st)) || isKnockoutLabel(st.name));
}

function buildModel(stages) {
  const raw = collectRounds(stages);
  const cards = raw.map(rd => {
    const named = isKnockoutLabel(rd.name) && !isLeagueRoundName(rd.name);
    const label = named ? roundLabelZh(rd.name) : (rd.stageKo ? (inferFromCount(rd.fixtures.length) || roundLabelZh(rd.name)) : roundLabelZh(rd.name));
    const matches = [];
    const ordered = rd.fixtures.slice().sort((a, b) => String(a.starting_at || '').localeCompare(String(b.starting_at || '')) || (Number(a.id) - Number(b.id)));
    for (const fx of ordered) {
      const { home, away } = sidesOf(fx);
      if (!home || !away || !home.name || !away.name) continue;
      const homeZh = displayTeam(home);
      const awayZh = displayTeam(away);
      matches.push({
        home: homeZh,
        away: awayZh,
        logoH: home.image_path || '',
        logoA: away.image_path || '',
        hs: goalsFor(fx, home, 'home'),
        as: goalsFor(fx, away, 'away'),
        id: fx.id,
      });
    }
    return { label, rank: roundRank(label), sort: rd.sort, matches };
  }).filter(r => r.matches.length);

  const merged = [];
  for (const r of cards.sort((a, b) => a.rank - b.rank || a.sort - b.sort || String(a.label).localeCompare(String(b.label)))) {
    const prev = merged[merged.length - 1];
    if (prev && prev.label === r.label) prev.matches.push(...r.matches);
    else merged.push({ label: r.label, rank: r.rank, matches: r.matches.slice() });
  }
  const total = merged.reduce((n, r) => n + r.matches.length, 0);
  if (merged.length < 2 || total < 3) return null;
  const last = merged[merged.length - 1];
  if (last.label === '决赛') last.matches.forEach(m => { m.final = true; });
  return { rounds: merged };
}

function logoHtml(url) {
  if (url) return `<img src="/api/logo?url=${encodeURIComponent(url)}" alt="" />`;
  return '<i></i>';
}

function renderBracketHtml(model) {
  if (!model || !model.rounds || model.rounds.length < 2) return '';
  const cols = model.rounds.map((rd, idx) => {
    const last = idx === model.rounds.length - 1;
    const pairs = [];
    for (let i = 0; i < rd.matches.length; i += 2) {
      const chunk = rd.matches.slice(i, i + 2).map(m => {
        const row = (logo, name, goals) => `<div class="br-side">${logoHtml(logo)}<span class="br-nm" title="${esc(name)}">${esc(name)}</span><b>${goals == null ? '–' : esc(goals)}</b></div>`;
        return `<div class="br-card${m.final ? ' final' : ''}">${row(m.logoH, m.home, m.hs)}${row(m.logoA, m.away, m.as)}</div>`;
      }).join('');
      pairs.push(`<div class="br-pair${last ? '' : ' join'}">${chunk}</div>`);
    }
    return `<div class="br-col"><div class="br-lab">${esc(rd.label)}</div><div class="br-stack">${pairs.join('')}</div></div>`;
  }).join('');
  return `<section class="sm-br sm-kit"><div class="sm-kit-hd"><h3>对阵图</h3><small>淘汰赛</small></div><div class="br-board">${cols}</div></section>`;
}

function smGet(urlPath, params, timeoutMs) {
  const token = heat.readToken();
  if (!token) return Promise.reject(new Error('no-token'));
  const u = new URL(API + urlPath);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  u.searchParams.set('api_token', token);
  return new Promise((resolve, reject) => {
    const req = https.get(u, {
      headers: { Accept: 'application/json', 'User-Agent': 'yunqiumi-predict-bracket/1.0' },
      timeout: timeoutMs || 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
          reject(new Error(`bad-json ${res.statusCode}`));
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`http ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function hidden(matchId, clock, reason) {
  return { matchId: String(matchId || ''), show: false, reason, html: '', fetchedAt: clock };
}

async function ensureBracket({
  matchId, homeTeamId, awayTeamId, homeZh, awayZh,
  homeSmId, awaySmId, kickoffMs, fetchImpl, now,
} = {}) {
  const clock = now || Date.now();
  const cached = matchId ? readCache(matchId) : null;
  if (cached && cached.fetchedAt) {
    const age = clock - Number(cached.fetchedAt);
    if (cached.show && age < FRESH_MS) return cached;
    if (!cached.show && age < NEGATIVE_MS) return cached;
  }
  const fetchJson = fetchImpl || (heat.readToken() ? smGet : null);
  if (!fetchJson || !matchId) return cached && cached.html != null ? cached : hidden(matchId, clock, 'no-token');

  async function resolve(teamId, zh, known) {
    if (known) return known;
    const name = heat.englishName(teamId, zh);
    if (!name) return null;
    const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    return heat.pickTeamId(found && found.data, name);
  }

  let homeSm = homeSmId || null;
  let awaySm = awaySmId || null;
  try {
    homeSm = await resolve(homeTeamId, homeZh, homeSm);
    awaySm = await resolve(awayTeamId, awayZh, awaySm);
  } catch {
    return cached || hidden(matchId, clock, 'lookup-failed');
  }
  if (!homeSm || !awaySm) return writeCache(hidden(matchId, clock, 'no-team'));

  const ko = Number.isFinite(kickoffMs) ? kickoffMs : clock;
  let fx = null;
  try {
    const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${homeSm}`, {
      include: 'participants;stage.type;round;season',
      per_page: 20,
    });
    fx = ((body && body.data) || []).find(row => {
      const ids = (row.participants || []).map(p => Number(p.id));
      return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
    }) || null;
  } catch {
    return writeCache(hidden(matchId, clock, 'unavailable'));
  }
  if (!fx) return writeCache(hidden(matchId, clock, 'no-fixture'));
  const seasonId = fx.season_id || (fx.season && fx.season.id);
  if (!seasonId) return writeCache(hidden(matchId, clock, 'no-season'));

  let stages = [];
  try {
    const sched = await fetchJson(`/football/schedules/seasons/${seasonId}`, {
      include: 'rounds.fixtures.participants;rounds.fixtures.scores;type',
    });
    stages = (sched && sched.data) || [];
  } catch {
    try {
      const alt = await fetchJson(`/football/stages/seasons/${seasonId}`, {
        include: 'type;rounds.fixtures.participants;rounds.fixtures.scores',
      });
      stages = (alt && alt.data) || [];
    } catch {
      return writeCache(hidden(matchId, clock, 'unavailable'));
    }
  }
  if (!Array.isArray(stages) || !stages.length) return writeCache(hidden(matchId, clock, 'unavailable'));

  const curBlob = [fx.stage && fx.stage.name, fx.round && fx.round.name, fx.stage && fx.stage.type && fx.stage.type.name].filter(Boolean).join(' ');
  const curKo = isKnockoutLabel(curBlob);
  if (!curKo && !seasonIsCup(stages)) return writeCache(hidden(matchId, clock, 'not-knockout'));

  const model = buildModel(stages);
  if (!model) return writeCache(hidden(matchId, clock, 'thin'));
  return writeCache({
    matchId: String(matchId),
    show: true,
    reason: '',
    html: renderBracketHtml(model),
    rounds: model.rounds.map(r => r.label),
    fetchedAt: clock,
  });
}

module.exports = {
  isKnockoutLabel,
  isLeagueRoundName,
  buildModel,
  renderBracketHtml,
  ensureBracket,
};
