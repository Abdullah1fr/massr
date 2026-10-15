/* Service Worker — منصة الإنتاجية
   - الصفحة الرئيسية والأيقونات بتتخزّن وبتفتح أوفلاين.
   - النسخة الجديدة بتتحمّل في الخلفية وتظهر في ثاني فتحة.
   - طلبات الذكاء الاصطناعي ويوتيوب وفايربيز والسيرفرات التانية مابنلمسهاش.
   - إشعارات وهو مقفول: Web Push (سيرفر صغير بيصحّي الـ worker) + الجدول متخزّن في IndexedDB.
   لو رفعت نسخة جديدة وعايزها فورًا: غيّر رقم VERSION. */
const VERSION = 'v4';
const CACHE = 'prod-platform-' + VERSION;
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('prod-platform-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      const update = fetch('./index.html', { cache: 'no-cache' }).then(r => { if (r && r.ok) cache.put('./index.html', r.clone()); return r; }).catch(() => null);
      if (cached) { e.waitUntil(update); return cached; }
      const net = await update;
      return net || new Response('مفيش نت ولسه التطبيق ماتخزّنش على الجهاز', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }
  if (sameOrigin && /\/(icon-[^/]*\.png|apple-touch-icon\.png|manifest\.json)$/.test(url.pathname)) {
    /* الأيقونات والـ manifest: النت الأول (من غير كاش)، والكاش بس لو مفيش نت */
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const r = await fetch(req, { cache: 'no-cache' });
        if (r && r.ok) cache.put(req, r.clone());
        return r;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match(url.pathname.split('/').pop())) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => cached);
    return cached || net;
  })());
});

/* ============ إشعارات التنبيهات/المنبهات (Web Push) ============ */
const DB_NAME = 'pwa-sched', STORE = 'kv';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

async function showDueNotifications(opts) {
  const fallback = !!(opts && opts.fallback);
  const now = Date.now();
  const items = (await idbGet('items')) || [];
  const shown = (await idbGet('shown')) || {};
  const due = items.filter(i => i.at <= now + 30000 && i.at > now - 30 * 60000 && !shown[i.key]).sort((a, b) => a.at - b.at);
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = clients.some(c => c.visibilityState === 'visible');
  due.forEach(i => { shown[i.key] = i.at; });
  const keep = Object.entries(shown).sort((a, b) => b[1] - a[1]).slice(0, 300);
  await idbSet('shown', Object.fromEntries(keep));
  if (visible) return 0; // التطبيق مفتوح قدامه: الصفحة نفسها هي اللي بتنبّه
  const base = { icon: './icon-192.png', badge: './icon-192.png', lang: 'ar', dir: 'rtl', requireInteraction: true, vibrate: [300, 150, 300, 150, 300] };
  if (due.length === 0) {
    if (fallback) await self.registration.showNotification('منصة الإنتاجية 🔔', { ...base, body: 'عندك تنبيه — افتح التطبيق', tag: 'generic', requireInteraction: false });
    return 0;
  }
  for (const i of due.slice(0, 6)) {
    await self.registration.showNotification(i.title || 'تنبيه', { ...base, body: i.body || '', tag: i.tag || i.key, data: { key: i.key, kind: i.kind || '' } });
  }
  if (due.length > 6) await self.registration.showNotification('تنبيهات أخرى', { ...base, body: 'فيه ' + (due.length - 6) + ' تنبيه كمان — افتح التطبيق', tag: 'more' });
  return due.length;
}

self.addEventListener('push', e => { e.waitUntil(showDueNotifications({ fallback: true })); });
self.addEventListener('periodicsync', e => { if (e.tag === 'check-schedule') e.waitUntil(showDueNotifications({ fallback: false })); });
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'resubscribe' }))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find(x => 'focus' in x);
    if (c) { await c.focus(); c.postMessage({ type: 'notification-click', key: data.key || '', kind: data.kind || '' }); return; }
    await self.clients.openWindow('./');
  })());
});
