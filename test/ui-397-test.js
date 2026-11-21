'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(/function crestMarkReady\(/.test(appJs), 'crestMarkReady records a decoded crest');
assert.ok(/function crestIsReady\(/.test(appJs), 'crestIsReady is consulted before paint');
assert.ok(/function crestWarmDecode\(/.test(appJs), 'bundled crests are decoded ahead of tab switches');
assert.ok(/function warmBundledCrests\(/.test(appJs), 'APK-packed crests are warmed at boot');
assert.ok(/already \|\| \(opts && opts\.eager\)/.test(appJs), 'ready crests skip loading=lazy');
assert.ok(/try\{crestMarkReady\(this\)\}/.test(appJs), 'onload records the crest as ready');
assert.ok(/const already = !isFlag && crestIsReady\(srcUrl, ckey\)/.test(appJs));
assert.ok(/const loadedCls = already \? ' is-loaded' : ''/.test(appJs));
assert.ok(/const ph = \(isFlag \|\| already\) \? '' :/.test(appJs), 'ready crests omit the letter cover');
assert.ok(/badge-ph/.test(appJs) && /\.badge\.crest:not\(\.flag\) \.badge-ph/.test(css), 'cold path still has a letter cover');

function extractNamed(src, name) {
  const re = new RegExp('function ' + name + '\\(');
  const start = src.search(re);
  assert.ok(start >= 0, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const stub = `
const CFG = { bundledCrestIds: ['359', '109'] };
const API = '';
const BADGE_COLORS = ['#e5484d'];
const _crestMem = new Map();
const _crestInflight = new Map();
const _crestReady = new Set();
const _crestWarmInfl = new Map();
let _crestWarmActive = 0;
const _crestWarmQ = [];
const CREST_WARM_CONCUR = 8;
const BUNDLED_CREST_BASE = 'assets/crests/';
let _bundledCrestIds = new Set(CFG.bundledCrestIds);
const _sportteryCrests = { '1': '359' };
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function crestCacheKey(logo, teamId) { return String(teamId || logo || ''); }
function resolveFlagIso2() { return ''; }
function isCrestPlaceholderLogo() { return false; }
function bundledFlagPath() { return ''; }
function flagcdnUrl() { return ''; }
function isNationalFlagLogo() { return false; }
function espnIdFromCrestLogo(logo) {
  const leaf = String(logo || '').split('/').pop() || '';
  const n = leaf.replace('.png', '').replace('.gif', '');
  return /^[0-9]+$/.test(n) ? n : '';
}
function isJingcaiOrSportteryLogo() { return false; }
function isEspnNamespaceClubLogo() { return false; }
`;

const fn = [
  extractNamed(appJs, 'bundledCrestPath'),
  extractNamed(appJs, 'bundledCrestFor'),
  extractNamed(appJs, 'crestMarkReady'),
  extractNamed(appJs, 'crestIsReady'),
  extractNamed(appJs, 'badge'),
].join('\n');

const api = new Function(stub + '\n' + fn + '\n; return { badge, crestMarkReady, crestIsReady, bundledCrestPath };')();

const cold = api.badge('阿森纳', '', 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', { teamId: '359', eager: true });
assert.ok(/badge-ph/.test(cold), 'first paint of an unreadied packed crest still has a letter cover');
assert.ok(!/class="[^"]*\bis-loaded\b/.test(cold), 'first paint is not marked loaded before decode');
assert.ok(/src="assets\/crests\/359\.png"/.test(cold), 'packed file is already the img src on first paint');

api.crestMarkReady('assets/crests/359.png', '359');
const ready = api.badge('阿森纳', '', 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', { teamId: '359', eager: true });
assert.ok(!/badge-ph/.test(ready), 'decoded crest is painted directly, no letter cover');
assert.ok(/class="[^"]*\bis-loaded\b/.test(ready), 'decoded crest starts as is-loaded');
assert.ok(/src="assets\/crests\/359\.png"/.test(ready), 'packed file is used as the img src');
assert.ok(!/loading="lazy"/.test(ready), 'ready crest is not lazy-loaded');

const missing = api.badge('未知队', '', '');
assert.ok(/class="badge /.test(missing), 'unknown team falls back to a letter badge');
assert.ok(!/badge-ph/.test(missing) && !/<img/.test(missing), 'letter-only fallback has no image cover');
assert.ok(/>未</.test(missing) || missing.includes('未'), 'letter badge shows the first character');

console.log('ok ui-397 crest paint-ready (no letter flash on switch)');
