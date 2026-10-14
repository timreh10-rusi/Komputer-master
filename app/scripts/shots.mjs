// Скриншоты сайта на разных экранах (Playwright + встроенный в песочницу Chromium).
// Примеры:
//   node scripts/shots.mjs --url http://127.0.0.1:5173/ --out /tmp/shots --profiles desktop,mobile
//   node scripts/shots.mjs --url ... --profiles desktop --scroll 0,1200,2400 --nogl --static
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const URL = arg('url', 'http://127.0.0.1:5173/');
const OUT = arg('out', './shots');
const PROFILES = String(arg('profiles', 'desktop,mobile')).split(',');
const SCROLLS = arg('scroll', null) ? String(arg('scroll')).split(',').map(Number) : null; // явные Y
const STEP = Number(arg('step', 0.9)); // шаг прокрутки в высотах экрана
const WAIT = Number(arg('wait', 1500));
const FIRST = Number(arg('first', 5000)); // ожидание первой отрисовки
const STATIC = !!arg('static', false); // km-fail: показать всё без анимаций (базовая вёрстка)
const NOGL = !!arg('nogl', false);
const FULL = !!arg('full', false);
const REDUCED = !!arg('reduced', false);

const ALL = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  wide: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  land: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

for (const name of PROFILES) {
  const p = ALL[name];
  if (!p) { console.log('нет профиля', name); continue; }
  const ctx = await browser.newContext({ ...p, locale: 'ru-RU', timezoneId: 'Europe/Moscow', reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const logs = [], fails = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) fails.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(({ s, n }) => {
    if (n) window.__KM_NOGL = true;
    if (s) document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('km-fail'));
    try { sessionStorage.setItem('km-intro', '1'); } catch {}
  }, { s: STATIC, n: NOGL });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(FIRST);

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = p.viewport.height;
  const ys = SCROLLS || Array.from({ length: Math.ceil(total / (vh * STEP)) }, (_, i) => Math.round(i * vh * STEP));
  let i = 0;
  for (const y of ys) {
    if (y > total) break;
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(WAIT);
    const file = `${OUT}/${name}-${String(i).padStart(2, '0')}-y${y}.png`;
    await page.screenshot({ path: file, fullPage: FULL });
    i++;
  }
  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log(`${name}: ${i} кадров, высота ${metrics.scrollHeight}, горизонтальный перелив ${metrics.overflowX}px`);
  if (logs.length) console.log('  консоль:\n   ' + [...new Set(logs)].join('\n   '));
  if (fails.length) console.log('  сеть:\n   ' + [...new Set(fails)].join('\n   '));
  await ctx.close();
}
await browser.close();
