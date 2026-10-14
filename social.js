(function () {
if (window.__spV2) return; window.__spV2 = 1;
var LS = localStorage, $ = function (i) { return document.getElementById(i); };
var BASE = 'https://abdullah1fr.github.io/massr/';
var DAY = 864e5, HOUR = 36e5, GRACE = 24 * HOUR, COOLDOWN = 45000, NUDGE_GAP = 3 * HOUR;
var S = { uid: null, name: '', code: '', friends: {}, fp: {}, duels: [], unsubs: [], tab: 'rank', err: '', booting: false, form: null, qr: '', auto: {}, claim: null, dirty: false, reqs: {}, rFirst: true, res: null, qraw: '', fFirst: true, lastSeenW: 0 };
var KINDS = {
  app: { i: '📌', n: 'من تطبيقك — بتتوثّق لوحدها' },
  focus: { i: '⏱', n: 'دقائق تركيز — بتتوثّق لوحدها' },
  count: { i: '✅', n: 'عدد مهام — بتتوثّق لوحدها' },
  man: { i: '🤝', n: 'يدوي — بتأكيد صاحبك' }
};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ms(x) { if (x == null) return Date.now(); if (typeof x === 'number') return x; if (x.toMillis) return x.toMillis(); if (x.seconds) return x.seconds * 1000; return Date.now(); }
function msg(t) { var m = $('spMsg'); if (m) m.innerText = t || ''; }
function toast(t) { try { if (typeof showToast === 'function') { showToast(t); return; } } catch (e) { } msg(t); }
function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); if (s < 60) return 'دلوقتي'; if (s < 3600) return 'من ' + Math.round(s / 60) + ' د'; if (s < 86400) return 'من ' + Math.round(s / 3600) + ' س'; return 'من ' + Math.round(s / 86400) + ' يوم'; }

/* ---------- Firebase (تطبيق ثانوي "social" — هوية مجهولة معزولة عن حساب الإيميل) ---------- */
function sapp() {
  if (S.app) return S.app;
  if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') return null;
  try { S.app = firebase.app('social'); } catch (e) { S.app = firebase.initializeApp(firebaseConfig, 'social'); }
  return S.app;
}
function db() { try { if (!S.db) { var a = sapp(); if (a) S.db = a.firestore(); } return S.db || null; } catch (e) { return null; } }
function sauth() { try { var a = sapp(); return a ? a.auth() : null; } catch (e) { return null; } }
function FV() { return firebase.firestore.FieldValue; }
function whenUser(a) {
  return new Promise(function (res, rej) {
    var un = a.onAuthStateChanged(function (u) {
      try { un(); } catch (e) { }
      if (u) res(u); else a.signInAnonymously().then(function (c) { res(c.user); }, rej);
    }, rej);
  });
}

/* ---------- إحصائيات الأسبوع (من بيانات التطبيق نفسها) ---------- */
function wkStart() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return d; }
function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function statsFor(ws, we) {
  var t = 0, f = 0, k, x;
  completedHistory.forEach(function (h) { if (h.date) { x = new Date(h.date); if (x >= ws && x < we) t++; } });
  for (k in dailyFocusHistory) { x = new Date(k + 'T00:00:00'); if (x >= ws && x < we) f += dailyFocusHistory[k]; }
  return { t: t, f: Math.round(f / 60) };
}
function mine() {
  var ws = wkStart(), s = statsFor(ws, addDays(ws, 7));
  return { t: s.t, f: s.f, pts: s.t * 10 + s.f + Math.min(currentStreak || 0, 7) * 5, week: getDateKey(ws) };
}
function lastWeek() { var ws = wkStart(), pw = addDays(ws, -7), s = statsFor(pw, ws); return { week: getDateKey(pw), pts: s.t * 10 + s.f }; }
function totalFocusSec() { var t = 0, k; for (k in dailyFocusHistory) t += dailyFocusHistory[k] || 0; return t; }

