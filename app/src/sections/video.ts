import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $ } from '../ui/dom';
import { env } from '../core/env';

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.2v13.6a.9.9 0 0 0 1.4.8l10.6-6.8a.9.9 0 0 0 0-1.5L9.4 4.4A.9.9 0 0 0 8 5.2z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.8a7.6 7.6 0 0 1 0 10.4"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

const fmt = (s: number) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/**
 * Видео Сергея: окно «вырастает» при прокрутке, свой плеер без лишних запросов.
 * Файл 9 МБ не грузится, пока человек не нажал «Смотреть».
 */
export function initVideo() {
  const win = $('#vwin');
  const player = $('#vplayer');
  const video = $<HTMLVideoElement>('#vid');
  if (!win || !player || !video) return;

  // 1. Окно растёт при прокрутке (на телефоне — мягче)
  if (!env.reduced) {
    const from = window.innerWidth > 900 ? 0.66 : 0.93;
    gsap.fromTo(
      win,
      { scale: from, y: 70, transformOrigin: '50% 0%' },
      { scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: win, start: 'top 94%', end: 'top 34%', scrub: 0.5 } },
    );
  }

  // 2. Свой плеер: родные элементы управления убираем, они остаются только без JS
  video.removeAttribute('controls');
  video.setAttribute('tabindex', '-1');
  player.tabIndex = 0;
  player.setAttribute('role', 'group');
  player.setAttribute('aria-label', 'Видеоплеер');
  player.dataset.cursor = 'Смотреть';
  const ui = document.createElement('div');
  ui.className = 'vui';
  ui.innerHTML = `
    <button class="vbig" type="button" aria-label="Смотреть видео">${ICON.play}</button>
    <div class="vbar">
      <button class="vbtn vplay" type="button" aria-label="Воспроизвести">${ICON.play}</button>
      <span class="vtime">0:00</span>
      <div class="vprog" role="slider" tabindex="0" aria-label="Перемотка" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i class="vfill"></i></div>
      <button class="vbtn vmute" type="button" aria-label="Выключить звук">${ICON.vol}</button>
      <button class="vbtn vfs" type="button" aria-label="На весь экран">${ICON.fs}</button>
    </div>
    <p class="vnote" role="status" hidden>Видео не загрузилось. <a href="https://www.youtube.com/watch?v=J3VURZjh0a8" target="_blank" rel="noopener">Смотреть на YouTube</a></p>`;
  player.appendChild(ui);

  const big = $('.vbig', ui)!;
  const bPlay = $<HTMLButtonElement>('.vplay', ui)!;
  const bMute = $<HTMLButtonElement>('.vmute', ui)!;
  const bFs = $<HTMLButtonElement>('.vfs', ui)!;
  const prog = $('.vprog', ui)!;
  const fill = $('.vfill', ui)!;
  const time = $('.vtime', ui)!;
  const note = $('.vnote', ui)!;
  let raf = 0;

  const sync = () => {
    const d = video.duration || 0;
    const p = d ? video.currentTime / d : 0;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    prog.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    time.textContent = d ? `${fmt(video.currentTime)} / ${fmt(d)}` : fmt(video.currentTime);
  };
  const loop = () => {
    sync();
    raf = video.paused ? 0 : requestAnimationFrame(loop);
  };

  const toggle = async () => {
    if (video.paused || video.ended) {
      if (video.preload !== 'auto') video.preload = 'auto';
      try {
        await video.play();
      } catch {
        note.hidden = false;
      }
    } else {
      video.pause();
    }
  };

  video.addEventListener('play', () => {
    player.classList.add('is-started', 'is-playing');
    bPlay.innerHTML = ICON.pause;
    bPlay.setAttribute('aria-label', 'Пауза');
    big.setAttribute('aria-label', 'Пауза');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  video.addEventListener('pause', () => {
    player.classList.remove('is-playing');
    bPlay.innerHTML = ICON.play;
    bPlay.setAttribute('aria-label', 'Воспроизвести');
    big.setAttribute('aria-label', 'Продолжить');
    sync();
  });
  video.addEventListener('ended', () => {
    player.classList.remove('is-started', 'is-playing');
    video.currentTime = 0;
    big.setAttribute('aria-label', 'Смотреть видео');
    sync();
  });
  video.addEventListener('loadedmetadata', sync);
  video.addEventListener('error', () => (note.hidden = false));

  big.addEventListener('click', toggle);
  bPlay.addEventListener('click', toggle);
  video.addEventListener('click', toggle);
  bMute.addEventListener('click', () => {
    video.muted = !video.muted;
    bMute.innerHTML = video.muted ? ICON.mute : ICON.vol;
    bMute.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
  });
  bFs.addEventListener('click', () => {
    const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (document.fullscreenElement) document.exitFullscreen();
    else if (player.requestFullscreen) player.requestFullscreen();
    else v.webkitEnterFullscreen?.();
  });

  // перемотка: тянуть по полосе или стрелками
  const seek = (clientX: number) => {
    const r = prog.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (video.duration) video.currentTime = p * video.duration;
    sync();
  };
  prog.addEventListener('pointerdown', (e) => {
    prog.setPointerCapture(e.pointerId);
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => {
      prog.removeEventListener('pointermove', move);
      prog.removeEventListener('pointerup', up);
    };
    prog.addEventListener('pointermove', move);
    prog.addEventListener('pointerup', up);
  });
  prog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
    else if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    else return;
    e.preventDefault();
    sync();
  });
  player.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.vprog, .vbtn, .vbig')) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'm') bMute.click();
    else if (e.key === 'f') bFs.click();
  });

  // вне экрана видео ставим на паузу: не тратим батарею
  ScrollTrigger.create({
    trigger: player,
    start: 'top bottom',
    end: 'bottom top',
    onLeave: () => video.pause(),
    onLeaveBack: () => video.pause(),
  });
  sync();
}
