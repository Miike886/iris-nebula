const $=id=>document.getElementById(id);
const canvas=$('universe'),matter=$('matter'),help=$('help');
let scene,failed=false;
const updateUI=state=>{
  matter.value=Math.round(state.material*100);matter.style.setProperty('--progress',`${state.material*50}%`);
  const label=state.material===0?'Imagen':state.material===1?'Partículas':state.material===2?'ASCII':state.material<1?'Disolución':'Caracteres';
  $('matter-label').textContent=label;matter.setAttribute('aria-valuetext',`${label}, ${Math.round(state.material*50)} por ciento de transformación`);
  $('pause').setAttribute('aria-pressed',String(state.paused));$('pause').setAttribute('aria-label',state.paused?'Reanudar movimiento':'Pausar movimiento');
  $('pause-label').textContent=state.paused?'Reanudar':'Pausar';$('pause-icon').textContent=state.paused?'▷':'Ⅱ';
  document.querySelectorAll('[data-focus]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.focus)===state.focus)));
};
function fallback(message){
  if(failed)return;failed=true;scene?.destroy();canvas.hidden=true;$('fallback').hidden=false;$('loading').hidden=true;document.body.classList.add('fallback');
  $('fallback-message').textContent=message||'Vista fotográfica. La exploración 3D no está disponible en este navegador.';
  document.querySelectorAll('.tools button,.tools input,.hotspot,#pause').forEach(el=>el.disabled=true);document.body.dataset.renderer='fallback';
}
try{
  const {IrisScene}=await import('./scene.js');
  scene=new IrisScene(canvas,updateUI,()=>fallback('Se perdió la conexión gráfica. Recarga para volver a explorar.'));
  await scene.load(new URL('../Bajo la mirada cinemática.png',import.meta.url).href);
  if(!failed){$('loading').hidden=true;document.body.dataset.renderer='webgl';scene.notify();}
}catch(error){console.error('Iris Nebula:',error);fallback();}
matter.addEventListener('input',()=>scene?.setMaterial(Number(matter.value)/100));
$('forward').addEventListener('click',()=>scene?.zoom(.85));$('back').addEventListener('click',()=>scene?.zoom(1/.85));
$('reset').addEventListener('click',()=>{scene?.reset();$('announcement').textContent='Encuadre e imagen iniciales restaurados.';});
$('pause').addEventListener('click',()=>scene?.setPaused(!scene.paused));
document.querySelectorAll('[data-focus]').forEach(button=>button.addEventListener('click',()=>{scene?.activate(Number(button.dataset.focus));$('announcement').textContent=button.getAttribute('aria-pressed')==='true'?button.getAttribute('aria-label'):'Transformación local cerrada.';}));
const dismissHint=()=>document.body.classList.add('exploring');
canvas.addEventListener('pointerdown',dismissHint,{once:true});canvas.addEventListener('wheel',dismissHint,{once:true,passive:true});canvas.addEventListener('keydown',dismissHint,{once:true});
$('help-open').addEventListener('click',()=>{scene?.suspend(true);help.showModal();});
help.addEventListener('close',()=>{if(!failed)scene?.suspend(false);});$('help-close').addEventListener('click',()=>help.close());
$('help-start').addEventListener('click',()=>{help.close();canvas.focus({preventScroll:true});});
help.addEventListener('click',event=>{if(event.target!==help)return;const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)help.close();});
window.addEventListener('pagehide',()=>scene?.suspend(true));window.addEventListener('pageshow',()=>{if(!failed)scene?.suspend(false);});
export {scene};
