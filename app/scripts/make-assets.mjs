// Генерирует картинки сайта из самой сцены: запасной ноутбук (с прозрачностью), превью для соцсетей, иконки.
// Нужен запущенный dev-сервер: npm run dev   →   node scripts/make-assets.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5173/';
const PUB = path.resolve(import.meta.dirname, '..', 'public');
const TMP = path.resolve(import.meta.dirname, '..', '.tmp-assets');
fs.mkdirSync(PUB, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// 1. Ноутбук на прозрачном фоне для устройств без WebGL
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 780 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(BASE + '?poster&tier=3&lock', { waitUntil: 'load' });
  await page.waitForTimeout(12000);
  const box = await page.locator('#stage').boundingBox();
  const png = path.join(TMP, 'laptop.png');
  await page.screenshot({ path: png, omitBackground: true, clip: box });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', path.join(PUB, 'laptop.webp')]);
  console.log('laptop.webp', fs.statSync(path.join(PUB, 'laptop.webp')).size, 'байт');
  await ctx.close();
}

// 2. Превью для соцсетей 1200×630
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + '?og&tier=3&lock', { waitUntil: 'load' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(PUB, 'og.jpg'), type: 'jpeg', quality: 88 });
  console.log('og.jpg', fs.statSync(path.join(PUB, 'og.jpg')).size, 'байт');
  await ctx.close();
}

// 3. Иконки: знак на тёмном фоне
{
  const svg = fs.readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [file, size, pad] of [['apple-touch-icon.png', 180, 0.2], ['icon-192.png', 192, 0.2], ['icon-512.png', 512, 0.2]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;height:100%;background:#03100A;display:grid;place-items:center}svg{width:${100 - pad * 100}%;height:${100 - pad * 100}%;filter:drop-shadow(0 0 ${size / 12}px rgba(61,220,110,.45))}</style>${svg}`);
    await page.screenshot({ path: path.join(PUB, file) });
    console.log(file);
  }
  await ctx.close();
}
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
