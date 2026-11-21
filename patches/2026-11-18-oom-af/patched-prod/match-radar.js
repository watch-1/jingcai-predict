/**
 * Match-detail 六围 (0–100 same-role percentiles).
 * Reads a windowed index built from data/radar/player-match-rich.sqlite
 * (SportMonks fixture-player details). Never invents scores, never
 * calls SportMonks live, never uses the thin player_match_stats table
 * to fake missing rich fields.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { clubDisplayZh } = require('./club-zh');

const DATA_DIR = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = () => path.join(DATA_DIR(), 'radar', 'player-match-rich.sqlite');
const INDEX_DIR = () => path.join(DATA_DIR(), 'radar', 'index');

const MIN_MIN = 450;
const RELAX_MIN = 270; // smaller club leagues only; main leagues stay at MIN_MIN
const TEAM_MIN_MATCHES = 10;
const PLAYER_POOL_FLOOR = 20;
const GK_POOL_FLOOR = 15;
const RELAX_POOL_FLOOR = 8;
const RELAX_GK_POOL_FLOOR = 6;

/* Canonical Chinese labels used in the radar index. English aliases
 * are only for the rare case the index stores an English competition
 * name. "Premier League" is 英超, never Kazakhstan; "Super League"
 * is not automatically 瑞超. */
const MAIN_LEAGUES = new Set([
  '西甲', '英超', '意甲', '德甲', '法甲', '英冠', '荷甲', '葡超',
  '德乙', '法乙', '美职', '日职', '韩职', '巴甲',
]);
const MAIN_LEAGUE_ALIASES = {
  'premier league': '英超',
  'english premier league': '英超',
  'epl': '英超',
  'la liga': '西甲',
  'laliga': '西甲',
  'la liga ea sports': '西甲',
  'bundesliga': '德甲',
  '2. bundesliga': '德乙',
  '2.bundesliga': '德乙',
  'bundesliga 2': '德乙',
  'ligue 1': '法甲',
  'ligue 2': '法乙',
  'championship': '英冠',
  'efl championship': '英冠',
  'eredivisie': '荷甲',
  'primeira liga': '葡超',
  'liga portugal': '葡超',
  'major league soccer': '美职',
  'mls': '美职',
  'j1 league': '日职',
  'j.league': '日职',
  'k league 1': '韩职',
  'k-league 1': '韩职',
  'k league 1.': '韩职',
  'brasileirão': '巴甲',
  'brasileirao': '巴甲',
  'serie a brazil': '巴甲',
  'série a brazil': '巴甲',
  'brazilian serie a': '巴甲',
  'serie a': '意甲',
};

function canonLeague(league) {
  const s = String(league || '').trim();
  if (!s) return '';
  if (MAIN_LEAGUES.has(s)) return s;
  const lower = s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/brasileir[aã]o|brazil|巴西/.test(lower) && /serie a|série a|甲/.test(lower)) return '巴甲';
  if (MAIN_LEAGUE_ALIASES[lower]) return MAIN_LEAGUE_ALIASES[lower];
  return s;
}
function isMainLeague(league) {
  return MAIN_LEAGUES.has(canonLeague(league));
}
function minMinutesForLeague(league) {
  return isMainLeague(league) ? MIN_MIN : RELAX_MIN;
}
function poolFloorFor(league, poolKey) {
  if (isMainLeague(league)) return poolKey === 'GK' ? GK_POOL_FLOOR : PLAYER_POOL_FLOOR;
  return poolKey === 'GK' ? RELAX_GK_POOL_FLOOR : RELAX_POOL_FLOOR;
}
function isLowValueMinutes(minutes, league) {
  const m = Number(minutes) || 0;
  return !isMainLeague(league) && m >= RELAX_MIN && m < MIN_MIN;
}
function belowMinutesNote(league) {
  return `窗口内俱乐部联赛不足 ${minMinutesForLeague(league)} 分钟`;
}
function lowValueNote(minutes, apps) {
  const x = Math.round(Number(minutes) || 0);
  const y = Math.round(Number(apps) || 0);
  return `参考价值偏低：窗口仅 ${y} 场 / ${x} 分钟`;
}
const AM_THIN = 30; // research treated ~23 AM as thin and used all midfielders
const AERIAL_MIN = 10; // min aerial contests before win% counts
const TB_MIN = 600;

const DPOS = {
  24: 'GK', 148: 'CB', 149: 'DM', 150: 'AM', 151: 'CF', 152: 'LW',
  153: 'CM', 154: 'RB', 155: 'LB', 156: 'RW', 157: 'LM', 158: 'RM', 163: 'SS',
};
const DPOS_ZH = {
  GK: '门将', CB: '中后卫', DM: '后腰', AM: '攻击型中场', CF: '中锋',
  LW: '左边锋', CM: '中前卫', RB: '右后卫', LB: '左后卫', RW: '右边锋',
  LM: '左中场', RM: '右中场', SS: '影锋', '?': '未知',
};
const POS_ZH = { 24: '门将', 25: '后卫', 26: '中场', 27: '前锋' };

// Axis specs: [dimName, isStyleVolume, parts]
// part: [metricKey, invert, label, weight?]
const HA_AXES = [
  ['进攻终结', false, [['goals90', false, '进球/90'], ['sot90', false, '射正/90']]],
  ['机会转化', false, [['shot_conv', false, '射门转化率 %']]],
  ['身体支点', false, [['duel_win', false, '对抗成功率 %'], ['aerial_win_wl', false, '争顶成功率 %', 0.5]]],
  ['机会创造', false, [['assists90', false, '助攻/90'], ['kp90', false, '关键传球/90'], ['bcc90', false, '创造良机/90']]],
  ['持球参与', false, [['touches90', false, '触球/90']]],
  ['回追压迫', false, [['rec90', false, '夺回球权/90'], ['press90', false, '抢断+拦截/90']]],
];

// Enabled when RADAR_USE_XG=1. xG is the quality term, SOT stays
// as volume, goals kept at half weight. Missing xG must stay null (not 0).
const HA_AXES_XG = [
  ['进攻终结', false, [['xg90', false, 'xG/90', 1], ['sot90', false, '射正/90', 1], ['goals90', false, '进球/90', 0.5]]],
  HA_AXES[1], HA_AXES[2], HA_AXES[3], HA_AXES[4], HA_AXES[5],
];
const XG_LEAGUE_COVER = 0.6;
const SI_AXES = [
  ['机会创造', false, [['assists90', false, '助攻/90'], ['kp90', false, '关键传球/90'], ['cc90', false, '创造机会/90'], ['bcc90', false, '创造良机/90']]],
  ['传球推进', false, [['pass_pct', false, '传球成功率 %'], ['pft90', false, '进攻三区传球/90'], ['longwon90', false, '成功长传/90'], ['tb90', false, '直塞/90', 0.5]]],
  ['拿球抗压', false, [['duel_win', false, '对抗成功率 %'], ['drib90', false, '成功突破/90'], ['disposs90', true, '被抢断/90']]],
  ['前插威胁', false, [['shots90', false, '射门/90'], ['sot90', false, '射正/90']]],
  ['控球参与', false, [['touches90', false, '触球/90'], ['passes90', false, '传球/90']]],
  ['防守贡献', false, [['tackles90', false, '抢断/90'], ['int90', false, '拦截/90']]],
];

const SI_AXES_XG = [
  SI_AXES[0], SI_AXES[1], SI_AXES[2],
  ['前插威胁', false, [['xg90', false, 'xG/90', 1], ['shots90', false, '射门/90', 1], ['sot90', false, '射正/90', 1]]],
  SI_AXES[4], SI_AXES[5],
];
const DI_AXES = [
  ['抢断拦截次数', true, [['tackles90', false, '抢断/90'], ['int90', false, '拦截/90']]],
  ['位置容错', false, [['clr90', false, '解围/90'], ['blk90', false, '封堵射门/90']]],
  ['身体对抗', false, [['duel_win', false, '对抗成功率 %'], ['aerial_win_wl', false, '争顶成功率 %', 0.5]]],
  ['出球组织', false, [['pass_pct', false, '传球成功率 %'], ['long_pct', false, '长传成功率 %']]],
  ['防守稳健', false, [['dribbled_past90', true, '被过/90']]],
  ['纪律控场', false, [['fouls90', true, '犯规/90'], ['rec90', false, '夺回球权/90']]],
];
const DO_AXES = [
  ['扑救效率', false, [['save_pct', false, '扑救率 %']]],
  ['传球组织', false, [['pass_pct', false, '传球成功率 %'], ['long_pct', false, '长传成功率 %']]],
  ['出球参与', false, [['passes90', false, '传球/90']]],
  ['高空处理次数', true, [['aerial_act90', false, '击球+成功摘球/90']]],
  ['出击次数', true, [['comeout90', false, '解围+夺回/90']]],
  ['纪律', false, [['yellow90', true, '黄牌/90']]],
];

