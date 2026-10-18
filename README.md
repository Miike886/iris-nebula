# Iris Nebula

Experiencia artística local construida con Three.js y JavaScript. La fotografía se reconstruye en fragmentos, partículas y caracteres dentro de un espacio 3D. La cámara tiene posición y orientación independientes; rueda y pellizco trasladan la cámara, sin modificar el campo de visión.

## Iniciar

Requiere Node.js 20.11 o posterior. En PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

Abrir http://127.0.0.1:5173. En otras terminales se puede usar `npm` en lugar de `npm.cmd`.

La raíz debe contener **`Bajo la mirada cinemática.png`**. Es un recurso local privado, excluido mediante su nombre exacto en `.gitignore`: no está en el repositorio remoto. El programa recorta y muestrea la imagen en memoria; no mueve ni modifica el original. No hay CDN, fuentes externas, analítica ni subida de imágenes.

## Navegación

| Acción | Escritorio | Pantalla táctil |
| --- | --- | --- |
| Orientar la cámara | Arrastrar | Arrastrar con un dedo |
| Avanzar y retroceder | W/S, ↑/↓, rueda o −/+ | Pellizco, −/+ o cruceta |
| Desplazamiento lateral | A/D, ←/→ | Cruceta o arrastre con dos dedos |
| Subir y bajar | E/Q | Arrastre con dos dedos |
| Desplazarse por el plano de la cámara | Mayús + arrastre o botón derecho | Arrastre con dos dedos |
| Visitar una zona | Recorrer | Recorrer |
| Mezclar materiales | Deslizador de materia | Deslizador de materia |
| Restaurar cámara y materia | R o ↺ | ↺ |
| Pausa | Botón superior o espacio | Botón superior |

Para usar el teclado, enfocar la escena con un clic o Tab. El cursor desvía la materia y revela fragmentos; un toque inicia una onda. Las visitas pasan por los dos iris, una nube de caracteres y la cara posterior de la formación. Es posible interrumpir una visita moviendo la cámara manualmente.

## Movimiento y rendimiento

- `prefers-reduced-motion` inicia en pausa y elimina el suavizado de cámara y las visitas animadas. Reanudar es una elección explícita del visitante.
- La pausa detiene el reloj de los materiales y cancela una visita en curso. Navegación y mezcla siguen disponibles. Sin interacción, no mantiene un bucle de renderizado.
- Una sola geometría de puntos, fragmentos en una malla y texturas reutilizadas. Resolución limitada a 1.6× en escritorio y 1.35× en móvil; objetivos máximos de 45 y 30 fps respectivamente. No son garantías de rendimiento para cualquier dispositivo.
- La muestra y los filamentos son menos densos en móvil. Los materiales se animan en la GPU.
- La pestaña oculta y el diálogo de ayuda suspenden la escena. Si WebGL2 falta o se pierde el contexto, aparece la fotografía local y se ocultan los controles 3D.

## Validación

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run build
```

Las pruebas de navegador usan una instancia aislada y sin interfaz de Microsoft Edge instalado, en el puerto local 5174. Cubren navegación, orientación, rueda, gestos táctiles, cruceta, materiales, visitas, pausa, movimiento reducido, diálogo y fallback gráfico. Las capturas quedan en `test-results/`, ignorado por Git. La emulación táctil no sustituye las pruebas en un teléfono físico.

`build` genera `dist/` con Three.js y una copia local de la imagen. No publica ni transmite el resultado. El directorio completo se excluye de Git. Un clon nuevo necesita la fotografía original en la raíz antes de ejecutar o construir el sitio.

El servidor de desarrollo escucha únicamente en loopback. La revisión móvil automatizada utiliza emulación de viewport y eventos táctiles reales del motor del navegador; no expone la fotografía en la red local.
