import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, clamp } from './dom';
import { S } from '../core/state';
import { onTick } from '../core/loop';

/**
 * «Здоровье системы»: растёт по мере прокрутки и достигает 100 % у раздела «Контакты».
 * Это главный сюжетный элемент: сайт «чинится» по ходу чтения.
 */
export function initHud(setNav: (id: string) => void) {
  const fill = $('#hudFill')!;
  const val = $('#hudVal')!;
  const secEl = $('#hudSec')!;
  const hud = $('#hud')!;
  const ok = $('#ctaOk');
  const dock = $('#dock');
  const sections = $$<HTMLElement>('[data-sec]');
  const contact = $('#contact')!;
  const isMobile = () => window.innerWidth <= 820;

  let maxY = 1;
  const measure = () => {
    maxY = Math.max(1, contact.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4);
  };
  measure();
  ScrollTrigger.addEventListener('refresh', measure);

  sections.forEach((s, i) => {
    ScrollTrigger.create({
      trigger: s,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        S.section = s.dataset.sec ?? 'top';
        secEl.textContent = `${String(i).padStart(2, '0')} / ${s.dataset.label ?? ''}`;
        setNav(S.section);
      },
    });
  });

  let lastPct = -1;
  let lastOk = false;
  let dockOn = false;
  onTick((_t, dt) => {
    const target = 0.12 + 0.88 * clamp(S.y / maxY);
    S.health += (target - S.health) * Math.min(1, dt * 0.012);
    const pct = Math.round(S.health * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      val.textContent = pct + '%';
      const t = `scale${isMobile() ? 'X' : 'Y'}(${S.health.toFixed(3)})`;
      fill.style.transform = t;
    }
    const isOk = pct >= 99 && S.y > maxY * 0.9;
    if (isOk !== lastOk) {
      lastOk = isOk;
      hud.classList.toggle('is-ok', isOk);
      ok?.classList.toggle('is-on', isOk);
    }
    // мобильная панель связи: после главного экрана, но не поверх большого блока контактов
    if (dock) {
      const want = S.y > S.vh * 0.85 && !isOk;
      if (want !== dockOn) {
        dockOn = want;
        dock.classList.toggle('is-on', want);
      }
    }
  });
}
