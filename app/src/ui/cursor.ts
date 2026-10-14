import gsap from 'gsap';
import { $ } from './dom';
import { env } from '../core/env';

/** Кольцо-курсор с контекстными подписями. Родной курсор не прячем: так надёжнее и привычнее. */
export function initCursor() {
  const root = $('#cursor');
  if (!root || !env.fine || env.reduced) return;
  const label = $('.cursor__label', root)!;
  document.documentElement.classList.add('has-cursor');
  const x = gsap.quickTo(root, 'x', { duration: 0.32, ease: 'power3.out' });
  const y = gsap.quickTo(root, 'y', { duration: 0.32, ease: 'power3.out' });
  root.classList.add('is-hidden');

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x(e.clientX);
      y(e.clientY);
      root.classList.remove('is-hidden');
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => root.classList.add('is-hidden'));
  document.addEventListener('pointerdown', () => root.classList.add('is-down'));
  document.addEventListener('pointerup', () => root.classList.remove('is-down'));

  let cur: Element | null = null;
  document.addEventListener(
    'pointerover',
    (e) => {
      const t = (e.target as Element).closest('a,button,[data-cursor],[role="tab"],input,textarea,summary');
      if (t === cur) return;
      cur = t;
      const text = t?.getAttribute('data-cursor') ?? '';
      root.classList.toggle('is-label', !!text);
      root.classList.toggle('is-link', !!t && !text);
      label.textContent = text;
    },
    { passive: true },
  );
}
