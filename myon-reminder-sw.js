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
