import gsap from 'gsap';
import { $ } from './dom';

/**
 * Загрузчик в духе «система стартует»: ошибка, вызов мастера, команда repair --all.
 * Разметка лежит прямо в HTML и показывается классом intro (его ставит скрипт в <head>),
 * поэтому до запуска приложения ничего не мелькает. Полоса прогресса привязана к реальной
 * готовности (шрифты, 3D-сцена), но не быстрее ~1,9 с. Раз за сессию, пропуск кликом или клавишей.
 * Возвращает true, если загрузчик был показан.
 */
/** main.ts ставит fast, если 3D не нужен (слабая графика): тогда загрузчик заканчивается раньше */
export const loaderOpts = { fast: false };

const markSeen = () => {
  try {
    sessionStorage.setItem('km-intro', '1');
  } catch {
    /* приватный режим */
  }
};

export function runLoader(ready: Promise<unknown>): Promise<boolean> {
  const el = $('#loader');
  const html = document.documentElement;
  if (!el || !html.classList.contains('intro') || html.classList.contains('km-fail')) {
    el?.remove();
    html.classList.remove('intro');
    return Promise.resolve(false);
  }

  const lines = Array.from(el.querySelectorAll<HTMLElement>('.loader__line'));
  const bar = $('#ldBar', el)!;
  const pct = $('#ldPct', el)!;
  const cmd = $('#ldCmd', el)!;
  const errK = $('#ldErrK', el)!;
  const errT = $('#ldErrT', el)!;
  const errLine = $('#ldErr', el)!;
  const prog = { v: 0 };
  const render = () => {
    bar.style.transform = `scaleX(${prog.v.toFixed(3)})`;
    pct.textContent = Math.round(prog.v * 100) + '%';
  };

  return new Promise<boolean>((resolve) => {
    let finished = false;
    let minTime = false;
    let loaded = false;
    const tl = gsap.timeline();
    const at = [0.12, 0.5, 0.95, 1.35];
    lines.forEach((l, i) => tl.add(() => l.classList.add('is-on'), at[i]));
    const word = 'repair --all';
    tl.to({ k: 0 }, { k: 1, duration: 0.5, ease: 'none', onUpdate() { cmd.textContent = ' ' + word.slice(0, Math.round(this.progress() * word.length)); } }, 1.35);
    tl.to(prog, { v: 0.86, duration: 1.8, ease: 'power1.out', onUpdate: render }, 0.2);
    tl.add(() => {
      minTime = true;
      tryFinish();
    }, 1.9);
    tl.add(() => {
      if (loaderOpts.fast) {
        minTime = true;
        tryFinish();
      }
    }, 0.9);

    function tryFinish() {
      if (!finished && minTime && loaded) finish(false);
    }
    ready.finally(() => {
      loaded = true;
      tryFinish();
    });
    window.setTimeout(() => finish(false), 7000); // страховка: не держим человека дольше

    function finish(fast: boolean) {
      if (finished) return;
      finished = true;
      tl.kill();
      window.removeEventListener('keydown', onSkip);
      el!.removeEventListener('pointerdown', onSkip);
      lines.forEach((l) => l.classList.add('is-on'));
      gsap.to(prog, { v: 1, duration: fast ? 0.15 : 0.4, ease: 'power2.out', onUpdate: render });
      gsap.delayedCall(fast ? 0.15 : 0.4, () => {
        errLine.classList.remove('err');
        errK.textContent = 'ИСПРАВЛЕНО:';
        errT.textContent = 'компьютер летает';
        errK.style.color = 'var(--lime)';
      });
      gsap.delayedCall(fast ? 0.35 : 0.95, () => {
        markSeen();
        gsap.to(el, {
          clipPath: 'inset(0 0 100% 0)',
          duration: 0.95,
          ease: 'expo.inOut',
          onComplete: () => {
            el!.remove();
            html.classList.remove('intro');
          },
        });
        resolve(true);
      });
    }
    const onSkip = () => finish(true);
    window.addEventListener('keydown', onSkip);
    el.addEventListener('pointerdown', onSkip);
  });
}
