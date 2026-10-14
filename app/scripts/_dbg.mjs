import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => console.log('[console.'+m.type()+']', m.text().slice(0,400)));
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,400)));
await page.goto(process.argv[2] || 'http://127.0.0.1:5173/?freeze=8&lock&tier=3&nointro', { waitUntil: 'load' });
await page.waitForTimeout(7000);
const info = await page.evaluate(() => {
  const k = window.__km; const st = k && k.stage;
  const c = document.getElementById('gl');
  return { hasKm: !!k, hasStage: !!st, tier: k && k.Q.tier, gl: document.documentElement.className, canvas: c && [c.width, c.height, c.clientWidth, c.clientHeight, getComputedStyle(c).opacity], I: st && st.I, heroP: k && k.S.heroP, info: st && st.info() };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
