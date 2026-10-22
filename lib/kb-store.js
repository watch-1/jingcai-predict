// Personal knowledge-base packs/items (per-user SQLite). No item body in logs.
const { db } = require('./db');

const MAX_PACKS = 40;
const MAX_ITEMS_PER_USER = 500;
const MAX_TITLE = 80;
const MAX_BODY = 8000;
const MAX_PACK_NAME = 32;

db.exec(`
CREATE TABLE IF NOT EXISTS kb_pack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_pack_user ON kb_pack(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS kb_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id INTEGER NOT NULL REFERENCES kb_pack(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_item_pack ON kb_item(pack_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_item_user ON kb_item(user_id);
CREATE TABLE IF NOT EXISTS personal_pred_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  intervention TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_pred_user ON personal_pred_run(user_id, created_at DESC);
`);

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const n = name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (!n.length || [...n].length > MAX_PACK_NAME) return null;
  return n;
}

function cleanTitle(title) {
  if (typeof title !== 'string') return null;
  const t = title.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (!t.length || [...t].length > MAX_TITLE) return null;
  return t;
}

function cleanBody(body) {
  if (typeof body !== 'string') return null;
  const b = body.replace(/\u0000/g, '').trim();
  if (!b.length || b.length > MAX_BODY) return null;
  return b;
}

function packRow(r) {
  return r ? { id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, itemCount: r.itemCount ?? r.item_count ?? 0 } : null;
}

function itemRow(r, packName) {
  return r ? {
    id: r.id,
    packId: r.pack_id,
    packName: packName || r.pack_name || '',
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } : null;
}

function countPacks(userId) {
  return db.prepare('SELECT COUNT(*) n FROM kb_pack WHERE user_id = ?').get(userId).n;
}

function countItems(userId) {
  return db.prepare('SELECT COUNT(*) n FROM kb_item WHERE user_id = ?').get(userId).n;
}

