// 1.9.162: consumer-facing process-stats empty labels must not mention keys/secrets.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

assert.ok(!appJs.includes("no_key') return '未配置密钥"), 'no_key side reason must not say 未配置密钥');
assert.ok(!appJs.includes("no_key' ? '未配置密钥"), 'no_key pill must not say 未配置密钥');
assert.ok(!appJs.includes('密钥暂停'), 'process-stats pill must not say 密钥暂停');
assert.ok(appJs.includes("no_key' ? '暂未就绪"), 'no_key pill should use neutral 暂未就绪');
assert.ok(appJs.includes("no_key') return '过程数据源暂未就绪"), 'no_key side reason should match server noteZh tone');

const ps = fs.readFileSync(path.join(__dirname, '../lib/process-stats.js'), 'utf8');
assert.ok(!ps.includes('配置后将自动点亮'), 'no_key aggregate noteZh must not mention 配置');

console.log('ui-162-test OK');
