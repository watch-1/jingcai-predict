#!/usr/bin/env node
/**
 * Demo: what “对比” means — Model A (sporttery implied) vs Model B (odds + form blend)
 * FREE/existing data only: data/history/results.jsonl
 * Does NOT prove paid API lift.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const IN = process.env.IN || path.join(__dirname, '../data/history/results.jsonl');
const OUT_MD = process.env.OUT || '/workspace/predict-compare-demo.md';
const EVAL_N = Number(process.env.EVAL_N || 200); // holdout size (most recent)
const FORM_N = 5;
const W_ODDS = 0.75; // Model B blend weight on odds
const W_FORM = 0.25;
const HOME_ADV_PTS = 0.4; // mild home nudge in form space (points-scale ~0–3)

const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const valid = rows.filter(
  (r) => r.oddsH > 1 && r.oddsD > 1 && r.oddsA > 1 && ['H', 'D', 'A'].includes(r.winFlag)
);
valid.sort(
  (a, b) => String(a.matchDate).localeCompare(String(b.matchDate)) || Number(a.matchId) - Number(b.matchId)
);

function implied(h, d, a) {
  const ih = 1 / h,
    id = 1 / d,
    ia = 1 / a;
  const s = ih + id + ia;
  return { H: ih / s, D: id / s, A: ia / s };
}

function pickMax(p) {
  if (p.H >= p.D && p.H >= p.A) return 'H';
  if (p.D >= p.H && p.D >= p.A) return 'D';
  return 'A';
}

function renorm(p) {
  const s = p.H + p.D + p.A;
  if (!(s > 0)) return { H: 1 / 3, D: 1 / 3, A: 1 / 3 };
  return { H: p.H / s, D: p.D / s, A: p.A / s };
}

/** Chronological team history: append after each match; query last FORM_N before index */
const teamHist = new Map(); // teamId -> [{date, result: W|D|L, pts}]
function teamKey(id, name) {
  return id != null ? 'id:' + id : 'n:' + name;
}
function formPts(teamId, teamName) {
  const k = teamKey(teamId, teamName);
  const arr = teamHist.get(k) || [];
  const last = arr.slice(-FORM_N);
  if (!last.length) return null;
  const pts = last.reduce((s, x) => s + x.pts, 0);
  const max = last.length * 3;
  return { pts, n: last.length, rate: pts / max }; // 0..1
}
function pushResult(teamId, teamName, date, scored, conceded) {
  const k = teamKey(teamId, teamName);
  if (!teamHist.has(k)) teamHist.set(k, []);
  let pts = 1,
    result = 'D';
  if (scored > conceded) {
    pts = 3;
    result = 'W';
  } else if (scored < conceded) {
    pts = 0;
    result = 'L';
  }
  teamHist.get(k).push({ date, pts, result });
}

/** Form → crude 1X2 probs via home/away form rates + home adv */
function formProbs(hf, af) {
  // Default neutral if missing
  const hr = hf ? hf.rate : 0.45;
  const ar = af ? af.rate : 0.45;
  // Strength scores
  let sH = hr + HOME_ADV_PTS / 3;
  let sA = ar;
  let sD = 0.35 + 0.15 * (1 - Math.abs(hr - ar)); // closer form → more draw-ish
  // Softmax-ish
  const t = 2.2;
  const eH = Math.exp(t * sH),
    eD = Math.exp(t * sD),
    eA = Math.exp(t * sA);
  const z = eH + eD + eA;
  return { H: eH / z, D: eD / z, A: eA / z };
}

function blend(pOdds, pForm) {
  return renorm({
    H: W_ODDS * pOdds.H + W_FORM * pForm.H,
    D: W_ODDS * pOdds.D + W_FORM * pForm.D,
    A: W_ODDS * pOdds.A + W_FORM * pForm.A,
  });
}

function brier(p, actual) {
  const y = { H: 0, D: 0, A: 0 };
  y[actual] = 1;
  return (p.H - y.H) ** 2 + (p.D - y.D) ** 2 + (p.A - y.A) ** 2;
}

