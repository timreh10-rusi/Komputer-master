// Замеры живой страницы: кадры, долгие задачи, память JS и ресурсы GL при многократной прокрутке.
// В песочнице без GPU WebGL программный, поэтому кадры здесь медленнее, чем на реальном устройстве:
// главное, что можно проверить честно, — время работы JS в кадре, долгие задачи и отсутствие роста памяти.
//   node scripts/perf.mjs [url] [профиль: desktop|mobile] [циклов]
import { chromium } from 'playwright-core';
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const PROFILE = process.argv[3] || 'desktop';
const CYCLES = Number(process.argv[4] || 5);
const P = { desktop: { vp: { width: 1440, height: 900 }, m: false, tier: 3 }, mobile: { vp: { width: 390, height: 844 }, m: true, tier: 2 } }[PROFILE];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const ctx = await browser.newContext({ viewport: P.vp, isMobile: P.m, hasTouch: P.m, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

await page.addInitScript(() => {
  window.__perf = { long: 0, longMs: 0, frames: [] };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.long++; window.__perf.longMs += e.duration; } }).observe({ entryTypes: ['longtask'] });
  } catch {}
  let last = 0;
  const loop = (t) => { if (last) window.__perf.frames.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
await page.goto(URL + `?tier=${P.tier}&lock&nointro&perf`, { waitUntil: 'load' });
await page.waitForTimeout(9000);

const gcAndMeasure = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  const m = await cdp.send('Performance.getMetrics');
  const get = (n) => m.metrics.find((x) => x.name === n)?.value ?? 0;
  const gl = await page.evaluate(() => { const s = window.__km?.stage; return s ? s.info() : null; });
  return { heapMB: +(get('JSHeapUsedSize') / 1048576).toFixed(2), nodes: get('Nodes'), listeners: get('JSEventListeners'), gl };
};

const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const results = [];
const base = await gcAndMeasure();
console.log('старт:', JSON.stringify(base));
for (let c = 0; c < CYCLES; c++) {
  // плавная прокрутка вниз и вверх колесом/жестом
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((total * i) / steps));
    await page.waitForTimeout(90);
  }
  for (let i = steps - 1; i >= 0; i--) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((total * i) / steps));
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(600);
  const m = await gcAndMeasure();
  results.push(m);
  console.log(`цикл ${c + 1}:`, JSON.stringify(m));
}
const frames = await page.evaluate(() => window.__perf);
const f = frames.frames.slice(30).sort((a, b) => a - b);
const avg = f.reduce((a, b) => a + b, 0) / f.length;
console.log(`\nкадров ${f.length}, средний ${avg.toFixed(1)} мс, p50 ${f[(f.length * 0.5) | 0].toFixed(1)}, p95 ${f[(f.length * 0.95) | 0].toFixed(1)}, макс ${f[f.length - 1].toFixed(0)} мс`);
console.log(`долгих задач (>50 мс): ${frames.long}, суммарно ${frames.longMs.toFixed(0)} мс`);
const first = results[0];
const last = results[results.length - 1];
const dHeap = last.heapMB - first.heapMB;
console.log(`\nрост памяти JS за ${CYCLES - 1} циклов: ${dHeap.toFixed(2)} МБ; узлов DOM: ${first.nodes} → ${last.nodes}; слушателей: ${first.listeners} → ${last.listeners}`);
if (first.gl && last.gl) console.log(`GL: геометрий ${first.gl.geometries} → ${last.gl.geometries}, текстур ${first.gl.textures} → ${last.gl.textures}, программ ${first.gl.programs} → ${last.gl.programs}`);
const panel = await page.evaluate(() => [...document.querySelectorAll('pre')].map((e) => e.textContent).join(' | '));
console.log('панель ?perf:', panel.replace(/\n/g, ' · '));
await browser.close();
