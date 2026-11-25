(()=>{'use strict';
const $=id=>document.getElementById(id), modes=window.SignalModes, video=$('inputVideo'), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let canvas=$('screen');
const params=[['exposure','Exposure',-2,2,.05],['contrast','Contrast',.5,2.5,.05],['character','Character',0,1,.01],['memory','Memory',0,1,.01],['signal','Signal loss',0,1,.01],['texture','Display texture',0,1,.01],['rate','Internal frame rate',2,30,1],['scanSeconds','Scan period (s)',1,16,.5],['resolution','Sensor scale',.5,2,.25]];
const mobile=matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
const portraitStart=mobile&&matchMedia('(orientation: portrait)').matches;
let gpuState='starting',gpuEpoch=0,restoreTimer=null,fallbackReason='',mediaEpoch=0,photoPending=false;
let mode=0,s,engine,source='demo',input=null,stream=null,url=null,facing='environment',busy=false,rec=null,recStream=null,recTimer=null,recFailed=false,audioGraph=null,audioDest=null,lastResult=null,lastURL=null,lastStep=-1,lastPresent=-1,fpsStart=0,frames=0,dirty=true,lastError='',lastInputTime=-1,sourceUploaded=false,stopReason='',recordWhole=false,recordStart=0,bytesRecorded=0;
const demo=document.createElement('canvas');demo.width=640;demo.height=480;const ctx=demo.getContext('2d',{alpha:false});
const staging=document.createElement('canvas'),stageCtx=staging.getContext('2d',{alpha:false});
function uploadInput(el,w,h){if(engine.kind==='2d')return engine.upload(el,w,h);const f=Math.min(1,(mobile?720:1280)/Math.max(w,h));if(f===1)return engine.upload(el,w,h);const a=Math.max(1,Math.round(w*f)),b=Math.max(1,Math.round(h*f));if(staging.width!==a||staging.height!==b){staging.width=a;staging.height=b;}stageCtx.drawImage(el,0,0,a,b);return engine.upload(staging,a,b);}
const status=t=>$('status').textContent=t;
function updateSourceUI(){const active=source==='camera'?'camera':source==='demo'?'demo':'import';for(const id of ['camera','import','demo'])$(id).setAttribute('aria-pressed',String(id===active));$('play').textContent=video.paused?'Play':'Pause';}
function defaults(i){const m=modes[i];return {exposure:0,contrast:1.15,character:m.char,memory:m.mem,signal:m.signal,texture:m.texture,rate:m.fps,scanSeconds:8,resolution:1,palette:m.pal,seed:1987,scanMode:0,aspect:portraitStart?'9:16':'native',size:mobile?480:720,audio:'silent'};}
function timeLabel(n){n=Math.floor(Math.max(0,n||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
function sourceSize(){return source==='demo'?[640,480]:source==='photo'?[input?.naturalWidth||640,input?.naturalHeight||480]:[video.videoWidth||640,video.videoHeight||480];}
function geometry(m,s,sourceWH){
 const native=[Math.max(2,Math.round(m.w*s.resolution)),Math.max(2,Math.round(m.h*s.resolution))];
 const [a,b]=s.aspect==='native'?native:s.aspect==='original'?sourceWH:s.aspect.split(':').map(Number);
 const portrait=a<b&&s.aspect!=='native';
 const [w,h]=portrait?[Math.max(2,Math.round(Math.max(...native)*a/b)),Math.max(...native)]:native;
 let ow=s.size*a/Math.max(a,b),oh=s.size*b/Math.max(a,b);
 if(s.aspect==='native'){const f=Math.max(1,Math.floor(s.size/Math.max(w,h)));if(w*f%2===0&&h*f%2===0){ow=w*f;oh=h*f;}}
 const even=n=>Math.max(2,Math.round(n/2)*2);
 return {w,h,ow:even(ow),oh:even(oh),portrait};
}
function updateSize(){
 if(rec||photoPending||!engine||gpuState!=='ready'||engine.isLost())return;
 let {w,h,ow,oh,portrait}=geometry(modes[mode],s,sourceSize());
 if(engine.kind==='2d'){const scale=Math.min(1,192/Math.max(w,h));w=Math.max(2,Math.round(w*scale));h=Math.max(2,Math.round(h*scale));}
 try{
  if(canvas.width!==ow)canvas.width=ow;
  if(canvas.height!==oh)canvas.height=oh;
  engine.configure(w,h);
  $('stage').classList.toggle('portrait',portrait);
  $('spec').textContent=w+'×'+h+' / '+effectiveRate()+' FPS → '+ow+'×'+oh;
  dirty=true;
 }catch(e){if(engine.isLost())return;gpuFailure('GPU allocation failed: '+e.message);}
}
function effectiveRate(){return Math.min(s.rate,engine?.kind==='2d'?12:mobile?24:30);}
function gpuReady(){return gpuState==='ready'&&!!engine&&!engine.isLost();}
function reportGPU(message){console.warn('[Renderer]',String(message));}
function gpuFailure(message){
 reportGPU(message);
 if(engine?.kind==='2d'){gpuState='failed';status('Preview unavailable. Reopen the app.');if(rec){recFailed=true;stop('Drawing interrupted');}locks();return;}
 queueFallback(message);
}
function queueFallback(message){
 gpuEpoch++;fallbackReason=message;reportGPU(message);gpuState='fallback-pending';
 if(rec){recFailed=true;stop('GPU interrupted');}locks();
}
function startFallback(){
 if(gpuState!=='fallback-pending'||rec||busy||photoPending||document.hidden)return;
 clearTimeout(restoreTimer);gpuState='restoring';
 try{
  const old=canvas,next=old.cloneNode(false);
  const fallback=new window.SignalCompatEngine(next);
  if(engine?.kind==='webgl')engine.dispose();
  old.replaceWith(next);canvas=next;engine=fallback;
  next.addEventListener('contextlost',()=>{if(canvas===next)gpuFailure('Canvas 2D context lost. Reload to retry.');});
  gpuState='ready';resetMemory();updateSize();
  if(gpuState!=='ready')return;
  
  status(canvas.captureStream&&window.MediaRecorder?'':'Video recording unavailable');locks();
 }catch(e){gpuState='failed';reportGPU(fallbackReason+' | Canvas 2D: '+e.message);status('Preview unavailable. Reopen the app.');locks();}
}
function restoreGPU(){
 if(gpuState!=='restore-pending'||rec||busy||photoPending||document.hidden)return;
 if(!engine||engine.kind!=='webgl'){queueFallback('WebGL engine unavailable after restore.');return;}
 gpuState='restoring';
 try{
  engine.init();gpuState='ready';resetMemory();updateSize();
  if(gpuState!=='ready')return;
  clearTimeout(restoreTimer);
  status('');locks();
 }catch(e){gpuFailure('WebGL recovery failed: '+e.message);}
}
function resetMemory(){engine?.reset();lastStep=-1;lastInputTime=-1;sourceUploaded=false;dirty=true;locks();}
function sync(){const m=modes[mode];$('device').value=String(mode);for(const [k] of params){$('p-'+k).value=s[k];$('v-'+k).textContent=Number(s[k]).toFixed(k==='rate'?0:2);}$('row-scanSeconds').hidden=mode!==5;$('scanMode').parentElement.hidden=mode!==5;for(const k of ['palette','aspect','size','scanMode','audio'])$(k).value=s[k];updateSize();}
function choose(i){if(rec||busy||photoPending||!Number.isInteger(i))return;const common={aspect:s.aspect,size:s.size,audio:s.audio,seed:s.seed};mode=(i+modes.length)%modes.length;s={...defaults(mode),...common};resetMemory();sync();}
function locks(){
 const lock=!!rec||busy||photoPending, ready=gpuReady();
 for(const id of ['camera','import','demo','device','reset','random','loadPreset','aspect','size','audio','p-resolution','scanMode','play','seek','p-rate','palette','whole','format']) if($(id))$(id).disabled=lock||!ready;
 $('flip').disabled=lock||!ready||source!=='camera';
 $('record').disabled=busy||!ready||(rec?rec.state==='inactive'||!!rec.saveTimeout:(!canvas.captureStream||!window.MediaRecorder||engine.first));
 
 $('photo').disabled=busy||photoPending||!ready||!!rec||engine.first;
 $('record').disabled=$('record').disabled||photoPending;
 for(const key of ['exposure','contrast','character','memory','signal','texture','scanSeconds'])$('p-'+key).disabled=busy||photoPending||!ready;
 $('whole').disabled=lock||!ready||source!=='video';

}
function createUI(){modes.forEach((m,i)=>$('device').add(new Option(m.id,String(i))));$('device').onchange=()=>choose(Number($('device').value));params.forEach(([k,label,min,max,step],i)=>{const row=document.createElement('div');row.className='param';row.id='row-'+k;row.innerHTML=`<label for="p-${k}">${label}<output id="v-${k}"></output></label><input id="p-${k}" type="range" min="${min}" max="${max}" step="${step}">`;$(i<4?'basic':'extra').append(row);$('p-'+k).oninput=e=>{const value=Number(e.target.value);$('v-'+k).textContent=value.toFixed(k==='rate'?0:2);if(k==='resolution')return;s[k]=value;if(k==='rate'){updateSize();lastStep=-1;}dirty=true;};if(k==='resolution')$('p-'+k).onchange=e=>{if(rec||busy||photoPending||!gpuReady())return;s.resolution=Number(e.target.value);updateSize();resetMemory();};});['Device / colour','Neutral monochrome','Blue-grey','Amber'].forEach((p,i)=>$('palette').add(new Option(p,i)));for(const k of ['palette','aspect','size','scanMode','audio'])$(k).onchange=()=>{s[k]=['aspect','audio'].includes(k)?$(k).value:Number($(k).value);if(k==='aspect'||k==='size')updateSize();if(k==='aspect')resetMemory();if(['scanMode','palette'].includes(k))resetMemory();if(k==='audio'&&source==='camera')status('Tap Camera to apply audio');dirty=true;};$('reset').onclick=()=>choose(mode);$('random').onclick=()=>{s.seed=Math.floor(Math.random()*100000);let x=s.seed>>>0;const rnd=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};const d=defaults(mode);s.exposure=(rnd()-.5);s.contrast=.9+rnd()*.65;for(const k of ['character','memory','signal','texture'])s[k]=clamp(d[k]+(rnd()-.5)*.36,0,1);resetMemory();sync();};$('savePreset').onclick=()=>download(new Blob([JSON.stringify({version:1,device:modes[mode].id,settings:s},null,2)],{type:'application/json'}),'signal-preset.json');$('loadPreset').onclick=()=>$('presetFile').click();$('presetFile').onchange=async e=>{try{const f=e.target.files[0];if(!f||rec)return;const p=JSON.parse(await f.text());if(rec||busy)return;const i=modes.findIndex(m=>m.id===p.device);if(p.version!==1||i<0||!p.settings)throw Error('Unknown preset');const d=defaults(i),o=p.settings;for(const [k,,min,max] of params)if(Number.isFinite(o[k]))d[k]=clamp(o[k],min,max);for(const [k,min,max] of [['palette',0,3],['scanMode',0,1],['seed',0,99999]])if(Number.isFinite(o[k]))d[k]=clamp(Math.round(o[k]),min,max);if(['native','original','1:1','4:3','9:16','16:9'].includes(o.aspect))d.aspect=o.aspect;if([480,720,1080].includes(o.size))d.size=o.size;if(['silent','source'].includes(o.audio))d.audio=o.audio;mode=i;s=d;resetMemory();sync();status('Preset loaded.');}catch(err){status(err.message);}finally{e.target.value='';}};}
function release(){
 const old=stream;stream=null;old?.getTracks().forEach(t=>t.stop());
 video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
 if(url)URL.revokeObjectURL(url);url=null;input=null;sourceUploaded=false;lastInputTime=-1;
 $('sourceLabel').removeAttribute('title');
}
function changed(type,label){
 source=type;updateSourceUI();$('sourceLabel').textContent=label;$('playback').hidden=type!=='video';
 $('wholeRow').hidden=type!=='video';$('seek').value=0;$('position').textContent='0:00';
 resetMemory();updateSize();locks();
}
function useDemo(){if(rec||busy||photoPending)return;release();changed('demo','DEMO SIGNAL');status('');}
function waitForMedia(el,event,ready,ms=12000){
 if(ready())return Promise.resolve();if(el.error)return Promise.reject(Error(el.error.message||'Media could not be decoded.'));
 return new Promise((resolve,reject)=>{
  const events=[...new Set([event,'loadedmetadata','loadeddata','canplay','seeked','resize'])];let timer;
  const done=error=>{clearTimeout(timer);for(const name of events)el.removeEventListener(name,check);el.removeEventListener('error',bad);error?reject(error):resolve();};
  const check=()=>{if(ready())done();},bad=()=>done(Error(el.error?.message||'Media could not be decoded.'));
  timer=setTimeout(()=>{if(ready())done();else done(Error('Media loading timed out.'));},ms);
  for(const name of events)el.addEventListener(name,check);
  el.addEventListener('error',bad);check();
 });
}
function withTimeout(p,ms,message){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
async function requestCamera(options,epoch,ms=20000){
 let expired=false;
 const pending=navigator.mediaDevices.getUserMedia(options).then(value=>{
  if(expired||epoch!==mediaEpoch||document.hidden){value.getTracks().forEach(t=>t.stop());throw Error('Camera request expired.');}
  return value;
 });
 try{return await withTimeout(pending,ms,'Camera permission timed out. Tap Camera to retry.');}
 catch(e){expired=true;throw e;}
}
function assertMedia(epoch){if(epoch!==mediaEpoch||document.hidden)throw Error('Input interrupted.');}
async function camera(){
 if(rec||busy||photoPending)return;busy=true;const epoch=++mediaEpoch;locks();release();changed('demo','DEMO SIGNAL');status('Opening camera…');
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires HTTPS or localhost.');
  const portrait=s.aspect==='9:16';const options={video:{facingMode:{ideal:facing},width:{ideal:portrait?540:960},height:{ideal:portrait?960:540},frameRate:{ideal:mobile?20:24,max:mobile?24:30}},audio:s.audio==='source'};
  try{stream=await requestCamera(options,epoch);}catch(e){assertMedia(epoch);if(options.audio&&['NotFoundError','NotAllowedError','OverconstrainedError','NotReadableError'].includes(e.name))stream=await requestCamera({...options,audio:false},epoch);else throw e;}
  assertMedia(epoch);
  video.srcObject=stream;video.muted=true;await withTimeout(video.play(),12000,'Camera playback timed out.');
  await waitForMedia(video,'loadeddata',()=>video.readyState>=2&&video.videoWidth>0);assertMedia(epoch);
  const active=stream;for(const track of active.getVideoTracks())track.addEventListener('ended',()=>{if(stream!==active)return;if(rec){recFailed=true;stop('Camera disconnected');}release();changed('demo','DEMO SIGNAL');status('Camera disconnected. Tap Camera to reconnect.');});
  changed('camera',facing==='user'?'FRONT CAMERA':'REAR CAMERA');status(stream.getAudioTracks().length?'Mic on':'');
 }catch(e){release();changed('demo','DEMO SIGNAL');status('Camera: '+e.message);}finally{busy=false;locks();}
}
async function importFile(f){
 if(!f||rec||busy||photoPending)return;busy=true;const epoch=++mediaEpoch;locks();release();changed('demo','DEMO SIGNAL');status('Opening file…');
 try{
  url=URL.createObjectURL(f);
  if(f.type.startsWith('image/')||/\.(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(f.name)){
   const im=new Image();im.src=url;await withTimeout(im.decode(),20000,'Image loading timed out.');assertMedia(epoch);input=im;changed('photo','PHOTO');
  }else{
   video.src=url;video.loop=true;video.muted=true;video.load();
   await waitForMedia(video,'loadedmetadata',()=>video.readyState>=1);assertMedia(epoch);
   if(!video.videoWidth||!Number.isFinite(video.duration))throw Error('Unsupported video or unknown duration.');
   changed('video','VIDEO');$('seek').max=video.duration;
   try{await withTimeout(video.play(),12000,'Playback timed out.');}catch{assertMedia(epoch);status('Tap Play');return;}assertMedia(epoch);
  }
  $('sourceLabel').title=f.name;status('');
 }catch(e){release();changed('demo','DEMO SIGNAL');status('Import failed. Try H.264 MP4 or JPEG/PNG. '+e.message);}finally{busy=false;locks();}
}
function drawDemo(t){const w=640,h=480;const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#7c9dad');sky.addColorStop(.55,'#e9c8a5');sky.addColorStop(1,'#4a5158');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);ctx.fillStyle='#e8dfac';ctx.beginPath();ctx.arc(420+Math.sin(t*.12)*30,101,38,0,7);ctx.fill();for(let i=0;i<14;i++){let x=i*53-(t*9%53),bh=100+(i*137%165);ctx.fillStyle=['#536b72','#84786d','#5b5967','#a19478'][i%4];ctx.fillRect(x,h-100-bh,46,bh);for(let y=h-100-bh+13;y<h-115;y+=18)for(let k=0;k<3;k++){ctx.fillStyle=(i+k+Math.floor(y/18))%5===0?'#eac17e':'#33414a';ctx.fillRect(x+5+k*13,y,7,10);}}ctx.fillStyle='#363f41';ctx.fillRect(0,380,w,100);ctx.fillStyle='#c7bda2';for(let i=0;i<9;i++)ctx.fillRect(i*84-(t*45%84),430,46,3);for(let i=0;i<3;i++){let x=(t*(42+i*14)+i*239)%740-80;ctx.fillStyle=['#b5624d','#e1c877','#74958f'][i];ctx.fillRect(x,397+i*11,62,17);ctx.fillRect(x+13,387+i*11,31,12);ctx.fillStyle='#252e32';ctx.fillRect(x+9,411+i*11,11,7);ctx.fillRect(x+43,411+i*11,11,7);}}
function loop(ms){
 requestAnimationFrame(loop);if(document.hidden||photoPending||rec?.saveTimeout)return;if(gpuState==='restore-pending')restoreGPU();if(gpuState==='fallback-pending')startFallback();if(!gpuReady()){if(gpuState==='ready'&&engine?.isLost()){if(engine.kind==='2d')gpuFailure('Canvas context lost.');else beginLoss('WebGL context lost.');}return;}
 
 const t=ms/1000,rate=effectiveRate();try{
  if(lastStep<0||t-lastStep>=1/rate-.003){
   const el=source==='demo'?demo:source==='photo'?input:video;
   if(source==='demo')drawDemo(t);
   if(el&&(source==='demo'||source==='photo'||video.readyState>=2)){
    const [w,h]=sourceSize();
    const needsUpload=!sourceUploaded||source==='demo'||((source==='camera'||source==='video')&&video.currentTime!==lastInputTime);
    if(!needsUpload||uploadInput(el,w,h)){
     sourceUploaded=true;lastInputTime=video.currentTime;
     const first=engine.first;engine.step(t,mode,s,source==='camera'&&facing==='user'?1:0);
     lastStep=lastStep<0?t:t-Math.max(0,Math.min(1/rate,t-lastStep-1/rate));frames++;dirty=true;if(first)locks();
    }
   }
  }
  if(dirty||(rec&&t-lastPresent>=1/(mobile?24:30)-.003)){engine.present(mode,s);dirty=false;lastPresent=t;}
  if(t-fpsStart>=1){$('fps').textContent=`${Math.round(frames/(t-fpsStart))} fps`;fpsStart=t;frames=0;}
  if(source==='video'&&!$('seek').matches(':active')){if(Number.isFinite(video.duration)){$('seek').max=video.duration;$('seek').value=video.currentTime;}$('position').textContent=timeLabel(video.currentTime);}
  lastError='';
 }catch(e){if(!gpuReady())return;if(lastError!==e.message){lastError=e.message;gpuFailure('Render error: '+e.message);if(rec)stop('Render interrupted');}}
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
function result(blob,name){
 const v=$('resultVideo');v.pause();v.removeAttribute('src');v.load();$('resultImage').removeAttribute('src');
 if(lastURL)URL.revokeObjectURL(lastURL);lastResult={blob,name};lastURL=URL.createObjectURL(blob);
 $('download').href=lastURL;$('download').download=name;const isVideo=blob.type.startsWith('video/');
 v.hidden=!isVideo;$('resultImage').hidden=isVideo;if(isVideo)v.src=lastURL;else $('resultImage').src=lastURL;
 $('resultInfo').textContent=`${name} · ${(blob.size/1024/1024).toFixed(2)} MB${isVideo?(blob.type.includes('mp4')?' · MP4':' · WebM (convert to MP4 if required)'):''}`;
 $('result').hidden=false;$('share').disabled=false;
}
function photo(){
 if(!gpuReady()||engine.first||busy||rec||photoPending)return;
 photoPending=true;locks();let done=false;
 const finishPhoto=b=>{if(done)return;done=true;clearTimeout(timer);photoPending=false;locks();if(b){result(b,'signal-'+stamp()+'.png');status('Photo ready');}else status('PNG export failed.');};
 const timer=setTimeout(()=>finishPhoto(null),8000);
 try{canvas.toBlob(finishPhoto,'image/png');}catch{finishPhoto(null);}
}
async function share(){if(!lastResult)return;const {blob,name}=lastResult;try{const f=new File([blob],name,{type:blob.type});if(navigator.share&&navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:name});else download(blob,name);}catch(e){if(e.name!=='AbortError')status('Share failed. Use Download.');}}
async function audioTrack(){
 if(s.audio!=='source')return null;
 if(source==='camera')return stream?.getAudioTracks()[0]?.clone()||null;
 if(source!=='video')return null;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
  if(!audioGraph){const c=new C();audioGraph={c,node:c.createMediaElementSource(video)};}
  await withTimeout(audioGraph.c.resume(),3000,'Audio context unavailable.');
  video.muted=false;audioDest=audioGraph.c.createMediaStreamDestination();audioGraph.node.connect(audioDest);
  return audioDest.stream.getAudioTracks()[0];
 }catch(e){status('Audio unavailable; recording silent.');return null;}
}
function cleanup(){
 recStream?.getTracks().forEach(t=>t.stop());recStream=null;
 if(audioDest){try{audioGraph.node.disconnect(audioDest);}catch{}audioDest=null;}
 if(source==='video'){video.muted=true;video.loop=true;if(recordWhole)video.pause();}
}
function finish(r,chunks){
 if(rec!==r)return;clearInterval(recTimer);clearTimeout(r.saveTimeout);
 const mime=chunks.find(c=>c.type)?.type||r.mimeType||'video/webm',blob=new Blob(chunks,{type:mime});
 cleanup();rec=null;recordWhole=false;$('record').classList.remove('active');$('recordText').textContent='Record';$('recIndicator').hidden=true;if(gpuState==='ready')updateSize();locks();
 if(blob.size){result(blob,`signal-${stamp()}.${mime.includes('mp4')?'mp4':'webm'}`);status(recFailed?'Encoder interrupted. Partial take available; check playback.':`${stopReason||'Recording finished'}. Download or Share / Save.`);}
 else status('Recording failed or empty. Try 480 px or another format.');
}
async function record(){
 if(rec||busy||photoPending||!gpuReady()||engine.first||document.hidden)return;
 const startEpoch=gpuEpoch;const checkGPU=()=>{if(startEpoch!==gpuEpoch||!gpuReady()||document.hidden)throw Error('GPU or foreground changed; retry recording.');};
 busy=true;locks();recFailed=false;stopReason='';recordWhole=source==='video'&&$('whole').checked;
 try{
  if(recordWhole&&video.duration>120)throw Error('Whole clip limit is 120 seconds. Use a shorter clip or Record a take.');
  recStream=canvas.captureStream(mobile?24:30);const a=await audioTrack();if(a)recStream.addTrack(a);checkGPU();
  if(recordWhole){video.pause();video.loop=false;if(video.currentTime>.001){video.currentTime=0;await waitForMedia(video,'seeked',()=>!video.seeking&&video.currentTime<.01);}await waitForMedia(video,'loadeddata',()=>video.readyState>=2);checkGPU();resetMemory();const [w,h]=sourceSize();if(!uploadInput(video,w,h))throw Error('Video frame unavailable.');engine.step(performance.now()/1000,mode,s,0);engine.present(mode,s);sourceUploaded=true;lastInputTime=video.currentTime;}
  if(source==='video'&&video.paused&&!recordWhole)await withTimeout(video.play(),5000,'Tap Play before recording.');
  checkGPU();
  const mp4=a?['video/mp4;codecs=avc1,mp4a.40.2','video/mp4']:['video/mp4;codecs=avc1','video/mp4'];
  const webm=a?['video/webm;codecs=vp8,opus','video/webm']:['video/webm;codecs=vp8','video/webm'];
  const pref=$('format').value, types=pref==='mp4'?mp4:pref==='webm'?webm:[...mp4,...webm,''];
  let r=null,errors=[];bytesRecorded=0;
  for(const mimeType of types){
   let candidate;try{
    if(mimeType&&MediaRecorder.isTypeSupported&&!MediaRecorder.isTypeSupported(mimeType))continue;
    candidate=new MediaRecorder(recStream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:canvas.width*canvas.height>600000?5000000:2500000});
    const local=[];candidate.savedChunks=local;candidate.ondataavailable=e=>{if(e.data.size){local.push(e.data);if(rec===candidate){bytesRecorded+=e.data.size;if(bytesRecorded>=160*1024*1024)stop('Size limit reached');}}};
    candidate.onerror=e=>{if(rec!==candidate)return;recFailed=true;stop('Encoder error');};candidate.onstop=()=>finish(candidate,local);
    candidate.start(1000);if(candidate.state==='inactive')throw Error('Encoder did not start.');r=candidate;break;
   }catch(e){errors.push(e.message);if(candidate){candidate.onstop=null;candidate.ondataavailable=null;candidate.onerror=null;if(candidate.state!=='inactive')try{candidate.stop();}catch{}}}
  }
  if(!r)throw Error('No working encoder for '+pref+'. Try Auto or 480 px. '+(errors[errors.length-1]||''));
  rec=r;recordStart=performance.now();$('recordText').textContent='Stop';$('record').classList.add('active');$('recIndicator').hidden=false;$('timer').textContent='0:00';
  recTimer=setInterval(()=>{const elapsed=(performance.now()-recordStart)/1000;$('timer').textContent=timeLabel(elapsed);if(elapsed>=120.5)stop('Time limit reached');},200);
  if(recordWhole)await withTimeout(video.play(),5000,'Could not start clip.');
  if(rec===r&&r.state==='recording')status(`Recording ${r.mimeType||'video'}${a?' / audio':' / silent'}${recordWhole?' / whole clip':' / max 120 s'}.`);
 }catch(e){if(rec){recFailed=true;stop('Recording interrupted');}else{cleanup();recordWhole=false;}status('Recorder: '+e.message);}finally{busy=false;locks();}
}
function stop(reason=''){
 if(!rec)return;const r=rec;if(reason)stopReason=reason;if(r.saveTimeout)return;
 $('recordText').textContent='Saving…';$('record').disabled=true;clearInterval(recTimer);
 r.saveTimeout=setTimeout(()=>{if(rec!==r)return;recFailed=true;finish(r,r.savedChunks||[]);status('Encoder finalization timed out. Check partial take, or try 480 px.');},12000);
 try{if(r.state!=='inactive')r.stop();}catch(e){recFailed=true;finish(r,r.savedChunks||[]);status('Recorder: '+e.message);}
}
$('camera').onclick=camera;$('flip').onclick=()=>{facing=facing==='user'?'environment':'user';camera();};$('demo').onclick=useDemo;$('import').onclick=()=>$('file').click();$('file').onchange=e=>{importFile(e.target.files[0]);e.target.value='';};$('play').onclick=()=>video.paused?video.play().catch(e=>status(e.message)):video.pause();video.addEventListener('play',updateSourceUI);video.addEventListener('pause',updateSourceUI);$('seek').oninput=e=>{video.currentTime=Number(e.target.value);resetMemory();};video.addEventListener('resize',()=>{if(!rec&&(source==='camera'||source==='video')){updateSize();sourceUploaded=false;}});video.addEventListener('ended',()=>{if(rec&&recordWhole)stop('Whole clip finished');});video.addEventListener('error',()=>{if(source==='video'&&rec)stop('Source decoding interrupted');});video.addEventListener('seeked',()=>{if(source==='video'&&!rec&&!busy)resetMemory();});$('photo').onclick=photo;$('record').onclick=()=>rec?stop():record();$('share').onclick=()=>{$('result').hidden=false;};$('nativeShare').onclick=share;$('closeResult').onclick=()=>{$('resultVideo').pause();$('result').hidden=true;};$('resultVideo').addEventListener('error',()=>{if(lastResult?.blob.type.startsWith('video/'))$('resultInfo').textContent+=' · Preview unavailable; check downloaded file.';});
function beginLoss(message){
 if(gpuState==='lost'||gpuState==='fallback-pending'||engine?.kind==='2d')return;
 gpuEpoch++;gpuState='lost';
 reportGPU(message);status('Recovering…');if(rec){recFailed=true;stop('GPU context lost');}
 clearTimeout(restoreTimer);restoreTimer=setTimeout(()=>{if(gpuState==='lost')queueFallback('WebGL restoration timed out (8 seconds).');},8000);locks();
}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(e.target===canvas)beginLoss('WebGL context lost. '+(e.statusMessage||''));});
canvas.addEventListener('webglcontextrestored',e=>{if(e.target!==canvas||engine?.kind==='2d'||gpuState!=='lost')return;clearTimeout(restoreTimer);gpuState='restore-pending';locks();restoreGPU();});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){gpuEpoch++;mediaEpoch++;if(rec)stop('App moved to background');}
 else{lastStep=-1;sourceUploaded=false;if(engine)engine.lastTime=null;restoreGPU();if(gpuState==='fallback-pending')startFallback();}
});
window.addEventListener('pagehide',()=>{gpuEpoch++;mediaEpoch++;if(rec)stop();release();source='demo';});
window.addEventListener('pageshow',e=>{if(e.persisted&&engine)changed('demo','DEMO SIGNAL');});
s=defaults(mode);createUI();sync();updateSourceUI();
try{engine=new window.SignalEngine(canvas);gpuState='ready';updateSize();locks();if(gpuReady())status(canvas.captureStream&&window.MediaRecorder?'':'Video recording unavailable');}
catch(e){gpuFailure(e.message);}
if(gpuState==='fallback-pending')startFallback();
requestAnimationFrame(loop);
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(e=>console.warn('Service worker update:',e));
}
})();