const cut = Math.max(0, valid.length - EVAL_N);
const evalSet = [];
let skippedNoForm = 0;

for (let i = 0; i < valid.length; i++) {
  const r = valid[i];
  const pA = implied(r.oddsH, r.oddsD, r.oddsA);
  const hf = formPts(r.homeTeamId, r.home);
  const af = formPts(r.awayTeamId, r.away);
  const pForm = formProbs(hf, af);
  const pB = blend(pA, pForm);
  const hasForm = !!(hf && af && hf.n >= 3 && af.n >= 3);

  if (i >= cut && hasForm) {
    evalSet.push({
      matchId: r.matchId,
      date: r.matchDate,
      league: r.league,
      home: r.home,
      away: r.away,
      ft: r.ft,
      actual: r.winFlag,
      odds: { H: r.oddsH, D: r.oddsD, A: r.oddsA },
      pA,
      pB,
      form: {
        home: hf ? `${hf.pts}/${hf.n * 3}(${hf.n}场)` : '无',
        away: af ? `${af.pts}/${af.n * 3}(${af.n}场)` : '无',
      },
      predA: pickMax(pA),
      predB: pickMax(pB),
      hitA: pickMax(pA) === r.winFlag,
      hitB: pickMax(pB) === r.winFlag,
      brierA: brier(pA, r.winFlag),
      brierB: brier(pB, r.winFlag),
    });
  } else if (i >= cut && !hasForm) {
    skippedNoForm++;
  }

  // update history AFTER prediction (no leakage)
  pushResult(r.homeTeamId, r.home, r.matchDate, r.homeScore, r.awayScore);
  pushResult(r.awayTeamId, r.away, r.matchDate, r.awayScore, r.homeScore);
}

const n = evalSet.length;
function pct(x) {
  return n ? +((x / n) * 100).toFixed(1) : 0;
}
const hitA = evalSet.filter((x) => x.hitA).length;
const hitB = evalSet.filter((x) => x.hitB).length;
const brierA = n ? evalSet.reduce((s, x) => s + x.brierA, 0) / n : 0;
const brierB = n ? evalSet.reduce((s, x) => s + x.brierB, 0) / n : 0;

// Draw-specific: among actual draws, how often did model pick D?
const draws = evalSet.filter((x) => x.actual === 'D');
const drawPickA = draws.filter((x) => x.predA === 'D').length;
const drawPickB = draws.filter((x) => x.predB === 'D').length;
// Among picks of D, precision
const pickDA = evalSet.filter((x) => x.predA === 'D');
const pickDB = evalSet.filter((x) => x.predB === 'D');

const outcome = { H: 0, D: 0, A: 0 };
for (const x of evalSet) outcome[x.actual]++;

// Pick interesting examples: disagree cases + clear hits/misses
const disagree = evalSet.filter((x) => x.predA !== x.predB);
const examples = [];
// Prefer: B correct A wrong, A correct B wrong, both correct, both wrong
const buckets = [
  disagree.filter((x) => x.hitB && !x.hitA),
  disagree.filter((x) => x.hitA && !x.hitB),
  evalSet.filter((x) => x.hitA && x.hitB),
  evalSet.filter((x) => !x.hitA && !x.hitB),
  disagree,
];
const used = new Set();
for (const bucket of buckets) {
  for (const x of bucket) {
    if (examples.length >= 5) break;
    if (used.has(x.matchId)) continue;
    used.add(x.matchId);
    examples.push(x);
  }
  if (examples.length >= 5) break;
}

function flagZh(f) {
  return f === 'H' ? '主胜' : f === 'D' ? '平' : '客胜';
}
function probsStr(p) {
  return `主${(p.H * 100).toFixed(0)}% / 平${(p.D * 100).toFixed(0)}% / 客${(p.A * 100).toFixed(0)}%`;
}
function verdict(x) {
  if (x.hitA && x.hitB) return '两模型都对';
  if (x.hitA && !x.hitB) return '仅A对';
  if (!x.hitA && x.hitB) return '仅B对';
  return '两模型都错';
}

