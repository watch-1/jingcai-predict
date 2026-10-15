// node tools/make-banners.js -> public/banners/*.jpg (1500x600 promo banners rendered from HTML/SVG via headless Chrome)
const puppeteer = require('puppeteer-core');
const pent = (cx, cy, r, rot = -90) => Array.from({ length: 5 }, (_, i) => { const a = (rot + i * 72) * Math.PI / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
const ball = (s, c = '#fff', l = '#1f2d4d') => { const id = 'c' + Math.random().toString(36).slice(2, 7);
  const outer = Array.from({ length: 5 }, (_, i) => { const a = (-90 + i * 72) * Math.PI / 180; return [50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a), -90 + i * 72 + 36]; });
  const seams = Array.from({ length: 5 }, (_, i) => { const a = (-90 + i * 72) * Math.PI / 180; return `M${(50 + 15 * Math.cos(a)).toFixed(1)} ${(50 + 15 * Math.sin(a)).toFixed(1)}L${(50 + 33 * Math.cos(a)).toFixed(1)} ${(50 + 33 * Math.sin(a)).toFixed(1)}`; }).join('');
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="47"/></clipPath><radialGradient id="${id}g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9e2f2"/></radialGradient></defs>
  <circle cx="50" cy="50" r="47" fill="url(#${id}g)"/><g clip-path="url(#${id})"><polygon points="${pent(50, 50, 15)}" fill="${l}"/>${outer.map(([x, y, r]) => `<polygon points="${pent(x, y, 14, r)}" fill="${l}"/>`).join('')}
  <path d="${seams}" stroke="${l}" stroke-width="2.2"/></g><circle cx="50" cy="50" r="47" fill="none" stroke="${l}" stroke-opacity=".25" stroke-width="1.5"/></svg>`; };
const base = (bg, inner) => `<html><head><style>
*{margin:0;box-sizing:border-box}body{width:750px;height:300px;overflow:hidden;font-family:"Noto Sans CJK SC","PingFang SC",sans-serif;color:#fff}
.b{position:relative;width:750px;height:300px;background:${bg};overflow:hidden;padding:52px 0 0 48px}
h1{font-size:46px;font-weight:900;letter-spacing:3px;text-shadow:0 4px 14px rgba(0,0,0,.25)}
h1 em{font-style:normal;color:#ffd84d}
p{font-size:18px;opacity:.92;margin-top:10px;letter-spacing:1px}
.cta{display:inline-block;margin-top:22px;padding:8px 22px;border-radius:24px;background:#fff;color:#1a62f0;font-weight:700;font-size:16px;box-shadow:0 6px 16px rgba(0,0,0,.18)}
.tip{position:absolute;left:48px;bottom:26px;font-size:11px;opacity:.7;letter-spacing:1px}
.abs{position:absolute}
</style></head><body><div class="b">${inner}</div></body></html>`;
const banners = {
  'banner-hot': base('linear-gradient(120deg,#3d8bff 0%,#1a62f0 45%,#0b3fb0 100%)', `
    <svg class="abs" style="right:-40px;top:-30px;opacity:.16" width="520" height="380" viewBox="0 0 520 380"><g fill="none" stroke="#fff" stroke-width="4"><rect x="20" y="20" width="480" height="340" rx="6"/><path d="M260 20v340"/><circle cx="260" cy="190" r="70"/><rect x="20" y="110" width="80" height="160"/><rect x="420" y="110" width="80" height="160"/></g></svg>
    <div class="abs" style="right:70px;top:48px;transform:rotate(-18deg);filter:drop-shadow(0 18px 24px rgba(0,0,0,.3))">${ball(190)}</div>
    <div class="abs" style="right:260px;top:190px;opacity:.5;transform:rotate(20deg)">${ball(46)}</div>
    <div class="abs" style="right:36px;top:30px;width:12px;height:12px;border-radius:50%;background:#ffd84d"></div>
    <h1>今日<em>热门</em>赛事</h1><p>五大联赛 · 国际赛事 · 官方即时赔率</p><span class="cta">查看赛程 ›</span><div class="tip">仅供参考，理性购彩 · 本站不提供投注服务</div>`),
  'banner-predict': base('linear-gradient(120deg,#5b3df5 0%,#2d4de0 50%,#1a2f8f 100%)', `
    <svg class="abs" style="right:28px;top:50px" width="240" height="184" viewBox="0 0 300 230">
      <g opacity=".95"><rect x="20" y="130" width="38" height="80" rx="8" fill="#ffffff55"/><rect x="78" y="95" width="38" height="115" rx="8" fill="#ffffff77"/><rect x="136" y="60" width="38" height="150" rx="8" fill="#ffffffaa"/><rect x="194" y="20" width="38" height="190" rx="8" fill="#ffd84d"/></g>
      <path d="M20 120 L97 80 L155 50 L240 10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="240" cy="10" r="9" fill="#fff"/>
    </svg>
    <h1>赔率概率 <em>智能预测</em></h1><p>去除返还率 · 隐含概率 · 信心指数</p><span class="cta" style="color:#4a3de8">查看预测 ›</span><div class="tip">预测基于赔率计算，仅供参考，理性购彩</div>`),
  'banner-results': base('linear-gradient(120deg,#ff9a3d 0%,#f5701f 45%,#d9480f 100%)', `
    <svg class="abs" style="right:70px;top:34px;filter:drop-shadow(0 16px 20px rgba(0,0,0,.25))" width="200" height="230" viewBox="0 0 200 230">
      <path d="M50 20h100v60a50 50 0 0 1-100 0z" fill="#ffd84d"/><path d="M50 36H20v14a34 34 0 0 0 34 34M150 36h30v14a34 34 0 0 1-34 34" stroke="#ffd84d" stroke-width="12" fill="none"/>
      <rect x="88" y="128" width="24" height="36" fill="#ffd84d"/><rect x="55" y="164" width="90" height="26" rx="6" fill="#fff"/><rect x="45" y="190" width="110" height="18" rx="5" fill="#ffe8a3"/>
      <path d="M100 42l8 16 18 3-13 12 3 18-16-9-16 9 3-18-13-12 18-3z" fill="#fff"/></svg>
    <div class="abs" style="right:250px;top:150px;padding:8px 14px;border-radius:12px;background:#ffffff26;font-size:30px;font-weight:900;letter-spacing:2px">2 : 1</div>
    <div class="abs" style="right:262px;top:212px;padding:4px 12px;border-radius:10px;background:#ffffff26;font-size:16px;font-weight:700">半场 1 : 0</div>
    <h1>开奖结果 <em style="color:#fff3b0">速查</em></h1><p>全场比分 · 半场 · 胜平负/让球赛果</p><span class="cta" style="color:#e8590c">查看开奖 ›</span><div class="tip">数据来源 sporttery.cn · 以官方公布为准</div>`),
};
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 750, height: 300, deviceScaleFactor: 2 });
  for (const [n, html] of Object.entries(banners)) {
    await p.setContent(html, { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 200));
    await p.screenshot({ path: `public/banners/${n}.jpg`, type: 'jpeg', quality: 86 }); console.log('banner', n);
  }
  await b.close();
})();
