'use strict';
const assert = require('assert');
const path = require('path');
const warm = require('../lib/lineup-photo-warm');

(async () => {
const pack = {
  home: {
    starters: [
      { name: 'A', photo: 'https://cdn.example/a.jpg' },
      { name: 'B', image: 'https://cdn.example/b.jpg' },
      { name: 'A2', photo: 'https://cdn.example/a.jpg' },
    ],
    bench: [{ name: 'C', photo: 'https://cdn.example/c.jpg' }],
  },
  away: {
    starters: [{ name: 'D', photo: 'https://cdn.example/d.jpg' }],
    bench: [{ name: 'E', photo: 'https://cdn.example/e.jpg' }],
  },
};

const urls = warm.collectPhotoUrls(pack);
assert.deepStrictEqual(urls, [
  'https://cdn.example/a.jpg',
  'https://cdn.example/b.jpg',
  'https://cdn.example/d.jpg',
  'https://cdn.example/c.jpg',
  'https://cdn.example/e.jpg',
]);
assert.deepStrictEqual(warm.collectPhotoUrls(pack, { startersOnly: true }), [
  'https://cdn.example/a.jpg',
  'https://cdn.example/b.jpg',
  'https://cdn.example/d.jpg',
]);
assert.deepStrictEqual(warm.collectPhotoUrls(null), []);

const now = Date.parse('2026-11-19T16:00:00+08:00');
const list = [
  { id: 'soon', date: '2026-11-20', time: '08:30' },
  { id: 'far', date: '2026-12-01', time: '20:00' },
  { id: 'old', date: '2026-11-10', time: '20:00' },
];
const caches = {
  soon: { v: pack },
  far: { v: pack },
};
const from = warm.collectFromMatches(list, {
  now,
  withinHours: 36,
  readMatchCache: (id) => caches[id] || null,
});
assert.deepStrictEqual(from, urls, 'only the in-window match contributes, starters first');

// Skip already-cached files; cap uncached fetches; no overlapping run.
const writes = [];
const fetches = [];
async function runWarm(limit) {
  return warm.warmUrls(urls, {
    limit,
    gapMs: 0,
    logoDir: '/tmp/logos-test',
    safeLogoTarget: (u) => u,
    readCachedLogo: async (file) => (String(file).endsWith(require('crypto').createHash('sha256').update('https://cdn.example/a.jpg').digest('hex')) ? { buf: Buffer.from('x'), type: 'image/jpeg' } : null),
    fetchLogo: async (target) => {
      fetches.push(target);
      return { buf: Buffer.from(target), type: 'image/jpeg' };
    },
    writeFile: async (file, buf) => { writes.push(path.basename(file)); },
  });
}

warm._resetRunning();
fetches.length = 0;
writes.length = 0;
const r = await runWarm(2);
assert.strictEqual(r.cached, 1, 'a.jpg already on disk');
assert.strictEqual(r.fetched, 2, 'only two network gets this tick');
assert.strictEqual(fetches.length, 2);
assert.ok(!fetches.includes('https://cdn.example/a.jpg'));
assert.deepStrictEqual(fetches, ['https://cdn.example/b.jpg', 'https://cdn.example/d.jpg']);

// overlapping run is refused
warm._resetRunning();
let released;
const hold = new Promise((resolve) => { released = resolve; });
const first = warm.warmUrls(['https://cdn.example/z.jpg'], {
  limit: 1,
  gapMs: 0,
  logoDir: '/tmp/logos-test',
  safeLogoTarget: (u) => u,
  readCachedLogo: async () => null,
  fetchLogo: async () => { await hold; return { buf: Buffer.from('z'), type: 'image/jpeg' }; },
  writeFile: async () => {},
});
const second = await warm.warmUrls(['https://cdn.example/z.jpg'], {
  limit: 1, gapMs: 0, logoDir: '/tmp/logos-test',
  safeLogoTarget: (u) => u,
  readCachedLogo: async () => null,
  fetchLogo: async () => ({ buf: Buffer.from('no'), type: 'image/jpeg' }),
  writeFile: async () => {},
});
assert.strictEqual(second.skippedRun, true);
released();
await first;
warm._resetRunning();

console.log('lineup-photo-warm-test ok');

})().catch((e) => { console.error(e); process.exit(1); });
