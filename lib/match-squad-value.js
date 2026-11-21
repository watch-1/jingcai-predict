/**
 * 2.1.5 — match-detail squad market value (双方阵容身价).
 * Totals are summed from the current public squad, never a club total
 * pasted onto a national team. Missing values stay unlabeled.
 */
'use strict';

const mv = require('./market-value');
const { clubDisplayZh } = require('./club-zh');

const POS_GROUPS = [
  { key: 'GK', label: '门将' },
  { key: 'DF', label: '后卫' },
  { key: 'MF', label: '中场' },
  { key: 'FW', label: '前锋' },
];

const INTL_RE = /欧国联|欧洲杯|欧锦赛|世界杯|国际赛|国家队|友谊赛|预选|亚洲杯|非洲杯|美洲杯|金杯|奥运|亚运|世预赛|亚预赛|欧预赛|女足|Nations League|World Cup|\bEuro\b|Copa Am[eé]rica|AFCON|Olympic/i;

const CACHE_MS = 15 * 60 * 1000;
const mem = new Map();

function isInternationalMatch(m) {
  if (!m) return false;
  const lg = [m.league, m.leagueZh, m.comp, m.tournament, m.leagueName].filter(Boolean).join(' ');
  return INTL_RE.test(lg);
}

function posGroup(pos, posZhText) {
  const p = String(pos || '').toUpperCase().trim();
  if (p === 'G' || p === 'GK' || p === '1' || p === '24') return 'GK';
  if (/^(D|DF|CB|LB|RB|LWB|RWB|WB|SW|CD|25)$/.test(p)) return 'DF';
  if (/^(M|MF|CM|DM|AM|LM|RM|26)$/.test(p)) return 'MF';
  if (/^(F|FW|ST|CF|LW|RW|SS|27)$/.test(p)) return 'FW';
  const id = Number(pos);
  if (id === 24) return 'GK';
  if (id === 25) return 'DF';
  if (id === 26) return 'MF';
  if (id === 27) return 'FW';
  const s = `${pos || ''} ${posZhText || ''}`.toLowerCase();
  if (/守门|门将|goalkeeper|\bgk\b|\bgoalie\b/.test(s)) return 'GK';
  if (/后卫|中卫|边卫|翼卫|defender|centre-?back|center back|full-?back|wing-?back/.test(s)) return 'DF';
  if (/中场|后腰|前腰|边前卫|midfield/.test(s)) return 'MF';
  if (/前锋|中锋|边锋|forward|attacker|striker|winger/.test(s)) return 'FW';
  return 'UNK';
}

function groupLabel(key) {
  const g = POS_GROUPS.find((x) => x.key === key);
  return g ? g.label : '其他';
}

function emptySide(nameZh, nameEn, noteZh) {
  const st = mv.status();
  return {
    ok: false,
    source: 'none',
    nameZh: nameZh || '',
    nameEn: nameEn || '',
    totalEur: 0,
    totalZh: '暂无',
    totalText: '暂无身价',
    asOf: st.asOf || '',
    coverage: { hit: 0, total: 0, pct: 0, noteZh: noteZh || '暂无身价' },
    byPos: null,
    players: [],
    noteZh: noteZh || '暂无身价',
  };
}

function mapPlayers(squad) {
  return (squad || []).map((p, i) => {
    const eur = Number(p.marketValueEur);
    const ok = Number.isFinite(eur) && eur > 0;
    const grp = p.posGroup || posGroup(p.position, p.positionZh);
    const espnId = p.espnId || '';
    const tmId = p.tmId || '';
    // Only keep a real photo URL. Do not invent ESPN/TM paths — national
    // roster IDs often 404, and SM image_path is the app's real headshot.
    const photo = usablePhoto(p.photo || p.image || p.headshot);
    return {
      name: p.name || p.player || '',
      nameZh: p.nameZh || p.playerZh || p.name || p.player || '',
      pos: p.position || '',
      posZh: p.positionZh || '',
      posGroup: grp,
      posLabel: groupLabel(grp),
      club: clubDisplayZh(p.mvClub || p.team || p.club || ''),
      number: p.number || p.jersey || '',
      photo,
      id: p.id || espnId || p.afId || '',
      espnId,
      tmId,
      eur: ok ? eur : 0,
      text: ok ? (p.marketValueZh || p.marketValueText || '') : '暂无',
      unmatched: !ok,
      rank: p.marketValueRank || (i + 1),
    };
  });
}

