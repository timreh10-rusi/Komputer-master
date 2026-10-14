import { $, $$ } from './dom';
import { S } from '../core/state';
import { onTick } from '../core/loop';
import { lockScroll } from '../core/scroll';

/** Шапка: прячется при прокрутке вниз, возвращается при прокрутке вверх. Мобильное меню. */
export function initHeader() {
  const hdr = $('#hdr')!;
  const burger = $<HTMLButtonElement>('#burger')!;
  const menu = $('#menu')!;
  menu.hidden = false;

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    menu.classList.toggle('is-open', v);
    burger.setAttribute('aria-expanded', String(v));
    burger.setAttribute('aria-label', v ? 'Закрыть меню' : 'Открыть меню');
    hdr.classList.remove('is-hidden');
    lockScroll(v);
  };
  burger.addEventListener('click', () => setOpen(!open));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      burger.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (open && window.innerWidth > 1100) setOpen(false);
  });

  let lastY = S.y;
  let acc = 0;
  let hidden = false;
  onTick(() => {
    const y = S.y;
    const d = y - lastY;
    lastY = y;
    if (open) return;
    acc = Math.sign(d) === Math.sign(acc) ? acc + d : d;
    let next = hidden;
    if (y < 140) next = false;
    else if (acc > 26) next = true;
    else if (acc < -14) next = false;
    if (next !== hidden) {
      hidden = next;
      hdr.classList.toggle('is-hidden', hidden);
    }
  });

  // выделение пункта меню
  const links = $$<HTMLAnchorElement>('.nav a[data-nav]');
  return {
    setActive(id: string) {
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
    },
  };
}
