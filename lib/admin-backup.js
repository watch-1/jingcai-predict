'use strict';

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const { shanghaiDayStr } = require('./admin-time');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_AGE_DAYS = 7;

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function listBackups() {
  ensureDir();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db') || f.endsWith('.sqlite'));
  const rows = files.map((name) => {
    const full = path.join(BACKUP_DIR, name);
    const st = fs.statSync(full);
    return {
      name,
      sizeBytes: st.size,
      mtimeMs: st.mtimeMs,
    };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = rows[0] || null;
  const ageDays = latest ? (Date.now() - latest.mtimeMs) / 86400e3 : null;
  return { dir: BACKUP_DIR, files: rows, latest, ageDays };
}

function createBackup(label) {
  ensureDir();
  const src = path.join(DATA_DIR, 'jingcai.db');
  if (!fs.existsSync(src)) throw new Error('数据库文件不存在');
  const tag = label ? String(label).replace(/[^\w.-]+/g, '_').slice(0, 40) : 'manual';
  const ts = shanghaiDayStr() + '-' + new Date().toISOString().replace(/[:.]/g, '').slice(11, 17);
  const name = `jingcai-${tag}-${ts}.db`;
  const dest = path.join(BACKUP_DIR, name);
  fs.copyFileSync(src, dest);
  return { name, path: dest, sizeBytes: fs.statSync(dest).size, mtimeMs: Date.now() };
}

function freshnessAlert() {
  const { latest, ageDays } = listBackups();
  if (!latest) {
    return { severity: 'red', title: '尚无 SQLite 备份', count: 0, href: 'backup', page: 'backup' };
  }
  if (ageDays > MAX_AGE_DAYS) {
    return {
      severity: 'yellow',
      title: `备份已超过 ${MAX_AGE_DAYS} 天`,
      count: Math.floor(ageDays),
      href: 'backup',
      page: 'backup',
    };
  }
  return {
    severity: 'green',
    title: '备份新鲜度正常',
    count: null,
    href: 'backup',
    page: 'backup',
  };
}

module.exports = {
  BACKUP_DIR,
  MAX_AGE_DAYS,
  listBackups,
  createBackup,
  freshnessAlert,
};
