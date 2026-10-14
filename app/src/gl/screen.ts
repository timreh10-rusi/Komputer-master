import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/** Экран ноутбука: терминал, нарисованный на 2D-холсте. Текстура обновляется только при изменениях. */
export const TERMINAL_LINES: Array<{ text: string; ok: boolean }> = [
  { text: '> подключение . . . ', ok: true },
  { text: '> диск проверен . . . ', ok: true },
  { text: '> вирусы удалены . . . ', ok: true },
  { text: '> windows обновлена . . . ', ok: true },
  { text: '> готово, компьютер летает', ok: false },
];

export const PROMPT = 'master@novorossiysk:~$ ';

export class TerminalScreen {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** состояние, которое меняет сценарий вступления */
  typed = '';
  /** сколько строк показано (дробное значение — строка проявляется) */
  lines = 0;
  bar = 0;
  cursor = true;
  /** затемнение при «влёте» (0 — как есть, 1 — чёрный) */
  fade = 0;
  private dirty = true;

  constructor(lite: boolean) {
    this.w = lite ? 768 : 1024;
    this.h = lite ? 480 : 640;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 4;
  }

  mark() {
    this.dirty = true;
  }

  /** Перерисовываем только при изменениях. Возвращает true, если текстуру надо загрузить заново. */
  flush(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    this.draw();
    this.texture.needsUpdate = true;
    return true;
  }

  private draw() {
    const { ctx, w } = this;
    const k = w / 1024;
    ctx.save();
    ctx.scale(k, k);
    const W = 1024;
    const H = 640;

    // фон и мягкое свечение
    ctx.fillStyle = '#031109';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.45, W * 0.75);
    glow.addColorStop(0, 'rgba(24,120,70,.32)');
    glow.addColorStop(1, 'rgba(3,17,9,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const mono = '"JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'alphabetic';

    // строка приглашения
    ctx.font = `500 32px ${mono}`;
    ctx.fillStyle = '#3DDC6E';
    ctx.fillText(PROMPT, 56, 96);
    const px = 56 + ctx.measureText(PROMPT).width;
    ctx.fillStyle = '#EEFFF4';
    ctx.fillText(this.typed, px, 96);
    if (this.cursor) {
      const cw = ctx.measureText(this.typed).width;
      ctx.fillStyle = '#C8FF3D';
      ctx.shadowColor = '#C8FF3D';
      ctx.shadowBlur = 18;
      ctx.fillRect(px + cw + 4, 68, 18, 36);
      ctx.shadowBlur = 0;
    }

    // журнал проверки
    ctx.font = `500 34px ${mono}`;
    for (let i = 0; i < TERMINAL_LINES.length; i++) {
      const a = Math.min(1, Math.max(0, this.lines - i));
      if (a <= 0) continue;
      const y = 186 + i * 66;
      const ln = TERMINAL_LINES[i];
      ctx.globalAlpha = a;
      ctx.fillStyle = ln.ok ? '#8FE3AE' : '#EEFFF4';
      if (!ln.ok) ctx.font = `700 34px ${mono}`;
      ctx.fillText(ln.text, 56, y);
      if (ln.ok) {
        const tw = ctx.measureText(ln.text).width;
        ctx.fillStyle = '#C8FF3D';
        ctx.font = `700 34px ${mono}`;
        ctx.fillText('OK', 56 + tw, y);
        ctx.font = `500 34px ${mono}`;
      }
      ctx.globalAlpha = 1;
    }

    // полоса прогресса
    const bx = 56;
    const by = 548;
    const bw = W - 112;
    ctx.fillStyle = 'rgba(166,255,196,.14)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 14, 7);
    ctx.fill();
    if (this.bar > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#18A55A');
      g.addColorStop(1, '#C8FF3D');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(200,255,61,.7)';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(14, bw * this.bar), 14, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // строки развёртки
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.4);

    if (this.fade > 0) {
      ctx.fillStyle = `rgba(3,17,9,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  dispose() {
    this.texture.dispose();
  }
}
