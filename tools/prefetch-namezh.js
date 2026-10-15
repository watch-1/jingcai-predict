#!/usr/bin/env node
/**
 * Prefetch Chinese player names via Wikidata into data/squads/_namezh.json.
 * Run on a machine that can reach Wikidata (this box). Sync JSON to the China server.
 *
 * Usage:
 *   node tools/prefetch-namezh.js              # hot teams (Big 5 + UCL regulars)
 *   node tools/prefetch-namezh.js --all-mapped # all teams in _idmap.json + extras
 *   node tools/prefetch-namezh.js --team 133739
 *   node tools/prefetch-namezh.js --names-file /path/list.txt
 *   node tools/prefetch-namezh.js --schedule-url http://127.0.0.1:8088
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { zhLabel } = require('../lib/wikidata-zh');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const OUT = path.join(DATA, 'squads', '_namezh.json');
const KEY = process.env.THESPORTSDB_KEY || '123';
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'JingcaiPredict/1.8 (prefetch-namezh)' } });
  const text = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  if (text.trim().startsWith('<')) throw new Error('rate_limited');
  return JSON.parse(text);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function hasCjk(s) { return /[\u4e00-\u9fff]/.test(s || ''); }

// Correct TheSportsDB club ids (verified 2026-10)
const HOT_TSDB = [
  // EPL
  '133604', '133601', '133610', '133602', '133613', '133612', '133616', '134777',
  '133615', '133600', '133632', '134301', '134355', '133636', '133635', '133622',
  // Serie A
  '133681', '133667', '133676', '133670', '133682', '133668', '134782', '133674',
  '133687', '134781', '133679', '133701',
  // La Liga
  '133739', '133738', /* Barca, Real — Atlético is 133729 on TSDB */
  '133729', '133740', '133735', '133725', '133728',
  // Bundesliga
  '133664', '133650', '133666', '134695', '133653', '133660', '134779', '134690',
  // Ligue 1 (Lille=133711, Lyon=133713, Nice=133712, Monaco=133823, Marseille=133707, Lens=133822, PSG=133714)
  '133714', '133711', '133713', '133712', '133823', '133707', '133822',
  // UCL / others
  '133789', '133768', '135708', '133804', '133599', '134635', '134640',
];

const EXTRAS = {
  '133738': 'Real Madrid', '133739': 'Barcelona', '133729': 'Atletico Madrid',
  '133714': 'Paris SG', '133789': 'Club Brugge', '133711': 'Lille',
  '133713': 'Lyon', '133707': 'Marseille', '133823': 'Monaco', '133712': 'Nice',
  '133822': 'Lens', '134695': 'RB Leipzig', '133768': 'PSV Eindhoven',
  '133681': 'Inter Milan', '133667': 'AC Milan', '133676': 'Juventus',
  '133670': 'Napoli', '133682': 'Roma', '133664': 'Bayern Munich',
  '133650': 'Borussia Dortmund', '133602': 'Liverpool', '133613': 'Manchester City',
  '133804': 'Galatasaray', '134635': 'Beijing Guoan', '134640': 'Shanghai Port',
  '133604': 'Arsenal',
};

function teamList(mode, onlyId) {
  if (onlyId) {
    const idPart = String(onlyId).split(':')[0];
    const nameHint = String(onlyId).includes(':') ? String(onlyId).slice(String(onlyId).indexOf(':') + 1) : '';
    const idmap = readJson(path.join(DATA, 'squads', '_idmap.json'), {});
    let name = nameHint;
    for (const v of Object.values(idmap)) {
      if (String(v.idTeam) === idPart) { name = name || v.strTeam || ''; break; }
    }
    name = name || EXTRAS[idPart] || ('team-' + idPart);
    return [{ idTeam: idPart, name, league: '' }];
  }
  const idmap = readJson(path.join(DATA, 'squads', '_idmap.json'), {});
  const byId = new Map();
  for (const [sid, v] of Object.entries(idmap)) {
    if (!v?.idTeam) continue;
    byId.set(String(v.idTeam), { idTeam: String(v.idTeam), name: v.strTeam || '', league: v.strLeague || '', sportteryId: sid });
  }
  for (const [id, name] of Object.entries(EXTRAS)) {
    if (!byId.has(id)) byId.set(id, { idTeam: id, name, league: '', sportteryId: '' });
  }
  if (mode === 'all') return [...byId.values()];
  const hot = new Set(HOT_TSDB);
  return [...byId.values()].filter((t) => hot.has(t.idTeam));
}

async function playersForTeam(idTeam) {
  const j = await fetchJson(BASE + '/lookup_all_players.php?id=' + encodeURIComponent(idTeam));
  return (j.player || []).filter((p) => p.strPlayer && !/manager|coach/i.test(p.strPosition || ''));
}

async function resolveZh(name, alt, team) {
  const zh = await Promise.race([
    zhLabel(name, { alt: alt || '', team: team || '' }),
    new Promise((r) => setTimeout(() => r(''), 5000)),
  ]);
  if (!hasCjk(zh)) return '';
  const tokens = String(name).trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && zh.length <= 2) return '';
  return zh;
}

