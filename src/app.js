const $=id=>document.getElementById(id);
const canvas=$('universe'),matter=$('matter'),help=$('help');
let scene,failed=false;
// Some touch browsers suppress a compatibility click immediately after a drag.
// Handle a real, stationary touch release once; preserve native keyboard clicks.
function activate(button,action){
  let touch=null,lastTouch=-1000;
  button.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')touch={id:event.pointerId,x:event.clientX,y:event.clientY};});
  button.addEventListener('pointercancel',()=>{touch=null;});
  button.addEventListener('pointerup',event=>{
    if(!touch||touch.id!==event.pointerId)return;
    const moved=Math.hypot(event.clientX-touch.x,event.clientY-touch.y);touch=null;
    if(moved>10||button.disabled)return;
    event.preventDefault();lastTouch=performance.now();action();
  });
  button.addEventListener('click',event=>{if(event.detail>0&&performance.now()-lastTouch<600)return;action();});
}
const updateUI=state=>{
  matter.value=Math.round(state.material*100);matter.style.setProperty('--progress',`${state.material*50}%`);
  const label=state.material===0?'Imagen':state.material===1?'Partículas':state.material===2?'ASCII':state.material<1?'Disolución':'Caracteres';
  $('matter-label').textContent=label;matter.setAttribute('aria-valuetext',`${label}, ${Math.round(state.material*50)} por ciento de transformación`);
  $('pause').setAttribute('aria-pressed',String(state.paused));$('pause').setAttribute('aria-label',state.paused?'Reanudar movimiento':'Pausar movimiento');
  $('pause-label').textContent=state.paused?'Reanudar':'Pausar';$('pause-icon').textContent=state.paused?'▷':'Ⅱ';
  document.querySelectorAll('[data-focus]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.focus)===state.focus)));
  $('signature').setAttribute('aria-pressed',String(state.signature));
  $('signature-toggle').setAttribute('aria-pressed',String(state.signature));
  $('reveal').setAttribute('aria-pressed',String(state.reveal));
  $('wave').disabled=state.paused;$('wave').title=state.paused?'Reanuda el movimiento para lanzar ondas':'Propagar una onda';
  document.body.classList.toggle('reveal-active',state.reveal);
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
activate($('forward'),()=>scene?.zoom(.85));activate($('back'),()=>scene?.zoom(1/.85));
activate($('reset'),()=>{scene?.reset();$('announcement').textContent='Encuadre y materia iniciales restaurados.';});
activate($('pause'),()=>scene?.setPaused(!scene.paused));
const toggleSignature=()=>{scene?.toggleSignature();$('announcement').textContent=scene?.signatureTarget?'Berenice y un corazón aparecen como una constelación de partículas.':'La constelación vuelve al polvo.';};
activate($('signature'),toggleSignature);activate($('signature-toggle'),toggleSignature);
activate($('reveal'),()=>{scene?.toggleReveal();$('announcement').textContent=scene?.revealPinned?'Revelado activo. Mueve el cursor o arrastra un dedo. Desactiva Revelar para orbitar.':'Revelado desactivado. Arrastra para orbitar.';});
activate($('wave'),()=>scene?.emitWave());
document.querySelectorAll('[data-focus]').forEach(button=>activate(button,()=>{scene?.activate(Number(button.dataset.focus));$('announcement').textContent=button.getAttribute('aria-pressed')==='true'?button.getAttribute('aria-label'):'Transformación local cerrada.';}));
const dismissHint=()=>document.body.classList.add('exploring');
canvas.addEventListener('pointerdown',dismissHint,{once:true});canvas.addEventListener('wheel',dismissHint,{once:true,passive:true});canvas.addEventListener('keydown',dismissHint,{once:true});
activate($('help-open'),()=>{scene?.suspend(true);help.showModal();});
help.addEventListener('close',()=>{if(!failed)scene?.suspend(false);});activate($('help-close'),()=>help.close());
activate($('help-start'),()=>{help.close();canvas.focus({preventScroll:true});});
help.addEventListener('click',event=>{if(event.target!==help)return;const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)help.close();});
window.addEventListener('pagehide',()=>scene?.suspend(true));window.addEventListener('pageshow',()=>{if(!failed)scene?.suspend(false);});
export {scene};
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-navigation'),{passive:true});
document.addEventListener('keydown',event=>{if(event.key==='Tab')document.body.classList.add('keyboard-navigation');});
