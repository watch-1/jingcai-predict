#!/usr/bin/env node
/** Fill _namezh.json from a name list with retries + accent aliases. */
'use strict';
const fs = require('fs');
const path = require('path');
const { zhLabel } = require('../lib/wikidata-zh');

const OUT = path.join(__dirname, '..', 'data', 'squads', '_namezh.json');
const file = process.argv[2];
const team = process.argv[3] || '';
if (!file) { console.error('usage: fill-namezh-list.js names.txt [teamHint]'); process.exit(1); }

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(o));
  fs.renameSync(tmp, f);
}
function hasCjk(s) { return /[\u4e00-\u9fff]/.test(s || ''); }
function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function put(map, name, zh) {
  if (!name || !zh) return;
  map[name] = zh;
  const bare = stripAccents(name);
  if (bare && bare !== name) map[bare] = zh;
  const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const sur = parts[parts.length - 1];
    if (sur.length > 2) {
      map[sur] = zh;
      const surBare = stripAccents(sur);
      if (surBare !== sur) map[surBare] = zh;
    }
  }
}

async function main() {
  const lines = fs.readFileSync(file, 'utf8').split(/\n/).map((l) => l.trim()).filter(Boolean);
  const map = readJson(OUT, {});
  let ok = 0, skip = 0, fail = 0;
  for (const name of lines) {
    if (hasCjk(map[name]) || hasCjk(map[stripAccents(name)])) {
      const zh = map[name] || map[stripAccents(name)];
      put(map, name, zh);
      skip++;
      continue;
    }
    let zh = '';
    for (let attempt = 0; attempt < 3 && !zh; attempt++) {
      if (attempt) await sleep(800 * attempt);
      try {
        zh = await Promise.race([
          zhLabel(name, { team }),
          new Promise((r) => setTimeout(() => r(''), 6000)),
        ]);
        if (!hasCjk(zh)) zh = '';
      } catch { zh = ''; }
    }
    if (zh) {
      put(map, name, zh);
      ok++;
      console.log('+', name, '→', zh);
    } else {
      fail++;
      console.log('·', name);
    }
    await sleep(280);
    if ((ok + skip + fail) % 20 === 0) writeJson(OUT, map);
  }
  writeJson(OUT, map);
  console.log(`[done] ok=${ok} skip=${skip} fail=${fail} keys=${Object.keys(map).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