function splitByPos(players) {
  const out = {};
  let any = false;
  for (const g of POS_GROUPS) {
    const grp = (players || []).filter((p) => p.posGroup === g.key);
    const valued = grp.filter((p) => Number(p.eur) > 0);
    const eur = valued.reduce((s, p) => s + Number(p.eur), 0);
    const fmt = eur > 0 ? mv.formatEur(eur) : null;
    if (valued.length) any = true;
    out[g.key] = {
      key: g.key,
      label: g.label,
      eur,
      text: fmt ? fmt.labelZh : '暂无',
      n: grp.length,
      hit: valued.length,
    };
  }
  return any ? out : null;
}


const NT_LEAGUES = ['uefa.nations', 'fifa.world', 'uefa.euro', 'conmebol.america', 'caf.nations'];
const NT_INDEX_TTL = 7 * 864e5;
const NT_ROSTER_TTL = 12 * 3600e3;
let ntIndexMem = null;

function foldName(s) {
  // Turkish dotless ı does not decompose under NFD, so Bayındır ≠ Bayindir
  // unless we map it first. Also expose a spaceless form for "Emir Han" vs "Emirhan".
  return String(s || '').replace(/[ıİ]/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function foldNameCompact(s) {
  return foldName(s).replace(/ /g, '');
}


function usablePhoto(url) {
  const s = String(url || '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return '';
  try {
    const logo = require('./logo-proxy');
    if (logo.isPlaceholderPhoto(s)) return '';
    const u = new URL(s);
    if (typeof logo.isAllowedPlayerPhoto === 'function' && !logo.isAllowedPlayerPhoto(u)) return '';
  } catch {
    return '';
  }
  return s;
}

function photoIndexFile() {
  const path = require('path');
  const { DATA_DIR } = require('./db');
  return path.join(DATA_DIR, 'live-stats', 'sm', 'player-photos.json');
}

let photoIndexMem = null;
function loadPhotoIndex() {
  if (photoIndexMem) return photoIndexMem;
  const fs = require('fs');
  const map = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(photoIndexFile(), 'utf8'));
    const rows = (j && j.byName) || j || {};
    for (const [k, v] of Object.entries(rows)) {
      const url = usablePhoto(v);
      if (url) map.set(foldName(k), url);
    }
  } catch {}
  photoIndexMem = map;
  return map;
}

function addDbPhotos(map, names) {
  try {
    const db = require('./player-match-db');
    if (typeof db.beginPhotoFoldWarm === 'function') db.beginPhotoFoldWarm();
    const found = db.latestSmPhotosByNames(names) || {};
    for (const [k, v] of Object.entries(found)) {
      const url = usablePhoto(v);
      if (url) {
        const key = foldName(k);
        if (key && !map.has(key)) map.set(key, url);
      }
    }
    // Also index every folded SM/api-sports photo so unique last-name +
    // initial can resolve ESPN spellings (Nayair vs Nair, Charis vs Charalampos).
    const all = db.latestSmPhotosByNames._foldAll;
    if (all) {
      for (const [k, v] of all) {
        const url = usablePhoto(v);
        if (url && k && !map.has(k)) map.set(k, url);
      }
    }
  } catch {}
}

function pickFromIndex(map, name) {
  const k = foldName(name);
  if (!k) return '';
  if (map.has(k)) return map.get(k);
  const compact = k.replace(/ /g, '');
  if (compact) {
    const chits = [];
    for (const [nk, url] of map) {
      if (nk.replace(/ /g, '') === compact) chits.push(url);
    }
    const cuniq = [...new Set(chits)];
    if (cuniq.length === 1) return cuniq[0];
  }
  const parts = k.split(' ').filter(Boolean);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1];
  const ini = parts[0][0];
  const hits = [];
  for (const [nk, url] of map) {
    const np = nk.split(' ').filter(Boolean);
    if (np.length >= 2 && np[np.length - 1] === last && np[0][0] === ini) hits.push(url);
  }
  const uniq = [...new Set(hits)];
  return uniq.length === 1 ? uniq[0] : '';
}

function readSmSurfacePhotos(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return [];
  try {
    const fs = require('fs');
    const path = require('path');
    const { DATA_DIR } = require('./db');
    const file = path.join(DATA_DIR, 'sm-surface', `${id}.json`);
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lists = [];
    for (const bag of [pack && pack.players, pack && pack.livePlayers]) {
      if (!bag) continue;
      lists.push(bag.home || [], bag.away || []);
    }
    return lists;
  } catch {
    return [];
  }
}

