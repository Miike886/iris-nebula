export const fieldVertex = /* glsl */`
uniform float uTime, uMatter, uPixelRatio, uHeight, uPulse, uHover;
uniform vec3 uRayOrigin, uRayDirection, uHit;
attribute vec3 aHome, aColor;
attribute float aSeed, aKind;
varying vec3 vColor;
varying float vAlpha, vGlyph, vSeed, vKind;
void main() {
  float photo = max(0., uMatter - 1.);
  vec3 p = position;
  if(aKind < .5) {
    float nearEye = 1. - smoothstep(4., 14., min(distance(cameraPosition, vec3(-7.5,0.,2.)), distance(cameraPosition, vec3(7.5,0.,2.))));
    p = mix(p, aHome, max(photo * .96, nearEye * .82));
  }
  float motion = aKind < .5 ? .12 : .42;
  p += vec3(sin(uTime*.25+aSeed*37.+p.y*.2), cos(uTime*.19+aSeed*29.+p.x*.16), sin(uTime*.16+aSeed*17.)) * motion;
  vec3 toPoint = p-uRayOrigin;
  float alongRay = max(0., dot(toPoint,uRayDirection));
  vec3 fromRay = p-(uRayOrigin+uRayDirection*alongRay);
  float d = length(fromRay);
  p += normalize(fromRay+vec3(.001)) * (1.-smoothstep(0.,2.5,d)) * uHover * 1.1;
  float age = uTime-uPulse;
  float waveDistance = distance(p,uHit);
  float wave = sin(waveDistance*3.-age*9.) * exp(-pow((waveDistance-age*5.)/2.2,2.)) * exp(-age*.8);
  if(age>=0. && age<4.) p += normalize(p-uHit+vec3(.001))*wave*.8;
  vec4 view = modelViewMatrix*vec4(p,1.);
  gl_Position = projectionMatrix*view;
  float glyph = 1.-abs(uMatter-1.);
  float nearArchive = 1.-smoothstep(4.,16.,distance(cameraPosition,vec3(1.,4.,-15.)));
  vGlyph = max(glyph,nearArchive*.9);
  if(aKind>1.5) vGlyph = max(.7,vGlyph);
  float size = aKind<.5 ? mix(3.0,10.,vGlyph) : mix(2.,8.,vGlyph);
  gl_PointSize = clamp(size * uPixelRatio * (uHeight/800.) * 22./max(1.,-view.z), 1., 62.);
  float lum = dot(aColor,vec3(.2126,.7152,.0722));
  vAlpha = (aKind < .5 ? (.4+lum*.6)*(1.-photo*.8) : .62) * smoothstep(0.35,1.8,-view.z);
  vAlpha *= 1.-smoothstep(65.,120.,-view.z);
  vAlpha *= 1. + (1.-smoothstep(0.,2.5,d))*uHover*.5;
  vColor = aColor; vSeed = aSeed; vKind = aKind;
}`;
export const fieldFragment = /* glsl */`
uniform sampler2D uAtlas;
varying vec3 vColor;
varying float vAlpha,vGlyph,vSeed,vKind;
void main(){
  vec2 p=gl_PointCoord-.5;
  float dotAlpha=exp(-dot(p,p)*23.)*(1.-smoothstep(.3,.5,length(p)));
  float glyphIndex=floor(fract(vSeed*13.)*8.);
  vec2 uv=vec2((glyphIndex+gl_PointCoord.x)/8.,1.-gl_PointCoord.y);
  float letter=texture2D(uAtlas,uv).a;
  float alpha=mix(dotAlpha,letter,vGlyph)*vAlpha;
  if(alpha<.018) discard;
  gl_FragColor=vec4(vColor*(vKind<.5?1.2:1.55),alpha);
}`;
export const fragmentVertex = /* glsl */`
uniform float uTime,uMatter;
attribute vec3 aOffset;
attribute float aSeed;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv=uv;
  float photo=max(0.,uMatter-1.);
  float nearEye=1.-smoothstep(4.,14.,min(distance(cameraPosition,vec3(-7.5,0.,2.)),distance(cameraPosition,vec3(7.5,0.,2.))));
  float formation=max(photo,nearEye*.9);
  vec3 p=position+aOffset*(1.-formation);
  p.z+=sin(uTime*.22+aSeed*12.)*.12*(1.-formation);
  vWorld=p;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
export const fragmentFragment = /* glsl */`
uniform sampler2D uPhoto;
uniform float uMatter,uHover;
uniform vec3 uRayOrigin,uRayDirection;
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vec3 color=texture2D(uPhoto,vUv).rgb;
  float edge=smoothstep(0.,.12,vUv.x)*(1.-smoothstep(.88,1.,vUv.x))*smoothstep(0.,.16,vUv.y)*(1.-smoothstep(.8,1.,vUv.y));
  float nearEye=1.-smoothstep(4.,14.,min(distance(cameraPosition,vec3(-7.5,0.,2.)),distance(cameraPosition,vec3(7.5,0.,2.))));
  float along=max(0.,dot(vWorld-uRayOrigin,uRayDirection));
  float reveal=(1.-smoothstep(.3,2.3,distance(vWorld,uRayOrigin+uRayDirection*along)))*uHover;
  float photo=max(0.,uMatter-1.);
  float ascii=1.-abs(uMatter-1.);
  float alpha=max(max(.15*(1.-ascii),photo*.97),max(nearEye*.7,reveal*.65));
  alpha*=edge*smoothstep(.6,2.,distance(cameraPosition,vWorld));
  if(alpha<.015)discard;
  gl_FragColor=vec4(color,alpha);
}`;
