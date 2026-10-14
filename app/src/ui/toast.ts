import { $ } from './dom';

let timer = 0;
export function toast(message: string) {
  const el = $('#toast');
  if (!el) return;
  const span = el.querySelector('span');
  if (span) span.textContent = message;
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('is-on'), 2800);
}