function attachPhotos(players, extraLists) {
  const list = players || [];
  const map = new Map(loadPhotoIndex());
  addDbPhotos(map, list.map((p) => p && p.name).filter(Boolean));
  for (const extra of extraLists || []) {
    for (const p of extra || []) {
      const url = usablePhoto((p && (p.image || p.photo)) || '');
      const name = p && p.name;
      if (url && name) {
        const key = foldName(name);
        if (key) map.set(key, url);
      }
    }
  }
  for (const p of list) {
    if (!p) continue;
    p.photo = usablePhoto(p.photo) || pickFromIndex(map, p.name) || '';
  }
  return list;
}

function wantedEnglish(nameZh, nameEn) {
  const en = String(nameEn || '').trim();
  if (en && !/[\u4e00-\u9fff]/.test(en)) return en;
  try { return require('./i18n-football').natEn(nameZh || nameEn) || en; } catch { return en; }
}

function isClubNameForNational(gotEn, wantEn) {
  const g = foldName(gotEn);
  const w = foldName(wantEn);
  if (!w || !g) return false;
  if (g === w || g === w + ' national team' || g === 'national team ' + w) return false;
  // "England" must not resolve to "New England Revolution"
  if (g !== w && g.split(' ').includes(w)) return true;
  return false;
}

function packUsable(pack, { national, nameEn, nameZh }) {
  if (!pack || !Array.isArray(pack.players) || !pack.players.length) return false;
  if (!national) return true;
  const want = wantedEnglish(nameZh, nameEn);
  if (isClubNameForNational(pack.nameEn || '', want)) return false;
  if (isClubNameForNational(pack.nameZh || '', want)) return false;
  return true;
}

function espnAthleteToPlayer(a) {
  const { posZh } = require('./i18n-football');
  const position = a.position || '';
  return {
    id: 'espn:' + a.id,
    name: a.name,
    nameAlt: '',
    number: a.jersey || '',
    position,
    positionZh: posZh(position),
    nationality: a.citizenship || '',
    photo: a.headshot && /^https?:\/\//.test(a.headshot) ? a.headshot : '',
    role: 'player',
    espnId: a.id,
    apps: a.apps, goals: a.goals, assists: a.assists,
    injured: a.injured || false,
  };
}

async function nationalTeamIndex() {
  if (ntIndexMem && Date.now() - ntIndexMem.at < NT_INDEX_TTL) return ntIndexMem.teams;
  const espn = require('./espn-form');
  const { DATA_DIR } = require('./db');
  const path = require('path');
  const fs = require('fs');
  const file = path.join(DATA_DIR, 'live-stats', 'espn', 'national-teams.json');
  try {
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (disk && Date.now() - disk.at < NT_INDEX_TTL && Array.isArray(disk.teams) && disk.teams.length) {
      ntIndexMem = disk;
      return disk.teams;
    }
  } catch {}
  const teams = [];
  const seen = new Set();
  for (const lg of NT_LEAGUES) {
    try {
      const j = await espn.getJson(`${espn.BASE}/${lg}/teams`);
      const arr = (((j.sports || [])[0] || {}).leagues || [])[0];
      for (const t of (arr && arr.teams) || []) {
        const tm = t.team || {};
        const id = String(tm.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        teams.push({
          id,
          league: lg,
          name: tm.displayName || tm.name || '',
          short: tm.shortDisplayName || '',
          abbr: tm.abbreviation || '',
        });
      }
    } catch (e) {
      console.warn('national team index', lg, e.message);
    }
  }
  if (teams.length) {
    ntIndexMem = { at: Date.now(), teams };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(ntIndexMem));
    } catch {}
  }
  return teams;
}

function nationalNameKeys(nameZh, nameEn) {
  const keys = new Set();
  const want = foldName(wantedEnglish(nameZh, nameEn));
  if (want) keys.add(want);
  try {
    const { NAT } = require('./i18n-football');
    const zh = String(nameZh || '').trim();
    if (zh) {
      for (const [en, z] of Object.entries(NAT)) {
        if (z === zh) keys.add(foldName(en));
      }
    }
  } catch {}
  return keys;
}

