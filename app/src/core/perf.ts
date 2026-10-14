import { Q } from './quality';

/** Панель производительности для проверки на реальном телефоне: открыть сайт с ?perf */
export interface GLInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

const N = 180;
const ring = new Float32Array(N);
let head = 0;
let filled = 0;
let jsMs = 0;

export const frame = {
  push(dt: number, cpu: number) {
    ring[head] = dt;
    head = (head + 1) % N;
    filled = Math.min(N, filled + 1);
    jsMs += (cpu - jsMs) * 0.1;
  },
};

export function initPerfPanel(getGL: () => GLInfo | null) {
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:9999;margin:0;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.78);color:#b6ffd0;font:11px/1.45 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  const tmp = new Float32Array(N);
  setInterval(() => {
    if (!filled) return;
    tmp.set(ring);
    const arr = tmp.subarray(0, filled).sort();
    const avg = arr.reduce((a, b) => a + b, 0) / filled;
    const p95 = arr[Math.min(filled - 1, Math.floor(filled * 0.95))];
    const gl = getGL();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    el.textContent =
      `FPS ${(1000 / avg).toFixed(0)}  кадр ${avg.toFixed(1)} мс  p95 ${p95.toFixed(1)} мс\n` +
      `JS ${jsMs.toFixed(2)} мс  уровень ${Q.tier}/${Q.maxTier}  DPR≤${Q.maxDpr}\n` +
      (gl ? `draw ${gl.calls}  треуг. ${gl.triangles}  геом ${gl.geometries}  текст ${gl.textures}  прог ${gl.programs}\n` : '') +
      (mem ? `heap ${(mem.usedJSHeapSize / 1048576).toFixed(1)} МБ` : '');
  }, 500);
}
