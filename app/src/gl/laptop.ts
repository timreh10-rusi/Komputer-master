import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TerminalScreen } from './screen';
import { Q } from '../core/quality';

/** Размеры в условных единицах: ширина основания 3.2 */
export const DIM = { W: 3.2, D: 2.2, H: 0.115, LT: 0.07, LH: 2.2, SW: 3.0, SH: 1.875, BZ: 0.155 };
export const OPEN_ANGLE = 1.86; // ≈ 106°

interface KeyDef {
  x: number;
  z: number;
  w: number;
  d: number;
  ch?: string;
}

/** Раскладка клавиатуры ноутбука: ряды в «юнитах» ширины. Буквы ЙЦУКЕН нужны для подсветки при наборе заголовка. */
function buildKeys(): KeyDef[] {
  const rows: Array<{ units: number[]; depth: number; chars?: Array<string | undefined> }> = [
    { units: Array(14).fill(1), depth: 0.55 },
    { units: [...Array(13).fill(1), 1.5], depth: 1 },
    { units: [1.5, ...Array(12).fill(1), 1], depth: 1, chars: [undefined, ...'ЙЦУКЕНГШЩЗХЪ'.split(''), undefined] },
    { units: [1.75, ...Array(11).fill(1), 1.75], depth: 1, chars: [undefined, ...'ФЫВАПРОЛДЖЭ'.split(''), undefined] },
    { units: [2.25, ...Array(10).fill(1), 2.25], depth: 1, chars: [undefined, ...'ЯЧСМИТЬБЮ'.split(''), '.', undefined] },
    { units: [1.25, 1.25, 1.25, 1.25, 5, 1.25, 1.25, 1, 1], depth: 1, chars: [undefined, undefined, undefined, undefined, ' '] },
  ];
  const total = 2.9;
  const gap = 0.024;
  const pitch = 0.2;
  const out: KeyDef[] = [];
  let z = -DIM.D / 2 + 0.2;
  for (const row of rows) {
    const sum = row.units.reduce((a, b) => a + b, 0);
    const unit = total / sum;
    const d = row.depth * pitch - gap;
    let x = -total / 2;
    row.units.forEach((u, i) => {
      const w = u * unit - gap;
      out.push({ x: x + (u * unit) / 2, z: z + d / 2, w, d, ch: row.chars?.[i] });
      x += u * unit;
    });
    z += row.depth * pitch + (row.depth < 1 ? 0.012 : 0);
  }
  return out;
}

