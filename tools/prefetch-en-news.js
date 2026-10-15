#!/usr/bin/env node
// Prefetch EN football news list + article bodies from a host that can reach Sky/BBC/Guardian/ESPN
// (typically the box). Writes data/news/cache-en.json and data/news/articles/*.json for Aliyun.
'use strict';
const path = require('path');
const fs = require('fs');

// Ensure DATA_DIR points at project data when run on box
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(__dirname, '..', 'data');
}

const news = require('../lib/news');

async function warmImages(urls) {
  const crypto = require('crypto');
  const dir = path.join(process.env.DATA_DIR, 'news-images');
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const raw of urls) {
    let u = String(raw || '').trim();
    if (!u) continue;
    if (u.startsWith('//')) u = 'https:' + u;
    try {
      const r = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JingcaiNews/1.4.1)',
          Accept: 'image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 16 || buf.length > 3 * 1024 * 1024) continue;
      const hash = crypto.createHash('sha256').update(u).digest('hex');
      const tmp = path.join(dir, hash + '.tmp');
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, path.join(dir, hash));
      ok++;
    } catch {
      /* skip */
    }
  }
  return ok;
}

(async () => {
  const perSource = parseInt(process.argv[2], 10) || 12;
  console.log('prefetch EN news, perSource=', perSource, 'DATA_DIR=', process.env.DATA_DIR);
  const stats = await news.prefetchEnNews({ perSource });
  console.log(JSON.stringify(stats, null, 2));

  // Warm thumbs from list + article covers
  const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'news', 'cache-en.json'), 'utf8'));
  const urls = new Set();
  for (const it of disk.items || []) {
    if (it.thumb) urls.add(it.thumb);
  }
  const artDir = path.join(process.env.DATA_DIR, 'news', 'articles');
  try {
    for (const f of fs.readdirSync(artDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const a = JSON.parse(fs.readFileSync(path.join(artDir, f), 'utf8'));
        if (a.cover) urls.add(a.cover);
        // also collect proxied img originals from html
        const m = String(a.html || '').matchAll(/\/api\/news-image\?url=([^"&]+)/g);
        for (const x of m) {
          try {
            urls.add(decodeURIComponent(x[1]));
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no articles */
  }
  const warmed = await warmImages([...urls].slice(0, 80));
  console.log('warmed images', warmed, 'of', Math.min(urls.size, 80));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
