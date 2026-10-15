/** Resolve Chinese labels for people via Wikidata search. */
const cache = new Map();

function hasCjk(s) {
  return /[\u4e00-\u9fff]/.test(s || '');
}

async function searchOnce(q) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' +
    encodeURIComponent(q) +
    '&language=en&uselang=zh&format=json&limit=8&origin=*';
  const r = await fetch(url, { headers: { 'User-Agent': 'JingcaiPredict/1.8 (wikidata-zh)' } });
  const j = await r.json();
  return j.search || [];
}

async function labelFromEntity(id) {
  const e = await fetch('https://www.wikidata.org/wiki/Special:EntityData/' + id + '.json', {
    headers: { 'User-Agent': 'JingcaiPredict/1.8 (wikidata-zh)' },
  }).then((x) => x.json());
  const ent = e.entities?.[id];
  // Prefer zh / zh-hans; zh-cn on Wikidata is occasionally wrong for athletes (e.g. Christensen).
  return (
    ent?.labels?.zh?.value ||
    ent?.labels?.['zh-hans']?.value ||
    ent?.labels?.['zh-cn']?.value ||
    ''
  );
}

function isFootballHit(h) {
  return /足球|足球運動員|足球运动员|footballer|association football|soccer player/i.test(h.description || '');
}

/**
 * @param {string} englishName
 * @param {{ alt?: string, team?: string }} [opts]
 */
async function zhLabel(englishName, opts = {}) {
  const key = [englishName, opts.alt || '', opts.team || ''].join('|');
  if (cache.has(key)) return cache.get(key);

  const queries = [];
  if (opts.alt) queries.push(opts.alt);
  if (englishName) queries.push(englishName);
  if (englishName && opts.team) queries.push(englishName + ' ' + opts.team);
  if (opts.alt && opts.team) queries.push(opts.alt + ' ' + opts.team);

  let label = '';
  try {
    for (const q of queries) {
      if (!q || q.length < 2) continue;
      const hits = await searchOnce(q);
      const football = hits.filter(isFootballHit);
      const prefer = football[0] || (hits.length === 1 ? hits[0] : null);
      if (!prefer) continue;
      // Search uselang=zh often returns the correct CJK label; prefer it over entity zh-cn quirks.
      if (hasCjk(prefer.label)) {
        label = prefer.label;
      } else if (prefer.display?.label?.value && hasCjk(prefer.display.label.value)) {
        label = prefer.display.label.value;
      } else {
        label = await labelFromEntity(prefer.id);
        if (!hasCjk(label)) label = '';
      }
      if (label) break;
    }
  } catch {
    label = '';
  }
  if (label) cache.set(key, label);
  return label || '';
}

module.exports = { zhLabel };
