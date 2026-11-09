/**
 * Fold club names so ESPN, Sportmonks search, and history/table rows
 * can meet on aliases. This file does not invent fixtures or numeric ids.
 *
 * ESPN team ids stay in espn-form SEED (hand-checked) or are learned from
 * a real matched fixture. Sportmonks ids stay in squad-source SM_PIN.
 *
 * Still unresolved on purpose:
 * - leagues missing from the ESPN domestic index (most lower divisions,
 *   domestic cups other than the ones already fetched, friendlies, national teams)
 * - a club whose name is not in that index and not in the alias list below
 * - a Sportmonks search that returns nothing, unless SM_PIN already has a checked id
 * - an opponent's league rank when they are not on the focus-league table
 *   and not in local finished history
 */
'use strict';

const PREFIX = /^(fk|bk|sk|if|ik|il|ff|aif|fc|afc|cf|sc|ac|as|ss|aj|rc|rcd|cd|ud|sd|tsv|vfb|vfl|ssv)\s+/i;
const SUFFIX = /\s+(fk|bk|il|if|ff|fc|cf|sc|afc|sk|aif)$/i;

/**
 * sporttery team id → canonical English, only where the crest English
 * is too short to resolve (Bodo vs Bodø/Glimt). Not an ESPN id.
 */
const KNOWN_EN = {
  289: 'Rosenborg',
  330: 'Molde',
  612: 'Brann',
  613: 'Viking',
  616: 'Fredrikstad',
  617: 'Tromsø',
  618: 'Bodø/Glimt',
  619: 'Lillestrøm',
};

/** Equivalent names. Search strings only — no guessed provider ids. */
const GROUPS = [
  ['博德闪耀', '博多格林特', 'Bodø/Glimt', 'Bodo/Glimt', 'Bodo Glimt', 'FK Bodø/Glimt'],
  ['特罗姆瑟', '特罗姆索', 'Tromsø', 'Tromso', 'Tromsø IL', 'Tromso IL'],
  ['罗森博格', 'Rosenborg', 'Rosenborg BK'],
  ['莫尔德', 'Molde', 'Molde FK'],
  ['布兰', 'Brann', 'SK Brann'],
  ['维京', 'Viking', 'Viking FK'],
  ['弗雷德里克斯坦', 'Fredrikstad', 'Fredrikstad FK'],
  ['利勒斯特罗姆', 'Lillestrøm', 'Lillestrom', 'Lillestrøm SK'],
  ['萨普斯堡', 'Sarpsborg', 'Sarpsborg 08', 'Sarpsborg 08 FF'],
  ['马竞', '马德里竞技', 'Atlético Madrid', 'Atletico Madrid', 'Atlético de Madrid', 'Atletico de Madrid'],
  ['拜仁', '拜仁慕尼黑', 'Bayern Munich', 'Bayern München', 'Bayern Munchen', 'Bayern'],
  ['圣吉联合', '圣吉罗斯联合', 'Union Saint-Gilloise', 'Union Saint Gilloise', 'Union SG'],
  ['波尔图', 'FC Porto', 'Porto'],
  ['欧塞尔', 'AJ Auxerre', 'Auxerre'],
  ['吉马良斯', '维多利亚吉马良斯', '吉马良斯维多利亚', 'Vitória de Guimarães', 'Vitoria de Guimaraes', 'Vitoria Guimaraes'],
  ['奥莫尼亚', '尼科西亚奥莫尼亚', 'Omonia Nicosia', 'AC Omonia', 'Omonia'],
  ['塞尔塔', 'Celta Vigo', 'Celta', 'RC Celta', 'Celta de Vigo'],
];

function foldName(s) {
  return String(s || '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/å/g, 'a').replace(/Å/g, 'A')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ä/g, 'a').replace(/Ä/g, 'A')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(PREFIX, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\b(fotball|ballklubb|idrettslag|club|calcio|de|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupFor(name) {
  const raw = String(name || '').trim();
  const folded = foldName(raw);
  if (!raw && !folded) return null;
  for (const g of GROUPS) {
    if (g.includes(raw)) return g;
    if (folded && g.some(item => foldName(item) === folded)) return g;
  }
  return null;
}

function keysFor(name) {
  const keys = new Set();
  const folded = foldName(name);
  if (folded) keys.add(folded);
  const g = groupFor(name);
  if (g) for (const item of g) {
    const k = foldName(item);
    if (k) keys.add(k);
  }
  return [...keys];
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  const left = new Set(keysFor(a));
  if (!left.size) return false;
  for (const k of keysFor(b)) if (left.has(k)) return true;
  return false;
}

function extraQueries(name, nameZh) {
  const seeds = [name, nameZh].map(s => String(s || '').trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const seed of seeds) {
    const g = groupFor(seed);
    if (!g) continue;
    for (const q of g) {
      if (/[\u4e00-\u9fff]/.test(q)) continue;
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

function knownEn(teamId) {
  const id = String(teamId || '');
  return KNOWN_EN[id] || '';
}

/** English / alias strings to try against an ESPN team index. No fabricated ids. */
function candidateNames({ teamId, teamName, extras } = {}) {
  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (!t || out.includes(t)) return;
    out.push(t);
  };
  push(knownEn(teamId));
  push(teamName);
  for (const q of extraQueries(teamName, teamName)) push(q);
  for (const e of extras || []) {
    push(e);
    for (const q of extraQueries(e, '')) push(q);
  }
  return out;
}

module.exports = {
  KNOWN_EN,
  GROUPS,
  foldName,
  keysFor,
  namesMatch,
  extraQueries,
  knownEn,
  candidateNames,
  groupFor,
};
