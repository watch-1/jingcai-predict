'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-alias-'));
process.env.DATA_DIR = dir;
delete process.env.SPORTMONKS_TOKEN;
delete process.env.SPORTMONKS_API_TOKEN;

const sq = require('../lib/squad-source');
const surface = require('../lib/predict-surface');
const pr = require('../lib/predict-report');

function dec(u) {
  return decodeURIComponent(String(u));
}

(async () => {
  assert.strictEqual(sq.pinnedSmId('Atlético Madrid'), 7980);
  assert.strictEqual(sq.pinnedSmId('马竞'), 7980);
  assert.strictEqual(sq.pinnedSmId('Bayern Munich'), 503);
  assert.strictEqual(sq.pinnedSmId('拜仁慕尼黑'), 503);
  assert.strictEqual(sq.pinnedSmId('Barcelona'), null);
  assert.strictEqual(sq.pinnedSmId('Aston Villa'), null);

  let n = 0;
  assert.strictEqual(await sq.resolveSm('x', 'Atlético Madrid', null, async () => { n += 1; return { data: [] }; }), 7980);
  assert.strictEqual(await sq.resolveSm('x', 'Bayern Munich', null, async () => { n += 1; return { data: [] }; }), 503);
  assert.strictEqual(n, 0, 'pinned clubs skip search');
  assert.strictEqual(await sq.resolveSm('bar', '巴塞罗那', 83, async () => { throw new Error('known id'); }), 83);

  const barCalls = [];
  assert.strictEqual(await sq.resolveSm('bar', '巴塞罗那', null, async (u) => {
    barCalls.push(dec(u));
    return { data: [{ id: 83, name: 'FC Barcelona' }] };
  }), 83);
  assert.strictEqual(barCalls.length, 1);
  assert.ok(barCalls[0].includes('Barcelona'));

  const villaCalls = [];
  assert.strictEqual(await sq.resolveSm('avl', 'Aston Villa', null, async (u) => {
    villaCalls.push(dec(u));
    return { data: [{ id: 14, name: 'Aston Villa' }] };
  }), 14);
  assert.strictEqual(villaCalls.length, 1);

  async function firstHit(name, accept) {
    const seen = [];
    const id = await sq.resolveSm('t-' + name, name, null, async (u) => {
      const path = dec(u);
      seen.push(path);
      const q = path.split('/teams/search/')[1] || '';
      if (accept(q)) return { data: [{ id: 77, name: q }] };
      return { data: [] };
    });
    assert.strictEqual(id, 77, name + ' → ' + seen.join(' | '));
    return seen;
  }

  const celta = await firstHit('Celta Vigo', q => q === 'Celta');
  assert.ok(celta[0].endsWith('/Celta Vigo'));
  const usg = await firstHit('Union Saint Gilloise', q => q === 'Union Saint-Gilloise');
  assert.ok(usg.some(u => u.includes('Union Saint-Gilloise')));
  await firstHit('FC Porto', q => q === 'Porto');
  await firstHit('AJ Auxerre', q => q === 'Auxerre');
  await firstHit('Vitória de Guimarães', q => /guimaraes/i.test(q));
  const omonia = await firstHit('奥莫尼亚', q => q === 'Omonia Nicosia');
  assert.ok(omonia.some(u => u.includes('Omonia Nicosia')));

  const united = sq.searchQueries('Manchester United', '');
  assert.deepStrictEqual(united, ['Manchester United']);

  const urls = [];
  const pinned = await sq.ensureSquad({
    matchId: 'atm-bay',
    homeZh: 'Atlético Madrid',
    awayZh: 'Bayern Munich',
    kickoffMs: Date.parse('2026-11-08T20:00:00Z'),
    now: Date.parse('2026-11-08T12:00:00Z'),
    fetchImpl: async (u) => {
      urls.push(dec(u));
      if (String(u).includes('/teams/search/')) return { data: [{ id: 1, name: 'Wrong' }] };
      return { data: [] };
    },
  });
  assert.ok(!urls.some(u => u.includes('/teams/search/')), urls.join('\n'));
  assert.ok(urls.some(u => u.includes('/7980')));
  assert.ok(urls.some(u => u.includes('/503')));
  assert.strictEqual(pinned.homeSmId, 7980);
  assert.strictEqual(pinned.awaySmId, 503);

  const known = [];
  const kept = await sq.ensureSquad({
    matchId: 'bar-avl',
    homeZh: '巴塞罗那',
    awayZh: '阿斯顿维拉',
    homeSmId: 83,
    awaySmId: 14,
    now: Date.parse('2026-11-08T12:00:00Z'),
    fetchImpl: async (u) => {
      known.push(dec(u));
      if (String(u).includes('/teams/search/')) throw new Error('known id re-searched');
      return { data: [] };
    },
  });
  assert.strictEqual(kept.homeSmId, 83);
  assert.strictEqual(kept.awaySmId, 14);
  assert.ok(!known.some(u => u.includes('/teams/search/')));

  const staleFile = path.join(dir, 'predict-squad', 'stale.json');
  fs.mkdirSync(path.dirname(staleFile), { recursive: true });
  fs.writeFileSync(staleFile, JSON.stringify({
    matchId: 'stale',
    fetchedAt: Date.now(),
    reason: 'no-team',
    note: '伤停和近况核心暂时没有。',
    sidelined: [],
    cores: { home: [], away: [] },
    half: { home: { n: 0 }, away: { n: 0 } },
  }));
  const staleUrls = [];
  const refreshed = await sq.ensureSquad({
    matchId: 'stale',
    homeZh: 'Celta Vigo',
    awayZh: 'Union Saint Gilloise',
    now: Date.now(),
    fetchImpl: async (u) => {
      const pathName = dec(u);
      staleUrls.push(pathName);
      const q = (pathName.split('/teams/search/')[1] || '');
      if (q === 'Celta') return { data: [{ id: 36, name: 'Celta' }] };
      if (q === 'Union Saint-Gilloise') return { data: [{ id: 186, name: 'Union Saint-Gilloise' }] };
      if (pathName.includes('/teams/search/')) return { data: [] };
      return { data: [] };
    },
  });
  assert.ok(staleUrls.some(u => u.includes('/teams/search/')), 'old no-team cache is not reused');
  assert.strictEqual(refreshed.homeSmId, 36);
  assert.strictEqual(refreshed.awaySmId, 186);
  assert.strictEqual(refreshed.schema, sq.SQUAD_SCHEMA);

  const again = await sq.ensureSquad({
    matchId: 'stale',
    homeZh: 'Celta Vigo',
    awayZh: 'Union Saint Gilloise',
    now: Date.now() + 1000,
    fetchImpl: async () => { throw new Error('fresh empty should stick 20 min'); },
  });
  assert.strictEqual(again.reason, refreshed.reason);

  const denied = new Error('http 403');
  denied.statusCode = 403;
  const covered = await sq.ensureSquad({
    matchId: 'no-sub',
    homeSmId: 10,
    awaySmId: 20,
    now: Date.parse('2026-11-08T12:00:00Z'),
    fetchImpl: async () => { throw denied; },
  });
  assert.strictEqual(covered.reason, 'no-coverage');
  assert.strictEqual(covered.note, '该联赛暂无伤停源。');

  const empty = await sq.ensureSquad({
    matchId: 'empty-list',
    homeSmId: 83,
    awaySmId: 14,
    now: Date.parse('2026-11-08T12:00:00Z'),
    fetchImpl: async (u) => {
      const pathName = String(u);
      if (pathName.includes('/fixtures/between/') && pathName.includes('/83')) {
        return { data: [{ id: 99, participants: [{ id: 83 }, { id: 14 }], state: { short_name: 'FT' }, starting_at: '2026-11-01' }] };
      }
      if (pathName.includes('/fixtures/99')) return { data: { id: 99, sidelined: [], participants: [] } };
      if (pathName.includes('/fixtures/')) return { data: { id: 1, lineups: [], participants: [], scores: [] } };
      return { data: [] };
    },
  });
  assert.strictEqual(empty.reason, 'empty');
  assert.strictEqual(empty.note, '本场公开名单暂无。');

  const afItems = [
    { player: 'Zetest Home', playerId: 999, reason: 'Hamstring Injury', team: 'Atletico Madrid', teamId: 530 },
    { player: 'Zetest Away', playerId: 1000, photo: 'https://media.api-sports.io/football/players/1000.png', reason: 'Knee Injury', team: 'Bayern Munich', teamId: 157 },
  ];
  const merged = sq.applyAfFallback({
    matchId: 'af',
    reason: 'no-team',
    note: '队名未匹配到伤停数据源。',
    sidelined: [],
    cores: { home: [], away: [] },
  }, afItems, { home: '马竞', away: '拜仁', homeEn: 'Atletico Madrid', awayEn: 'Bayern Munich', homeAfId: 530, awayAfId: 157 });
  assert.strictEqual(merged.injurySource, 'af');
  assert.strictEqual(merged.sidelined.length, 2);
  assert.strictEqual(merged.sidelined[0].side, 'home');
  assert.strictEqual(merged.sidelined[1].side, 'away');
  assert.strictEqual(merged.sidelined[0].core, false);
  assert.ok(String(merged.sidelined[0].image).includes('/999.png'));
  assert.strictEqual(merged.sidelined[0].name, 'Zetest Home');

  const prefer = sq.applyAfFallback(
    { sidelined: [{ name: 'Sportmonks Guy', side: 'home', player_id: 1 }] },
    afItems,
    { homeAfId: 530, home: '马竞' }
  );
  assert.strictEqual(prefer.sidelined.length, 1);
  assert.strictEqual(prefer.sidelined[0].name, 'Sportmonks Guy');

  function card(squad) {
    return surface.renderPredictSurface({ home: '马竞', away: '拜仁', squad });
  }
  const noTeamHtml = card({ reason: 'no-team', note: '伤停和近况核心暂时没有。', sidelined: [], cores: { home: [], away: [] } });
  assert.ok(noTeamHtml.includes('队名未匹配到伤停数据源'));
  assert.ok(noTeamHtml.includes('红边 = 近况核心'));
  assert.ok(!noTeamHtml.includes('暂时没有'));
  const subHtml = card({ reason: 'no-coverage', sidelined: [], cores: { home: [], away: [] } });
  assert.ok(subHtml.includes('该联赛暂无伤停源'));
  const emptyHtml = card({ reason: 'empty', sidelined: [], cores: { home: [], away: [] } });
  assert.ok(emptyHtml.includes('本场公开名单暂无'));
  const afHtml = card(merged);
  assert.ok(afHtml.includes('players%2F999.png'));
  assert.ok(afHtml.includes('players%2F1000.png'));
  assert.ok(afHtml.includes('腿筋'));
  assert.ok(afHtml.includes('膝盖'));
  assert.ok(!afHtml.includes('队名未匹配到伤停数据源'));
  assert.ok(afHtml.includes('主队近况核心'));
  assert.ok(afHtml.includes('近况核心样本不足'));
  assert.ok(afHtml.includes('红边 = 近况核心'));

  const reportId = 'rebuild-empty';
  const reportDir = path.join(dir, 'predict-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, reportId + '.json'), JSON.stringify({
    at: Date.now(),
    payload: {
      engineRev: pr.ENGINE_REV,
      html: '伤停和近况核心暂时没有。',
      sections: {
        squad: {
          reason: 'no-team',
          note: '伤停和近况核心暂时没有。',
          sidelined: [],
          cores: { home: [], away: [] },
          half: { home: { n: 0 }, away: { n: 0 } },
          fetchedAt: Date.now(),
        },
      },
    },
  }));
  assert.strictEqual(pr.loadCachedReport(reportId, { date: '2099-06-01', time: '12:00' }), null);

  console.log('squad-alias-test OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
