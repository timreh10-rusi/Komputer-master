import { env } from './env';

/**
 * Регулятор качества. Следит за временем кадра и подстраивает разрешение и эффекты,
 * чтобы держать плавность на любом устройстве.
 *   3 — максимум (мощный компьютер)    2 — высокое (обычный компьютер, хороший телефон)
 *   1 — облегчённое (слабое устройство) 0 — без WebGL (статичная версия на CSS)
 */
export type Tier = 0 | 1 | 2 | 3;

export interface Quality {
  tier: Tier;
  maxTier: Tier;
  /** верхняя граница devicePixelRatio для холста */
  maxDpr: number;
  /** отражения от окружения у ноутбука */
  ibl: boolean;
  /** сглаживание краёв средствами WebGL */
  msaa: boolean;
  /** лёгкий дождь: меньше слоёв и выборок */
  rainLite: boolean;
  /** ограничение рендера фоном 30 кадров в секунду, когда сцена почти статична */
  cap30: boolean;
}

export const Q: Quality = { tier: 2, maxTier: 2, maxDpr: 1.5, ibl: true, msaa: false, rainLite: false, cap30: false };

type Listener = (q: Quality, prev: Tier) => void;
const listeners: Listener[] = [];
export const onQuality = (fn: Listener) => listeners.push(fn);

function apply(tier: Tier) {
  const prev = Q.tier;
  Q.tier = tier;
  switch (tier) {
    case 3: Object.assign(Q, { maxDpr: 2, ibl: true, msaa: true, rainLite: false, cap30: false }); break;
    case 2: Object.assign(Q, { maxDpr: 1.5, ibl: true, msaa: false, rainLite: false, cap30: false }); break;
    case 1: Object.assign(Q, { maxDpr: 1, ibl: false, msaa: false, rainLite: true, cap30: true }); break;
    default: Object.assign(Q, { maxDpr: 1, ibl: false, msaa: false, rainLite: true, cap30: true });
  }
  if (prev !== tier) listeners.forEach((fn) => fn(Q, prev));
}

/** Стартовый уровень по характеристикам устройства. */
export function initQuality(): Tier {
  let t: Tier;
  if (env.forceTier != null && env.forceTier >= 0 && env.forceTier <= 3) t = env.forceTier as Tier;
  else if (env.nogl) t = 0;
  else if (env.saveData || (env.coarse && (env.cores <= 4 || env.memory <= 3))) t = 1;
  else if (env.coarse) t = 2;
  else t = env.cores >= 8 && env.memory >= 8 ? 3 : 2;
  Q.maxTier = t;
  apply(t);
  return t;
}

let warm = 0;
let slow = 0;
let fast = 0;
let lastChange = 0;

/** Вызывается на каждом отрисованном кадре с реальным интервалом между кадрами. */
export function sampleFrame(dtMs: number, nowMs: number) {
  if (env.lockTier || Q.tier === 0) return;
  if (dtMs > 250) return; // скачок из-за вкладки или загрузки, не считаем
  if (++warm < 90) return; // прогрев: компиляция шейдеров, загрузка текстур
  if (dtMs > 26) {
    slow++;
    fast = 0;
  } else if (dtMs < 18.5) {
    fast++;
    slow = Math.max(0, slow - 1);
  } else {
    fast = Math.max(0, fast - 2);
  }
  if (slow >= 30) {
    slow = 0;
    fast = 0;
    lastChange = nowMs;
    // на самом нижнем уровне ещё и «убираем» WebGL совсем — остаётся лёгкая версия
    if (Q.tier > 1) apply((Q.tier - 1) as Tier);
    else if (slow === 0 && warm > 600) apply(0);
  } else if (fast >= 480 && Q.tier < Q.maxTier && nowMs - lastChange > 20000) {
    fast = 0;
    lastChange = nowMs;
    apply((Q.tier + 1) as Tier);
  }
}

export function forceTier(t: Tier) {
  apply(t);
}
