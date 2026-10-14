import { S } from './state';

/** Положение мыши для сцены: пиксели и диапазон -1..1. Касания сюда не попадают: их обрабатывает сам ноутбук. */
export function initPointer() {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      S.px = e.clientX;
      S.py = e.clientY;
      S.nx = (e.clientX / window.innerWidth) * 2 - 1;
      S.ny = (e.clientY / window.innerHeight) * 2 - 1;
      S.pointerActive = true;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (S.pointerActive = false));
}
