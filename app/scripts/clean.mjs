// Перед сборкой убираем прошлые хэшированные файлы из корня репозитория (папка assets),
// чтобы там не копился мусор. Видео, постер и остальное не трогаем.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..', '..');
const assets = path.join(repo, 'assets');
if (fs.existsSync(assets)) {
  fs.rmSync(assets, { recursive: true, force: true });
  console.log('очищено:', assets);
}
