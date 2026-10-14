import { $$ } from './dom';
import { splitHeading } from './split';

/** Появление блоков при прокрутке. Только CSS-переходы (transform/opacity), без работы JS в кадре. */
export function initReveal() {
  $$<HTMLElement>('[data-split]').forEach(splitHeading);
  const io = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        if (!el.classList.contains('h2')) el.style.setProperty('--d', `${i++ * 90}ms`);
        el.classList.add('is-in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -9% 0px', threshold: 0.1 },
  );
  $$('[data-reveal], [data-split]').forEach((el) => io.observe(el));
}
