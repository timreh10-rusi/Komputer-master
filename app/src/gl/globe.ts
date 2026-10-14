import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { LAND_B64, LAND_H, LAND_W } from './landmask';

/**
 * Глобус «Удалённо — значит везде»: точечная суша (маска из Natural Earth), свечение атмосферы,
 * дуги-сигналы из Новороссийска в Ростов-на-Дону и Германию — города из отзывов клиентов.
 * Радиус 1; положение и масштаб задаёт сцена.
 */
const DEG = Math.PI / 180;

export const CITIES = {
  nvr: { name: 'Новороссийск, Анапа', lat: 44.72, lon: 37.77 },
  rnd: { name: 'Ростов-на-Дону', lat: 47.23, lon: 39.72 },
  de: { name: 'Германия', lat: 51.0, lon: 10.0 },
} as const;
export type CityKey = keyof typeof CITIES;

const latLon = (lat: number, lon: number, r = 1, out = new Vector3()) => {
  const la = lat * DEG;
  const lo = lon * DEG;
  return out.set(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
};

let landBits: Uint8Array | null = null;
const isLand = (lat: number, lon: number) => {
  if (!landBits) landBits = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0));
  const x = Math.min(LAND_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * LAND_W)));
  const y = Math.min(LAND_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LAND_H)));
  const i = y * LAND_W + x;
  return (landBits[i >> 3] & (1 << (i & 7))) !== 0;
};

const DOT_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uSize;
varying float vFace;
varying float vTw;
varying float vSeed;
void main(){
  vSeed = aSeed;
  vec4 wp = modelMatrix * vec4(position, 1.);
  vec3 n = normalize(mat3(modelMatrix) * position);
  vec3 v = normalize(cameraPosition - wp.xyz);
  vFace = dot(n, v);
  vec4 mv = viewMatrix * wp;
  vTw = .78 + .22 * sin(uTime * 1.3 + aSeed * 40.);
  gl_PointSize = max(1., uSize * uScale / -mv.z * vTw);
  gl_Position = projectionMatrix * mv;
}`;
const DOT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying float vFace;
varying float vTw;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float a = smoothstep(1., .2, d) * smoothstep(-.02, .32, vFace);
  gl_FragColor = vec4(uColor * (.5 + .6 * vFace) * vTw, a * .95);
}`;

