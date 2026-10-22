#!/usr/bin/env node
/**
 * Rebuild data/market-value/index.json.gz from transfermarkt-datasets zip.
 * Usage:
 *   node tools/build-market-value-index.js [/path/to/transfermarkt-datasets.zip]
 * Downloads from the public R2 mirror when zip path omitted.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'market-value');
const ZIP_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip';
const ALIASES = {
  'man city': 'manchester city',
  'manchester utd': 'manchester united',
  'man united': 'manchester united',
  'man utd': 'manchester united',
  spurs: 'tottenham hotspur',
  tottenham: 'tottenham hotspur',
  inter: 'inter milan',
  internazionale: 'inter milan',
  milan: 'ac milan',
  'atletico madrid': 'atletico de madrid',
  atleti: 'atletico de madrid',
  'bayern munchen': 'bayern munich',
  'fc bayern munchen': 'bayern munich',
  psg: 'paris saint germain',
  'paris saint-germain': 'paris saint germain',
  'paris sg': 'paris saint germain',
  wolves: 'wolverhampton wanderers',
  wolverhampton: 'wolverhampton wanderers',
  newcastle: 'newcastle united',
  'west ham': 'west ham united',
  brighton: 'brighton hove albion',
  'brighton and hove albion': 'brighton hove albion',
  'nottm forest': 'nottingham forest',
  nottingham: 'nottingham forest',
  leverkusen: 'bayer 04 leverkusen',
  'bayer leverkusen': 'bayer 04 leverkusen',
  'rb leipzig': 'rb leipzig',
  leipzig: 'rb leipzig',
  dortmund: 'borussia dortmund',
  gladbach: 'borussia monchengladbach',
  marseille: 'olympique marseille',
  lyon: 'olympique lyon',
  'olympique lyonnais': 'olympique lyon',
};

function norm(s) {
  let t = String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  t = t.toLowerCase().replace(/&/g, ' ').replace(/[^\w\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (const suf of [' fc', ' cf', ' afc', ' sc']) {
    if (t.endsWith(suf)) t = t.slice(0, -suf.length).trim();
  }
  return t;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = [];
  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (i === 0) { headers.push(...cols.map((h) => h.replace(/^"|"$/g, ''))); continue; }
    const obj = {};
    headers.forEach((h, j) => { obj[h] = cols[j] != null ? cols[j] : ''; });
    rows.push(obj);
  }
  return rows;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let zipPath = process.argv[2];
  if (!zipPath) {
    zipPath = path.join(OUT_DIR, 'transfermarkt-datasets.zip');
    if (!fs.existsSync(zipPath)) {
      console.log('Downloading', ZIP_URL);
      execSync(`curl -L --max-time 600 -o "${zipPath}" "${ZIP_URL}"`, { stdio: 'inherit' });
    }
  }
  const tmp = path.join(OUT_DIR, '_extract');
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`unzip -o "${zipPath}" players.csv.gz clubs.csv.gz -d "${tmp}"`, { stdio: 'inherit' });
  execSync(`gunzip -kf "${path.join(tmp, 'players.csv.gz')}" "${path.join(tmp, 'clubs.csv.gz')}"`);
  const players = parseCsv(fs.readFileSync(path.join(tmp, 'players.csv'), 'utf8'));
  const clubsCsv = parseCsv(fs.readFileSync(path.join(tmp, 'clubs.csv'), 'utf8'));

  const byClub = new Map();
  const idxPlayers = {};
  for (const r of players) {
    const mv = r.market_value_in_eur;
    if (!mv) continue;
    const v = Number(mv);
    if (!Number.isFinite(v) || v <= 0) continue;
    const ls = Number(r.last_season || 0);
    if (ls < 2023) continue;
    const entry = [r.name, v, r.current_club_name || '', Number(r.player_id), ls];
    const k = norm(r.name);
    (idxPlayers[k] = idxPlayers[k] || []).push(entry);
    if (r.current_club_id) {
      if (!byClub.has(r.current_club_id)) byClub.set(r.current_club_id, []);
      byClub.get(r.current_club_id).push({ v, ls });
    }
  }
  for (const k of Object.keys(idxPlayers)) {
    idxPlayers[k].sort((a, b) => b[1] - a[1] || b[4] - a[4]);
    idxPlayers[k] = idxPlayers[k].slice(0, 4);
  }

  const idxClubs = {};
  for (const r of clubsCsv) {
    const members = byClub.get(r.club_id) || [];
    if (!members.length) continue;
    const maxLs = Math.max(...members.map((m) => m.ls));
    const cohort = members.filter((m) => m.ls === maxLs);
    const total = cohort.reduce((s, m) => s + m.v, 0);
    const row = [r.name, total, Number(r.club_id), cohort.length, r.domestic_competition_id || '', maxLs];
    const k = norm(r.name);
    if (!idxClubs[k] || total > idxClubs[k][1]) idxClubs[k] = row;
  }

  const out = {
    source: 'transfermarkt-datasets',
    licenseNote: 'Community dataset derived from Transfermarkt; for reference only.',
    asOf: '2026-06',
    builtAt: new Date().toISOString(),
    noteZh: '参考市值，来自公开转会市值数据集（约至 2026-06）；数值变化较慢，非实时报价。',
    players: idxPlayers,
    clubs: idxClubs,
    aliases: ALIASES,
  };
  const gz = path.join(OUT_DIR, 'index.json.gz');
  fs.writeFileSync(gz, zlib.gzipSync(Buffer.from(JSON.stringify(out), 'utf8'), { level: 9 }));
  console.log('Wrote', gz, 'players', Object.keys(idxPlayers).length, 'clubs', Object.keys(idxClubs).length);
  // cleanup extract
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
