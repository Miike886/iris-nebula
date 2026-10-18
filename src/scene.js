import * as THREE from '../vendor/three.module.js';
import { Orbit } from './orbit.js';
import { clamp, randomGenerator } from './math.js';
import { surfaceVertex, surfaceFragment, fieldVertex, fieldFragment, cloudVertex, cloudFragment, starVertex, starFragment, signatureVertex, signatureFragment } from './shaders.js';

const lensHeight = (x,y) => 1.9*(1-(x/16)**2)+.45*(1-(y/5.2)**2);
const INITIAL_MATTER = 1.35;
// Keep the revealed material distinct even in intermediate slider states.
const revealMatterFor = material => material < .7 ? INITIAL_MATTER : 0;

export class IrisScene {
  constructor(canvas, onChange, onFailure) {
    this.canvas=canvas; this.onChange=onChange; this.onFailure=onFailure;
    this.mobile=matchMedia('(pointer: coarse)').matches||innerWidth<700;
    this.motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced=this.motionQuery.matches; this.paused=this.reduced;
    this.orbit=new Orbit(innerWidth/innerHeight);
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#080c0e');
    this.camera=new THREE.PerspectiveCamera(42,1,.1,360);
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
    this.revealTarget=0;this.revealPinned=false;this.signatureTarget=1;this.holdTimer=0;this.holding=false;
    this.signatureAnchor=new THREE.Vector3(7.5,-5.8,3);
    this.hotspots=[new THREE.Vector3(-7.4,-1.65,lensHeight(-7.4,-1.65)+.18),new THREE.Vector3(7.3,-1.65,lensHeight(7.3,-1.65)+.18)];
    this.hotspotElements=[...document.querySelectorAll('[data-focus]')];
    this.bind();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  own(resource){this.resources.push(resource);return resource;}
  async load(url){
    const image=new Image();image.src=url;await image.decode();if(this.destroyed)return;
    // Only the in-memory crop is changed; the local original remains untouched.
    const probe=document.createElement('canvas');probe.width=384;probe.height=Math.round(image.height/image.width*384);
    const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,probe.width,probe.height);
    const data=ctx.getImageData(0,0,probe.width,probe.height).data;
    let top=probe.height,bottom=0;
    for(let y=0;y<probe.height;y++){
      let sum=0;for(let x=0;x<probe.width;x++){const k=(y*probe.width+x)*4;sum+=data[k]+data[k+1]+data[k+2];}
      if(sum/(probe.width*3)>4){top=Math.min(top,y);bottom=y;}
    }
    if(bottom<=top){top=0;bottom=probe.height-1;}
    top=Math.max(0,top-1);bottom=Math.min(probe.height-1,bottom+1);
    const crop=document.createElement('canvas');crop.width=image.width;crop.height=Math.round((bottom-top+1)/probe.height*image.height);
    crop.getContext('2d').drawImage(image,0,top/probe.height*image.height,image.width,crop.height,0,0,crop.width,crop.height);
    this.photo=this.own(new THREE.CanvasTexture(crop));this.photo.colorSpace=THREE.SRGBColorSpace;
    this.aspect=crop.height/crop.width;
    this.uniforms={uTime:{value:0},uMatter:{value:INITIAL_MATTER},uHover:{value:0},uPointer:{value:new THREE.Vector3()},uPulse:{value:-100},uHit:{value:new THREE.Vector3()},uFocus:{value:new THREE.Vector3()},uFocusAmount:{value:0},uFocusMode:{value:1},uPhoto:{value:this.photo},uPixelRatio:{value:this.renderer.getPixelRatio()},uHeight:{value:this.height},uLayer:{value:0}};
    this.uniforms.uPhotoHalfHeight={value:16*this.aspect};
    this.uniforms.uReveal={value:0};this.uniforms.uRevealMatter={value:revealMatterFor(INITIAL_MATTER)};this.uniforms.uSignature={value:1};
    this.makeSurface();this.makeMatter(crop);this.makeNebula(crop);this.makeStars();this.makeSignature();
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
      const u=(x+.5)/sample.width,v=(y+.5)/sample.height,r=Math.abs(u*2-1)**8+Math.abs(v*2-1)**12;
      if(r>1.04)continue;
      const k=(y*sample.width+x)*4,color=[pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255];
      const lum=color[0]*.2126+color[1]*.7152+color[2]*.0722;
      if(lum<.035)continue;
      const px=(u-.5)*32,py=(.5-v)*32*this.aspect,pz=lensHeight(px,py);
      if(r<1.02)add(px,py,pz+.04,color,0);
      // Local dust retains the photograph's perimeter, contrast and colors.
      const neighbor=Math.min(pixels.length-4,k+4);
      const contrast=Math.abs(pixels[k]-pixels[neighbor])/255;
      if((r>.45&&random()<.50)||(contrast>.10&&random()<.25)){
        const expansion=1.05+random()*.55;
        add(px*expansion,py*expansion,pz+(random()-.5)*7,color.map(c=>Math.min(1,c*1.25+.06)),1);
      }
      // Sparse distant grains retain the photograph's color and source location.
      if(random()<.035){
        const spread=2+random()*5;
        add(px*spread+Math.sin(py)*9,py*spread*(this.mobile?2:1.4),-8-random()*65,color,2);
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
  makeNebula(crop){
    const random=randomGenerator(912);
    // A small procedural density atlas is generated once, never per frame.
    const size=128,atlas=document.createElement('canvas');atlas.width=size*4;atlas.height=size;
    const ac=atlas.getContext('2d'),density=ac.createImageData(atlas.width,atlas.height);
    const grid=Float32Array.from({length:64*64},()=>random());
    const noise=(x,y)=>{
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
      const at=(a,b)=>grid[((b+64)%64)*64+(a+64)%64];
      return (at(ix,iy)*(1-sx)+at(ix+1,iy)*sx)*(1-sy)+(at(ix,iy+1)*(1-sx)+at(ix+1,iy+1)*sx)*sy;
    };
    for(let tile=0;tile<4;tile++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/(size-1),v=y/(size-1),nx=u*4+tile*12,ny=v*4;
      const warp=noise(nx*.7,ny*.7)*2;
      const n=noise(nx+warp,ny+warp)*.55+noise(nx*2,ny*2)*.27+noise(nx*4,ny*4)*.13+noise(nx*8,ny*8)*.05;
      const edge=Math.max(0,1-((u-.5)**2+(v-.5)**2)*4);
      const alpha=Math.pow(edge,1.8)*Math.pow(Math.max(0,n-.25)*1.45,1.6);
      const k=(y*atlas.width+tile*size+x)*4;density.data[k]=255;density.data[k+1]=255;density.data[k+2]=255;density.data[k+3]=Math.round(alpha*255);
    }
    ac.putImageData(density,0,0);
    const texture=this.own(new THREE.CanvasTexture(atlas));
    const sample=document.createElement('canvas');sample.width=96;sample.height=Math.round(96*this.aspect);
    const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(crop,0,0,sample.width,sample.height);
    const pixels=context.getImageData(0,0,sample.width,sample.height).data;
    const highlights=[];
    for(let k=0;k<pixels.length;k+=4)if(pixels[k+2]>pixels[k]*1.03&&pixels[k+2]>90)highlights.push(k/4);
    const centers=[],colors=[],scales=[],seeds=[];
    const count=this.mobile?64:104;
    for(let i=0;i<count;i++){
      let u=random(),v=random();
      if(i%4===0&&highlights.length){const pixel=highlights[Math.floor(random()*highlights.length)];u=(pixel%sample.width+.5)/sample.width;v=(Math.floor(pixel/sample.width)+.5)/sample.height;}
      const k=(Math.floor(v*sample.height)*sample.width+Math.floor(u*sample.width))*4;
      const color=[pixels[k]/255,pixels[k+1]/255,pixels[k+2]/255];
      const spread=1.5+random()*3.6,side=v<.5?1:-1;
      const x=(u-.5)*32*spread;
      const y=((.5-v)*32*this.aspect*spread+Math.sin(u*7+spread)*6)*(this.mobile?1.8:1.2);
      const z=-6-random()*48;
      centers.push(x,y,z);scales.push(12+random()*19,8+random()*16);
      // Warm skin and cool eye highlights become the emission palette.
      const cool=color[2]>color[0]*.95;
      colors.push(color[0]*(cool?.58:1.25),color[1]*(cool?1.1:.82),color[2]*(cool?1.35:.83));seeds.push(random());
      if(i<12){centers[centers.length-3]=(side*20)+(u-.5)*22;centers[centers.length-2]=y*1.1;centers[centers.length-1]=3+random()*8;}
    }
    const geometry=this.own(new THREE.InstancedBufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
    geometry.setAttribute('aCenter',new THREE.InstancedBufferAttribute(new Float32Array(centers),3));geometry.setAttribute('aColor',new THREE.InstancedBufferAttribute(new Float32Array(colors),3));
    geometry.setAttribute('aScale',new THREE.InstancedBufferAttribute(new Float32Array(scales),2));geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(new Float32Array(seeds),1));geometry.instanceCount=count;
    const material=this.own(new THREE.ShaderMaterial({uniforms:{...this.uniforms,uCloud:{value:texture}},vertexShader:cloudVertex,fragmentShader:cloudFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.nebula=new THREE.Mesh(geometry,material);this.nebula.frustumCulled=false;this.nebula.renderOrder=0;this.scene.add(this.nebula);
  }
  makeStars(){
    const random=randomGenerator(173),positions=[],seeds=[],colors=[];
    const count=this.mobile?9000:18000;
    for(let i=0;i<count;i++){
      const azimuth=random()*Math.PI*2,cosine=random()*2-1,radius=65+random()*100,sine=Math.sqrt(1-cosine*cosine);
      positions.push(radius*sine*Math.cos(azimuth),radius*cosine,radius*sine*Math.sin(azimuth));
      const warmth=random();colors.push(.65+warmth*.3,.73+warmth*.17,.88-warmth*.16);seeds.push(random());
    }
    const geometry=this.own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('aColor',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
    const material=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:starVertex,fragmentShader:starFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.stars=new THREE.Points(geometry,material);this.stars.frustumCulled=false;this.stars.renderOrder=-1;this.scene.add(this.stars);
  }
  makeSignature(){
    // The name is sampled into points, then assembled from a small dust cloud.
    const canvas=document.createElement('canvas');canvas.width=360;canvas.height=90;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.font='italic 56px Georgia';ctx.fillText('Berenice',16,65);
    const nameWidth=ctx.measureText('Berenice').width;
    const data=ctx.getImageData(0,0,360,90).data,positions=[],scatter=[],seeds=[],random=randomGenerator(725);
    const add=(x,y)=>{positions.push(x,y,Math.sin(x)*.08);scatter.push((random()-.5)*8,(random()-.5)*3,(random()-.5)*4);seeds.push(random());};
    for(let y=0;y<90;y+=2)for(let x=0;x<360;x+=2)if(data[(y*360+x)*4+3]>100)add((x-16-nameWidth/2)*5.4/nameWidth,(45-y)/42);
    for(let i=0;i<90;i++){
      const t=i/90*Math.PI*2,x=16*Math.sin(t)**3,y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
      add(3.3+x*.023,.04+y*.023);
    }
    const geometry=this.own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('aScatter',new THREE.Float32BufferAttribute(scatter,3));geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
    const material=this.own(new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:signatureVertex,fragmentShader:signatureFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.signature=new THREE.Points(geometry,material);this.signature.renderOrder=4;this.signature.frustumCulled=false;this.scene.add(this.signature);this.frameSignature();
  }
  frameSignature(){
    const compact=this.height<500;
    this.signatureAnchor.y=compact?8.7:-5.8;
    if(this.signature){this.signature.position.copy(this.signatureAnchor);this.signature.position.y-=this.mobile&&!compact?1.8:1.3;this.signature.scale.setScalar(this.mobile&&!compact?1.4:1);}
  }
  resize(){
    const {width,height}=this.canvas.getBoundingClientRect();this.width=width;this.height=height;
    this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.orbit.resize(this.camera.aspect);
    this.renderer.setSize(width,height,false);if(this.uniforms)this.uniforms.uHeight.value=height;this.frameSignature();this.invalidate();
  }
  syncCamera(){
    const p=this.orbit.position;this.camera.position.set(p.x,p.y,p.z);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();
    for(let i=0;i<this.hotspots.length;i++){
      const projected=this.hotspots[i].clone().project(this.camera),button=this.hotspotElements[i];
      if(button){button.style.left=`${(projected.x*.5+.5)*this.width}px`;button.style.top=`${(-projected.y*.5+.5)*this.height}px`;button.hidden=Math.abs(projected.x)>1.05||Math.abs(projected.y)>1.05;}
    }
    const signatureButton=document.getElementById('signature');
    if(signatureButton){const p=this.signatureAnchor.clone().project(this.camera);signatureButton.style.left=`${(p.x*.5+.5)*this.width}px`;signatureButton.style.top=`${(-p.y*.5+.5)*this.height}px`;signatureButton.hidden=Math.abs(p.x)>1||Math.abs(p.y)>1;}
  }
  samplePointer(){
    if(!this.ready)return false;this.ray.setFromCamera(this.pointer,this.camera);
    const intersection=this.ray.intersectObject(this.surface,false)[0];
    if(intersection){const uv=intersection.uv;if(Math.abs(uv.x*2-1)**8+Math.abs(uv.y*2-1)**12<1.05){this.pointerTarget.copy(intersection.point);this.hover=1;return true;}}
    // Empty space also receives waves; keep the interaction on the central plane.
    const hit=this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),this.pointerTarget);
    this.hover=hit ? .35 : 0;return Boolean(hit);
  }
  setMaterial(value){this.targetMaterial=clamp(value,0,2);this.invalidate();this.notify();}
  zoom(factor){this.orbit.zoom(factor);this.invalidate();}
  activate(index){
    if(index===this.focusIndex&&this.focusTarget){this.focusTarget=0;this.focusIndex=-1;}
    else{this.focusIndex=index;this.focusTarget=1;this.focusUntil=this.time+6;this.uniforms.uFocus.value.copy(this.hotspots[index]);this.uniforms.uFocusMode.value=index===0?1.15:2;this.pulse(this.hotspots[index]);}
    this.invalidate();this.notify();
  }
  pulse(point){if(this.paused)return;this.uniforms.uHit.value.copy(point);this.uniforms.uPulse.value=this.time;}
  toggleSignature(){this.signatureTarget=1-this.signatureTarget;this.pulse(this.signatureAnchor);this.invalidate();this.notify();}
  toggleReveal(){this.revealPinned=!this.revealPinned;this.cancelHold();if(this.revealPinned){this.pointerTarget.copy(this.hotspots[0]);this.hover=1;this.orbit.stop();}this.invalidate();this.notify();}
  emitWave(){this.pulse(new THREE.Vector3(0,0,2));this.invalidate();}
  cancelHold(){clearTimeout(this.holdTimer);this.holdTimer=0;this.holding=false;this.revealTarget=this.revealPinned?1:0;this.canvas.classList.toggle('revealing',this.revealPinned);}
  setPaused(value){this.paused=value;if(value)this.orbit.stop();this.invalidate();this.notify();}
  reset(){this.revealPinned=false;this.cancelHold();this.signatureTarget=1;this.orbit.reset();this.targetMaterial=INITIAL_MATTER;this.focusIndex=-1;this.focusTarget=0;this.hover=0;this.pointer.set(5,5);if(this.uniforms)this.uniforms.uPulse.value=-100;this.invalidate();this.notify();}
  notify(){this.onChange?.({paused:this.paused,material:this.targetMaterial,focus:this.focusIndex,signature:this.signatureTarget===1,reveal:this.revealPinned,revealMatter:revealMatterFor(this.targetMaterial)});}
  clearInput(){this.cancelHold();this.pointers.clear();this.hover=0;this.last=0;this.invalidate();}
  bind(){
    const options={signal:this.controller.signal},c=this.canvas;
    const pointer=e=>{const r=c.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);};
    c.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;c.focus({preventScroll:true});c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,multi:this.pointers.size>0});
      if(this.pointers.size>1)for(const p of this.pointers.values())p.multi=true;
      pointer(e);this.syncCamera();this.samplePointer();this.invalidate();
      this.cancelHold();
      if(this.pointers.size===1&&!this.revealPinned)this.holdTimer=setTimeout(()=>{if(this.pointers.size===1){this.orbit.stop();this.holding=true;this.revealTarget=1;this.canvas.classList.add('revealing');this.invalidate();}},380);
    },options);
    c.addEventListener('pointermove',e=>{
      pointer(e);const old=this.pointers.get(e.pointerId);
      if(old){
        if(!this.holding&&Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>7){clearTimeout(this.holdTimer);this.holdTimer=0;}
        if(this.pointers.size===2){const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>10&&after>10)this.orbit.zoom(before/after);}
        else if(!this.holding&&!this.revealPinned)this.orbit.rotate(e.clientX-old.x,e.clientY-old.y);
        Object.assign(old,{x:e.clientX,y:e.clientY});
      }
      this.samplePointer();this.invalidate();
    },options);
    const release=e=>{
      const old=this.pointers.get(e.pointerId);
      if(e.type==='pointerup'&&old&&!old.multi&&!this.holding&&Math.hypot(e.clientX-old.startX,e.clientY-old.startY)<6&&this.samplePointer())this.pulse(this.pointerTarget);
      this.cancelHold();
      this.pointers.delete(e.pointerId);if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);if(e.pointerType!=='mouse')this.hover=0;this.invalidate();
    };
    c.addEventListener('pointerup',release,options);c.addEventListener('pointercancel',release,options);c.addEventListener('lostpointercapture',e=>{this.pointers.delete(e.pointerId);this.cancelHold();this.invalidate();},options);
    c.addEventListener('pointerleave',()=>{this.hover=0;this.invalidate();},options);
    c.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1);this.zoom(Math.exp(clamp(delta,-180,180)*.0016));},{...options,passive:false});
    c.addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();if(!['arrowleft','arrowright','arrowup','arrowdown','+','=','-','r',' ','v','b'].includes(k))return;e.preventDefault();
      if(k==='v'&&!e.repeat){this.pointerTarget.copy(this.hotspots[0]);this.hover=1;this.revealTarget=1;}
      if(k==='b'&&!e.repeat)this.toggleSignature();
      if(k.startsWith('arrow')&&this.revealTarget){
        this.pointerTarget.x=clamp(this.pointerTarget.x+(k==='arrowright'?.8:k==='arrowleft'?-.8:0),-16,16);
        this.pointerTarget.y=clamp(this.pointerTarget.y+(k==='arrowup'?.8:k==='arrowdown'?-.8:0),-16*this.aspect,16*this.aspect);
        this.invalidate();return;
      }
      if(k==='arrowleft')this.orbit.rotate(25,0);if(k==='arrowright')this.orbit.rotate(-25,0);if(k==='arrowup')this.orbit.rotate(0,-22);if(k==='arrowdown')this.orbit.rotate(0,22);
      if(k==='+'||k==='=')this.zoom(.88);if(k==='-')this.zoom(1/.88);if(k==='r')this.reset();if(k===' '&&!e.repeat)this.setPaused(!this.paused);this.invalidate();
    },options);
    c.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='v'){this.revealTarget=this.revealPinned?1:0;this.invalidate();}},options);
    c.addEventListener('contextmenu',e=>e.preventDefault(),options);
    c.addEventListener('blur',()=>this.clearInput(),options);
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
    for(const [key,target]of[['uReveal',this.revealTarget],['uSignature',this.signatureTarget],['uRevealMatter',revealMatterFor(this.targetMaterial)]]){uniforms[key].value+=(target-uniforms[key].value)*a;if(Math.abs(target-uniforms[key].value)<.001)uniforms[key].value=target;}
    uniforms.uFocusAmount.value+=(this.focusTarget-uniforms.uFocusAmount.value)*a;
    if(Math.abs(this.focusTarget-uniforms.uFocusAmount.value)<.001)uniforms.uFocusAmount.value=this.focusTarget;
    uniforms.uHover.value+=(this.hover-uniforms.uHover.value)*a;
    if(Math.abs(this.hover-uniforms.uHover.value)<.001)uniforms.uHover.value=this.hover;
    uniforms.uPointer.value.lerp(this.pointerTarget,a);uniforms.uTime.value=this.time;uniforms.uMatter.value=this.material;
    this.syncCamera();this.renderer.render(this.scene,this.camera);
    if(!this.paused||moving||this.material!==this.targetMaterial||uniforms.uFocusAmount.value!==this.focusTarget||uniforms.uHover.value!==this.hover||uniforms.uReveal.value!==this.revealTarget||uniforms.uSignature.value!==this.signatureTarget||uniforms.uRevealMatter.value!==revealMatterFor(this.targetMaterial))this.invalidate();
  }
  suspend(value){this.suspended=value;this.clearInput();if(value){cancelAnimationFrame(this.frame);this.frame=0;}else this.invalidate();}
  destroy(){this.destroyed=true;this.cancelHold();cancelAnimationFrame(this.frame);this.controller.abort();this.resizeObserver.disconnect();this.resources.forEach(r=>r.dispose());this.renderer.dispose();}
}
