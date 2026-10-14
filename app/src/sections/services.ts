import gsap from 'gsap';
import { $, $$ } from '../ui/dom';
import { env } from '../core/env';

/**
 * Консоль услуг: слева список, справа панель. Выбор — наведением, кликом или стрелками.
 * Пока человек ничего не трогал, панели сами листаются (останавливается при первом действии).
 * На телефоне (≤900 px) вместо консоли идут обычные карточки: роли вкладок снимаются.
 */
export function initServices() {
  const root = $('#console');
  const list = $('#consoleList');
  const wrap = $('#consolePanels');
  if (!root || !list || !wrap) return;
  const tabs = $$<HTMLButtonElement>('.tab', list);
  const panels = $$<HTMLElement>('.panel', wrap);
  const mqDesktop = matchMedia('(min-width: 901px)');
  let cur = -1;
  let auto = !env.reduced;
  let timer = 0;
  let inView = false;
  let hover = false;

  const drawIcon = (panel: HTMLElement) => {
    const parts = $$<SVGElement>('.panel__ic *', panel);
    if (!parts.length || env.reduced) return;
    gsap.fromTo(parts, { strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', stagger: 0.12, overwrite: true });
  };

  const select = (i: number) => {
    if (i === cur || !mqDesktop.matches) return;
    cur = i;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p, k) => p.classList.toggle('is-active', k === i));
    wrap.classList.remove('is-scan');
    void wrap.offsetWidth;
    wrap.classList.add('is-scan');
    drawIcon(panels[i]);
  };

  const stopAuto = () => {
    auto = false;
    clearInterval(timer);
  };
  const startAuto = () => {
    clearInterval(timer);
    if (!auto || !mqDesktop.matches) return;
    timer = window.setInterval(() => {
      if (inView && !hover && !document.hidden) select((cur + 1) % tabs.length);
    }, 4600);
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      stopAuto();
      select(i);
    });
    t.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') {
        stopAuto();
        select(i);
      }
    });
    t.addEventListener('keydown', (e) => {
      let n = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      stopAuto();
      select(n);
      tabs[n].focus();
    });
  });
  root.addEventListener('pointerenter', () => (hover = true));
  root.addEventListener('pointerleave', () => (hover = false));
  root.addEventListener('focusin', stopAuto);

  new IntersectionObserver(
    (en) => {
      inView = en[0].isIntersecting;
    },
    { threshold: 0.35 },
  ).observe(root);

  // Роли вкладок только на широкой раскладке: на телефоне это обычные карточки
  const syncRoles = () => {
    const on = mqDesktop.matches;
    list.toggleAttribute('hidden', false);
    if (on) {
      list.setAttribute('role', 'tablist');
      tabs.forEach((t) => t.setAttribute('role', 'tab'));
      panels.forEach((p) => {
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', 'tab-' + p.dataset.i);
      });
      cur = -1;
      select(0);
      startAuto();
    } else {
      list.removeAttribute('role');
      tabs.forEach((t) => t.removeAttribute('role'));
      panels.forEach((p) => {
        p.removeAttribute('role');
        p.removeAttribute('aria-labelledby');
        p.classList.remove('is-active');
      });
      clearInterval(timer);
      // иконки карточек «прорисовываются» при появлении
      panels.forEach((p) => {
        const io = new IntersectionObserver(
          (en) => {
            if (en[0].isIntersecting) {
              drawIcon(p);
              io.disconnect();
            }
          },
          { threshold: 0.4 },
        );
        io.observe(p);
      });
    }
  };
  mqDesktop.addEventListener('change', syncRoles);
  syncRoles();
}
