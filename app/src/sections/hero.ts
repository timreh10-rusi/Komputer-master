import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$ } from '../ui/dom';
import { S } from '../core/state';

/** Подгонка гигантского заголовка по ширине контейнера. Возвращает размер в пикселях. */
export function fitGiant(): number {
  const giant = $('#giant');
  const frame = $('.hdr__in');
  if (!giant || !frame) return 0;
  giant.style.fontSize = '100px';
  const lines = $$<HTMLElement>('.ln', giant);
  const widest = Math.max(...lines.map((l) => l.getBoundingClientRect().width));
  const target = frame.getBoundingClientRect().width;
  if (!widest || !target) return 0;
  const pinH = giant.parentElement!.clientHeight;
  const landscape = window.innerHeight <= 560 && window.innerWidth > window.innerHeight;
  const size = Math.min(360, Math.max(36, Math.min((100 * target) / widest, pinH * (landscape ? 0.2 : 0.3))));
  giant.style.fontSize = size.toFixed(2) + 'px';
  // Блок не должен уходить под шапку на невысоких окнах
  const pin = giant.parentElement!;
  const hdr = $('.hdr__in')!.getBoundingClientRect();
  const frac = landscape ? 0.28 : window.innerWidth <= 820 ? (window.innerHeight <= 720 ? 0.19 : 0.21) : 0.31;
  const top = Math.max(pin.clientHeight * frac, hdr.bottom + 56 + giant.offsetHeight / 2);
  giant.style.top = top.toFixed(1) + 'px';
  return size;
}

/** Прогресс «влёта в экран» берём из прокрутки героя, затухание интерфейса — тоже. */
export function initHeroScroll() {
  const hero = $('.hero');
  const ui = $('.hero__pin');
  if (!hero || !ui) return;
  const apply = (p: number) => {
    S.heroTarget = p;
    ui.style.setProperty('--hp', p.toFixed(4));
    ui.classList.toggle('is-diving', p > 0.3);
  };
  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => apply(self.progress),
    onRefresh: (self) => apply(self.progress),
  });
}

/** Появление текста и кнопок главного экрана после загрузчика. */
export function heroIn() {
  $$<HTMLElement>('[data-hero-in]').forEach((el, i) => {
    el.style.setProperty('--d', (i * 0.22).toFixed(2) + 's');
    el.classList.add('is-in');
  });
}
