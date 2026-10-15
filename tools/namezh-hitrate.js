#!/usr/bin/env node
/** Report Chinese-name hit rate for squads (local loadSquad). */
'use strict';
const { loadSquad, clearSquadMem } = require('../lib/squad');

const TEAMS = [
  ['180', '里尔'], ['401', '巴萨'], ['123', '国际米兰'], ['1', '阿森纳'],
  ['283', '加拉塔萨雷'], ['969', '北京国安'], ['2216', '上海海港'],
  ['225', '布鲁日'], ['744', '那不勒斯'], ['137', '拜仁'],
];

(async () => {
  clearSquadMem();
  let total = 0, zh = 0, okN = 0;
  for (const [id, name] of TEAMS) {
    const s = await loadSquad({ teamId: id, name });
    const players = s.players || [];
    const z = players.filter((p) => p.nameZh && /[\u4e00-\u9fff]/.test(p.nameZh)).length;
    total += players.length;
    zh += z;
    if (s.ok) okN++;
    const rate = players.length ? ((100 * z) / players.length).toFixed(0) + '%' : 'n/a';
    console.log(`${name.padEnd(8)} ok=${s.ok} src=${(s.source || '-').padEnd(12)} n=${String(players.length).padStart(2)} zh=${String(z).padStart(2)} (${rate}) ${s.error || ''}`);
  }
  console.log(`--- teams_ok=${okN}/${TEAMS.length} players=${total} withZh=${zh} hit=${total ? ((100 * zh) / total).toFixed(1) + '%' : 'n/a'}`);
})().catch((e) => { console.error(e); process.exit(1); });
