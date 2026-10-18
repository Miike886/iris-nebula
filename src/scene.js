import * as THREE from '../vendor/three.module.js';
import { Flight } from './flight.js';
import { clamp, randomGenerator } from './math.js';
import { fieldVertex, fieldFragment, fragmentVertex, fragmentFragment } from './shaders.js';

export class IrisScene {
  constructor(canvas, onChange, onFailure) {
    this.canvas=canvas; this.onChange=onChange; this.onFailure=onFailure;
    this.mobile=matchMedia('(pointer: coarse)').matches || innerWidth<700;
    this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced=this.motionQuery.matches; this.paused=this.reduced;
    this.flight=new Flight(this.mobile?44:24);
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#05080c');
    this.camera=new THREE.PerspectiveCamera(58,1,.15,160);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.mobile?1.35:1.6));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.debug.onShaderError=()=>{this.shaderError=true;};
    this.keys=new Set(); this.held=new Set(); this.pointers=new Map();
    this.pointer=new THREE.Vector2(5,5); this.ray=new THREE.Raycaster();
    this.time=0; this.material=.35; this.targetMaterial=.35; this.hover=0; this.frame=0; this.last=0; this.paint=0; this.ready=false;
    this.controller=new AbortController(); this.zone=-1; this.suspended=false;
    this.resources=[]; this.zones=[
      {position:{x:-7.6,y:.6,z:7},target:{x:-7.5,y:0,z:0}},
      {position:{x:12,y:2,z:6},target:{x:7.5,y:0,z:0}},
      {position:{x:2,y:6,z:-7},target:{x:1,y:4,z:-17}},
      {position:{x:-17,y:5,z:-14},target:{x:0,y:0,z:0}}
    ];
    this.bind(); this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas); this.resize();
  }
  own(object){this.resources.push(object);return object;}
  async load(url){
    const image=new Image(); image.src=url; await image.decode();
    if(this.destroyed)return;
    // Crop in memory only; never alter or move the original photograph.
    const probe=document.createElement('canvas');probe.width=120;probe.height=Math.round(image.height/image.width*120);
    const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(image,0,0,probe.width,probe.height);
    const data=pc.getImageData(0,0,probe.width,probe.height).data;
    let top=probe.height,bottom=0;
    for(let y=0;y<probe.height;y++){let sum=0;for(let x=0;x<probe.width;x++){const k=(y*probe.width+x)*4;sum+=data[k]+data[k+1]+data[k+2];}if(sum/(probe.width*3)>19){top=Math.min(top,y);bottom=y;}}
    if(bottom<=top){top=0;bottom=probe.height-1;}
    const crop=document.createElement('canvas');crop.width=image.width;crop.height=Math.round((bottom-top+1)/probe.height*image.height);
    crop.getContext('2d').drawImage(image,0,top/probe.height*image.height,image.width,crop.height,0,0,crop.width,crop.height);
    this.photo=this.own(new THREE.CanvasTexture(crop));this.photo.colorSpace=THREE.SRGBColorSpace;
    this.aspect=crop.height/crop.width;
    this.makeField(crop);this.makeFragments();this.makeHaze();
    this.ready=true;this.syncCamera();
    this.renderer.compile(this.scene,this.camera);
    if(this.shaderError)throw new Error('No se pudieron compilar los materiales 3D.');
    this.invalidate();this.notify();
  }
  makeField(crop){
    const random=randomGenerator(181),sample=document.createElement('canvas');
    sample.width=this.mobile?210:330;sample.height=Math.round(sample.width*this.aspect);
    const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(crop,0,0,sample.width,sample.height);
    const pixels=sc.getImageData(0,0,sample.width,sample.height).data;
    const positions=[],homes=[],colors=[],seeds=[],kinds=[];
    const add=(p,home,color,kind)=>{positions.push(...p);homes.push(...home);colors.push(...color);seeds.push(random());kinds.push(kind);};
    const palette=[];
    for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){
      const k=(y*sample.width+x)*4;
      const r=pixels[k]/255,g=pixels[k+1]/255,b=pixels[k+2]/255;
      const lum=r*.2126+g*.7152+b*.0722;
      const u=(x+.5)/sample.width,v=(y+.5)/sample.height;
      const fade=Math.min(1,u*12,(1-u)*12,v*9,(1-v)*9);
      if(lum<.045 || random()>fade)continue;
      const home=[(u-.5)*32,(.5-v)*32*this.aspect,0];
      const edge=Math.pow(Math.abs(v-.5)*2,2);
      const z=(lum-.35)*3.5+(random()-.5)*(.8+edge*5);
      const p=[home[0]+(random()-.5)*edge*1.8,home[1]+(random()-.5)*edge*2,z];
      const color=[r*.8+.15,g*.86+.12,b*.92+.13];palette.push(color);
      add(p,home,color,0);
    }
    // Source-colored filaments extend through world-space depth, crossing the
    // photographic formation, rather than sitting on an image plane.
    const count=this.mobile?9500:22000;
    for(let i=0;i<count;i++){
      const strand=i%7,t=random()*2-1,phase=strand*.91;
      const thickness=Math.pow(random(),2)*2.1;
      const p=[t*25+Math.sin(phase+t*5)*2+(random()-.5)*thickness,
        Math.sin(t*3.4+phase)*4.7+(strand-3)*.72+(random()-.5)*thickness,
        Math.cos(t*2.9+phase)*11-5+(random()-.5)*thickness*2];
      const original=palette[Math.floor(random()*palette.length)]||[.6,.4,.3];
      const cool=strand===2||strand===5;
      const color=cool?[original[2]*.45+.08,original[1]*.85+.18,original[0]*.8+.23]:[original[0]*1.03+.08,original[1]*.8+.07,original[2]*.66+.04];
      add(p,p,color,i%29===0?2:1);
    }
    for(let i=0;i<(this.mobile?1400:3000);i++){
      const angle=random()*Math.PI*2,radius=1+random()*5;
      const p=[1+Math.cos(angle)*radius,4+Math.sin(angle)*radius*.7,-15+(random()-.5)*8];
      add(p,p,[.25+random()*.2,.56+random()*.3,.62+random()*.3],2);
    }
    for(let i=0;i<(this.mobile?650:1400);i++){
      const p=[(random()-.5)*100,(random()-.5)*65,(random()-.5)*100];add(p,p,[.35,.44,.5],1);
    }
    const geometry=this.own(new THREE.BufferGeometry());
    for(const [name,values,itemSize]of[['position',positions,3],['aHome',homes,3],['aColor',colors,3],['aSeed',seeds,1],['aKind',kinds,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,itemSize));
    geometry.computeBoundingSphere();
    const atlas=document.createElement('canvas');atlas.width=512;atlas.height=64;
    const ac=atlas.getContext('2d');ac.font='48px monospace';ac.fillStyle='#fff';ac.textAlign='center';ac.textBaseline='middle';
    [...'.:+*ox#@'].forEach((c,i)=>ac.fillText(c,i*64+32,32));
    this.uniforms={uTime:{value:0},uMatter:{value:this.material},uPixelRatio:{value:this.renderer.getPixelRatio()},uHeight:{value:innerHeight},uPulse:{value:-100},uHover:{value:0},uRayOrigin:{value:new THREE.Vector3()},uRayDirection:{value:new THREE.Vector3(0,0,-1)},uHit:{value:new THREE.Vector3()},uAtlas:{value:this.own(new THREE.CanvasTexture(atlas))},uPhoto:{value:this.photo}};
    const material=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:fieldVertex,fragmentShader:fieldFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.field=new THREE.Points(geometry,material);this.scene.add(this.field);
  }
  makeFragments(){
    const random=randomGenerator(240),positions=[],uvs=[],offsets=[],seeds=[];
    const cols=42,rows=14;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const u=col/cols,v=row/rows,seed=random();const edge=Math.pow(Math.abs(v-.5)*2,2);
      const offset=[(random()-.5)*edge*4,(random()-.5)*edge*3,(random()-.5)*(1.6+edge*8)];
      for(const [dx,dy]of[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
        const a=u+(dx*.97+.015)/cols,b=v+(dy*.97+.015)/rows;
        positions.push((a-.5)*32,(b-.5)*32*this.aspect,0);uvs.push(a,b);offsets.push(...offset);seeds.push(seed);
      }
    }
    const g=this.own(new THREE.BufferGeometry());
    for(const [name,a,n]of[['position',positions,3],['uv',uvs,2],['aOffset',offsets,3],['aSeed',seeds,1]])g.setAttribute(name,new THREE.Float32BufferAttribute(a,n));
    const material=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:fragmentVertex,fragmentShader:fragmentFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    const mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;this.scene.add(mesh);
  }
  makeHaze(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'#ffffff26');gradient.addColorStop(.3,'#ffffff0c');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    const texture=this.own(new THREE.CanvasTexture(canvas));const random=randomGenerator(31);
    for(let i=0;i<15;i++){
      const material=this.own(new THREE.SpriteMaterial({map:texture,color:i%3===0?'#628eaa':'#cf895b',transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
      const sprite=new THREE.Sprite(material);sprite.position.set((random()-.5)*35,(random()-.5)*12,(random()-.5)*26-5);
      const scale=9+random()*12;sprite.scale.set(scale,scale,1);this.scene.add(sprite);
    }
  }
  resize(){const {width,height}=this.canvas.getBoundingClientRect();this.width=width;this.height=height;this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);if(this.uniforms)this.uniforms.uHeight.value=height;this.invalidate();}
  syncCamera(){
    const p=this.flight.position;this.camera.position.set(p.x,p.y,p.z);this.camera.rotation.set(this.flight.pitch,this.flight.yaw,0,'YXZ');this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.pointer,this.camera);
    if(this.uniforms){this.uniforms.uRayOrigin.value.copy(this.ray.ray.origin);this.uniforms.uRayDirection.value.copy(this.ray.ray.direction);}
  }
  setMaterial(value){this.targetMaterial=clamp(value,0,2);this.invalidate();this.notify();}
  travel(amount){this.flight.move(0,0,amount);this.invalidate();}
  hold(direction,active){active?this.held.add(direction):this.held.delete(direction);this.invalidate();}
  setPaused(value){this.paused=value;this.keys.clear();this.held.clear();this.invalidate();this.notify();}
  reset(){this.flight.reset();this.targetMaterial=.35;this.zone=-1;this.hover=0;this.pointer.set(5,5);if(this.uniforms)this.uniforms.uPulse.value=-100;this.invalidate();this.notify();}
  visit(){this.zone=(this.zone+1)%this.zones.length;const z=this.zones[this.zone];this.flight.visit(z.position,z.target,this.reduced||this.paused);this.invalidate();this.notify();}
  notify(){this.onChange?.({paused:this.paused,material:this.targetMaterial,reduced:this.reduced});}
  clearInput(){this.keys.clear();this.held.clear();this.pointers.clear();this.hover=0;this.last=0;}
  bind(){
    const options={signal:this.controller.signal},c=this.canvas;
    const updatePointer=e=>{const r=c.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.hover=1;};
    c.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;c.focus({preventScroll:true});c.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});updatePointer(e);this.syncCamera();if(this.uniforms&&!this.paused&&!this.reduced){this.ray.ray.at(12,this.uniforms.uHit.value);this.uniforms.uPulse.value=this.time;}this.invalidate();},options);
    c.addEventListener('pointermove',e=>{
      updatePointer(e);const old=this.pointers.get(e.pointerId);
      if(old){
        if(this.pointers.size===2){
          const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)[1];
          const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
          this.flight.move(-(e.clientX-old.x)*.012,(e.clientY-old.y)*.012,(after-before)*.035);
        }else if(old.button===2||e.shiftKey)this.flight.move(-(e.clientX-old.x)*.025,(e.clientY-old.y)*.025,0);
        else this.flight.look(e.clientX-old.x,e.clientY-old.y);
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:old.button});
      }this.invalidate();
    },options);
    const release=e=>{this.pointers.delete(e.pointerId);if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);if(e.pointerType!=='mouse')this.hover=0;this.invalidate();};
    c.addEventListener('pointerup',release,options);c.addEventListener('pointercancel',release,options);
    c.addEventListener('lostpointercapture',e=>this.pointers.delete(e.pointerId),options);
    c.addEventListener('pointerleave',()=>{this.hover=0;this.invalidate();},options);
    c.addEventListener('contextmenu',e=>e.preventDefault(),options);
    c.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);this.travel(-clamp(delta,-180,180)*.014);},{...options,passive:false});
    c.addEventListener('keydown',e=>{
      const key=e.key.toLowerCase();
      if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();this.keys.add(key);this.invalidate();}
      if(e.repeat)return;
      if(key==='r')this.reset();if(key==='+'||key==='=')this.travel(2);if(key==='-')this.travel(-2);
      if(key===' '){e.preventDefault();this.setPaused(!this.paused);}
    },options);
    window.addEventListener('keyup',e=>{this.keys.delete(e.key.toLowerCase());},options);
    c.addEventListener('blur',()=>this.clearInput(),options);window.addEventListener('blur',()=>this.clearInput(),options);
    document.addEventListener('visibilitychange',()=>{this.clearInput();if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();},options);
    this.motionQuery.addEventListener('change',e=>{this.reduced=e.matches;if(e.matches)this.setPaused(true);else this.notify();},options);
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(this.frame);this.frame=0;this.onFailure?.('Se perdió el contexto gráfico.');},options);
  }
  invalidate(){if(!this.frame&&!this.destroyed&&!document.hidden&&!this.suspended)this.frame=requestAnimationFrame(t=>this.tick(t));}
  tick(now){
    this.frame=0;if(!this.ready||this.destroyed||this.suspended||document.hidden)return;
    const interval=this.mobile?1000/30:1000/45;if(now-this.paint<interval){this.invalidate();return;}
    const dt=this.last?Math.min((now-this.last)/1000,.05):.016;this.last=now;this.paint=now;
    if(!this.paused&&!this.reduced)this.time+=dt;
    const down=(...names)=>names.some(n=>this.keys.has(n)||this.held.has(n))?1:0;
    const f=down('w','arrowup','forward')-down('s','arrowdown','back'),r=down('d','arrowright','right')-down('a','arrowleft','left'),u=down('e','up')-down('q','down');
    const length=Math.max(1,Math.hypot(f,r,u));if(f||r||u)this.flight.move(r*dt*7/length,u*dt*7/length,f*dt*7/length);
    const flying=this.flight.advance(dt),easing=this.paused||this.reduced?1:1-Math.exp(-dt*6);
    this.material+=(this.targetMaterial-this.material)*easing;if(Math.abs(this.targetMaterial-this.material)<.001)this.material=this.targetMaterial;
    this.syncCamera();this.uniforms.uTime.value=this.time;this.uniforms.uMatter.value=this.material;this.uniforms.uHover.value=this.hover;
    this.renderer.render(this.scene,this.camera);
    if((!this.paused&&!this.reduced)||f||r||u||flying||this.material!==this.targetMaterial)this.invalidate();
  }
  suspend(value){this.suspended=value;this.clearInput();if(value){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();}
  destroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.controller.abort();this.resizeObserver.disconnect();this.resources.forEach(r=>r.dispose());this.renderer.dispose();}
}
