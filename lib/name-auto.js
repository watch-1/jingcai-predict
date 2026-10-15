// 1.9.6: Automatic Chinese transliteration for player names missing from namezh.
// Priority (callers): established namezh / PLAYER_ZH > Wikidata zh label (background queue) > rule-based auto.
// Rule-based: simplified Xinhua-style syllable table + per-language spelling normalisation.
// Output is APPROXIMATE and always flagged source 'auto'.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const AUTO_FILE = () => path.join(DATA_DIR, 'squads', '_namezh_auto.json');
const NAMEZH_FILE = () => path.join(DATA_DIR, 'squads', '_namezh.json');
function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); }

// ---------- syllable table ----------
// columns: a e i o u  | bare (consonant without vowel)
const T = {
  '':  ['阿', '埃', '伊', '奥', '乌', ''],
  b:  ['巴', '贝', '比', '博', '布', '布'],
  p:  ['帕', '佩', '皮', '波', '普', '普'],
  d:  ['达', '德', '迪', '多', '杜', '德'],
  t:  ['塔', '特', '蒂', '托', '图', '特'],
  g:  ['加', '盖', '吉', '戈', '古', '格'],
  k:  ['卡', '凯', '基', '科', '库', '克'],
  f:  ['法', '费', '菲', '福', '富', '夫'],
  v:  ['瓦', '韦', '维', '沃', '武', '夫'],
  w:  ['瓦', '韦', '维', '沃', '伍', '夫'],
  s:  ['萨', '塞', '西', '索', '苏', '斯'],
  z:  ['扎', '泽', '齐', '佐', '祖', '兹'],
  ts: ['察', '策', '齐', '措', '楚', '茨'],
  sh: ['沙', '谢', '希', '肖', '舒', '什'],
  ch: ['查', '切', '奇', '乔', '丘', '奇'],
  j:  ['贾', '热', '吉', '若', '茹', '日'],
  dj: ['贾', '杰', '吉', '乔', '朱', '季'],
  l:  ['拉', '莱', '利', '洛', '卢', '尔'],
  r:  ['拉', '雷', '里', '罗', '鲁', '尔'],
  m:  ['马', '梅', '米', '莫', '穆', '姆'],
  n:  ['纳', '内', '尼', '诺', '努', '恩'],
  h:  ['哈', '赫', '希', '霍', '胡', '赫'],
  y:  ['亚', '耶', '伊', '约', '尤', '伊'],
  ny: ['尼亚', '涅', '尼', '尼奥', '纽', '尼'],
  ly: ['利亚', '列', '利', '廖', '柳', '利'],
  kh: ['哈', '赫', '希', '霍', '胡', '赫'],
};
// C + vowel + n  (a e i o u)
const N = {
  '': ['安', '恩', '因', '翁', '温'],
  b: ['班', '本', '宾', '邦', '本'], p: ['潘', '彭', '平', '蓬', '蓬'], d: ['丹', '登', '丁', '东', '敦'],
  t: ['坦', '滕', '廷', '通', '通'], g: ['甘', '根', '金', '贡', '贡'], k: ['坎', '肯', '金', '孔', '昆'],
  f: ['范', '芬', '芬', '丰', '丰'], v: ['万', '文', '文', '冯', '文'], w: ['万', '文', '温', '翁', '温'],
  s: ['桑', '森', '辛', '松', '孙'], z: ['赞', '曾', '津', '宗', '尊'], ts: ['灿', '岑', '钦', '聪', '尊'],
  sh: ['尚', '申', '欣', '雄', '顺'], ch: ['钱', '琴', '钦', '琼', '春'], j: ['让', '任', '金', '容', '容'],
  dj: ['詹', '真', '金', '琼', '准'], l: ['兰', '伦', '林', '隆', '伦'], r: ['兰', '伦', '林', '龙', '伦'],
  m: ['曼', '门', '明', '蒙', '蒙'], n: ['南', '嫩', '宁', '农', '农'], h: ['汉', '亨', '欣', '洪', '洪'],
  y: ['扬', '延', '因', '扬', '云'], kh: ['汉', '亨', '欣', '洪', '洪'], ny: ['尼扬', '年', '宁', '尼翁', '纽恩'], ly: ['连', '连', '林', '廖恩', '柳恩'],
};
const VI = { a: 0, e: 1, i: 2, o: 3, u: 4 };
const CONS = ['dj', 'ts', 'sh', 'ch', 'ny', 'ly', 'kh', 'b', 'p', 'd', 't', 'g', 'k', 'f', 'v', 'w', 's', 'z', 'j', 'l', 'r', 'm', 'n', 'h', 'y'];