function resolveNationalTeam(teams, nameZh, nameEn) {
  const wants = nationalNameKeys(nameZh, nameEn);
  if (!wants.size) return null;
  const matchName = (n) => {
    if (!n) return false;
    if (wants.has(n) || wants.has(n + ' national team')) return true;
    return [...wants].some((w) => n === w + ' national team');
  };
  return (teams || []).find((t) => [t.name, t.short, t.abbr].map(foldName).some(matchName)) || null;
}

async function loadNationalSquad({ nameZh, nameEn }) {
  const espn = require('./espn-form');
  const teams = await nationalTeamIndex();
  const hit = resolveNationalTeam(teams, nameZh, nameEn);
  if (!hit) return null;
  const path = require('path');
  const fs = require('fs');
  const { DATA_DIR } = require('./db');
  const file = path.join(DATA_DIR, 'live-stats', 'espn', 'national-roster', `${hit.id}.json`);
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (disk && Date.now() - disk.at < NT_ROSTER_TTL && Array.isArray(disk.athletes) && disk.athletes.length) {
    const players = disk.athletes.map(espnAthleteToPlayer);
    try { require('./squad').applyNameZh(players); } catch {}
    return {
      ok: true,
      nameZh: nameZh || '',
      nameEn: disk.teamName || hit.name,
      players,
      playerCount: players.length,
      withPhoto: players.filter((p) => p.photo).length,
      source: 'espn-national',
      noteZh: '阵容来自公开国家队名单，含头像时一并显示。',
      fetchedAt: new Date(disk.at).toISOString(),
    };
  }
  try {
    const j = await espn.getJson(`${espn.BASE}/${hit.league}/teams/${hit.id}/roster`);
    const athletes = (j.athletes || []).map((a) => {
      const stat = {};
      for (const c of (((a.statistics || {}).splits || {}).categories || [])) {
        for (const st of c.stats || []) stat[st.name] = st.value;
      }
      return {
        id: String(a.id),
        name: a.displayName || a.fullName || '',
        jersey: a.jersey || '',
        position: (a.position && a.position.displayName) || '',
        citizenship: a.citizenship || '',
        headshot: (a.headshot && a.headshot.href) || '',
        injured: !!(a.injuries && a.injuries.length),
        apps: stat.appearances, goals: stat.totalGoals, assists: stat.goalAssists,
      };
    }).filter((a) => a.name);
    if (athletes.length) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ at: Date.now(), teamName: (j.team && j.team.displayName) || hit.name, athletes }));
      } catch {}
    }
    const players = athletes.map(espnAthleteToPlayer);
    try { require('./squad').applyNameZh(players); } catch {}
    return {
      ok: players.length > 0,
      nameZh: nameZh || '',
      nameEn: (j.team && j.team.displayName) || hit.name,
      players,
      playerCount: players.length,
      withPhoto: players.filter((p) => p.photo).length,
      source: 'espn-national',
      noteZh: '阵容来自公开国家队名单，含头像时一并显示。',
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('national roster', hit.id, e.message);
    if (disk && disk.athletes && disk.athletes.length) {
      const players = disk.athletes.map(espnAthleteToPlayer);
      try { require('./squad').applyNameZh(players); } catch {}
      return {
        ok: true, nameZh: nameZh || '', nameEn: disk.teamName || hit.name,
        players, source: 'espn-national', noteZh: '阵容来自缓存的国家队名单。',
      };
    }
    return null;
  }
}

async function tryLoadSquad(teamId, name) {
  try {
    return await require('./squad').loadSquad({ teamId, name });
  } catch (e) {
    return { ok: false, players: [], error: e.message };
  }
}

function squadSize(pack) {
  return (pack && Array.isArray(pack.players)) ? pack.players.length : 0;
}
function preferSquad(cand, cur, opts) {
  if (!packUsable(cand, opts)) return cur;
  if (!packUsable(cur, opts)) return cand;
  return squadSize(cand) > squadSize(cur) ? cand : cur;
}

