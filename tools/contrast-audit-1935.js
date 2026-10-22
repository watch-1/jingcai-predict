const puppeteer = require('puppeteer-core');
const fs = require('fs');
const OUT = '/workspace/tiicai-site/screenshots';
fs.mkdirSync(OUT, { recursive: true });

function relLum(r,g,b){
  const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
function contrast(c1,c2){
  const L1=relLum(...c1), L2=relLum(...c2);
  const a=Math.max(L1,L2), b=Math.min(L1,L2);
  return (a+0.05)/(b+0.05);
}
function parseRGB(s){
  if(!s) return null;
  const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m?[+m[1],+m[2],+m[3]]:null;
}

(async()=>{
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox','--lang=zh-CN','--window-size=390,844']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  // Force pitch theme before load
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('jc_home_theme', JSON.stringify('pitch'));
  });
  const base = 'http://120.77.152.74:8088/';
  const routes = [
    ['home', '#/'],
    ['schedule', '#/schedule'],
    ['predict', '#/predict'],
    ['data', '#/data'],
    ['me', '#/me'],
    ['results', '#/results'],
  ];
  const issues = [];
  for (const [name, hash] of routes) {
    await page.goto(base + hash, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/v1935-pitch-${name}.png`, fullPage: false });
    const bad = await page.evaluate(() => {
      function parseRGB(s){
        const m=(s||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m?[+m[1],+m[2],+m[3]]:null;
      }
      function lum([r,g,b]){
        const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
        return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
      }
      function ratio(a,b){const A=Math.max(a,b),B=Math.min(a,b);return (A+0.05)/(B+0.05)}
      const out=[];
      const nodes = document.querySelectorAll('p,span,b,li,h3,h4,small,button,.pr-brief-meta,.concl,.pr-chip,.note,.dsec,.pr-sec');
      for (const el of nodes) {
        const st = getComputedStyle(el);
        if (st.display==='none' || st.visibility==='hidden' || st.opacity==='0') continue;
        const t=(el.innerText||'').trim();
        if (!t || t.length<2) continue;
        const fg=parseRGB(st.color);
        // walk up for opaque bg
        let bg=null, n=el;
        while(n && n!==document.documentElement){
          const b=parseRGB(getComputedStyle(n).backgroundColor);
          if (b && getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(n).backgroundColor !== 'transparent') {
            // skip fully transparent
            const aMatch = getComputedStyle(n).backgroundColor.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
            if (!aMatch || +aMatch[1] > 0.4) { bg=b; break; }
          }
          n=n.parentElement;
        }
        if (!fg || !bg) continue;
        const r = ratio(lum(fg), lum(bg));
        if (r < 3) {
          const cls=(el.className&&String(el.className).slice(0,40))||el.tagName;
          out.push({cls, r:+r.toFixed(2), fg, bg, sample:t.slice(0,40)});
        }
      }
      // also flag large light surfaces under pitch
      const lightSurfaces=[];
      document.querySelectorAll('.pr-brief,.dsec,.ana-card,.card,.hc-item,.pr-chip,.pr-concl,.vip-plan').forEach(el=>{
        const st=getComputedStyle(el);
        const b=parseRGB(st.backgroundColor);
        if (!b) return;
        if (lum(b) > 0.7) lightSurfaces.push({cls:String(el.className).slice(0,50), bg:b});
      });
      return {bad: out.slice(0,25), lightSurfaces: lightSurfaces.slice(0,15), theme: document.documentElement.getAttribute('data-theme')};
    });
    console.log(`\n== ${name} theme=${bad.theme} low-contrast=${bad.bad.length} light-surfaces=${bad.lightSurfaces.length}`);
    bad.lightSurfaces.forEach(x=>console.log('  LIGHT', JSON.stringify(x)));
    bad.bad.slice(0,8).forEach(x=>console.log('  LOW', JSON.stringify(x)));
    issues.push({name, ...bad});
  }

  // Try open a match detail predict tab
  await page.goto(base + '#/predict', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const href = await page.evaluate(() => {
    const a = document.querySelector('[data-go*="#/match/"], a[href*="#/match/"], .pr-card, .pr[data-go]');
    if (!a) return null;
    return a.getAttribute('data-go') || a.getAttribute('href');
  });
  console.log('\nFirst match link:', href);
  if (href) {
    await page.goto(base + (href.startsWith('#')?href:href), { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1000));
    // click 预测 tab
    await page.evaluate(() => {
      const btns=[...document.querySelectorAll('.dtabs button, button')];
      const t=btns.find(b=>/预测/.test(b.textContent||''));
      if (t) t.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: `${OUT}/v1935-pitch-match-predict.png`, fullPage: true });
    const det = await page.evaluate(() => {
      function parseRGB(s){const m=(s||'').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?[+m[1],+m[2],+m[3]]:null}
      function lum([r,g,b]){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)}
      const brief=document.querySelector('.pr-brief');
      const meta=document.querySelector('.pr-brief-meta');
      const concl=document.querySelector('.pr-concl .concl, .concl');
      const info={};
      for (const [k,el] of [['brief',brief],['meta',meta],['concl',concl]]){
        if(!el){info[k]=null;continue}
        const st=getComputedStyle(el);
        info[k]={bg:st.backgroundColor,color:st.color,text:(el.innerText||'').slice(0,60)};
      }
      return info;
    });
    console.log('Predict pane computed:', JSON.stringify(det,null,2));
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/v1935-contrast-report.json`, JSON.stringify(issues,null,2));
  console.log('\nDone. Screenshots in', OUT);
})().catch(e=>{console.error(e);process.exit(1)});
