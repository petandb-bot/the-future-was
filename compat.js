/* 低解像度の Canvas 2D 互換エンジン。WebGL が利用不能な場合のみ使用。
 * GPU版の厳密な再現ではない。毎フレームの読み出しは最大192px長辺。 */
(()=>{
'use strict';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lum=(a,i)=>(.299*a[i]+.587*a[i+1]+.114*a[i+2])/255;
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const palettes=[[[15,56,15],[48,98,48],[139,172,15],[155,188,15]],[[12,12,11],[242,242,230]],[[12,22,33],[207,227,237]],[[26,11,4],[255,186,74]]];
function hash(x,y,t,seed){let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(t+1,1274126177)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function color(p,v,k){if(p===0)return palettes[0][Math.min(3,Math.max(0,Math.round(v*3)))][k];const a=palettes[p]||palettes[1];return a[0][k]+(a[1][k]-a[0][k])*v;}
class CompatEngine{
 constructor(canvas){
  this.canvas=canvas;this.kind='2d';this.out=canvas.getContext('2d',{alpha:false});
  this.sensor=document.createElement('canvas');this.ctx=this.sensor.getContext('2d',{alpha:false,willReadFrequently:true});
  this.surface=document.createElement('canvas');this.surfaceCtx=this.surface.getContext('2d',{alpha:false});
  if(!this.out||!this.ctx||!this.surfaceCtx)throw Error('Canvas 2D unavailable');
  this.w=0;this.h=0;this.reset();
 }
 isLost(){return !!this.out.isContextLost?.();}
 configure(w,h){if(w===this.w&&h===this.h)return;this.w=w;this.h=h;this.sensor.width=this.surface.width=w;this.sensor.height=this.surface.height=h;this.frame=this.surfaceCtx.createImageData(w,h);this.reset();}
 reset(){this.first=true;this.lastTime=null;this.phase=0;this.tick=0;this.held=null;}
 upload(source,w,h){if(!w||!h)return false;this.source=source;this.sw=w;this.sh=h;return true;}
 step(now,mode,s,mirror){
  const w=this.w,h=this.h;if(!w||!h||!this.source)return;
  const dt=this.lastTime===null?1/12:clamp(now-this.lastTime,0,.25);this.lastTime=now;
  const prior=this.phase;this.phase=(prior+dt/Math.max(1,s.scanSeconds))%1;
  const wrap=this.phase<prior,ratio=w/h,srcRatio=this.sw/this.sh;
  const cw=srcRatio>ratio?this.sh*ratio:this.sw,ch=srcRatio>ratio?this.sh:this.sw/ratio;
  const ctx=this.ctx;ctx.setTransform(mirror?-1:1,0,0,1,mirror?w:0,0);
  ctx.drawImage(this.source,(this.sw-cw)/2,(this.sh-ch)/2,cw,ch,0,0,w,h);ctx.setTransform(1,0,0,1,0,0);
  const a=ctx.getImageData(0,0,w,h).data,old=this.frame.data;
  if(mode===5&&this.first)this.held=new Uint8ClampedArray(a);
  const ticks=this.tick,seed=s.seed|0,grade=l=>clamp((l*2**s.exposure-.5)*s.contrast+.5);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,l=lum(a,i),n=hash(x,y,ticks%1000,seed)-.5;
   // 追加2機種は既存の9機種の処理を通さない。
   if(mode===9){
    const previous=this.held?lum(this.held,i):l,gain=2**s.exposure,delta=this.first?0:Math.log(.05+gain*l)-Math.log(.05+gain*previous);
    const threshold=.22-.185*s.character,v=clamp((Math.abs(delta)-threshold)*s.contrast*2.5)*(hash(x,y,ticks,seed)>=s.signal*.5?1:0);
    const on=[[122,240,212],[240,240,240],[166,224,255],[255,209,102]],off=[[250,107,51],[107,107,107],[61,110,186],[173,66,23]];
    const tint=(delta>=0?on:off)[s.palette]||on[0],decay=Math.exp(-dt/(.025+s.memory*1.9));
    for(let k=0;k<3;k++)old[i+k]=Math.max(v*tint[k],this.first?0:old[i+k]*decay);
    old[i+3]=255;continue;
   }
   if(mode===10){
    const graded=grade(l),dwell=1+Math.floor(s.memory*4),slot=Math.floor(ticks/dwell)%3;
    const keep=hash(x>>3,y>>3,Math.floor(ticks/dwell),seed)>=s.signal*.5;
    const t=clamp(s.memory/.15),strength=t*t*(3-2*t);
    for(let k=0;k<3;k++){
     let target=clamp(graded+(grade(a[i+k]/255)-graded)*(.45+s.character*1.35));
     if(s.palette!==0)target=color(s.palette,graded,k)/255;
     target=Math.round(target*15)/15*255;
     const mix=this.first?1:1-strength+strength*(keep&&k===slot?1:0);
     old[i+k]+=(target-old[i+k])*mix;
    }
    old[i+3]=255;continue;
   }
   const d=(bayer[(y%4)*4+x%4]/16-.5)*s.character*1.35;
   let v=l,levels=4,amount=1,pass=true,decay=0;
   if(mode===2){const left=lum(a,(y*w+Math.max(0,x-1))*4),right=lum(a,(y*w+Math.min(w-1,x+1))*4);v=l*(1-.35*s.character*((x/w-.5)**2+(y/h-.5)**2))+(2*l-left-right)*s.character*.93+(hash(x,y,0,seed)-.5)*s.signal*.30+n*s.signal*.05;}
   if(mode===3){const left=lum(a,(y*w+Math.max(0,x-1))*4),right=lum(a,(y*w+Math.min(w-1,x+1))*4);v=.5*l+.25*(left+right)+n*s.signal*(.08+.24*(1-l));levels=32;if(hash(0,y,ticks,seed)>1-s.signal*.045)v*=.45;}
   if(mode===4){const left=lum(a,(y*w+Math.max(0,x-1))*4),right=lum(a,(y*w+Math.min(w-1,x+1))*4),up=lum(a,(Math.max(0,y-1)*w+x)*4),down=lum(a,(Math.min(h-1,y+1)*w+x)*4);const soft=.42*l+.145*(left+right+up+down);v=(l+(soft-l)*s.character)*(.94-.56*((x/w-.5)**2+(y/h-.5)**2)*s.character)+n*s.signal*.08;levels=16;}
   if(mode===5){const line=(y+.5)/h;pass=wrap?line>=prior||line<=this.phase:line>=prior&&line<=this.phase;v=s.scanMode>.5&&this.held&&!(wrap&&line<=this.phase)?lum(this.held,i):l;v+=n*s.signal*.15;levels=32;}
   if(mode===6){const slot=Math.floor(hash(x>>3,y>>3,0,seed)*8);pass=s.memory<.03||ticks%8===slot;amount=1-s.memory*.5;}
   if(mode===7){levels=32;decay=Math.exp(-dt/(.04+s.memory*2));}
   if(mode===8){levels=8;const slots=2+Math.floor(s.memory*12),bx=Math.floor(x/16),by=Math.floor(y/12),slot=Math.floor(hash(bx,by,0,seed)*slots);pass=(s.memory<.03&&s.signal<.03)||(ticks%slots===slot&&hash(bx,by,Math.floor(ticks/slots),seed)>s.signal*.82);}
   v=clamp(Math.round(grade(v)*(levels-1)+d*(mode===4?.12:mode===8?.3:mode===2?.76:1))/(levels-1));
   if(mode<5&&!this.first)amount=mode===0?1-Math.exp(-dt/(.008+s.memory*(v>lum(old,i)?.40:.11))):1-s.memory*(mode===2?.28:.55);
   if(mode===5&&this.first)v=0;
   if(this.first||pass){
    const ti=(Math.min(h-1,(y>>3)*8+4)*w+Math.min(w-1,(x>>3)*8+4))*4,tl=lum(a,ti);
    for(let k=0;k<3;k++){
     let target=mode===6&&s.palette===1?[38,41,33][k]+([224,224,207][k]-[38,41,33][k])*v:color(s.palette,v,k);
     if(mode===1&&s.palette===0)target=clamp(.10+.77*v+(a[ti+k]/255-tl)*s.character*1.45*(.4+.6*v))*255;
     if(mode===7){target*=Math.pow(v,.65);old[i+k]=this.first?target:Math.max(target,old[i+k]*decay);}
     else old[i+k]=this.first?target:old[i+k]+(target-old[i+k])*amount;
    }
   }
   old[i+3]=255;
  }
  if(mode===9){if(!this.held||this.held.length!==a.length)this.held=new Uint8ClampedArray(a);else this.held.set(a);}else if(mode===5&&wrap)this.held=new Uint8ClampedArray(a);
  this.surfaceCtx.putImageData(this.frame,0,0);this.first=false;this.tick++;
 }
 present(mode,s){
  if(this.first||this.isLost())return;
  const c=this.canvas,ctx=this.out,scale=Math.min(c.width/this.w,c.height/this.h),w=this.w*scale,h=this.h*scale;
  ctx.fillStyle='#080908';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(this.surface,(c.width-w)/2,(c.height-h)/2,w,h);
  if(s.texture>.01&&scale>=3){ctx.fillStyle='rgba(0,0,0,'+(s.texture*.15)+')';const top=(c.height-h)/2,left=(c.width-w)/2;for(let j=0;j<this.h;j++)ctx.fillRect(left,top+j*scale,w,1);}
 }
}
window.SignalCompatEngine=CompatEngine;
})();
