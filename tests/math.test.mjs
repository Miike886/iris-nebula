import test from 'node:test';
import assert from 'node:assert/strict';
import { materialWeights, zoomAt } from '../src/math.js';
test('la mezcla conserva la materia y transiciona de forma continua', () => {
  for (let m = 0; m <= 2; m += .01) {
    const w = materialWeights(m);
    assert.ok(Math.abs(w.particles + w.ascii + w.photo - 1) < 1e-10);
    assert.ok(Object.values(w).every(n => n >= 0 && n <= 1));
  }
  assert.deepEqual(materialWeights(1), { particles: 0, ascii: 1, photo: 0 });
});
test('el zoom mantiene el punto explorado bajo el cursor', () => {
  const camera = { x: 72, y: -30, zoom: 1.4 }, anchor = { x: 830, y: 330 }, center = { x: 600, y: 420 };
  const next = zoomAt(camera, 2.8, anchor, center);
  for (const axis of ['x', 'y']) {
    const before = (anchor[axis] - center[axis] - camera[axis]) / camera.zoom;
    const after = (anchor[axis] - center[axis] - next[axis]) / next.zoom;
    assert.ok(Math.abs(before - after) < 1e-10);
  }
});
test('los límites de escala mantienen la cámara válida', () => {
  const camera = { x: 0, y: 0, zoom: 1 }, point = { x: 0, y: 0 };
  assert.equal(zoomAt(camera, 100, point, point).zoom, 4.5);
  assert.equal(zoomAt(camera, .001, point, point).zoom, .65);
});