async function sideValue({ teamId, nameZh, nameEn, national }) {
  const st = mv.status();
  const opts = { national, nameEn, nameZh };
  let squadPack = null;
  // National teams: prefer the published NT roster (ESPN) over a short
  // TheSportsDB / club-style fallback (Belgium was previously stuck at 10 names).
  if (national) {
    const nat = await loadNationalSquad({ nameZh, nameEn });
    if (packUsable(nat, opts)) squadPack = nat;
  }
  if (!packUsable(squadPack, opts) || (national && squadSize(squadPack) < 16)) {
    const first = await tryLoadSquad(teamId, nameZh || nameEn);
    squadPack = preferSquad(first, squadPack, opts);
  }
  if ((!packUsable(squadPack, opts) || (national && squadSize(squadPack) < 16)) && nameEn && nameEn !== nameZh) {
    const alt = await tryLoadSquad(teamId, nameEn);
    squadPack = preferSquad(alt, squadPack, opts);
  }
  if (!packUsable(squadPack, opts)) squadPack = { ok: false, players: [] };
  const players = (squadPack && Array.isArray(squadPack.players)) ? squadPack.players : [];
  const teamEn = (squadPack && squadPack.nameEn) || nameEn || '';

  if (players.length) {
    for (const p of players) {
      p.posGroup = posGroup(p.position, p.positionZh);
    }
    const coverage = mv.enrichSquadPlayers(players, teamEn, { national });
    const mapped = mapPlayers(players);
    attachPhotos(mapped);
    const valued = mapped.filter((p) => Number(p.eur) > 0);
    const total = valued.reduce((s, p) => s + Number(p.eur), 0);
    const fmt = total > 0 ? mv.formatEur(total) : null;
    return {
      ok: total > 0,
      source: 'squad-sum',
      nameZh: nameZh || (squadPack && squadPack.nameZh) || '',
      nameEn: teamEn,
      totalEur: total,
      totalZh: fmt ? fmt.labelZh : '暂无',
      totalText: fmt ? fmt.text : '暂无身价',
      asOf: st.asOf || '',
      coverage,
      byPos: splitByPos(mapped),
      players: mapped,
      noteZh: coverage.noteZh || '',
      squadNoteZh: (squadPack && squadPack.noteZh) || '',
    };
  }

  if (!national) {
    const club = mv.lookupClub(teamEn || nameEn || nameZh || '');
    if (club && club.ok) {
      return {
        ok: true,
        source: 'club-index',
        nameZh: nameZh || '',
        nameEn: club.name || teamEn,
        totalEur: club.eur,
        totalZh: club.labelZh,
        totalText: club.text,
        asOf: club.asOf || st.asOf || '',
        coverage: {
          hit: 0,
          total: club.squadSize || 0,
          pct: 0,
          noteZh: '暂无逐人名单，仅显示俱乐部总身价',
        },
        byPos: null,
        players: [],
        noteZh: '暂无逐人名单，仅显示俱乐部总身价',
      };
    }
  }

  return emptySide(nameZh, teamEn || nameEn, national ? '暂无国家队名单身价' : '暂无身价');
}

async function forMatch(m, { force } = {}) {
  const st = mv.status();
  if (!m) {
    return { ok: false, error: '缺少比赛', asOf: st.asOf || '', home: emptySide('', '', ''), away: emptySide('', '', '') };
  }
  const matchId = String(m.id || '');
  const key = matchId || [m.homeTeamId, m.awayTeamId, m.home, m.away].join('|');
  if (!force && key && mem.has(key)) {
    const hit = mem.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.payload;
  }
  const national = isInternationalMatch(m);
  const [home, away] = await Promise.all([
    sideValue({ teamId: m.homeTeamId, nameZh: m.home, nameEn: m.homeEn, national }),
    sideValue({ teamId: m.awayTeamId, nameZh: m.away, nameEn: m.awayEn, national }),
  ]);
  const smPhotos = readSmSurfacePhotos(matchId);
  if (smPhotos.length) {
    attachPhotos((home && home.players) || [], smPhotos);
    attachPhotos((away && away.players) || [], smPhotos);
  }
  const payload = {
    ok: !!(home.ok || away.ok),
    matchId,
    national,
    asOf: st.asOf || '',
    noteZh: st.noteZh || '参考市值，仅供参考。',
    sourceNoteZh: national
      ? '按当前公开名单加总，不等于本场十一人。'
      : '按当前公开名单加总，不等于本场十一人。',
    home,
    away,
  };
  if (key) mem.set(key, { at: Date.now(), payload });
  return payload;
}

module.exports = {
  POS_GROUPS,
  isInternationalMatch,
  posGroup,
  forMatch,
  sideValue,
  splitByPos,
  isClubNameForNational,
  foldName,
  wantedEnglish,
  resolveNationalTeam,
  usablePhoto,
  attachPhotos,
};
