import { CanvasTexture, LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace } from 'three';

/**
 * Гигантский заголовок «Компьютерный мастер» как текстура в сцене:
 * он стоит позади ноутбука и не закрывается им (в отличие от прежнего сайта,
 * где ноутбук перекрывал слова). Раскладку берём из DOM-версии заголовка.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uReveal;
uniform float uGlitch;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec2 uv = vUv;
  float tick = floor(uTime * 9.);
  float row = floor(uv.y * 34.);
  float cut = step(.90, h(vec2(row, tick))) * uGlitch;
  uv.x += (h(vec2(row + 7., tick)) - .5) * .07 * cut;
  float s = .0065 * uGlitch;
  vec4 c  = texture2D(uMap, uv);
  vec4 cr = texture2D(uMap, uv + vec2(s, 0.));
  vec4 cb = texture2D(uMap, uv - vec2(s, 0.));
  vec4 col = vec4(cr.r, c.g, cb.b, max(max(cr.a, c.a), cb.a));
  float y = 1. - vUv.y;
  float edge = uReveal * 1.18;
  float m = 1. - smoothstep(edge - .16, edge, y);
  float line = exp(-pow((y - edge + .08) * 46., 2.)) * (1. - step(.999, uReveal));
  col.rgb += line * vec3(.45, 1., .6) * col.a;
  gl_FragColor = col * m * uAlpha;
}`;

export class Headline {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private tex: CanvasTexture | null = null;
  /** центр и размер плоскости в CSS-пикселях (от левого верхнего угла окна) */
  cx = 0;
  cy = 0;
  w = 1;
  h = 1;

  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMap: { value: null },
        uReveal: { value: 0 },
        uGlitch: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 1 },
      },
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
    this.mesh.visible = false;
  }

  get u() {
    return this.mat.uniforms;
  }

  /** Рисуем строки заголовка на холсте по раскладке DOM-версии. */
  async build(giant: HTMLElement, pin: HTMLElement, dpr: number) {
    await document.fonts.load('700 120px Oswald', 'КОМПЬЮТЕРНЫЙ');
    const cs = getComputedStyle(giant);
    const size = parseFloat(cs.fontSize);
    const lh = size * 0.84;
    const lines = Array.from(giant.querySelectorAll<HTMLElement>('.ln')).map((l) => (l.textContent ?? '').toUpperCase());
    const pinW = pin.clientWidth;
    const pad = Math.ceil(size * 0.4);
    const blockH = lh * lines.length;
    const cssW = pinW;
    const cssH = Math.ceil(blockH + pad * 2);
    const scale = Math.min(dpr, 2048 / cssW, 2048 / cssH);

    const c = document.createElement('canvas');
    c.width = Math.round(cssW * scale);
    c.height = Math.round(cssH * scale);
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.font = `700 ${size}px Oswald, "Arial Narrow", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    try {
      (g as unknown as { letterSpacing: string }).letterSpacing = `${(-0.012 * size).toFixed(2)}px`;
    } catch {
      /* старые браузеры: без трекинга */
    }
    // кап-высота Oswald ≈ 0.81 em; ставим базовую линию так, чтобы блок был по центру
    lines.forEach((text, i) => {
      const top = pad + i * lh;
      const base = top + lh * 0.5 + size * 0.405;
      const grad = g.createLinearGradient(0, base - size * 0.82, 0, base);
      if (i === 0) {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(1, '#D9FFE8');
      } else {
        grad.addColorStop(0, '#D3FFE3');
        grad.addColorStop(0.7, '#6BF59A');
        grad.addColorStop(1, '#3DDC6E');
      }
      g.shadowColor = 'rgba(61,220,110,.40)';
      g.shadowBlur = size * 0.32 * scale;
      g.fillStyle = grad;
      g.fillText(text, cssW / 2, base);
    });

    this.tex?.dispose();
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.tex = tex;
    this.mat.uniforms.uMap.value = tex;

    // положение: центр блока по раскладке DOM
    const gr = giant.getBoundingClientRect();
    const pr = pin.getBoundingClientRect();
    this.w = cssW;
    this.h = cssH;
    this.cx = cssW / 2;
    this.cy = gr.top + gr.height / 2 - pr.top;
    this.mesh.visible = true;
  }

  /** Камера ортографическая: единицы — CSS-пиксели, ось y вверх. */
  place(viewH: number, shiftPx: number) {
    this.mesh.scale.set(this.w, this.h, 1);
    this.mesh.position.set(this.cx, viewH - this.cy + shiftPx, 0);
  }

  dispose() {
    this.tex?.dispose();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