function fail(e) {
  var c = (e && (e.code || e.message)) || 'unknown';
  S.err = (c === 'permission-denied' || /auth\//.test(c)) ? 'الخدمة مش جاهزة حاليًا، حاول بعد شوية ⚠️ (' + c + ')' : 'مفيش اتصال أو حصل خطأ، حاول تاني ⚠️';
  S.booting = false; render(true);
}
function gen() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', i; for (i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function fname(id) { var p = S.fp[id]; return (p && p.data && p.data.name) || (S.friends[id] && S.friends[id].name) || 'صديق'; }
function parseCode(t) {
  t = String(t || '').trim();
  var m = t.match(/[?&#]f=([A-Za-z0-9]{6})(?![A-Za-z0-9])/) || t.match(/^MSR1:([A-Za-z0-9]{6})$/i) || t.match(/^([A-Za-z0-9]{6})$/);
  return m ? m[1].toUpperCase() : '';
}

/* ---------- رابط الدعوة (?f=CODE) — لو صاحبك فتح اللينك أو مسح الـ QR بكاميرا الموبايل ---------- */
try {
  var pm = location.search.match(/[?&]f=([A-Za-z0-9]{6})(?![A-Za-z0-9])/);
  if (pm) {
    LS.setItem('sp_pending', pm[1].toUpperCase());
    var nu = location.pathname + location.search.replace(/([?&])f=[A-Za-z0-9]{6}&?/, '$1').replace(/[?&]$/, '') + location.hash;
    history.replaceState(null, '', nu);
  }
} catch (e) { }

/* ---------- مصداقية: حالة كل إنجاز ---------- */
function taskKind(d, i) { return (d.tk && d.tk[i]) || { k: 'man', n: 0 }; }
function accepted(d, u) { return !d.acc || !!d.acc[u]; }
function startOf(d, u) { var a = d.acc && d.acc[u]; return (typeof a === 'number' && a) || d.createdAt || 0; }
function claimInfo(d, u, i, now) {
  var c = d.cl && d.cl[u + '_' + i];
  if (c) {
    if (c.s === 'ok') return { s: 'ok', c: c, how: c.auto ? 'auto' : 'peer' };
    if (c.s === 'no') return { s: 'no', c: c };
    if (now - ms(c.at) > GRACE) return { s: 'ok', c: c, how: 'silent' };
    return { s: 'p', c: c };
  }
  if (d.done && d.done[u] && d.done[u].indexOf(i) >= 0) return { s: 'ok', how: 'legacy' };
  return { s: null };
}
function tally(d, u, now) {
  var ok = 0, p = 0, no = 0;
  d.tasks.forEach(function (t, i) { var x = claimInfo(d, u, i, now); if (x.s === 'ok') ok++; else if (x.s === 'p') p++; else if (x.s === 'no') no++; });
  return { ok: ok, p: p, no: no };
}
function myCred() {
  var ok = 0, no = 0;
  S.duels.forEach(function (d) { if (!d.cl) return; Object.keys(d.cl).forEach(function (k) { var c = d.cl[k]; if (c.u !== S.uid) return; if (c.s === 'ok') ok++; else if (c.s === 'no') no++; }); });
  return { ok: ok, no: no };
}
function credOf(p) { var c = p && p.cr; if (!c) return null; var t = (c.ok || 0) + (c.no || 0); if (t < 3) return null; return Math.round((c.ok || 0) / t * 100); }
function reviewsToDo() {
  var n = 0, now = Date.now();
  S.duels.forEach(function (d) { if (!d.cl || !accepted(d, S.uid)) return; Object.keys(d.cl).forEach(function (k) { var c = d.cl[k]; if (c.u !== S.uid && c.s === 'p' && now - ms(c.at) <= GRACE) n++; }); });
  return n;
}
function invitesCount() { var now = Date.now(); return S.duels.filter(function (d) { return d.acc && !d.acc[S.uid] && d.members.indexOf(S.uid) >= 0 && now < d.endsAt; }).length; }
function duelById(id) { for (var i = 0; i < S.duels.length; i++) if (S.duels[i].id === id) return S.duels[i]; return null; }

/* ---------- ربط المهام المشتركة بمهام التطبيق + التوثيق التلقائي ---------- */
function links() { try { return JSON.parse(LS.getItem('sp_link') || '{}'); } catch (e) { return {}; } }
function norm(s) { return String(s || '').replace(/⚔️|⚔/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function linkedExists(id) {
  if (!id) return false;
  return tasks.some(function (x) { return x.id === id; }) || completedHistory.some(function (h) { return h.taskId === id; });
}
function addLinkedTasks(d) {
  if (typeof tasks === 'undefined' || typeof saveAndRenderTasks !== 'function') return 0;
  var n = 0, lk = links();
  d.tasks.forEach(function (t, i) {
    if (taskKind(d, i).k !== 'app') return;
    var key = d.id + '_' + i;
    if (linkedExists(lk[key])) return;
    var nid = Date.now() + i;
    tasks.push({ id: nid, title: '⚔️ ' + t, priority: 'pri-high', category: (typeof categories !== 'undefined' && categories[0]) || '', repeat: 'none', repeatDay: null, repeatInterval: null, repeatCount: null, repeatDone: 0, repeatAnchorDate: null, dueDate: '', durationMinutes: 25, reminderOffset: 0, reminderFired: false, linkedNoteId: null, completed: false, createdDate: new Date().toISOString(), completedDate: null, subtasks: [], postponeCount: 0, duelRef: { d: d.id, i: i } });
    lk[key] = nid; n++;
  });
  if (n) { LS.setItem('sp_link', JSON.stringify(lk)); try { saveAndRenderTasks(); } catch (e) { } }
  return n;
}
function myProgress(d, i) {
  var t = taskKind(d, i), b = d.bs && d.bs[S.uid], start = startOf(d, S.uid), cur;
  if (t.k === 'focus') { if (!b) return null; cur = Math.max(0, Math.floor((totalFocusSec() - (b.f || 0)) / 60)); return { cur: cur, goal: t.n, done: cur >= t.n }; }
  if (t.k === 'count') { if (!b) return null; cur = Math.max(0, completedHistory.length - (b.c || 0)); return { cur: cur, goal: t.n, done: cur >= t.n }; }
  if (t.k === 'app') {
    var lk = links()[d.id + '_' + i], nt = norm(d.tasks[i]);
    var hit = completedHistory.filter(function (h) { var at = h.date ? new Date(h.date).getTime() : 0; return at >= start - 2000 && ((lk && h.taskId === lk) || norm(h.title) === nt); })[0];
    return { done: !!hit, at: hit && hit.date, linked: linkedExists(lk) };
  }
  return null;
}
function autoVerify() {
  if (!S.uid || !db() || typeof completedHistory === 'undefined') return;
  var now = Date.now();
  S.duels.forEach(function (d) {
    if (d.members.indexOf(S.uid) < 0 || !accepted(d, S.uid) || now > d.endsAt) return;
    var needBs = d.tk && d.tk.some(function (t) { return t.k === 'focus' || t.k === 'count'; });
    if (needBs && !(d.bs && d.bs[S.uid]) && !(S.auto['bs' + d.id] > now)) {
      S.auto['bs' + d.id] = now + 120000;
      db().collection('duels').doc(d.id).update('bs.' + S.uid, { f: totalFocusSec(), c: completedHistory.length, at: now }).catch(function () { });
    }
    d.tasks.forEach(function (t, i) {
      var k = taskKind(d, i).k; if (k === 'man') return;
      var ci = claimInfo(d, S.uid, i, now); if (ci.s === 'ok' || ci.s === 'p') return;
      var pr = myProgress(d, i); if (!pr || !pr.done) return;
      var key = d.id + '_' + i; if (S.auto[key] > now) return; S.auto[key] = now + 120000;
      var note = k === 'app' ? 'اتنفّذت في تطبيقه' : k === 'focus' ? pr.cur + ' دقيقة تركيز فعلية' : pr.cur + ' مهمة اتنجزت في تطبيقه';
      var obj = { u: S.uid, i: i, s: 'ok', auto: 1, n: note, at: FV().serverTimestamp() };
      db().collection('duels').doc(d.id).update('cl.' + S.uid + '_' + i, obj).then(function () { toast('✅ اتسجّلت تلقائيًا: ' + t); }).catch(function () { });
    });
  });
}

/* ---------- التشغيل والاتصال ---------- */
function init() {
  var a = sauth();
  if (!a || !db()) { S.err = 'خدمة Firebase مش متاحة دلوقتي ⚠️'; render(true); return Promise.resolve(); }
  if (S.booting) return Promise.resolve();
  S.booting = true; S.err = '';
  return whenUser(a).then(function (u) { if (S.uid === u.uid && S.code) { S.booting = false; return; } teardown(); S.uid = u.uid; return boot(); }).catch(fail);
}
function mkCode(n) {
  var c = gen(), d = db();
  return d.collection('codes').doc(c).set({ uid: S.uid }).then(function () {
    S.code = c; S.name = LS.getItem('sp_name') || LS.getItem('app_ai_user_name') || 'صديق';
    return d.collection('profiles').doc(S.uid).set({ name: S.name, code: c, createdAt: Date.now() }, { merge: true });
  }).catch(function (e) { if (n < 3 && e && e.code === 'permission-denied') return mkCode(n + 1); throw e; });
}
function boot() {
  var d = db();
  return d.collection('profiles').doc(S.uid).get().then(function (s) {
    if (s.exists && s.data().code) { S.code = s.data().code; S.name = s.data().name || LS.getItem('sp_name') || 'صديق'; return; }
    return mkCode(0);
  }).then(function () { LS.setItem('sp_on', '1'); S.booting = false; listen(); push(true); render(true); consumePending(); }).catch(fail);
}
function teardown() {
  S.unsubs.forEach(function (u) { try { u(); } catch (e) { } }); S.unsubs = [];
  Object.keys(S.fp).forEach(function (k) { try { S.fp[k].u && S.fp[k].u(); } catch (e) { } }); S.fp = {}; S.friends = {}; S.duels = [];
  if (S.timer) clearInterval(S.timer); S.code = ''; S.qr = ''; S.fFirst = true; S.reqs = {}; S.rFirst = true; S.res = null;
}
function listen() {
  var d = db();
  S.unsubs.push(d.collection('profiles').doc(S.uid).collection('friends').onSnapshot(function (sn) {
    var cur = {}; sn.forEach(function (x) { cur[x.id] = x.data(); });
    if (!S.fFirst) Object.keys(cur).forEach(function (k) { if (!S.friends[k]) toast('👥 ' + ((cur[k] && cur[k].name) || 'صديق جديد') + ' اتضاف لأصدقائك'); });
    S.fFirst = false;
    Object.keys(S.fp).forEach(function (k) { if (!cur[k]) { try { S.fp[k].u && S.fp[k].u(); } catch (e) { } delete S.fp[k]; } });
    Object.keys(cur).forEach(function (k) {
      if (S.fp[k]) return;
      S.fp[k] = { data: null };
      S.fp[k].u = d.collection('profiles').doc(k).onSnapshot(function (s) { S.fp[k].data = s.exists ? s.data() : null; render(); }, function () { });
    });
    S.friends = cur; render();
  }, fail));
  S.unsubs.push(d.collection('profiles').doc(S.uid).collection('requests').onSnapshot(function (sn) {
    var cur = {}; sn.forEach(function (x) { cur[x.id] = x.data(); });
    if (!S.rFirst) Object.keys(cur).forEach(function (k) { if (!S.reqs[k]) toast('📨 ' + ((cur[k] && cur[k].name) || 'حد') + ' بعتلك طلب صداقة'); });
    S.rFirst = false; S.reqs = cur; render();
  }, function () { }));
  S.unsubs.push(d.collection('duels').where('members', 'array-contains', S.uid).onSnapshot(function (sn) {
    S.duels = sn.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    notices(); autoVerify(); push(false); render();
  }, fail));
  S.timer = setInterval(tick, 30000);
}
var tn = 0;
function tick() { push(false); autoVerify(); if (++tn % 10 === 0) syncSent(); render(); }
try { document.addEventListener('visibilitychange', function () { if (!document.hidden && S.uid) { autoVerify(); push(false); } }); } catch (e) { }

function push(force) {
  if (!S.uid || !S.code || !db()) return;
  var m = mine(), lw = lastWeek(), cr = myCred(), h = LS.getItem('sp_hide') === '1', now = Date.now();
  var data = { name: S.name, nameLower: String(S.name || '').toLowerCase(), disc: LS.getItem('sp_nodisc') !== '1', week: m.week, pts: h ? null : m.pts, tasks: h ? null : m.t, focus: h ? null : m.f, streak: h ? null : (currentStreak || 0), hidden: h, lw: h ? null : lw, cr: cr, updatedAt: now };
  var sig = JSON.stringify([data.name, data.week, data.pts, data.tasks, data.focus, data.streak, data.hidden, lw.week, lw.pts, cr.ok, cr.no, data.disc]);
  var beat = now - S.lastSeenW > 5 * 60000;
  if (!force && !beat && sig === S.sig) return;
  data.seen = now;
  S.sig = sig; S.lastSeenW = now;
  db().collection('profiles').doc(S.uid).set(data, { merge: true }).catch(function () { S.sig = null; S.lastSeenW = 0; });
}
function notices() {
  var now = Date.now();
  S.duels.forEach(function (d) {
    var nd = d.nd && d.nd[S.uid];
    if (nd && nd.at > (parseInt(LS.getItem('sp_nds_' + d.id)) || 0)) {
      LS.setItem('sp_nds_' + d.id, String(nd.at));
      if (now - nd.at < DAY) toast('👊 ' + ((d.names && d.names[nd.from]) || fname(nd.from)) + ' بيحفّزك في تحدي «' + d.title + '»');
    }
    if (now > d.endsAt && now - d.endsAt < 3 * DAY && accepted(d, S.uid) && d.members.indexOf(S.uid) >= 0 && !LS.getItem('sp_ann_' + d.id)) {
      LS.setItem('sp_ann_' + d.id, '1');
      var st = standingsOf(d, now), top = st[0];
      if (top && top.ok > 0 && (!st[1] || top.ok > st[1].ok)) toast(top.u === S.uid ? '🏆 كسبت تحدي «' + d.title + '»! مبروك' : '🏁 انتهى «' + d.title + '» — الفايز: ' + ((d.names && d.names[top.u]) || fname(top.u)));
      else toast('🤝 تحدي «' + d.title + '» انتهى بتعادل');
    }
  });
}
function standingsOf(d, now) {
  return d.members.map(function (u) { var t = tally(d, u, now); return { u: u, ok: t.ok, p: t.p, no: t.no, acc: accepted(d, u) }; }).sort(function (a, b) { return b.ok - a.ok || a.no - b.no; });
}
function consumePending() {
  var p = LS.getItem('sp_pending');
  if (p && S.code) { LS.removeItem('sp_pending'); S.tab = 'friends'; addByCode(p); }
}

/* ---------- الواجهة ---------- */
function css() {
  if ($('spStyle')) return;
  var s = document.createElement('style'); s.id = 'spStyle';
  s.textContent = '.sp-card{background:var(--input-bg);border:1px solid var(--card-border);border-radius:12px;padding:10px;margin:8px 0;text-align:right}' +
    '.sp-row{display:flex;justify-content:space-between;align-items:center;gap:8px}.sp-sm{font-size:.74rem;opacity:.8;line-height:1.5}' +
    '.sp-bar{height:6px;border-radius:4px;background:var(--card-border);overflow:hidden;display:flex;margin-top:3px}.sp-bar i{display:block;height:6px}' +
    '.sp-chip{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);margin:2px 0 2px 4px}' +
    '.sp-ok{color:#2ecc71}.sp-bad{color:#e74c3c}.sp-wait{color:#f39c12}' +
    '.sp-mini{padding:4px 10px!important;font-size:.72rem!important}' +
    '.sp-in{width:100%;box-sizing:border-box;border-radius:10px;padding:8px;background:var(--input-bg);color:var(--text-primary,inherit);border:1px solid var(--card-border);font-family:inherit;font-size:.85rem}' +
    '.sp-task{border-top:1px dashed var(--card-border);margin-top:8px;padding-top:6px;font-size:.84rem}' +
    '.sp-qr{background:#fff;padding:8px;border-radius:12px;display:inline-block;line-height:0}.sp-qr img,.sp-qr canvas{display:block}' +
    '.sp-tabs .sync-tab-btn{padding:8px 2px;font-size:.7rem}' +
    '.sp-over{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2147482000;display:none;align-items:center;justify-content:center;padding:16px}' +
    '.sp-box{background:var(--card-bg);color:var(--text-primary);border:1px solid var(--accent);border-radius:14px;padding:14px;width:100%;max-width:420px;max-height:85vh;overflow:auto;text-align:right}' +
    '.sp-scan{position:fixed;inset:0;z-index:2147483000;background:#000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;padding:12px;box-sizing:border-box}' +
    '.sp-scan video{width:100%;max-width:520px;max-height:62vh;object-fit:cover;border-radius:14px}' +
    '.sp-frame{position:absolute;width:min(62vw,300px);height:min(62vw,300px);border:3px solid var(--accent,#ffb020);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none}';
  document.head.appendChild(s);
}
function ensureTabs() {
  var bar = document.querySelector('#spModal .sync-tabs'); if (!bar) return;
  bar.classList.add('sp-tabs');
  if (!$('spTab-feed')) { var b = document.createElement('button'); b.className = 'sync-tab-btn'; b.id = 'spTab-feed'; b.setAttribute('onclick', "spTab('feed')"); b.textContent = '📣 النشاط'; bar.appendChild(b); }
}
function card(inner) { return '<div class="sp-card">' + inner + '</div>'; }
function presence(p) { return (p && p.seen && Date.now() - p.seen < 7 * 60000) ? '<span class="sp-ok" title="نشط الآن">●</span> ' : ''; }
function credTag(p) { var c = credOf(p); return c == null ? '' : '<span class="sp-chip ' + (c >= 80 ? 'sp-ok' : c >= 50 ? 'sp-wait' : 'sp-bad') + '">✔ مصداقية ' + c + '%</span>'; }

function rankHtml() {
  var m = mine(), lw = lastWeek(), me = { id: S.uid, name: S.name + ' (أنت)', pts: m.pts, t: m.t, f: m.f, s: currentStreak || 0, me: true, p: { cr: myCred() } };
  var rows = [me], lwRows = [{ name: 'أنت', pts: lw.pts, week: lw.week }];
  Object.keys(S.friends).forEach(function (id) {
    var p = S.fp[id] && S.fp[id].data;
    if (!p) { rows.push({ id: id, name: fname(id), pts: 0, none: true }); return; }
    if (p.lw && p.lw.week === lw.week) lwRows.push({ name: p.name, pts: p.lw.pts || 0 });
    if (p.hidden) rows.push({ id: id, name: p.name, pts: -1, hid: true, p: p });
    else if (p.week !== m.week) rows.push({ id: id, name: p.name, pts: 0, t: 0, f: 0, s: p.streak || 0, p: p });
    else rows.push({ id: id, name: p.name, pts: p.pts || 0, t: p.tasks || 0, f: p.focus || 0, s: p.streak || 0, p: p });
  });
  rows.sort(function (a, b) { return b.pts - a.pts; });
  var med = ['🥇', '🥈', '🥉'], left = Math.max(0, Math.ceil((addDays(wkStart(), 7).getTime() - Date.now()) / DAY));
  var h = '<div class="settings-section-desc">الترتيب الأسبوعي (بيتصفّر كل سبت) — باقي ' + left + ' يوم. المهمة = 10 نقاط، دقيقة تركيز = نقطة، وكل يوم streak (لحد 7) = 5 نقاط. كل الأرقام بتتحسب من سجل تطبيقك الفعلي مش بالضغط على زرار ✅</div>';
  var mi = 0; rows.forEach(function (r, i) { if (r.me) mi = i; });
  if (rows.length > 1) {
    if (mi === 0) { var nx = rows[1]; h += card('<b>👑 أنت في المقدمة</b>' + (nx && !nx.hid && !nx.none ? '<div class="sp-sm">الفارق عن ' + esc(nx.name) + ': ' + (rows[0].pts - nx.pts) + ' نقطة — حافظ عليها 💪</div>' : '')); }
    else { var up = rows[mi - 1]; h += card('<b>📈 ناقصك ' + (up.pts - me.pts + 1) + ' نقطة عشان تعدّي ' + esc(up.name) + '</b><div class="sp-sm">مهمة واحدة = 10 نقاط، ساعة تركيز = 60 نقطة</div>'); }
  }
  lwRows.sort(function (a, b) { return b.pts - a.pts; });
  if (lwRows.length > 1 && lwRows[0].pts > 0) h += '<div class="sp-sm" style="margin:6px 0;">👑 بطل الأسبوع اللي فات: <b>' + esc(lwRows[0].name) + '</b> (' + lwRows[0].pts + ' نقطة)</div>';
  rows.forEach(function (r, i) {
    var line = r.hid ? '🙈 مخفي إحصائياته' : r.none ? '—' : '✅ ' + r.t + ' مهمة · ⏱ ' + r.f + ' د · 🔥 ' + r.s;
    h += card('<div class="sp-row" style="' + (r.me ? 'color:var(--accent);' : '') + '"><b>' + (med[i] || (i + 1) + '.') + ' ' + presence(r.p) + esc(r.name) + '</b><b>' + (r.pts < 0 ? '' : r.pts + ' نقطة') + '</b></div><div class="sp-sm" style="margin-top:4px;">' + line + '</div>' + (r.p ? '<div>' + credTag(r.p) + '</div>' : ''));
  });
  if (rows.length === 1) h += '<div class="settings-section-desc">لسه مفيش أصدقاء — من تاب "الأصدقاء" ابعت طلب بالاسم أو بالـ QR أو الكود.</div>';
  return h;
}

function sentMap() { try { return JSON.parse(LS.getItem('sp_sent') || '{}'); } catch (e) { return {}; } }
function reqHtml() {
  var h = '', ids = Object.keys(S.reqs);
  if (ids.length) {
    h += '<div style="margin:8px 0 2px;font-weight:700;">📨 طلبات صداقة (' + ids.length + ')</div>';
    ids.forEach(function (id) { h += card('<div class="sp-row"><b>👤 ' + esc(S.reqs[id].name || 'صديق') + '</b><span><button class="btn sp-mini" onclick="spAcceptReq(\'' + id + '\')">✔ قبول</button> <button class="btn btn-secondary sp-mini" onclick="spDeclineReq(\'' + id + '\')">✖ رفض</button></span></div>'); });
  }
  var sm = sentMap(), sids = Object.keys(sm).filter(function (k) { return !S.friends[k]; });
  if (sids.length) {
    h += '<div style="margin:8px 0 2px;font-weight:700;opacity:.8;">⏳ طلبات أرسلتها</div>';
    sids.forEach(function (id) { h += card('<div class="sp-row"><span>👤 ' + esc(sm[id].name || 'صديق') + ' <span class="sp-sm">مستني الرد</span></span><button class="btn btn-secondary sp-mini" onclick="spCancelReq(\'' + id + '\')">إلغاء</button></div>'); });
  }
  return h;
}
function searchHtml() {
  var h = '<div style="font-weight:700;margin-bottom:6px;">🔎 دوّر على صديق بالاسم</div><div style="display:flex;gap:6px;"><input type="text" id="spQ" class="sp-in" value="' + esc(S.qraw) + '" placeholder="اسم صاحبك" onkeydown="if(event.key===\'Enter\')spSearch()"><button class="btn sp-mini" onclick="spSearch()">بحث</button></div>';
  if (S.res) {
    var sm = sentMap();
    S.res.forEach(function (r) {
      var st = S.friends[r.id] ? '<span class="sp-ok sp-sm">صاحبك بالفعل ✅</span>' : S.reqs[r.id] ? '<button class="btn sp-mini" onclick="spAcceptReq(\'' + r.id + '\')">✔ قبول طلبه</button>' : sm[r.id] ? '<span class="sp-wait sp-sm">⏳ اتبعت الطلب</span>' : '<button class="btn sp-mini" onclick="spSendReq(\'' + r.id + '\')">➕ إرسال طلب</button>';
      h += '<div class="sp-row" style="margin-top:8px;"><span>👤 ' + esc(r.name) + (r.code ? ' <span class="sp-sm">(كود ينتهي بـ ' + esc(r.code.slice(-2)) + ')</span>' : '') + '</span>' + st + '</div>';
    });
    if (!S.res.length) h += '<div class="sp-sm" style="margin-top:6px;">مفيش نتايج — جرّب اسم تاني.</div>';
  }
  var nd = LS.getItem('sp_nodisc') === '1';
  return card(h + '<div style="margin-top:8px;"><button class="btn btn-secondary sp-mini" onclick="spDisc()">' + (nd ? '🙈 مخفي من البحث — اضغط للظهور' : '👁 ظاهر في البحث — اضغط للإخفاء') + '</button></div>');
}
function friendsHtml() {
  var qr = S.qr ? '<img src="' + S.qr + '" width="168" height="168" alt="QR">' : '<div id="spQR"></div>';
  var h = card('<div class="sp-sm">كودك — صاحبك يمسح الـ QR أو يكتب الكود وبيتبعتلك طلب صداقة تقبله:</div><div style="text-align:center;margin:8px 0;"><div class="sp-qr">' + qr + '</div></div><div style="font-family:monospace;font-size:1.6rem;letter-spacing:4px;text-align:center;color:var(--accent);margin:6px 0;">' + esc(S.code) + '</div><div style="display:flex;gap:6px;"><button class="btn btn-secondary" style="flex:1;" onclick="spCopy()">📋 نسخ</button><button class="btn btn-secondary" style="flex:1;" onclick="spShare()">📤 مشاركة</button></div>');
  h = reqHtml() + searchHtml() + h;
  h += card('<div style="font-weight:700;margin-bottom:6px;">📨 إرسال طلب بالـ QR أو الكود</div><button class="btn" style="width:100%;" onclick="spScan()">📷 افتح الكاميرا وامسح الـ QR</button><div class="sp-sm" style="text-align:center;margin:8px 0;">— أو لو مفيش كاميرا اكتب الكود —</div><input type="text" id="spCodeIn" class="sp-in" maxlength="6" placeholder="اكتب كود صاحبك" autocomplete="off" style="text-align:center;font-family:monospace;text-transform:uppercase;"><button class="btn btn-secondary" style="width:100%;margin-top:6px;" onclick="spAdd()">إرسال طلب بالكود</button>');
  var ids = Object.keys(S.friends);
  h += '<div style="margin:12px 0 2px;font-weight:700;opacity:.8;">أصدقائي (' + ids.length + ')</div>';
  ids.forEach(function (id) {
    var p = S.fp[id] && S.fp[id].data;
    h += card('<div class="sp-row"><span>' + presence(p) + '👤 ' + esc(fname(id)) + '</span><span><button class="btn btn-secondary sp-mini" onclick="spChallenge(\'' + id + '\')">⚔️ تحدّيه</button> <button class="btn btn-secondary sp-mini" onclick="spRemove(\'' + id + '\')">حذف</button></span></div>' + (p ? '<div class="sp-sm">' + (p.seen ? 'آخر ظهور ' + ago(p.seen) : '') + ' ' + credTag(p) + '</div>' : ''));
  });
  var hid = LS.getItem('sp_hide') === '1';
  h += '<div style="margin-top:12px;display:flex;gap:6px;"><button class="btn btn-secondary" style="flex:1;" onclick="spName()">✏️ اسمي: ' + esc(S.name) + '</button><button class="btn btn-secondary" style="flex:1;" onclick="spHide()">' + (hid ? '👁 إظهار إحصائياتي' : '🙈 إخفاء إحصائياتي') + '</button></div>';
  return h;
}

/* ---------- التحديات ---------- */
var TEMPLATES = [
  { n: '📚 مذاكرة', t: 'مذاكرة الأسبوع', rows: [{ k: 'focus', n: 300 }, { k: 'app', t: 'حل واجب المادة' }, { k: 'man', t: 'مراجعة درس وتلخيصه' }] },
  { n: '🏋️ رياضة', t: 'تحدي اللياقة', rows: [{ k: 'man', t: 'تمرين النهارده' }, { k: 'man', t: 'مشي 5 كم' }, { k: 'count', n: 5 }] },
  { n: '⏱ تركيز', t: 'ماراثون التركيز', rows: [{ k: 'focus', n: 600 }, { k: 'count', n: 10 }] },
  { n: '📖 ورد', t: 'ورد القرآن', rows: [{ k: 'man', t: 'ورد اليوم' }, { k: 'man', t: 'مراجعة الحفظ' }] }
];
function newForm() { return { title: '', prize: '', days: 7, rows: [{ k: 'app', t: '', n: 0 }], picks: {} }; }
function rowHtml(r, i) {
  var sel = '<select class="sp-in" style="flex:0 0 46%;" onchange="spR(' + i + ',\'k\',this.value)">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (r.k === k ? ' selected' : '') + '>' + KINDS[k].i + ' ' + KINDS[k].n.split(' — ')[0] + '</option>'; }).join('') + '</select>';
  var inp = (r.k === 'focus' || r.k === 'count')
    ? '<input type="number" class="sp-in" min="1" value="' + (r.n || '') + '" placeholder="' + (r.k === 'focus' ? 'كام دقيقة تركيز؟' : 'كام مهمة؟') + '" oninput="spR(' + i + ',\'n\',this.value)">'
    : '<input type="text" class="sp-in" value="' + esc(r.t) + '" placeholder="نص المهمة" oninput="spR(' + i + ',\'t\',this.value)">';
  return '<div style="display:flex;gap:6px;margin-top:6px;">' + sel + inp + '<button class="btn btn-secondary sp-mini" onclick="spRowDel(' + i + ')">✕</button></div>';
}
function formHtml() {
  var f = S.form, ids = Object.keys(S.friends);
  if (!ids.length) return '<div class="settings-section-desc">أضف أصدقاء الأول من تاب "الأصدقاء".</div>';
  var h = '<div class="sp-card"><input type="text" class="sp-in" value="' + esc(f.title) + '" placeholder="اسم التحدي (مثلًا: مذاكرة الأسبوع)" oninput="spF(\'title\',this.value)" style="text-align:center;">';
  h += '<div style="margin:8px 0 2px;" class="sp-sm">قوالب جاهزة:</div><div>' + TEMPLATES.map(function (t, i) { return '<button class="btn btn-secondary sp-mini" style="margin:2px;" onclick="spTpl(' + i + ')">' + t.n + '</button>'; }).join('') + '</div>';
  h += '<div style="margin:10px 0 0;font-weight:700;font-size:.85rem;">المهام المشتركة</div><div class="sp-sm">📌/⏱/✅ بتتوثّق تلقائيًا من تطبيقك — 🤝 اليدوي لازم صاحبك يأكّده</div>';
  f.rows.forEach(function (r, i) { h += rowHtml(r, i); });
  if (f.rows.length < 15) h += '<button class="btn btn-secondary sp-mini" style="margin-top:6px;" onclick="spRowAdd()">+ مهمة تانية</button>';
  h += '<div style="margin:10px 0 4px;font-size:.85rem;">المدة</div><select class="sp-in" onchange="spF(\'days\',this.value)">' + [3, 7, 14, 30].map(function (n) { return '<option value="' + n + '"' + (+f.days === n ? ' selected' : '') + '>' + n + ' يوم</option>'; }).join('') + '</select>';
  h += '<input type="text" class="sp-in" style="margin-top:6px;" value="' + esc(f.prize) + '" placeholder="🎁 جايزة / عقاب الخاسر (اختياري) — مثلًا: يعزم على غدا" oninput="spF(\'prize\',this.value)">';
  h += '<div style="margin:10px 0 2px;font-size:.85rem;">مين يشارك؟</div>';
  ids.forEach(function (id) { h += '<label style="display:block;padding:3px 0;"><input type="checkbox" ' + (f.picks[id] ? 'checked ' : '') + 'onchange="spPick(\'' + id + '\',this.checked)"> ' + esc(fname(id)) + '</label>'; });
  h += '<button class="btn" style="width:100%;margin-top:8px;" onclick="spMkDuel()">🚀 ابدأ التحدي</button></div>';
  return h;
}
function duelCard(d) {
  var now = Date.now(), over = now > d.endsAt, myAcc = accepted(d, S.uid), meIn = d.members.indexOf(S.uid) >= 0;
  var nm = function (u) { return u === S.uid ? 'أنت' : ((d.names && d.names[u]) || fname(u)); };
  var st = standingsOf(d, now), tot = d.tasks.length || 1;
  var win = over && st[0].ok > 0 && (!st[1] || st[0].ok > st[1].ok) ? st[0].u : null;
  var h = '<div class="sp-row"><b>⚔️ ' + esc(d.title) + '</b><span class="sp-sm">' + (over ? 'انتهى' : 'باقي ' + Math.max(1, Math.ceil((d.endsAt - now) / DAY)) + ' يوم') + '</span></div>';
  if (d.prize) h += '<div class="sp-sm">🎁 ' + esc(d.prize) + '</div>';
  if (!myAcc && !over) h += '<div style="background:rgba(243,156,18,.12);border-radius:10px;padding:8px;margin:8px 0;"><div class="sp-sm" style="opacity:1;">' + esc(nm(d.createdBy)) + ' بيتحداك! لازم تقبل الأول، ولما تقبل المهام اللي من تطبيقك هتتضاف لمهامك تلقائيًا.</div><div style="display:flex;gap:6px;margin-top:6px;"><button class="btn" style="flex:1;" onclick="spAccept(\'' + d.id + '\')">✅ قبول</button><button class="btn btn-secondary" style="flex:1;" onclick="spLeave(\'' + d.id + '\')">✖ رفض</button></div></div>';
  st.forEach(function (x) {
    h += '<div style="margin-top:8px;font-size:.82rem;"><div class="sp-row"><span>' + (win === x.u ? '🏆 ' : '') + esc(nm(x.u)) + (x.acc ? '' : ' <span class="sp-sm">(لسه ما قبلش)</span>') + (credTag(x.u === S.uid ? { cr: myCred() } : (S.fp[x.u] && S.fp[x.u].data))) + '</span><span>' + x.ok + '/' + tot + (x.p ? ' <span class="sp-wait">+' + x.p + '⏳</span>' : '') + (x.u !== S.uid && !over && x.acc && myAcc ? ' <button class="btn btn-secondary sp-mini" onclick="spNudge(\'' + d.id + '\',\'' + x.u + '\')">👊</button>' : '') + '</span></div><div class="sp-bar"><i style="width:' + Math.round(x.ok / tot * 100) + '%;background:var(--accent);"></i><i style="width:' + Math.round(x.p / tot * 100) + '%;background:#f39c12;opacity:.6;"></i></div></div>';
  });
  if (over && !win) h += '<div class="sp-sm" style="margin-top:6px;">🤝 انتهى بتعادل</div>';
  d.tasks.forEach(function (t, i) {
    var kd = taskKind(d, i), K = KINDS[kd.k] || KINDS.man, mi = claimInfo(d, S.uid, i, now);
    h += '<div class="sp-task"><div class="sp-row"><span' + (mi.s === 'ok' ? ' style="opacity:.7;"' : '') + '>' + K.i + ' ' + esc(t) + '</span></div>';
    if (meIn) {
      var line = '';
      if (mi.s === 'ok') line = '<span class="sp-ok">✅ ' + ({ auto: 'موثّق من التطبيق', peer: 'أكّده ' + nm(mi.c && mi.c.v), silent: 'اتأكد تلقائيًا (محدش اعترض)', legacy: 'مسجّل' }[mi.how]) + '</span>' + (mi.c && mi.c.n ? ' <span class="sp-sm">— ' + esc(mi.c.n) + '</span>' : '');
      else if (mi.s === 'p') line = '<span class="sp-wait">⏳ مستني تأكيد صاحبك (بيتأكد تلقائيًا بعد ' + Math.max(1, Math.ceil((GRACE - (now - ms(mi.c.at))) / HOUR)) + ' س لو محدش اعترض)</span>';
      else if (mi.s === 'no') line = '<span class="sp-bad">❌ اتعارض عليها' + (mi.c.v ? ' من ' + esc(nm(mi.c.v)) : '') + '</span>' + (kd.k === 'man' && !over && (mi.c.r || 0) < 2 ? ' <button class="btn btn-secondary sp-mini" onclick="spClaim(\'' + d.id + '\',' + i + ')">🔁 أثبتها تاني</button>' : '');
      else if (!over && myAcc) {
        if (kd.k === 'man') line = '<button class="btn btn-secondary sp-mini" onclick="spClaim(\'' + d.id + '\',' + i + ')">أنجزتها ✍️</button>';
        else {
          var pr = myProgress(d, i);
          if (kd.k === 'app') line = '<span class="sp-sm">هتتسجّل لوحدها لما تخلّصها من تطبيقك ✨</span>' + (pr && pr.linked ? '' : ' <button class="btn btn-secondary sp-mini" onclick="spLink(\'' + d.id + '\')">📌 أضفها لمهامي</button>');
          else if (pr) line = '<span class="sp-sm">' + (kd.k === 'focus' ? '⏱ ' : '✅ ') + Math.min(pr.cur, pr.goal) + '/' + pr.goal + (kd.k === 'focus' ? ' دقيقة' : ' مهمة') + '</span><div class="sp-bar"><i style="width:' + Math.min(100, Math.round(pr.cur / pr.goal * 100)) + '%;background:var(--accent);"></i></div>';
          else line = '<span class="sp-sm">⏳ بنجهّز نقطة البداية...</span>';
        }
      }
      if (line) h += '<div style="margin-top:4px;">' + line + '</div>';
    }
    d.members.forEach(function (u) {
      if (u === S.uid) return;
      var x = claimInfo(d, u, i, now);
      h += '<span class="sp-chip">' + esc(nm(u)) + ' ' + (x.s === 'ok' ? '✅' : x.s === 'p' ? '⏳' : x.s === 'no' ? '❌' : '—') + '</span>';
      if (x.s === 'p' && myAcc && !over) h += '<div style="background:rgba(243,156,18,.1);border-radius:8px;padding:6px;margin:4px 0;"><div class="sp-sm" style="opacity:1;">💬 ' + esc(nm(u)) + ': «' + esc(x.c.n || '') + '»</div><div style="display:flex;gap:6px;margin-top:4px;"><button class="btn sp-mini" onclick="spReview(\'' + d.id + '\',\'' + u + '_' + i + '\',1)">✔ أكّد</button><button class="btn btn-secondary sp-mini" onclick="spReview(\'' + d.id + '\',\'' + u + '_' + i + '\',0)">✖ اعترض</button></div></div>';
    });
    h += '</div>';
  });
  var foot = '';
  if (over && meIn) foot += '<button class="btn btn-secondary sp-mini" onclick="spRematch(\'' + d.id + '\')">🔁 جولة تانية</button> ';
  if (!over && meIn && d.createdBy !== S.uid && myAcc) foot += '<button class="btn btn-secondary sp-mini" onclick="spLeave(\'' + d.id + '\')">🚪 انسحاب</button> ';
  if (d.createdBy === S.uid) foot += '<button class="btn btn-secondary sp-mini" onclick="spDelDuel(\'' + d.id + '\')">🗑 حذف التحدي</button>';
  if (foot) h += '<div style="text-align:left;margin-top:8px;">' + foot + '</div>';
  return card(h);
}
function duelsHtml() {
  var h = '<button class="btn" style="width:100%;" onclick="spToggleForm()">⚔️ تحدي جديد</button>';
  if (S.form) h += formHtml();
  h += '<div class="settings-section-desc" style="margin-top:8px;">🛡 المصداقية: المهام الموثّقة بتتسجّل من سجل تطبيقك مش بزرار، واليدوية لازم صاحبك يأكّدها. أي إنجاز بيتعارض عليه مابيتحسبش.</div>';
  if (!S.duels.length) h += '<div class="settings-section-desc" style="margin-top:10px;">مفيش تحديات لسه. اعمل مهام مشتركة مع صحابك ومين يخلّص أكتر يكسب 🏆</div>';
  var now = Date.now(), list = S.duels.slice().sort(function (a, b) {
    var ia = (a.acc && !a.acc[S.uid] ? 0 : 1) + (now > a.endsAt ? 2 : 0), ib = (b.acc && !b.acc[S.uid] ? 0 : 1) + (now > b.endsAt ? 2 : 0);
    return ia - ib || b.createdAt - a.createdAt;
  });
  list.forEach(function (d) { h += duelCard(d); });
  return h;
}
function feedHtml() {
  var ev = [], now = Date.now();
  S.duels.forEach(function (d) {
    var nm = function (u) { return u === S.uid ? 'أنت' : ((d.names && d.names[u]) || fname(u)); };
    if (d.cl) Object.keys(d.cl).forEach(function (k) {
      var c = d.cl[k], t = d.tasks[c.i]; if (t == null) return;
      var at = ms(c.at), L = '«' + t + '» — ' + d.title;
      if (c.s === 'ok' && c.auto) ev.push({ at: at, ic: '✅', tx: nm(c.u) + ' أنجز ' + L + ' (موثّق من التطبيق)' });
      else if (c.s === 'ok') ev.push({ at: c.rt || at, ic: '🤝', tx: nm(c.v) + ' أكّد إنجاز ' + nm(c.u) + ' ل' + L });
      else if (c.s === 'no') ev.push({ at: c.rt || at, ic: '❌', tx: nm(c.v) + ' اعترض على ' + nm(c.u) + ' في ' + L });
      else ev.push({ at: at, ic: '⏳', tx: nm(c.u) + ' بيطلب تأكيد ' + L });
    });
    if (d.nd) Object.keys(d.nd).forEach(function (u) { ev.push({ at: d.nd[u].at, ic: '👊', tx: nm(d.nd[u].from) + ' حفّز ' + nm(u) + ' في ' + d.title }); });
    if (now > d.endsAt) { var st = standingsOf(d, now); if (st[0] && st[0].ok > 0 && (!st[1] || st[0].ok > st[1].ok)) ev.push({ at: d.endsAt, ic: '🏆', tx: nm(st[0].u) + ' كسب تحدي «' + d.title + '»' }); }
  });
  ev.sort(function (a, b) { return b.at - a.at; });
  if (!ev.length) return '<div class="settings-section-desc">لسه مفيش نشاط. أول ما حد ينجز مهمة في تحدي هتلاقيها هنا 📣</div>';
  return ev.slice(0, 40).map(function (e) { return card('<div class="sp-row"><span>' + e.ic + ' ' + esc(e.tx) + '</span><span class="sp-sm" style="white-space:nowrap;">' + ago(e.at) + '</span></div>'); }).join('');
}

function render(force) {
  var body = $('spBody'), modal = $('spModal'); if (!body || !modal || modal.style.display !== 'flex') return;
  css(); ensureTabs();
  var ae = document.activeElement;
  if (!force && ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { S.dirty = true; return; }
  S.dirty = false;
  ['rank', 'friends', 'duels', 'feed'].forEach(function (t) { var b = $('spTab-' + t); if (b) b.classList.toggle('active', t === S.tab); });
  var dt = $('spTab-duels'), bn = S.code ? reviewsToDo() + invitesCount() : 0; var ft = $('spTab-friends'), rn = S.code ? Object.keys(S.reqs).length : 0; if (ft) ft.textContent = '👥 الأصدقاء' + (rn ? ' (' + rn + ')' : '');
  if (dt) dt.textContent = '⚔️ التحديات' + (bn ? ' (' + bn + ')' : '');
  if (!S.code) {
    var pend = LS.getItem('sp_pending');
    body.innerHTML = (S.err ? '<div class="settings-section-desc" style="color:#c0392b;">' + esc(S.err) + '</div>' : '') +
      (pend ? '<div class="sp-card">🎉 وصلك كود صديق (<b>' + esc(pend) + '</b>) — ابدأ وهنضيفه تلقائيًا.</div>' : '') +
      '<div class="settings-section-desc">نافس صحابك على المهام والتركيز. الأصدقاء بيشوفوا أرقامك بس (نقاط، مهام منجزة، دقايق تركيز، streak) — مش عناوين مهامك ولا ملاحظاتك، وتقدر تخفيها في أي وقت.</div>' +
      '<div class="task-options-row"><input type="text" id="spNameIn" placeholder="اسمك اللي هيظهر لأصحابك" value="' + esc(LS.getItem('sp_name') || LS.getItem('app_ai_user_name') || '') + '" style="text-align:center;"></div>' +
      '<button class="btn" style="width:100%;margin-top:6px;" onclick="spStart()">' + (S.booting ? '⏳ جاري التجهيز...' : '🚀 ابدأ') + '</button>';
    return;
  }
  var keep = ($('spCodeIn') || {}).value;
  body.innerHTML = (S.err ? '<div class="settings-section-desc" style="color:#c0392b;">' + esc(S.err) + '</div>' : '') + (S.tab === 'rank' ? rankHtml() : S.tab === 'friends' ? friendsHtml() : S.tab === 'duels' ? duelsHtml() : feedHtml());
  if (keep && $('spCodeIn')) $('spCodeIn').value = keep;
  afterRender();
}
function afterRender() {
  var q = $('spQR'); if (!q || S.qr) return;
  if (typeof QRCode === 'undefined') { q.innerHTML = '<div class="sp-sm" style="color:#000;line-height:1.4;padding:20px;">مكتبة QR مش متحمّلة — استخدم الكود المكتوب</div>'; return; }
  try {
    q.innerHTML = ''; new QRCode(q, { text: BASE + '?f=' + S.code, width: 168, height: 168, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    var cv = q.querySelector('canvas'); if (cv) { try { S.qr = cv.toDataURL('image/png'); } catch (e) { } }
  } catch (e) { }
}
try { document.addEventListener('focusout', function (e) { if (S.dirty && e.target && e.target.closest && e.target.closest('#spBody')) setTimeout(function () { if (S.dirty) render(); }, 250); }); } catch (e) { }

/* ---------- الأوامر ---------- */
function addByCode(raw) {
  var c = parseCode(raw), d = db();
  if (c.length !== 6) { msg('الكود 6 حروف/أرقام'); return Promise.resolve(); }
  if (!S.code || !d) { msg('ابدأ الخدمة الأول 🚀'); return Promise.resolve(); }
  if (c === S.code) { msg('ده كودك إنت 😄'); return Promise.resolve(); }
  msg('جاري البحث...');
  return d.collection('codes').doc(c).get().then(function (s) {
    if (!s.exists) { msg('الكود غلط ⚠️'); return; }
    var fu = s.data().uid; if (fu === S.uid) { msg('ده كودك إنت 😄'); return; }
    if (S.friends[fu]) { msg('هو صاحبك بالفعل'); return; }
    if (S.reqs[fu]) { spAcceptReq(fu); return; }
    if (sentMap()[fu]) { msg('بعتله طلب قبل كده، مستني رده ⏳'); return; }
    return d.collection('profiles').doc(fu).collection('requests').doc(S.uid).set({ name: S.name, at: Date.now() }).then(function () {
      setSent(fu, { name: 'صديق', at: Date.now() });
      var ci = $('spCodeIn'); if (ci) ci.value = '';
      msg('📨 اتبعت طلب الصداقة — لما يقبله هتتضافوا'); toast('📨 اتبعت طلب الصداقة'); render(true);
      return d.collection('profiles').doc(fu).get().then(function (p) {
        if (p.exists && p.data().name) { setSent(fu, { name: p.data().name, at: Date.now() }); msg('📨 اتبعت طلب لـ ' + p.data().name + ' — مستني قبوله'); render(true); }
      }).catch(function () { });
    });
  }).catch(function () { msg('تعذّر إرسال الطلب ⚠️'); });
}
function syncSent() {
  var d = db(), m = sentMap(); if (!d || !S.uid) return;
  Object.keys(m).forEach(function (id) {
    if (S.friends[id]) { setSent(id, null); return; }
    d.collection('profiles').doc(id).collection('requests').doc(S.uid).get().then(function (x) { if (!x.exists && !S.friends[id]) { setSent(id, null); render(); } }).catch(function () { });
  });
}
window.spOpen = function () {
  css(); ensureTabs(); $('spModal').style.display = 'flex'; S.tab = LS.getItem('sp_pending') ? 'friends' : 'rank'; msg('');
  render(true); if (LS.getItem('sp_on') === '1' && !S.code) init(); else if (S.code) { autoVerify(); consumePending(); syncSent(); }
};
window.spClose = function () { $('spModal').style.display = 'none'; try { spScanClose(); } catch (e) { } };
window.spTab = function (t) { S.tab = t; msg(''); render(true); };
window.spStart = function () {
  var n = ($('spNameIn').value || '').trim(); if (!n) { msg('اكتب اسمك الأول ✏️'); return; }
  LS.setItem('sp_name', n.slice(0, 20)); S.name = n.slice(0, 20); init().then(function () { render(true); });
  render(true);
};
window.spName = function () {
  var n = prompt('اسمك اللي هيظهر لأصحابك:', S.name); if (!n || !n.trim()) return;
  S.name = n.trim().slice(0, 20); LS.setItem('sp_name', S.name); push(true); render(true);
};
window.spHide = function () { LS.setItem('sp_hide', LS.getItem('sp_hide') === '1' ? '0' : '1'); push(true); render(true); };
window.spCopy = function () { try { navigator.clipboard.writeText(S.code); msg('اتنسخ الكود ✅'); } catch (e) { msg(S.code); } };
window.spShare = function () {
  var t = 'تعالى نتنافس على "سأنجزها" 💪 كودي: ' + S.code + '\nأو افتح الرابط ده وهتتضاف تلقائي:\n' + BASE + '?f=' + S.code;
  if (navigator.share) navigator.share({ text: t }).catch(function () { }); else { try { navigator.clipboard.writeText(t); msg('اتنسخت رسالة الدعوة ✅'); } catch (e) { msg(t); } }
};
window.spAdd = function () { addByCode(($('spCodeIn') || {}).value); };
window.spSearch = function () {
  var raw = (($('spQ') || {}).value || '').trim(), q = raw.toLowerCase(); S.qraw = raw;
  if (q.length < 2) { msg('اكتب حرفين على الأقل'); return; }
  if (!db() || !S.code) { msg('ابدأ الخدمة الأول 🚀'); return; }
  msg('بدوّر...');
  db().collection('profiles').where('nameLower', '>=', q).where('nameLower', '<=', q + '\uf8ff').limit(20).get().then(function (sn) {
    var r = []; sn.forEach(function (x) { var p = x.data(); if (x.id === S.uid || p.disc === false || !p.name) return; r.push({ id: x.id, name: p.name, code: p.code || '' }); });
    S.res = r; msg(''); render(true);
  }).catch(function () { msg('البحث مش متاح دلوقتي ⚠️ (غالبًا محتاج تحديث قواعد Firestore)'); });
};
function setSent(id, v) { var m = sentMap(); if (v) m[id] = v; else delete m[id]; LS.setItem('sp_sent', JSON.stringify(m)); }
window.spSendReq = function (id) {
  var name = ((S.res || []).filter(function (r) { return r.id === id; })[0] || {}).name || 'صديق';
  if (S.friends[id]) return; if (S.reqs[id]) { spAcceptReq(id); return; }
  db().collection('profiles').doc(id).collection('requests').doc(S.uid).set({ name: S.name, at: Date.now() })
    .then(function () { setSent(id, { name: name, at: Date.now() }); toast('📨 اتبعت طلب الصداقة'); render(true); })
    .catch(function () { msg('تعذّر إرسال الطلب ⚠️ (غالبًا محتاج تحديث قواعد Firestore)'); });
};
window.spCancelReq = function (id) {
  db().collection('profiles').doc(id).collection('requests').doc(S.uid).delete().catch(function () { });
  setSent(id, null); render(true);
};
window.spAcceptReq = function (id) {
  var d = db(), r = S.reqs[id], at = Date.now(), b = d.batch();
  b.set(d.collection('profiles').doc(S.uid).collection('friends').doc(id), { name: (r && r.name) || 'صديق', at: at });
  b.set(d.collection('profiles').doc(id).collection('friends').doc(S.uid), { name: S.name, at: at });
  b.delete(d.collection('profiles').doc(S.uid).collection('requests').doc(id));
  b.commit().then(function () { setSent(id, null); toast('🎉 بقيتوا أصدقاء'); }).catch(function () { msg('تعذّر القبول ⚠️'); });
};
window.spDeclineReq = function (id) { db().collection('profiles').doc(S.uid).collection('requests').doc(id).delete().catch(function () { msg('تعذّر الرفض ⚠️'); }); };
window.spDisc = function () { LS.setItem('sp_nodisc', LS.getItem('sp_nodisc') === '1' ? '0' : '1'); push(true); render(true); };
window.spRemove = function (id) {
  if (!confirm('تحذف الصديق ده؟')) return;
  var d = db(); d.collection('profiles').doc(S.uid).collection('friends').doc(id).delete()
    .then(function () { return d.collection('profiles').doc(id).collection('friends').doc(S.uid).delete(); }).catch(function () { });
};

/* نموذج التحدي */
window.spToggleForm = function () { S.form = S.form ? null : newForm(); render(true); };
window.spF = function (k, v) { if (S.form) S.form[k] = v; };
window.spR = function (i, k, v) { var r = S.form && S.form.rows[i]; if (!r) return; r[k] = v; if (k === 'k') { if ((v === 'focus' || v === 'count') && !r.n) r.n = v === 'focus' ? 60 : 3; render(true); } };
window.spRowAdd = function () { S.form.rows.push({ k: 'man', t: '', n: 0 }); render(true); };
window.spRowDel = function (i) { if (S.form.rows.length > 1) { S.form.rows.splice(i, 1); render(true); } };
window.spPick = function (id, on) { if (S.form) S.form.picks[id] = !!on; };
window.spTpl = function (i) {
  var t = TEMPLATES[i]; if (!S.form) S.form = newForm();
  S.form.title = t.t; S.form.rows = t.rows.map(function (r) { return { k: r.k, t: r.t || '', n: r.n || 0 }; }); render(true);
};
window.spChallenge = function (id) { S.form = newForm(); S.form.picks[id] = true; S.tab = 'duels'; render(true); };
window.spRematch = function (id) {
  var d = duelById(id); if (!d) return;
  var f = newForm(); f.title = d.title + ' (جولة تانية)'; f.prize = d.prize || ''; f.days = Math.max(3, Math.min(30, Math.round((d.endsAt - d.createdAt) / DAY)));
  f.rows = d.tasks.map(function (t, i) { var k = taskKind(d, i); return { k: k.k, t: (k.k === 'focus' || k.k === 'count') ? '' : t, n: k.n || 0 }; });
  d.members.forEach(function (u) { if (u !== S.uid && S.friends[u]) f.picks[u] = true; });
  S.form = f; S.tab = 'duels'; render(true);
};
window.spMkDuel = function () {
  var f = S.form; if (!f) return;
  var ids = Object.keys(f.picks).filter(function (k) { return f.picks[k] && S.friends[k]; });
  var tasksArr = [], tk = [], bad = false;
  f.rows.forEach(function (r) {
    var n = parseInt(r.n) || 0;
    if (r.k === 'focus') { if (n < 1) { bad = true; return; } tasksArr.push('ركّز ' + n + ' دقيقة'); tk.push({ k: 'focus', n: n }); }
    else if (r.k === 'count') { if (n < 1) { bad = true; return; } tasksArr.push('خلّص ' + n + ' مهام من تطبيقك'); tk.push({ k: 'count', n: n }); }
    else { var t = (r.t || '').trim().slice(0, 80); if (!t) { bad = true; return; } tasksArr.push(t); tk.push({ k: r.k === 'app' ? 'app' : 'man', n: 0 }); }
  });
  if (bad || !tasksArr.length) { msg('كمّل بيانات كل المهام (النص أو الرقم) ✍️'); return; }
  if (!ids.length) { msg('اختار صديق واحد على الأقل'); return; }
  var title = (f.title || '').trim().slice(0, 40) || 'تحدي', now = Date.now(), days = [3, 7, 14, 30].indexOf(+f.days) >= 0 ? +f.days : 7;
  var names = {}, acc = {}, bs = {}; names[S.uid] = S.name; acc[S.uid] = now; bs[S.uid] = { f: totalFocusSec(), c: completedHistory.length, at: now };
  ids.forEach(function (i) { names[i] = fname(i); });
  db().collection('duels').add({ v: 2, title: title, tasks: tasksArr, tk: tk, prize: (f.prize || '').trim().slice(0, 60), members: [S.uid].concat(ids), names: names, acc: acc, bs: bs, cl: {}, done: {}, nd: {}, createdBy: S.uid, createdAt: now, endsAt: now + days * DAY })
    .then(function (ref) {
      var n = addLinkedTasks({ id: ref.id, tasks: tasksArr, tk: tk });
      S.form = null; msg('بدأ التحدي ⚔️' + (n ? ' — واتضافت ' + n + ' مهمة لقايمة مهامك 📌' : '')); render(true);
    }).catch(function () { msg('تعذّر إنشاء التحدي ⚠️'); });
};

/* قبول/انسحاب/تحفيز/ربط */
window.spAccept = function (id) {
  var d = duelById(id); if (!d) return; var now = Date.now();
  db().collection('duels').doc(id).update('acc.' + S.uid, now, 'bs.' + S.uid, { f: totalFocusSec(), c: completedHistory.length, at: now }).then(function () {
    var n = addLinkedTasks(d); toast('⚔️ قبلت التحدي!' + (n ? ' واتضافت ' + n + ' مهمة لمهامك' : ''));
  }).catch(function () { msg('تعذّر القبول ⚠️'); });
};
window.spLeave = function (id) {
  if (!confirm('تنسحب من التحدي ده؟')) return;
  db().collection('duels').doc(id).update('members', FV().arrayRemove(S.uid)).catch(function () { msg('تعذّر الانسحاب ⚠️'); });
};
window.spNudge = function (id, u) {
  var d = duelById(id), last = d && d.nd && d.nd[u] && d.nd[u].at;
  if (last && Date.now() - last < NUDGE_GAP) { msg('استنى شوية قبل ما تحفّزه تاني 😄'); return; }
  db().collection('duels').doc(id).update('nd.' + u, { from: S.uid, at: Date.now() }).then(function () { toast('👊 اتبعتله تحفيز'); }).catch(function () { msg('تعذّر الإرسال ⚠️'); });
};
window.spLink = function (id) {
  var d = duelById(id); if (!d) return; var n = addLinkedTasks(d);
  toast(n ? '📌 اتضافت ' + n + ' مهمة لقايمة مهامك' : 'المهام موجودة عندك بالفعل');
  render(true);
};
window.spDelDuel = function (id) { if (confirm('تحذف التحدي للكل؟')) db().collection('duels').doc(id).delete().catch(function () { }); };

/* إثبات الإنجاز اليدوي + تأكيد/اعتراض الصديق */
function sheet(html) {
  css(); var s = $('spSheet');
  if (!s) { s = document.createElement('div'); s.id = 'spSheet'; s.className = 'sp-over'; s.onclick = function (e) { if (e.target === s) spSheetClose(); }; document.body.appendChild(s); }
  s.innerHTML = '<div class="sp-box">' + html + '</div>'; s.style.display = 'flex';
}
window.spSheetClose = function () { var s = $('spSheet'); if (s) s.style.display = 'none'; S.claim = null; };
window.spClaim = function (id, i) {
  var d = duelById(id); if (!d) return; S.claim = { id: id, i: i };
  sheet('<div style="font-weight:700;margin-bottom:6px;">🤝 إثبات الإنجاز</div><div class="sp-sm" style="opacity:1;margin-bottom:8px;">«' + esc(d.tasks[i]) + '»</div><textarea id="spNote" class="sp-in" rows="3" maxlength="160" placeholder="اكتب إيه اللي عملته بالظبط (مثلًا: حليت 20 سؤال فيزياء من ص 45)"></textarea><div class="sp-sm" style="margin:6px 0;">صاحبك هيشوف كلامك ويأكّد أو يعترض. لو محدش اعترض خلال 24 ساعة بتتأكد تلقائيًا. الإنجاز اللي بيتعارض عليه مابيتحسبش، ومصداقيتك بتظهر لأصحابك.</div><div style="display:flex;gap:6px;"><button class="btn" style="flex:1;" onclick="spSendClaim()">إرسال للتأكيد</button><button class="btn btn-secondary" style="flex:1;" onclick="spSheetClose()">إلغاء</button></div>');
  setTimeout(function () { var n = $('spNote'); if (n) n.focus(); }, 50);
};
window.spSendClaim = function () {
  var c = S.claim, n = $('spNote'); if (!c || !n) return;
  var note = n.value.trim(); if (note.length < 6) { n.style.borderColor = '#e74c3c'; return; }
  var last = parseInt(LS.getItem('sp_lastclaim')) || 0;
  if (Date.now() - last < COOLDOWN) { toast('براحة شوية 😄 استنى لحظات قبل ما تثبت مهمة تانية'); return; }
  var d = duelById(c.id); if (!d || Date.now() > d.endsAt) { spSheetClose(); return; }
  var prev = claimInfo(d, S.uid, c.i, Date.now()), r = prev.s === 'no' ? ((prev.c && prev.c.r) || 0) + 1 : 0;
  LS.setItem('sp_lastclaim', String(Date.now()));
  db().collection('duels').doc(c.id).update('cl.' + S.uid + '_' + c.i, { u: S.uid, i: c.i, s: 'p', n: note.slice(0, 160), r: r, at: FV().serverTimestamp() })
    .then(function () { toast('اتبعتت لصاحبك للتأكيد ⏳'); }).catch(function () { msg('تعذّر التسجيل ⚠️'); });
  spSheetClose();
};
window.spReview = function (id, key, ok) {
  if (key.indexOf(S.uid + '_') === 0) { msg('مينفعش تأكّد إنجاز نفسك 😄'); return; }
  db().collection('duels').doc(id).update('cl.' + key + '.s', ok ? 'ok' : 'no', 'cl.' + key + '.v', S.uid, 'cl.' + key + '.rt', Date.now())
    .then(function () { toast(ok ? '✔ اتأكّد' : '✖ اتسجّل اعتراضك'); }).catch(function () { msg('تعذّر التسجيل ⚠️'); });
};

/* ---------- مسح الـ QR بالكاميرا ---------- */
var CAM = { stream: null, timer: null, busy: false };
function loadJsQR() {
  if (typeof jsQR !== 'undefined') return Promise.resolve(true);
  try { if (typeof ensureJsQRLoaded === 'function') return ensureJsQRLoaded(); } catch (e) { }
  return new Promise(function (res) { var s = document.createElement('script'); s.src = 'lib/jsQR.min.js'; s.onload = function () { res(typeof jsQR !== 'undefined'); }; s.onerror = function () { res(false); }; document.head.appendChild(s); });
}
function scanEl() {
  var s = $('spScan'); if (s) return s;
  css(); s = document.createElement('div'); s.id = 'spScan'; s.className = 'sp-scan';
  s.innerHTML = '<div style="font-weight:700;">📷 وجّه الكاميرا على QR صاحبك</div><div style="position:relative;width:100%;max-width:520px;display:flex;justify-content:center;align-items:center;"><video id="spVid" autoplay playsinline muted></video><div class="sp-frame"></div></div><div id="spScanHint" style="font-size:.8rem;opacity:.85;min-height:1.2em;text-align:center;">بنقرأ الكود تلقائيًا...</div><div style="display:flex;gap:8px;"><label class="btn btn-secondary" style="cursor:pointer;margin:0;">🖼 من صورة<input type="file" accept="image/*" style="display:none;" onchange="spScanFile(this)"></label><button class="btn btn-secondary" onclick="spScanClose()">إلغاء</button></div><canvas id="spCv" style="display:none;"></canvas>';
  document.body.appendChild(s); return s;
}
function scanHint(t) { var h = $('spScanHint'); if (h) h.textContent = t; }
function gotText(t) {
  var c = parseCode(t);
  if (!c) { scanHint('ده مش كود صديق من التطبيق، جرّب تاني'); return false; }
  spScanClose(); S.tab = 'friends'; render(true); addByCode(c); return true;
}
window.spScan = function () {
  if (!S.code) { msg('ابدأ الخدمة الأول 🚀'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg('الكاميرا مش مدعومة هنا — اكتب الكود أو اختار صورة'); scanEl().style.display = 'flex'; scanHint('الكاميرا مش مدعومة — اختار صورة فيها الـ QR'); return; }
  if (window.AndroidNative && typeof AndroidNative.hasCameraPermission === 'function' && !AndroidNative.hasCameraPermission()) {
    window.onAndroidCameraPermissionResult = function (g) { toast(g ? 'تم منح إذن الكاميرا، دوس تاني على فتح الكاميرا 📷' : 'محتاجين إذن الكاميرا عشان تمسح الكود 📷⚠️'); };
    try { AndroidNative.requestCameraPermission(); } catch (e) { } return;
  }
  var el = scanEl(); el.style.display = 'flex'; scanHint('بنفتح الكاميرا...');
  loadJsQR().then(function (ok) {
    if (!ok && !('BarcodeDetector' in window)) { scanHint('مكتبة القراءة مش متحمّلة — اختار صورة أو اكتب الكود'); return; }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (st) {
      CAM.stream = st; var v = $('spVid'); v.srcObject = st; v.play().catch(function () { }); scanHint('بنقرأ الكود تلقائيًا...'); scanLoop();
    });
  }).catch(function () { scanHint('تعذّر الوصول للكاميرا — تحقق من الإذن، أو اختار صورة، أو اكتب الكود'); });
};
function scanLoop() {
  if (!CAM.stream) return;
  var v = $('spVid'), cv = $('spCv');
  if (v && cv && v.readyState >= 2 && v.videoWidth && !CAM.busy) {
    var sc = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc);
    var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(v, 0, 0, cv.width, cv.height);
    try {
      if (typeof jsQR !== 'undefined') { var im = cx.getImageData(0, 0, cv.width, cv.height), r = jsQR(im.data, im.width, im.height); if (r && r.data && gotText(r.data)) return; }
      else if ('BarcodeDetector' in window) {
        CAM.busy = true;
        new BarcodeDetector({ formats: ['qr_code'] }).detect(cv).then(function (rs) { CAM.busy = false; if (rs && rs[0] && gotText(rs[0].rawValue)) return; CAM.timer = setTimeout(scanLoop, 150); }).catch(function () { CAM.busy = false; CAM.timer = setTimeout(scanLoop, 300); });
        return;
      }
    } catch (e) { }
  }
  CAM.timer = setTimeout(scanLoop, 120);
}
window.spScanClose = function () {
  if (CAM.timer) clearTimeout(CAM.timer); CAM.timer = null; CAM.busy = false;
  if (CAM.stream) { try { CAM.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } CAM.stream = null; }
  var v = $('spVid'); if (v) { try { v.pause(); } catch (e) { } v.srcObject = null; }
  var s = $('spScan'); if (s) s.style.display = 'none';
};
window.spScanFile = function (inp) {
  var f = inp.files && inp.files[0]; if (!f) return; scanHint('بنقرأ الصورة...');
  loadJsQR().then(function (ok) {
    if (!ok) { scanHint('مكتبة القراءة مش متحمّلة'); return; }
    var img = new Image(); img.onload = function () {
      var found = '', sizes = [1200, 800, 500];
      for (var k = 0; k < sizes.length && !found; k++) {
        var sc = Math.min(1, sizes[k] / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height);
        var im = cx.getImageData(0, 0, cv.width, cv.height), r = jsQR(im.data, im.width, im.height, { inversionAttempts: 'attemptBoth' }); if (r && r.data) found = r.data;
      }
      try { URL.revokeObjectURL(img.src); } catch (e) { }
      if (found) gotText(found); else scanHint('مش لاقي QR واضح في الصورة، جرّب صورة تانية');
    };
    img.onerror = function () { scanHint('تعذّر فتح الصورة'); }; img.src = URL.createObjectURL(f);
  });
  inp.value = '';
};

setTimeout(function () {
  css(); ensureTabs();
  if (LS.getItem('sp_pending')) { spOpen(); }
  else if (LS.getItem('sp_on') === '1') init();
}, 2500);
})();
