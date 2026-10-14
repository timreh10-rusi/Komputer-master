import gsap from 'gsap';

/** Единый цикл кадров страницы: на нём сидят Lenis, ScrollTrigger-обновления и рендер WebGL. */
export type Tick = (timeSec: number, dtMs: number) => void;

const ticks: Tick[] = [];
let started = false;

export function onTick(fn: Tick, first = false): () => void {
  if (first) ticks.unshift(fn);
  else ticks.push(fn);
  start();
  return () => {
    const i = ticks.indexOf(fn);
    if (i >= 0) ticks.splice(i, 1);
  };
}

function start() {
  if (started) return;
  started = true;
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add((time, delta) => {
    for (let i = 0; i < ticks.length; i++) ticks[i](time, delta);
  });
}
