/**
 * Off-main-thread rebuild of the name-fold → photo URL map.
 * Opened as a worker_threads Worker from lib/player-match-db.js so the
 * giant GROUP BY on player_match_stats never blocks the HTTP event loop.
 * Cache contains only folded names and photo URLs — never tokens.
 */
'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PHOTO_URL_SQL =
  "(photo LIKE 'https://cdn.sportmonks.com/images/soccer/players/%' OR photo LIKE 'https://media.api-sports.io/football/players/%') AND photo NOT LIKE '%placeholder%' AND photo NOT LIKE '%/0.png%'";

function foldPlayerName(s) {
  return String(s || '').replace(/[ıİ]/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function usableFoldPhoto(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (!/^https:\/\/(cdn\.sportmonks\.com\/images\/soccer\/players\/|media\.api-sports\.io\/football\/players\/)/i.test(u)) return '';
  if (/placeholder/i.test(u) || /\/0\.png/i.test(u)) return '';
  return u;
}

function buildMap(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 10000');
    const rows = db.prepare(`SELECT name_en, photo, COUNT(*) AS n
      FROM player_match_stats
      WHERE ${PHOTO_URL_SQL}
      GROUP BY name_en, photo
      ORDER BY n DESC`).all();
    const all = Object.create(null);
    for (const row of rows || []) {
      const url = usableFoldPhoto(row && row.photo);
      if (!url) continue;
      const key = foldPlayerName(row.name_en);
      if (!key) continue;
      const isSm = /cdn\.sportmonks\.com/i.test(url);
      if (!Object.prototype.hasOwnProperty.call(all, key)) all[key] = url;
      else if (isSm && !/cdn\.sportmonks\.com/i.test(all[key])) all[key] = url;
    }
    return all;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

function writeCache(file, map) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const payload = {
    builtAt: Date.now(),
    count: Object.keys(map).length,
    map,
  };
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
}

try {
  const dbPath = workerData && workerData.dbPath;
  const cacheFile = workerData && workerData.cacheFile;
  if (!dbPath || !cacheFile) throw new Error('missing workerData');
  const map = buildMap(dbPath);
  writeCache(cacheFile, map);
  parentPort.postMessage({ ok: true, count: Object.keys(map).length });
} catch (e) {
  try {
    parentPort.postMessage({ ok: false, error: e && e.message ? e.message : 'fold rebuild failed' });
  } catch { /* ignore */ }
}
