/**
 * 1.9.108–1.9.116 — player / club market value (身价); league club board + squad rank.
 *
 * Source: bundled snapshot from transfermarkt-datasets (community dataset derived from
 * Transfermarkt valuations; asOf ~2026-06). API-Football has no market-value field.
 * Live Transfermarkt / Wikidata are unreachable from the China production host, so we
 * ship a gzipped index under data/market-value/ and look up by normalized EN name.
 *
 * 1.9.116: mononym/club-scope (Alisson), unique last-name transfer drift (Tsimikas),
 * first-name diminutives (Kostas↔Konstantinos); re-enrich safe after photo cache merge.
 *
 * Rebuild: node tools/build-market-value-index.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DATA_DIR } = require('./db');

const INDEX_PATH = () => path.join(DATA_DIR, 'market-value', 'index.json.gz');

let _idx = null;
let _loadErr = null;

function norm(s) {
  let t = String(s || '');
  try {
    t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch { /* ignore */ }
  t = t.toLowerCase().replace(/&/g, ' ').replace(/[^\w\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (const suf of [' fc', ' cf', ' afc', ' sc']) {
    if (t.endsWith(suf)) t = t.slice(0, -suf.length).trim();
  }
  return t;
}

/** Drop position / role suffixes sometimes glued onto AF/ESPN display names. */
function stripNameJunk(s) {
  let t = String(s || '');
  t = t.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ');
  t = t.replace(/\s+[-–—]\s*(goalkeeper|defender|midfielder|forward|attacker|gk|df|mf|fw)\b.*$/i, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Common diminutive / alternate first names (TM often uses formal form). */
const FIRST_NAME_ALIASES = {
  kostas: ['konstantinos', 'constantinos'],
  konstantinos: ['kostas', 'constantinos'],
  constantinos: ['kostas', 'konstantinos'],
  alex: ['alexander', 'alexandre', 'alexis'],
  alexander: ['alex', 'alexandre'],
  alexis: ['alex'],
  josh: ['joshua'],
  joshua: ['josh'],
  tony: ['anthony', 'antonio'],
  anthony: ['tony'],
  mike: ['michael'],
  michael: ['mike'],
  nick: ['nicholas', 'nicolas'],
  nico: ['nicolas', 'nicolo', 'nicolo'],
  bobby: ['robert'],
  rob: ['robert', 'robbie'],
  bill: ['william'],
  will: ['william'],
  jimmy: ['james'],
  jim: ['james'],
  joe: ['joseph'],
  danny: ['daniel'],
  dan: ['daniel'],
  chris: ['christopher', 'christian'],
  stevie: ['steven', 'stephen'],
  steve: ['steven', 'stephen'],
  andy: ['andrew'],
  drew: ['andrew'],
  matt: ['matthew'],
  tom: ['thomas', 'tommy'],
  tommy: ['thomas', 'tom'],
  harry: ['harold', 'harrison'],
};

function expandFirstName(first) {
  const f = String(first || '').toLowerCase();
  if (!f) return [];
  const out = new Set([f]);
  for (const a of (FIRST_NAME_ALIASES[f] || [])) out.add(a);
  return [...out];
}

function loadIndex() {
  if (_idx) return _idx;
  if (_loadErr) return null;
  try {
    const buf = fs.readFileSync(INDEX_PATH());
    const raw = zlib.gunzipSync(buf).toString('utf8');
    const j = JSON.parse(raw);
    const lastNames = new Map();
    for (const [k, list] of Object.entries(j.players || {})) {
      const parts = k.split(' ').filter(Boolean);
      if (!parts.length) continue;
      const last = parts[parts.length - 1];
      if (last.length < 3) continue;
      if (!lastNames.has(last)) lastNames.set(last, []);
      lastNames.get(last).push(...list);
    }
    _idx = {
      asOf: j.asOf || '',
      noteZh: j.noteZh || '参考市值，仅供参考。',
      source: j.source || 'transfermarkt-datasets',
      players: j.players || {},
      clubs: j.clubs || {},
      aliases: j.aliases || {},
      lastNames,
    };
    return _idx;
  } catch (e) {
    _loadErr = e;
    console.warn('[market-value] index load failed:', e.message);
    return null;
  }
}

/** Format EUR integer → Chinese + euro short labels. */
function formatEur(eur) {
  const n = Number(eur);
  if (!Number.isFinite(n) || n <= 0) return null;
  let labelEuro;
  if (n >= 1e9) labelEuro = `€${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}bn`;
  else if (n >= 1e6) {
    const m = n / 1e6;
    labelEuro = `€${(m >= 100 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, ''))}m`;
  } else if (n >= 1e3) labelEuro = `€${Math.round(n / 1e3)}k`;
  else labelEuro = `€${Math.round(n)}`;

  let labelZh;
  if (n >= 1e8) labelZh = `${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}亿欧`;
  else if (n >= 1e4) {
    const w = n / 1e4;
    labelZh = `${(w >= 100 ? Math.round(w) : Number(w.toFixed(1)))}万欧`;
  } else labelZh = `${Math.round(n)}欧`;

  return {
    eur: Math.round(n),
    labelZh,
    labelEuro,
    text: `${labelZh}（${labelEuro}）`,
  };
}

function clubKey(name) {
  const idx = loadIndex();
  if (!idx) return '';
  let k = norm(name);
  if (!k) return '';
  if (idx.aliases[k]) k = idx.aliases[k];
  return k;
}

function sortRows(list) {
  return (list || []).slice().sort((a, b) => (b[1] - a[1]) || (b[4] - a[4]));
}

function clubMatches(rowClub, hint) {
  const c = norm(rowClub || '');
  const h = norm(hint || '');
  if (!c || !h) return false;
  if (c === h || c.includes(h) || h.includes(c)) return true;
  // alias both sides
  const idx = loadIndex();
  const ca = idx && idx.aliases[c] ? idx.aliases[c] : c;
  const ha = idx && idx.aliases[h] ? idx.aliases[h] : h;
  return ca === ha || ca.includes(ha) || ha.includes(ca);
}

function pickPlayerRow(list, clubHint, { requireClub } = {}) {
  if (!list || !list.length) return null;
  const sorted = sortRows(list);
  if (clubHint) {
    const hit = sorted.find((row) => clubMatches(row[2], clubHint));
    if (hit) return hit;
    if (requireClub) return null;
  }
  return sorted[0];
}

function rowToPlayer(row, meta) {
  if (!row) return null;
  const fmt = formatEur(row[1]);
  if (!fmt) return null;
  return {
    ok: true,
    ...fmt,
    name: row[0],
    club: row[2] || '',
    tmId: row[3] || null,
    season: row[4] || null,
    asOf: meta.asOf,
    source: meta.source,
    noteZh: meta.noteZh,
  };
}

/**
 * @param {string} name English player name from AF/ESPN
 * @param {{ club?: string, alt?: string, requireClub?: boolean, tmId?: number|string }} [opts]
 */
function lookupPlayer(name, opts = {}) {
  const idx = loadIndex();
  if (!idx) return { ok: false, reason: 'no_index' };

  // Transfermarkt id direct hit (when stored on squad card)
  if (opts.tmId != null && String(opts.tmId)) {
    const want = String(opts.tmId);
    for (const list of Object.values(idx.players)) {
      const hit = (list || []).find((r) => r && String(r[3]) === want);
      if (hit) {
        const out = rowToPlayer(hit, idx);
        if (out) return out;
      }
    }
  }

  const nameVariants = [];
  for (const raw of [name, opts.alt].filter(Boolean)) {
    const cleaned = stripNameJunk(raw);
    if (cleaned) nameVariants.push(cleaned);
    const n0 = norm(cleaned || raw);
    if (n0) nameVariants.push(n0);
  }
  const seenK = new Set();
  const candidates = [];
  for (const n of nameVariants) {
    const k = norm(n);
    if (!k || seenK.has(k)) continue;
    seenK.add(k);
    if (idx.players[k]) candidates.push(...idx.players[k]);
  }

  const requireClub = !!opts.requireClub;
  // Exact / full-name hits: club hint preferred; requireClub only when caller asks
  let row = pickPlayerRow(candidates, opts.club, { requireClub });

  const primary = stripNameJunk(name || '') || String(name || '');
  const parts = norm(primary).split(' ').filter(Boolean);
  const isShort = parts.length >= 2 && parts[0].length <= 2;

  // Mononym stars indexed as a single token (e.g. "Alisson") while squad has "Alisson Becker"
  if (!row && parts.length >= 2 && parts[0].length >= 4 && idx.players[parts[0]]) {
    row = pickPlayerRow(idx.players[parts[0]], opts.club, { requireClub: true });
  }

  // First-name diminutive + last (Kostas Tsimikas ↔ Konstantinos Tsimikas)
  if (!row && parts.length >= 2 && parts[0].length > 2) {
    const last = parts[parts.length - 1];
    for (const altFirst of expandFirstName(parts[0])) {
      if (altFirst === parts[0]) continue;
      const ak = norm(`${altFirst} ${last}`);
      if (ak && idx.players[ak]) {
        row = pickPlayerRow(idx.players[ak], opts.club, { requireClub });
        if (row) break;
      }
    }
  }

  // Also treat "First Last" misses via last-name + club (hyphen / middle-name drift)
  if (!row && parts.length >= 1) {
    const last = parts[parts.length - 1];
    if (last && last.length >= 3 && idx.lastNames.has(last)) {
      let list = idx.lastNames.get(last);
      if (isShort) {
        const initial = parts[0][0];
        list = list.filter((r) => norm(r[0]).startsWith(initial));
      } else if (parts.length >= 2 && parts[0].length > 2) {
        const initials = new Set(expandFirstName(parts[0]).map((f) => f[0]));
        initials.add(parts[0][0]);
        list = list.filter((r) => {
          const rp = norm(r[0]).split(' ').filter(Boolean);
          if (!rp.length) return false;
          if (initials.has(rp[0][0])) return true;
          // allow formal↔diminutive first token equality via alias set
          const want = new Set(expandFirstName(parts[0]));
          want.add(parts[0]);
          return want.has(rp[0]);
        });
      }
      // Prefer club; if unique tmId under last+initial, allow transfer drift
      row = pickPlayerRow(list, opts.club, { requireClub: true });
      if (!row && list && list.length) {
        const ids = new Set(list.map((r) => String(r[3] || r[0])));
        if (ids.size === 1) row = sortRows(list)[0];
        else if (!requireClub) row = pickPlayerRow(list, opts.club, { requireClub: false });
      }
    }
  }

  // Unique exact full-name (≥2 tokens, not initial-short): allow club drift (transfers)
  // only when a single distinct tmId exists under that key — high precision.
  if (!row && candidates.length && parts.length >= 2 && parts[0].length > 2) {
    const ids = new Set(candidates.map((r) => String(r[3] || r[0])));
    if (ids.size === 1) row = sortRows(candidates)[0];
  }

  const out = rowToPlayer(row, idx);
  return out || { ok: false, reason: 'not_found', noteZh: '暂无身价' };
}

/** Index rows currently tagged at clubHint (for squad-scoped matching). */
function rowsAtClub(clubHint) {
  const idx = loadIndex();
  if (!idx || !clubHint) return [];
  const out = [];
  const seen = new Set();
  for (const list of Object.values(idx.players)) {
    for (const row of list || []) {
      if (!clubMatches(row[2], clubHint)) continue;
      const id = String(row[3] || row[0]);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

/**
 * Match a squad card name against players indexed at this club (last-name / initial).
 * High precision: only returns a row that clubMatches clubHint.
 */
function matchInClubRoster(name, clubHint, clubRows) {
  const idx = loadIndex();
  if (!idx || !clubHint) return null;
  const rows = clubRows || rowsAtClub(clubHint);
  if (!rows.length) return null;
  const cleaned = stripNameJunk(name || '');
  const k = norm(cleaned);
  if (!k) return null;
  // exact full name at club
  const exact = rows.filter((r) => norm(r[0]) === k);
  if (exact.length) return sortRows(exact)[0];
  const parts = k.split(' ').filter(Boolean);
  if (!parts.length) return null;

  // Mononym index row ("Alisson") ↔ squad "Alisson Becker" / "Alisson Ramses Becker"
  if (parts.length >= 2 && parts[0].length >= 4) {
    const mono = rows.filter((r) => {
      const rp = norm(r[0]).split(' ').filter(Boolean);
      return rp.length === 1 && rp[0] === parts[0];
    });
    if (mono.length === 1) return sortRows(mono)[0];
    if (mono.length > 1) return sortRows(mono)[0];
  }

  const last = parts[parts.length - 1];
  if (last.length < 3) return null;
  let cand = rows.filter((r) => {
    const rp = norm(r[0]).split(' ').filter(Boolean);
    return rp.length && rp[rp.length - 1] === last;
  });
  if (parts.length >= 2) {
    const wantFirst = new Set(expandFirstName(parts[0]));
    wantFirst.add(parts[0]);
    const initial = parts[0][0];
    const narrowed = cand.filter((r) => {
      const rp = norm(r[0]).split(' ').filter(Boolean);
      if (!rp.length) return false;
      if (wantFirst.has(rp[0])) return true;
      if (rp[0][0] === initial) return true;
      return false;
    });
    if (narrowed.length) cand = narrowed;
    else if (parts[0].length > 2) return null; // full first name disagreed
  }
  if (!cand.length) return null;
  if (cand.length > 1 && parts[0].length <= 2) {
    // ambiguous initial+last at same club — take highest value (rare)
  }
  return sortRows(cand)[0];
}

/**
 * Club squad market value (sum of snapshot player values at club).
 * @param {string} name English club name
 */
function lookupClub(name) {
  const idx = loadIndex();
  if (!idx) return { ok: false, reason: 'no_index' };
  const k = clubKey(name);
  let row = k ? idx.clubs[k] : null;
  if (!row && k) {
    // fuzzy: find club key containing / contained
    for (const [ck, cv] of Object.entries(idx.clubs)) {
      if (ck === k || ck.includes(k) || k.includes(ck)) {
        row = cv;
        break;
      }
    }
  }
  if (!row) return { ok: false, reason: 'not_found', noteZh: '暂无身价' };
  const fmt = formatEur(row[1]);
  if (!fmt) return { ok: false, reason: 'not_found', noteZh: '暂无身价' };
  return {
    ok: true,
    ...fmt,
    name: row[0],
    tmId: row[2] || null,
    squadSize: row[3] || null,
    competition: row[4] || '',
    season: row[5] || null,
    asOf: idx.asOf,
    source: idx.source,
    noteZh: idx.noteZh,
  };
}

/** Attach marketValue onto a player detail payload (mutates). */
function enrichPlayer(payload) {
  if (!payload || payload.ok === false) return payload;
  const en = payload.player || '';
  const zh = payload.playerZh || '';
  const mv = lookupPlayer(en || zh, {
    club: payload.team || '',
    alt: en && zh && en !== zh ? zh : undefined,
    tmId: payload.tmId || payload.transfermarktId || null,
  });
  payload.marketValue = mv.ok
    ? {
        ok: true,
        eur: mv.eur,
        labelZh: mv.labelZh,
        labelEuro: mv.labelEuro,
        text: mv.text,
        asOf: mv.asOf,
        club: mv.club,
        noteZh: mv.noteZh,
      }
    : { ok: false, text: '暂无身价', noteZh: mv.noteZh || '暂无身价' };
  return payload;
}


/** True when name's last(+first initial/alias) resolves to exactly pm.tmId in the index. */
function isUniqueLastNameIdentity(name, pm) {
  const idx = loadIndex();
  if (!idx || !pm || pm.tmId == null) return false;
  const parts = norm(stripNameJunk(name || '')).split(' ').filter(Boolean);
  if (!parts.length) return false;
  const last = parts[parts.length - 1];
  if (!last || last.length < 3 || !idx.lastNames.has(last)) return false;
  let list = idx.lastNames.get(last) || [];
  if (parts.length >= 2 && parts[0]) {
    const initials = new Set(expandFirstName(parts[0]).map((f) => f[0]));
    initials.add(parts[0][0]);
    const want = new Set(expandFirstName(parts[0]));
    want.add(parts[0]);
    list = list.filter((r) => {
      const rp = norm(r[0]).split(' ').filter(Boolean);
      if (!rp.length) return false;
      return initials.has(rp[0][0]) || want.has(rp[0]);
    });
  }
  const ids = new Set(list.map((r) => String(r[3] || r[0])));
  return ids.size === 1 && String(pm.tmId) === [...ids][0];
}

/** Attach marketValue (squad total) onto a team detail payload (mutates). */
function enrichTeam(payload) {
  if (!payload || payload.ok === false) return payload;
  const mv = lookupClub(payload.team || '');
  payload.marketValue = mv.ok
    ? {
        ok: true,
        eur: mv.eur,
        labelZh: mv.labelZh,
        labelEuro: mv.labelEuro,
        text: mv.text,
        asOf: mv.asOf,
        squadSize: mv.squadSize,
        noteZh: mv.noteZh,
      }
    : { ok: false, text: '暂无身价', noteZh: mv.noteZh || '暂无身价' };

  // Enrich squad cards when present, then rank by 身价 (unknowns at bottom).
  // Prefer club-scoped matches (precision); fall back to unique full-name (transfers).
  if (Array.isArray(payload.squad) && payload.squad.length) {
    const clubHint = payload.team || '';
    const clubRows = clubHint ? rowsAtClub(clubHint) : [];
    let hit = 0;
    for (const p of payload.squad) {
      const en = p.player || '';
      const zh = p.playerZh || '';
      const optsBase = {
        club: clubHint,
        alt: en && zh && en !== zh ? zh : undefined,
        tmId: p.tmId || p.transfermarktId || null,
      };
      let pm = lookupPlayer(en || zh, { ...optsBase, requireClub: true });
      if (!pm.ok) {
        const row = matchInClubRoster(en, clubHint, clubRows);
        pm = rowToPlayer(row, loadIndex()) || { ok: false };
      }
      if (!pm.ok) continue;
      if (!(Number(pm.eur) > 0)) continue;
      // Cross-club: allow only when last(+initial) maps to a single tmId (transfer drift).
      if (pm.club && clubHint && !clubMatches(pm.club, clubHint)) {
        if (!isUniqueLastNameIdentity(en || zh, pm)) continue;
      }
      p.marketValueEur = pm.eur;
      p.marketValueText = pm.text;
      p.marketValueZh = pm.labelZh;
      if (pm.tmId) p.tmId = pm.tmId;
      hit += 1;
    }
    rankSquadPlayers(payload.squad);
    const total = payload.squad.length;
    payload.squadMarketCoverage = {
      hit,
      total,
      pct: total ? Math.round((100 * hit) / total) : 0,
      noteZh: total ? `身价匹配 ${hit}/${total}（${Math.round((100 * hit) / total)}%）` : '',
    };
  }
  return payload;
}

/**
 * Sort squad in-place: known 身价 desc, then 暂无. Assign marketValueRank 1..n.
 * @returns {Array} same array
 */
function rankSquadPlayers(squad) {
  if (!Array.isArray(squad) || !squad.length) return squad || [];
  squad.sort((a, b) => {
    const ae = Number(a && a.marketValueEur);
    const be = Number(b && b.marketValueEur);
    const aOk = Number.isFinite(ae) && ae > 0;
    const bOk = Number.isFinite(be) && be > 0;
    if (aOk && bOk) return be - ae;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const an = String((a && (a.playerZh || a.player)) || '');
    const bn = String((b && (b.playerZh || b.player)) || '');
    return an.localeCompare(bn, 'zh');
  });
  squad.forEach((p, i) => { if (p) p.marketValueRank = i + 1; });
  return squad;
}

function status() {
  const idx = loadIndex();
  return {
    ok: !!idx,
    asOf: idx && idx.asOf,
    players: idx ? Object.keys(idx.players).length : 0,
    clubs: idx ? Object.keys(idx.clubs).length : 0,
    path: INDEX_PATH(),
    error: _loadErr ? _loadErr.message : null,
    noteZh: idx ? idx.noteZh : '身价索引未加载',
  };
}

module.exports = {
  formatEur,
  lookupPlayer,
  lookupClub,
  enrichPlayer,
  enrichTeam,
  rankSquadPlayers,
  rowsAtClub,
  matchInClubRoster,
  clubMatches,
  status,
  norm,
  stripNameJunk,
};