function radialTexture(stops: Array<[number, string]>, size = 256): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function logoTexture(): CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const k = s / 32;
  g.scale(k, k);
  g.fillStyle = '#3DDC6E';
  g.beginPath();
  g.roundRect(0, 0, 32, 32, 9);
  g.fill();
  g.strokeStyle = '#032010';
  g.fillStyle = '#032010';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(7.5, 7.5, 17, 12.5, 2.2);
  g.stroke();
  g.lineWidth = 1.7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(11, 11.6);
  g.lineTo(13.5, 13.8);
  g.lineTo(11, 16);
  g.stroke();
  g.beginPath();
  g.roundRect(15, 15.2, 4.6, 1.8, 0.9);
  g.fill();
  g.beginPath();
  g.moveTo(4.5, 22.4);
  g.lineTo(27.5, 22.4);
  g.lineTo(25.8, 25);
  g.lineTo(6.2, 25);
  g.closePath();
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Laptop {
  /** корень: положение и масштаб задаёт сцена */
  readonly root = new Group();
  /** вращение пользователем (крутить мышью) */
  readonly tilt = new Group();
  /** содержимое, смещённое так, чтобы центр открытого ноутбука лежал в начале координат */
  readonly content = new Group();
  readonly lid = new Group();
  readonly screen: TerminalScreen;

  private screenMesh: Mesh;
  private keys: InstancedMesh;
  private keyGlow: InstancedMesh;
  private keyDefs: KeyDef[];
  private glow: Float32Array;
  private glowActive = false;
  private charIndex = new Map<string, number>();
  private color = new Color();
  private disposables: Array<{ dispose(): void }> = [];
  private metal: MeshStandardMaterial | MeshPhongMaterial;
  private keyMat: MeshStandardMaterial | MeshPhongMaterial;
  private floorGlow: Mesh;
  private shadowMesh: Mesh;
  private floorGlowMat: MeshBasicMaterial;
  private logoMat: MeshBasicMaterial;

  // для расчёта положения экрана
  private _p = new Vector3();
  private _q = new Quaternion();

  constructor() {
    const { W, D, H, LT, LH, SW, SH, BZ } = DIM;
    this.screen = new TerminalScreen(Q.tier <= 1);
    this.root.add(this.tilt);
    this.tilt.add(this.content);
    this.content.position.set(0, -0.86, 0.12);

    const lite = !Q.ibl;
    this.metal = lite
      ? new MeshPhongMaterial({ color: 0x2c3d35, specular: 0x8fc4a8, shininess: 90, emissive: 0x06100b })
      : new MeshStandardMaterial({ color: 0x1b2822, metalness: 0.86, roughness: 0.36 });
    this.keyMat = lite
      ? new MeshPhongMaterial({ color: 0x121f19, specular: 0x34604a, shininess: 40, emissive: 0x030806 })
      : new MeshStandardMaterial({ color: 0x0b1410, metalness: 0.2, roughness: 0.72, envMapIntensity: 0.22 });
    const dark = new MeshBasicMaterial({ color: 0x020604, toneMapped: false });
    const deck = new MeshBasicMaterial({ color: 0x050a07, toneMapped: false });

    const track = (g: BufferGeometry | Material) => {
      this.disposables.push(g);
      return g;
    };

    // основание
    const baseGeo = track(new RoundedBoxGeometry(W, H, D, 4, 0.045)) as BufferGeometry;
    const base = new Mesh(baseGeo, this.metal);
    base.position.y = H / 2;
    this.content.add(base);

    // ниша под клавиатуру и тачпад
    const wellGeo = track(new PlaneGeometry(3.04, 1.34)) as BufferGeometry;
    const well = new Mesh(wellGeo, deck);
    well.rotation.x = -Math.PI / 2;
    well.position.set(0, H + 0.0008, -0.43);
    this.content.add(well);

    const padGeo = track(new RoundedBoxGeometry(1.15, 0.014, 0.56, 2, 0.006)) as BufferGeometry;
    const pad = new Mesh(padGeo, this.metal);
    pad.position.set(0, H + 0.004, 0.74);
    this.content.add(pad);

    // шарнир
    const hingeGeo = track(new CylinderGeometry(0.05, 0.05, 2.9, 20)) as BufferGeometry;
    hingeGeo.rotateZ(Math.PI / 2);
    const hinge = new Mesh(hingeGeo, this.keyMat);
    hinge.position.set(0, H + 0.02, -D / 2 + 0.03);
    this.content.add(hinge);

    // клавиши: один InstancedMesh
    this.keyDefs = buildKeys();
    const n = this.keyDefs.length;
    const keyGeo = track(new RoundedBoxGeometry(1, 0.045, 1, 2, 0.018)) as BufferGeometry;
    this.keys = new InstancedMesh(keyGeo, this.keyMat, n);
    const glowGeo = track(new PlaneGeometry(1, 1)) as BufferGeometry;
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = track(
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    ) as MeshBasicMaterial;
    this.keyGlow = new InstancedMesh(glowGeo, glowMat, n);
    this.glow = new Float32Array(n);
    const m = new Matrix4();
    const keyTop = H + 0.0225 - 0.004;
    this.keyDefs.forEach((k, i) => {
      m.makeScale(k.w, 1, k.d).setPosition(k.x, keyTop, k.z);
      this.keys.setMatrixAt(i, m);
      m.makeScale(k.w * 0.78, 1, k.d * 0.74).setPosition(k.x, keyTop + 0.0235, k.z);
      this.keyGlow.setMatrixAt(i, m);
      this.keyGlow.setColorAt(i, this.color.setRGB(0.002, 0.01, 0.005));
      if (k.ch) this.charIndex.set(k.ch, i);
    });
    this.keys.instanceMatrix.needsUpdate = true;
    this.keyGlow.instanceMatrix.needsUpdate = true;
    this.keys.frustumCulled = false;
    this.keyGlow.frustumCulled = false;
    this.content.add(this.keys, this.keyGlow);

    // крышка с шарниром по задней кромке
    this.lid.position.set(0, H + 0.02, -D / 2 + 0.03);
    this.content.add(this.lid);
    const lidGeo = track(new RoundedBoxGeometry(W, LT, LH, 3, 0.035)) as BufferGeometry;
    const lidBody = new Mesh(lidGeo, this.metal);
    lidBody.position.set(0, LT / 2, LH / 2);
    this.lid.add(lidBody);

    const glassGeo = track(new PlaneGeometry(W - 0.07, LH - 0.07)) as BufferGeometry;
    const glass = new Mesh(glassGeo, dark);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, -0.0012, LH / 2);
    this.lid.add(glass);

    const screenGeo = track(new PlaneGeometry(SW, SH)) as BufferGeometry;
    const screenMat = track(new MeshBasicMaterial({ map: this.screen.texture, toneMapped: false })) as MeshBasicMaterial;
    this.screenMesh = new Mesh(screenGeo, screenMat);
    this.screenMesh.rotation.x = Math.PI / 2;
    this.screenMesh.position.set(0, -0.0024, BZ + SH / 2);
    this.lid.add(this.screenMesh);

    // камера и индикатор над экраном
    const camGeo = track(new CircleGeometry(0.016, 16)) as BufferGeometry;
    const cam = new Mesh(camGeo, new MeshBasicMaterial({ color: 0x0a1a2a, toneMapped: false }));
    cam.rotation.x = Math.PI / 2;
    cam.position.set(0, -0.003, LH - 0.08);
    this.lid.add(cam);
    const ledGeo = track(new CircleGeometry(0.007, 12)) as BufferGeometry;
    const led = new Mesh(ledGeo, new MeshBasicMaterial({ color: 0x6bf59a, toneMapped: false }));
    led.rotation.x = Math.PI / 2;
    led.position.set(0.07, -0.003, LH - 0.08);
    this.lid.add(led);

    // логотип на тыльной стороне крышки
    const logoGeo = track(new PlaneGeometry(0.52, 0.52)) as BufferGeometry;
    const logoTex = logoTexture();
    this.disposables.push(logoTex);
    this.logoMat = new MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false });
    this.disposables.push(this.logoMat);
    const logo = new Mesh(logoGeo, this.logoMat);
    logo.rotation.x = -Math.PI / 2;
    logo.position.set(0, LT + 0.0016, LH / 2 + 0.05);
    this.lid.add(logo);

    // свечение экрана на «столе»
    const gTex = radialTexture([
      [0, 'rgba(61,220,110,.55)'],
      [0.45, 'rgba(24,165,90,.18)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.disposables.push(gTex);
    this.floorGlowMat = new MeshBasicMaterial({ map: gTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
    this.disposables.push(this.floorGlowMat);
    const floorGeo = track(new PlaneGeometry(7, 5)) as BufferGeometry;
    this.floorGlow = new Mesh(floorGeo, this.floorGlowMat);
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.set(0, -0.02, 0.3);
    this.floorGlow.renderOrder = -1;
    this.content.add(this.floorGlow);

    // мягкая тень
    const sTex = radialTexture([
      [0, 'rgba(0,0,0,.75)'],
      [0.55, 'rgba(0,0,0,.28)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.disposables.push(sTex);
    const shadowMat = new MeshBasicMaterial({ map: sTex, transparent: true, depthWrite: false, toneMapped: false });
    this.disposables.push(shadowMat);
    const shadowGeo = track(new PlaneGeometry(5.4, 3.8)) as BufferGeometry;
    const shadow = new Mesh(shadowGeo, shadowMat);
    this.shadowMesh = shadow;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.012, 0.15);
    shadow.renderOrder = -2;
    this.content.add(shadow);

    this.setLid(0);
  }

  /** Режим съёмки картинки: без свечения и тени на «столе», они обрезались бы краем кадра. */
  posterMode() {
    this.floorGlow.visible = false;
    this.shadowMesh.visible = false;
  }

  /** v: 0 — закрыт, 1 — открыт (допускается небольшой перелёт для «пружины») */
  setLid(v: number) {
    this.lid.rotation.x = -OPEN_ANGLE * v;
    this.floorGlowMat.opacity = Math.max(0, Math.min(1, v)) * 0.9;
  }

  /** Подсвечивает клавишу при наборе. */
  press(ch: string) {
    const i = this.charIndex.get(ch.toUpperCase());
    const idx = i ?? (Math.random() * this.keyDefs.length) | 0;
    this.glow[idx] = 1;
    this.glowActive = true;
  }

  /** Гасит подсветку всех клавиш сразу (итоговый кадр без анимации). */
  resetGlow() {
    this.glow.fill(0);
    for (let i = 0; i < this.glow.length; i++) this.keyGlow.setColorAt(i, this.color.setRGB(0.002, 0.01, 0.005));
    if (this.keyGlow.instanceColor) this.keyGlow.instanceColor.needsUpdate = true;
    this.glowActive = false;
  }

  /** Вызывается каждый кадр: гасит подсветку клавиш и обновляет текстуру экрана. */
  update(dtMs: number) {
    if (this.glowActive) {
      const k = Math.exp(-dtMs / 200);
      let any = false;
      for (let i = 0; i < this.glow.length; i++) {
        let g = this.glow[i];
        if (g > 0.002) {
          g *= k;
          this.glow[i] = g;
          any = true;
        } else if (g !== 0) {
          this.glow[i] = g = 0;
        }
        this.keyGlow.setColorAt(i, this.color.setRGB(0.002 + g * 0.45, 0.01 + g * 0.9, 0.005 + g * 0.12));
      }
      this.keyGlow.instanceColor!.needsUpdate = true;
      this.glowActive = any;
    }
    this.screen.flush();
  }

  /** Положение и ориентация экрана в мировых координатах (для полёта камеры внутрь). */
  screenWorld(pos: Vector3, normal: Vector3, up: Vector3) {
    this.screenMesh.updateWorldMatrix(true, false);
    this.screenMesh.getWorldPosition(pos);
    this.screenMesh.getWorldQuaternion(this._q);
    normal.set(0, 0, 1).applyQuaternion(this._q).normalize();
    up.set(0, 1, 0).applyQuaternion(this._q).normalize();
    this._p.copy(pos);
  }

  /** Переключение материалов под уровень качества. */
  applyQuality() {
    if (this.metal instanceof MeshStandardMaterial) {
      this.metal.metalness = Q.ibl ? 0.86 : 0.45;
      this.metal.envMapIntensity = 1;
    }
  }

  dispose() {
    this.keys.dispose();
    this.keyGlow.dispose();
    this.screen.dispose();
    this.metal.dispose();
    this.keyMat.dispose();
    this.logoMat.map?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
