import { access, mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
try {
  await access(resolve(root, 'Bajo la mirada cinemática.png'));
} catch {
  console.error('Falta la foto local: Bajo la mirada cinemática.png. Está excluida de Git; prepara el despliegue desde el equipo que tiene el original con npm run prepare:vercel.');
  process.exit(1);
}
await mkdir(dist, { recursive: true });
await rm(resolve(dist, 'src/flight.js'), { force: true });
for (const file of ['index.html', 'Bajo la mirada cinemática.png']) await copyFile(resolve(root, file), resolve(dist, file));
for (const dir of ['src', 'assets']) await cp(resolve(root, dir), resolve(dist, dir), { recursive: true });
await mkdir(resolve(dist, 'vendor'), { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) await copyFile(resolve(root, 'node_modules/three/build', file), resolve(dist, 'vendor', file));
await copyFile(resolve(root, 'node_modules/three/LICENSE'), resolve(dist, 'vendor/LICENSE'));
console.log('Sitio estático generado en dist/.');
