// 1.9.161: urgent DC concurrency, KB preempts DC queue, KB pack list without full bodies.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(/const DC_REFRESH_MAX_URGENT = 5/.test(appJs), 'urgent DC concurrency must be 5');
assert.ok(/const DC_REFRESH_MAX_SOFT = 2/.test(appJs), 'soft DC concurrency cap must be 2');
assert.ok(appJs.includes('function dcKbBlocksQueue'), 'KB route must block DC queue pump');
assert.ok(appJs.includes('function syncDcRoutePriority'), 'route change must sync KB/DC priority');
assert.ok(/if \(!needUrgent && dcKbBlocksQueue\(\)\) return/.test(appJs), 'soft DC refresh must yield when KB active');
assert.ok(appJs.includes('function pruneStaleDcSoftRefresh'), 'stale soft DC jobs must be pruned on tab switch');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-kb-161-'));
require('../lib/kb-store');
const store = require('../lib/kb-store');
const { db } = require('../lib/db');

const now = Date.now();
const userId = db.prepare('INSERT INTO users (phone, pass_hash, nickname, avatar, agreed_terms_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
  .run('13900139001', 'x', '测161', 'a1', now, now, now).lastInsertRowid;

const pack = store.createPack(userId, '大包');
const longBody = '长文'.repeat(2000);
const item = store.createItem(userId, pack.pack.id, '标题', longBody);
assert.ok(item.item && item.item.id, 'create item');

const meta = store.listItems(userId, pack.pack.id, { includeBody: false });
assert.ok(meta.items && meta.items.length === 1, 'meta list');
const row = meta.items[0];
assert.strictEqual(row.body, undefined, 'pack item list must not include full body');
assert.ok(row.bodyLen >= longBody.length, 'bodyLen must reflect size');
assert.ok(row.bodyPreview && row.bodyPreview.length <= 52, 'bodyPreview must be short');

const full = store.listItems(userId, pack.pack.id, { includeBody: true });
assert.strictEqual(full.items[0].body, longBody, 'full=1 path still returns body');

console.log('dc-kb-161-test OK');
