self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>/^future-small-v[0-9]+$/.test(k)).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
