self.addEventListener('push',event=>{
  let message;
  try { message=event.data?.json(); } catch { return; }
  if (!message || !/^\d{4}-\d{2}-\d{2}$/.test(message.day) || !/^\d{2}:\d{2}$/.test(message.time) ||
      typeof message.recordId!=='string' || !message.recordId || message.recordId.length>300 ||
      !Number.isFinite(Date.parse(message.startsAt)) || Date.parse(message.startsAt)<=Date.now()) return;
  const key=encodeURIComponent(message.recordId);
  event.waitUntil(self.registration.showNotification('마이온 · 일정 미리 알림',{
    body:(typeof message.title==='string' && message.title.trim() ? message.title.trim().slice(0,96)+' · ' : '')+message.time+' 시작',
    icon:'/myon-icon.svg',
    tag:'myon:'+key+':'+message.startsAt,
    data:{route:'#today/'+message.day+'/schedule/'+key}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const route=event.notification.data?.route;
  if (typeof route!=='string' || !/^#today\/\d{4}-\d{2}-\d{2}\/schedule\/[^/]{1,900}$/.test(route)) return;
  const target=new URL('/'+route,self.location.origin);
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const opened=windows.find(client=>new URL(client.url).origin===target.origin);
    if (opened) {
      const updated=await opened.navigate(target.href).catch(()=>null);
      if (updated) return updated.focus();
    }
    return clients.openWindow(target.href);
  })());
});


const recordingCache = 'myon-pending-recordings-v1';
const recordingReadPath = /^\/myon-shared-recording\/[0-9a-f-]{36}$/u;
const recordingLimit = 50*1024*1024;

async function removeExpiredRecordings(cache) {
  for (const key of await cache.keys()) {
    const item = await cache.match(key);
    if (Number(item?.headers.get('X-Myon-Recording-Expires') || 0) <= Date.now()) await cache.delete(key);
  }
}

function recordingRedirect(id) {
  return Response.redirect(new URL('/#people//share-recording:'+id,self.location.origin),303);
}

async function receiveSharedRecording(request) {
  try {
    const form = await request.formData();
    const items = form.getAll('recording');
    const file = items[0];
    if (items.length!==1 || !(file instanceof File) || !file.size || file.size>recordingLimit ||
        !/\.(m4a|mp3|wav|ogg)$/iu.test(file.name)) return recordingRedirect('file');
    const cache = await caches.open(recordingCache);
    await removeExpiredRecordings(cache);
    // Retain a few recent shares while an installed copy is opening or signing in.
    const keys = await cache.keys();
    for (const key of keys.slice(0,Math.max(0,keys.length-2))) await cache.delete(key);
    const id = crypto.randomUUID();
    const key = new URL('/myon-shared-recording/'+id,self.location.origin);
    const name = file.name.toWellFormed();
    await cache.put(key,new Response(file,{headers:{
      'Content-Type':'application/octet-stream','Cache-Control':'no-store',
      'X-Myon-Recording-Name':encodeURIComponent(name),
      'X-Myon-Recording-Expires':String(Date.now()+15*60*1000)
    }}));
    return recordingRedirect(id);
  } catch { return recordingRedirect('storage'); }
}

async function readSharedRecording(request) {
  const cache = await caches.open(recordingCache);
  await removeExpiredRecordings(cache);
  const item = await cache.match(request.url);
  if (!item || !await cache.delete(request.url)) return new Response(null,{status:404});
  return item;
}

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch',event=>{
  const url = new URL(event.request.url);
  if (url.origin!==self.location.origin) return;
  if (event.request.method==='POST' && url.pathname==='/myon-share-recording') {
    event.respondWith(receiveSharedRecording(event.request));
  } else if (event.request.method==='GET' && recordingReadPath.test(url.pathname) &&
             event.request.headers.get('X-Myon-Recording')==='1') {
    event.respondWith(readSharedRecording(event.request));
  }
});
