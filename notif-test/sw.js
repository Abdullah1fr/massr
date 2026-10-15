/* صفحة تجربة الإشعارات — Service Worker مستقل (مش بتاع التطبيق).
   بيشتغل في نطاق الفولدر notif-test بس، فما يلمسش sw.js الأساسي. */
'use strict';
var S = { run: 0, stopped: false, cfg: null };
var FALLBACK = { delay: 0, count: 10, gap: 2, silent: false, vibMode: 'cycle', vibIndex: 0, sameTag: true, sticky: true, actions: true, stopOnDismiss: false, snoozeSec: 20,
  patterns: [{ n: 'قصير', v: [200] }, { n: 'ثلاثي', v: [300, 100, 300, 100, 300] }] };
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function tell(msg) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage(msg); }); });
}
function closeAll() {
  return self.registration.getNotifications().then(function (ns) {
    ns.forEach(function (n) { if ((n.tag || '').indexOf('alarm-test') === 0) n.close(); });
  });
}
function pick(cfg, i) {
  var P = cfg.patterns && cfg.patterns.length ? cfg.patterns : FALLBACK.patterns;
  if (cfg.vibMode === 'off') return { n: 'من غير اهتزاز', v: [] };
  if (cfg.vibMode === 'cycle') return P[i % P.length];
  if (cfg.vibMode === 'random') return P[Math.floor(Math.random() * P.length)];
  return P[cfg.vibIndex] || P[0];
}
async function burst(cfg) {
  var id = ++S.run; S.stopped = false; S.cfg = cfg;
  if (cfg.delay > 0) {
    await tell({ type: 'log', text: 'الـ Worker بتاع التجربة هيبدأ بعد ' + cfg.delay + ' ثانية — اقفل الشاشة دلوقتي لو عايز تجرب وهي مقفولة' });
    await sleep(cfg.delay * 1000);
  }
  for (var i = 0; i < cfg.count; i++) {
    if (S.stopped || id !== S.run) { await tell({ type: 'stopped', at: i }); return; }
    var p = pick(cfg, i);
    var opts = {
      body: 'نمط الاهتزاز: ' + p.n + ' · الفاصل ' + cfg.gap + ' ث',
      tag: cfg.sameTag ? 'alarm-test' : 'alarm-test-' + i,
      renotify: true, requireInteraction: !!cfg.sticky, silent: !!cfg.silent,
      vibrate: p.v, lang: 'ar', dir: 'rtl', data: { i: i + 1 },
      actions: cfg.actions ? [{ action: 'stop', title: '⏹ إيقاف' }, { action: 'snooze', title: '💤 غفوة' }] : []
    };
    try {
      await self.registration.showNotification('⏰ تجربة المنبه ' + (i + 1) + '/' + cfg.count, opts);
      await tell({ type: 'sent', i: i + 1, of: cfg.count, t: Date.now(), vib: p.n });
    } catch (e) { await tell({ type: 'error', text: String(e && e.message || e) }); return; }
    if (i < cfg.count - 1) await sleep(cfg.gap * 1000);
  }
  if (id === S.run) await tell({ type: 'done', count: cfg.count });
}
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', function (e) {
  var m = e.data || {};
  if (m.type === 'burst') e.waitUntil(burst(m.cfg || FALLBACK));
  else if (m.type === 'stop') e.waitUntil((async function () { S.stopped = true; S.run++; await closeAll(); await tell({ type: 'log', text: 'اتوقف من الصفحة' }); })());
});
self.addEventListener('notificationclose', function (e) {
  if ((e.notification.tag || '').indexOf('alarm-test') !== 0) return;
  if (S.cfg && S.cfg.stopOnDismiss) { S.stopped = true; }
  e.waitUntil(tell({ type: 'log', text: 'الإشعار اتقفل بالسحب' + (S.cfg && S.cfg.stopOnDismiss ? ' (وقّف التكرار)' : '') }));
});
self.addEventListener('notificationclick', function (e) {
  var a = e.action;
  e.notification.close();
  e.waitUntil((async function () {
    S.stopped = true; S.run++;
    await closeAll();
    if (a === 'stop') { await tell({ type: 'log', text: 'زر «إيقاف» اتداس من الإشعار' }); return; }
    if (a === 'snooze') {
      var cfg = Object.assign({}, S.cfg || FALLBACK, { delay: (S.cfg && S.cfg.snoozeSec) || 20 });
      await tell({ type: 'log', text: 'زر «غفوة» اتداس — هيرن تاني بعد ' + cfg.delay + ' ثانية' });
      await burst(cfg); return;
    }
    await tell({ type: 'log', text: 'الإشعار نفسه اتداس عليه (فتح الصفحة)' });
    var cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    var c = cs.find(function (x) { return 'focus' in x; });
    if (c) { await c.focus(); c.postMessage({ type: 'open-alarm' }); return; }
    await self.clients.openWindow('./?alarm=1');
  })());
});