// ---------- language guess ----------
const NAT_LANG = {
  Spain: 'es', Argentina: 'es', Uruguay: 'es', Colombia: 'es', Mexico: 'es', Chile: 'es', Peru: 'es', Ecuador: 'es', Venezuela: 'es', Paraguay: 'es', Panama: 'es', 'Costa Rica': 'es', Honduras: 'es', 'Dominican Republic': 'es', Bolivia: 'es',
  Portugal: 'pt', Brazil: 'pt', 'Cape Verde': 'pt', Angola: 'pt', 'Guinea-Bissau': 'pt', Mozambique: 'pt',
  France: 'fr', Belgium: 'fr', 'Ivory Coast': 'fr', "Cote d'Ivoire": 'fr', Senegal: 'fr', Cameroon: 'fr', Mali: 'fr', Guinea: 'fr', Morocco: 'fr', Algeria: 'fr', Tunisia: 'fr', 'DR Congo': 'fr', Congo: 'fr', Haiti: 'fr', Switzerland: 'de',
  Germany: 'de', Austria: 'de', Netherlands: 'nl', Turkey: 'tr', 'Türkiye': 'tr',
  Norway: 'no', Sweden: 'no', Denmark: 'no', Iceland: 'no', Finland: 'no',
  Italy: 'it', Croatia: 'sl', Serbia: 'sl', Slovenia: 'sl', Bosnia: 'sl', 'Bosnia-Herzegovina': 'sl', Montenegro: 'sl', Poland: 'pl', 'Czechia': 'sl', 'Czech Republic': 'sl', Slovakia: 'sl',
  Georgia: 'en', Ukraine: 'en', Russia: 'en',
};
function guessLang(name, nat) {
  if (nat && NAT_LANG[nat]) return NAT_LANG[nat];
  const s = String(name);
  if (/[ğşı]|ç/.test(s) && /[ğşı]/.test(s)) return 'tr';
  if (/ñ/.test(s)) return 'es';
  if (/[ãõ]|ç[ãa]o|nh|lh/.test(s)) return 'pt';
  if (/[ßäöü]|sch/.test(s)) return 'de';
  if (/[øå]/.test(s)) return 'no';
  if (/ij|aa|oe|uu/.test(s)) return 'nl';
  if (/[čćšžđ]/.test(s)) return 'sl';
  if (/[éèêëàç]/.test(s)) return 'fr';
  return 'en';
}

