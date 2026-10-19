/* Service Worker — منصة الإنتاجية
   - الصفحة الرئيسية والأيقونات بتتخزّن وبتفتح أوفلاين.
   - النسخة الجديدة بتتحمّل في الخلفية وتظهر في ثاني فتحة.
   - طلبات الذكاء الاصطناعي ويوتيوب وفايربيز والسيرفرات التانية مابنلمسهاش.
   - إشعارات وهو مقفول: Web Push (سيرفر صغير بيصحّي الـ worker) + الجدول متخزّن في IndexedDB.
   لو رفعت نسخة جديدة وعايزها فورًا: غيّر رقم VERSION. */
const VERSION = 'v27';
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

/* ============ إشعارات الرسايل وطلبات الصداقة (Worker الرسايل) ============
   الـ push بييجي فاضي. بنسأل الـ Worker «إيه الجديد؟» (/inbox) ونعرض الإشعار.
   الصفحة بتحفظ رابط الـ Worker والـ endpoint في IndexedDB (المفتاح msgInbox). */
const DUEL_KINDS = ['nudge', 'duel', 'claim', 'verdict', 'duelacc'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const WORKER_URL = /^https:\/\/[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.workers\.dev$/i;
/* الصورة في الإشعار: data:image أو Firebase Storage بس (رابط خارجي = تتبّع لعنوان الجهاز) */
const safePhoto = p => (typeof p === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) || /^https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9.-]+\.firebasestorage\.app)\//i.test(p))) ? p : '';
async function showInbox(visible) {
  const info = await idbGet('msgInbox');
  if (!info || !info.url || !info.endpoint || !WORKER_URL.test(String(info.url).replace(/\/+$/, ''))) return 0;
  let items = [];
  try {
    const r = await fetch(info.url + '/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: info.endpoint }) });
    if (r.ok) items = ((await r.json()).items) || [];
  } catch (err) { return 0; }
  if (!items.length || visible) return 0; // التطبيق مفتوح قدامه: الصفحة نفسها هي اللي بتنبّه
  let lockedIds = []; try { lockedIds = (await idbGet('lockedIds')) || []; } catch (err) { }
  const byKey = {};
  items.forEach(it => { const kd = it.kind || 'msg'; const lk = kd === 'msg' && it.chatId && lockedIds.indexOf(it.chatId) >= 0; const k = lk ? 'locked' : kd === 'admin' ? 'admin:' + (it.at || Date.now()) : kd + ':' + (it.from || '') + (DUEL_KINDS.indexOf(kd) >= 0 ? ':' + (it.chatId || '') : ''); (byKey[k] = byKey[k] || []).push(it); });
  const base = { badge: './icon-192.png', lang: 'ar', dir: 'rtl', vibrate: [200, 100, 200], renotify: true };
  let shown = 0;
  for (const k of Object.keys(byKey).slice(0, 8)) {
    const list = byKey[k], last = list[list.length - 1], kind = last.kind || 'msg';
    if (k === 'locked') { // محادثة مقفولة: من غير اسم ولا نص ولا صورة ولا أزرار (زي واتساب)
      await self.registration.showNotification(list.length > 1 ? 'رسائل جديدة (' + list.length + ')' : 'رسالة جديدة', { ...base, body: '', icon: './icon-192.png', tag: 'locked', actions: [], data: { kind: 'lockedmsg' } });
      shown++; continue;
    }
    let title = (last.name || 'صديق') + (list.length > 1 && kind === 'msg' ? ' (' + list.length + ')' : '');
    let body, actions = [], data = { kind, from: SAFE_ID.test(String(last.from || '')) ? last.from : '', name: last.name || '', ref: last.chatId || '' };
    if (kind === 'req') { body = 'بعتلك طلب صداقة 📨'; actions = [{ action: 'accept', title: '✅ قبول' }, { action: 'decline', title: '✖ رفض' }]; }
    else if (kind === 'nudge') { body = '👊 بيحفّزك في تحدي «' + (last.preview || '') + '»'; }
    else if (kind === 'duel') { body = '⚔️ دعاك لتحدي «' + (last.preview || '') + '»'; }
    else if (kind === 'acc') { body = '🎉 قبل طلب صداقتك — بقيتوا أصدقاء'; }
    else if (kind === 'claim') { body = '🤝 بيطلب تأكيد إنجاز في «' + (last.preview || '') + '»'; }
    else if (kind === 'verdict') { body = (last.extra === 'ok' ? '✔ أكّد إنجازك في «' : '✖ اعترض على إنجازك في «') + (last.preview || '') + '»'; }
    else if (kind === 'duelacc') { body = '⚔️ قبل التحدي «' + (last.preview || '') + '»'; }
    else if (kind === 'admin') { title = last.name || 'سأنجزها'; body = last.preview || ''; data = { kind: 'admin' }; }
    else { body = last.preview || 'رسالة جديدة'; actions = [{ action: 'reply', type: 'text', title: '↩️ رد', placeholder: 'اكتب ردك…' }, { action: 'read', title: '✔ قُرئت' }]; }
    await self.registration.showNotification(title, { ...base, body, icon: safePhoto(last.photo) || './icon-192.png', tag: k, actions, data });
    shown++;
  }
  return shown;
}
async function onPush() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = clients.some(c => c.visibilityState === 'visible');
  let n = 0;
  try { n += await showInbox(visible); } catch (err) { }
  try { n += await showDueNotifications({ fallback: false }); } catch (err) { }
  if (!n && !visible) {
    await self.registration.showNotification('منصة الإنتاجية 🔔', { icon: './icon-192.png', badge: './icon-192.png', lang: 'ar', dir: 'rtl', body: 'عندك تنبيه — افتح التطبيق', tag: 'generic' });
  }
}
self.addEventListener('push', e => { e.waitUntil(onPush()); });

