/**
 * Быстрая проверка видеокарты без загрузки Three.js и без блокировки страницы.
 * Программная отрисовка (SwiftShader, llvmpipe и т.п.) тянет 3D-сцену на 5–10 кадров в секунду,
 * поэтому там включаем лёгкую версию: те же тексты и вёрстка, ноутбук — готовая картинка.
 * Создание WebGL-контекста на таких системах стоит секунду и больше, поэтому проверяем в worker.
 */
export type GpuState = 'ok' | 'software' | 'none';

const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;

function probeMain(): GpuState {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    // без контекста: либо WebGL нет вовсе, либо браузер счёл отрисовку программной
    if (!gl) return 'software';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return SOFT.test(name) ? 'software' : 'ok';
  } catch {
    return 'none';
  }
}

const WORKER_SRC = `onmessage=function(){try{
  var c=new OffscreenCanvas(1,1);
  var gl=c.getContext('webgl2',{failIfMajorPerformanceCaveat:true});
  if(!gl){var g2=new OffscreenCanvas(1,1).getContext('webgl2');postMessage(g2?'software':'unsupported');return}
  var e=gl.getExtension('WEBGL_debug_renderer_info');
  var n=String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'');
  postMessage(${SOFT}.test(n)?'software':'ok')
}catch(x){postMessage('error')}}`;

export function probeGL(): Promise<GpuState> {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof Blob === 'undefined') return resolve(probeMain());
    let url = '';
    let worker: Worker | null = null;
    let settled = false;
    const done = (v: GpuState) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(v);
    };
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url);
      // 'unsupported' — в worker нет WebGL (старый Safari): проверяем на главном потоке
      worker.onmessage = (e) => done(e.data === 'ok' ? 'ok' : e.data === 'software' ? 'software' : probeMain());
      worker.onerror = () => done(probeMain());
      worker.postMessage(0);
      // очень медленная инициализация: не держим страницу, пробуем полную версию (регулятор качества подстрахует)
      setTimeout(() => done('ok'), 2500);
    } catch {
      done(probeMain());
    }
  });
}
