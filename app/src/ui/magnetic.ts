import gsap from 'gsap';
import { $$ } from './dom';
import { env } from '../core/env';

/** Магнитные кнопки: тянутся к курсору и пружинят обратно. Только мышь. */
export function initMagnetic() {
  if (!env.fine || env.reduced) return;
  $$<HTMLElement>('[data-magnetic]').forEach((el) => {
    const qx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const qy = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    let rect: DOMRect | null = null;
    el.addEventListener('pointerenter', () => (rect = el.getBoundingClientRect()));
    el.addEventListener('pointermove', (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      qx(dx * 0.28);
      qy(dy * 0.38);
    });
    el.addEventListener('pointerleave', () => {
      rect = null;
      gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1,.4)', overwrite: true });
      // quickTo держит собственную цель: возвращаем её в ноль
      qx(0);
      qy(0);
    });
  });
}