/* ============ أزرار الإشعار: رد / مقروءة / قبول / رفض — من غير ما التطبيق يتفتح ============
   الصفحة بتحفظ في IndexedDB (المفتاح msgAuth) بيانات الدخول (uid، اسم، refresh token، apiKey، project، روابط الـ Workers).
   الـ sw بيبدّل الـ refresh token بـ ID token ويكتب في Firestore بنفس صلاحيات المستخدم (نفس قواعد التطبيق). */
function hashUrl(a, uid) {
  const l = (a.urls || []).map(function (x) { return String(x || '').trim().replace(/\/+$/, ''); }).filter(function (x) { return /^https:\/\/[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.workers\.dev$/i.test(x); }); if (!l.length) return '';
  let h = 0; const s = String(uid);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(l[h % l.length]).replace(/\/+$/, '');
}
async function swToken(a) {
  const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(a.apiKey), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refresh) });
  const j = await r.json();
  if (!r.ok || !j.id_token) throw new Error('token');
  return j.id_token;
}
function fsBase(a) { return 'projects/' + a.project + '/databases/(default)/documents/'; }
async function fsCommit(a, tok, writes) {
  const r = await fetch('https://firestore.googleapis.com/v1/projects/' + a.project + '/databases/(default)/documents:commit', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (!r.ok) throw new Error('fs-' + r.status);
}
const sv = s => ({ stringValue: String(s) });
const REQT = 'REQUEST_TIME';
async function swAck(text) {
  await self.registration.showNotification(text, { tag: 'sp-ack', silent: true, icon: './icon-192.png', badge: './icon-192.png', lang: 'ar', dir: 'rtl' });
  await new Promise(r => setTimeout(r, 3000));
  const ns = await self.registration.getNotifications({ tag: 'sp-ack' });
  ns.forEach(n => n.close());
}
async function swFail(text, data) {
  await self.registration.showNotification('تعذّر التنفيذ — افتح التطبيق', { tag: 'sp-fail', icon: './icon-192.png', badge: './icon-192.png', lang: 'ar', dir: 'rtl', body: text || '', data: { kind: data.kind, from: data.from || '' } });
}
function newId() { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let o = ''; const b = new Uint8Array(20); crypto.getRandomValues(b); for (let i = 0; i < 20; i++) o += c[b[i] % c.length]; return o; }
async function doMsgAction(act, replyText, data) {
  const text = String(replyText || '').trim().slice(0, 2000);
  try {
    const a = await idbGet('msgAuth');
    if (!a || !a.refresh || !SAFE_ID.test(String(a.uid || '')) || !SAFE_ID.test(String(data.from || ''))) throw new Error('noauth');
    const tok = await swToken(a), base = fsBase(a), cid = [a.uid, data.from].sort().join('__');
    if (act === 'read') {
      await fsCommit(a, tok, [{ update: { name: base + 'socialChats/' + cid + '/reads/' + a.uid, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'at', setToServerValue: REQT }, { fieldPath: 'dAt', setToServerValue: REQT }] }]);
      await swAck('تم التحديد كمقروءة ✓'); return;
    }
    if (!text) return;
    await fsCommit(a, tok, [
      { update: { name: base + 'socialChats/' + cid, fields: { participants: { arrayValue: { values: [sv(a.uid), sv(data.from)] } }, lastMessage: sv(text.slice(0, 100)), lastFrom: sv(a.uid) } }, updateMask: { fieldPaths: ['participants', 'lastMessage', 'lastFrom'] }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: REQT }] },
      { update: { name: base + 'socialChats/' + cid + '/messages/' + newId(), fields: { from: sv(a.uid), to: sv(data.from), type: sv('text'), text: sv(text) } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: REQT }], currentDocument: { exists: false } }
    ]);
    try { // إشعار للطرف التاني (بيحاول بس)
      const u = hashUrl(a, data.from);
      if (u) await fetch(u + '/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ to: data.from, kind: 'msg', name: a.name || '', photo: a.photo || '', preview: text.slice(0, 120), chatId: cid }) });
    } catch (err) { }
    await swAck('اتبعت ردك ✓');
  } catch (err) {
    await swFail(act === 'reply' ? 'ردك: ' + text.slice(0, 80) : 'اضغط لفتح المحادثة', data);
  }
}
async function doReqAction(act, data) {
  try {
    const a = await idbGet('msgAuth');
    if (!a || !a.refresh || !SAFE_ID.test(String(a.uid || '')) || !SAFE_ID.test(String(data.from || ''))) throw new Error('noauth');
    const tok = await swToken(a), base = fsBase(a), me = a.uid, other = data.from;
    const reqDoc = base + 'profiles/' + me + '/requests/' + other;
    if (act === 'decline') {
      await fsCommit(a, tok, [{ delete: reqDoc, currentDocument: { exists: true } }]);
      await swAck('اترفض الطلب'); return;
    }
    const at = String(Date.now());
    await fsCommit(a, tok, [
      { update: { name: base + 'profiles/' + me + '/friends/' + other, fields: { name: sv(data.name || 'صديق'), at: { integerValue: at } } } },
      { update: { name: base + 'profiles/' + other + '/friends/' + me, fields: { name: sv(a.name || 'صديق'), at: { integerValue: at } } } },
      { delete: reqDoc, currentDocument: { exists: true } }
    ]);
    try { const u = hashUrl(a, me); if (u) await fetch(u + '/addfriend', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ friend: other }) }); } catch (err) { }
    await swAck('🎉 بقيتوا أصدقاء');
  } catch (err) {
    await swFail(act === 'accept' ? 'اضغط لفتح الطلبات وتقبل من التطبيق' : 'اضغط لفتح الطلبات', data);
  }
}

