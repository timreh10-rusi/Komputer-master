// Генерирует src/gl/landmask.ts: битовую маску суши 240×120 (1,5° на пиксель) из Natural Earth (пакет world-atlas).
// Запуск: node scripts/make-landmask.mjs   (нужен один раз; результат лежит в репозитории)
import fs from 'node:fs';
import path from 'node:path';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
import land from 'world-atlas/land-110m.json' with { type: 'json' };

const W = 240;
const H = 120;
const f = feature(land, land.objects.land);
const bytes = new Uint8Array((W * H) / 8);
let count = 0;
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) * 180) / H;
  for (let x = 0; x < W; x++) {
    const lon = -180 + ((x + 0.5) * 360) / W;
    if (geoContains(f, [lon, lat])) {
      const i = y * W + x;
      bytes[i >> 3] |= 1 << (i & 7);
      count++;
    }
  }
}
const b64 = Buffer.from(bytes).toString('base64');
const out = `// Сгенерировано scripts/make-landmask.mjs из Natural Earth (public domain). Не править вручную.
export const LAND_W = ${W};
export const LAND_H = ${H};
export const LAND_B64 = '${b64}';
`;
fs.writeFileSync(path.resolve(import.meta.dirname, '../src/gl/landmask.ts'), out);
console.log(`суша: ${count} из ${W * H} клеток (${((count / (W * H)) * 100).toFixed(1)}%), ${b64.length} байт base64`);