// ---------- spelling normalisation → simple phonetic latin ----------
function normWord(w, lang) {
  let s = w.toLowerCase();
  // language specific before accents are stripped
  if (lang === 'tr') s = s.replace(/ç/g, 'ch').replace(/ş/g, 'sh').replace(/ğ/g, '').replace(/ı/g, 'i').replace(/c/g, 'dj').replace(/ö/g, 'e').replace(/ü/g, 'u');
  if (lang === 'sl' || lang === 'pl') s = s.replace(/[čć]/g, 'ch').replace(/š/g, 'sh').replace(/ž/g, 'j').replace(/đ/g, 'dj').replace(/cz/g, 'ch').replace(/sz/g, 'sh').replace(/ł/g, 'w').replace(/c/g, 'ts').replace(/j/g, 'y');
  if (lang === 'de') s = s.replace(/^chr/, 'kr').replace(/^ch/, 'k').replace(/ä/g, 'e').replace(/ö/g, 'e').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/sch/g, 'sh').replace(/tsch/g, 'ch').replace(/ch/g, 'h').replace(/ei/g, 'ai').replace(/ie/g, 'i').replace(/eu/g, 'oi').replace(/w/g, 'v').replace(/j/g, 'y').replace(/z/g, 'ts').replace(/^v/, 'f');
  if (lang === 'nl') s = s.replace(/ij/g, 'ei').replace(/oe/g, 'u').replace(/oo/g, 'o').replace(/aa/g, 'a').replace(/ee/g, 'e').replace(/uu/g, 'u').replace(/sch/g, 'sh').replace(/ch/g, 'h').replace(/j/g, 'y').replace(/^v/, 'f').replace(/w/g, 'v');
  if (lang === 'no') s = s.replace(/ø/g, 'e').replace(/å/g, 'o').replace(/æ/g, 'e').replace(/j/g, 'y').replace(/kj/g, 'sh');
  if (lang === 'es' || lang === 'pt') s = s.replace(/[áàâ]/g, 'a').replace(/[éê]/g, 'e').replace(/í/g, 'i').replace(/[óô]/g, 'o').replace(/ú/g, 'u');
  if (lang === 'es') s = s.replace(/ñ/g, 'ny').replace(/ll/g, 'y').replace(/j/g, 'h').replace(/g([ei])/g, 'h$1').replace(/gu([ei])/g, 'g$1').replace(/qu/g, 'k').replace(/z/g, 's').replace(/c([ei])/g, 's$1').replace(/v/g, 'b').replace(/h(?=[aeiou])/g, (m, o, str) => (o === 0 ? '' : m));
  if (lang === 'pt') s = s.replace(/ção/g, 'sao').replace(/ões/g, 'oes').replace(/ão/g, 'ao').replace(/nh/g, 'ny').replace(/lh/g, 'ly').replace(/qu/g, 'k').replace(/ç/g, 's').replace(/c([ei])/g, 's$1').replace(/j/g, 'j').replace(/x/g, 'sh').replace(/^r/, 'h').replace(/rr/g, 'h');
  if (lang === 'fr') s = s.replace(/(e|s|t|x|d)$/g, '').replace(/tch/g, 'TCH').replace(/eau|au/g, 'o').replace(/ou/g, 'u').replace(/oi/g, 'wa').replace(/ch/g, 'sh').replace(/qu/g, 'k').replace(/gn/g, 'ny').replace(/ç/g, 's').replace(/c([eiy])/g, 's$1').replace(/é|è|ê|ë/g, 'e').replace(/TCH/g, 'ch').replace(/^h/, '').replace(/j/g, 'j');
  if (lang === 'it') s = s.replace(/gli/g, 'li').replace(/gn/g, 'ny').replace(/ch/g, 'k').replace(/c([ei])/g, 'ch$1').replace(/g([ei])/g, 'dj$1').replace(/sc([ei])/g, 'sh$1').replace(/zz|z/g, 'ts').replace(/h/g, '').replace(/chi/g, 'chi');
  if (lang === 'en') s = s.replace(/^geo/, 'jo').replace(/^g([eiy])/, 'dj$1').replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/c([eiy])/g, 's$1').replace(/ee|ea/g, 'i').replace(/oo/g, 'u').replace(/ow$/g, 'o').replace(/j/g, 'dj').replace(/y$/g, 'i').replace(/e$/g, '');
  // strip remaining accents
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // generic
  s = s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/c(?!h)/g, 'k')
    .replace(/([bdfgklmnprstvz])\1/g, '$1').replace(/[^a-z]/g, '')
    .replace(/ai|ay|ei|ey/g, 'ai').replace(/ou|ow/g, 'o').replace(/ie/g, 'i').replace(/y(?![aeiou])/g, 'i');
  return s;
}

function translitWord(w) {
  const out = [];
  let i = 0;
  const isV = ch => !!ch && ch.length === 1 && 'aeiou'.includes(ch);
  while (i < w.length) {
    let c = '';
    for (const k of CONS) if (w.startsWith(k, i) && T[k]) { c = k; break; }
    if (!c && !isV(w[i])) { i++; continue; } // unknown letter
    let j = i + c.length;
    if (j < w.length && isV(w[j])) {
      let v = w[j];
      if (v === 'a' && w[j + 1] === 'i') { v = 'e'; j++; } // ai → e column (拜≈贝)
      const vi = VI[v];
      // C V n (not followed by vowel) → nasal syllable
      if ((w[j + 1] === 'n' || w[j + 1] === 'm') && !isV(w[j + 2] || '') && N[c]) {
        out.push(N[c][vi]); i = j + 2; continue;
      }
      out.push(!c && v === 'a' && i > 0 && w[i - 1] === 'i' ? '亚' : T[c][vi]); i = j + 1;
    } else {
      // bare consonant
      const isLast = j >= w.length;
      if (c === 'r' && !isLast) { i = j; continue; } // pre-consonant r mostly dropped (Xinhua 尔 only at end)
      if ((c === 'n' || c === 'm') && out.length && !isLast) { out.push(c === 'n' ? '恩' : '姆'); i = j; continue; }
      if (T[c][5]) out.push(T[c][5]);
      i = j;
    }
  }
  return out.join('');
}

