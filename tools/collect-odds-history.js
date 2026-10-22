// 1.9.98: backfill opening→closing odds history for data/history/results.jsonl (resumable).
'use strict';
const fs = require('fs'); const path = require('path');
const { DATA_DIR } = require('../lib/db');
const om = require('../lib/odds-movement');
const OUT = path.join(DATA_DIR, 'history', 'odds-history.jsonl');
(async () => {
  const done = new Set();
  try { for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) if (l) done.add(String(JSON.parse(l).matchId)); } catch (_) {}
  const rows = fs.readFileSync(path.join(DATA_DIR, 'history', 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const todo = rows.filter(r => !done.has(String(r.matchId)));
  console.log('todo', todo.length, 'done', done.size);
  let i = 0, ok = 0;
  const CONC = Number(process.env.CONC || 6);
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const r = todo[idx++]; i++;
      try {
        const h = await om.fetchHistory(r.matchId);
        if (h) { fs.appendFileSync(OUT, JSON.stringify({ matchId: r.matchId, had: h.had, hhad: h.hhad }) + '\n'); ok++; }
      } catch (e) { if (i % 50 === 0) console.log('err', e.message); }
      if (i % 200 === 0) console.log(i, ok);
      await new Promise(s => setTimeout(s, 150));
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('DONE', i, ok);
})();
