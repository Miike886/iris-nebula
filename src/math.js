export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const mix = (a, b, t) => a + (b - a) * t;
export function materialWeights(value) {
  const m = clamp(value, 0, 2);
  return { particles: Math.max(0, 1 - m), ascii: 1 - Math.abs(m - 1), photo: Math.max(0, m - 1) };
}
export function zoomAt(camera, nextZoom, anchor, center) {
  const zoom = clamp(nextZoom, .65, 4.5);
  const ratio = zoom / camera.zoom;
  return { zoom, x: anchor.x - center.x - (anchor.x - center.x - camera.x) * ratio,
    y: anchor.y - center.y - (anchor.y - center.y - camera.y) * ratio };
}
export function randomGenerator(seed = 73) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