const nDraws = draws.length;
const dateFrom = evalSet[0]?.date || '?';
const dateTo = evalSet[n - 1]?.date || '?';
const histFrom = valid[0].matchDate;
const histTo = valid[valid.length - 1].matchDate;

const md = `# 预测「对比」演示样例（免费/本地已有数据）

> **重要声明：** 本报告是用 App 已有体彩历史赛果+赔率做的 **演示样例**，用来说明「对比」长什么样。  
> **不是** 付费 API（Sportmonks / API-Football / xG）提升的证据。  
> 付费 xG / 过程指标对比需试用密钥后再做；**请勿据此下单付费套餐**。

生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（Asia/Shanghai）  
数据源：\`/workspace/tiicai-site/data/history/results.jsonl\`（体彩赛果+胜平负赔率，只读）

---

## 1. 「对比」是什么意思？

用 **同一批已完赛场次**，让两个（或多个）预测规则各自给出 胜/平/负 概率，再对照真实赛果，看：

| 指标 | 含义 | 好坏方向 |
|------|------|----------|
| **命中率（1X2）** | 选概率最高的那个结果，猜对的比例 | 越高越好 |
| **Brier score** | 三个结果概率与真实 one-hot 的均方误差 | **越低越好**（校准+锐度） |
| **平局说明** | 平局难猜；看模型是否敢选平、选对多少 | 单独看，避免被主胜偏好掩盖 |

本演示故意只用 **本地免费已有数据**，方法简单透明，方便理解流程；以后若试用付费 API，应用 **同样指标、同样场次集合** 再比一次才叫公平对比。

---

## 2. 两个模型（刻意简单）

### 模型 A：体彩胜平负隐含概率（去水）
1. 赔率 → 原始隐含：\`1/odds\`  
2. 去水归一：\`p = (1/o) / Σ(1/o)\`  
3. 预测 = 概率最大的那一项（主/平/客）

### 模型 B：赔率 + 近况战绩混合（透明启发式）
1. 用历史库按时间顺序，取每队赛前最近 **${FORM_N}** 场积分（胜3平1负0）→ 得分率  
2. 用主客得分率做一个粗糙的 form 概率（含轻微主场加成）  
3. 混合：\`pB = ${W_ODDS} × pA + ${W_FORM} × pForm\`，再归一  
4. 预测 = 概率最大项  

> 近况来自 **同一份 results.jsonl**（赛前历史，无未来泄漏），不是 ESPN 实时接口，也不需要新密钥。

---

## 3. 评估集

| 项 | 值 |
|----|-----|
| 历史库总场次（含赔率+赛果） | ${valid.length} |
| 历史日期范围 | ${histFrom} → ${histTo} |
| 评估场次（最近且双方≥3场近况） | **${n}** |
| 评估日期范围 | ${dateFrom} → ${dateTo} |
| 因近况不足跳过 | ${skippedNoForm} |
| 真实结果分布 | 主胜 ${outcome.H}（${pct(outcome.H)}%） / 平 ${outcome.D}（${pct(outcome.D)}%） / 客胜 ${outcome.A}（${pct(outcome.A)}%） |

---

## 4. 总表

| 模型 | 场次数 | 命中率（1X2） | Brier score（↓越好） | 预测为平的次数 | 平局命中（在真实平局里） |
|------|--------|---------------|----------------------|----------------|--------------------------|
| **A 纯赔率隐含** | ${n} | **${pct(hitA)}%**（${hitA}/${n}） | **${brierA.toFixed(4)}** | ${pickDA.length} | ${drawPickA}/${draws.length || 0} |
| **B 赔率+近况混合** | ${n} | **${pct(hitB)}%**（${hitB}/${n}） | **${brierB.toFixed(4)}** | ${pickDB.length} | ${drawPickB}/${draws.length || 0} |
| 差值 B−A | — | ${(pct(hitB) - pct(hitA)).toFixed(1)} 百分点 | ${(brierB - brierA).toFixed(4)} | — | — |

**读法提示：**
- 若 B 命中率略高 / Brier 略低 → 说明「加近况」在本评估窗有一点点帮助（或没有）。  
- 体彩隐含本身已经很强；简单近况混合 **通常只能带来边际变化**，这正是付费报告里说的：别指望轻易碾压赔率。  
- 平局：模型 A 几乎很少选平（最高隐含常是主或客）；B 若仍很少选平，说明混合权重仍偏赔率。

平局补充：真实平局 ${draws.length} 场；模型A选平且正确 ${pickDA.filter((x) => x.hitA).length}；模型B选平且正确 ${pickDB.filter((x) => x.hitB).length}。

---

## 5. 样例场次（${examples.length} 场）

| 日期 | 联赛 | 对阵 | 比分 | 结果 | 模型A概率（主/平/客） | 模型B概率 | A预测 | B预测 | 谁对 |
|------|------|------|------|------|----------------------|-----------|-------|-------|------|
${examples
  .map(
    (x) =>
      `| ${x.date} | ${x.league} | ${x.home} vs ${x.away} | ${x.ft} | ${flagZh(x.actual)} | ${probsStr(x.pA)} | ${probsStr(x.pB)} | ${flagZh(x.predA)} | ${flagZh(x.predB)} | ${verdict(x)} |`
  )
  .join('\n')}

### 样例明细（含近况）

${examples
  .map(
    (x, i) => `#### ${i + 1}. ${x.date} ${x.league} ${x.home} vs ${x.away}（${x.ft} → ${flagZh(x.actual)}）