const TEAM_DIMS = [
  ['进攻终结', false, [['goals', false, '场均进球'], ['shots_on_target', false, '场均射正']]],
  ['机会创造', false, [['key_passes', false, '场均关键传球'], ['big_chances_created', false, '场均创造良机'], ['corners', false, '场均角球']]],
  ['控球推进', false, [['ball_possession', false, '控球率 %'], ['successful_passes_percentage', false, '传球成功率 %'], ['successful_dribbles', false, '场均成功盘带']]],
  ['抢断拦截次数', true, [['tackles', false, '场均抢断'], ['interceptions', false, '场均拦截']]],
  ['身体对抗', false, [['duel_win_pct', false, '对抗成功率 %']]],
  ['防守稳健', false, [['goals_conceded', true, '场均失球'], ['sot_against', true, '场均被射正']]],
];

/* Best-XI team radar: combined club-league window of a theoretical
 * strongest 11 (1-4-3-3, market value first). Volume parts are the
 * per-player mean of per-90 so a side with fewer mapped players is
 * not automatically crushed; rates are attempt-weighted. */
const XI_SLOTS = { GK: 1, DEF: 4, MID: 3, ATT: 3 };
const XI_DIMS = [
  ['进攻终结', false, [
    ['goals90', false, '进球/90', 'mean'],
    ['sot90', false, '射正/90', 'mean'],
  ]],
  ['机会创造', false, [
    ['assists90', false, '助攻/90', 'mean'],
    ['kp90', false, '关键传球/90', 'mean'],
    ['bcc90', false, '创造良机/90', 'mean'],
  ]],
  ['控球推进', false, [
    ['passes90', false, '传球/90', 'mean'],
    ['pft90', false, '进攻三区传球/90', 'mean'],
    ['pass_pct', false, '传球成功率 %', 'wavg', 'passes'],
  ]],
  ['抢断拦截次数', true, [
    ['tackles90', false, '抢断/90', 'mean'],
    ['int90', false, '拦截/90', 'mean'],
  ]],
  ['身体对抗', false, [
    ['duel_win', false, '对抗成功率 %', 'wavg', 'total_duels'],
    ['aerial_win_wl', false, '争顶成功率 %', 'wavg', 'aer_n'],
  ]],
  ['防守贡献', false, [
    ['clr90', false, '解围/90', 'mean'],
    ['blk90', false, '封堵射门/90', 'mean'],
    ['save_pct', false, '扑救率 %', 'wavg', 'saves'],
  ]],
];
const XI_MIN_SIDE = 3; // both sides need at least this many with stats

const mem = new Map();
let _db = null;

function openDb() {
  if (_db) return _db;
  const p = DB_PATH();
  if (!fs.existsSync(p)) return null;
  _db = new Database(p, { readonly: true, fileMustExist: true });
  _db.pragma('busy_timeout = 3000');
  return _db;
}

function closeDb() {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
  }
}

function add(sum, key, v) {
  if (v == null || Number.isNaN(Number(v))) return;
  const n = Number(v);
  sum[key] = (sum[key] || 0) + n;
  sum[key + '_n'] = (sum[key + '_n'] || 0) + 1;
}

function p90(sum, key, mins, default0) {
  const v = sum[key];
  if (v == null) return default0 ? 0 : null;
  if (!mins) return null;
  return (v * 90) / mins;
}

