import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';

/**
 * Бинарный дождь (0 и 1) на шейдере: три слоя глубины, как на видео с Сергеем.
 * Дальний — мягкий, средний — резкий, ближний — размытое боке.
 * Один полноэкранный треугольник, одна выборка из атласа символов на слой.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = position.xy * .5 + .5;
  gl_Position = vec4(position.xy, 0., 1.);
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2  uRes;
uniform float uPx;
uniform float uTime;
uniform float uHealth;
uniform float uDim;
uniform float uReveal;
uniform float uFlash;
uniform float uLite;
uniform float uCalm;
uniform vec2  uMouse;
uniform vec4  uMask0;
uniform vec4  uMask1;
uniform float uMaskK;
uniform vec4  uMasks[6];
uniform int   uMaskN;
uniform vec3  uBg;
uniform sampler2D uAtlas;
varying vec2 vUv;

float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

// Один слой: x — яркость хвоста (с символом), y — яркость «головы» потока
vec2 rainLayer(vec2 frag, float cell, float speed, float density, float lod, float seed){
  float cpx = cell * uPx;
  vec2 p = frag / cpx;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float col = id.x + seed;
  if (h11(col * 1.37) > density) return vec2(0.);
  float b = h11(col * 2.11 + 7.3);
  float c = h11(col * 3.77 + 1.9);
  float rows = ceil(uRes.y / cpx);
  float len = mix(7., 26., b);
  float spd = speed * mix(.55, 1.45, c) * (1. - .55 * uCalm);
  float period = rows + len + 6.;
  float t = uTime * spd + c * period * 3.;
  float headRow = rows + len - mod(t, period);
  float d = id.y - headRow;
  if (d < 0. || d > len) return vec2(0.);
  float tail = pow(1. - d / len, 1.8);
  float head = 1. - step(1., d);
  float flip = floor(uTime * (1.1 + b) + h21(id) * 7.);
  float g = step(.5, h21(id + flip * .37));
  vec2 uv = vec2(g * .5 + f.x * .5, f.y);
  float cov = textureLod(uAtlas, uv, lod).a;
  return vec2(cov * tail, cov * head);
}

float boxMask(vec2 p, vec4 r, float soft){
  vec2 c = (r.xy + r.zw) * .5;
  vec2 hh = (r.zw - r.xy) * .5;
  vec2 d = abs(p - c) - hh;
  return 1. - smoothstep(0., soft, max(d.x, d.y));
}

void main(){
  vec2 frag = vUv * uRes;

  // сбой: пока «здоровье» низкое, отдельные строки дёргаются вбок
  float bad = 1. - uHealth;
  float band = floor(frag.y / (28. * uPx));
  float bt = floor(uTime * 6.);
  float tear = step(.988 - bad * .035, h21(vec2(band, bt))) * (h21(vec2(band + 3., bt)) - .5) * 90. * uPx * bad;
  frag.x += tear;

  vec3 acc = vec3(0.);
  if (uLite < .5) {
    vec2 r0 = rainLayer(frag, 12., 4.4, .50, 1.5, 0.);
    acc += (mix(vec3(.02,.22,.14), vec3(.10,.62,.36), r0.x) * r0.x + vec3(.40,.85,.60) * r0.y) * .34;
  }
  vec2 r1 = rainLayer(frag, 17., 5.4, .30, 0., 11.);
  acc += mix(vec3(.02,.30,.15), vec3(.24,.88,.44), r1.x) * r1.x * .92 + vec3(.80,1.,.88) * r1.y * .95;
  vec2 r2 = rainLayer(frag, 38., 3.6, .075, 2.7, 23.);
  acc += (vec3(.18,.80,.40) * r2.x + vec3(.55,1.,.70) * r2.y) * .6;

  // под курсором дождь «просыпается»
  float m = smoothstep(240. * uPx, 0., distance(frag, uMouse));
  acc *= 1. + m * 1.9;

  // дождь «вливается» сверху после входа в экран
  float rv = smoothstep(0., .35, uReveal * 1.35 - (1. - vUv.y));
  // яркие «головы» потоков гасим сильнее общего затемнения: они отвлекают от текста
  float dim2 = uDim * uDim;
  acc *= rv * mix(dim2, uDim, .55);

  // под текстом главного экрана дождь приглушён
  float mk = max(boxMask(frag, uMask0, 120. * uPx), boxMask(frag, uMask1, 120. * uPx));
  acc *= 1. - .82 * mk * uMaskK;

  // и под текстовыми блоками остальных разделов
  float mk2 = 0.;
  for (int i = 0; i < 6; i++) {
    if (i >= uMaskN) break;
    mk2 = max(mk2, boxMask(frag, uMasks[i], 80. * uPx));
  }
  acc *= 1. - .88 * mk2;

  // тёплый сбой при низком здоровье
  acc.rg += acc.g * bad * vec2(.28, .0);

  vec3 col = uBg + acc + uFlash * vec3(.10, .30, .16);
  col += (h21(frag + uTime) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

/** Атлас: слева «0», справа «1». Каналом покрытия служит альфа. */
function makeAtlas(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 104px "JetBrains Mono", ui-monospace, Menlo, monospace';
  g.fillText('0', 64, 70);
  g.fillText('1', 192, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}

export class Rain {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private atlas: CanvasTexture;
  /** интегрируем время, чтобы скорость падения могла меняться без скачков */
  private t = 0;

  constructor() {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.atlas = makeAtlas();
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new Vector2(1, 1) },
        uPx: { value: 1 },
        uTime: { value: 0 },
        uHealth: { value: 0.12 },
        uDim: { value: 1 },
        uReveal: { value: 0 },
        uFlash: { value: 0 },
        uLite: { value: 0 },
        uCalm: { value: 0 },
        uMouse: { value: new Vector2(-1e5, -1e5) },
        uMask0: { value: new Vector4(0, 0, 0, 0) },
        uMask1: { value: new Vector4(0, 0, 0, 0) },
        uMaskK: { value: 1 },
        uMasks: { value: Array.from({ length: 6 }, () => new Vector4()) },
        uMaskN: { value: 0 },
        uBg: { value: new Color(0.008, 0.032, 0.02) },
        uAtlas: { value: this.atlas },
      },
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  get u() {
    return this.mat.uniforms;
  }

  resize(w: number, h: number, px: number) {
    this.mat.uniforms.uRes.value.set(w * px, h * px);
    this.mat.uniforms.uPx.value = px;
  }

  /** speed — множитель скорости (растёт со скоростью прокрутки) */
  step(dtMs: number, speed: number) {
    this.t += dtMs * 0.001 * speed;
    this.mat.uniforms.uTime.value = this.t;
  }

  setTime(t: number) {
    this.t = t;
    this.mat.uniforms.uTime.value = t;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.atlas.dispose();
  }
}
