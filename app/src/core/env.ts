/** Что умеет устройство и что просит пользователь. Всё читаем один раз при старте. */
const mq = (q: string) => matchMedia(q).matches;
const params = new URLSearchParams(location.search);
const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };

export const env = {
  /** prefers-reduced-motion */
  reduced: mq('(prefers-reduced-motion: reduce)'),
  /** мышь/трекпад: курсор, магниты, плавный скролл */
  fine: mq('(hover: hover) and (pointer: fine)'),
  /** тач-устройство */
  coarse: mq('(hover: none), (pointer: coarse)'),
  memory: nav.deviceMemory ?? 8,
  cores: navigator.hardwareConcurrency ?? 4,
  saveData: !!nav.connection?.saveData,
  dpr: Math.min(window.devicePixelRatio || 1, 3),
  /** параметры адресной строки для отладки: ?perf ?nogl ?tier=1..3 ?lock */
  perf: params.has('perf'),
  nogl: params.has('nogl') || (window as unknown as { __KM_NOGL?: boolean }).__KM_NOGL === true,
  forceTier: params.has('tier') ? Number(params.get('tier')) : null,
  lockTier: params.has('lock'),
  /** детерминированный кадр для скриншотов: ?freeze=секунды */
  freeze: params.has('freeze') ? Number(params.get('freeze')) : null,
};

/** Широкая раскладка: закреплённые экраны и горизонтальная лента отзывов */
export const isWide = () => window.innerWidth > 900;
