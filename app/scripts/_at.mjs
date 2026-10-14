// Временный помощник: снимок на позиции элемента. node scripts/_at.mjs out.png '#remote' [profile] [offset]
import { chromium } from 'playwright-core';
const [out, sel, prof = 'desktop', off = '0'] = process.argv.slice(2);
const P = { desktop: { w: 1440, h: 900, d: 1, m: false }, mobile: { w: 390, h: 844, d: 2, m: true } }[prof];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: P.w, height: P.h }, deviceScaleFactor: P.d, isMobile: P.m, hasTouch: P.m, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error','warning'].includes(m.type())) logs.push(m.text().slice(0,300)); });
page.on('pageerror', (e) => logs.push('PAGEERR ' + e.message.slice(0,300)));
await page.goto('http://127.0.0.1:5173/?freeze=8&lock&tier=' + (P.m ? 2 : 3) + '&nointro', { waitUntil: 'load' });
await page.waitForTimeout(8000);
await page.evaluate(([s, o]) => { const e = document.querySelector(s); const y = e.getBoundingClientRect().top + scrollY + Number(o); window.scrollTo({ top: y, behavior: 'instant' }); }, [sel, off]);
await page.waitForTimeout(6500);
await page.screenshot({ path: out });
console.log(logs.length ? logs.join('\n') : 'консоль чисто');
await browser.close();
