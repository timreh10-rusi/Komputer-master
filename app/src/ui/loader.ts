import gsap from 'gsap';
import { $ } from './dom';
import { env } from '../core/env';

/**
 * Загрузчик в духе «система стартует»: ошибка, вызов мастера, команда repair --all.
 * Полоса прогресса привязана к реальной готовности (шрифты, 3D-сцена), но не быстрее ~1,6 с.
 * Показывается раз за сессию, пропускается кликом или любой клавишей.
 */
const seen = () => {
  try {
    return sessionStorage.getItem('km-intro') === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    sessionStorage.setItem('km-intro', '1');
  } catch {
    /* приватный режим */
  }
};

export function runLoader(ready: Promise<unknown>): Promise<void> {
  const el = $('#loader');
  const html = document.documentElement;
  const skip = !el || env.reduced || env.freeze != null || html.classList.contains('km-fail') || seen() || location.search.includes('nointro');
  if (skip) {
    el?.remove();
    return Promise.resolve();
  }

  el.hidden = false;
  el.removeAttribute('aria-hidden');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Загрузка сайта');
  el.innerHTML = `
    <div class="loader__box">
      <div class="loader__line"><span class="p">&gt;</span><span>проверка системы . . .</span></div>
      <div class="loader__line err" id="ldErr"><span id="ldErrK">ОШИБКА:</span><span id="ldErrT">компьютер тормозит [0x7B]</span></div>
      <div class="loader__line"><span class="p">&gt;</span><span>вызываю мастера . . .</span></div>
      <div class="loader__line"><span class="p">master@novorossiysk:~$</span><span id="ldCmd"></span><i class="loader__cur"></i></div>
      <div class="loader__bar"><i id="ldBar"></i></div>
      <div class="loader__pct" id="ldPct">0%</div>
      <div class="loader__skip">Нажмите любую клавишу, чтобы пропустить</div>
    </div>`;
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

  return new Promise<void>((resolve) => {
    let finished = false;
    const tl = gsap.timeline();
    const at = [0.12, 0.5, 0.95, 1.35];
    lines.forEach((l, i) => tl.add(() => l.classList.add('is-on'), at[i]));
    const word = 'repair --all';
    tl.to({ k: 0 }, { k: 1, duration: 0.5, ease: 'none', onUpdate() { cmd.textContent = ' ' + word.slice(0, Math.round(this.progress() * word.length)); } }, 1.35);
    tl.to(prog, { v: 0.86, duration: 1.8, ease: 'power1.out', onUpdate: render }, 0.2);

    let minTime = false;
    let loaded = false;
    const tryFinish = () => {
      if (finished || !(minTime && loaded)) return;
      finish(false);
    };
    tl.add(() => {
      minTime = true;
      tryFinish();
    }, 1.9);
    ready.finally(() => {
      loaded = true;
      tryFinish();
    });
    window.setTimeout(() => finish(false), 7000); // страховка: не держим человека дольше

    const finish = (fast: boolean) => {
      if (finished) return;
      finished = true;
      tl.kill();
      window.removeEventListener('keydown', onSkip);
      el.removeEventListener('pointerdown', onSkip);
      lines.forEach((l) => l.classList.add('is-on'));
      gsap.to(prog, { v: 1, duration: fast ? 0.15 : 0.4, ease: 'power2.out', onUpdate: render });
      gsap.delayedCall(fast ? 0.15 : 0.4, () => {
        errLine.classList.remove('err');
        errK.textContent = 'ИСПРАВЛЕНО:';
        errT.textContent = 'компьютер летает';
        (errK as HTMLElement).style.color = 'var(--lime)';
      });
      gsap.delayedCall(fast ? 0.35 : 0.95, () => {
        markSeen();
        gsap.to(el, {
          clipPath: 'inset(0 0 100% 0)',
          duration: 0.95,
          ease: 'expo.inOut',
          onComplete: () => el.remove(),
        });
        resolve();
      });
    };
    const onSkip = () => finish(true);
    window.addEventListener('keydown', onSkip);
    el.addEventListener('pointerdown', onSkip);
  });
}
