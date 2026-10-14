import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, clamp } from '../ui/dom';
import { env } from '../core/env';
import { scrollTo } from '../core/scroll';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Отзывы. С мышью на широком экране: горизонтальная лента, закреплённая на время прокрутки.
 * На телефоне и планшете: родная прокрутка пальцем со «snap». Кнопки и клавиатура работают в обоих режимах.
 */
export function initReviews() {
  const sec = $('#reviews');
  const vp = $('#revViewport');
  const track = $('#revTrack');
  const bar = $('#revBar');
  const count = $('#revCount');
  if (!sec || !vp || !track || !bar || !count) return;
  const cards = $$('.card', track);
  const N = cards.length;
  const btns = $$<HTMLButtonElement>('.rev__btn');

  const ui = (p: number) => {
    bar.style.transform = `scaleX(${(0.08 + 0.92 * p).toFixed(3)})`;
    count.textContent = `${pad2(Math.round(p * (N - 1)) + 1)} / ${pad2(N)}`;
  };
  ui(0);

  const mm = gsap.matchMedia();

  mm.add('(min-width: 901px) and (min-height: 700px) and (hover: hover) and (pointer: fine)', () => {
    if (env.reduced) return;
    sec.classList.add('is-pinned');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 0);
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: () => '+=' + Math.round(dist() * 0.85),
        pin: true,
        scrub: 0.7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => ui(self.progress),
      },
    });
    const st = tween.scrollTrigger!;
    const go = (dir: number) => {
      const idx = clamp(Math.round(st.progress * (N - 1)) + dir, 0, N - 1);
      scrollTo(st.start + (idx / (N - 1)) * (st.end - st.start));
    };
    const onClick = (e: Event) => go(Number((e.currentTarget as HTMLElement).dataset.dir));
    btns.forEach((b) => b.addEventListener('click', onClick));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
    };
    vp.addEventListener('keydown', onKey);
    return () => {
      sec.classList.remove('is-pinned');
      btns.forEach((b) => b.removeEventListener('click', onClick));
      vp.removeEventListener('keydown', onKey);
      gsap.set(track, { clearProps: 'transform' });
    };
  });

  mm.add('(max-width: 900px), (max-height: 699px), (hover: none), (pointer: coarse)', () => {
    const onScroll = () => ui(clamp(vp.scrollLeft / Math.max(1, vp.scrollWidth - vp.clientWidth)));
    const step = () => (cards[0]?.offsetWidth ?? 300) + 16;
    const onClick = (e: Event) => vp.scrollBy({ left: Number((e.currentTarget as HTMLElement).dataset.dir) * step(), behavior: env.reduced ? 'auto' : 'smooth' });
    vp.addEventListener('scroll', onScroll, { passive: true });
    btns.forEach((b) => b.addEventListener('click', onClick));
    onScroll();
    return () => {
      vp.removeEventListener('scroll', onScroll);
      btns.forEach((b) => b.removeEventListener('click', onClick));
    };
  });

  ScrollTrigger.addEventListener('refresh', () => ui(sec.classList.contains('is-pinned') ? 0 : clamp(vp.scrollLeft / Math.max(1, vp.scrollWidth - vp.clientWidth))));
}
