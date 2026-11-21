'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');

assert.ok(/VERSION=2\.1\.5/.test(ver), 'VERSION.txt stays 2.1.5');
assert.ok(/VERSION_CODE=332/.test(ver), 'VERSION_CODE stays 332');
assert.ok(!/216mf386/.test(indexHtml), 'index.html cache stamp moved off 386');
assert.ok(/216mf38[7-9]|216mf39\d|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 387+');

assert.ok(/badge-ph/.test(appJs), 'club crest HTML keeps a letter placeholder');
assert.ok(/is-loaded/.test(appJs) && /is-loaded/.test(css), 'loaded crest class is wired in JS and CSS');
assert.ok(/function markCrestsLoaded/.test(appJs));
assert.ok(/warmCrestCacheForTeams\(teams\)/.test(appJs), 'boot warms IDB crests from last-good lists');
assert.ok(/matchTeamBadge\(row, 'home', 'sm', \{ eager: true \}\)/.test(appJs));
assert.ok(/matchTeamBadge\(row, 'away', 'sm', \{ eager: true \}\)/.test(appJs));

const ptr = appJs.slice(appJs.indexOf('// ---------- pull to refresh'), appJs.indexOf('// ---------- pull to refresh') + 2500);
assert.ok(/setTimeout\(resolve, 3000\)/.test(ptr), 'PTR no longer holds 12s');
assert.ok(!/setTimeout\(resolve, 12000\)/.test(ptr), 'old 12s PTR cap is gone');
assert.ok(/afterScheduleLiveScoresLoaded\(\)/.test(ptr), 'background refresh still patches the list when it finishes');

assert.ok(/\.badge\.crest:not\(\.flag\) \.badge-ph/.test(css));
assert.ok(/\.badge\.crest:not\(\.flag\)\.is-loaded img/.test(css));

console.log('crest-ptr-387-test ok');
