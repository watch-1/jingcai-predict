(function (root) {
const api = {};
// 示例数据 — NOT real fixtures/odds. Used only when sporttery.cn is unreachable; UI labels it "示例数据".
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const FIX = [
  ['英超', '#3c1a6e', '曼城', '布伦特'], ['英超', '#3c1a6e', '阿森纳', '纽卡斯尔'], ['西甲', '#e0662b', '皇马', '比利亚雷'],
  ['意甲', '#1e5aa8', '国米', '罗马'], ['德甲', '#d4202a', '拜仁', '勒沃库森'], ['法甲', '#2b3f6b', '巴黎', '马赛'],
  ['荷甲', '#f07d00', '阿贾克斯', '费耶诺德'], ['葡超', '#00824a', '本菲卡', '波尔图'], ['日职', '#c4161c', '神户胜利', '川崎前锋'],
  ['韩职', '#1a3a7a', '蔚山现代', '全北现代'], ['英冠', '#6b4c9a', '利兹联', '谢周三'], ['澳超', '#e36f1e', '悉尼FC', '墨尔本城'],
  ['西甲', '#e0662b', '巴萨', '塞维利亚'], ['意甲', '#1e5aa8', '尤文', 'AC米兰'], ['德甲', '#d4202a', '多特', '莱比锡'],
];
function rng(seed) { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
function cnDate(offsetDays) {
  const d = new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3);
  return { iso: d.toISOString().slice(0, 10), wd: WEEK[d.getUTCDay()] };
}
function oddsFromProb(ph, pd, pa, margin = 1.12) {
  const r = p => Math.max(1.01, Math.round((1 / (p * margin)) * 100) / 100);
  return { h: r(ph), d: r(pd), a: r(pa) };
}
function makeMatch(i, dayOff, rand) {
  const [league, color, home, away] = FIX[i % FIX.length];
  const { iso, wd } = cnDate(dayOff);
  const strength = rand() * 1.6 - 0.5; // home advantage bias
  let ph = 0.36 + strength * 0.3; ph = Math.min(0.78, Math.max(0.14, ph));
  const pd = Math.max(0.14, 0.3 - Math.abs(strength) * 0.12);
  const pa = Math.max(0.06, 1 - ph - pd);
  const n = ph + pd + pa;
  const had = { ...oddsFromProb(ph / n, pd / n, pa / n), goalLine: '' };
  const gl = ph > pa ? -1 : +1;
  let hph, hpa; const hpd = 0.26;
  if (gl < 0) { hph = (ph / n) * 0.6; hpa = 1 - hph - hpd; } else { hpa = (pa / n) * 0.6; hph = 1 - hpa - hpd; }
  const hhad = { ...oddsFromProb(hph, hpd, hpa), goalLine: gl > 0 ? '+1' : '-1' };
  const hour = [15, 18, 19, 20, 22, 23, 1, 3][i % 8];
  return { id: `S${dayOff}${i}`, num: `${wd}${String(i + 1).padStart(3, '0')}`, league, leagueColor: color,
    date: iso, time: `${String(hour).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, businessDate: iso,
    home, away, homeRank: `[${1 + Math.floor(rand() * 18)}]`, awayRank: `[${1 + Math.floor(rand() * 18)}]`,
    had, hhad, status: 'Selling', sample: true };
}
api.matches = () => {
  const rand = rng(20260930); const out = [];
  for (let day = 0; day < 3; day++) for (let i = 0; i < (day === 0 ? 8 : 6); i++) out.push(makeMatch(i + day * 5, day, rand));
  return out;
};
api.results = () => {
  const rand = rng(777); const out = [];
  for (let day = 1; day <= 3; day++) for (let i = 0; i < 6; i++) {
    const m = makeMatch(i + day * 3, -day, rand);
    const hg = Math.floor(rand() * 4), ag = Math.floor(rand() * 3);
    const hh = Math.min(hg, Math.floor(rand() * 2)), ah = Math.min(ag, Math.floor(rand() * 2));
    out.push({ id: m.id, num: m.num, league: m.league, date: m.date, home: m.home, away: m.away,
      half: `${hh}:${ah}`, full: `${hg}:${ag}`, goalLine: m.hhad.goalLine, winFlag: hg > ag ? 'H' : hg === ag ? 'D' : 'A',
      had: { h: m.had.h, d: m.had.d, a: m.had.a }, status: '已完成', sample: true });
  }
  return out;
};

if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SAMPLE = api;
})(typeof self !== 'undefined' ? self : this);
