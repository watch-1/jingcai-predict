#!/usr/bin/env node
const fs = require("fs");
const path = process.env.IN || "/opt/jingcai/data/history/results.jsonl";
const rows = fs.readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));

function implied(h, d, a) {
  const ih = 1 / h, id = 1 / d, ia = 1 / a;
  const s = ih + id + ia;
  return { H: ih / s, D: id / s, A: ia / s };
}

function pickMax(p) {
  if (p.H >= p.D && p.H >= p.A) return "H";
  if (p.D >= p.H && p.D >= p.A) return "D";
  return "A";
}

const valid = rows.filter((r) => r.oddsH > 1 && r.oddsD > 1 && r.oddsA > 1 && ["H", "D", "A"].includes(r.winFlag));
// time-ordered split: last 20% test
valid.sort((a, b) => String(a.matchDate).localeCompare(String(b.matchDate)) || Number(a.matchId) - Number(b.matchId));
const cut = Math.floor(valid.length * 0.8);
const train = valid.slice(0, cut);
const test = valid.slice(cut);

function evalSet(set, name) {
  let hit = 0;
  let stake = 0;
  let ret = 0;
  const by = { H: { n: 0, hit: 0 }, D: { n: 0, hit: 0 }, A: { n: 0, hit: 0 } };
  for (const r of set) {
    const p = implied(r.oddsH, r.oddsD, r.oddsA);
    const pred = pickMax(p);
    const odds = pred === "H" ? r.oddsH : pred === "D" ? r.oddsD : r.oddsA;
    stake += 1;
    by[pred].n++;
    if (pred === r.winFlag) {
      hit++;
      by[pred].hit++;
      ret += odds;
    }
  }
  const n = set.length;
  return {
    name,
    n,
    hitRate: n ? +(hit / n * 100).toFixed(2) : 0,
    roi: n ? +((ret - stake) / stake * 100).toFixed(2) : 0,
    byOutcome: Object.fromEntries(
      Object.entries(by).map(([k, v]) => [k, { n: v.n, hitRate: v.n ? +(v.hit / v.n * 100).toFixed(1) : 0 }])
    ),
  };
}

// Always-home / always-draw / random baselines on test
function fixed(set, flag) {
  let hit = 0;
  for (const r of set) if (r.winFlag === flag) hit++;
  return { flag, hitRate: +(hit / set.length * 100).toFixed(2) };
}

const dist = { H: 0, D: 0, A: 0 };
for (const r of valid) dist[r.winFlag]++;
const leagues = {};
for (const r of test) {
  const p = implied(r.oddsH, r.oddsD, r.oddsA);
  const pred = pickMax(p);
  const L = r.league || "?";
  if (!leagues[L]) leagues[L] = { n: 0, hit: 0 };
  leagues[L].n++;
  if (pred === r.winFlag) leagues[L].hit++;
}
const topLeagues = Object.entries(leagues)
  .filter(([, v]) => v.n >= 8)
  .map(([k, v]) => ({ league: k, n: v.n, hitRate: +(v.hit / v.n * 100).toFixed(1) }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 12);

const out = {
  total: valid.length,
  dateRange: { from: valid[0]?.matchDate, to: valid[valid.length - 1]?.matchDate },
  outcomeDistPct: {
    H: +((dist.H / valid.length) * 100).toFixed(1),
    D: +((dist.D / valid.length) * 100).toFixed(1),
    A: +((dist.A / valid.length) * 100).toFixed(1),
  },
  train: evalSet(train, "train"),
  test: evalSet(test, "test"),
  naiveOnTest: [fixed(test, "H"), fixed(test, "D"), fixed(test, "A")],
  topLeaguesOnTest: topLeagues,
  note: "Baseline = always pick the outcome with highest de-vigged implied probability from published 胜平负 odds. ROI assumes flat 1 unit stakes at those odds; tax/caps ignored.",
};
fs.writeFileSync("/opt/jingcai/data/history/baseline-report.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
