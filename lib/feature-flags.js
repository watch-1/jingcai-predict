/**
 * App feature flags (operator toggles). Stored in SQLite app_flags.
 * Defaults are ON when a key is missing — only explicit '0'/'false'/'off' disables.
 */
'use strict';
const { db } = require('./db');

const DEFAULTS = Object.freeze({
  ai_prematch: { on: true, label: 'AI 赛前解读', note: '预测报告 DeepSeek 叙事；关闭后不再调用并返回 disabled' },
  ai_match_chat: { on: true, label: 'AI 聊球', note: '赛事详情 AI 聊球；关闭后接口返回 disabled' },
  ai_review: { on: true, label: 'AI 赛后复盘叙事', note: '赛后复盘 DeepSeek 叙事生成' },
  predict_report: { on: true, label: '综合预测报告', note: '赛前情报简报主开关（关闭则 /api/predict-report 拒绝新生成）' },
  partner_test: {
    on: true,
    label: '合作测试版',
    note: '合作/老板测试 APK 远程开关。关闭后带 partner-test 通道的客户端显示「测试已结束」且 API 拒绝服务',
  },
});

function parseOn(raw, fallback) {
  if (raw == null || raw === '') return !!fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
  return !!fallback;
}

function isEnabled(key) {
  const def = DEFAULTS[key];
  const fallback = def ? def.on : true;
  try {
    const row = db.prepare('SELECT value FROM app_flags WHERE key = ?').get(String(key));
    if (!row) return fallback;
    return parseOn(row.value, fallback);
  } catch {
    return fallback;
  }
}

function listFlags() {
  const rows = db.prepare('SELECT key, value, updated_at, note FROM app_flags').all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return Object.keys(DEFAULTS).map((key) => {
    const d = DEFAULTS[key];
    const row = byKey[key];
    const on = row ? parseOn(row.value, d.on) : d.on;
    return {
      key,
      label: d.label,
      note: (row && row.note) || d.note,
      on,
      value: on ? '1' : '0',
      updatedAt: row ? row.updated_at : null,
      defaultOn: d.on,
    };
  });
}

function setFlag(key, on, note) {
  if (!DEFAULTS[key]) {
    const err = new Error('未知开关: ' + key);
    err.code = 'UNKNOWN_FLAG';
    throw err;
  }
  const now = Date.now();
  const value = on ? '1' : '0';
  const noteStr = note != null ? String(note).slice(0, 200) : (DEFAULTS[key].note || null);
  db.prepare(`
    INSERT INTO app_flags (key, value, updated_at, note) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at,
      note=COALESCE(excluded.note, app_flags.note)
  `).run(key, value, now, noteStr);
  return listFlags().find((f) => f.key === key);
}

module.exports = {
  DEFAULTS,
  isEnabled,
  listFlags,
  setFlag,
};