function ratio(num, den) {
  if (num == null || !den) return null;
  return (100 * num) / den;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function meanSkip(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function modeByWeight(pairs) {
  const w = new Map();
  for (const [k, wt] of pairs) {
    if (k == null || k === '') continue;
    w.set(k, (w.get(k) || 0) + (wt || 0));
  }
  let best = null, bestW = -1;
  for (const [k, ww] of w) {
    if (ww > bestW) { best = k; bestW = ww; }
  }
  return best;
}

/** Build per-90 / rate metrics from a player's summed club-league window. */
function metricsFromSum(sum, mins, tbMins, tbSum) {
  const m = {
    goals90: p90(sum, 'goals', mins, true),
    sot90: p90(sum, 'shots_on', mins, true),
    shots90: p90(sum, 'shots_total', mins, true),
    shot_conv: ratio(sum.goals, sum.shots_total),
    assists90: p90(sum, 'assists', mins, true),
    kp90: p90(sum, 'kp', mins, true),
    cc90: p90(sum, 'cc', mins, true),
    bcc90: p90(sum, 'bcc', mins, true),
    touches90: p90(sum, 'touches', mins, true),
    passes90: p90(sum, 'passes', mins, true),
    pass_pct: ratio(sum.acc_passes, sum.passes),
    pft90: p90(sum, 'passes_in_final_third', mins, true),
    drib90: p90(sum, 'successful_dribbles', mins, true),
    disposs90: p90(sum, 'dispossessed', mins, true),
    tackles90: p90(sum, 'tackles', mins, true),
    int90: p90(sum, 'interceptions', mins, true),
    press90: (p90(sum, 'tackles', mins, true) || 0) + (p90(sum, 'interceptions', mins, true) || 0),
    clr90: p90(sum, 'clearances', mins, true),
    blk90: p90(sum, 'blocked_shots', mins, true),
    fouls90: p90(sum, 'fouls', mins, true),
    yellow90: p90(sum, 'yellowcards', mins, true),
    duel_win: ratio(sum.duels_won, sum.total_duels),
    rec90: p90(sum, 'ball_recovery', mins, true),
    dribbled_past90: p90(sum, 'dribbled_past', mins, true),
    long_pct: ratio(sum.long_balls_won, sum.long_balls),
    longwon90: p90(sum, 'long_balls_won', mins, true),
    saves90: p90(sum, 'saves', mins, true),
    sib90: p90(sum, 'saves_insidebox', mins, true),
    punch90: p90(sum, 'punches', mins, true),
    claim90: p90(sum, 'good_high_claim', mins, true),
    aerial_act90: (p90(sum, 'punches', mins, true) || 0) + (p90(sum, 'good_high_claim', mins, true) || 0),
    comeout90: (p90(sum, 'clearances', mins, true) || 0) + (p90(sum, 'ball_recovery', mins, true) || 0),
    tb90: (tbSum != null && tbMins >= TB_MIN) ? (tbSum * 90 / tbMins) : null,
    tb_minutes: tbMins || 0,
  };
  const sav = sum.saves || 0;
  let gc = sum.gk_goals_conceded;
  if (gc == null) gc = sum.goals_conceded != null ? sum.goals_conceded : 0;
  m.save_pct = (sav + gc) ? (100 * sav / (sav + gc)) : null;
  m.sib_share = sav ? (100 * (sum.saves_insidebox || 0) / sav) : null;
  const aw = sum.aer_w || 0;
  const al = sum.aer_l || 0;
  m.aerial_win_wl = (aw + al) >= AERIAL_MIN ? (100 * aw / (aw + al)) : null;
  m._raw = {
    goals: sum.goals || 0,
    shots: sum.shots_total || 0,
    sot: sum.shots_on || 0,
    saves: sav,
    gc,
    duels_won: sum.duels_won || 0,
    total_duels: sum.total_duels || 0,
    aer_w: aw,
    aer_l: al,
    yellow: sum.yellowcards || 0,
  };
  return m;
}

function emptySum() { return {}; }

function accumulateRow(sum, r) {
  const keys = [
    'goals', 'shots_total', 'shots_on', 'yellowcards', 'assists', 'kp', 'cc', 'bcc',
    'touches', 'total_duels', 'duels_won', 'duels_lost', 'successful_dribbles',
    'dispossessed', 'aer_w', 'aer_l', 'tackles', 'interceptions', 'dribbled_past',
    'ball_recovery', 'clearances', 'blocked_shots', 'fouls', 'passes', 'acc_passes',
    'long_balls', 'long_balls_won', 'passes_in_final_third', 'saves', 'saves_insidebox',
    'gk_goals_conceded', 'goals_conceded', 'good_high_claim', 'punches',
  ];
  for (const k of keys) add(sum, k, num(r[k]));
}

function percentile(me, vals, invert) {
  if (me == null || !vals || !vals.length) return null;
  if (invert) return (100 * vals.filter((v) => v >= me).length) / vals.length;
  return (100 * vals.filter((v) => v <= me).length) / vals.length;
}

function poolAvg(vals) {
  return meanSkip(vals);
}

function scoreAxes(m, axes, poolMs) {
  const details = [];
  const scores = [];
  for (const [dimName, isStyle, parts] of axes) {
    const weighted = [];
    const partRows = [];
    for (const spec of parts) {
      const key = spec[0], inv = spec[1], lab = spec[2];
      const w = spec.length > 3 ? Number(spec[3]) : 1;
      const me = m[key];
      const vals = poolMs.map((q) => q[key]).filter((v) => v != null && Number.isFinite(v));
      const perc = percentile(me, vals, inv);
      partRows.push({
        key, label: lab, value: me, avg: poolAvg(vals),
        percentile: perc, invert: inv, n: vals.length,
        weight: w, low_weight: w < 1,
      });
      if (perc != null) weighted.push([perc, w]);
    }
    const wsum = weighted.reduce((a, x) => a + x[1], 0);
    const sc = wsum ? weighted.reduce((a, x) => a + x[0] * x[1], 0) / wsum : null;
    scores.push(sc);
    details.push({
      name: dimName,
      score: sc,
      style_volume: !!isStyle,
      parts: partRows,
    });
  }
  return { scores, details, complete: scores.every((s) => s != null) };
}

function rolePlan(posId, dpos) {
  const role = DPOS[dpos] || '?';
  const pos = Number(posId);
  // Fine-role first (Marmoush-style: official line may disagree).
  if (pos === 24 || role === 'GK') {
    return { axes: DO_AXES, poolKey: 'GK', role, roleZh: '门将', winger: false };
  }
  if (role === 'CB' || (pos === 25 && dpos === 148)) {
    return { axes: DI_AXES, poolKey: 'CB', role: 'CB', roleZh: '中后卫', winger: false };
  }
  if (role === 'CF' || dpos === 151) {
    return { axes: HA_AXES, poolKey: 'CF', role: 'CF', roleZh: '中锋', winger: false };
  }
  if (role === 'LW' || role === 'RW' || dpos === 152 || dpos === 156) {
    return {
      axes: HA_AXES, poolKey: 'ATT', role, roleZh: DPOS_ZH[role] || '边锋',
      winger: true, wingerOverride: '暂按前锋对照',
    };
  }
  if (role === 'SS' || dpos === 163) {
    return { axes: HA_AXES, poolKey: 'ATT', role: 'SS', roleZh: '影锋', winger: false };
  }
  if (pos === 26 || ['DM', 'AM', 'CM', 'LM', 'RM'].includes(role)) {
    const am = dpos === 150 || role === 'AM';
    return {
      axes: SI_AXES, poolKey: am ? 'AM' : 'MID', role: role === '?' ? 'CM' : role,
      roleZh: DPOS_ZH[role] || '中场', winger: false, preferAm: am,
    };
  }
  if (pos === 27) {
    return { axes: HA_AXES, poolKey: 'ATT', role: role === '?' ? 'CF' : role, roleZh: DPOS_ZH[role] || '前锋', winger: false };
  }
  // Full-backs and unmapped defenders have no first-ship axis set.
  return { axes: null, poolKey: null, role, roleZh: DPOS_ZH[role] || POS_ZH[pos] || '未知', winger: false, unsupported: true };
}

function poolFloor(poolKey) {
  return poolKey === 'GK' ? GK_POOL_FLOOR : PLAYER_POOL_FLOOR;
}

function inPool(agg, key) {
  const pos = Number(agg.posId);
  const dpos = Number(agg.dpos);
  if (key === 'CF') return dpos === 151;
  if (key === 'MID') return pos === 26;
  if (key === 'CB') return pos === 25 && dpos === 148;
  if (key === 'GK') return pos === 24;
  if (key === 'ATT') return pos === 27;
  if (key === 'DEF') return pos === 25;
  if (key === 'AM') return pos === 26 && dpos === 150;
  return false;
}

function roleWordOf(poolKey, plan) {
  return {
    CF: '中锋', MID: '中场', CB: '中后卫', GK: '门将', ATT: '前锋', AM: '攻击型中场', DEF: '后卫',
  }[poolKey] || (plan && plan.roleZh) || '同位置';
}

function captionFor(league, plan, poolKey, poolN, fallbackNote) {
  const roleWord = roleWordOf(poolKey, plan);
  const thresh = minMinutesForLeague(league);
  let s = `${league}${roleWord} ≥${thresh} 分钟，对照 ${poolN} 人`;
  // Winger mark lives on wingerOverride / the badge only — do not also
  // append 「暂按前锋对照」 here so compact cards never show it twice.
  if (fallbackNote) s += `。${fallbackNote}`;
  return s;
}

/** One-line compact card meta. Fits a half-width phone column. */
function captionShort(league, plan, poolKey, poolN) {
  const roleWord = roleWordOf(poolKey, plan);
  const n = poolN == null ? '' : String(poolN);
  const thresh = minMinutesForLeague(league);
  return `${league || ''}${roleWord}≥${thresh}′ · 对照${n}`;
}

function aggregatePlayers(rows) {
  // rows: club-league, date < asOf. Group by player, then pick main league.
  const byP = new Map();
  for (const r of rows) {
    const pid = Number(r.player_id);
    if (!Number.isFinite(pid)) continue;
    let bag = byP.get(pid);
    if (!bag) {
      bag = { pid, name: r.name, leagues: new Map(), all: [] };
      byP.set(pid, bag);
    }
    if (r.name) bag.name = r.name;
    const lg = r.competition || '';
    let L = bag.leagues.get(lg);
    if (!L) {
      L = { league: lg, mins: 0, apps: 0, sum: emptySum(), tbMins: 0, tbSum: 0, tbApps: 0, pos: [], dpos: [], teams: new Map() };
      bag.leagues.set(lg, L);
    }
    const mins = num(r.minutes) || 0;
    L.mins += mins;
    L.apps += 1;
    L.pos.push([r.pos_id, mins]);
    L.dpos.push([r.dpos, mins]);
    if (r.team_id) L.teams.set(Number(r.team_id), (L.teams.get(Number(r.team_id)) || 0) + mins);
    accumulateRow(L.sum, r);
    if (r.through_balls != null && r.through_balls !== '') {
      L.tbMins += mins;
      L.tbApps += 1;
      L.tbSum += num(r.through_balls) || 0;
    }
  }

  const out = [];
  for (const bag of byP.values()) {
    let main = null;
    for (const L of bag.leagues.values()) {
      if (!main || L.mins > main.mins) main = L;
    }
    if (!main || !main.league) continue;
    const posId = modeByWeight(main.pos);
    const dpos = modeByWeight(main.dpos);
    const teamSm = modeByWeight([...main.teams.entries()]);
    const m = metricsFromSum(main.sum, main.mins, main.tbMins, main.tbSum);
    out.push({
      smId: bag.pid,
      name: bag.name,
      league: main.league,
      minutes: main.mins,
      apps: main.apps,
      posId: posId != null ? Number(posId) : null,
      dpos: dpos != null ? Number(dpos) : null,
      teamSm,
      m,
      tbMins: main.tbMins,
      tbApps: main.tbApps,
    });
  }
  return out;
}

function aggregateTeams(tmRows) {
  // Need duel totals per fixture: sum of both sides' duels_won.
  const duelTotal = new Map();
  for (const r of tmRows) {
    const dw = num(r.duels_won);
    if (dw == null) continue;
    duelTotal.set(r.fid, (duelTotal.get(r.fid) || 0) + dw);
  }
  const by = new Map(); // competition|teamSm
  for (const r of tmRows) {
    const comp = r.competition || '';
    const tid = Number(r.team_sm);
    if (!Number.isFinite(tid) || !comp) continue;
    const k = comp + '|' + tid;
    let T = by.get(k);
    if (!T) {
      T = { competition: comp, teamSm: tid, loc: r.loc, n: 0, sums: {}, nKeys: {} };
      by.set(k, T);
    }
    T.n += 1;
    const keys = [
      'goals', 'shots_on_target', 'shots_insidebox', 'shots_total', 'key_passes',
      'big_chances_created', 'corners', 'ball_possession', 'successful_passes_percentage',
      'successful_dribbles', 'tackles', 'interceptions', 'goals_conceded', 'sot_against',
    ];
    for (const key of keys) {
      const v = num(r[key]);
      if (v == null) continue;
      T.sums[key] = (T.sums[key] || 0) + v;
      T.nKeys[key] = (T.nKeys[key] || 0) + 1;
    }
    const dw = num(r.duels_won);
    const tot = duelTotal.get(r.fid);
    if (dw != null && tot) {
      const pct = 100 * dw / tot;
      T.sums.duel_win_pct = (T.sums.duel_win_pct || 0) + pct;
      T.nKeys.duel_win_pct = (T.nKeys.duel_win_pct || 0) + 1;
    }
  }
  const teams = [];
  for (const T of by.values()) {
    const mean = {};
    for (const [k, s] of Object.entries(T.sums)) {
      mean[k] = T.nKeys[k] ? s / T.nKeys[k] : null;
    }
    teams.push({ competition: T.competition, teamSm: T.teamSm, n: T.n, mean });
  }
  return teams;
}

function scoreTeam(mean, dims, poolMeans) {
  const details = [];
  const scores = [];
  for (const [name, isStyle, parts] of dims) {
    const partRows = [];
    const ps = [];
    for (const [key, inv, lab] of parts) {
      const me = mean[key];
      const vals = poolMeans.map((q) => q[key]).filter((v) => v != null && Number.isFinite(v));
      const perc = percentile(me, vals, inv);
      partRows.push({ key, label: lab, value: me, percentile: perc, invert: inv, n: vals.length, avg: poolAvg(vals) });
      if (perc != null) ps.push(perc);
    }
    const sc = ps.length ? (ps.reduce((a, b) => a + b, 0) / ps.length) : null;
    scores.push(sc);
    details.push({ name, score: sc, style_volume: !!isStyle, parts: partRows });
  }
  return { scores, details, complete: scores.every((s) => s != null) };
}

function buildIndex(asOf) {
  const db = openDb();
  if (!db) {
    return { ok: false, reason: 'missing_source', noteZh: '六围数据源尚未就绪', asOf, players: [], teams: [] };
  }
  const pRows = db.prepare(`
    SELECT * FROM player_match
    WHERE is_club_league = 1 AND date IS NOT NULL AND date < ? AND minutes > 0
  `).all(asOf);
  const tRows = db.prepare(`
    SELECT * FROM team_match
    WHERE date IS NOT NULL AND date < ? AND competition IS NOT NULL AND competition != ''
  `).all(asOf);
  const fxRange = db.prepare(`
    SELECT MIN(date), MAX(date) FROM player_match
    WHERE is_club_league = 1 AND date IS NOT NULL AND date < ?
  `).get(asOf);
  const windowStart = fxRange && fxRange['MIN(date)'];
  const windowEnd = fxRange && fxRange['MAX(date)'];

  const aggregated = aggregatePlayers(pRows);
  const players = aggregated.filter((p) => p.minutes >= minMinutesForLeague(p.league));
  const belowGate = aggregated
    .filter((p) => p.minutes < minMinutesForLeague(p.league))
    .map((p) => ({ smId: p.smId, name: p.name, league: p.league, minutes: p.minutes, apps: p.apps }));
  const teams = aggregateTeams(tRows);

  // Name index for careful matching
  const names = new Map(); // folded name -> [player]
  for (const p of players) {
    const f = foldName(p.name);
    if (!f) continue;
    if (!names.has(f)) names.set(f, []);
    names.get(f).push(p);
  }
  const teamNames = new Map();
  try {
    for (const r of db.prepare('SELECT sm_id, names FROM teams').all()) {
      teamNames.set(Number(r.sm_id), String(r.names || ''));
    }
  } catch (_) {}

  return {
    ok: true,
    asOf,
    windowStart,
    windowEnd,
    nSourceRows: pRows.length,
    nEligiblePlayers: players.length,
    nTeamRows: tRows.length,
    nBelowGate: belowGate.length,
    players,
    belowGate,
    teams,
    names,
    teamNames,
    builtAt: new Date().toISOString(),
  };
}

function foldName(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastName(folded) {
  const parts = folded.split(' ').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : folded;
}

function indexKey(asOf) { return String(asOf || ''); }

/** Max parsed slim indexes kept in process memory. Each is ~20-25MB. */
const INDEX_MEM_MAX = 2;

function attachNameIndexes(idx) {
  if (!idx) return idx;
  const names = new Map();
  for (const p of idx.players || []) {
    const f = foldName(p.name);
    if (!f) continue;
    if (!names.has(f)) names.set(f, []);
    names.get(f).push(p);
  }
  idx.names = names;
  if (idx.teamNames && !(idx.teamNames instanceof Map)) {
    try { idx.teamNames = new Map(idx.teamNames); } catch (_) { idx.teamNames = new Map(); }
  }
  return idx;
}

function listAsofFiles() {
  const dir = INDEX_DIR();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => {
      const m = /^asof-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      return m ? { date: m[1], fp: path.join(dir, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function readSlimIndex(fp) {
  const slim = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (!slim || slim.ok === false || !Array.isArray(slim.players) || !slim.players.length) return null;
  return attachNameIndexes(slim);
}

function clearIndexMem() { mem.clear(); }

function evictIndexMem() {
  while (mem.size > INDEX_MEM_MAX) {
    const oldest = mem.keys().next().value;
    mem.delete(oldest);
  }
}

function rememberIndex(cacheKey, idx) {
  if (mem.has(cacheKey)) mem.delete(cacheKey);
  mem.set(cacheKey, idx);
  evictIndexMem();
  return idx;
}

function loadIndex(asOf) {
  const key = indexKey(asOf);
  const dir = INDEX_DIR();
  const exact = path.join(dir, `asof-${key}.json`);
  let fileKey = null;
  try {
    if (fs.existsSync(exact)) fileKey = exact;
    else {
      const earlier = listAsofFiles().filter((x) => x.date <= key).pop();
      if (earlier) fileKey = earlier.fp;
    }
  } catch (e) {
    console.warn('match-radar index lookup', e.message);
  }
  // Cache by source file, not by every match date. Many asOf dates share one asof-*.json.
  if (fileKey && mem.has(fileKey)) return mem.get(fileKey);
  if (mem.has(key)) return mem.get(key);
  // Prefer a prebuilt windowed index so production can serve without
  // shipping the rich sqlite, and so first request is not a rebuild.
  try {
    if (fileKey) {
      const idx = readSlimIndex(fileKey);
      if (idx) return rememberIndex(fileKey, idx);
    }
  } catch (e) {
    console.warn('match-radar index read', e.message);
  }
  const idx = buildIndex(asOf);
  rememberIndex(fileKey || key, idx);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (idx && idx.ok) fs.writeFileSync(exact, JSON.stringify(slimIndex(idx)));
  } catch (e) {
    console.warn('match-radar index write', e.message);
  }
  return idx;
}

function slimIndex(idx) {
  if (!idx || !idx.ok) return idx;
  // Persist scores-ready player stubs (no Maps).
  return {
    ok: true,
    asOf: idx.asOf,
    windowStart: idx.windowStart,
    windowEnd: idx.windowEnd,
    nSourceRows: idx.nSourceRows,
    nEligiblePlayers: idx.nEligiblePlayers,
    nTeamRows: idx.nTeamRows,
    nBelowGate: (idx.belowGate || []).length,
    builtAt: idx.builtAt,
    players: idx.players.map((p) => ({
      smId: p.smId, name: p.name, league: p.league, minutes: p.minutes, apps: p.apps,
      posId: p.posId, dpos: p.dpos, teamSm: p.teamSm, m: p.m, tbMins: p.tbMins, tbApps: p.tbApps,
    })),
    belowGate: (idx.belowGate || []).map((p) => ({
      smId: p.smId, name: p.name, league: p.league, minutes: p.minutes, apps: p.apps,
    })),
    teams: idx.teams,
    teamNames: [...(idx.teamNames || new Map())].map(([k, v]) => [k, v]),
  };
}

function smIdFromPhoto(url) {
  if (!url) return null;
  const m = String(url).match(/cdn\.sportmonks\.com\/images\/soccer\/players\/\d+\/(\d+)\.(?:png|jpg|jpeg|webp)/i);
  return m ? Number(m[1]) : null;
}

function smIdFromPid(id) {
  const s = String(id || '');
  if (s.startsWith('sm:')) {
    const n = Number(s.slice(3));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function matchClub(agg, club, teamNames) {
  if (!club || !agg) return false;
  const c = foldName(club);
  if (!c) return false;
  const names = teamNames.get(Number(agg.teamSm)) || '';
  const folded = foldName(names);
  if (!folded) return false;
  if (folded.includes(c) || c.includes(folded)) return true;
  // token overlap (real madrid / 皇马 won't match; english names from packs will)
  const ct = new Set(c.split(' ').filter((t) => t.length > 2));
  const nt = new Set(folded.split(' ').filter((t) => t.length > 2));
  let hit = 0;
  for (const t of ct) if (nt.has(t)) hit++;
  return hit >= 1 && (hit >= 2 || c.length < 16);
}

function mapRosterPlayer(p, idx) {
  const photoId = smIdFromPhoto(p.photo || p.image || p.headshot);
  if (photoId && idx.players.some((x) => x.smId === photoId)) {
    return { smId: photoId, how: 'photo', eligible: true };
  }
  if (photoId) return { smId: photoId, how: 'photo', eligible: false, reason: 'minutes_or_pool' };
  const fromId = smIdFromPid(p.id) || smIdFromPid(p.smId) || smIdFromPid(p.playerId);
  if (fromId && idx.players.some((x) => x.smId === fromId)) {
    return { smId: fromId, how: 'id', eligible: true };
  }
  // Careful name + club matching only. Never guess among collisions.
  const folded = foldName(p.name) || foldName(p.nameEn);
  const zh = String(p.nameZh || '');
  let cands = folded && idx.names.get(folded) ? idx.names.get(folded).slice() : [];
  if (!cands.length && folded) {
    const ln = lastName(folded);
    if (ln && ln.length >= 4) {
      for (const [k, arr] of idx.names) {
        if (lastName(k) === ln) cands.push(...arr);
      }
    }
  }
  // Unique name, or name+club unique.
  const club = p.club || p.team || p.clubEn || '';
  const clubHit = cands.filter((c) => matchClub(c, club, idx.teamNames));
  const use = clubHit.length === 1 ? clubHit : (cands.length === 1 ? cands : []);
  if (use.length === 1) {
    return { smId: use[0].smId, how: clubHit.length === 1 ? 'name+club' : 'name', eligible: true };
  }
  return { smId: null, how: 'unmapped', eligible: false, reason: 'unmapped', zh, name: p.name };
}

function resolvePool(idx, league, plan) {
  let key = plan.poolKey;
  let fallbackNote = '';
  const thresh = minMinutesForLeague(league);
  if (plan.preferAm || key === 'AM') {
    const am = idx.players.filter((p) => p.league === league && p.minutes >= thresh && inPool(p, 'AM'));
    if (am.length < AM_THIN) {
      key = 'MID';
      fallbackNote = `攻击型中场满 ${thresh} 分钟仅 ${am.length} 人，样本偏少，对照改用全部中场`;
    } else {
      key = 'AM';
    }
  }
  const pool = idx.players.filter((p) => p.league === league && p.minutes >= thresh && inPool(p, key));
  return { key, pool, fallbackNote };
}

function findBelowGate(idx, smId) {
  if (!idx || smId == null) return null;
  const list = idx.belowGate || [];
  const id = Number(smId);
  return list.find((p) => Number(p.smId) === id) || null;
}


function useXgFinishingEnabled() {
  return process.env.RADAR_USE_XG === '1';
}

/** Share of eligible players in a league who have a non-null xg90. */
function leagueXgCoverage(idx, league) {
  if (!idx || !idx.players || !league) return 0;
  const thresh = minMinutesForLeague(league);
  const pool = idx.players.filter((p) => p.league === league && p.minutes >= thresh);
  if (!pool.length) return 0;
  const withXg = pool.filter((p) => p.m && p.m.xg90 != null && Number.isFinite(p.m.xg90)).length;
  return withXg / pool.length;
}

function leagueHasXg(idx, league, cover) {
  const need = cover == null ? XG_LEAGUE_COVER : cover;
  return leagueXgCoverage(idx, league) >= need;
}

/**
 * Pick finishing / threat axes. Default (no env flag) keeps today's chart.
 * When RADAR_USE_XG=1: use xG axes only if this league is well covered and
 * this player has xg90; otherwise keep the old axes so the hexagon still draws.
 */
function axesFor(plan, agg, idx) {
  const base = plan && plan.axes;
  if (!base) return { axes: null, xgMode: false };
  if (!useXgFinishingEnabled()) return { axes: base, xgMode: false };
  const isHA = base === HA_AXES;
  const isSI = base === SI_AXES;
  if (!isHA && !isSI) return { axes: base, xgMode: false };
  if (!leagueHasXg(idx, agg && agg.league)) return { axes: base, xgMode: false };
  if (!agg || !agg.m || agg.m.xg90 == null || !Number.isFinite(agg.m.xg90)) {
    return { axes: base, xgMode: false, xgMissing: true };
  }
  return { axes: isHA ? HA_AXES_XG : SI_AXES_XG, xgMode: true };
}

function shootingCompare(m) {
  if (!m) return null;
  const xg = m.xg90;
  const xgot = m.xgot90;
  const goals = m.goals90;
  if (xg == null && xgot == null) return null;
  return {
    xg90: xg == null ? null : Number(xg),
    xgot90: xgot == null ? null : Number(xgot),
    goals90: goals == null ? null : Number(goals),
    noteZh: 'xG / xGoT 仅作对照数字，不单独占六围轴',
  };
}

function scoreOne(agg, idx) {
  const plan = rolePlan(agg.posId, agg.dpos);
  if (!plan.axes) {
    return { ok: false, reason: 'no_axes', noteZh: '该位置尚无六围轴（第一期未覆盖边后卫等）', plan, agg };
  }
  const { key, pool, fallbackNote } = resolvePool(idx, agg.league, plan);
  const floor = poolFloorFor(agg.league, key);
  if (pool.length < floor) {
    return {
      ok: false, reason: 'thin_pool', plan, poolKey: key, poolN: pool.length,
      noteZh: `样本不足（${agg.league}${({ CF: '中锋', MID: '中场', CB: '中后卫', GK: '门将', ATT: '前锋', AM: '攻击型中场' }[key] || '')}对照 ${pool.length} 人，不足 ${floor}）`,
      agg, fallbackNote,
    };
  }
  const mainFloor = poolKey => (poolKey === 'GK' ? GK_POOL_FLOOR : PLAYER_POOL_FLOOR);
  const thinPool = !isMainLeague(agg.league) && pool.length < mainFloor(key);
  const thinPoolNote = thinPool ? `对照仅 ${pool.length} 人，样本偏少` : '';
  const lowValue = isLowValueMinutes(agg.minutes, agg.league);
  const picked = axesFor(plan, agg, idx);
  const scored = scoreAxes(agg.m, picked.axes, pool.map((p) => p.m));
  if (!scored.complete) {
    return {
      ok: false, reason: 'incomplete', plan, poolKey: key, poolN: pool.length,
      noteZh: '分项不足，不画出残缺六边形', details: scored.details, agg, fallbackNote,
      xgMode: !!picked.xgMode,
    };
  }
  const avgM = {};
  const metricKeys = new Set();
  for (const q of pool) {
    for (const k of Object.keys(q.m || {})) {
      if (k.startsWith('_')) continue;
      metricKeys.add(k);
    }
  }
  for (const k of metricKeys) {
    avgM[k] = poolAvg(pool.map((q) => q.m[k]));
  }
  const poolScored = scoreAxes(avgM, picked.axes, pool.map((q) => q.m));
  return {
    ok: true,
    reason: 'ok',
    plan,
    poolKey: key,
    poolN: pool.length,
    fallbackNote,
    xgMode: !!picked.xgMode,
    xgMissing: !!picked.xgMissing,
    poolLabel: captionFor(agg.league, plan, key, pool.length, ''),
    lowValue,
    lowValueChip: lowValue ? '参考价值偏低' : '',
    lowValueNote: lowValue ? lowValueNote(agg.minutes, agg.apps) : '',
    thinPool,
    thinPoolNote,
    scores: scored.scores,
    details: scored.details,
    poolScores: poolScored.scores,
    poolDetails: poolScored.details,
    agg,
  };
}

function pickUpTo3(mapped, side) {
  // Highest market value first. Keep the top two even if they share a
  // role; use the third slot for a different role when one exists.
  const drawable = mapped.filter((x) => x.score && x.score.ok);
  drawable.sort((a, b) => (Number(b.roster.eur) || 0) - (Number(a.roster.eur) || 0));
  if (drawable.length <= 3) return drawable;
  const groupOf = (x) => {
    const k = (x.score && (x.score.poolKey || (x.score.plan && x.score.plan.poolKey))) || '';
    if (k === 'AM' || k === 'MID') return 'MID';
    if (k === 'CF' || k === 'ATT') return 'ATT';
    return k || 'X';
  };
  const picked = [drawable[0]];
  if (drawable[1]) picked.push(drawable[1]);
  const used = new Set(picked.map(groupOf));
  const diverse = drawable.find((x) => !picked.includes(x) && !used.has(groupOf(x)));
  if (diverse) picked.push(diverse);
  else if (drawable[2]) picked.push(drawable[2]);
  return picked.slice(0, 3);
}

function playerPayload(x) {
  const s = x.score;
  const p = x.roster;
  const agg = s.agg;
  const plan = s.plan;
  return {
    id: p.id || (agg ? 'sm:' + agg.smId : ''),
    smId: agg ? agg.smId : null,
    name: p.name || (agg && agg.name) || '',
    nameZh: p.nameZh || p.name || (agg && agg.name) || '',
    side: x.side,
    role: plan.role,
    roleZh: plan.roleZh,
    axesUsed: plan.poolKey,
    poolKey: s.poolKey,
    poolLabel: [s.poolLabel, s.fallbackNote, s.thinPoolNote].filter(Boolean).join('。'),
    poolLabelShort: captionShort(agg.league, plan, s.poolKey, s.poolN),
    poolN: s.poolN,
    minutes: agg.minutes,
    apps: agg.apps,
    league: agg.league,
    wingerOverride: plan.wingerOverride || null,
    fallbackNote: s.fallbackNote || '',
    lowValue: !!s.lowValue,
    lowValueChip: s.lowValueChip || (s.lowValue ? '参考价值偏低' : ''),
    lowValueNote: s.lowValueNote || (s.lowValue ? lowValueNote(agg.minutes, agg.apps) : ''),
    thinPool: !!s.thinPool,
    thinPoolNote: s.thinPoolNote || '',
    photo: p.photo || '',
    club: clubDisplayZh(p.club || ''),
    eur: p.eur || 0,
    text: p.text || '',
    dims: s.details,
    scores: s.scores,
    poolScores: s.poolScores || null,
    poolDetails: s.poolDetails || null,
    mapHow: x.map.how,
    pid: p.id || '',
    drawable: true,
    xgMode: !!s.xgMode,
    shooting: shootingCompare(agg && agg.m),
  };
}

const LISTED_REASON_ZH = {
  unmapped: '未能对应到统计',
  below_minutes: `窗口内俱乐部联赛不足 ${MIN_MIN} 分钟`,
  minutes_or_pool: `窗口内俱乐部联赛不足 ${MIN_MIN} 分钟`,
  no_axes: '该位置尚无六围轴（第一期未覆盖边后卫等）',
  thin_pool: '对照群样本不足',
  incomplete: '分项不足，未画图',
};

function listedPayload(x) {
  if (x.score && x.score.ok) return playerPayload(x);
  const p = x.roster || {};
  const plan = x.score && x.score.plan;
  const reason = (x.score && x.score.reason)
    || (x.map && x.map.reason)
    || 'unmapped';
  const noteZh = (x.score && x.score.noteZh)
    || LISTED_REASON_ZH[reason]
    || '暂无法画图';
  const roleZh = (plan && plan.roleZh)
    || p.roleZh || p.posZh || p.positionZh || p.lineZh || p.pos || '';
  return {
    id: p.id || '',
    smId: (x.map && x.map.smId) || null,
    name: p.name || '',
    nameZh: p.nameZh || p.name || '',
    side: x.side,
    role: (plan && plan.role) || '',
    roleZh,
    photo: p.photo || p.image || p.headshot || '',
    club: clubDisplayZh(p.club || p.team || ''),
    eur: p.eur || 0,
    minutes: (x.score && x.score.agg && x.score.agg.minutes) || null,
    league: (x.score && x.score.agg && x.score.agg.league) || '',
    drawable: false,
    reason,
    noteZh,
    mapHow: (x.map && x.map.how) || '',
    pid: p.id || '',
  };
}

function sortListed(list) {
  return list.slice().sort((a, b) => {
    if (!!b.drawable !== !!a.drawable) return a.drawable ? -1 : 1;
    return (Number(b.eur) || 0) - (Number(a.eur) || 0);
  });
}


function shortPlayerName(nameZh, name) {
  const zh = String(nameZh || '').trim();
  if (zh.includes('·')) {
    const last = zh.split('·').filter(Boolean).pop();
    if (last) return last;
  }
  if (zh.includes(' ')) {
    const last = zh.split(/\s+/).filter(Boolean).pop();
    if (last) return last;
  }
  if (zh && zh.length <= 6) return zh;
  const en = String(name || '').trim();
  if (en) {
    const last = en.split(/\s+/).filter(Boolean).pop();
    if (last) return last;
  }
  return zh || en || '';
}

function lineOfMapped(x) {
  const plan = x.score && x.score.plan;
  const agg = (x.score && x.score.agg) || null;
  const role = (plan && plan.role) || '';
  const roleZh = (plan && plan.roleZh) || (x.roster && (x.roster.roleZh || x.roster.posZh || x.roster.positionZh)) || '';
  const posId = agg && agg.posId != null ? Number(agg.posId) : null;
  const blob = `${role} ${roleZh} ${(x.roster && (x.roster.pos || x.roster.line || x.roster.position)) || ''}`;
  if ((plan && plan.poolKey === 'GK') || posId === 24 || /门将|\bGK\b/.test(blob)) return 'GK';
  if ((plan && (plan.poolKey === 'ATT' || plan.poolKey === 'CF'))
    || posId === 27
    || /中锋|前锋|边锋|影锋|\b(CF|LW|RW|SS|ST|FW|ATT)\b/.test(blob)) return 'ATT';
  if ((plan && plan.poolKey === 'CB')
    || posId === 25
    || /后卫|\b(CB|LB|RB|WB|LWB|RWB|DF|DEF)\b/.test(blob)) return 'DEF';
  if ((plan && (plan.poolKey === 'MID' || plan.poolKey === 'AM'))
    || posId === 26
    || /中场|后腰|前腰|\b(AM|CM|DM|LM|RM|MF|MID)\b/.test(blob)) return 'MID';
  return 'MID';
}

function aggOfMapped(x, idx) {
  if (x.score && x.score.agg) return x.score.agg;
  const id = x.map && x.map.smId;
  if (id && idx && Array.isArray(idx.players)) {
    return idx.players.find((p) => p.smId === Number(id)) || null;
  }
  return null;
}

/**
 * Theoretical strongest XI from a side's published roster.
 * 1 GK + 4 DEF + 3 MID + 3 ATT, market value first; leftover
 * slots fill from adjacent lines then any remaining, never invented.
 */
function pickBestXi(mapped, idx) {
  const people = (mapped || []).map((x) => {
    const roster = x.roster || {};
    const agg = aggOfMapped(x, idx);
    return {
      rec: x,
      roster,
      agg: agg || null,
      line: lineOfMapped(x),
      eur: Number(roster.eur) || 0,
      minutes: (agg && agg.minutes) || 0,
      smId: (agg && agg.smId) || (x.map && x.map.smId) || null,
      name: roster.name || (agg && agg.name) || '',
      nameZh: roster.nameZh || roster.name || (agg && agg.name) || '',
      photo: roster.photo || roster.image || '',
      club: roster.club || '',
      hasStats: !!(agg && agg.m),
    };
  });
  people.sort((a, b) => (b.eur - a.eur) || (b.minutes - a.minutes) || String(a.nameZh).localeCompare(String(b.nameZh), 'zh'));
  const groups = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of people) (groups[p.line] || groups.MID).push(p);
  const used = new Set();
  const picked = [];
  function take(list, n) {
    const out = [];
    for (const p of list) {
      if (out.length >= n) break;
      if (used.has(p)) continue;
      used.add(p);
      out.push(p);
    }
    return out;
  }
  picked.push(...take(groups.GK, XI_SLOTS.GK));
  picked.push(...take(groups.DEF, XI_SLOTS.DEF));
  picked.push(...take(groups.MID, XI_SLOTS.MID));
  picked.push(...take(groups.ATT, XI_SLOTS.ATT));
  const missing = {
    GK: XI_SLOTS.GK - picked.filter((p) => p.line === 'GK').length,
    DEF: XI_SLOTS.DEF - picked.filter((p) => p.line === 'DEF').length,
    MID: XI_SLOTS.MID - picked.filter((p) => p.line === 'MID').length,
    ATT: XI_SLOTS.ATT - picked.filter((p) => p.line === 'ATT').length,
  };
  const leftovers = people.filter((p) => !used.has(p));
  const neighbor = { GK: ['DEF'], DEF: ['MID', 'GK'], MID: ['ATT', 'DEF'], ATT: ['MID'] };
  for (const line of ['GK', 'DEF', 'MID', 'ATT']) {
    let need = missing[line];
    if (need <= 0) continue;
    for (const nb of (neighbor[line] || [])) {
      const more = take(leftovers.filter((p) => p.line === nb), need);
      picked.push(...more);
      need -= more.length;
      if (need <= 0) break;
    }
    if (need > 0) {
      const more = take(leftovers, need);
      picked.push(...more);
    }
  }
  if (picked.length < 11) picked.push(...take(leftovers, 11 - picked.length));
  // Prefer players with stats when a no-stat pick can swap with a same-line leftover that has stats.
  for (let i = 0; i < picked.length; i++) {
    if (picked[i].hasStats) continue;
    const swap = leftovers.find((p) => !used.has(p) && p.hasStats && p.line === picked[i].line);
    if (swap) {
      used.delete(picked[i]);
      used.add(swap);
      picked[i] = swap;
    }
  }
  return picked.slice(0, 11);
}

function xiWeight(p, weightKey) {
  const m = p && p.agg && p.agg.m;
  if (!m) return 0;
  const mins = p.minutes || (p.agg && p.agg.minutes) || 0;
  const raw = m._raw || {};
  if (weightKey === 'aer_n') return (Number(raw.aer_w) || 0) + (Number(raw.aer_l) || 0);
  if (weightKey === 'total_duels') return Number(raw.total_duels) || 0;
  if (weightKey === 'saves') return Number(raw.saves) || 0;
  if (weightKey === 'passes') {
    if (m.passes90 != null && mins) return (Number(m.passes90) * mins) / 90;
    return 0;
  }
  if (weightKey && m[weightKey] != null && Number.isFinite(Number(m[weightKey]))) {
    return Number(m[weightKey]);
  }
  return 0;
}

function combineXiPart(xi, key, mode, weightKey) {
  const rows = (xi || []).filter((p) => p.hasStats && p.agg && p.agg.m);
  if (mode === 'wavg') {
    let num = 0, den = 0, used = 0;
    let best = null, bestC = -1;
    for (const p of rows) {
      const v = p.agg.m[key];
      if (v == null || !Number.isFinite(Number(v))) continue;
      const w = xiWeight(p, weightKey);
      if (w <= 0) continue;
      num += Number(v) * w;
      den += w;
      used += 1;
      if (w * Math.abs(Number(v)) > bestC) {
        bestC = w * Math.abs(Number(v));
        best = { player: p, value: Number(v), weight: w };
      }
    }
    if (!den) return { value: null, contributor: null, n: 0 };
    return { value: num / den, contributor: best, n: used };
  }
  // mean of per-90 (or of the raw rate already on m)
  const vals = [];
  let best = null, bestV = -Infinity;
  for (const p of rows) {
    const v = p.agg.m[key];
    if (v == null || !Number.isFinite(Number(v))) continue;
    const n = Number(v);
    vals.push(n);
    if (n > bestV) { bestV = n; best = { player: p, value: n }; }
  }
  if (!vals.length) return { value: null, contributor: null, n: 0 };
  const value = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { value, contributor: best, n: vals.length };
}

function contributorPayload(c) {
  if (!c || !c.player) return null;
  const p = c.player;
  const minutes = p.minutes || (p.agg && p.agg.minutes) || 0;
  const apps = p.apps || (p.agg && p.agg.apps) || 0;
  const league = (p.agg && p.agg.league) || p.league || '';
  const lowValue = isLowValueMinutes(minutes, league);
  return {
    nameZh: p.nameZh || p.name || '',
    name: p.name || '',
    short: shortPlayerName(p.nameZh, p.name),
    smId: p.smId || null,
    photo: p.photo || '',
    line: p.line,
    value: c.value,
    minutes,
    apps,
    league,
    lowValue,
    lowValueChip: lowValue ? '参考价值偏低' : '',
    lowValueNote: lowValue ? lowValueNote(minutes, apps) : '',
  };
}

function aggregateXi(xi) {
  const details = [];
  const raw = {};
  for (const [dimName, isStyle, parts] of XI_DIMS) {
    const partRows = [];
    const contribs = [];
    for (const spec of parts) {
      const key = spec[0], inv = spec[1], lab = spec[2];
      const mode = spec[3] || 'mean';
      const weightKey = spec[4];
      const got = combineXiPart(xi, key, mode, weightKey);
      partRows.push({
        key, label: lab, value: got.value, invert: !!inv, n: got.n, mode,
      });
      raw[key] = got.value;
      if (got.contributor) contribs.push({ key, invert: !!inv, ...got.contributor, mode });
    }
    // Main contributor: first part with a contributor; for invert, pick lowest.
    let main = null;
    const firstKey = parts[0] && parts[0][0];
    const cands = contribs.filter((c) => c.key === firstKey);
    if (cands.length) {
      const inv = !!parts[0][1];
      cands.sort((a, b) => inv ? (a.value - b.value) : (b.value - a.value));
      main = cands[0];
    } else if (contribs.length) {
      contribs.sort((a, b) => (b.value - a.value));
      main = contribs[0];
    }
    details.push({
      name: dimName,
      style_volume: !!isStyle,
      parts: partRows,
      contributor: contributorPayload(main),
    });
  }
  return { details, raw };
}

function relativeXiScores(homeAgg, awayAgg) {
  const n = XI_DIMS.length;
  const homeScores = [];
  const awayScores = [];
  for (let i = 0; i < n; i++) {
    const parts = XI_DIMS[i][2];
    const hp = [], ap = [];
    for (let j = 0; j < parts.length; j++) {
      const inv = parts[j][1];
      const hv = homeAgg.details[i].parts[j].value;
      const av = awayAgg.details[i].parts[j].value;
      homeAgg.details[i].parts[j].other = av;
      awayAgg.details[i].parts[j].other = hv;
      if (hv == null && av == null) continue;
      const a = hv == null ? 0 : Number(hv);
      const b = av == null ? 0 : Number(av);
      if (inv) {
        const lo = Math.min(a, b);
        if (!a && !b) { hp.push(50); ap.push(50); continue; }
        // Lower is better: 100 at the lower value.
        hp.push(a === 0 && b === 0 ? 50 : (a <= 0 ? 100 : (lo / a) * 100));
        ap.push(a === 0 && b === 0 ? 50 : (b <= 0 ? 100 : (lo / b) * 100));
      } else {
        const hi = Math.max(a, b, 0);
        if (hi <= 0) { hp.push(50); ap.push(50); continue; }
        hp.push((a / hi) * 100);
        ap.push((b / hi) * 100);
      }
    }
    const hs = hp.length ? hp.reduce((x, y) => x + y, 0) / hp.length : null;
    const as_ = ap.length ? ap.reduce((x, y) => x + y, 0) / ap.length : null;
    homeScores.push(hs);
    awayScores.push(as_);
    homeAgg.details[i].score = hs;
    awayAgg.details[i].score = as_;
  }
  return { homeScores, awayScores, complete: homeScores.every((s) => s != null) && awayScores.every((s) => s != null) };
}

function xiMemberPayload(p) {
  return {
    nameZh: p.nameZh || p.name || '',
    name: p.name || '',
    short: shortPlayerName(p.nameZh, p.name),
    smId: p.smId || null,
    photo: p.photo || '',
    line: p.line,
    eur: p.eur || 0,
    minutes: p.minutes || 0,
    apps: (p.agg && p.agg.apps) || p.apps || 0,
    hasStats: !!p.hasStats,
    club: p.club || '',
    league: (p.agg && p.agg.league) || '',
    lowValue: isLowValueMinutes(p.minutes || (p.agg && p.agg.minutes) || 0, (p.agg && p.agg.league) || p.league || ''),
  };
}

function bestXiSide(mapped, idx, side, nameZh) {
  const xi = pickBestXi(mapped, idx);
  const withStats = xi.filter((p) => p.hasStats);
  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of xi) counts[p.line] = (counts[p.line] || 0) + 1;
  const agg = aggregateXi(xi);
  return {
    ok: withStats.length >= 1,
    side,
    nameZh: nameZh || '',
    kind: 'best-xi',
    formation: '4-3-3',
    xi: xi.map(xiMemberPayload),
    nXi: xi.length,
    nWithStats: withStats.length,
    lineCounts: counts,
    details: agg.details,
    dims: agg.details,
    raw: agg.raw,
    scores: null, // filled after relative scoring
    reason: withStats.length ? 'ok' : 'no_stats',
    noteZh: withStats.length
      ? (withStats.length < 11
        ? `理论最强 11 人里 ${withStats.length} 人有可合计的俱乐部联赛窗口数据`
        : '')
      : '公示名单上还没有可合计的俱乐部联赛窗口数据',
  };
}

function bestXiTeam(sides, idx, homeName, awayName) {
  const home = bestXiSide(sides.home, idx, 'home', homeName);
  const away = bestXiSide(sides.away, idx, 'away', awayName);
  const bothThin = home.nWithStats < XI_MIN_SIDE || away.nWithStats < XI_MIN_SIDE;
  if (bothThin && !(home.nWithStats && away.nWithStats)) {
    const bits = [];
    if (!home.nWithStats) bits.push(`${homeName || '主队'}暂无可以合计的球员`);
    if (!away.nWithStats) bits.push(`${awayName || '客队'}暂无可以合计的球员`);
    return {
      ok: false,
      kind: 'best-xi',
      reason: 'thin_xi',
      noteZh: bits.join('；') || '双方暂无理论最强 11 人所需的俱乐部数据',
      poolLabel: '',
      poolN: 0,
      dims: XI_DIMS.map((d) => d[0]),
      home,
      away,
    };
  }
  const rel = relativeXiScores(home, away);
  home.scores = rel.homeScores;
  away.scores = rel.awayScores;
  home.ok = rel.complete && home.nWithStats >= 1;
  away.ok = rel.complete && away.nWithStats >= 1;
  const ok = home.ok && away.ok;
  const countNote = `${homeName || '主队'} ${home.nWithStats} 人有数据，${awayName || '客队'} ${away.nWithStats} 人有数据`;
  const shortNote = home.nWithStats < 11 || away.nWithStats < 11
    ? `（不足 11 人的一边按现有名单合计，不补造）`
    : '';
  return {
    ok,
    kind: 'best-xi',
    reason: ok ? 'ok' : 'incomplete',
    noteZh: ok
      ? `按公示名单理论最强 11 人（1-4-3-3，身价优先）的俱乐部联赛窗口合计。${countNote}${shortNote}。`
      : (home.noteZh || away.noteZh || '理论最强 11 人六围暂无'),
    poolLabel: ok ? `理论最强 11 人 · ${countNote}` : '',
    poolN: Math.min(home.nWithStats, away.nWithStats),
    dims: XI_DIMS.map((d) => ({ name: d[0], style_volume: !!d[1] })),
    home,
    away,
  };
}

function teamPayload(idx, teamSm, competition, side, nameZh) {
  const empty = (reason, noteZh) => ({
    ok: false, side, nameZh: nameZh || '', teamSm: teamSm || null,
    competition: competition || '', reason, noteZh, dims: null, poolN: 0, poolLabel: '',
  });
  if (!teamSm || !competition) return empty('unmapped_team', '本场尚无球队对照所需的赛事统计');
  const me = idx.teams.find((t) => t.teamSm === Number(teamSm) && t.competition === competition);
  const pool = idx.teams.filter((t) => t.competition === competition && t.n >= TEAM_MIN_MATCHES);
  if (!me || me.n < TEAM_MIN_MATCHES) {
    return empty('thin_self', me
      ? `本队在「${competition}」窗口内仅 ${me.n} 场，不足 ${TEAM_MIN_MATCHES} 场`
      : `窗口内没有「${competition}」的球队统计`);
  }
  if (pool.length < TEAM_MIN_MATCHES) {
    // pool is teams, floor is ≥10 teams? Research used ≥10 matches per team, and 20 PL teams.
    // "Suggested team pool floor: ≥10 matches (research used this)." That's matches per team, not number of teams.
    // If only a few teams qualify, a percentile among 4 teams is noisy. Use at least 8 teams, else 暂无.
    return empty('thin_pool', `「${competition}」满 ${TEAM_MIN_MATCHES} 场的球队仅 ${pool.length} 支，样本不足`);
  }
  if (pool.length < 8) {
    return empty('thin_pool', `「${competition}」满 ${TEAM_MIN_MATCHES} 场的球队仅 ${pool.length} 支，样本不足`);
  }
  const scored = scoreTeam(me.mean, TEAM_DIMS, pool.map((t) => t.mean));
  if (!scored.complete) {
    return empty('incomplete', '分项不足，不画出残缺六边形');
  }
  return {
    ok: true,
    side,
    nameZh: nameZh || '',
    teamSm,
    competition,
    matches: me.n,
    poolN: pool.length,
    poolLabel: `${competition}，窗口内至少 ${TEAM_MIN_MATCHES} 场的 ${pool.length} 支球队`,
    dims: scored.details,
    scores: scored.scores,
    mean: me.mean,
    reason: 'ok',
    noteZh: '',
  };
}

function lookupFixture(db, m) {
  if (!db || !m) return null;
  const id = String(m.id || m.matchId || '');
  if (id) {
    const r = db.prepare('SELECT * FROM fixtures WHERE jc_match_id = ?').get(id);
    if (r) return r;
  }
  // name + date fallback is too risky; skip
  return null;
}

async function forMatch(m, opts = {}) {
  const asOf = String((opts.asOf || (m && (m.date || m.asOf)) || '')).slice(0, 10);
  if (!asOf) {
    return { ok: false, error: '缺少比赛日期', matchId: m && m.id };
  }
  const idx = loadIndex(asOf);
  if (!idx.ok) {
    return {
      ok: false,
      matchId: m && m.id,
      asOf,
      error: idx.noteZh || '六围数据源尚未就绪',
      reason: idx.reason,
    };
  }

  let squad = opts.squad || null;
  if (!squad && m) {
    try {
      squad = await require('./match-squad-value').forMatch(m, { force: !!opts.force });
    } catch (e) {
      squad = { ok: false, error: e.message };
    }
  }

  const windowNote = `球员对照其俱乐部联赛同位置的球员（主要联赛满 ${MIN_MIN} 分钟，其他俱乐部联赛满 ${RELAX_MIN} 分钟；窗口 ${idx.windowStart || ''} 至 ${idx.windowEnd || ''}，截至本场开赛前）。低于 ${MIN_MIN} 分钟的小联赛样本会标明参考价值偏低。不把欧冠、欧国联或国家队场次并入对照群。`;
  const teamNote = '球队六围按公示名单的理论最强 11 人（通常 1 门将 + 4 后卫 + 3 中场 + 3 前锋，身价优先），用他们俱乐部联赛窗口的合计对比；图上各轴旁边的名字是该队该项的主要贡献者。不是本场同一赛事的球队统计；不足 11 人如实标明，不补造。';

  const sides = { home: [], away: [] };
  const unmapped = { home: [], away: [] };
  const unscored = { home: [], away: [] };
  for (const side of ['home', 'away']) {
    const pack = (squad && squad[side]) || {};
    const players = pack.players || [];
    const mapped = [];
    for (const p of players) {
      const map = mapRosterPlayer(p, idx);
      const rec = { roster: p, side, map, score: null };
      if (!map.smId) {
        unmapped[side].push({ nameZh: p.nameZh || p.name, reason: 'unmapped' });
        mapped.push(rec);
        continue;
      }
      const agg = idx.players.find((x) => x.smId === map.smId);
      if (!agg) {
        const stub = findBelowGate(idx, map.smId);
        const noteZh = belowMinutesNote(stub && stub.league);
        rec.score = { ok: false, reason: 'below_minutes', noteZh, agg: stub || null };
        unscored[side].push({ nameZh: p.nameZh || p.name, reason: 'below_minutes', noteZh, smId: map.smId });
        mapped.push(rec);
        continue;
      }
      rec.score = scoreOne(agg, idx);
      if (!rec.score.ok) {
        unscored[side].push({
          nameZh: p.nameZh || p.name, reason: rec.score.reason, noteZh: rec.score.noteZh, smId: map.smId,
        });
      }
      mapped.push(rec);
    }
    sides[side] = mapped;
  }

  const homePicked = pickUpTo3(sides.home, 'home').filter((x) => x.score && x.score.ok);
  const awayPicked = pickUpTo3(sides.away, 'away').filter((x) => x.score && x.score.ok);

  const db = openDb();
  const fx = lookupFixture(db, m);
  const competition = (m && (m.league || m.leagueZh || m.comp)) || (fx && fx.competition) || '';
  const homeName = (squad && squad.home && squad.home.nameZh) || (m && m.home) || '主队';
  const awayName = (squad && squad.away && squad.away.nameZh) || (m && m.away) || '客队';
  const team = bestXiTeam(sides, idx, homeName, awayName);

  function sideNote(side) {
    const u = unmapped[side];
    const s = unscored[side];
    const bits = [];
    if (u.length) bits.push(`${u.length} 人未能对应到统计（未猜测分数）`);
    if (s.length) bits.push(`${s.length} 人分钟或对照群不足，未画图`);
    return bits.join('；');
  }

  return {
    ok: true,
    matchId: m && (m.id || m.matchId) || '',
    asOf,
    windowStart: idx.windowStart,
    windowEnd: idx.windowEnd,
    windowNote,
    teamNote,
    national: !!(squad && squad.national) || /欧国联|国际赛|国家队|Nations League|世界杯|欧洲杯/.test(competition),
    team,
    players: [
      ...homePicked.map(playerPayload),
      ...awayPicked.map(playerPayload),
    ],
    drawable: {
      home: sides.home.filter((x) => x.score && x.score.ok).map(playerPayload),
      away: sides.away.filter((x) => x.score && x.score.ok).map(playerPayload),
    },
    listed: {
      home: sortListed(sides.home.map(listedPayload)),
      away: sortListed(sides.away.map(listedPayload)),
    },
    coverage: {
      home: {
        nameZh: homeName,
        roster: ((squad && squad.home && squad.home.players) || []).length,
        picked: homePicked.length,
        unmapped: unmapped.home.length,
        unscored: unscored.home.length,
        noteZh: sideNote('home'),
        unmappedNames: unmapped.home.slice(0, 8).map((x) => x.nameZh),
        unscoredSample: unscored.home.slice(0, 8),
      },
      away: {
        nameZh: awayName,
        roster: ((squad && squad.away && squad.away.players) || []).length,
        picked: awayPicked.length,
        unmapped: unmapped.away.length,
        unscored: unscored.away.length,
        noteZh: sideNote('away'),
        unmappedNames: unmapped.away.slice(0, 8).map((x) => x.nameZh),
        unscoredSample: unscored.away.slice(0, 8),
      },
    },
    source: {
      kind: 'sportmonks-fixture-cache',
      nEligiblePlayers: idx.nEligiblePlayers,
      nSourceRows: idx.nSourceRows,
      builtAt: idx.builtAt,
    },
  };
}

function scorePlayerBySmId(smId, asOf) {
  const idx = loadIndex(asOf);
  if (!idx.ok) return { ok: false, reason: idx.reason };
  const agg = idx.players.find((p) => p.smId === Number(smId));
  if (!agg) {
    const stub = findBelowGate(idx, smId);
    const thresh = stub ? minMinutesForLeague(stub.league) : MIN_MIN;
    return { ok: false, reason: 'not_eligible', noteZh: `窗口内俱乐部联赛不足 ${thresh} 分钟，或不在数据源中`, agg: stub || null };
  }
  const scored = scoreOne(agg, idx);
  return { ok: !!scored.ok, asOf, windowStart: idx.windowStart, windowEnd: idx.windowEnd, scored, agg };
}

module.exports = {
  forMatch,
  loadIndex,
  buildIndex,
  scorePlayerBySmId,
  scoreOne,
  scoreAxes,
  rolePlan,
  HA_AXES,
  HA_AXES_XG,
  SI_AXES,
  SI_AXES_XG,
  DI_AXES,
  DO_AXES,
  XG_LEAGUE_COVER,
  axesFor,
  useXgFinishingEnabled,
  leagueXgCoverage,
  leagueHasXg,
  shootingCompare,
  TEAM_DIMS,
  XI_DIMS,
  XI_SLOTS,
  XI_MIN_SIDE,
  MIN_MIN,
  RELAX_MIN,
  PLAYER_POOL_FLOOR,
  GK_POOL_FLOOR,
  RELAX_POOL_FLOOR,
  RELAX_GK_POOL_FLOOR,
  MAIN_LEAGUES,
  isMainLeague,
  canonLeague,
  minMinutesForLeague,
  poolFloorFor,
  isLowValueMinutes,
  belowMinutesNote,
  lowValueNote,
  captionFor,
  captionShort,
  shortPlayerName,
  pickBestXi,
  bestXiTeam,
  lineOfMapped,
  slimIndex,
  clearIndexMem,
  closeDb,
  openDb,
  DB_PATH,
};
