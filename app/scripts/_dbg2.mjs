import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,300)));
page.on('console', m => { if (['error','warning'].includes(m.type())) console.log('[console.'+m.type()+']', m.text().slice(0,300)); });
await page.goto('http://127.0.0.1:5173/?freeze=8&lock&tier=3&nointro', { waitUntil: 'load' });
await page.waitForTimeout(8000);
await page.evaluate(() => window.scrollTo({ top: 2150, behavior: 'instant' }));
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { cls: e.className, top: Math.round(b.top), h: Math.round(b.height), op: cs.opacity, vis: cs.visibility, tr: cs.transform.slice(0,40), z: cs.zIndex }; };
  return { scrollY: scrollY, svc: q('#services'), head: q('#services .sec__head'), h2: q('#svc-h'), console: q('#console'), panel0: q('#svc-0'), hero: q('.hero'), heroPin: q('.hero__pin'), hp: getComputedStyle(document.querySelector('.hero__pin')).getPropertyValue('--hp') };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
