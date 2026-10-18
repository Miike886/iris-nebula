const $=id=>document.getElementById(id);
const canvas=$('universe'),matter=$('matter'),help=$('help');
let scene,failed=false;
const updateUI=state=>{
  matter.value=Math.round(state.material*100);matter.style.setProperty('--progress',`${state.material*50}%`);
  const label=state.material===0?'Partículas':state.material===1?'ASCII':state.material===2?'Fotografía':state.material<1?'Partículas + ASCII':'ASCII + Foto';
  $('matter-label').textContent=label;matter.setAttribute('aria-valuetext',label);
  $('pause').setAttribute('aria-pressed',String(state.paused));$('pause').setAttribute('aria-label',state.paused?'Reanudar movimiento':'Pausar movimiento');
  $('pause-label').textContent=state.paused?'Reanudar':'Pausar';$('pause-icon').textContent=state.paused?'▷':'Ⅱ';
};
function fallback(message){
  if(failed)return;failed=true;scene?.destroy();canvas.hidden=true;$('fallback').hidden=false;$('loading').hidden=true;document.body.classList.add('fallback');
  $('fallback-message').textContent=message||'Vista fotográfica. WebGL no está disponible en este navegador.';
  document.querySelectorAll('.tools button,.tools input,.touch-pad button,#pause').forEach(el=>el.disabled=true);
  document.body.dataset.renderer='fallback';
}
try{
  const {IrisScene}=await import('./scene.js');
  scene=new IrisScene(canvas,updateUI,()=>fallback('Se perdió la conexión gráfica. Recarga para volver a explorar.'));
  await scene.load(new URL('../Bajo la mirada cinemática.png',import.meta.url).href);
  if(!failed){$('loading').hidden=true;document.body.dataset.renderer='webgl';updateUI({paused:scene.paused,material:scene.targetMaterial});}
}catch(error){console.error('Iris Nebula:',error);fallback();}
matter.addEventListener('input',()=>scene?.setMaterial(Number(matter.value)/100));
$('forward').addEventListener('click',()=>scene?.travel(2));$('back').addEventListener('click',()=>scene?.travel(-2));
$('visit').addEventListener('click',()=>{scene?.visit();$('announcement').textContent=`Explorando zona ${(scene?.zone??0)+1}.`;});
$('reset').addEventListener('click',()=>{scene?.reset();$('announcement').textContent='Vista inicial restaurada.';});
$('pause').addEventListener('click',()=>scene?.setPaused(!scene.paused));
for(const button of document.querySelectorAll('[data-move]')){
  let usedPointer=false;
  button.addEventListener('pointerdown',event=>{event.preventDefault();usedPointer=true;button.setPointerCapture(event.pointerId);scene?.hold(button.dataset.move,true);});
  const release=()=>scene?.hold(button.dataset.move,false);
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  button.addEventListener('click',()=>{if(usedPointer){usedPointer=false;return;}const d=button.dataset.move;scene?.flight.move(d==='right'?1:d==='left'?-1:0,0,d==='forward'?1:d==='back'?-1:0);scene?.invalidate();});
}
const dismissHint=()=>document.body.classList.add('exploring');
canvas.addEventListener('pointerdown',dismissHint,{once:true});canvas.addEventListener('wheel',dismissHint,{once:true,passive:true});canvas.addEventListener('keydown',dismissHint,{once:true});
$('help-open').addEventListener('click',()=>{scene?.suspend(true);help.showModal();});
help.addEventListener('close',()=>{if(!failed)scene?.suspend(false);});
$('help-close').addEventListener('click',()=>help.close());
$('help-start').addEventListener('click',()=>{help.close();canvas.focus({preventScroll:true});});
help.addEventListener('click',event=>{if(event.target!==help)return;const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)help.close();});
window.addEventListener('pagehide',()=>scene?.suspend(true));window.addEventListener('pageshow',()=>{if(!failed)scene?.suspend(false);});
export { scene };
