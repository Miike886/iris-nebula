import { copyFile, mkdir, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Explicit allowlist: build logs, tests, credentials and unrelated files never
// enter the deployment, even if they accidentally appear inside dist/.
export const deploymentFiles = [
  'index.html', 'Bajo la mirada cinemática.png', 'assets/iris.svg',
  'src/app.js', 'src/scene.js', 'src/shaders.js', 'src/orbit.js', 'src/math.js', 'src/style.css',
  'vendor/three.module.js', 'vendor/three.core.js', 'vendor/LICENSE'
];

export async function prepareVercel(root) {
  root = resolve(root);
  const dist = resolve(root, 'dist');
  const output = resolve(root, '.vercel/output');
  const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
  // Validate all source assets before replacing a previously prepared output.
  for (const file of deploymentFiles) {
    const source = resolve(dist, file);
    const info = await lstat(source).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`Falta un archivo de compilación válido: ${file}. Ejecuta npm run build con la foto local disponible.`);
  }
  await mkdir(resolve(root, '.vercel'), { recursive: true });
  // Only this generated directory may be removed; never the project link or root.
  if (relative(root, output) !== ['.vercel', 'output'].join(sep)) throw new Error('Ruta de salida no válida.');
  for (const directory of [resolve(root, '.vercel'), output]) {
    const info = await lstat(directory).catch(() => null);
    if (info?.isSymbolicLink()) throw new Error('La salida de Vercel no puede ser un enlace simbólico.');
  }
  await rm(output, { recursive: true, force: true });
  const staticDir = resolve(output, 'static');
  for (const file of deploymentFiles) {
    const destination = resolve(staticDir, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(dist, file), destination);
  }
  // Reuse the same headers for source builds and prebuilt deployments.
  const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
  const buildOutput = {
    version: 3,
    routes: [
      { src: '/(.*)', headers, continue: true },
      { src: '/', dest: '/index.html' },
      { handle: 'filesystem' }
    ]
  };
  await writeFile(resolve(output, 'config.json'), `${JSON.stringify(buildOutput, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await prepareVercel(resolve(import.meta.dirname, '..'));
    console.log(`Paquete local listo en .vercel/output/ (${deploymentFiles.length} archivos estáticos).`);
    console.log('No se ha subido nada. Incluye una copia de la foto; el original y el enlace del proyecto se conservan.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
