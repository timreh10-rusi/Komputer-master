// Автопроверка доступности (axe-core) на нескольких состояниях страницы.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const axe = fs.readFileSync(path.resolve(import.meta.dirname, '../node_modules/axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const cases = [
  { name: 'десктоп', vp: { width: 1440, height: 900 }, mobile: false },
  { name: 'телефон', vp: { width: 390, height: 844 }, mobile: true },
];
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: c.vp, isMobile: c.mobile, hasTouch: c.mobile, deviceScaleFactor: 1, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(BASE + '?freeze=8&lock&tier=2&nointro', { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  // раскрываем всё, чтобы проверять реальные цвета (анимации появления)
  await page.evaluate(() => { document.documentElement.classList.add('km-fail'); });
  await page.waitForTimeout(1500);
  await page.evaluate(axe);
  const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } }));
  console.log(`\n=== ${c.name}: нарушений ${res.violations.length}`);
  for (const v of res.violations) {
    console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log('    ', n.target.join(' '), '|', (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 160));
  }
  await ctx.close();
}
await browser.close();
