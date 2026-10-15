#!/usr/bin/env node
// 1.9.6: Aliyun server cannot reach Wikidata (timeout). Run on the box:
//   node tools/wiki-namezh-sync.js   → pulls unresolved player names from prod, resolves zh via Wikidata,
//   merges ONLY new entries into prod data/squads/_namezh.json (never overwrites existing).
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const UA = { 'User-Agent': 'JingcaiPredict/1.9 (namezh sync; box)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJ(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (t + 1)); continue; }
      return await r.json();
    } catch { await sleep(3000); }
  }
  throw new Error('wikidata unavailable');
}
const isFb = h => /足球|footballer|association football|soccer/i.test(h.description || '');
async function zhLabel(name) {
  const j = await getJ('https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' + encodeURIComponent(name) + '&language=en&uselang=zh&format=json&limit=8');
  const hit = (j.search || []).find(isFb);
  if (!hit) return '';
  if (/[\u4e00-\u9fff]/.test(hit.label || '')) return hit.label;
  const e = await getJ('https://www.wikidata.org/wiki/Special:EntityData/' + hit.id + '.json');
  const L = (e.entities && e.entities[hit.id] && e.entities[hit.id].labels) || {};
  const v = (L.zh || L['zh-hans'] || L['zh-cn'] || {}).value || '';
  return /[\u4e00-\u9fff]/.test(v) ? v : '';
}
const SSH = `ssh -i ${process.env.HOME}/.ssh/jingcai_ed25519 -o BatchMode=yes root@120.77.152.74`;
const pull = execSync(`${SSH} 'cd /opt/jingcai/data && python3 - <<EOF
import json,glob
names={}
try:
  for k in json.load(open("squads/_namezh_auto.json")): names[k]=""
except Exception: pass
for f in glob.glob("live-stats/espn/roster/*.json"):
  d=json.load(open(f))
  for a in d.get("athletes",[]): names.setdefault(a["name"], d.get("team",{}).get("name",""))
  for a in d.get("athletes",[]): names[a["name"]] = names[a["name"]] or d.get("team",{}).get("name","")
for f in glob.glob("live-stats/espn/lineup/ev-*.json"):
  d=json.load(open(f))["v"]
  for r in d.get("rosters",[]):
    for p in r["starters"]+r["bench"]: names.setdefault(p["name"], r.get("team",""))
m=json.load(open("squads/_namezh.json"))
print(json.dumps({k:v for k,v in names.items() if k not in m}))
EOF'`, { maxBuffer: 64 << 20 }).toString();
// single-token names (Wesley, Danilo…) are ambiguous on Wikidata → skip
const todo = Object.entries(JSON.parse(pull)).filter(([n]) => /\s/.test(n.trim()));
let t2s = x => x;
try { t2s = require('opencc-js').Converter({ from: 'tw', to: 'cn' }); } catch { try { t2s = require('/tmp/occ/node_modules/opencc-js').Converter({ from: 'tw', to: 'cn' }); } catch {} }
console.log('unresolved names:', todo.length);
(async () => {
  const add = {};
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const [name, team] = todo[i++];
      try {
        const zh = await zhLabel(name);
        if (i % 100 === 0) console.log('progress', i, Object.keys(add).length);
        if (zh && /[\u4e00-\u9fff]/.test(zh)) add[name] = t2s(zh);
        await new Promise(r => setTimeout(r, 250));
      } catch {}
    }
  }
  await worker();
  console.log('resolved:', Object.keys(add).length);
  fs.writeFileSync('/tmp/namezh-add.json', JSON.stringify(add));
  execSync(`scp -i ${process.env.HOME}/.ssh/jingcai_ed25519 -q /tmp/namezh-add.json root@120.77.152.74:/tmp/namezh-add.json`);
  console.log(execSync(`${SSH} 'cd /opt/jingcai/data/squads && python3 -c "
import json;m=json.load(open(\\"_namezh.json\\"));a=json.load(open(\\"/tmp/namezh-add.json\\"));n=0
for k,v in a.items():
  if k not in m: m[k]=v;n+=1
json.dump(m,open(\\"_namezh.json.tmp\\",\\"w\\"),ensure_ascii=False);import os;os.replace(\\"_namezh.json.tmp\\",\\"_namezh.json\\");print(\\"merged\\",n,\\"total\\",len(m))"'`).toString());
})();