self.addEventListener('periodicsync', e => { if (e.tag === 'check-schedule') e.waitUntil(showDueNotifications({ fallback: false })); });
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'resubscribe' }))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  if (data.kind === 'msg' && ((e.action === 'reply' && e.reply) || e.action === 'read')) { e.waitUntil(doMsgAction(e.action, e.reply, data)); return; }
  if (data.kind === 'req' && (e.action === 'accept' || e.action === 'decline')) { e.waitUntil(doReqAction(e.action, data)); return; }
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find(x => 'focus' in x);
    if (data.kind === 'lockedmsg') {
      if (c) { await c.focus(); c.postMessage({ type: 'sp-open', kind: 'chats', from: '', ref: '', reply: false }); return; }
      await self.clients.openWindow('./?spgo=chats'); return;
    }
    if (data.kind === 'msg' || data.kind === 'req' || data.kind === 'acc' || DUEL_KINDS.indexOf(data.kind) >= 0) {
      const isDuel = DUEL_KINDS.indexOf(data.kind) >= 0, openKind = data.kind === 'acc' ? 'msg' : isDuel ? 'duel' : data.kind;
      if (c) { await c.focus(); c.postMessage({ type: 'sp-open', kind: openKind, from: data.from || '', ref: data.ref || '', reply: e.action === 'reply' }); return; }
      const q = data.kind === 'req' ? 'req' : isDuel ? 'duel:' + encodeURIComponent(data.ref || '') : (e.action === 'reply' ? 'reply:' : 'chat:') + encodeURIComponent(data.from || '');
      await self.clients.openWindow('./?spgo=' + q);
      return;
    }
    if (c) { await c.focus(); c.postMessage({ type: 'notification-click', key: data.key || '', kind: data.kind || '' }); return; }
    await self.clients.openWindow('./');
  })());
});
