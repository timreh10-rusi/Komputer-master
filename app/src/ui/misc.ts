import { $ } from './dom';
import { env } from '../core/env';
import { toast } from './toast';

/** Мелочи: год в подвале, статус «на связи» по московскому времени, копирование номера на компьютере. */
export function initMisc() {
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  try {
    const h = +new Intl.DateTimeFormat('ru-RU', { hour: 'numeric', hour12: false, timeZone: 'Europe/Moscow' }).format(new Date());
    const open = h >= 9 && h < 23;
    const st = $('#status');
    if (st) {
      st.classList.toggle('off', !open);
      const span = st.querySelector('span');
      if (span) span.textContent = open ? 'Сейчас на связи, до 23:00' : 'Сейчас не на связи, отвечу с 9:00';
    }
  } catch {
    /* Intl недоступен: остаётся статичный текст */
  }

  // На компьютере номер копируется, на телефоне ссылка звонит сразу
  const NUM = '+7 902 408-90-22';
  document.addEventListener('click', async (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-copy-phone]');
    if (!a || !env.fine) return;
    e.preventDefault();
    let ok = false;
    try {
      await navigator.clipboard.writeText(NUM);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = NUM;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    toast(ok ? `Номер скопирован: ${NUM}` : `Наш номер: ${NUM}`);
  });
}
