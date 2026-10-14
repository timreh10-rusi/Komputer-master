// Проверка живого сценария: загрузчик, вступление, управление ноутбуком, консоль услуг, часы, клавиатура.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = process.argv[2] || './shots-i';
const BASE = process.argv[3] || 'http://127.0.0.1:5173/';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('снимок', n); };

await page.goto(BASE + '?tier=3&lock', { waitUntil: 'commit' });
await page.waitForTimeout(900);  await shot('1-loader-early');
await page.waitForTimeout(1500); await shot('2-loader-mid');
await page.waitForTimeout(3500); await shot('3-intro');
await page.waitForTimeout(5000); await shot('4-intro-done');
console.log('состояние:', JSON.stringify(await page.evaluate(() => ({ cls: document.documentElement.className, intro: window.__km?.stage ? { reveal: window.__km.stage.I.reveal, rise: window.__km.stage.I.rise, lid: window.__km.stage.I.lid } : null, ready: !!window.__km }))));

// мышь: навести, потянуть, кликнуть
await page.mouse.move(800, 600); await page.waitForTimeout(1500); await shot('5-hover');
await page.mouse.move(800, 600); await page.mouse.down(); await page.mouse.move(600, 600, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(1800); await shot('6-dragged');
await page.mouse.click(820, 560); await page.waitForTimeout(2200); await shot('7-lid-toggled');
await page.mouse.click(820, 560); await page.waitForTimeout(2200); await shot('8-lid-reopened');

// услуги
await page.evaluate(() => document.getElementById('console').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(3500);
await page.click('#tab-3'); await page.waitForTimeout(1800); await shot('9-services-tab4');
console.log('tab4 selected:', await page.getAttribute('#tab-3', 'aria-selected'));

// часы
await page.evaluate(() => document.getElementById('hlZone').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(3000);
await page.hover('#hlZone'); await page.waitForTimeout(2600); await shot('10-clock');

// клавиатура: фокус
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(1500);
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(500); await shot('11-focus');

console.log('консоль:', logs.length ? '\n  ' + [...new Set(logs)].join('\n  ') : 'чисто');
await browser.close();
