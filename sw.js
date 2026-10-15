const CACHE='spendly-shell-v2';
const FILES=['./offline.html','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('spendly-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request;const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match(new URL('./offline.html',self.registration.scope).href)));
  return;
 }
 // Only packaged static assets. Bank data, cloud requests and AI never enter this cache.
 if(!/\/(assets\/.*\.(css|js|png|svg)|manifest\.webmanifest)$/.test(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
  return response;
 }).catch(()=>caches.match(request)));
});
