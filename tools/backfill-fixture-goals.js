#!/usr/bin/env node
/**
 * Rate-limited backfill: read teams from data/predict-heat/*.json, fetch recent
 * finished SM fixtures with events, persist goal minutes to SQLite (fixture_goal_events).
 *
 * Usage: node tools/backfill-fixture-goals.js [--max-teams N] [--sleep-ms 500]
 * Requires SPORTMONKS_TOKEN. Does not mass-scrape full history — caps teams + fixtures.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('../lib/heat-source');
const fgc = require('../lib/fixture-goals-cache');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return path.join(__dirname, '..', 'data');
}

function parseArgs() {
  const out = { maxTeams: 80, sleepMs: 500 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max-teams') out.maxTeams = Number(argv[++i]) || out.maxTeams;
    if (argv[i] === '--sleep-ms') out.sleepMs = Number(argv[++i]) || out.sleepMs;
  }
  return out;
}

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!heatSource.readToken()) {
    console.error('Set SPORTMONKS_TOKEN');
    process.exit(1);
  }
  const opts = parseArgs();
  const dir = path.join(dataDir(), 'predict-heat');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'))
    : [];
  const teams = files.slice(0, opts.maxTeams);
  let fixturesFetched = 0;
  for (const file of teams) {
    let pack;
    try { pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    const smId = pack && (pack.smTeamId || pack.sideId);
    if (!smId) continue;
    const clock = Date.now();
    const ymd = d => new Date(d).toISOString().slice(0, 10);
    const start = ymd(clock - 200 * 86400000);
    const end = ymd(clock);
    let list;
    try {
      list = await heatSource.smGet(`/football/fixtures/between/${start}/${end}/${smId}`, {
        include: 'participants;state',
        per_page: 25,
      });
    } catch (e) {
      console.warn('list failed', smId, e.message);
      await sleep(opts.sleepMs * 2);
      continue;
    }
    const ids = ((list && list.data) || [])
      .filter(heatSource.isFinished)
      .map(fx => fx.id)
      .filter(Boolean)
      .slice(0, 8);
    for (const id of ids) {
      try {
        const body = await heatSource.smGet(`/football/fixtures/${id}`, {
          include: 'participants;events',
        });
        if (body && body.data) {
          fgc.upsertFromFixture(body.data);
          fixturesFetched += 1;
        }
      } catch (e) {
        console.warn('fixture', id, e.message);
      }
      await sleep(opts.sleepMs);
    }
    await sleep(opts.sleepMs);
  }
  console.log(JSON.stringify({ teams: teams.length, fixturesFetched }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
