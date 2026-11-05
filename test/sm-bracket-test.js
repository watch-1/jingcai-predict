'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bracket = require('../lib/sm-bracket');

assert.strictEqual(bracket.isLeagueRoundName('12'), true);
assert.strictEqual(bracket.isLeagueRoundName('Matchday 8'), true);
assert.strictEqual(bracket.isKnockoutLabel('Regular Season'), false);
assert.strictEqual(bracket.isKnockoutLabel('Quarter-finals'), true);
assert.strictEqual(bracket.isKnockoutLabel('Final'), true);

function fx(id, home, away, hg, ag, when) {
  return {
    id,
    starting_at: when,
    participants: [
      { id: home.id, name: home.name, short_code: home.code, image_path: home.logo || '', meta: { location: 'home' } },
      { id: away.id, name: away.name, short_code: away.code, image_path: away.logo || '', meta: { location: 'away' } },
    ],
    scores: [
      { description: 'CURRENT', participant_id: home.id, score: { goals: hg, participant: 'home' } },
      { description: 'CURRENT', participant_id: away.id, score: { goals: ag, participant: 'away' } },
    ],
  };
}

const bay = { id: 503, name: 'Bayern Munich', code: 'BAY' };
const rma = { id: 3468, name: 'Real Madrid', code: 'RMA' };
const atm = { id: 7980, name: 'Atletico Madrid', code: 'ATM' };
const bar = { id: 83, name: 'Barcelona', code: 'BAR' };
const psg = { id: 591, name: 'Paris Saint Germain', code: 'PSG' };
const liv = { id: 8, name: 'Liverpool', code: 'LIV' };

const cup = [{
  name: 'Knock Out',
  type: { name: 'Knock Out' },
  rounds: [
    { name: 'Quarter-finals', fixtures: [
      fx(1, bay, rma, 2, 1, '2026-04-08'),
      fx(2, atm, bar, 1, 0, '2026-04-08'),
      fx(3, psg, liv, 0, 1, '2026-04-09'),
      fx(4, { id: 50, name: 'Arsenal', code: 'ARS' }, { id: 51, name: 'Chelsea', code: 'CHE' }, 3, 2, '2026-04-09'),
    ] },
    { name: 'Semi-finals', fixtures: [
      fx(5, bay, atm, 2, 2, '2026-04-29'),
      fx(6, liv, { id: 50, name: 'Arsenal', code: 'ARS' }, 1, 0, '2026-04-30'),
    ] },
    { name: 'Final', fixtures: [fx(7, bay, liv, 1, 0, '2026-05-30')] },
  ],
}];

const model = bracket.buildModel(cup);
assert.ok(model);
assert.deepStrictEqual(model.rounds.map(r => r.label), ['四分之一决赛', '半决赛', '决赛']);
assert.strictEqual(model.rounds[0].matches.length, 4);
assert.strictEqual(model.rounds[2].matches[0].final, true);
assert.strictEqual(model.rounds[2].matches[0].home, '拜仁慕尼黑');
assert.strictEqual(model.rounds[2].matches[0].hs, 1);
const html = bracket.renderBracketHtml(model);
assert.ok(html.includes('对阵图'));
assert.ok(html.includes('四分之一决赛') && html.includes('半决赛') && html.includes('决赛'));
assert.ok(html.includes('拜仁慕尼黑') && html.includes('皇家马德里'));
assert.ok(html.includes('br-card final'));
assert.ok(!html.includes('api_token'));
assert.ok(!html.includes('虚构'));
assert.strictEqual(bracket.buildModel([{ name: 'Regular Season', rounds: [{ name: '1', fixtures: [fx(1, bay, rma, 1, 0, '2026-08-01')] }] }]), null);

const league = [{ name: 'Regular Season', type: { name: 'League' }, rounds: [
  { name: '1', fixtures: [fx(1, bay, rma, 1, 0, '2026-08-01'), fx(2, atm, bar, 0, 0, '2026-08-01')] },
  { name: '2', fixtures: [fx(3, bay, atm, 2, 2, '2026-08-08')] },
] }];
assert.strictEqual(bracket.buildModel(league), null);

