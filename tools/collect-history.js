#!/usr/bin/env node
/**
 * Collect sporttery football match results into JSONL for model training.
 * Run on the mainland server (sporttery is geo-blocked elsewhere).
 * Default MONTHS=18 (was 6) so more completed 竞彩 H2H pairs land in the local library.
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.SPORTTERY_BASE || "https://webapi.sporttery.cn";
const OUT = process.env.OUT || "/opt/jingcai/data/history/results.jsonl";
const MONTHS = Number(process.env.MONTHS || 18);
const PAGE_SIZE = 100;
const SLEEP_MS = Number(process.env.SLEEP_MS || 250);

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.sporttery.cn/",
  Origin: "https://www.sporttery.cn",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function bjYmd(d) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(d);
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return bjYmd(dt);
}

async function fetchPage(begin, end, pageNo) {
  const q = new URLSearchParams({
    matchBeginDate: begin,
    matchEndDate: end,
    leagueId: "",
    pageSize: String(PAGE_SIZE),
    pageNo: String(pageNo),
    isFix: "0",
    matchPage: "1",
    pcOrWap: "1",
  });
  const url = `${BASE}/gateway/uniform/football/getUniformMatchResultV1.qry?${q}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${begin}..${end} p${pageNo}`);
  const j = await res.json();
  if (!j.success && j.errorCode && j.errorCode !== "0") {
    throw new Error(`API ${j.errorCode} ${j.errorMessage}`);
  }
  return j.value || {};
}

function normalize(row) {
  const h = Number(row.h);
  const d = Number(row.d);
  const a = Number(row.a);
  const ft = String(row.sectionsNo999 || "");
  const ht = String(row.sectionsNo1 || "");
  const [hs, as] = ft.split(":").map((x) => Number(x));
  return {
    matchId: row.matchId,
    matchDate: row.matchDate,
    matchNum: row.matchNum,
    matchNumStr: row.matchNumStr,
    leagueId: row.leagueId,
    league: row.leagueNameAbbr || row.leagueName,
    home: row.homeTeam,
    away: row.awayTeam,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    ft,
    ht,
    homeScore: Number.isFinite(hs) ? hs : null,
    awayScore: Number.isFinite(as) ? as : null,
    winFlag: row.winFlag,
    goalLine: row.goalLine,
    oddsH: h,
    oddsD: d,
    oddsA: a,
    poolStatus: row.poolStatus,
    matchResultStatus: row.matchResultStatus,
    bettingSingle: row.bettingSingle,
  };
}

async function collectRange(begin, end, seen) {
  let pageNo = 1;
  let pages = 1;
  let got = 0;
  while (pageNo <= pages) {
    const v = await fetchPage(begin, end, pageNo);
    pages = Number(v.pages || 1);
    const list = v.matchResult || [];
    for (const row of list) {
      if (!row || row.matchResultStatus !== "2") continue;
      if (!row.winFlag || !row.h) continue;
      const id = String(row.matchId);
      if (seen.has(id)) continue;
      seen.add(id);
      fs.appendFileSync(OUT, JSON.stringify(normalize(row)) + "\n");
      got++;
    }
    pageNo++;
    await sleep(SLEEP_MS);
  }
  return got;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  const today = bjYmd(new Date());
  const start = addDays(today, -Math.round(MONTHS * 30.4));
  const seen = new Set();
  let cursor = start;
  let total = 0;
  console.log(JSON.stringify({ start, today, out: OUT }));
  while (cursor <= today) {
    const end = addDays(cursor, 6);
    const endClamped = end > today ? today : end;
    try {
      const n = await collectRange(cursor, endClamped, seen);
      total += n;
      console.log(`${cursor}..${endClamped} +${n} total=${total}`);
    } catch (e) {
      console.error(`ERR ${cursor}..${endClamped}: ${e.message}`);
      await sleep(2000);
      try {
        const n = await collectRange(cursor, endClamped, seen);
        total += n;
        console.log(`${cursor}..${endClamped} retry +${n} total=${total}`);
      } catch (e2) {
        console.error(`FAIL ${cursor}: ${e2.message}`);
      }
    }
    cursor = addDays(endClamped, 1);
  }
  console.log(JSON.stringify({ done: true, total, unique: seen.size, out: OUT }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
