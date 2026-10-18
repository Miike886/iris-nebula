# Desplegar Iris Nebula en Vercel

El sitio es estático: no necesita backend ni variables de entorno. La configuración usa el preset **Other**, `npm run build` y el directorio `dist`.

La foto original permanece en la raíz, sin modificaciones y excluida de Git. Como un clon de GitHub no contiene esa foto, el flujo preparado consiste en compilar en este equipo y desplegar el paquete local con `--prebuilt`.

## Preparar y revisar, sin subir archivos

Desde la raíz del proyecto en PowerShell:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run test:deploy
npm.cmd run preview:vercel
```

`test:deploy` compila, genera `.vercel/output/` y abre un navegador automatizado contra ese paquete, únicamente en loopback. Para generar el paquete sin pruebas, usa `npm.cmd run prepare:vercel`.

La vista previa manual está en **http://127.0.0.1:4173**. Comprueba el estado inicial, órbita, zoom, revelado al mantener pulsado, estrella de Bere y pausa.

El paquete contiene 12 archivos estáticos: HTML, JavaScript, CSS, icono, Three.js y su licencia, y una copia de la foto. `.vercel/output/config.json` añade las rutas y cabeceras. Solo se empaquetan los archivos permitidos; un paquete anterior se reemplaza sin borrar `.vercel/project.json`.

## Vincular Vercel

Cuando vayas a desplegar, inicia sesión y elige la cuenta/equipo y el proyecto:

```powershell
npx.cmd vercel@latest login
npx.cmd vercel@latest link
```

Selecciona el directorio actual (`./`) y el proyecto deseado. No es necesario conectar GitHub para este flujo. `.vercel/` y los archivos `.env*` están excluidos de Git; no añadas tokens al repositorio.

## Crear un despliegue de prueba

Estos comandos sí suben los archivos del sitio a Vercel:

```powershell
npm.cmd run prepare:vercel
npx.cmd vercel@latest deploy --prebuilt
```

La copia de la fotografía se servirá como un recurso de la web y podrá descargarla quien tenga acceso al despliegue. Que el original esté en `.gitignore` evita versionarlo, pero no convierte el recurso publicado en privado. Revisa la protección de acceso del proyecto según quién deba visitar la vista previa.

Abre la URL que devuelve Vercel y comprueba la escena también en un teléfono físico. La prueba local valida el paquete y sus cabeceras, pero no sustituye la comprobación del alojamiento, la cuenta ni el dominio real.

## Publicar en producción

Después de revisar la vista previa:

```powershell
npm.cmd run prepare:vercel
npx.cmd vercel@latest deploy --prebuilt --prod
```

Para cada actualización, vuelve a generar el paquete desde la rama/commit que quieras publicar. No uses `vercel deploy` sin `--prebuilt` ni la compilación automática desde GitHub con este flujo: la foto no está en Git y esa compilación carecería del recurso.

## Detalles de configuración

- `vercel.json`: preset, compilación, salida y cabeceras de seguridad/caché.
- `scripts/prepare-vercel.mjs`: genera la estructura Build Output API v3 sin acceder a la red.
- Las rutas inexistentes conservan su 404; no se redirigen todas las peticiones al HTML.
- JavaScript y CSS no tienen nombres con hash: se revalidan para evitar conservar versiones antiguas.
- La política CSP permite los recursos locales de la escena y bloquea scripts externos, incluida la barra de herramientas inyectada por Vercel. La experiencia no depende de esa barra.
- Si falta la foto, la compilación se detiene con un mensaje explícito.

Referencias oficiales: [despliegue de archivos precompilados](https://vercel.com/docs/cli/deploying-from-cli#deploying-from-local-build-prebuilt), [Build Output API v3](https://vercel.com/docs/build-output-api/configuration), [configuración de Vercel](https://vercel.com/docs/project-configuration/vercel-json).
