// SQLite storage (better-sqlite3). Data dir: $DATA_DIR or ./data  (production: /opt/jingcai/data)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'jingcai.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 3000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'a1',
  agreed_terms_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS plans (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, match_id)
);
CREATE TABLE IF NOT EXISTS match_votes (
  match_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK(choice IN ('h','d','a')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_match ON match_votes(match_id);
CREATE TABLE IF NOT EXISTS match_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_match_id ON match_chat(match_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON match_chat(user_id);
`);

/* ---- news archive (durable list beyond recent feed cache) ---- */
db.exec(`
CREATE TABLE IF NOT EXISTS news_archive (
  id TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'zh',
  title TEXT NOT NULL,
  summary TEXT,
  link TEXT,
  thumb TEXT,
  thumb_full TEXT,
  article_id TEXT,
  source TEXT,
  source_zh TEXT,
  source_id TEXT,
  published_at TEXT,
  published_ms INTEGER,
  data TEXT NOT NULL,
  archived_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_arch_lang_pub ON news_archive(lang, published_ms DESC, id);
CREATE INDEX IF NOT EXISTS idx_news_arch_lang_arch ON news_archive(lang, archived_at DESC);
`);

const upsertNewsStmt = db.prepare(`
INSERT INTO news_archive (
  id, lang, title, summary, link, thumb, thumb_full, article_id,
  source, source_zh, source_id, published_at, published_ms, data, archived_at
) VALUES (
  @id, @lang, @title, @summary, @link, @thumb, @thumb_full, @article_id,
  @source, @source_zh, @source_id, @published_at, @published_ms, @data, @archived_at
)
ON CONFLICT(id) DO UPDATE SET
  lang=excluded.lang,
  title=excluded.title,
  summary=COALESCE(excluded.summary, news_archive.summary),
  link=COALESCE(excluded.link, news_archive.link),
  thumb=COALESCE(NULLIF(excluded.thumb,''), news_archive.thumb),
  thumb_full=COALESCE(NULLIF(excluded.thumb_full,''), news_archive.thumb_full),
  article_id=COALESCE(excluded.article_id, news_archive.article_id),
  source=COALESCE(excluded.source, news_archive.source),
  source_zh=COALESCE(excluded.source_zh, news_archive.source_zh),
  source_id=COALESCE(excluded.source_id, news_archive.source_id),
  published_at=COALESCE(excluded.published_at, news_archive.published_at),
  published_ms=CASE
    WHEN excluded.published_ms IS NOT NULL AND excluded.published_ms > 0 THEN excluded.published_ms
    ELSE news_archive.published_ms
  END,
  data=excluded.data,
  archived_at=excluded.archived_at
`);

function archiveNewsItems(items, lang) {
  const L = String(lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const now = Date.now();
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return 0;
  const tx = db.transaction((rows) => {
    let n = 0;
    for (const it of rows) {
      if (!it || !it.id) continue;
      const pubMs = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
      upsertNewsStmt.run({
        id: String(it.id),
        lang: L,
        title: String(it.title || '').slice(0, 500) || '(无标题)',
        summary: it.summary ? String(it.summary).slice(0, 2000) : null,
        link: it.link ? String(it.link).slice(0, 1000) : null,
        thumb: it.thumb ? String(it.thumb).slice(0, 1000) : null,
        thumb_full: (it.thumbFull || it.thumb) ? String(it.thumbFull || it.thumb).slice(0, 1000) : null,
        article_id: it.articleId ? String(it.articleId).slice(0, 64) : null,
        source: it.source ? String(it.source).slice(0, 80) : null,
        source_zh: it.sourceZh ? String(it.sourceZh).slice(0, 80) : null,
        source_id: it.sourceId ? String(it.sourceId).slice(0, 40) : null,
        published_at: it.publishedAt || null,
        published_ms: Number.isFinite(pubMs) ? pubMs : 0,
        data: JSON.stringify(it),
        archived_at: now,
      });
      n++;
    }
    return n;
  });
  const count = tx(list);
  // Mirror a compact JSON index for backup / offline inspect (capped)
  try {
    const dir = path.join(DATA_DIR, 'news');
    fs.mkdirSync(dir, { recursive: true });
    const rows = db.prepare(
      `SELECT data FROM news_archive WHERE lang=? ORDER BY published_ms DESC, id LIMIT 2000`
    ).all(L);
    const itemsOut = rows.map((r) => {
      try { return JSON.parse(r.data); } catch { return null; }
    }).filter(Boolean);
    const file = path.join(dir, L === 'en' ? 'archive-en.json' : 'archive-zh.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      lang: L,
      updatedAt: new Date().toISOString(),
      total: itemsOut.length,
      items: itemsOut,
    }));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('news archive json mirror failed', e.message);
  }
  return count;
}

function queryNewsArchive(opts = {}) {
  const L = String(opts.lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 40, 1), 100);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  let beforeMs = null;
  let beforeId = null;
  if (opts.before) {
    const b = String(opts.before).trim();
    const asTime = Date.parse(b);
    if (Number.isFinite(asTime) && (/^\d{4}-\d{2}-\d{2}/.test(b) || /T/.test(b))) {
      beforeMs = asTime;
    } else {
      const row = db.prepare('SELECT published_ms, id FROM news_archive WHERE id=?').get(b);
      if (row) {
        beforeMs = row.published_ms || 0;
        beforeId = row.id;
      } else {
        const n = Number(b);
        if (Number.isFinite(n) && n > 1e11) beforeMs = n;
      }
    }
  }
  let rows;
  if (beforeMs != null) {
    if (beforeId) {
      rows = db.prepare(
        `SELECT data FROM news_archive WHERE lang=? AND (published_ms < ? OR (published_ms = ? AND id < ?))
         ORDER BY published_ms DESC, id DESC LIMIT ?`
      ).all(L, beforeMs, beforeMs, beforeId, limit + 1);
    } else {
      rows = db.prepare(
        `SELECT data FROM news_archive WHERE lang=? AND published_ms < ?
         ORDER BY published_ms DESC, id DESC LIMIT ?`
      ).all(L, beforeMs, limit + 1);
    }
  } else {
    rows = db.prepare(
      `SELECT data FROM news_archive WHERE lang=? ORDER BY published_ms DESC, id DESC LIMIT ? OFFSET ?`
    ).all(L, limit + 1, offset);
  }
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const items = slice.map((r) => {
    try { return JSON.parse(r.data); } catch { return null; }
  }).filter(Boolean);
  const total = db.prepare('SELECT COUNT(*) AS c FROM news_archive WHERE lang=?').get(L).c;
  return {
    items,
    hasMore,
    total,
    offset: beforeMs != null ? undefined : offset,
    before: opts.before || undefined,
  };
}

function getArchivedNewsItem(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  let row = db.prepare('SELECT data FROM news_archive WHERE id=?').get(key);
  if (!row) {
    row = db.prepare('SELECT data FROM news_archive WHERE id LIKE ? LIMIT 1').get(key + '%');
  }
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}


/* ---- membership (资讯会员 / 高级数据；非购彩支付) ---- */
db.exec(`
CREATE TABLE IF NOT EXISTS membership_orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  days INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','cancelled','refunded')),
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_trade_no TEXT,
  paid_at INTEGER,
  expire_extend_to INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_morders_user ON membership_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_morders_status ON membership_orders(status, created_at DESC);
`);

try {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('member_until')) {
    db.exec('ALTER TABLE users ADD COLUMN member_until INTEGER');
  }
} catch (e) {
  console.warn('member_until migrate', e.message);
}

module.exports = {
  db,
  DATA_DIR,
  archiveNewsItems,
  queryNewsArchive,
  getArchivedNewsItem,
};
