import './styles/main.css';
import { $ } from './ui/dom';
import { env } from './core/env';
import { S } from './core/state';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initQuality, Q, forceTier } from './core/quality';
import { initScroll, refreshSoon } from './core/scroll';
import { initPointer } from './core/pointer';
import { probeGL } from './core/gpu';
import { initPerfPanel } from './core/perf';
import { fitGiant, initHeroScroll, heroIn } from './sections/hero';
import { initReveal } from './ui/reveal';
import { initMagnetic } from './ui/magnetic';
import { initCursor } from './ui/cursor';
import { initHeader } from './ui/header';
import { initHud } from './ui/hud';
import { initMisc } from './ui/misc';
import { runLoader, loaderOpts } from './ui/loader';
import { initServices } from './sections/services';
import { initVideo } from './sections/video';
import { initAbout } from './sections/about';
import { initReviews } from './sections/reviews';
import { initContact } from './sections/contact';
import type { Stage } from './gl/stage';

async function boot() {
  const root = document.documentElement;
  root.classList.add('km-ready'); // скрипт жив: отменяем страховку km-fail
  root.classList.toggle('is-touch', env.coarse);
  root.classList.toggle('poster', env.poster);
  root.classList.toggle('og', env.og);

  initQuality();
  initScroll();
  initPointer();
  initMisc();
  initReveal();
  initMagnetic();
  initCursor();
  const header = initHeader();
  // ScrollTrigger считает позиции по порядку создания: создаём сверху вниз по странице
  initHeroScroll();
  initServices();
  initVideo();
  initAbout();
  initReviews();
  initContact();
  initHud(header.setActive);

  // Шрифты → подгонка заголовка → WebGL (Three.js грузится отдельным файлом, не блокируя первый показ)
  const ref = { stage: null as Stage | null };
  const fonts = document.fonts.load('700 100px Oswald', 'КОМПЬЮТЕРНЫЙ').catch(() => undefined);
  const glReady = (async () => {
    await fonts;
    fitGiant();
    if (env.nogl || Q.tier === 0) {
      loaderOpts.fast = true;
      return;
    }
    // слабая или программная графика: оставляем лёгкую версию и не качаем 3D вовсе
    if (!env.forceGL && (await probeGL()) !== 'ok') {
      forceTier(0);
      loaderOpts.fast = true;
      return;
    }
    try {
      const { Stage } = await import('./gl/stage');
      const stage = await Stage.create($<HTMLCanvasElement>('#gl')!, {
        pin: $('.hero__pin')!,
        stage: $('#stage')!,
        giant: $('#giant')!,
        hero: $('.hero')!,
      });
      if (!stage) forceTier(0);
      if (stage) {
        stage.beforeHeadline = fitGiant;
        const slot = $('#globeSlot');
        if (slot) stage.setGlobeSlot(slot);
        stage.collectMasks();
        ScrollTrigger.addEventListener('refresh', () => stage.collectMasks());
        ref.stage = stage;
        root.classList.add('gl');
      }
    } catch (err) {
      console.warn('WebGL недоступен, включена лёгкая версия', err);
    }
  })();

  const ready = Promise.all([glReady, document.fonts.ready]);
  const [shown] = await Promise.all([runLoader(ready), ready]);
  heroIn();
  const gl = ref.stage;
  if (gl) {
    if (env.reduced || env.freeze != null) gl.settle(env.freeze ?? undefined);
    else gl.playIntro(false, shown);
  }
  if (env.perf) initPerfPanel(() => (ref.stage ? ref.stage.info() : null));

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      fitGiant();
      refreshSoon(0);
    }, 160);
  });
  window.addEventListener('load', () => refreshSoon(0), { once: true });

  // доступ из консоли и автотестов
  (window as unknown as { __km: unknown }).__km = { S, Q, get stage() { return ref.stage; } };
}

// Любая ошибка при запуске: показываем сайт в базовом виде, а не пустую страницу
boot().catch((err) => {
  console.error('Сбой запуска, включён базовый вид', err);
  document.documentElement.classList.add('km-fail');
});
