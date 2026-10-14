import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '..');

/** Видео и постер живут в корне репозитория (как у прежнего сайта) — в dev отдаём их оттуда, с поддержкой Range. */
function repoRootAssets(): Plugin {
  const files: Record<string, string> = { '/sergey.mp4': 'video/mp4', '/poster.webp': 'image/webp' };
  return {
    name: 'repo-root-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const mime = files[url];
        if (!mime) return next();
        const file = path.join(REPO, url);
        if (!fs.existsSync(file)) return next();
        const size = fs.statSync(file).size;
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        res.setHeader('Content-Type', mime);
        res.setHeader('Accept-Ranges', 'bytes');
        if (range) {
          const start = range[1] ? parseInt(range[1], 10) : 0;
          const end = range[2] ? parseInt(range[2], 10) : size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader('Content-Length', size);
          fs.createReadStream(file).pipe(res);
        }
      });
    },
  };
}

/** Подставляет адрес сайта в canonical / og:*, прелоадит критичные шрифты. */
function htmlTweaks(siteUrl: string): Plugin {
  return {
    name: 'html-tweaks',
    generateBundle() {
      const site = siteUrl.replace(/\/$/, '');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html.replaceAll('%SITE_URL%', siteUrl.replace(/\/$/, ''));
        const bundle = ctx.bundle;
        if (bundle) {
          const want = [/onest-cyrillic/, /onest-latin/, /oswald-cyrillic/, /oswald-latin/];
          const tags = Object.keys(bundle)
            .filter((n) => want.some((re) => re.test(n)))
            .map((n) => `<link rel="preload" href="./${n}" as="font" type="font/woff2" crossorigin>`)
            .join('\n  ');
          out = out.replace('</head>', `  ${tags}\n</head>`);
        }
        return out;
      },
    },
  };
}

export default defineConfig({
  root: ROOT,
  base: './',
  publicDir: 'public',
  plugins: [repoRootAssets(), htmlTweaks(process.env.SITE_URL || 'https://komputernyi-master.ru')],
  build: {
    outDir: REPO,
    emptyOutDir: false, // в корне лежат видео, постер и README — не трогаем
    assetsDir: 'assets',
    target: 'es2022',
    cssCodeSplit: false,
    sourcemap: false,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 800,
    assetsInlineLimit: 2048,
  },
  server: { port: 5173, strictPort: false },
});
