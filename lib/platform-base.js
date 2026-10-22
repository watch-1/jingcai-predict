// Platform baseline 1X2 probabilities for a match (odds-implied; no user KB).
const { implied } = require('./predict-report');

/**
 * @param {object} m normalized match with had/hhad
 * @returns {{ pool: 'had'|'hhad', base: {h:number,d:number,a:number}, source: string }|null}
 */
function getPlatformBase(m) {
  if (!m) return null;
  const p = implied(m.had);
  const q = implied(m.hhad);
  const base = p || q;
  if (!base) return null;
  const pool = p ? 'had' : 'hhad';
  return {
    pool,
    base: { h: base.h, d: base.d, a: base.a },
    source: pool === 'had' ? '竞彩胜平负去水隐含概率' : '让球盘去水隐含概率（胜平负未开售）',
  };
}

module.exports = { getPlatformBase };
