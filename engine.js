/* 映像処理は WebGL 1 / GLSL ES 1.00。低解像度の2枚のFBOを交互に使う。 */
(() => {
'use strict';
const modes = [
 {id:'DMG-89',sub:'Reflective LCD / 1989',desc:'4階調の反射型液晶。ディザと応答の遅さで世界を描く。',w:160,h:144,fps:20,char:.75,mem:.34,signal:.08,texture:.5,pal:0},
 {id:'CGB-98',sub:'Tile colour LCD / 1998',desc:'8×8タイルごとに色を制限するカラー液晶の解釈。',w:160,h:144,fps:24,char:.7,mem:.2,signal:.03,texture:.48,pal:0},
 {id:'POCKET-98',sub:'Pocket sensor / 1998',desc:'粗いセンサー、輪郭強調、4階調の写真性。',w:128,h:112,fps:12,char:.82,mem:.13,signal:.16,texture:.12,pal:1},
 {id:'PXL-87',sub:'Magnetic video / 1987',desc:'暗部の信号ノイズと水平の滲み。カセット映像へのオマージュ。',w:120,h:90,fps:15,char:.73,mem:.18,signal:.42,texture:.16,pal:1},
 {id:'WRIST-00',sub:'Personal archive / 2000',desc:'正方形、16階調。狭い感度域を持つ腕時計型の記録機器。',w:120,h:120,fps:8,char:.62,mem:.25,signal:.12,texture:.14,pal:1},
 {id:'SLOWSCAN',sub:'Narrowband transmission',desc:'走査線ごとに時間を記録。Living scan と Transmission を切替。',w:120,h:120,fps:30,char:.72,mem:.16,signal:.22,texture:.15,pal:1},
 {id:'PAPER MEMORY',sub:'Unreleased / bistable display',desc:'部分更新と残留像。前の世界が紙のように画面に残る。',w:180,h:135,fps:12,char:.8,mem:.72,signal:.08,texture:.12,pal:1,fiction:true},
 {id:'AMBER MEMORY',sub:'Unreleased / phosphor archive',desc:'琥珀色の光が蓄積し、移動する被写体の軌跡が残る。',w:192,h:144,fps:24,char:.65,mem:.82,signal:.1,texture:.25,pal:3,fiction:true},
 {id:'DISTANT SIGNAL',sub:'Unreleased / packet receiver',desc:'画面の領域ごとに異なる更新周期。過去と現在が混在する。',w:160,h:120,fps:18,char:.72,mem:.68,signal:.35,texture:.12,pal:2,fiction:true}
];
const vertex=`attribute vec2 a; varying mediump vec2 uv; void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;
const process=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying mediump vec2 uv; uniform sampler2D src,history,held; uniform vec2 res,srcSize; uniform float mode,exposure,contrast,character,memory,signal,seed,tick,phase,priorPhase,scanMode,first,mirror,ratio,dt; uniform float palette;
float hash(vec2 p){return fract(sin(dot(mod(p,vec2(127.,113.)),vec2(12.9898,78.233)))*437.3);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
float bayer(vec2 p){vec2 a=mod(floor(p),2.);vec2 b=mod(floor(p/2.),2.);float x=2.*a.x+3.*a.y-4.*a.x*a.y;float y=2.*b.x+3.*b.y-4.*b.x*b.y;return (4.*x+y+.5)/16.-.5;}
vec2 crop(vec2 p){vec2 scale=vec2(min(1.,ratio/(srcSize.x/srcSize.y)),min(1.,(srcSize.x/srcSize.y)/ratio));vec2 q=(p-.5)*scale+.5;if(mirror>.5)q.x=1.-q.x;return clamp(q,0.,1.);}
vec3 sampleSrc(vec2 p){return texture2D(src,crop(p)).rgb;}
float grade(float l){return clamp((l*exp2(exposure)-.5)*contrast+.5,0.,1.);}
float quant(float l,float steps,float d){return clamp(floor(l*(steps-1.)+.5+d)/(steps-1.),0.,1.);}
vec3 mono(float v){if(palette<.5){if(v<.167)return vec3(.059,.22,.059);if(v<.5)return vec3(.188,.384,.188);if(v<.833)return vec3(.545,.675,.059);return vec3(.608,.737,.059);}if(palette<1.5)return mix(vec3(.045,.047,.043),vec3(.95,.95,.90),v);if(palette<2.5)return mix(vec3(.045,.085,.13),vec3(.81,.89,.93),v);return mix(vec3(.10,.045,.015),vec3(1.,.73,.29),v);}
// 時間定数を秒で指定。内部fpsを変えても残像の長さを保つ。
float retain(float tau){return exp(-dt/max(.005,tau));}
vec3 response(vec3 target,vec3 old,float up,float down){
 if(first>.5)return target;
 float tau=lum(target)>lum(old)?up:down;
 return mix(target,old,retain(tau));
}
void main(){
 vec2 p=floor(uv*res),q=(p+.5)/res,px=1./res;
 vec3 old=texture2D(history,q).rgb,c=sampleSrc(q),outc;
 float raw=lum(c),l=grade(raw),d=bayer(p)*character*1.35;
 float n=hash(p+vec2(mod(tick,97.)+mod(seed,113.),mod(seed,97.)))-.5;
 float fixedNoise=hash(p+vec2(mod(seed,89.),17.))-.5;
 if(mode<.5){
  // 反射型LCD: 明るく戻る応答を暗くなる応答より遅くする。
  float v=quant(l,4.,d);outc=response(mono(v),old,.008+memory*.42,.008+memory*.13);
 }else if(mode<1.5){
  // タイル内で共通の色軸。各画素は4段階の輝度のみ選ぶ。
  vec2 tile=(floor(p/8.)*8.+4.)/res;
  vec3 t=(sampleSrc(tile)+sampleSrc(tile+vec2(3.,3.)*px)+sampleSrc(tile-vec2(3.,3.)*px)+sampleSrc(tile+vec2(-3.,3.)*px))*.25;
  vec3 hue=clamp((t-lum(t))*.95+vec3(.03,.025,-.025),-.36,.36);
  hue=floor(hue*8.+.5)/8.;float v=quant(l,4.,d);
  outc=clamp(vec3(.10+.77*v)+hue*(.5+.5*v)*character,0.,1.);
  if(palette>.5)outc=mix(outc,mono(v),.62);
  outc=response(outc,old,.008+memory*.24,.008+memory*.10);
 }else if(mode<2.5){
  // 粗い撮像素子: 周辺光量落ち、固定パターン、局所的な輪郭強調。
  float e=lum(sampleSrc(q+vec2(px.x,0.)))+lum(sampleSrc(q-vec2(px.x,0.)))+lum(sampleSrc(q+vec2(0.,px.y)))+lum(sampleSrc(q-vec2(0.,px.y)));
  float sensor=raw*(1.-.42*character*dot(q-.5,q-.5));
  l=grade(sensor+(4.*raw-e)*character*.52+fixedNoise*signal*.23+n*signal*.07);
  outc=response(mono(quant(l,4.,d)),old,.008+memory*.10,.008+memory*.07);
 }else if(mode<3.5){
  // 磁気記録: 低域通過、暗部の信号対雑音比、行単位の同期誤差。
  float row=p.y,epoch=floor(mod(tick,1000.)/3.);
  float drift=(hash(vec2(floor(row/3.),mod(epoch,89.)+mod(seed,83.)))-.5)*signal*(.5+3.*character);
  vec2 z=q+vec2(drift*px.x,0.);
  float v=lum(sampleSrc(z))*.40+(lum(sampleSrc(z+vec2(px.x,0.)))+lum(sampleSrc(z-vec2(px.x,0.))))*.21+(lum(sampleSrc(z+vec2(2.*px.x,0.)))+lum(sampleSrc(z-vec2(2.*px.x,0.))))*.09;
  v=mix(raw,v,character);float shadow=pow(1.-v,2.);
  float rowNoise=hash(vec2(row,mod(tick,71.)+mod(seed,53.)))-.5;
  float loss=step(1.-signal*.07,hash(vec2(floor(row/2.),mod(epoch,79.)+mod(seed,61.))));
  float segment=step(hash(vec2(row,mod(epoch,67.))),q.x);
  v=grade(v+signal*(n*(.045+.24*shadow)+rowNoise*.055+fixedNoise*.04));
  v=mix(v,v*.52+rowNoise*.035,loss*segment);v=quant(clamp(v,0.,1.),32.,d*.18);
  outc=response(mono(v),old,.008+memory*.12,.008+memory*.22);
 }else if(mode<4.5){
  float radius=length((q-.5)*1.4);
  l=grade(raw*(.88-.40*radius*character)+fixedNoise*signal*.18+n*signal*.06);
  outc=response(mono(quant(l,16.,d*.45)),old,.012+memory*.26,.012+memory*.16);
 }else if(mode<5.5){
  // Transmissionの周回境界: 旧画像の末尾と新画像の先頭を分ける。
  float line=1.-q.y,wrapped=1.-step(priorPhase,phase);
  float pass=wrapped>.5?max(step(priorPhase,line),step(line,phase)):step(priorPhase,line)*step(line,phase);
  float nextHead=wrapped*step(line,phase);
  float v=scanMode>.5?mix(lum(texture2D(held,q).rgb),raw,nextHead):raw;
  float rowError=hash(vec2(p.y,mod(seed,113.)))-.5;
  v=grade(v+signal*(rowError*.10+n*.09));outc=mono(quant(v,32.,d*.25));
  outc=first>.5?mono(0.):mix(old,outc,pass);
 }else if(mode<6.5){
  // 電子ペーパー: ブロックごとの更新順序と変化検出。全画面点滅はさせない。
  vec3 target=mono(quant(l,4.,d));vec2 block=floor(p/vec2(12.,8.));
  float slot=floor(hash(block+vec2(mod(seed,79.),11.))*8.);
  float turn=1.-step(.5,abs(mod(tick,8.)-slot));
  float sweep=1.-step(.5,abs(mod(floor(tick/8.),5.)-floor(hash(block+vec2(23.,mod(seed,61.)))*5.)));
  float change=step(.045+memory*.11,length(target-old));
  float a=mix(1.,turn*max(change,sweep),smoothstep(0.,.35,memory));
  outc=first>.5?target:mix(old,target,a*(1.-memory*.42));
 }else if(mode<7.5){
  // 蛍光体: 速い発光、秒単位の暗い残光。RGBごとに減衰を変える。
  vec3 target=mono(quant(l,32.,d*.2))*pow(l,.65);
  vec3 decay=exp(-dt/vec3(.025+memory*2.2,.025+memory*1.5,.025+memory*.65));
  outc=first>.5?target:max(target,old*decay);
 }else{
  // 低帯域受信: 領域ごとの固定スロットとバースト欠損、差分更新。
  vec2 block=floor(p/vec2(12.,10.));float slots=2.+floor(memory*10.);
  float slot=floor(hash(block+vec2(mod(seed,113.),19.))*slots);
  float turn=1.-step(.5,abs(mod(tick,slots)-slot));
  float epoch=floor(tick/slots);
  float available=step(signal*.76,hash(block+vec2(mod(epoch,97.),mod(seed,83.))));
  vec3 target=mono(quant(l,8.,d));float diff=step(.035,length(target-old));
  float repair=1.-step(.5,mod(epoch+slot,5.));
  float update=turn*available*max(diff,repair);
  outc=first>.5?target:mix(old,target,mix(1.,update,smoothstep(0.,.30,max(memory,signal))));
 }
 gl_FragColor=vec4(clamp(outc,0.,1.),1.);
}`;
const copy=`precision mediump float;varying mediump vec2 uv;uniform sampler2D src;uniform vec2 srcSize;uniform float ratio,mirror;void main(){float r=srcSize.x/srcSize.y;vec2 s=vec2(min(1.,ratio/r),min(1.,r/ratio));vec2 q=(uv-.5)*s+.5;if(mirror>.5)q.x=1.-q.x;gl_FragColor=texture2D(src,q);}`;
const display=`precision mediump float; varying mediump vec2 uv;uniform sampler2D src;uniform vec2 res;uniform float textureAmount,mode,ratio,nativeRatio;void main(){vec2 scale=vec2(min(1.,nativeRatio/ratio),min(1.,ratio/nativeRatio));vec2 q=(uv-.5)/scale+.5;if(q.x<0.||q.x>1.||q.y<0.||q.y>1.){gl_FragColor=vec4(.025,.027,.025,1.);return;}vec3 c=texture2D(src,q).rgb;vec2 f=fract(q*res);float mask=1.;if(mode<2.5){mask=1.-textureAmount*.32*max(step(f.x,.12),step(f.y,.12));}else if(mode>6.5&&mode<7.5){mask=1.-textureAmount*.23*step(f.y,.23);}else{mask=1.-textureAmount*.12*step(f.y,.18);}gl_FragColor=vec4(c*mask,1.);}`;
class Engine {
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!this.gl)throw Error('WebGL is unavailable. Enable hardware acceleration / WebGL.');this.init();}
 init(){const g=this.gl;this.programs={process:this.program(process),copy:this.program(copy),display:this.program(display)};this.buf=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.buf);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);this.src=this.tex(g.LINEAR);g.bindTexture(g.TEXTURE_2D,this.src);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));this.targets=[];this.w=0;this.h=0;this.sw=1;this.sh=1;this.uploaded=false;this.reset();g.disable(g.DEPTH_TEST);g.disable(g.BLEND);}
 program(fs){const g=this.gl;const compile=(type,src)=>{let s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;};let v=compile(g.VERTEX_SHADER,vertex),f=compile(g.FRAGMENT_SHADER,fs),p=g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return {p,a:g.getAttribLocation(p,'a'),u:new Map()};}
 tex(filter){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);return t;}
 target(w,h){const g=this.gl,t=this.tex(g.NEAREST),f=g.createFramebuffer();g.texImage2D(g.TEXTURE_2D,0,g.RGBA,w,h,0,g.RGBA,g.UNSIGNED_BYTE,null);g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,t,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Framebuffer incomplete');g.viewport(0,0,w,h);g.clearColor(0,0,0,1);g.clear(g.COLOR_BUFFER_BIT);return {t,f};}
 configure(w,h){if(w===this.w&&h===this.h)return;const g=this.gl;for(const t of this.targets){g.deleteTexture(t.t);g.deleteFramebuffer(t.f);}this.targets=[this.target(w,h),this.target(w,h),this.target(w,h)];g.bindFramebuffer(g.FRAMEBUFFER,null);this.w=w;this.h=h;this.reset();}
 reset(){this.first=true;this.index=0;this.tick=0;this.phase=0;this.lastTime=null;}
 upload(source,w,h){const g=this.gl;if(!w||!h)return false;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.src);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);if(w===this.sw&&h===this.sh&&this.uploaded)g.texSubImage2D(g.TEXTURE_2D,0,0,0,g.RGBA,g.UNSIGNED_BYTE,source);else{g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,source);this.sw=w;this.sh=h;this.uploaded=true;}return true;}
 draw(name,target,w,h,uniforms,textures){const g=this.gl,p=this.programs[name];g.bindFramebuffer(g.FRAMEBUFFER,target?target.f:null);g.viewport(0,0,w,h);g.useProgram(p.p);g.bindBuffer(g.ARRAY_BUFFER,this.buf);g.enableVertexAttribArray(p.a);g.vertexAttribPointer(p.a,2,g.FLOAT,false,0,0);const loc=k=>{if(!p.u.has(k))p.u.set(k,g.getUniformLocation(p.p,k));return p.u.get(k);};Object.entries(textures).forEach(([k,t],i)=>{g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(loc(k),i);});for(const [k,v] of Object.entries(uniforms)){if(Array.isArray(v))g.uniform2f(loc(k),v[0],v[1]);else g.uniform1f(loc(k),v);}g.drawArrays(g.TRIANGLE_STRIP,0,4);g.activeTexture(g.TEXTURE0);}
 step(now,mode,s,mirror){const w=this.w,h=this.h,ratio=w/h,dt=this.lastTime===null?0:Math.min(.25,Math.max(0,now-this.lastTime));this.lastTime=now;let prior=this.phase;this.phase=(this.phase+dt/s.scanSeconds)%1;if(mode===5&&this.first)this.draw('copy',this.targets[2],w,h,{srcSize:[this.sw,this.sh],ratio,mirror},{src:this.src});const next=1-this.index;this.draw('process',this.targets[next],w,h,{res:[w,h],srcSize:[this.sw,this.sh],mode,exposure:s.exposure,contrast:s.contrast,character:s.character,memory:s.memory,dt:this.first?1/s.rate:dt,signal:s.signal,seed:s.seed%4093,tick:this.tick%3600,phase:this.phase,priorPhase:prior,scanMode:s.scanMode,first:this.first?1:0,mirror,ratio,palette:s.palette},{src:this.src,history:this.targets[this.index].t,held:this.targets[2].t});if(mode===5&&this.phase<prior)this.draw('copy',this.targets[2],w,h,{srcSize:[this.sw,this.sh],ratio,mirror},{src:this.src});this.first=false;this.index=next;this.tick++;}
 present(mode,s){if(!this.w||this.first)return;this.draw('display',null,this.canvas.width,this.canvas.height,{res:[this.w,this.h],textureAmount:s.texture,mode,ratio:this.canvas.width/this.canvas.height,nativeRatio:this.w/this.h},{src:this.targets[this.index].t});}
}
window.SignalEngine=Engine;window.SignalModes=modes;
})();
