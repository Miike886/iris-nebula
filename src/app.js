import { IrisScene } from './scene.js';

const $ = id => document.getElementById(id);
const canvas = $('universe'), matter = $('matter'), help = $('help');
let scene;
function updateUI(state) {
  matter.value = Math.round(state.material * 100);
  matter.style.setProperty('--progress', `${state.material * 50}%`);
  let label;
  if (state.material === 0) label = 'Partículas';
  else if (state.material === 1) label = 'ASCII';
  else if (state.material === 2) label = 'Fotografía';
  else label = state.material < 1 ? 'Partículas + ASCII' : 'ASCII + Fotografía';
  $('matter-label').textContent = label;
  const amount = Math.round((state.material % 1) * 100);
  matter.setAttribute('aria-valuetext', state.material % 1 === 0 ? label : `${label}, mezcla al ${amount} por ciento`);
  document.querySelectorAll('[data-material]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.material) === Number(matter.value) ? 'true' : 'false'));
  $('scale').innerHTML = `${state.zoom.toFixed(1)}<span>×</span>`;
  $('scale-name').textContent = state.zoom < 1.5 ? 'Campo' : state.zoom < 2.8 ? 'Fragmentos' : 'Detalle';
  $('zoom-in').disabled = state.zoom >= 4.5;
  $('zoom-out').disabled = state.zoom <= .65;
  $('pause').setAttribute('aria-pressed', String(state.paused));
  $('pause-label').textContent = state.paused ? 'Reanudar' : 'Pausar';
  $('pause-symbol').textContent = state.paused ? '▷' : 'Ⅱ';
  $('scene-status').textContent = state.paused ? 'EN PAUSA' : state.reduced ? 'MOVIMIENTO REDUCIDO' : 'CAMPO VIVO';
}

try {
  scene = new IrisScene(canvas, updateUI);
  await scene.load(new URL('../Bajo la mirada cinemática.png', import.meta.url).href);
  matter.addEventListener('input', () => scene.setMaterial(Number(matter.value) / 100));
  document.querySelectorAll('[data-material]').forEach(button => button.addEventListener('click', () => { scene.setMaterial(Number(button.dataset.material) / 100); $('announcement').textContent = `Materia: ${button.textContent.trim()}`; }));
  $('zoom-in').addEventListener('click', () => scene.zoom(1.25));
  $('zoom-out').addEventListener('click', () => scene.zoom(.8));
  $('reset').addEventListener('click', () => { scene.reset(); $('announcement').textContent = 'Vista inicial restaurada.'; });
  $('pause').addEventListener('click', () => scene.setPaused(!scene.paused));
  updateUI({ ...scene.target, paused: scene.paused, reduced: scene.reduced });
} catch (error) {
  scene?.destroy();
  canvas.hidden = true; $('fallback').hidden = false;
  $('scene-description').textContent = 'Vista fotográfica. La exploración interactiva no está disponible en este navegador.';
  $('scene-status').textContent = 'FOTOGRAFÍA';
  document.querySelectorAll('.control-dock button,.control-dock input,#pause').forEach(el => el.disabled = true);
  console.error('No se pudo iniciar Iris Nebula:', error);
}

$('help-open').addEventListener('click', () => help.showModal());
const closeHelp = () => { help.close(); $('help-open').focus(); };
$('help-close').addEventListener('click', closeHelp);
$('help-start').addEventListener('click', () => { help.close(); canvas.focus({ preventScroll: true }); });
help.addEventListener('click', event => { if (event.target === help) { const r = help.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeHelp(); } });
window.addEventListener('pagehide', () => scene?.destroy(), { once: true });
