#!/usr/bin/env node
/** 1.9.256: recent form merges results-seen + ESPN eng.league_cup. */
'use strict';

const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
ok(/VERSION=1\.9\.269/.test(ver) && /VERSION_CODE=305/.test(ver), 'VERSION.txt 1.9.269 / 305');

const ms = fs.readFileSync(path.join(__dirname, '../lib/match-stats.js'), 'utf8');
ok(/loadRecentFormHistoryRows/.test(ms), 'match-stats merges results-seen archive');

const arch = fs.readFileSync(path.join(__dirname, '../lib/results-archive.js'), 'utf8');
ok(/function loadRecentFormHistoryRows/.test(arch), 'results-archive export');

const espn = fs.readFileSync(path.join(__dirname, '../lib/espn-form.js'), 'utf8');
ok(/eng\.league_cup/.test(espn), 'espn-form includes EFL cup slug');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-256');
process.exit(fails ? 1 : 0);
