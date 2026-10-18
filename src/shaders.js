// The surface and its sampled matter share deformation, illumination and local
// transformation fields. Neither camera movement nor pointer input changes UVs.
const fields = /* glsl */`
uniform float uTime, uMatter, uHover, uPulse, uFocusAmount, uFocusMode, uReveal;
uniform vec3 uPointer, uHit, uFocus;
float localMatter(vec3 p) {
  float focus = 1.-smoothstep(2.3,5.5,distance(p.xy,uFocus.xy));
  float matter=mix(uMatter, uFocusMode, uFocusAmount*focus);
  float reveal=(1.-smoothstep(1.6,3.7,distance(p.xy,uPointer.xy)))*uReveal;
  return mix(matter,0.,reveal);
}
float wave(vec3 p) {
  float age=uTime-uPulse;
  if(age<0. || age>4.) return 0.;
  float d=distance(p.xy,uHit.xy);
  return sin(d*3.-age*8.)*exp(-pow((d-age*4.)/2.,2.))*exp(-age*.7);
}
float pointerLight(vec3 p) {
  return exp(-dot(p.xy-uPointer.xy,p.xy-uPointer.xy)/6.)*uHover;
}
`;

export const surfaceVertex = fields + /* glsl */`
varying vec2 vUv;
varying vec3 vWorld,vNormal;
void main(){
  vec3 p=position;
  p.z+=wave(p)*.24 + pointerLight(p)*.13;
  vUv=uv; vWorld=(modelMatrix*vec4(p,1.)).xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
export const surfaceFragment = fields + /* glsl */`
uniform sampler2D uPhoto;
uniform float uLayer;
varying vec2 vUv;
varying vec3 vWorld,vNormal;
void main(){
  vec2 oval=(vUv-.5)*2.;
  float r=pow(abs(oval.x),8.)+pow(abs(oval.y),12.);
  float edge=1.-smoothstep(.82,1.06,r);
  if(edge<.015)discard;
  vec3 original=texture2D(uPhoto,vUv).rgb;
  float matter=localMatter(vWorld);
  float photo=1.-smoothstep(.08,1.12,matter);
  float light=pointerLight(vWorld);
  float rim=pow(1.-abs(dot(normalize(cameraPosition-vWorld),normalize(vNormal))),2.);
  float shade=.89+.11*max(0.,dot(normalize(vNormal),normalize(vec3(-.4,.6,1.))));
  vec3 color=original*shade + original*light*.22;
  vec3 halfLight=normalize(normalize(vec3(-.4,.6,1.))+normalize(cameraPosition-vWorld));
  float sheen=pow(max(0.,dot(normalize(vNormal),halfLight)),48.);
  color+=vec3(.075,.067,.05)*sheen;
  color+=vec3(.14,.12,.085)*rim*.35;
  float alpha=edge*(photo*.98+.012);
  if(uLayer>0.) { color=mix(original,vec3(.055,.085,.074),.6);alpha=edge*.055*(1.-matter*.35); }
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

export const fieldVertex = fields + /* glsl */`
uniform float uPixelRatio,uHeight,uPhotoHalfHeight;
attribute vec3 aColor,aScatter;
attribute float aSeed,aDust,aGlyph;
varying vec3 vColor;
varying float vAlpha,vGlyph,vIndex;
void main(){
  float matter=localMatter(position);
  float form=smoothstep(.02,1.,matter);
  vec3 p=position;
  float dispersion=(.12+sin(uTime*.27+aSeed*12.)*.05)*form;
  // Let the boundary become wisps without masking out the brow pixels.
  float boundary=max(abs(position.x)/16.,abs(position.y)/uPhotoHalfHeight);
  dispersion+=smoothstep(.76,1.03,boundary)*.7*form;
  p+=aScatter*dispersion;
  if(aDust>.5) {
    p+=aScatter*(.55+.12*sin(uTime*.32+aSeed*21.));
    p.z+=sin(uTime*.25+aSeed*33.)*.2;
  }
  float influence=pointerLight(p);
  p.xy+=normalize(p.xy-uPointer.xy+vec2(.001))*influence*(.28+form*.42);
  p.z+=wave(p)*(.25+form*.5)+influence*.2;
  vec4 view=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*view;
  vGlyph=smoothstep(.95,1.85,matter);
  float size=mix(2.3,10.4,vGlyph);
  if(aDust>.5){size=1.7+aSeed*1.5;vGlyph=0.;}
  if(aDust>1.5)size=2.+pow(aSeed,8.)*7.;
  gl_PointSize=clamp(size*uPixelRatio*(uHeight/800.)*32./max(1.,-view.z),1.,36.);
  float lum=dot(aColor,vec3(.2126,.7152,.0722));
  vAlpha=aDust>.5 ? (.08+aSeed*.35) : form*(.35+lum*.65);
  if(aDust>1.5)vAlpha=(.35+aSeed*.55)*(1.+sin(uTime*.4+aSeed*40.)*.12);
  if(aDust<.5)vAlpha*=mix(1.,step(.42,aSeed),vGlyph);
  vAlpha*=1.+influence*.7;
  vColor=aColor;vIndex=aGlyph;
}`;

// Instanced cloud billboards have fixed world centers and real depth. Their
// density drifts slowly; orbiting reveals different overlaps and cavities.
export const cloudVertex = fields + /* glsl */`
attribute vec3 aCenter,aColor;
attribute vec2 aScale;
attribute float aSeed;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed,vLight;
void main(){
  vec3 p=aCenter;
  p.x+=sin(uTime*.06+aSeed*18.)*.65;
  p.y+=cos(uTime*.05+aSeed*12.)*.45;
  float influence=pointerLight(p);
  p.z+=wave(p)*.45;
  vec4 view=modelViewMatrix*vec4(p,1.);
  float angle=aSeed*6.283+sin(uTime*.035+aSeed*10.)*.06;
  mat2 rotation=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  view.xy+=rotation*(position.xy*aScale);
  gl_Position=projectionMatrix*view;
  vUv=uv;vColor=aColor;vSeed=aSeed;
  vLight=1.+influence*.7+uFocusAmount*.2*exp(-distance(p.xy,uFocus.xy)/14.);
}`;
export const cloudFragment = /* glsl */`
uniform sampler2D uCloud;
uniform float uTime,uMatter;
varying vec2 vUv;
varying vec3 vColor;
varying float vSeed,vLight;
void main(){
  float tile=floor(vSeed*3.999);
  vec2 uv=vec2((tile+vUv.x)/4.,vUv.y);
  float density=texture2D(uCloud,uv).a;
  float glow=.065+.012*sin(uTime*.12+vSeed*20.);
  float alpha=density*glow*vLight*(.8+uMatter*.15);
  float grey=dot(vColor,vec3(.2126,.7152,.0722));
  gl_FragColor=vec4(mix(vec3(grey),vColor,.38),alpha);
}`;
export const starVertex = fields + /* glsl */`
uniform float uPixelRatio;
attribute vec3 aColor;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha,vFlare;
void main(){
  vec3 p=position;
  float response=wave(p);
  p.xy+=normalize(p.xy-uHit.xy+vec2(.01))*response*.4;
  vec4 view=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*view;
  vFlare=step(.985,aSeed);
  gl_PointSize=uPixelRatio*(.9+pow(aSeed,6.)*2.6+vFlare*3.)*clamp(80./max(1.,-view.z),.65,1.3);
  float light=exp(-distance(p.xy,uPointer.xy)*.08)*uHover;
  vAlpha=(.4+aSeed*.6)*(1.+sin(uTime*.25+aSeed*87.)*.12)+max(0.,response)*.35+light*.22;
  vColor=aColor;
}`;
export const starFragment = /* glsl */`
varying vec3 vColor;
varying float vAlpha,vFlare;
void main(){
  vec2 p=gl_PointCoord-.5;
  float r=length(p),core=exp(-r*r*30.);
  float crossGlow=exp(-min(abs(p.x),abs(p.y))*55.)*(1.-smoothstep(.1,.5,r))*.45;
  gl_FragColor=vec4(vColor,(core+crossGlow*vFlare)*vAlpha*(1.-smoothstep(.42,.5,r)));
}`;
export const signatureVertex = /* glsl */`
uniform float uSignature,uTime,uPixelRatio,uHeight;
attribute vec3 aScatter;
attribute float aSeed;
varying float vAlpha;
void main(){
  vec3 p=position+aScatter*(1.-uSignature);
  p.z+=sin(uTime*.5+aSeed*6.)*.06*(1.-uSignature);
  vec4 view=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*view;
  gl_PointSize=clamp(1.9*uPixelRatio*(uHeight/800.)*32./max(1.,-view.z),1.2,5.);
  vAlpha=mix(.025,.85,uSignature)*(.65+aSeed*.35);
}`;
export const signatureFragment = /* glsl */`
varying float vAlpha;
void main(){
  vec2 p=gl_PointCoord-.5;
  float glow=exp(-dot(p,p)*14.)*(1.-smoothstep(.35,.5,length(p)));
  gl_FragColor=vec4(.9,.8,.64,glow*vAlpha);
}`;
export const fieldFragment = /* glsl */`
uniform sampler2D uAtlas;
varying vec3 vColor;
varying float vAlpha,vGlyph,vIndex;
void main(){
  vec2 p=gl_PointCoord-.5;
  float point=exp(-dot(p,p)*21.)*(1.-smoothstep(.3,.5,length(p)));
  vec2 uv=vec2((vIndex+gl_PointCoord.x)/8.,1.-gl_PointCoord.y);
  float character=texture2D(uAtlas,uv).a;
  float alpha=mix(point,character,vGlyph)*vAlpha;
  if(alpha<.01)discard;
  gl_FragColor=vec4(vColor,alpha);
}`;
