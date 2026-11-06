'use strict';
// 2.0.3: attack lanes stay in their own half, defense is a pressure band,
// matchup stroke matches 对位焦点, role avatars are omitted when the slot has no core.
const assert = require('assert');
const heat = require('../lib/heat-pitch');
const cm = require('../lib/corridor-matchup');
const sq = require('../lib/squad-source');
const surface = require('../lib/predict-surface');

function side(lcr, dominant) {
  return { available: true, lcr, dominant, dominant_zh: { left: '左路', central: '中路', right: '右路' }[dominant] };
}

const palace = {
  available: true,
  homeAttack: side({ left: 0.40, central: 0.39, right: 0.21 }, 'left'),
  awayDefend: side({ left: 0.43, central: 0.40, right: 0.18 }, 'left'),
  awayAttack: side({ left: 0.34, central: 0.39, right: 0.27 }, 'central'),
  homeDefend: side({ left: 0.28, central: 0.41, right: 0.31 }, 'central'),
};

const cores = {
  home: [
    { player_id: 11, name: 'Bukayo Saka', image: 'https://cdn.sportmonks.com/images/soccer/players/2/18.png', goals: 4, assists: 2, shots: 11, passes: 30, tackles: 1 },
    { player_id: 12, name: 'Eberechi Eze', image: '', goals: 1, assists: 3, shots: 4, passes: 210, tackles: 5 },
    { player_id: 13, name: 'Marc Guehi', image: '', goals: 0, assists: 0, shots: 1, passes: 160, tackles: 14 },
  ],
  away: [
    { player_id: 21, name: '只攻', goals: 3, assists: 0, shots: 8, passes: 10, tackles: 0 },
  ],
};
const sidelined = [{ side: 'home', player_id: 11, core: true, name: 'Bukayo Saka' }];
const slots = {
  home: sq.pickRoleCores(cores.home, sidelined, 'home'),
  away: sq.pickRoleCores(cores.away, sidelined, 'away'),
};
assert.deepStrictEqual(slots.home.map(s => s.role), ['attack', 'organize', 'defend']);
assert.strictEqual(slots.home.find(s => s.role === 'attack').sidelined, true);
assert.strictEqual(slots.home.find(s => s.role === 'organize').sidelined, false);
assert.strictEqual(slots.away.length, 1);
assert.strictEqual(slots.away[0].role, 'attack');

const byPos = sq.pickRoleCores([
  { player_id: 1, name: '前锋', position_id: 27, goals: 0, shots: 0, passes: 0, tackles: 20, impact: 9 },
  { player_id: 2, name: '后卫', position_id: 25, goals: 5, shots: 9, passes: 10, tackles: 0, impact: 8 },
], [], 'home');
assert.deepStrictEqual(byPos.map(s => s.role).sort(), ['attack', 'defend']);
assert.strictEqual(byPos.find(s => s.role === 'attack').name, '前锋');
assert.strictEqual(byPos.find(s => s.role === 'defend').name, '后卫');
assert.strictEqual(sq.pickRoleCores([{ player_id: 3, name: '只有评分', impact: 8 }], [], 'home').length, 0);

const cor = cm.buildCorridorMatchup(palace, { sidelined, cores });
assert.ok(cor.focus_lanes.some(f => f.side === 'home_attack' && f.lane === 'left' && f.badge === '对位'));
assert.ok(cor.zh_lines.some(s => s.includes('对位焦点在左路') && s.includes('描边')));
assert.strictEqual(cor.mismatch_home_favors, null);

const svg = heat.renderFullPitchSvg(palace, {
  home: '水晶宫',
  away: '霍芬海姆',
  corridor: cor,
  avatars: {
    home: slots.home.map(s => ({ ...s, name: s.name === 'Bukayo Saka' ? '萨卡' : s.name })),
    away: slots.away,
  },
});
assert.ok(svg.includes('往这边打'));
assert.ok(svg.includes('粗线是常走的进攻'));
assert.ok(!/feGaussianBlur|中场争夺|常从/.test(svg));
assert.ok(!/实时阵型|进球落点图|本场实时站位/.test(svg));
assert.ok(svg.includes('也不是实时站位'));

function attackPath(side, lane) {
  const re = new RegExp(`<path class="pr-atk"[^>]*data-side="${side}"[^>]*data-lane="${lane}"[^>]*>`);
  const m = svg.match(re);
  assert.ok(m, `${side} ${lane} attack path`);
  return m[0];
}
const homeLeft = attackPath('home', 'left');
const homeRight = attackPath('home', 'right');
const awayMid = attackPath('away', 'central');
assert.ok(/data-rank="hot"/.test(homeLeft));
assert.ok(/stroke-width="7"/.test(homeLeft));
assert.ok(/data-rank="thin"/.test(homeRight));
assert.ok(/stroke-dasharray=/.test(homeRight));
assert.ok(/data-rank="hot"/.test(awayMid));

function xs(tag) {
  const d = tag.match(/d="M([\d.]+) [\d.]+ L([\d.]+)/);
  assert.ok(d, tag);
  return [Number(d[1]), Number(d[2])];
}
const [hx0, hx1] = xs(homeLeft);
assert.ok(hx0 > 180 && hx1 > 180, 'home attack stays in the away half');
const [ax0, ax1] = xs(awayMid);
assert.ok(ax0 < 180 && ax1 < 180, 'away attack stays in the home half');

assert.ok(/class="pr-focus"[^>]*data-side="home_attack"[^>]*data-lane="left"[^>]*data-badge="对位"/.test(svg));
assert.ok(/class="pr-def"[^>]*data-side="away"[^>]*data-lane="right"[^>]*data-gap="1"/.test(svg));
assert.ok(svg.includes('更好打'));
assert.ok(/class="pr-avatar"[^>]*data-side="home"[^>]*data-role="attack"[^>]*data-sidelined="1"/.test(svg));
assert.ok(svg.includes('/api/logo?url='));
assert.ok(svg.includes('萨卡'));
assert.ok(!svg.includes('Bukayo'));
assert.ok(/stroke="#e11d48"/.test(svg));
assert.ok(!/class="pr-avatar"[^>]*data-side="away"[^>]*data-role="defend"/.test(svg));
assert.ok(!/class="pr-avatar"[^>]*data-side="away"[^>]*data-role="organize"/.test(svg));

const empty = heat.renderFullPitchSvg({ available: false, checked: true, note: '近况样本太少，攻防图先空着。' });
assert.ok(empty.includes('先空着'));
assert.ok(!/<path /.test(empty));
assert.ok(!/pr-avatar|pr-atk|pr-def/.test(empty));

const html = surface.renderPredictSurface({
  home: '水晶宫',
  away: '霍芬海姆',
  concl: { lean: 'd', pickText: '平局', conf: 0.5, speakMode: 'align', _speakResolved: true },
  heat: palace,
  squad: { available: true, sidelined, cores },
  oddsEdge: { exp: { expH: 1.2, expA: 1.1 }, over25: 0.5 },
  market: { p: { h: 0.4, d: 0.3, a: 0.3 } },
});
assert.ok(html.includes('pr-heat-legend'));
assert.ok(html.includes('粗线＝常走的进攻'));
assert.ok(html.includes('色带＝常被压'));
assert.ok(html.includes('描边＝对位焦点'));
assert.ok(html.includes('近况核心示意 · 非本场实时站位'));
assert.ok(html.includes('对位焦点在左路'));
assert.ok(html.includes('萨卡'));
assert.ok(!html.includes('Bukayo'));
assert.ok(!/实时阵型|本场站位/.test(html));

console.log('heat-pitch-lanes-test OK');