- 体彩赔率：主 ${x.odds.H} / 平 ${x.odds.D} / 客 ${x.odds.A}
- 近况积分：主队 ${x.form.home}，客队 ${x.form.away}
- 模型A：${probsStr(x.pA)} → 选 **${flagZh(x.predA)}** ${x.hitA ? '✓' : '✗'}
- 模型B：${probsStr(x.pB)} → 选 **${flagZh(x.predB)}** ${x.hitB ? '✓' : '✗'}
- 结论：${verdict(x)}`
  )
  .join('\n\n')}

---

## 6. 这和「付费 API 对比」的关系

| 步骤 | 本演示 | 以后若试用付费 API |
|------|--------|-------------------|
| 场次集合 | 本地 results.jsonl 已完赛 | **同一批**（或更大 holdout） |
| 模型A | 体彩隐含（免费） | 仍作强基线 |
| 模型B/C | 近况混合（免费自算） | 可换成「隐含 + Elo + 滚动 xG」等 |
| 指标 | 命中率 + Brier | **同样指标** 才叫公平 |
| 结论 | 演示流程，非采购依据 | 试用期量化后再决定是否续费 |

**一句话：** 「对比」= 固定赛果集合上，用命中率/Brier 比谁准；本文件只是用免费数据把这个动作跑通给你看。

---

## 7. 复现

\`\`\`bash
node /workspace/tiicai-site/tools/predict-compare-demo.js
# 可选：EVAL_N=100 OUT=/workspace/predict-compare-demo.md node ...
\`\`\`

脚本路径：\`tools/predict-compare-demo.js\`  
报告路径：\`${OUT_MD}\`
`;

fs.writeFileSync(OUT_MD, md, 'utf8');

const summary = {
  n,
  dateFrom,
  dateTo,
  histTotal: valid.length,
  histFrom,
  histTo,
  modelA: { hitRatePct: pct(hitA), hits: hitA, brier: +brierA.toFixed(4), drawPicks: pickDA.length },
  modelB: { hitRatePct: pct(hitB), hits: hitB, brier: +brierB.toFixed(4), drawPicks: pickDB.length },
  deltaHitPct: +(pct(hitB) - pct(hitA)).toFixed(1),
  deltaBrier: +(brierB - brierA).toFixed(4),
  draws: draws.length,
  examples: examples.map((x) => ({
    date: x.date,
    match: `${x.home} vs ${x.away}`,
    ft: x.ft,
    actual: x.actual,
    predA: x.predA,
    predB: x.predB,
    verdict: verdict(x),
  })),
  report: OUT_MD,
};
console.log(JSON.stringify(summary, null, 2));
