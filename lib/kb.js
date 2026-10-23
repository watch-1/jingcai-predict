// HTTP API: personal knowledge base + personal predict (auth required).
const express = require('express');
const store = require('./kb-store');
const { synthesizePersonal, INTERVENTION } = require('./personal-predict');
const { requireAuth } = require('./auth');

const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

let resolveMatch = async () => null;

function configure(opts = {}) {
  if (typeof opts.resolveMatch === 'function') resolveMatch = opts.resolveMatch;
}

const r = express.Router();

r.get('/kb/packs', requireAuth, (req, res) => {
  res.json({ ok: true, packs: store.listPacks(req.user.id) });
});

r.post('/kb/packs', requireAuth, (req, res) => {
  const out = store.createPack(req.user.id, (req.body && req.body.name) || '');
  if (out.error) return res.status(400).json({ ok: false, error: out.error });
  res.status(201).json({ ok: true, pack: out.pack });
});

r.patch('/kb/packs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.renamePack(req.user.id, id, (req.body && req.body.name) || '');
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true, pack: out.pack });
});

r.delete('/kb/packs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.deletePack(req.user.id, id);
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true });
});

r.get('/kb/packs/:packId/items', requireAuth, (req, res) => {
  const packId = Number(req.params.packId);
  if (!Number.isFinite(packId)) return res.status(400).json({ ok: false, error: '无效 id' });
  const full = req.query.full === '1' || req.query.full === 'true';
  const out = store.listItems(req.user.id, packId, { includeBody: full });
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true, pack: out.pack, items: out.items, metaOnly: !full });
});

r.get('/kb/items/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const item = store.getItem(req.user.id, id);
  if (!item) return res.status(404).json({ ok: false, error: '知识条目不存在' });
  res.json({ ok: true, item });
});

r.post('/kb/packs/:packId/items', requireAuth, (req, res) => {
  const packId = Number(req.params.packId);
  const { title, body, posX, posY } = req.body || {};
  if (!Number.isFinite(packId)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.createItem(req.user.id, packId, title, body, { posX, posY });
  if (out.error) return res.status(400).json({ ok: false, error: out.error });
  res.status(201).json({ ok: true, item: out.item });
});

r.patch('/kb/packs/:id/layout', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.updatePackLayout(req.user.id, id, req.body || {});
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true, pack: out.pack });
});

r.patch('/kb/items/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.updateItem(req.user.id, id, req.body || {});
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true, item: out.item });
});

r.delete('/kb/items/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: '无效 id' });
  const out = store.deleteItem(req.user.id, id);
  if (out.error) return res.status(404).json({ ok: false, error: out.error });
  res.json({ ok: true });
});

r.get('/kb/picker', requireAuth, (req, res) => {
  res.json({ ok: true, packs: store.pickerTree(req.user.id) });
});

r.get('/kb/export', requireAuth, (req, res) => {
  res.json({ ok: true, ...store.exportAll(req.user.id) });
});

r.post('/predict/personal', requireAuth, (req, res) => {
  const { matchId, intervention, itemIds } = req.body || {};
  const mid = String(matchId || '').trim();
  if (!MATCH_ID_RE.test(mid)) return res.status(400).json({ ok: false, error: '比赛编号无效' });
  const iv = String(intervention || 'medium');
  if (!INTERVENTION[iv]) return res.status(400).json({ ok: false, error: '干预强度无效' });
  const ids = Array.isArray(itemIds) ? itemIds : [];
  if (!ids.length) return res.status(400).json({ ok: false, error: '请至少选择一条知识' });
  if (ids.length > 40) return res.status(400).json({ ok: false, error: '单次最多选择 40 条知识' });

  resolveMatch(mid).then((m) => {
    if (!m) return res.status(404).json({ ok: false, error: '未找到该场比赛' });
    const items = store.itemsByIds(req.user.id, ids);
    if (items === null) return res.status(403).json({ ok: false, error: '包含无权访问的知识条目' });
    const result = synthesizePersonal(m, items, iv);
    if (!result.ok) return res.status(400).json(result);
    store.savePredRun(req.user.id, mid, iv, ids, { base: result.base, adjusted: result.adjusted });
    res.json({
      ok: true,
      charged: true,
      quota: { remain: 99, limit: 100, stub: true },
      ...result,
    });
  }).catch((e) => {
    console.warn('predict/personal', e.message);
    res.status(500).json({ ok: false, error: '个人预测暂时不可用' });
  });
});

module.exports = r;
module.exports.configure = configure;
