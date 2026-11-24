const CACHE='future-small-v020';
const ASSETS=['./','./index.html','./style.css','./engine.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('future-small-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// 同じバージョンの HTML / JS をまとめて配信し、更新途中の混在を防ぐ。
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate')return (await c.match('./index.html'))||fetch(e.request);return (await c.match(e.request))||fetch(e.request);}));});
