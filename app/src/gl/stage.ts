import gsap from 'gsap';
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Rain } from './rain';
import { Headline } from './headline';
import { Laptop, DIM } from './laptop';
import { LaptopControls } from './controls';
import { PROMPT } from './screen';
import { S } from '../core/state';
import { env } from '../core/env';
import { Q, onQuality, sampleFrame, forceTier } from '../core/quality';
import { onTick } from '../core/loop';
import { frame, type GLInfo } from '../core/perf';
import { clamp, damp, smooth } from '../ui/dom';

const FOV = 30;
const Z0 = 9;
const TYPED = 'компьютерный мастер';
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Единая WebGL-сцена страницы. Порядок отрисовки:
 *   1) дождь (полноэкранный шейдер)  2) заголовок-текстура  3) ноутбук (перспектива, глубина очищается заново)
 * Всё в одном холсте и одном цикле кадров, поэтому нагрузка предсказуема.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private bgScene = new Scene();
  private bgCam = new OrthographicCamera(0, 1, 1, 0, -10, 10);
  private scene = new Scene();
  private cam = new PerspectiveCamera(FOV, 1, 0.1, 80);
  private pmrem: PMREMGenerator;
  private envTex: Texture | null = null;

  readonly rain: Rain;
  readonly headline: Headline;
  readonly laptop: Laptop;
  readonly controls: LaptopControls;

  private W = 1;
  private H = 1;
  private px = 1;
  private upp = 1; // мировых единиц на CSS-пиксель на плоскости z=0
  private baseX = 0;
  private baseY = 0;
  private sc = 1;
  private pinEl: HTMLElement;
  private stageEl: HTMLElement;
  private giantEl: HTMLElement;
  private heroEl: HTMLElement;

  /** сценарий вступления: значения 0..1, которые двигает GSAP */
  readonly I = { reveal: 0, rise: 0, lid: 0 };
  /** пользовательское состояние крышки (клик) */
  private lidUser = { v: 1 };
  private lidOpen = true;

  private lost = false;
  private disabled = false;
  private skipFrame = false;
  private lastRender = 0;
  private blink = 0;
  private offTick: () => void;
  private ro: ResizeObserver;
  private rebuildTimer = 0;
  private ac = new AbortController();
  private heroEndY = 0;
  private maskRects: Array<{ x0: number; x1: number; top: number; bottom: number }> = [];
  /** подгонка DOM-заголовка перед пересборкой его текстуры */
  beforeHeadline: (() => void) | null = null;

  private sp = new Vector3();
  private sn = new Vector3();
  private su = new Vector3();
  private endPos = new Vector3();
  private tgt = new Vector3();
  private basePos = new Vector3(0, 0, Z0);
  private UP = new Vector3(0, 1, 0);

  private constructor(canvas: HTMLCanvasElement, renderer: WebGLRenderer, els: { pin: HTMLElement; stage: HTMLElement; giant: HTMLElement; hero: HTMLElement }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.pinEl = els.pin;
    this.stageEl = els.stage;
    this.giantEl = els.giant;
    this.heroEl = els.hero;

    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.setClearColor(0x020805, 1);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    this.pmrem = new PMREMGenerator(renderer);
    this.rain = new Rain();
    this.headline = new Headline();
    this.laptop = new Laptop();
    this.bgScene.add(this.rain.mesh, this.headline.mesh);
    this.scene.add(this.laptop.root);

    // свет: мягкая заливка, ключевой спереди, зелёный контровой сзади
    this.scene.add(new HemisphereLight(0xa6ffc4, 0x021008, 0.5));
    const key = new DirectionalLight(0xffffff, 1.25);
    key.position.set(2.5, 4, 5);
    const rim = new DirectionalLight(0x6bf59a, 2.6);
    rim.position.set(-4, 2.2, -3);
    const fill = new DirectionalLight(0x3ddc6e, 0.7);
    fill.position.set(4, -1, 2);
    this.scene.add(key, rim, fill);
    this.applyIbl();

    this.controls = new LaptopControls(
      els.stage,
      () => this.toggleLid(),
      () => els.hero.classList.add('touched'),
    );

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(document.documentElement);
    this.resize();

    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.lost = true;
      },
      { signal: this.ac.signal },
    );
    canvas.addEventListener('webglcontextrestored', () => (this.lost = false), { signal: this.ac.signal });

    onQuality((q, prev) => {
      if (q.tier === 0) return this.disable();
      if (prev === 0) return;
      this.applyIbl();
      this.laptop.applyQuality();
      this.rain.u.uLite.value = q.rainLite ? 1 : 0;
      this.resize();
    });
    this.rain.u.uLite.value = Q.rainLite ? 1 : 0;

    this.offTick = onTick((t, dt) => this.tick(t, dt));
  }

  static async create(canvas: HTMLCanvasElement, els: { pin: HTMLElement; stage: HTMLElement; giant: HTMLElement; hero: HTMLElement }): Promise<Stage | null> {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: Q.msaa, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
      if (!renderer.getContext()) return null;
    } catch {
      return null;
    }
    // шрифты нужны для атласа дождя, экрана ноутбука и текстуры заголовка
    await Promise.all([
      document.fonts.load('800 100px "JetBrains Mono"', '01'),
      document.fonts.load('500 40px "JetBrains Mono"', 'master@ подключение'),
      document.fonts.load('700 120px Oswald', 'КОМПЬЮТЕРНЫЙ'),
    ]).catch(() => undefined);
    const stage = new Stage(canvas, renderer, els);
    await stage.headline.build(els.giant, els.pin, stage.px);
    stage.placeHeadline();
    stage.renderOnce();
    return stage;
  }

  info(): GLInfo {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }

  // ---------- размеры и раскладка ----------
  private resize() {
    const c = this.canvas;
    const W = c.clientWidth || window.innerWidth;
    const H = c.clientHeight || window.innerHeight;
    const px = Math.min(window.devicePixelRatio || 1, Q.maxDpr);
    if (W === this.W && H === this.H && px === this.px && this.renderer.getPixelRatio() === px) {
      this.layoutLaptop();
      return;
    }
    this.W = W;
    this.H = H;
    this.px = px;
    this.renderer.setPixelRatio(px);
    this.renderer.setSize(W, H, false);
    this.cam.aspect = W / H;
    this.cam.updateProjectionMatrix();
    this.bgCam.right = W;
    this.bgCam.top = H;
    this.bgCam.updateProjectionMatrix();
    this.rain.resize(W, H, px);
    this.upp = (2 * Z0 * Math.tan(MathUtils.degToRad(FOV / 2))) / H;
    this.layoutLaptop();
    this.layoutMasks();
    this.heroEndY = this.heroEl.offsetTop + this.heroEl.offsetHeight - window.innerHeight;
    // текстура заголовка зависит от ширины окна: пересобираем с задержкой
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.relayoutHeadline(), 260);
  }

  /** Вызывается после подгонки размера DOM-заголовка. */
  async relayoutHeadline() {
    if (this.disabled) return;
    this.beforeHeadline?.();
    await this.headline.build(this.giantEl, this.pinEl, this.px);
    this.placeHeadline();
  }

  private placeHeadline() {
    this.headline.place(this.H, 0);
  }

  /** Ноутбук занимает область #stage: берём её центр и размер из DOM. */
  private layoutLaptop() {
    const r = this.stageEl.getBoundingClientRect();
    const pr = this.pinEl.getBoundingClientRect();
    const cx = r.left + r.width / 2 - pr.left;
    const cy = r.top + r.height / 2 - pr.top;
    this.baseX = (cx - this.W / 2) * this.upp;
    this.baseY = (this.H / 2 - cy) * this.upp;
    const byW = (r.width * 0.78 * this.upp) / DIM.W;
    const byH = (r.height * 0.7 * this.upp) / 2.55;
    this.sc = Math.min(byW, byH);
    this.laptop.root.scale.setScalar(this.sc);
  }

  /** Прямоугольники текстовых блоков героя: под ними дождь приглушается. */
  private layoutMasks() {
    const pr = this.pinEl.getBoundingClientRect();
    const set = (sel: string, target: Vector4) => {
      const el = this.pinEl.querySelector<HTMLElement>(sel);
      if (!el) return target.set(0, 0, 0, 0);
      const r = el.getBoundingClientRect();
      const pad = 18;
      const x0 = (r.left - pr.left - pad) * this.px;
      const x1 = (r.right - pr.left + pad) * this.px;
      const y0 = (this.H - (r.bottom - pr.top + pad)) * this.px;
      const y1 = (this.H - (r.top - pr.top - pad)) * this.px;
      target.set(x0, y0, x1, y1);
    };
    set('.hero__copy', this.rain.u.uMask0.value);
    set('.hero__meta', this.rain.u.uMask1.value);
  }

  /** Текстовые блоки разделов (в координатах страницы): под ними дождь приглушается. */
  collectMasks() {
    this.maskRects = Array.from(document.querySelectorAll<HTMLElement>('[data-rainmask]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, x1: r.right, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
  }

  private updateMasks() {
    const ru = this.rain.u;
    const list = ru.uMasks.value as Vector4[];
    const y = S.y;
    const pad = 20;
    let n = 0;
    for (let i = 0; i < this.maskRects.length && n < 6; i++) {
      const m = this.maskRects[i];
      const top = m.top - y;
      const bottom = m.bottom - y;
      if (bottom < -80 || top > this.H + 80) continue;
      list[n++].set((m.x0 - pad) * this.px, (this.H - (bottom + pad)) * this.px, (m.x1 + pad) * this.px, (this.H - (top - pad)) * this.px);
    }
    ru.uMaskN.value = n;
  }

  private applyIbl() {
    if (Q.ibl && !this.envTex) {
      this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    this.scene.environment = Q.ibl ? this.envTex : null;
    this.scene.environmentIntensity = 0.55;
  }

  // ---------- сценарий ----------
  toggleLid() {
    this.lidOpen = !this.lidOpen;
    gsap.to(this.lidUser, { v: this.lidOpen ? 1 : 0, duration: this.lidOpen ? 1.1 : 0.7, ease: this.lidOpen ? 'elastic.out(1,0.6)' : 'power3.inOut', overwrite: true });
  }

  /** Вступление: дождь, заголовок, подъём ноутбука, крышка, набор текста и журнал на экране. */
  playIntro(instant = false): gsap.core.Timeline {
    const I = this.I;
    const scr = this.laptop.screen;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    const hu = this.headline.u;

    tl.to(I, { reveal: 1, duration: 1.5, ease: 'power2.out' }, 0);
    tl.to(hu.uReveal, { value: 1, duration: 1.25, ease: 'power3.inOut' }, 0.12);
    tl.to(hu.uGlitch, { value: 0, duration: 1.3, ease: 'power2.out' }, 0.3);
    tl.to(I, { rise: 1, duration: 1.7, ease: 'expo.out' }, 0.25);
    tl.to(I, { lid: 1, duration: 1.5, ease: 'elastic.out(1,0.55)' }, 0.7);

    // набор заголовка на экране; клавиши подсвечиваются по буквам
    const t0 = 1.35;
    const step = 0.05;
    [...TYPED].forEach((ch, i) => {
      tl.call(
        () => {
          scr.typed += ch;
          scr.mark();
          if (ch !== ' ') this.laptop.press(ch);
          else this.laptop.press(' ');
        },
        undefined,
        t0 + i * step,
      );
    });
    const t1 = t0 + TYPED.length * step + 0.25;
    tl.to(scr, { lines: 5, duration: 1.9, ease: 'none', onUpdate: () => scr.mark() }, t1);
    tl.to(scr, { bar: 1, duration: 2.0, ease: 'power1.inOut', onUpdate: () => scr.mark() }, t1);

    if (instant) {
      tl.progress(1);
      scr.typed = TYPED;
      scr.lines = 5;
      scr.bar = 1;
      scr.mark();
      this.laptop.screen.flush();
    }
    return tl;
  }

  /** Детерминированный итоговый кадр для скриншотов и режима «меньше движения». */
  settle(freezeTime?: number) {
    this.playIntro(true);
    this.I.reveal = 1;
    this.I.rise = 1;
    this.I.lid = 1;
    this.headline.u.uReveal.value = 1;
    this.headline.u.uGlitch.value = 0;
    this.laptop.resetGlow();
    if (freezeTime != null) this.rain.setTime(freezeTime);
  }

  private disable() {
    if (this.disabled) return;
    this.disabled = true;
    document.documentElement.classList.remove('gl');
    this.canvas.style.display = 'none';
  }

  private renderOnce() {
    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
  }

  // ---------- кадр ----------
  private tick(_t: number, dtMs: number) {
    if (this.lost || this.disabled || document.hidden) return;
    const now = performance.now();
    // режим съёмки (?freeze): сцена статична, рисуем редко, чтобы не мешать браузеру в программной среде
    if (env.freeze != null && this.lastRender && now - this.lastRender < 300) return;

    // 30 к/с на слабых устройствах, пока ничего не требует 60
    if (Q.cap30 && Math.abs(S.vel) < 2 && !this.controls.dragging && S.heroTarget < 0.01) {
      this.skipFrame = !this.skipFrame;
      if (this.skipFrame) return;
    }
    const dtR = this.lastRender ? now - this.lastRender : dtMs;
    this.lastRender = now;
    const dt = Math.min(dtR, 64);

    // прогресс «влёта» со сглаживанием
    S.heroP = damp(S.heroP, S.heroTarget, 16, dt);
    if (Math.abs(S.heroP - S.heroTarget) < 0.0004) S.heroP = S.heroTarget;
    const p = S.heroP;
    const reduced = env.reduced;
    const e = reduced ? 0 : easeInOut(clamp((p - 0.08) / 0.9));
    const afterDive = p >= 0.975;

    // ----- дождь -----
    const speed = 1 + Math.min(Math.abs(S.vel), 70) * 0.04;
    if (env.freeze == null && !reduced) this.rain.step(dt, speed);
    else if (reduced && env.freeze == null) this.rain.setTime(42);
    const ru = this.rain.u;
    ru.uHealth.value = S.health;
    const poured = clamp((S.y - this.heroEndY) / (window.innerHeight * 0.8));
    ru.uReveal.value = afterDive ? poured : this.I.reveal;
    const dimHero = 1 - smooth(clamp((p - 0.45) / 0.52));
    ru.uDim.value = afterDive ? 0.55 : Math.max(0.0, dimHero);
    ru.uCalm.value = smooth(clamp((S.health - 0.9) / 0.1));
    ru.uMaskK.value = 1 - clamp(p * 3.4);
    this.updateMasks();
    if (env.fine && S.pointerActive) ru.uMouse.value.set(S.px * this.px, (this.H - S.py) * this.px);
    else ru.uMouse.value.set(-1e5, -1e5);

    // ----- заголовок -----
    const hu = this.headline.u;
    hu.uTime.value = this.rain.u.uTime.value;
    hu.uAlpha.value = 1 - smooth(clamp(p / 0.4));
    this.headline.place(this.H, p * this.H * 0.42);

    // ----- ноутбук -----
    const visible = this.I.rise > 0.001 && e < 0.995 && !afterDive;
    this.laptop.root.visible = visible;
    if (visible) {
      this.controls.update(dt, now, p < 0.4);
      const idleSway = env.freeze == null && !reduced ? Math.sin(now * 0.00033) * 0.05 : 0;
      const rise = this.I.rise;
      const k = 1 - e;
      const yaw = (-0.42 + this.controls.yaw + idleSway) * k + (1 - rise) * -1.3 * k;
      const pitch = (0.2 + this.controls.pitch) * k + 0.1 * e;
      this.laptop.tilt.rotation.set(pitch, yaw, 0, 'YXZ');
      const bob = env.freeze == null && !reduced ? Math.sin(now * 0.0009) * 0.012 : 0;
      this.laptop.content.position.y = -0.86 + bob;
      const lift = reduced ? p * this.H * this.upp * 1.1 : 0;
      this.laptop.root.position.set(this.baseX, this.baseY - (1 - rise) * 2.2 * this.sc + lift, 0);
      this.laptop.root.scale.setScalar(this.sc * (0.9 + 0.1 * rise));
      this.laptop.setLid(this.I.lid * this.lidUser.v);
      this.laptop.root.updateMatrixWorld(true);

      // курсор терминала мигает: перерисовываем текстуру только при смене
      this.blink += dt;
      if (this.blink > 520) {
        this.blink = 0;
        this.laptop.screen.cursor = !this.laptop.screen.cursor;
        this.laptop.screen.mark();
      }
      this.laptop.update(dt);

      // камера: от обычного ракурса к экрану, заполняющему окно
      if (e > 0) {
        this.laptop.screenWorld(this.sp, this.sn, this.su);
        const t = Math.tan(MathUtils.degToRad(FOV / 2));
        const dH = (DIM.SH * this.sc * 0.5) / t;
        const dW = (DIM.SW * this.sc * 0.5) / (t * this.cam.aspect);
        const dist = Math.min(dH, dW) * 0.97;
        this.endPos.copy(this.sp).addScaledVector(this.sn, dist);
        this.cam.position.lerpVectors(this.basePos, this.endPos, e);
        this.tgt.set(0, 0, 0).lerp(this.sp, e);
        this.cam.up.lerpVectors(this.UP, this.su, e).normalize();
        this.cam.lookAt(this.tgt);
      } else {
        this.cam.position.copy(this.basePos);
        this.cam.up.copy(this.UP);
        this.cam.lookAt(0, 0, 0);
      }
    }

    // ----- отрисовка -----
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.bgScene, this.bgCam);
    if (visible) {
      r.clearDepth();
      r.render(this.scene, this.cam);
    }
    frame.push(dtR, performance.now() - now);
    sampleFrame(dtR / (Q.cap30 ? 2 : 1), now);
  }

  dispose() {
    this.offTick();
    this.ro.disconnect();
    this.ac.abort();
    clearTimeout(this.rebuildTimer);
    this.controls.dispose();
    this.rain.dispose();
    this.headline.dispose();
    this.laptop.dispose();
    this.envTex?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}

export { PROMPT, forceTier };
