/**
 * Attach cached sidelined rows and a local official SM XI onto the
 * ESPN lineup payload. Reads existing packs only — no new SportMonks fetch.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sel = require('./lineup-select');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function applyNameZh(row) {
  if (!row) return row;
  try {
    const sq = require('./squad');
    if (!row.name) row.name = row.player_name || row.display_name || '';
    if (!row.nameAlt) {
      const alt = row.common_name || row.display_name || '';
      if (alt && alt !== row.name) row.nameAlt = alt;
    }
    const probe = {
      id: row.smId ? ('sm:' + row.smId) : (row.player_id ? ('sm:' + row.player_id) : (row.id || '')),
      smId: row.smId || row.player_id || '',
      afId: row.afId,
      name: row.name,
      nameAlt: row.nameAlt,
      nameZh: row.nameZh,
      nameZhSrc: row.nameZhSrc,
      nationality: row.nationality || row.nat || '',
    };
    // Same pipeline as 身价/六围: official _namezh.json first, then Wikidata / auto (flagged).
    sq.applyNameZh([probe]);
    if (probe.nameZh) {
      row.nameZh = probe.nameZh;
      if (probe.nameZhSrc) row.nameZhSrc = probe.nameZhSrc;
      else delete row.nameZhSrc;
    }
  } catch { /* keep source name */ }
  return row;
}

function reasonZh(reason) {
  const r = String(reason || '').trim();
  if (!r) return '';
  if (/red card|停赛|suspended/i.test(r)) return '停赛';
  if (/yellow/i.test(r)) return '黄牌停赛';
  if (/tibia|fracture|broken/i.test(r)) return '骨折';
  if (/muscle/i.test(r)) return '肌肉伤';
  if (/thigh|hamstring/i.test(r)) return '大腿/腘绳肌伤';
  if (/knee|acl|cruciate/i.test(r)) return '膝盖伤';
  if (/ankle/i.test(r)) return '脚踝伤';
  if (/calf/i.test(r)) return '小腿伤';
  if (/groin|hernia/i.test(r)) return /hernia/i.test(r) ? '疝气' : '腹股沟伤';
  if (/hip/i.test(r)) return '髋部伤';
  if (/shoulder/i.test(r)) return '肩部伤';
  if (/back/i.test(r)) return '背部伤';
  if (/illness|virus|flu|covid/i.test(r)) return '伤病/感冒';
  return r;
}

function participantLocation(p) {
  if (!p) return '';
  if (p.meta && p.meta.location) return p.meta.location;
  return p.location || '';
}

function sidelinedFromFixture(fx) {
  if (!fx || !Array.isArray(fx.sidelined) || !fx.sidelined.length) return null;
  const parts = fx.participants || [];
  const home = parts.find((p) => participantLocation(p) === 'home');
  const away = parts.find((p) => participantLocation(p) === 'away');
  const homeId = home && home.id;
  const awayId = away && away.id;
  const out = [];
  for (const row of fx.sidelined) {
    const pid = Number(row && row.participant_id);
    let side = '';
    if (homeId != null && pid === Number(homeId)) side = 'home';
    else if (awayId != null && pid === Number(awayId)) side = 'away';
    if (!side) continue;
    const pl = (row && row.player) || {};
    const typ = (row && row.type) || {};
    const raw = typ.name || typ.code || typ.developer_name || '';
    out.push(applyNameZh({
      side,
      name: pl.display_name || pl.name || pl.common_name || '',
      image: pl.image_path || '',
      photo: pl.image_path || '',
      reason: reasonZh(raw) || raw || '伤病',
      type: typ.code || typ.developer_name || '',
      smId: pl.id || row.player_id,
    }));
  }
  return out.length ? out : null;
}

function sidelinedFromSquad(matchId) {
  try {
    const src = require('./squad-source');
    const pack = src.readCache(String(matchId || ''));
    if (pack && Array.isArray(pack.sidelined) && pack.sidelined.length) {
      return pack.sidelined.map((s) => applyNameZh(Object.assign({}, s)));
    }
  } catch { /* miss */ }
  return null;
}

