import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, clamp } from '../ui/dom';
import { splitWords } from '../ui/split';
import { env } from '../core/env';

/** Цитата зажигается слово за словом по мере прокрутки. */
function initQuote() {
  const p = $('#quote p');
  if (!p) return;
  const words = splitWords(p);
  if (env.reduced) return;
  const n = words.length;
  let last = -1;
  ScrollTrigger.create({
    trigger: '#quote',
    start: 'top 82%',
    end: 'bottom 52%',
    scrub: true,
    onUpdate: (self) => {
      const f = self.progress * n;
      const lit = Math.floor(f);
      if (lit === last && lit >= n) return;
      last = lit;
      for (let i = 0; i < n; i++) {
        const a = clamp(f - i, 0, 1);
        words[i].style.opacity = String(0.16 + a * 0.84);
        words[i].style.color = i === lit && a > 0 && a < 1 ? 'var(--lime)' : '';
      }
    },
  });
}

/** Стрелка от заметки к видео рисуется, когда блок виден. */
function initNote() {
  const shaft = $('#noteArrow .shaft');
  const head = $('#noteArrow .head');
  if (!shaft || !head || env.reduced) return;
  ScrollTrigger.create({
    trigger: '#note',
    start: 'top 85%',
    once: true,
    onEnter: () => {
      gsap.to(shaft, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut' });
      gsap.to(head, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out', delay: 1 });
    },
  });
}

/** Цифры считаются при появлении. */
function initFacts() {
  $$<HTMLElement>('.num').forEach((el) => {
    const target = Number(el.dataset.count || el.textContent);
    if (!target || env.reduced) return;
    el.textContent = '0';
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () =>
        gsap.to(o, {
          v: target,
          duration: 2,
          ease: 'power3.out',
          onUpdate: () => (el.textContent = String(Math.round(o.v))),
        }),
    });
  });
}

/**
 * Часы вылетают к фразе «вам не придётся ждать». Идут по московскому времени.
 * Мышь: наведение; телефон и клавиатура: нажатие или фокус. Через 3 секунды улетают.
 */
function initClock() {
  const zone = $('#hlZone');
  const clock = $('#clock');
  const section = $('#about');
  if (!zone || !clock || !section) return;
  const hh = $('.h', clock)!;
  const mm = $('.m', clock)!;
  const ss = $('.s', clock)!;
  let shown = false;
  let hideT = 0;
  let raf = 0;

  const tick = () => {
    let h = 0;
    let m = 0;
    let s = 0;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Europe/Moscow' }).formatToParts(new Date());
      const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
      h = get('hour') % 12;
      m = get('minute');
      s = get('second') + (Date.now() % 1000) / 1000;
    } catch {
      const d = new Date();
      h = d.getHours() % 12;
      m = d.getMinutes();
      s = d.getSeconds() + d.getMilliseconds() / 1000;
    }
    hh.style.transform = `rotate(${((h + m / 60) * 30).toFixed(2)}deg)`;
    mm.style.transform = `rotate(${((m + s / 60) * 6).toFixed(2)}deg)`;
    ss.style.transform = `rotate(${(s * 6).toFixed(2)}deg)`;
    raf = requestAnimationFrame(tick);
  };

  const place = () => {
    const z = zone.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    const size = clock.offsetWidth;
    const narrow = window.innerWidth <= 900;
    // над фразой, по центру её первой строки; на телефоне — над правым краем
    const x = narrow ? Math.min(window.innerWidth - size - 16, z.left + z.width * 0.55) - s.left : z.left + Math.min(z.width, 620) * 0.5 - size / 2 - s.left;
    const y = z.top - s.top - size * 0.92;
    return { x, y };
  };

  const show = () => {
    clearTimeout(hideT);
    if (shown) return scheduleHide();
    shown = true;
    const { x, y } = place();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    if (env.reduced) {
      gsap.set(clock, { x, y, scale: 1, opacity: 1, rotate: 0 });
    } else {
      gsap.fromTo(
        clock,
        { x: x - 220, y: y + 90, scale: 0.2, opacity: 0, rotate: -50 },
        { x, y, scale: 1, opacity: 1, rotate: 0, duration: 1.1, ease: 'back.out(1.7)', overwrite: true },
      );
    }
    scheduleHide(true);
  };
  const scheduleHide = (initial = false) => {
    clearTimeout(hideT);
    if (initial && zone.matches(':hover')) return;
    hideT = window.setTimeout(hide, 3000);
  };
  const hide = () => {
    if (!shown) return;
    shown = false;
    gsap.to(clock, {
      x: '+=140',
      y: '-=60',
      scale: 0.2,
      opacity: 0,
      rotate: 40,
      duration: 0.7,
      ease: 'power3.in',
      overwrite: true,
      onComplete: () => cancelAnimationFrame(raf),
    });
  };

  zone.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show());
  zone.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && scheduleHide());
  zone.addEventListener('click', show);
  zone.addEventListener('focus', show);
  zone.addEventListener('blur', () => scheduleHide());
}

export function initAbout() {
  initQuote();
  initNote();
  initFacts();
  initClock();
}