function listPacks(userId) {
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM kb_item i WHERE i.pack_id = p.id) AS itemCount
    FROM kb_pack p WHERE p.user_id = ? ORDER BY p.updated_at DESC
  `).all(userId);
  return rows.map(packRow);
}

function getPack(userId, packId) {
  const r = db.prepare('SELECT * FROM kb_pack WHERE id = ? AND user_id = ?').get(packId, userId);
  return packRow(r);
}

function createPack(userId, name) {
  const n = cleanName(name);
  if (!n) return { error: '知识包名称需 1–32 个字符' };
  if (countPacks(userId) >= MAX_PACKS) return { error: `最多创建 ${MAX_PACKS} 个知识包` };
  const now = Date.now();
  const info = db.prepare('INSERT INTO kb_pack (user_id, name, created_at, updated_at) VALUES (?,?,?,?)').run(userId, n, now, now);
  return { pack: getPack(userId, info.lastInsertRowid) };
}

function renamePack(userId, packId, name) {
  const n = cleanName(name);
  if (!n) return { error: '知识包名称需 1–32 个字符' };
  const r = db.prepare('UPDATE kb_pack SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(n, Date.now(), packId, userId);
  if (!r.changes) return { error: '知识包不存在' };
  return { pack: getPack(userId, packId) };
}

function deletePack(userId, packId) {
  const r = db.prepare('DELETE FROM kb_pack WHERE id = ? AND user_id = ?').run(packId, userId);
  if (!r.changes) return { error: '知识包不存在' };
  return { ok: true };
}

function listItems(userId, packId) {
  const pack = getPack(userId, packId);
  if (!pack) return { error: '知识包不存在' };
  const rows = db.prepare('SELECT * FROM kb_item WHERE pack_id = ? AND user_id = ? ORDER BY updated_at DESC').all(packId, userId);
  return { pack, items: rows.map(r => itemRow(r, pack.name)) };
}

function getItem(userId, itemId) {
  const r = db.prepare(`
    SELECT i.*, p.name AS pack_name FROM kb_item i
    JOIN kb_pack p ON p.id = i.pack_id
    WHERE i.id = ? AND i.user_id = ?
  `).get(itemId, userId);
  return itemRow(r);
}

function createItem(userId, packId, title, body) {
  const pack = getPack(userId, packId);
  if (!pack) return { error: '知识包不存在' };
  const t = cleanTitle(title);
  const b = cleanBody(body);
  if (!t) return { error: '标题需 1–80 个字符' };
  if (!b) return { error: '正文不能为空（最多 8000 字）' };
  if (countItems(userId) >= MAX_ITEMS_PER_USER) return { error: `最多保存 ${MAX_ITEMS_PER_USER} 条知识` };
  const now = Date.now();
  const info = db.prepare('INSERT INTO kb_item (user_id, pack_id, title, body, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(userId, packId, t, b, now, now);
  db.prepare('UPDATE kb_pack SET updated_at = ? WHERE id = ?').run(now, packId);
  return { item: getItem(userId, info.lastInsertRowid) };
}

function updateItem(userId, itemId, patch) {
  const cur = getItem(userId, itemId);
  if (!cur) return { error: '知识条目不存在' };
  let packId = cur.packId;
  if (patch.packId != null) {
    const np = getPack(userId, Number(patch.packId));
    if (!np) return { error: '目标知识包不存在' };
    packId = np.id;
  }
  const title = patch.title !== undefined ? cleanTitle(patch.title) : cur.title;
  const body = patch.body !== undefined ? cleanBody(patch.body) : cur.body;
  if (!title) return { error: '标题需 1–80 个字符' };
  if (!body) return { error: '正文不能为空（最多 8000 字）' };
  const now = Date.now();
  db.prepare('UPDATE kb_item SET pack_id = ?, title = ?, body = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(packId, title, body, now, itemId, userId);
  db.prepare('UPDATE kb_pack SET updated_at = ? WHERE id = ?').run(now, packId);
  return { item: getItem(userId, itemId) };
}

function deleteItem(userId, itemId) {
  const cur = getItem(userId, itemId);
  if (!cur) return { error: '知识条目不存在' };
  db.prepare('DELETE FROM kb_item WHERE id = ? AND user_id = ?').run(itemId, userId);
  db.prepare('UPDATE kb_pack SET updated_at = ? WHERE id = ?').run(Date.now(), cur.packId);
  return { ok: true };
}

function pickerTree(userId) {
  const packs = listPacks(userId);
  return packs.map((p) => {
    const rows = db.prepare('SELECT id, title, updated_at FROM kb_item WHERE pack_id = ? AND user_id = ? ORDER BY updated_at DESC')
      .all(p.id, userId);
    return {
      id: p.id,
      name: p.name,
      itemCount: p.itemCount,
      items: rows.map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at })),
    };
  });
}

function itemsByIds(userId, itemIds) {
  const ids = [...new Set((itemIds || []).map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT i.*, p.name AS pack_name FROM kb_item i
    JOIN kb_pack p ON p.id = i.pack_id
    WHERE i.user_id = ? AND i.id IN (${placeholders})
  `).all(userId, ...ids);
  if (rows.length !== ids.length) return null;
  return rows.map(r => itemRow(r));
}

function exportAll(userId) {
  const packs = listPacks(userId);
  const items = db.prepare(`
    SELECT i.id, i.pack_id, i.title, i.body, i.created_at, i.updated_at, p.name AS pack_name
    FROM kb_item i JOIN kb_pack p ON p.id = i.pack_id
    WHERE i.user_id = ? ORDER BY i.pack_id, i.id
  `).all(userId);
  return {
    exportedAt: Date.now(),
    version: 1,
    packs,
    items: items.map(r => ({
      id: r.id,
      packId: r.pack_id,
      packName: r.pack_name,
      title: r.title,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}

function savePredRun(userId, matchId, intervention, itemIds, result) {
  try {
    db.prepare('INSERT INTO personal_pred_run (user_id, match_id, intervention, item_ids, result_json, created_at) VALUES (?,?,?,?,?,?)')
      .run(userId, String(matchId), intervention, JSON.stringify(itemIds), JSON.stringify(result), Date.now());
  } catch (e) {
    console.warn('personal_pred_run save', e.message);
  }
}

module.exports = {
  MAX_PACKS,
  MAX_ITEMS_PER_USER,
  listPacks,
  getPack,
  createPack,
  renamePack,
  deletePack,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  pickerTree,
  itemsByIds,
  exportAll,
  savePredRun,
};