function translit(name, nat) {
  const lang = guessLang(name, nat);
  const words = String(name || '').replace(/\./g, ' ').split(/[\s]+/).filter(Boolean);
  const parts = [];
  for (const w of words) {
    const sub = w.split('-').map(x => translitWord(normWord(x, lang))).filter(Boolean);
    if (sub.length) parts.push(sub.join('-'));
  }
  return parts.join('·');
}

// ---------- caches + wiki queue ----------
let autoMem = null;
function autoCache() { if (!autoMem) autoMem = readJson(AUTO_FILE(), {}); return autoMem; }
let saveT = null;
function saveSoon() { if (saveT) return; saveT = setTimeout(() => { saveT = null; try { writeJson(AUTO_FILE(), autoCache()); } catch {} }, 2000); }

const wq = []; const wSeen = new Set(); let wRunning = false;
function enqueueWiki(name, team) {
  const k = name + '|' + (team || '');
  if (wSeen.has(k)) return; wSeen.add(k);
  const c = autoCache()[name];
  if (c && c.wikiTried && Date.now() - c.wikiTried < 14 * 864e5) return;
  wq.push({ name, team }); if (!wRunning) runWiki();
}
async function runWiki() {
  wRunning = true;
  const { zhLabel } = require('./wikidata-zh');
  while (wq.length) {
    const it = wq.shift();
    let zh = '';
    try { zh = await Promise.race([zhLabel(it.name, { team: it.team || '' }), new Promise(r => setTimeout(() => r(''), 8000))]); } catch {}
    const c = autoCache()[it.name] || {};
    c.wikiTried = Date.now();
    if (zh && /[\u4e00-\u9fff]/.test(zh)) {
      // Reject weak/ambiguous wiki hits (e.g. Fikayo Tomori →「杜姆尼」): multi-word EN
      // with a short CJK label and no name separator is almost never a reliable footballer label.
      const enParts = String(it.name || '').trim().split(/\s+/).filter(Boolean);
      const cjkLen = [...zh].filter(ch => /[\u4e00-\u9fff]/.test(ch)).length;
      const weak = enParts.length >= 2 && cjkLen <= 3 && !/[·・•]/.test(zh);
      if (!weak) {
        c.wiki = zh;
        // established name found → promote into main namezh map
        const m = readJson(NAMEZH_FILE(), {});
        if (!m[it.name]) { m[it.name] = zh; try { writeJson(NAMEZH_FILE(), m); } catch {} }
      }
    }
    autoCache()[it.name] = c; saveSoon();
    await new Promise(r => setTimeout(r, 1200));
  }
  wRunning = false;
}

/** Fallback zh for a Latin name. Returns { zh, src: 'wiki'|'auto' } or null. Also queues a Wikidata lookup. */
function autoZh(name, { nat = '', team = '' } = {}) {
  const n = String(name || '').trim();
  if (!n || /[\u4e00-\u9fff]/.test(n)) return null;
  const c = autoCache()[n];
  if (c && c.wiki) return { zh: c.wiki, src: 'wiki' };
  enqueueWiki(n, team);
  if (c && c.auto && c.v === 2) return { zh: c.auto, src: 'auto' };
  const zh = translit(n, nat);
  if (!zh) return null;
  autoCache()[n] = { ...(c || {}), auto: zh, v: 2, lang: guessLang(n, nat) }; saveSoon();
  return { zh, src: 'auto' };
}

/** Mutates player-like objects lacking nameZh: sets nameZh + nameZhSrc. */
function fillAuto(list, { nameKey = 'name', zhKey = 'nameZh', natKey = 'nationality', team = '' } = {}) {
  for (const p of list || []) {
    if (!p || (p[zhKey] && /[\u4e00-\u9fff]/.test(p[zhKey]))) continue;
    const r = autoZh(p[nameKey], { nat: p[natKey] || '', team });
    if (r) { p[zhKey] = r.zh; p[zhKey + 'Src'] = r.src; }
  }
  return list;
}

module.exports = { translit, autoZh, fillAuto, guessLang, normWord };
