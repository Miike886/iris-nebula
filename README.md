# Iris Nebula

Experiencia artística local construida con Three.js y JavaScript. Una lente fotográfica curva, con dos capas posteriores, convierte los píxeles originales en polvo y caracteres. Los ojos son reconocibles desde la vista inicial. La cámara orbita alrededor del centro fijo de la imagen; rueda y pellizco modifican la distancia orbital.

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
| Orbitar alrededor de la imagen | Arrastrar o usar las flechas | Arrastrar con un dedo |
| Acercar y alejar | Rueda o −/+ | Pellizco o −/+ |
| Transformar un iris | Clic en uno de los dos puntos | Tocar uno de los dos puntos |
| Mezclar materiales | Deslizador de materia | Deslizador de materia |
| Restaurar cámara y materia | R o ↺ | ↺ |
| Pausa | Botón superior o espacio | Botón superior |

Para usar el teclado, enfocar la escena con un clic o Tab. El cursor ilumina y ondula la lente; un toque inicia una onda sobre la superficie. El punto izquierdo dispersa materia y el derecho revela caracteres. Cada variación local vuelve a la imagen tras seis segundos de animación, o al tocar otra vez el mismo punto. En pausa permanece hasta cerrarla o restablecer la vista.

El deslizador mezcla **imagen → partículas → ASCII**. El giro horizontal está limitado a ±70° y la inclinación a ±27.5°; el zoom queda entre 0.56 y 1.48 veces la distancia inicial. El amortiguamiento evita cambios bruscos y el encuadre se adapta al tamaño de pantalla sin perder el centro.

## Movimiento y rendimiento

- `prefers-reduced-motion` inicia en pausa y elimina las transiciones animadas. Reanudar es una elección explícita del visitante.
- La pausa detiene el reloj de los materiales y la inercia pendiente. Órbita, zoom y mezcla siguen disponibles. Sin interacción, no mantiene un bucle de renderizado.
- Una sola geometría de puntos, geometría curva compartida entre capas y texturas reutilizadas. Resolución limitada a 1.8× en escritorio y 1.5× en móvil; objetivos máximos de 60 y 30 fps respectivamente. No son garantías de rendimiento para cualquier dispositivo.
- La muestra es menos densa en móvil. Los materiales se animan en la GPU. El polvo y el halo se extraen de los colores y bordes de la foto; no hay una galaxia independiente de la imagen.
- La pestaña oculta y el diálogo de ayuda suspenden la escena. Si WebGL2 falta o se pierde el contexto, aparece la fotografía local y se ocultan los controles 3D.

## Validación

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run build
```

Las pruebas de navegador usan una instancia aislada y sin interfaz de Microsoft Edge instalado, en el puerto local 5174. Verifican el centro fijo y radio orbital, límites y retorno, rueda, gestos táctiles, activación de controles tras arrastrar, materiales, puntos locales, pausa, movimiento reducido, diálogo y fallback gráfico. Las capturas quedan en `test-results/`, ignorado por Git. La emulación táctil no sustituye las pruebas en un teléfono físico.

`build` genera `dist/` con Three.js y una copia local de la imagen. No publica ni transmite el resultado. El directorio completo se excluye de Git. Un clon nuevo necesita la fotografía original en la raíz antes de ejecutar o construir el sitio.

El servidor de desarrollo escucha únicamente en loopback. La revisión móvil automatizada utiliza emulación de viewport y eventos táctiles reales del motor del navegador; no expone la fotografía en la red local.
