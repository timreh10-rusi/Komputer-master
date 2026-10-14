import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { env } from './env';
import { S } from './state';
import { onTick } from './loop';

gsap.registerPlugin(ScrollTrigger);
// Адресная строка на телефоне прячется и показывается: без этого ScrollTrigger дёргал бы раскладку.
ScrollTrigger.config({ ignoreMobileResize: true });

export let lenis: Lenis | null = null;

const HDR_OFFSET = 84;

/** Плавный скролл только там, где есть мышь или трекпад. На телефоне работает родной скролл. */
export function initScroll() {
  if (env.fine && !env.reduced) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    onTick((t) => lenis!.raf(t * 1000), true);
    document.documentElement.classList.add('lenis', 'lenis-smooth');
  }

  let last = window.scrollY;
  S.y = last;
  onTick(() => {
    const y = window.scrollY;
    S.vel += (y - last - S.vel) * 0.14;
    last = y;
    S.y = y;
  });

  // Якоря: единый обработчик, чтобы ссылки работали и с Lenis, и без него
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute('href')!.slice(1);
    const target = id ? document.getElementById(id) : document.body;
    if (!target) return;
    e.preventDefault();
    scrollTo(id === 'top' || !id ? 0 : target);
  });
}

export function scrollTo(target: HTMLElement | number, immediate = false) {
  if (lenis) {
    lenis.scrollTo(target as HTMLElement | number, { offset: typeof target === 'number' ? 0 : -HDR_OFFSET + 1, duration: immediate ? 0 : 1.7, immediate, easing: (t) => 1 - Math.pow(1 - t, 4) });
  } else {
    const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY - HDR_OFFSET + 1;
    window.scrollTo({ top, behavior: immediate || env.reduced ? 'auto' : 'smooth' });
  }
}

export function lockScroll(lock: boolean) {
  if (lenis) lock ? lenis.stop() : lenis.start();
  document.documentElement.style.overflow = lock && !lenis ? 'hidden' : '';
}

/** Пересчёт триггеров после изменения размеров. Вызывается с задержкой, чтобы не плодить пересчёты. */
let refreshTimer = 0;
export function refreshSoon(ms = 220) {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    S.vw = window.innerWidth;
    S.vh = window.innerHeight;
    ScrollTrigger.refresh();
  }, ms);
}