(async () => {
  const prev = process.env.DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-'));
  process.env.DATA_DIR = dir;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/fixtures/between/')) {
      return { data: [{ id: 99, season_id: 5, participants: [{ id: 10 }, { id: 20 }], stage: { name: 'Knock Out', type: { name: 'Knock Out' } }, round: { name: 'Final' }, season: { id: 5 } }] };
    }
    if (String(url).includes('/schedules/seasons/5')) return { data: cup };
    throw new Error('unexpected ' + url);
  };
  const pack = await bracket.ensureBracket({
    matchId: 'm1', homeSmId: 10, awaySmId: 20, kickoffMs: Date.parse('2026-05-30T19:00:00Z'), fetchImpl, now: Date.parse('2026-06-01T00:00:00Z'),
  });
  assert.strictEqual(pack.show, true);
  assert.ok(pack.html.includes('对阵图'));
  assert.ok(calls.some(u => u.includes('/schedules/seasons/5')));

  const leagueFetch = async (url) => {
    if (String(url).includes('/fixtures/between/')) {
      return { data: [{ id: 7, season_id: 9, participants: [{ id: 10 }, { id: 20 }], stage: { name: 'Regular Season' }, round: { name: '12' }, season: { id: 9 } }] };
    }
    if (String(url).includes('/schedules/seasons/9')) return { data: league };
    throw new Error('unexpected ' + url);
  };
  const hidden = await bracket.ensureBracket({
    matchId: 'm2', homeSmId: 10, awaySmId: 20, kickoffMs: Date.parse('2026-11-01T12:00:00Z'), fetchImpl: leagueFetch, now: Date.parse('2026-11-02T00:00:00Z'),
  });
  assert.strictEqual(hidden.show, false);
  assert.strictEqual(hidden.reason, 'not-knockout');
  assert.strictEqual(hidden.html, '');

  delete process.env.SPORTMONKS_TOKEN;
  delete process.env.SPORTMONKS_API_TOKEN;
  const none = await bracket.ensureBracket({ matchId: 'm3', homeZh: '拜仁慕尼黑', awayZh: '皇家马德里', now: Date.parse('2026-11-03T00:00:00Z') });
  assert.strictEqual(none.show, false);
  assert.strictEqual(none.reason, 'no-token');

  const thinFetch = async (url) => {
    if (String(url).includes('/fixtures/between/')) {
      return { data: [{ id: 1, season_id: 3, participants: [{ id: 10 }, { id: 20 }], stage: { name: 'Final', type: { name: 'Knock Out' } }, round: { name: 'Final' } }] };
    }
    if (String(url).includes('/schedules/seasons/3')) {
      return { data: [{ name: 'Final', type: { name: 'Knock Out' }, rounds: [{ name: 'Final', fixtures: [fx(1, bay, rma, 1, 0, '2026-05-30')] }] }] };
    }
    throw new Error('unexpected ' + url);
  };
  const thin = await bracket.ensureBracket({
    matchId: 'm4', homeSmId: 10, awaySmId: 20, kickoffMs: Date.parse('2026-05-30T19:00:00Z'), fetchImpl: thinFetch, now: Date.parse('2026-06-02T00:00:00Z'),
  });
  assert.strictEqual(thin.show, false);
  assert.strictEqual(thin.reason, 'thin');

  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(app.includes('smd-pitch'), 'lineup pitch');
  assert.ok(app.includes('sml-row'), 'lineup list');
  assert.ok(app.includes('ev-half'), 'event half divider');
  assert.ok(app.includes('function bracketBlock'));
  assert.ok(app.includes('/sm-bracket'));
  const liveFn = app.slice(app.indexOf('function liveTabHtml'), app.indexOf('function matchHero'));
  assert.ok(liveFn.includes('livePitchHtml') && liveFn.includes('eventsTabHtml') && liveFn.includes('sm-live-'));
  const emptyBranch = app.match(/const empty = !rows\.length[\s\S]*?: '';/)?.[0];
  assert.ok(emptyBranch && /暂无事件记录/.test(emptyBranch));

  process.env.DATA_DIR = prev;
  console.log('sm-bracket-test OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
