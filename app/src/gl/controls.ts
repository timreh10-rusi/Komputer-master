import { clamp, damp } from '../ui/dom';
import { S } from '../core/state';
import { env } from '../core/env';

/**
 * Управление ноутбуком: тянуть мышью или пальцем — вращать (с инерцией),
 * короткий клик — открыть или закрыть крышку, стрелки на клавиатуре тоже вращают.
 * Через несколько секунд без действий ноутбук мягко возвращается в исходный ракурс.
 */
export class LaptopControls {
  userYaw = 0;
  userPitch = 0;
  private vYaw = 0;
  private hoverYaw = 0;
  private hoverPitch = 0;
  dragging = false;
  touched = false;

  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private moved = 0;
  private lastInput = -1e9;
  private ac = new AbortController();

  constructor(
    private el: HTMLElement,
    private onToggle: () => void,
    private onFirstTouch: () => void,
  ) {
    const { signal } = this.ac;
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this.dragging = true;
        this.moved = 0;
        this.downX = this.lastX = e.clientX;
        this.downY = this.lastY = e.clientY;
        this.downT = this.lastT = performance.now();
        this.vYaw = 0;
        this.lastInput = this.downT;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        el.classList.add('is-drag');
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (e) => {
        if (!this.dragging) return;
        const now = performance.now();
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.moved += Math.abs(dx) + Math.abs(dy);
        this.userYaw = clamp(this.userYaw + dx * 0.0085, -1.7, 1.7);
        this.userPitch = clamp(this.userPitch + dy * 0.0035, -0.32, 0.22);
        const dt = Math.max(1, now - this.lastT);
        this.vYaw += ((dx * 0.0085) / dt - this.vYaw) * 0.5;
        this.lastT = now;
        this.lastInput = now;
        if (this.moved > 8) this.touch();
      },
      { signal },
    );
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.dragging) return;
      this.dragging = false;
      el.classList.remove('is-drag');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const now = performance.now();
      this.lastInput = now;
      if (!cancelled && this.moved < 8 && now - this.downT < 450) {
        this.touch();
        this.onToggle();
        this.vYaw = 0;
      }
    };
    el.addEventListener('pointerup', (e) => end(e, false), { signal });
    el.addEventListener('pointercancel', (e) => end(e, true), { signal });
    el.addEventListener(
      'keydown',
      (e) => {
        const k = e.key;
        if (k === 'ArrowLeft') this.userYaw = clamp(this.userYaw - 0.22, -1.7, 1.7);
        else if (k === 'ArrowRight') this.userYaw = clamp(this.userYaw + 0.22, -1.7, 1.7);
        else if (k === 'ArrowUp') this.userPitch = clamp(this.userPitch - 0.07, -0.32, 0.22);
        else if (k === 'ArrowDown') this.userPitch = clamp(this.userPitch + 0.07, -0.32, 0.22);
        else if (k === 'Enter' || k === ' ') this.onToggle();
        else return;
        e.preventDefault();
        this.touch();
        this.lastInput = performance.now();
      },
      { signal },
    );
  }

  private touch() {
    if (this.touched) return;
    this.touched = true;
    this.onFirstTouch();
  }

  /** active — героя сейчас видно и до «влёта» далеко */
  update(dtMs: number, nowMs: number, active: boolean) {
    if (!this.dragging) {
      this.userYaw = clamp(this.userYaw + this.vYaw * dtMs, -1.7, 1.7);
      this.vYaw *= Math.exp(-dtMs / 260);
      if (nowMs - this.lastInput > 3600) {
        this.userYaw = damp(this.userYaw, 0, 1.2, dtMs);
        this.userPitch = damp(this.userPitch, 0, 1.2, dtMs);
      }
    }
    const hy = env.fine && S.pointerActive && active ? S.nx * 0.16 : 0;
    const hp = env.fine && S.pointerActive && active ? -S.ny * 0.07 : 0;
    this.hoverYaw = damp(this.hoverYaw, hy, 3.5, dtMs);
    this.hoverPitch = damp(this.hoverPitch, hp, 3.5, dtMs);
  }

  get yaw() {
    return this.userYaw + this.hoverYaw;
  }
  get pitch() {
    return this.userPitch + this.hoverPitch;
  }

  dispose() {
    this.ac.abort();
  }
}