function putMap(map, id, name, alt, zh) {
  if (id) map[id] = zh;
  if (name) map[name] = zh;
  if (alt && alt !== name) map[alt] = zh;
  // also index last token for AF short names
  const parts = String(name || '').replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const sur = parts[parts.length - 1];
    if (sur.length > 2 && !map[sur]) map[sur] = zh;
  }
}

async function prefetchNameList(names, teamHint, map) {
  let resolved = 0, skipped = 0, failed = 0;
  for (const item of names) {
    const name = typeof item === 'string' ? item : item.name;
    const alt = typeof item === 'string' ? '' : (item.alt || '');
    const id = typeof item === 'string' ? '' : String(item.id || '');
    if (!name) continue;
    if ((id && hasCjk(map[id])) || hasCjk(map[name])) {
      skipped++;
      const zh = map[id] || map[name];
      putMap(map, id, name, alt, zh);
      continue;
    }
    try {
      const zh = await resolveZh(name, alt, teamHint || '');
      if (zh) {
        putMap(map, id, name, alt, zh);
        resolved++;
        process.stdout.write(`  + ${name} → ${zh}\n`);
      } else {
        process.stdout.write(`  · ${name} (no zh)\n`);
      }
    } catch (e) {
      failed++;
      process.stdout.write(`  ! ${name} ${e.message}\n`);
    }
    await sleep(120);
  }
  return { resolved, skipped, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--all-mapped') ? 'all' : 'hot';
  const teamIdx = args.indexOf('--team');
  const onlyId = teamIdx >= 0 ? args[teamIdx + 1] : null;
  const namesIdx = args.indexOf('--names-file');
  const namesFile = namesIdx >= 0 ? args[namesIdx + 1] : null;
  const schedIdx = args.indexOf('--schedule-url');
  const scheduleUrl = schedIdx >= 0 ? args[schedIdx + 1] : null;

  const map = readJson(OUT, {});
  let fetched = 0, resolved = 0, skipped = 0, failed = 0;

  if (namesFile) {
    const lines = fs.readFileSync(namesFile, 'utf8').split(/\n/).map((l) => l.trim()).filter(Boolean);
    console.log(`[prefetch-namezh] names-file=${namesFile} n=${lines.length}`);
    const r = await prefetchNameList(lines, '', map);
    resolved += r.resolved; skipped += r.skipped; failed += r.failed;
    writeJson(OUT, map);
  }

  let teams = onlyId || (!namesFile && !scheduleUrl) || args.includes('--hot') || mode
    ? teamList(mode, onlyId)
    : [];
  if (namesFile && !onlyId && !args.includes('--hot') && !args.includes('--all-mapped')) {
    teams = []; // names-only unless also asked for teams
  }
  // default: always do hot teams unless names-file-only
  if (!onlyId && !namesFile && !scheduleUrl) teams = teamList(mode, null);
  if (args.includes('--all-mapped')) teams = teamList('all', null);

  // Schedule: resolve sporttery → idmap → TSDB players
  if (scheduleUrl) {
    try {
      const j = await fetchJson(scheduleUrl.replace(/\/$/, '') + '/api/schedule');
      let rows = j.data || j.matches || j.list || [];
      const idmap = readJson(path.join(DATA, 'squads', '_idmap.json'), {});
      const want = new Set();
      for (const m of rows) {
        for (const sid of [m.homeTeamId, m.awayTeamId]) {
          if (sid && idmap[String(sid)]?.idTeam) want.add(String(idmap[String(sid)].idTeam));
        }
      }
      const extraTeams = [...want].map((idTeam) => {
        const hit = [...Object.values(idmap)].find((v) => String(v.idTeam) === idTeam);
        return { idTeam, name: (hit && hit.strTeam) || EXTRAS[idTeam] || idTeam, league: '' };
      });
      console.log(`[schedule] unique TSDB teams=${extraTeams.length}`);
      const have = new Set(teams.map((t) => t.idTeam));
      for (const t of extraTeams) if (!have.has(t.idTeam)) teams.push(t);
    } catch (e) {
      console.warn('[schedule-fail]', e.message);
    }
  }

  console.log(`[prefetch-namezh] teams=${teams.length} mode=${onlyId ? 'one' : mode} out=${OUT} existing=${Object.keys(map).length}`);

  for (const t of teams) {
    let players;
    try {
      players = await playersForTeam(t.idTeam);
      await sleep(250);
    } catch (e) {
      console.warn('[team-fail]', t.idTeam, t.name, e.message);
      failed++;
      await sleep(800);
      continue;
    }
    console.log(`[team] ${t.name || t.idTeam} (${t.idTeam}) players=${players.length}`);
    fetched += players.length;
    const r = await prefetchNameList(players.map((p) => ({
      id: String(p.idPlayer || ''),
      name: p.strPlayer || '',
      alt: p.strPlayerAlternate || '',
    })), t.name, map);
    resolved += r.resolved; skipped += r.skipped; failed += r.failed;
    writeJson(OUT, map);
  }
  writeJson(OUT, map);
  const cjkKeys = Object.values(map).filter(hasCjk).length;
  console.log(`[done] fetchedPlayers=${fetched} newlyResolved=${resolved} skippedCached=${skipped} fails=${failed} mapKeys=${Object.keys(map).length} cjkValues≈${cjkKeys}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
