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
varying mediump vec2 uv; uniform sampler2D src,history,held; uniform vec2 res,srcSize; uniform float mode,exposure,contrast,character,memory,signal,seed,tick,phase,priorPhase,scanMode,first,mirror,ratio; uniform float palette;
float hash(vec2 p){return fract(sin(dot(mod(p,vec2(127.,113.)),vec2(12.9898,78.233)))*437.3);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
float bayer(vec2 p){vec2 a=mod(floor(p),2.);vec2 b=mod(floor(p/2.),2.);float x=2.*a.x+3.*a.y-4.*a.x*a.y;float y=2.*b.x+3.*b.y-4.*b.x*b.y;return (4.*x+y+.5)/16.-.5;}
vec2 crop(vec2 p){vec2 scale=vec2(min(1.,ratio/(srcSize.x/srcSize.y)),min(1.,(srcSize.x/srcSize.y)/ratio));vec2 q=(p-.5)*scale+.5;if(mirror>.5)q.x=1.-q.x;return clamp(q,0.,1.);}
vec3 sampleSrc(vec2 p){return texture2D(src,crop(p)).rgb;}
float grade(float l){return clamp((l*exp2(exposure)-.5)*contrast+.5,0.,1.);}
float quant(float l,float steps,float d){return clamp(floor(l*(steps-1.)+.5+d)/(steps-1.),0.,1.);}
vec3 mono(float v){if(palette<.5){if(v<.167)return vec3(.059,.22,.059);if(v<.5)return vec3(.188,.384,.188);if(v<.833)return vec3(.545,.675,.059);return vec3(.608,.737,.059);}if(palette<1.5)return mix(vec3(.045,.047,.043),vec3(.95,.95,.90),v);if(palette<2.5)return mix(vec3(.045,.085,.13),vec3(.81,.89,.93),v);return mix(vec3(.10,.045,.015),vec3(1.,.73,.29),v);}
void main(){vec2 p=floor(uv*res);vec2 q=(p+.5)/res;vec3 old=first>.5?vec3(0.):texture2D(history,q).rgb;float d=bayer(p)*character*1.5;float n=hash(p+vec2(mod(tick,97.)+mod(seed,113.),mod(seed,97.)))-.5;vec3 c=sampleSrc(q);float l=grade(lum(c));vec3 outc;
 if(mode<.5){outc=mono(quant(l,4.,d));outc=mix(outc,old,memory*.78);}
 else if(mode<1.5){ // タイルの代表色から4階調のパレットを構築
 vec2 tile=(floor(p/8.)*8.+4.)/res;vec3 t=(sampleSrc(tile)+sampleSrc(tile+vec2(3.,3.)/res)+sampleSrc(tile-vec2(3.,3.)/res)+sampleSrc(tile+vec2(-3.,3.)/res))*.25;vec3 hue=clamp((t-lum(t))*.95+vec3(.03,.025,-.025),-.36,.36);hue=floor(hue*8.+.5)/8.;float v=quant(l,4.,d);outc=clamp(vec3(.08+.79*v)+hue*(.65+.35*v)*character,0.,1.);if(palette>.5)outc=mix(outc,mono(v),.62);outc=mix(outc,old,memory*.72);}
 else if(mode<2.5){float e=lum(sampleSrc(q+vec2(1.,0.)/res))+lum(sampleSrc(q-vec2(1.,0.)/res))+lum(sampleSrc(q+vec2(0.,1.)/res))+lum(sampleSrc(q-vec2(0.,1.)/res));l=grade(lum(c)+(4.*lum(c)-e)*character*.65+n*signal*.16);outc=mono(quant(l,4.,d*1.18));outc=mix(outc,old,memory*.55);}
 else if(mode<3.5){float row=floor(p.y);float jitter=(hash(vec2(row,mod(tick,83.)+mod(seed,89.)))-.5)*signal*3.;vec2 s=q+vec2(jitter/res.x,0.);float v=lum(sampleSrc(s))*.54+lum(sampleSrc(s+vec2(1.3,0.)/res))*.25+lum(sampleSrc(s-vec2(1.3,0.)/res))*.21;v=grade(v+n*signal*(.10+.26*(1.-v)));float dropout=step(1.-signal*.045,hash(vec2(floor(row/2.),mod(tick,89.))));v=mix(v,v*.38+n*.1,dropout);v=clamp(v+(hash(vec2(row,mod(tick,71.)))-.5)*signal*.09,0.,1.);v=quant(v,32.,d*.4);outc=mono(v);outc=mix(outc,old,memory*.6);}
 else if(mode<4.5){float radius=length((q-.5)*1.4);l=grade(lum(c)*(.87-.32*radius*character)+n*signal*.2);outc=mono(quant(l,16.,d*.65));outc=mix(outc,old,memory*.75);}
 else if(mode<5.5){float line=1.-q.y;float pass=priorPhase<=phase?step(priorPhase,line)*step(line,phase):max(step(priorPhase,line),step(line,phase));float v=scanMode>.5?lum(texture2D(held,q).rgb):lum(c);v=grade(v+n*signal*.18);outc=mono(quant(v,32.,d*.3));if(first<.5)outc=mix(old,outc,pass);else outc=vec3(.045);}
 else if(mode<6.5){float v=quant(l,4.,d);outc=mono(v);float block=hash(floor(p/vec2(12.,8.))+vec2(mod(tick,71.),mod(seed,79.)));float update=step(memory*.9,block);float changed=step(.065,length(old-outc));float a=update*changed;outc=mix(old,outc,a*(1.-memory*.66));if(mod(tick,48.)<.5)outc=mix(old,mono(v),.72);}
 else if(mode<7.5){outc=mono(quant(l,32.,d*.2))*pow(l,.6);outc=max(outc,old*(.73+memory*.265));}
 else {vec2 block=floor(p/vec2(12.,10.));float h=hash(block+vec2(floor(mod(tick,240.)/(2.+memory*9.)),mod(seed,113.)));float v=quant(l,8.,d);outc=mono(v);outc=mix(old,outc,step(memory*.83+signal*.12,h));}
 if(first>.5 && (mode<5.5||mode>6.5))outc=mode>4.5&&mode<5.5?vec3(.045):((mode<.5||mode>1.5&&mode<2.5)?mono(quant(l,4.,d)):outc);gl_FragColor=vec4(clamp(outc,0.,1.),1.);}`;
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
 step(now,mode,s,mirror){const w=this.w,h=this.h,ratio=w/h,dt=this.lastTime===null?0:Math.min(.25,Math.max(0,now-this.lastTime));this.lastTime=now;let prior=this.phase;this.phase=(this.phase+dt/s.scanSeconds)%1;if(mode===5&&(this.first||this.phase<prior))this.draw('copy',this.targets[2],w,h,{srcSize:[this.sw,this.sh],ratio,mirror},{src:this.src});const next=1-this.index;this.draw('process',this.targets[next],w,h,{res:[w,h],srcSize:[this.sw,this.sh],mode,exposure:s.exposure,contrast:s.contrast,character:s.character,memory:this.first?0:s.memory,signal:s.signal,seed:s.seed%4093,tick:this.tick%1000,phase:this.phase,priorPhase:prior,scanMode:s.scanMode,first:this.first?1:0,mirror,ratio,palette:s.palette},{src:this.src,history:this.targets[this.index].t,held:this.targets[2].t});this.first=false;this.index=next;this.tick++;}
 present(mode,s){if(!this.w||this.first)return;this.draw('display',null,this.canvas.width,this.canvas.height,{res:[this.w,this.h],textureAmount:s.texture,mode,ratio:this.canvas.width/this.canvas.height,nativeRatio:this.w/this.h},{src:this.targets[this.index].t});}
}
window.SignalEngine=Engine;window.SignalModes=modes;
})();
