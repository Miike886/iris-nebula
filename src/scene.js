import * as THREE from '../vendor/three.module.js';
import { Orbit } from './orbit.js';
import { clamp, randomGenerator } from './math.js';
import { surfaceVertex, surfaceFragment, fieldVertex, fieldFragment } from './shaders.js';

const lensHeight = (x,y) => 1.9*(1-(x/16)**2)+.45*(1-(y/5.2)**2);
const INITIAL_MATTER = 1.35;

export class IrisScene {
  constructor(canvas, onChange, onFailure) {
    this.canvas=canvas; this.onChange=onChange; this.onFailure=onFailure;
    this.mobile=matchMedia('(pointer: coarse)').matches||innerWidth<700;
    this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced=this.motionQuery.matches; this.paused=this.reduced;
    this.orbit=new Orbit(innerWidth/innerHeight);
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#080c0e');
    this.camera=new THREE.PerspectiveCamera(42,1,.1,220);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.mobile?1.5:1.8));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.debug.onShaderError=()=>{this.shaderError=true;};
    this.ray=new THREE.Raycaster(); this.pointer=new THREE.Vector2(5,5);
    this.pointerTarget=new THREE.Vector3(0,0,2);
    this.resources=[]; this.pointers=new Map();this.controller=new AbortController();
    this.time=0;this.material=INITIAL_MATTER;this.targetMaterial=INITIAL_MATTER;this.hover=0;
    this.frame=0;this.last=0;this.paint=0;this.ready=false;this.suspended=false;
    this.focusIndex=-1;this.focusTarget=0;this.focusUntil=0;
    this.hotspots=[new THREE.Vector3(-7.4,-1.65,lensHeight(-7.4,-1.65)+.18),new THREE.Vector3(7.3,-1.65,lensHeight(7.3,-1.65)+.18)];
    this.hotspotElements=[...document.querySelectorAll('[data-focus]')];
    this.bind();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  own(resource){this.resources.push(resource);return resource;}
  async load(url){
    const image=new Image();image.src=url;await image.decode();if(this.destroyed)return;
    // Only the in-memory crop is changed; the local original remains untouched.
    const probe=document.createElement('canvas');probe.width=120;probe.height=Math.round(image.height/image.width*120);
    const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,probe.width,probe.height);
    const data=ctx.getImageData(0,0,probe.width,probe.height).data;
    let top=probe.height,bottom=0;
    for(let y=0;y<probe.height;y++){
      let sum=0;for(let x=0;x<probe.width;x++){const k=(y*probe.width+x)*4;sum+=data[k]+data[k+1]+data[k+2];}
      if(sum/(probe.width*3)>19){top=Math.min(top,y);bottom=y;}
    }
    if(bottom<=top){top=0;bottom=probe.height-1;}
    const crop=document.createElement('canvas');crop.width=image.width;crop.height=Math.round((bottom-top+1)/probe.height*image.height);
    crop.getContext('2d').drawImage(image,0,top/probe.height*image.height,image.width,crop.height,0,0,crop.width,crop.height);
    this.photo=this.own(new THREE.CanvasTexture(crop));this.photo.colorSpace=THREE.SRGBColorSpace;
    this.aspect=crop.height/crop.width;
    this.uniforms={uTime:{value:0},uMatter:{value:INITIAL_MATTER},uHover:{value:0},uPointer:{value:new THREE.Vector3()},uPulse:{value:-100},uHit:{value:new THREE.Vector3()},uFocus:{value:new THREE.Vector3()},uFocusAmount:{value:0},uFocusMode:{value:1},uPhoto:{value:this.photo},uPixelRatio:{value:this.renderer.getPixelRatio()},uHeight:{value:this.height},uLayer:{value:0}};
    this.makeSurface();this.makeMatter(crop);this.makeHalo(crop);
    this.ready=true;this.syncCamera();this.renderer.compile(this.scene,this.camera);
    if(this.shaderError)throw new Error('No se pudieron compilar los materiales de la lente.');
    this.invalidate();this.notify();
  }
  makeSurface(){
    const geometry=this.own(new THREE.PlaneGeometry(32,32*this.aspect,160,56));
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++)position.setZ(i,lensHeight(position.getX(i),position.getY(i)));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    this.surfaceMaterial=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    this.surface=new THREE.Mesh(geometry,this.surfaceMaterial);this.surface.renderOrder=2;this.scene.add(this.surface);
    for(let i=1;i<=2;i++){
      const uniforms={...this.uniforms,uLayer:{value:i}};
      const material=this.own(new THREE.ShaderMaterial({uniforms,vertexShader:surfaceVertex,fragmentShader:surfaceFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
      const layer=new THREE.Mesh(geometry,material);layer.position.z=-i*.65;layer.scale.set(1+i*.013,1+i*.035,1);layer.renderOrder=1;this.scene.add(layer);
    }
    // Two restrained contours make lens thickness legible while orbiting.
    for(let layer=0;layer<2;layer++){
      const points=[];
      for(let i=0;i<=240;i++){const a=i/240*Math.PI*2,x=Math.cos(a)*15.8,y=Math.sin(a)*16*this.aspect;points.push(new THREE.Vector3(x,y,lensHeight(x,y)-layer*1.15));}
      const g=this.own(new THREE.BufferGeometry().setFromPoints(points));
      const m=this.own(new THREE.LineBasicMaterial({color:layer?'#789184':'#b9a58a',transparent:true,opacity:layer?.075:.11,depthWrite:false}));
      this.scene.add(new THREE.Line(g,m));
    }
  }
  makeMatter(crop){
    const random=randomGenerator(811),sample=document.createElement('canvas');sample.width=this.mobile?200:310;sample.height=Math.round(sample.width*this.aspect);
    const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(crop,0,0,sample.width,sample.height);
    const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
    const positions=[],colors=[],scatter=[],seeds=[],dust=[],glyph=[];
    const add=(x,y,z,color,isDust)=>{
      positions.push(x,y,z);colors.push(...color);seeds.push(random());dust.push(isDust);
      scatter.push((random()-.5)*3,(random()-.5)*3,(random()-.5)*4);
      const lum=color[0]*.2126+color[1]*.7152+color[2]*.0722;glyph.push(Math.min(7,Math.floor(lum*9)));
    };
    for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){
      const u=(x+.5)/sample.width,v=(y+.5)/sample.height,r=(u*2-1)**2+(v*2-1)**2;
      if(r>1.04)continue;
      const k=(y*sample.width+x)*4,color=[pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255];
      const lum=color[0]*.2126+color[1]*.7152+color[2]*.0722;
      if(lum<.035)continue;
      const px=(u-.5)*32,py=(.5-v)*32*this.aspect,pz=lensHeight(px,py);
      if(r<.98)add(px,py,pz+.04,color,0);
      // Dust is sampled from the photograph's perimeter and local contrast.
      // Its colors and origin are retained; there is no separate star field.
      const neighbor=Math.min(pixels.length-4,k+4);
      const contrast=Math.abs(pixels[k]-pixels[neighbor])/255;
      if((r>.60&&random()<.38)||(contrast>.15&&random()<.16)){
        const expansion=1.04+random()*.17;
        add(px*expansion,py*expansion,pz+(random()-.5)*2.6,color.map(c=>Math.min(1,c*1.25+.06)),1);
      }
    }
    const geometry=this.own(new THREE.BufferGeometry());
    for(const [name,values,size]of[['position',positions,3],['aColor',colors,3],['aScatter',scatter,3],['aSeed',seeds,1],['aDust',dust,1],['aGlyph',glyph,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    geometry.computeBoundingSphere();
    const atlas=document.createElement('canvas');atlas.width=512;atlas.height=64;
    const ac=atlas.getContext('2d');ac.font='48px monospace';ac.fillStyle='#fff';ac.textAlign='center';ac.textBaseline='middle';
    [...'.:+*ox#@'].forEach((char,i)=>ac.fillText(char,i*64+32,32));
    this.uniforms.uAtlas={value:this.own(new THREE.CanvasTexture(atlas))};
    const material=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:fieldVertex,fragmentShader:fieldFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.field=new THREE.Points(geometry,material);this.field.renderOrder=3;this.field.frustumCulled=false;this.scene.add(this.field);
  }
  makeHalo(crop){
    const soft=document.createElement('canvas');soft.width=512;soft.height=256;
    const ctx=soft.getContext('2d');ctx.filter='blur(24px)';ctx.drawImage(crop,50,65,412,130);ctx.filter='none';
    ctx.globalCompositeOperation='destination-in';
    const mask=ctx.createRadialGradient(256,128,30,256,128,240);mask.addColorStop(0,'#fff');mask.addColorStop(1,'transparent');ctx.fillStyle=mask;ctx.fillRect(0,0,512,256);
    const texture=this.own(new THREE.CanvasTexture(soft));texture.colorSpace=THREE.SRGBColorSpace;
    const material=this.own(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending}));
    const halo=new THREE.Sprite(material);halo.position.z=-2.8;halo.scale.set(43,21.5,1);halo.renderOrder=0;this.scene.add(halo);
  }
  resize(){
    const {width,height}=this.canvas.getBoundingClientRect();this.width=width;this.height=height;
    this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.orbit.resize(this.camera.aspect);
    this.renderer.setSize(width,height,false);if(this.uniforms)this.uniforms.uHeight.value=height;this.invalidate();
  }
  syncCamera(){
    const p=this.orbit.position;this.camera.position.set(p.x,p.y,p.z);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();
    for(let i=0;i<this.hotspots.length;i++){
      const projected=this.hotspots[i].clone().project(this.camera),button=this.hotspotElements[i];
      if(button){button.style.left=`${(projected.x*.5+.5)*this.width}px`;button.style.top=`${(-projected.y*.5+.5)*this.height}px`;button.hidden=Math.abs(projected.x)>1.05||Math.abs(projected.y)>1.05;}
    }
  }
  samplePointer(){
    if(!this.ready)return false;this.ray.setFromCamera(this.pointer,this.camera);
    const intersection=this.ray.intersectObject(this.surface,false)[0];
    if(intersection){const uv=intersection.uv;if((uv.x*2-1)**2+(uv.y*2-1)**2<1.05){this.pointerTarget.copy(intersection.point);this.hover=1;return true;}}
    this.hover=0;return false;
  }
  setMaterial(value){this.targetMaterial=clamp(value,0,2);this.invalidate();this.notify();}
  zoom(factor){this.orbit.zoom(factor);this.invalidate();}
  activate(index){
    if(index===this.focusIndex&&this.focusTarget){this.focusTarget=0;this.focusIndex=-1;}
    else{this.focusIndex=index;this.focusTarget=1;this.focusUntil=this.time+6;this.uniforms.uFocus.value.copy(this.hotspots[index]);this.uniforms.uFocusMode.value=index===0?1.15:2;this.pulse(this.hotspots[index]);}
    this.invalidate();this.notify();
  }
  pulse(point){if(this.paused)return;this.uniforms.uHit.value.copy(point);this.uniforms.uPulse.value=this.time;}
  setPaused(value){this.paused=value;if(value)this.orbit.stop();this.invalidate();this.notify();}
  reset(){this.orbit.reset();this.targetMaterial=INITIAL_MATTER;this.focusIndex=-1;this.focusTarget=0;this.hover=0;this.pointer.set(5,5);if(this.uniforms)this.uniforms.uPulse.value=-100;this.invalidate();this.notify();}
  notify(){this.onChange?.({paused:this.paused,material:this.targetMaterial,focus:this.focusIndex});}
  clearInput(){this.pointers.clear();this.hover=0;this.last=0;}
  bind(){
    const options={signal:this.controller.signal},c=this.canvas;
    const pointer=e=>{const r=c.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);};
    c.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;c.focus({preventScroll:true});c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,multi:this.pointers.size>0});
      if(this.pointers.size>1)for(const p of this.pointers.values())p.multi=true;
      pointer(e);this.syncCamera();this.samplePointer();this.invalidate();
    },options);
    c.addEventListener('pointermove',e=>{
      pointer(e);const old=this.pointers.get(e.pointerId);
      if(old){
        if(this.pointers.size===2){const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>10&&after>10)this.orbit.zoom(before/after);}
        else this.orbit.rotate(e.clientX-old.x,e.clientY-old.y);
        Object.assign(old,{x:e.clientX,y:e.clientY});
      }
      this.samplePointer();this.invalidate();
    },options);
    const release=e=>{
      const old=this.pointers.get(e.pointerId);
      if(e.type==='pointerup'&&old&&!old.multi&&Math.hypot(e.clientX-old.startX,e.clientY-old.startY)<6&&this.samplePointer())this.pulse(this.pointerTarget);
      this.pointers.delete(e.pointerId);if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);if(e.pointerType!=='mouse')this.hover=0;this.invalidate();
    };
    c.addEventListener('pointerup',release,options);c.addEventListener('pointercancel',release,options);c.addEventListener('lostpointercapture',e=>this.pointers.delete(e.pointerId),options);
    c.addEventListener('pointerleave',()=>{this.hover=0;this.invalidate();},options);
    c.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);this.zoom(Math.exp(clamp(delta,-180,180)*.0016));},{...options,passive:false});
    c.addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();if(!['arrowleft','arrowright','arrowup','arrowdown','+','=','-','r',' '].includes(k))return;e.preventDefault();
      if(k==='arrowleft')this.orbit.rotate(25,0);if(k==='arrowright')this.orbit.rotate(-25,0);if(k==='arrowup')this.orbit.rotate(0,-22);if(k==='arrowdown')this.orbit.rotate(0,22);
      if(k==='+'||k==='=')this.zoom(.88);if(k==='-')this.zoom(1/.88);if(k==='r')this.reset();if(k===' '&&!e.repeat)this.setPaused(!this.paused);this.invalidate();
    },options);
    window.addEventListener('blur',()=>this.clearInput(),options);
    document.addEventListener('visibilitychange',()=>{this.clearInput();if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();},options);
    this.motionQuery.addEventListener('change',e=>{this.reduced=e.matches;if(e.matches)this.setPaused(true);},options);
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(this.frame);this.frame=0;this.onFailure?.();},options);
  }
  invalidate(){if(!this.frame&&!this.destroyed&&!this.suspended&&!document.hidden)this.frame=requestAnimationFrame(t=>this.tick(t));}
  tick(now){
    this.frame=0;if(!this.ready||this.destroyed||this.suspended||document.hidden)return;
    if(now-this.paint<(this.mobile?1000/30:1000/60)){this.invalidate();return;}
    const dt=this.last?Math.min((now-this.last)/1000,.05):.016;this.last=now;this.paint=now;
    if(!this.paused)this.time+=dt;
    const immediate=this.reduced||this.paused,moving=this.orbit.advance(dt,immediate),a=immediate?1:1-Math.exp(-dt*9);
    this.material+=(this.targetMaterial-this.material)*a;if(Math.abs(this.targetMaterial-this.material)<.001)this.material=this.targetMaterial;
    if(this.focusTarget&&this.time>this.focusUntil){this.focusTarget=0;this.focusIndex=-1;this.notify();}
    const uniforms=this.uniforms;
    uniforms.uFocusAmount.value+=(this.focusTarget-uniforms.uFocusAmount.value)*a;
    if(Math.abs(this.focusTarget-uniforms.uFocusAmount.value)<.001)uniforms.uFocusAmount.value=this.focusTarget;
    uniforms.uHover.value+=(this.hover-uniforms.uHover.value)*a;
    if(Math.abs(this.hover-uniforms.uHover.value)<.001)uniforms.uHover.value=this.hover;
    uniforms.uPointer.value.lerp(this.pointerTarget,a);uniforms.uTime.value=this.time;uniforms.uMatter.value=this.material;
    this.syncCamera();this.renderer.render(this.scene,this.camera);
    if(!this.paused||moving||this.material!==this.targetMaterial||uniforms.uFocusAmount.value!==this.focusTarget||uniforms.uHover.value!==this.hover)this.invalidate();
  }
  suspend(value){this.suspended=value;this.clearInput();if(value){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();}
  destroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.controller.abort();this.resizeObserver.disconnect();this.resources.forEach(r=>r.dispose());this.renderer.dispose();}
}
