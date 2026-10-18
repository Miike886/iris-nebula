import { mkdir, copyFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'Bajo la mirada cinemática.png']) await copyFile(resolve(root, file), resolve(dist, file));
for (const dir of ['src', 'assets']) await cp(resolve(root, dir), resolve(dist, dir), { recursive: true });
console.log('Sitio estático generado en dist/.');