let _mapCache = { mtime: -1, map: null };
function matchMap() {
  const fp = path.join(dataDir(), 'sm-lineups', 'match-map.json');
  try {
    const st = fs.statSync(fp);
    if (_mapCache.map && _mapCache.mtime === st.mtimeMs) return _mapCache.map;
    const map = JSON.parse(fs.readFileSync(fp, 'utf8'));
    _mapCache = { mtime: st.mtimeMs, map };
    return map;
  } catch { return _mapCache.map || {}; }
}

function fidFromMap(m) {
  const mid = String((m && (m.id || m.matchId)) || '');
  if (!mid) return null;
  const rec = matchMap()['m:' + mid] || matchMap()[mid];
  return rec && rec.smFixtureId ? rec.smFixtureId : null;
}

function fidFromRadar(m) {
  if (!m) return null;
  try {
    const radar = require('./match-radar');
    const db = radar.openDb && radar.openDb();
    if (!db) return null;
    const row = db.prepare('SELECT fid FROM fixtures WHERE jc_match_id = ?').get(String(m.id || m.matchId || ''));
    return row && row.fid ? row.fid : null;
  } catch { return null; }
}

function readSmFixture(fid) {
  if (!fid) return null;
  const fp = path.join(dataDir(), 'sm-lineups', 'fixtures', String(fid) + '.json');
  try {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return (j && j.fixture) || j;
  } catch { return null; }
}

function sidesFromFixture(fx) {
  if (!fx || !Array.isArray(fx.lineups) || !fx.lineups.length) return null;
  const parts = fx.participants || [];
  const home = parts.find((p) => (p.meta && p.meta.location) === 'home' || p.location === 'home');
  const away = parts.find((p) => (p.meta && p.meta.location) === 'away' || p.location === 'away');
  const homeId = home && home.id;
  const awayId = away && away.id;
  const homeRows = fx.lineups.filter((lu) => Number(lu.team_id) === Number(homeId));
  const awayRows = fx.lineups.filter((lu) => Number(lu.team_id) === Number(awayId));
  if (!homeRows.length && !awayRows.length) return null;
  return { homeRows, awayRows, source: 'sportmonks-local' };
}

function attachToLineup(out, m) {
  let next = out && typeof out === 'object' ? out : { ok: true };
  const fid = fidFromMap(m) || fidFromRadar(m);
  const fx = readSmFixture(fid);
  const smPack = sidesFromFixture(fx);
  if (smPack) {
    next = sel.mergeLineupPack(next, smPack);
    for (const side of ['home', 'away']) {
      const bag = next[side];
      if (!bag) continue;
      (bag.starters || []).forEach(applyNameZh);
      (bag.bench || []).forEach(applyNameZh);
    }
    if (sel.hasXi(next.home) && sel.hasXi(next.away)) {
      const st = Number(fx && fx.state_id);
      if (st === 5) {
        next.state = 'final';
        next.noteZh = '本场首发以最新官方上阵为准。';
      } else if (st === 2 || st === 3 || st === 22) {
        next.state = 'live';
        next.noteZh = '本场首发以最新官方上阵为准。';
      } else {
        // NS packs often store an expected XI as type 11 before official confirmation.
        if (next.state === 'no-event' || next.state === 'final-nolineup' || next.state === 'pending' || !next.state) {
          next.state = 'announced';
        }
        next.noteZh = '官方首发尚未确认，以下为数据源当前阵容，公布后会更新。';
      }
      if (!next.source || next.source === 'espn') next.source = 'sportmonks';
    }
  }
  const sidelined = sidelinedFromFixture(fx) || sidelinedFromSquad(m && (m.id || m.matchId));
  if (sidelined && sidelined.length) next.sidelined = sidelined;
  else if (!Array.isArray(next.sidelined)) next.sidelined = next.sidelined || undefined;
  return next;
}

module.exports = { attachToLineup, sidelinedFromSquad, sidelinedFromFixture, sidesFromFixture, applyNameZh, fidFromMap };
