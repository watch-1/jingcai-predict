'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');

assert.ok(/VERSION=2\.1\.5/.test(ver), 'VERSION.txt stays 2.1.5');
assert.ok(/VERSION_CODE=332/.test(ver), 'VERSION_CODE stays 332');
assert.ok(!/216mf385/.test(indexHtml), 'index.html cache stamp moved off 385');
assert.ok(/216mf38[6-9]|216mf39\d|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 386+');

assert.ok(/function predRefSettled/.test(appJs), 'pred tab has a settled gate for 赛前参考');
assert.ok(/return smPredSettled\(smPredPackOf\(m\.id\)\)/.test(appJs), '赛前参考 does not wait on odds inflight');
assert.ok(/function prematchRefLoadingHtml/.test(appJs));
assert.ok(/正在加载赛前参考…/.test(appJs));
assert.ok(/function prefetchPredRef/.test(appJs));
assert.ok(/function predRefBodyHtml/.test(appJs));

// Loading shell is used instead of painting 盘口 first.
assert.ok(/if \(!predRefSettled\(m\)\) return prematchRefLoadingHtml\(\)/.test(appJs));
assert.ok(/predTabHtml[\s\S]{0,800}predRefBodyHtml/.test(appJs) || /pred-ref-\$\{mid\}">\$\{predRefBodyHtml/.test(appJs));

// Prefetch starts on match shell / render, not only after enrichMatchDetail.
const renderAt = appJs.indexOf('function render(opts)');
const enrichAt = appJs.indexOf('async function enrichMatchDetail');
const earlyPrefetchAt = appJs.indexOf('prefetchPredRef(early)');
const pagePrefetchAt = appJs.indexOf('prefetchPredRef(x)');
assert.ok(earlyPrefetchAt > 0 && earlyPrefetchAt > renderAt && (enrichAt < 0 || earlyPrefetchAt < enrichAt || pagePrefetchAt < enrichAt),
  'prefetch starts at render/pageMatch, not only inside enrichMatchDetail');
assert.ok(/ensureSmPredictions\(x\)/.test(appJs), 'existing match-open prefetch remains');

// 个人知识库 stays; local model stays out of 赛前参考; 让球 is 盘口 only.
const predTab = appJs.slice(appJs.indexOf('function predTabHtml'), appJs.indexOf('function predTabHtml') + 1800);
assert.ok(/个人知识库预测/.test(predTab));
const pref = appJs.slice(appJs.indexOf('function prematchRefHtml'), appJs.indexOf('function prematchRefHtml') + 8000);
assert.ok(/SportMonks 没有亚洲让球/.test(pref) || /只展示竞彩盘口/.test(pref));
assert.ok(!/oddsEdge|modelWdl/.test(pref), 'local model not shown in 赛前参考');

const publicFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp);
    else if (/\.(js|html|css|json)$/.test(name)) publicFiles.push(fp);
  }
}
walk(path.join(__dirname, '../public'));
const secretRe = /SPORTMONKS[A-Z0-9_]{0,20}\s*[:=]\s*['"][A-Za-z0-9._\-]{16,}/;
for (const fp of publicFiles) {
  const body = fs.readFileSync(fp, 'utf8');
  assert.ok(!secretRe.test(body), 'no SportMonks token in public/ ' + path.relative(path.join(__dirname, '..'), fp));
}

console.log('pred-ref-386-test ok');
