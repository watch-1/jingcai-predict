// Audit: how many recent kicked-off jingcai matches map to an events fixture.
'use strict';
process.chdir(__dirname + '/..');
const http = require('http');
const live = require('../lib/live-stats');
const get = (p) => new Promise((res, rej) => http.get('http://127.0.0.1:8088' + p, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));
(async () => {
  const days = Number(process.argv[2] || 3);
  const [s, r] = await Promise.all([get('/api/schedule'), get('/api/results')]);
  const seen = new Map();
  for (const m of [...(s.data || []), ...(r.data || [])]) if (m && m.id && !seen.has(String(m.id))) seen.set(String(m.id), m);
  const now = Date.now();
  const rows = [...seen.values()].filter(m => {
    const ko = new Date(`${m.date}T${String(m.time || '12:00').slice(0, 5)}:00+08:00`).getTime();
    return ko <= now && ko >= now - days * 86400e3;
  });
  let ok = 0; const miss = [];
  for (const m of rows) {
    let res = null;
    try {
      res = await live.resolveFixture({ matchId: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, home: m.home, away: m.away, date: m.date, time: m.time, businessDate: m.businessDate });
    } catch (e) { miss.push(`${m.num} ${m.home}-${m.away} ERR ${e.message}`); continue; }
    if (res && res.fixtureId) {
      ok++;
      const meta = res.meta || {};
      if (process.argv.includes('-v')) console.log('OK ', m.num, m.home, '-', m.away, '=>', meta.homeEn, '-', meta.awayEn, res.fixtureId);
    } else miss.push(`${m.num} ${m.league} ${m.home}-${m.away} (${m.date} ${m.time})`);
  }
  console.log(JSON.stringify({ total: rows.length, mapped: ok, missing: miss.length }));
  for (const x of miss) console.log('MISS', x);
})();
