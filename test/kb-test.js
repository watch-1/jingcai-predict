// Personal KB store + synthesizer unit tests (no live server required).
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-kb-test-'));
require('../lib/kb-store');
const store = require('../lib/kb-store');
const { synthesizePersonal, applyDeltas } = require('../lib/personal-predict');
const { db } = require('../lib/db');

const now = Date.now();
const userId = db.prepare('INSERT INTO users (phone, pass_hash, nickname, avatar, agreed_terms_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
  .run('13800138000', 'x', '测试', 'a1', now, now, now).lastInsertRowid;

const pack = store.createPack(userId, '测试包');
assert.ok(pack.pack && pack.pack.id, 'create pack');
const item = store.createItem(userId, pack.pack.id, '主场强势', '主队近期主场全胜，看好主胜');
assert.ok(item.item && item.item.id, 'create item');
assert.ok(Number.isFinite(item.item.posX) && Number.isFinite(item.item.posY), 'default node position');

const laid = store.updatePackLayout(userId, pack.pack.id, {
  panX: 12,
  panY: -8,
  zoom: 1.1,
  nodes: { [item.item.id]: { x: 40, y: 50 } },
});
assert.ok(laid.pack && laid.pack.layoutPanX === 12);
const listed = store.listItems(userId, pack.pack.id, { includeBody: true });
assert.strictEqual(listed.items.find(x => x.id === item.item.id).posX, 40);
assert.strictEqual(listed.items.find(x => x.id === item.item.id).posY, 50);
const metaList = store.listItems(userId, pack.pack.id);
assert.strictEqual(metaList.items[0].body, undefined, 'default listItems is meta-only');
assert.ok(metaList.items[0].bodyPreview, 'meta list includes preview');

const match = {
  id: '999001',
  home: '测试主队',
  away: '测试客队',
  league: '测试联赛',
  had: { h: 2.1, d: 3.2, a: 3.5 },
};

const items = store.itemsByIds(userId, [item.item.id]);
assert.strictEqual(items.length, 1);

const explain = synthesizePersonal(match, items, 'explain');
assert.ok(explain.ok);
assert.strictEqual(explain.base.h, explain.adjusted.h);
assert.ok(explain.attributions.length === 1);

const strong = synthesizePersonal(match, items, 'strong');
assert.ok(strong.ok);
assert.ok(strong.adjusted.h >= strong.base.h - 0.001);
assert.notStrictEqual(strong.adjustedPick, null);

const renorm = applyDeltas({ h: 0.4, d: 0.3, a: 0.3 }, { h: 0.1, a: -0.05 });
const sum = renorm.h + renorm.d + renorm.a;
assert.ok(Math.abs(sum - 1) < 1e-6);

const cross = store.createPack(userId, '其他');
assert.ok(cross.pack);
const otherItem = store.createItem(userId, cross.pack.id, 'x', 'y');
const bad = store.itemsByIds(userId, [item.item.id, otherItem.item.id + 9999]);
assert.strictEqual(bad, null);

console.log('kb-test OK');
