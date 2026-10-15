// node tools/make-icons.js -> public/icons/*.png + android/res/mipmap-*/ic_launcher.png (rendered via headless Chrome)
const puppeteer = require('puppeteer-core'); const fs = require('fs');
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a7bf0"/><stop offset=".55" stop-color="#1a5fd8"/><stop offset="1" stop-color="#1449b8"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/>
<g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
<circle cx="256" cy="205" r="120" fill="#fff"/>
<polygon points="256,150 308,188 288,249 224,249 204,188" fill="#1a3a7a"/>
<g stroke="#1a3a7a" stroke-width="10" fill="none" stroke-linecap="round"><path d="M256 150 V92"/><path d="M308 188 L366 168"/><path d="M288 249 L322 300"/><path d="M224 249 L190 300"/><path d="M204 188 L146 168"/></g>
<text x="256" y="425" text-anchor="middle" font-family="Noto Sans CJK SC, PingFang SC, sans-serif" font-weight="900" font-size="104" fill="#fff" letter-spacing="6">竞彩</text>
</g></svg>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const render = async (size, pad, out, round) => {
    await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;overflow:hidden;${round ? 'border-radius:22%;' : ''}">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
    await p.screenshot({ path: out, omitBackground: true }); console.log('icon', out);
  };
  await render(192, 1, 'public/icons/icon-192.png'); await render(512, 1, 'public/icons/icon-512.png');
  await render(512, 0.78, 'public/icons/icon-maskable-512.png'); await render(180, 1, 'public/icons/apple-touch-icon.png');
  for (const [d, s] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    fs.mkdirSync(`android/res/mipmap-${d}`, { recursive: true });
    await render(s, 1, `android/res/mipmap-${d}/ic_launcher.png`, true);
  }
  await b.close();
})();