const MARK_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
varying float vFace;
varying float vSeed;
void main(){
  float r = length(gl_PointCoord - .5) * 2.;
  float core = smoothstep(.3, .14, r);
  float t = fract(uTime * .45 + vSeed * 2.7);
  float ring = smoothstep(.14, 0., abs(r - t)) * (1. - t);
  float a = (core + ring * .9) * smoothstep(-.05, .3, vFace);
  gl_FragColor = vec4(mix(uColor, vec3(1.), core * .5) * a, a);
}`;

const BALL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BALL_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vV;
void main(){
  float f = pow(1. - max(dot(vN, vV), 0.), 2.6);
  vec3 col = vec3(.008, .05, .03) + f * vec3(.04, .55, .28);
  gl_FragColor = vec4(col, 1.);
}`;
const ATMO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
void main(){
  float c = -dot(vN, vV);
  float i = pow(smoothstep(0., .5, c), 3.2);
  gl_FragColor = vec4(uColor * i * .55, i * .6);
}`;
const ARC_VERT = /* glsl */ `
varying float vT;
void main(){
  vT = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;
const ARC_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
uniform float uOff;
varying float vT;
void main(){
  float head = fract(uTime * .2 + uOff);
  float d = abs(vT - head);
  d = min(d, 1. - d);
  float pulse = smoothstep(.1, 0., d);
  float base = .55 * sin(vT * 3.14159);
  float a = base + pulse;
  gl_FragColor = vec4(uColor * (base + pulse * 1.8), a);
}`;

export class Globe {
  /** корень: положение и масштаб задаёт сцена */
  readonly group = new Group();
  private tilt = new Group();
  private spin = new Group();
  private dotMat: ShaderMaterial;
  private markMat: ShaderMaterial;
  private arcMats: ShaderMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private markers = new Map<CityKey, Vector3>();
  private yaw = 0;
  private _v = new Vector3();
  private _w = new Vector3();

  constructor(lite: boolean) {
    this.group.add(this.tilt);
    this.tilt.add(this.spin);
    this.tilt.rotation.x = 0.84; // северное полушарие к зрителю

    // суша: точки по спирали Фибоначчи, оставляем только попадающие в маску
    const N = lite ? 7000 : 13000;
    const pos: number[] = [];
    const seed: number[] = [];
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const phi = i * g;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      const lat = Math.asin(y) / DEG;
      const lon = Math.atan2(-z, x) / DEG;
      if (!isLand(lat, lon)) continue;
      pos.push(x, y, z);
      seed.push(Math.random());
    }
    const dotGeo = new BufferGeometry();
    dotGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    dotGeo.setAttribute('aSeed', new BufferAttribute(new Float32Array(seed), 1));
    this.dotMat = new ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uSize: { value: lite ? 0.026 : 0.02 }, uColor: { value: new Color(0.35, 1, 0.55) } },
    });
    const dots = new Points(dotGeo, this.dotMat);
    dots.frustumCulled = false;
    this.spin.add(dots);
    this.disposables.push(dotGeo, this.dotMat);

    // шар (закрывает заднюю сторону) и свечение атмосферы
    const ballGeo = new SphereGeometry(0.985, 48, 32);
    const ballMat = new ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: BALL_FRAG });
    this.group.add(new Mesh(ballGeo, ballMat));
    // свечение не должно вращаться вместе с наклоном: кладём в group
    const atmoGeo = new SphereGeometry(1.13, 40, 28);
    const atmoMat = new ShaderMaterial({
      vertexShader: BALL_VERT,
      fragmentShader: ATMO_FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color(0.24, 0.86, 0.43) } },
    });
    this.group.add(new Mesh(atmoGeo, atmoMat));
    this.disposables.push(ballGeo, ballMat, atmoGeo, atmoMat);

    // города и дуги
    const keys = Object.keys(CITIES) as CityKey[];
    const markPos: number[] = [];
    const markSeed: number[] = [];
    keys.forEach((k, i) => {
      const p = latLon(CITIES[k].lat, CITIES[k].lon, 1.002);
      this.markers.set(k, p);
      markPos.push(p.x, p.y, p.z);
      markSeed.push(i * 0.37);
    });
    const markGeo = new BufferGeometry();
    markGeo.setAttribute('position', new BufferAttribute(new Float32Array(markPos), 3));
    markGeo.setAttribute('aSeed', new BufferAttribute(new Float32Array(markSeed), 1));
    this.markMat = new ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: MARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uSize: { value: 0.16 }, uColor: { value: new Color(0.78, 1, 0.24) } },
    });
    const marks = new Points(markGeo, this.markMat);
    marks.frustumCulled = false;
    this.spin.add(marks);
    this.disposables.push(markGeo, this.markMat);

    const from = this.markers.get('nvr')!;
    (['rnd', 'de'] as CityKey[]).forEach((k, idx) => {
      const to = this.markers.get(k)!;
      const ang = from.angleTo(to);
      const pts: Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const sin = Math.sin(ang);
        const a = Math.sin((1 - t) * ang) / sin;
        const b = Math.sin(t * ang) / sin;
        const p = new Vector3().addScaledVector(from, a).addScaledVector(to, b).normalize();
        p.multiplyScalar(1.002 + Math.sin(Math.PI * t) * Math.min(0.5, 0.18 + ang * 0.5));
        pts.push(p);
      }
      const geo = new TubeGeometry(new CatmullRomCurve3(pts), 64, 0.012, 6, false);
      const mat = new ShaderMaterial({
        vertexShader: ARC_VERT,
        fragmentShader: ARC_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOff: { value: idx * 0.45 }, uColor: { value: new Color(0.78, 1, 0.24) } },
      });
      this.arcMats.push(mat);
      this.spin.add(new Mesh(geo, mat));
      this.disposables.push(geo, mat);
    });
    this.yaw = this.centerYaw();
    this.spin.rotation.y = this.yaw;
  }

  /** Поворот вокруг Y, при котором между Германией и Россией лежит центр вида. */
  private centerYaw() {
    const lon = (CITIES.nvr.lon + CITIES.de.lon) / 2;
    return -Math.PI / 2 - lon * DEG;
  }

  /** scalePx — масштаб «мировая единица → пиксель на единицу расстояния» для размера точек */
  update(timeSec: number, scalePx: number, parallax: number) {
    this.dotMat.uniforms.uTime.value = timeSec;
    this.markMat.uniforms.uTime.value = timeSec;
    this.dotMat.uniforms.uScale.value = scalePx;
    this.markMat.uniforms.uScale.value = scalePx;
    for (const m of this.arcMats) m.uniforms.uTime.value = timeSec;
    // медленное покачивание вокруг центра вида, чтобы суша «жила»
    this.spin.rotation.y = this.yaw + Math.sin(timeSec * 0.18) * 0.22 + parallax * 0.18;
  }

  /** Экранные координаты города (в CSS-пикселях окна) и «смотрит ли он на нас». */
  project(key: CityKey, cam: PerspectiveCamera, W: number, H: number, out: { x: number; y: number; front: boolean }) {
    const p = this.markers.get(key)!;
    this._v.copy(p);
    this.spin.localToWorld(this._v);
    this._w.copy(this._v).project(cam);
    out.x = (this._w.x * 0.5 + 0.5) * W;
    out.y = (-this._w.y * 0.5 + 0.5) * H;
    // лицевая сторона: нормаль в точке против направления на камеру
    const n = this._v.clone().sub(this.group.position).normalize();
    const v = cam.position.clone().sub(this._v).normalize();
    out.front = n.dot(v) > 0.12;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
