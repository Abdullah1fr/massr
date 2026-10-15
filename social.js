(function () {
if (window.__spV2) return; window.__spV2 = 1;
var LS = localStorage, $ = function (i) { return document.getElementById(i); };
var BASE = 'https://abdullah1fr.github.io/massr/';
var DAY = 864e5, HOUR = 36e5, GRACE = 24 * HOUR, COOLDOWN = 45000, NUDGE_GAP = 3 * HOUR;
var S = { uid: null, name: '', code: '', friends: {}, fp: {}, duels: [], unsubs: [], tab: 'chats', seg: { comp: 'league', me: 'home', add: 'name' }, err: '', booting: false, form: null, qr: '', auto: {}, claim: null, dirty: false, reqs: {}, rFirst: true, res: null, qraw: '', fFirst: true, lastSeenW: 0 };
var KINDS = {
  app: { i: '📌', n: 'من تطبيقك — بتتوثّق لوحدها' },
  focus: { i: '⏱', n: 'دقائق تركيز — بتتوثّق لوحدها' },
  count: { i: '✅', n: 'عدد مهام — بتتوثّق لوحدها' },
  man: { i: '🤝', n: 'يدوي — بتأكيد صاحبك' }
};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ms(x) { if (x == null) return Date.now(); if (typeof x === 'number') return x; if (x.toMillis) return x.toMillis(); if (x.seconds) return x.seconds * 1000; return Date.now(); }
function msg(t) { if (t) snack(t); }
function toast(t) { if (UI.open) { snack(t); return; } try { if (typeof showToast === 'function') { showToast(t); return; } } catch (e) { } }
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
  sgDoneList().forEach(function (h) { if (h.date) { x = new Date(h.date); if (x >= ws && x < we) t++; } });
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
  S.booting = false; render(true); if (UI.open && S.code) snack(S.err);
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
  if (t.k === 'count') { if (!b) return null; cur = Math.max(0, (b.cd != null ? sgDoneList().length - b.cd : completedHistory.length - (b.c || 0))); return { cur: cur, goal: t.n, done: cur >= t.n }; }
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
      db().collection('duels').doc(d.id).update('bs.' + S.uid, { f: totalFocusSec(), c: completedHistory.length, cd: sgDoneList().length, at: now }).catch(function () { });
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
  S.unsubs.forEach(function (u) { try { u(); } catch (e) { } }); S.unsubs = []; try { sgInboxStop(); sgStopChat(); } catch (e) { }
  Object.keys(S.fp).forEach(function (k) { try { S.fp[k].u && S.fp[k].u(); } catch (e) { } }); S.fp = {}; S.friends = {}; S.duels = []; UI.duelsReady = false;
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
    UI.duelsReady = true; S.duels = sn.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    notices(); autoVerify(); push(false); render();
  }, fail));
  S.timer = setInterval(tick, 30000);
  try { sgInboxStart(); } catch (e) { }
}
var tn = 0;
function tick() { push(false); autoVerify(); if (++tn % 10 === 0) syncSent(); render(); }
try { document.addEventListener('visibilitychange', function () { if (!document.hidden && S.uid) { autoVerify(); push(false); } }); } catch (e) { }

function push(force) {
  if (!S.uid || !S.code || !db()) return;
  var m = mine(), lw = lastWeek(), cr = myCred(), h = LS.getItem('sp_hide') === '1', now = Date.now();
  var gp = (typeof sgProgress === 'function') ? sgProgress() : {xp:0,level:{level:1}}, gs = (typeof sgSeason === 'function') ? sgSeason() : {seasonTasks:0};
  var data = { name: S.name, nameLower: String(S.name || '').toLowerCase(), disc: LS.getItem('sp_nodisc') !== '1', week: m.week, pts: h ? null : m.pts, tasks: h ? null : m.t, focus: h ? null : m.f, streak: h ? null : (currentStreak || 0), gameXP: h ? null : gp.xp, gameLevel: h ? null : gp.level.level, gameBadges: h ? null : sgBadges().earned.length, seasonTasks: h ? null : gs.seasonTasks, hidden: h, lw: h ? null : lw, cr: cr, updatedAt: now };
  var sig = JSON.stringify([data.name, data.week, data.pts, data.tasks, data.focus, data.streak, data.gameXP, data.gameLevel, data.gameBadges, data.seasonTasks, data.hidden, lw.week, lw.pts, cr.ok, cr.no, data.disc]);
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
  if (p && S.code) { LS.removeItem('sp_pending'); openAdd('code'); addByCode(p); }
}


/* ================== الواجهة: صفحة كاملة (تنقّل سفلي + صفحات فرعية) ================== */
var NAV = [];   // الصفحات المفتوحة فوق الرئيسية: { t:'chat'|'add'|'requests'|'profile'|'pick'|'newduel'|'duel'|'settings', id? }
var UI = { open: false, key: '', keyView: null, depth: 0, hist: true, q: '', scroll: {}, drafts: {}, upl: [], snackT: null, stick: false, newBelow: 0, chatFirst: true, keepPos: false, emojiOn: false, attachOn: false, resUid: '', vvT: null };

/* ---------- أيقونات (SVG) ---------- */
var ICP = {
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  more: '<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  attach: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  kbd: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10"/>',
  camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  chat: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userplus: '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
  gear: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>', check: '<path d="M5 13l4 4L19 7"/>', check2: '<path d="M1 13l4 4L15 7M9 15l2 2L21 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', down: '<path d="M6 9l6 6 6-6"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v1M14 21h7M21 18v3"/>',
  swords: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 18l-2 2M3 21l2-2"/>'
};
function ic(n, sz) { sz = sz || 24; return '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICP[n] || '') + '</svg>'; }

/* ---------- أدوات صغيرة ---------- */
var AVC = ['#e57373', '#f06292', '#ba68c8', '#9575cd', '#7986cb', '#4fa3e0', '#26a69a', '#66bb6a', '#f0a030', '#a1887f'];
function avatar(name, id, sz) {
  var s = String(id || name || '?'), h = 0, i; for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  var ch = String(name || '?').trim().charAt(0) || '?';
  return '<span class="sx-av" style="width:' + (sz || 48) + 'px;height:' + (sz || 48) + 'px;font-size:' + Math.round((sz || 48) * .42) + 'px;background:' + AVC[h % AVC.length] + ';">' + esc(ch.toUpperCase()) + '</span>';
}
function two(n) { return n < 10 ? '0' + n : '' + n; }
function hhmm(t) { var d = new Date(t), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + two(m) + ' ' + (h < 12 ? 'ص' : 'م'); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
var MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'], WDAY = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayLabel(t) {
  var d = new Date(t), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (sameDay(d, n)) return 'اليوم'; if (sameDay(d, y)) return 'أمس';
  if (n - d < 6 * DAY) return WDAY[d.getDay()];
  return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
}
function listTime(t) { var d = new Date(t), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1); if (sameDay(d, n)) return hhmm(t); if (sameDay(d, y)) return 'أمس'; if (n - d < 6 * DAY) return WDAY[d.getDay()]; return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
function isOnline(p) { return !!(p && p.seen && Date.now() - p.seen < 7 * 60000); }
function lastSeen(p) {
  if (!p || !p.seen) return '';
  if (isOnline(p)) return 'متصل الآن';
  var d = new Date(p.seen), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (sameDay(d, n)) return 'آخر ظهور اليوم ' + hhmm(p.seen); if (sameDay(d, y)) return 'آخر ظهور أمس ' + hhmm(p.seen);
  return 'آخر ظهور ' + d.getDate() + '/' + (d.getMonth() + 1);
}
function linkify(t) { return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>'); }
function snack(t) {
  var s = $('spSnack'); if (!s || !t) return; s.textContent = t; s.classList.add('on');
  clearTimeout(UI.snackT); UI.snackT = setTimeout(function () { s.classList.remove('on'); }, 3200);
}
function curView() { return NAV.length ? NAV[NAV.length - 1] : { t: 'main' }; }
function badge(n) { return n ? '<i class="sx-bdg">' + (n > 99 ? '99+' : n) + '</i>' : ''; }

/* ---------- CSS ---------- */
function css() {
  if ($('spStyle')) return;
  var s = document.createElement('style'); s.id = 'spStyle';
  s.textContent = [
    /* عناصر قديمة بتستخدمها كروت التحديات */
    '.sp-card{background:var(--input-bg);border:1px solid var(--card-border);border-radius:14px;padding:12px;margin:8px 0;text-align:right}',
    '.sp-row{display:flex;justify-content:space-between;align-items:center;gap:8px}.sp-sm{font-size:.74rem;opacity:.8;line-height:1.5}',
    '.sp-bar{height:6px;border-radius:4px;background:var(--card-border);overflow:hidden;display:flex;margin-top:3px}.sp-bar i{display:block;height:6px}',
    '.sp-chip{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:999px;border:1px solid var(--card-border);margin:2px 0 2px 4px}',
    '.sp-ok{color:#2ecc71}.sp-bad{color:#e74c3c}.sp-wait{color:#f39c12}',
    '.sp-mini{padding:5px 11px!important;font-size:.72rem!important}',
    '.sp-in{width:100%;box-sizing:border-box;border-radius:12px;padding:11px 12px;background:var(--input-bg);color:var(--text-primary,inherit);border:1px solid var(--card-border);font-family:inherit;font-size:.88rem;outline:none}.sp-in:focus{border-color:var(--accent)}',
    '.sp-task{border-top:1px dashed var(--card-border);margin-top:8px;padding-top:6px;font-size:.84rem}',
    '.sp-qr{background:#fff;padding:10px;border-radius:14px;display:inline-block;line-height:0}.sp-qr img,.sp-qr canvas{display:block}',
    '.sp-over{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2147482000;display:none;align-items:center;justify-content:center;padding:16px}',
    '.sp-box{background:var(--card-bg);color:var(--text-primary);border:1px solid var(--accent);border-radius:16px;padding:16px;width:100%;max-width:420px;max-height:85vh;overflow:auto;text-align:right}',
    '.sp-scan{position:fixed;inset:0;z-index:2147483000;background:#000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;padding:12px;box-sizing:border-box}',
    '.sp-scan video{width:100%;max-width:520px;max-height:62vh;object-fit:cover;border-radius:14px}',
    '.sp-frame{position:absolute;width:min(62vw,300px);height:min(62vw,300px);border:3px solid var(--accent,#ffb020);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none}',

    /* الإطار العام للصفحة */
    '#spPage{--wa-bg:#0b141a;--wa-out:#005c4b;--wa-in:#202c33;--wa-text:#e9edef;--wa-sub:#8696a0;--wa-chip:#182229;--wa-green:#00a884;--wa-tick:#53bdeb;--wa-dot:rgba(255,255,255,.035);--sx-sep:rgba(128,140,160,.18);',
    'position:fixed;left:0;right:0;top:0;bottom:0;width:100%;max-width:760px;margin:0 auto;z-index:2147481000;display:none;flex-direction:column;background:var(--bg-main);color:var(--text-primary);font-family:inherit;direction:rtl;text-align:right;overflow:hidden;box-shadow:0 0 0 1px var(--card-border);-webkit-tap-highlight-color:transparent}',
    'body[data-theme="light"] #spPage{--wa-bg:#efeae2;--wa-out:#d9fdd3;--wa-in:#ffffff;--wa-text:#111b21;--wa-sub:#667781;--wa-chip:#ffffff;--wa-dot:rgba(0,0,0,.045)}',
    '#spPage *{box-sizing:border-box}#spPage button{font-family:inherit}',
    '.sx-head{display:flex;align-items:center;gap:4px;padding:calc(8px + env(safe-area-inset-top,0px)) 6px 8px;background:var(--card-bg);border-bottom:1px solid var(--card-border);min-height:58px;flex:none}',
    '.sx-title{flex:1;min-width:0;font-weight:800;font-size:1.18rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px}',
    '.sx-ib{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:transparent;border:0;color:var(--text-primary);cursor:pointer;flex:none;position:relative}.sx-ib:active{background:var(--sx-sep)}',
    '.sx-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;position:relative}',
    '.sx-pad{padding:12px 14px 28px}',
    '.sx-foot{flex:none}',

    /* صفوف القوائم */
    '.sx-avw{position:relative;flex:none;display:inline-block;line-height:0}.sx-avw .dot{position:absolute;bottom:1px;left:1px;width:13px;height:13px;border-radius:50%;background:#2ecc71;border:2px solid var(--bg-main)}',
    '.sx-av{border-radius:50%;display:inline-grid;place-items:center;color:#fff;font-weight:800;flex:none;user-select:none}',
    '.sx-r{display:flex;align-items:center;gap:12px;padding:0 14px;cursor:pointer;min-height:70px}.sx-r:active{background:var(--sx-sep)}',
    '.sx-rb{flex:1;min-width:0;padding:11px 0;border-bottom:1px solid var(--sx-sep);align-self:stretch;display:flex;flex-direction:column;justify-content:center;gap:3px}.sx-r:last-child .sx-rb{border-bottom:0}',
    '.sx-rt{display:flex;align-items:center;justify-content:space-between;gap:8px}.sx-rn{font-weight:700;font-size:.98rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sx-rm{font-size:.7rem;color:var(--text-secondary);white-space:nowrap}.sx-rm.hot{color:var(--wa-green);font-weight:700}',
    '.sx-rs{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.84rem;color:var(--text-secondary)}',
    '.sx-rs span.tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}',
    '.sx-bdg{font-style:normal;min-width:20px;height:20px;border-radius:99px;background:var(--wa-green);color:#fff;font-size:.7rem;font-weight:800;display:inline-grid;place-items:center;padding:0 6px;flex:none}',
    '.sx-acts{display:flex;gap:6px;flex:none}.sx-rb2{width:38px;height:38px;border-radius:50%;border:1px solid var(--card-border);background:var(--input-bg);color:var(--text-primary);display:grid;place-items:center;cursor:pointer;font-size:1rem}.sx-rb2:active{background:var(--sx-sep)}',
    '.sx-sec{padding:14px 16px 6px;font-size:.78rem;font-weight:800;color:var(--text-secondary);letter-spacing:.02em}',
    '.sx-act{display:flex;align-items:center;gap:14px;padding:12px 14px;cursor:pointer}.sx-act:active{background:var(--sx-sep)}.sx-act .ico{width:48px;height:48px;border-radius:50%;background:var(--wa-green);color:#fff;display:grid;place-items:center;flex:none}.sx-act b{flex:1;font-size:.96rem}.sx-act .ico.am{background:var(--accent);color:var(--btn-text)}',
    '.sx-empty{text-align:center;padding:48px 24px;color:var(--text-secondary);font-size:.9rem;line-height:1.8}.sx-empty .big{font-size:3rem;margin-bottom:6px}.sx-empty .btn{margin:14px auto 0;max-width:260px}',
    '.sx-search{margin:10px 12px 4px;display:flex;align-items:center;gap:8px;background:var(--input-bg);border:1px solid var(--card-border);border-radius:99px;padding:0 14px;color:var(--text-secondary)}.sx-search input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:var(--text-primary);font:inherit;font-size:.9rem;padding:11px 0}',
    '.sx-fab{position:absolute;left:18px;bottom:18px;width:56px;height:56px;border-radius:18px;background:var(--wa-green);color:#fff;border:0;display:grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.4);cursor:pointer;z-index:3}.sx-fab:active{transform:scale(.95)}',
    '.sx-banner{display:flex;align-items:center;gap:12px;margin:8px 12px;padding:12px 14px;border-radius:14px;background:var(--accent-glow);border:1px solid var(--accent);cursor:pointer}.sx-banner b{flex:1;font-size:.9rem}',

    /* التنقل السفلي */
    '.sx-nav{display:flex;background:var(--card-bg);border-top:1px solid var(--card-border);padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px))}',
    '.sx-ni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:0;color:var(--text-secondary);font-size:.7rem;font-weight:700;cursor:pointer;padding:2px 0}',
    '.sx-ni .pill{position:relative;width:60px;height:32px;border-radius:16px;display:grid;place-items:center;transition:background .18s}.sx-ni.on{color:var(--text-primary)}.sx-ni.on .pill{background:var(--accent-glow);color:var(--accent)}',
    '.sx-ni .sx-bdg{position:absolute;top:-6px;left:2px;min-width:18px;height:18px;font-size:.64rem;background:#e74c3c}',

    /* مفاتيح التبويب الفرعية */
    '.sx-seg{display:flex;gap:8px;padding:10px 12px;overflow-x:auto;position:sticky;top:0;z-index:2;background:var(--bg-main);scrollbar-width:none}.sx-seg::-webkit-scrollbar{display:none}',
    '.sx-chipb{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:99px;border:1px solid var(--card-border);background:transparent;color:var(--text-secondary);font-size:.82rem;font-weight:700;white-space:nowrap;cursor:pointer;flex:none}.sx-chipb.on{background:var(--accent-glow);color:var(--accent);border-color:var(--accent)}',

    /* نماذج وبطاقات */
    '.sx-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:14px;margin:10px 0}',
    '.sx-lbl{font-size:.8rem;font-weight:700;margin:0 2px 6px;color:var(--text-secondary);display:block}',
    '.sx-hint{font-size:.76rem;color:var(--text-secondary);line-height:1.7;margin:8px 2px}',
    '.sx-btnrow{display:flex;gap:8px;margin-top:10px}.sx-btnrow .btn{flex:1}',
    '.sx-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 4px;border-bottom:1px solid var(--sx-sep);cursor:pointer}.sx-sw:last-child{border-bottom:0}.sx-sw b{display:block;font-size:.92rem}.sx-sw small{display:block;font-size:.74rem;color:var(--text-secondary);margin-top:2px}',
    '.sx-tg{width:46px;height:26px;border-radius:99px;background:var(--sx-sep);position:relative;flex:none;transition:background .2s}.sx-tg::after{content:"";position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.4)}.sx-tg.on{background:var(--wa-green)}.sx-tg.on::after{transform:translateX(-20px)}',
    '.sx-prof{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 16px 10px;text-align:center}.sx-prof h2{margin:6px 0 0;font-size:1.25rem}',
    '.sx-qrbox{display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0}.sx-code{font-family:monospace;font-size:1.9rem;letter-spacing:6px;color:var(--accent);font-weight:800}',
    '.sx-duel{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:8px 12px;border-radius:16px;background:var(--card-bg);border:1px solid var(--card-border);cursor:pointer}.sx-duel:active{background:var(--sx-sep)}.sx-duel .ico{width:46px;height:46px;border-radius:14px;background:var(--accent-glow);display:grid;place-items:center;font-size:1.3rem;flex:none}.sx-duel .m{flex:1;min-width:0}.sx-duel .m b{display:block;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sx-duel .m small{display:block;font-size:.76rem;color:var(--text-secondary);margin-top:2px}',
    '.sx-lrow{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:8px 12px;border-radius:16px;background:var(--card-bg);border:1px solid var(--card-border)}.sx-lrow.me{border-color:var(--accent);background:var(--accent-glow)}.sx-lrow .rk{width:30px;text-align:center;font-size:1.25rem;font-weight:800;flex:none}.sx-lrow .m{flex:1;min-width:0}.sx-lrow .m b{display:block;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sx-lrow .m small{display:block;font-size:.72rem;color:var(--text-secondary);margin-top:2px}.sx-lrow .pt{font-weight:800;text-align:left;flex:none}.sx-lrow .pt small{display:block;font-size:.66rem;color:var(--text-secondary);font-weight:600}',
    '.sx-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sx-stat{background:var(--input-bg);border:1px solid var(--card-border);border-radius:14px;padding:12px;text-align:center}.sx-stat b{display:block;font-size:1.2rem}.sx-stat small{font-size:.72rem;color:var(--text-secondary)}',
    '.sx-toprank{margin:8px 12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,var(--accent-glow),transparent);border:1px solid var(--card-border)}.sx-toprank b{font-size:.95rem}',

    /* محتوى الألعاب (الرئيسية/المهمات/الأوسمة/التحليلات) */
    '.sx-games{padding:2px 12px 24px}',
    '.sg-hero{padding:16px;border-radius:18px;margin:6px 0 12px;background:radial-gradient(circle at 90% 0%,var(--accent-glow),transparent 55%),var(--card-bg);border:1px solid var(--card-border);text-align:right}.sg-eyebrow{font-size:.7rem;opacity:.7;letter-spacing:.08em}.sg-big{font-size:1.2rem;font-weight:900;margin:5px 0}.sg-sub,.sg-muted{font-size:.77rem;opacity:.75;line-height:1.6}',
    '.sg-level{display:flex;gap:10px;align-items:center;margin-top:14px}.sg-level-icon{width:50px;height:50px;display:grid;place-items:center;border-radius:15px;background:var(--accent-glow);font-size:1.5rem}.sg-level-info{flex:1;min-width:0}.sg-level-info small{font-size:.7rem;opacity:.7}.sg-row{display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.sg-progress{height:8px;border-radius:99px;background:var(--card-border);overflow:hidden;margin:6px 0}.sg-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent-dark),var(--accent));transition:width .3s}',
    '.sg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.sg-grid-three{grid-template-columns:repeat(3,minmax(0,1fr));text-align:center}.sg-stat{padding:12px;border:1px solid var(--card-border);background:var(--input-bg);border-radius:14px;display:flex;flex-direction:column;gap:3px}.sg-stat span{font-size:.74rem;opacity:.8}.sg-stat b{font-size:1.25rem}.sg-stat small,.sg-grid-three small{font-size:.68rem;opacity:.7}',
    '.sg-section-title{font-weight:850;margin:16px 2px 8px;display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.sg-quest{display:flex;align-items:center;gap:10px;border:1px solid var(--card-border);background:var(--card-bg);border-radius:14px;padding:11px;margin:8px 0}.sg-quest-emoji{font-size:1.5rem}.sg-quest-info{flex:1;min-width:0}.sg-quest-info b,.sg-quest-info small{display:block}.sg-quest-info small{font-size:.7rem;opacity:.72;margin-top:2px}',
    '.sg-claim{border:0;border-radius:10px;padding:9px 12px;background:var(--accent);color:var(--btn-text);font:inherit;font-size:.74rem;font-weight:800;white-space:nowrap;cursor:pointer}.sg-claim:disabled{opacity:.4}',
    '.sg-season{border:1px solid var(--sg-season);border-right:4px solid var(--sg-season);border-radius:15px;padding:13px;margin:12px 0;background:rgba(128,128,128,.08);background:color-mix(in srgb,var(--sg-season) 9%,transparent)}.sg-season p{font-size:.78rem;line-height:1.6}.sg-chip{border:1px solid var(--sg-season);padding:3px 8px;border-radius:99px;font-size:.68rem}',
    '.sg-badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}.sg-badge{display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;padding:12px 6px;border-radius:14px;border:1px solid var(--card-border);background:var(--card-bg)}.sg-badge span{font-size:1.6rem}.sg-badge b{font-size:.78rem}.sg-badge small,.sg-badge i{font-size:.68rem;opacity:.72}.sg-badge-earned{border-color:var(--accent)}.sg-badge-locked{opacity:.5;filter:grayscale(1)}',
    '.sg-chart{display:flex;gap:8px;align-items:stretch;height:145px;margin-top:12px}.sg-chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.68rem}.sg-chart-track{height:100px;width:100%;background:var(--card-border);border-radius:7px;display:flex;align-items:flex-end;overflow:hidden}.sg-chart-track i{display:block;width:100%;background:linear-gradient(0deg,var(--accent-dark),var(--accent));border-radius:7px 7px 0 0}',
    '@media(min-width:700px){.sg-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.sg-badges{grid-template-columns:repeat(4,minmax(0,1fr))}}',

    /* الشات (شكل واتساب) */
    '.sx-chatbody{display:flex;flex-direction:column;overflow:hidden;background-color:var(--wa-bg);background-image:radial-gradient(var(--wa-dot) 1.4px,transparent 1.6px),radial-gradient(var(--wa-dot) 1.2px,transparent 1.4px);background-size:34px 34px,34px 34px;background-position:0 0,17px 17px}',
    '.sx-hdr-chat{display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;padding:0 4px}.sx-hdr-chat .nm{font-weight:800;font-size:1.02rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sx-hdr-chat .st{font-size:.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sx-hdr-chat .st.on{color:var(--wa-green)}',
    '.sx-msgs{flex:1;min-height:0;overflow-y:auto;padding:8px 10px 10px;display:flex;flex-direction:column;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '.sx-day{align-self:center;background:var(--wa-chip);color:var(--wa-sub);font-size:.72rem;padding:5px 12px;border-radius:8px;margin:10px 0 8px;box-shadow:0 1px 1px rgba(0,0,0,.18)}',
    '.sx-sys{align-self:center;background:var(--wa-chip);color:var(--wa-sub);font-size:.74rem;padding:7px 12px;border-radius:10px;margin:8px 18px;text-align:center;line-height:1.6;box-shadow:0 1px 1px rgba(0,0,0,.18)}',
    '.sx-more{align-self:center;margin:6px 0 10px;background:var(--wa-chip);color:var(--wa-green);border:0;border-radius:99px;padding:7px 16px;font-size:.78rem;font-weight:700;cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.18)}',
    '.sx-b{position:relative;max-width:84%;min-width:62px;margin:2px 0;padding:6px 9px 5px;border-radius:9px;font-size:.94rem;line-height:1.5;color:var(--wa-text);box-shadow:0 1px .5px rgba(11,20,26,.25);overflow-wrap:anywhere;word-break:break-word;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    '.sx-b::after{content:"";display:block;clear:both}',
    '.sx-b.mine{align-self:flex-end;background:var(--wa-out)}.sx-b.in{align-self:flex-start;background:var(--wa-in)}',
    '.sx-b.tail{margin-top:8px}.sx-b.mine.tail{border-top-left-radius:0}.sx-b.in.tail{border-top-right-radius:0}',
    '.sx-b.mine.tail::before{content:"";position:absolute;top:0;left:-8px;width:9px;height:13px;background:var(--wa-out);clip-path:polygon(100% 0,0 0,100% 100%)}',
    '.sx-b.in.tail::before{content:"";position:absolute;top:0;right:-8px;width:9px;height:13px;background:var(--wa-in);clip-path:polygon(0 0,100% 0,0 100%)}',
    '.sx-b a{color:var(--wa-tick);text-decoration:underline}',
    '.sx-m{float:left;margin:7px 10px 0 0;font-size:.67rem;color:var(--wa-sub);display:inline-flex;align-items:center;gap:3px;line-height:1;position:relative;top:3px;white-space:nowrap}.sx-m svg{width:15px;height:15px}.sx-m .pend{width:12px;height:12px}',
    '.sx-b.mine .sx-m{color:rgba(233,237,239,.65)}body[data-theme="light"] .sx-b.mine .sx-m{color:#667781}',
    '.sx-m .tk{color:var(--wa-sub);display:inline-flex}',
    '.sx-b.img{padding:3px}.sx-b.img img{display:block;max-width:100%;width:min(260px,64vw);max-height:300px;object-fit:cover;border-radius:7px;cursor:pointer;background:rgba(128,128,128,.2)}',
    '.sx-b.img .sx-m{position:absolute;bottom:7px;left:9px;float:none;margin:0;top:auto;color:#fff!important;background:rgba(0,0,0,.42);padding:3px 7px;border-radius:99px}',
    '.sx-fil{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.14);border-radius:8px;padding:9px;min-width:200px;color:inherit;text-decoration:none!important}.sx-fil .fi{width:40px;height:40px;border-radius:8px;background:#e06b6b;color:#fff;display:grid;place-items:center;flex:none}.sx-fil b{display:block;font-size:.85rem;font-weight:700;color:var(--wa-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}.sx-fil small{display:block;font-size:.7rem;color:var(--wa-sub)}',
    '.sx-down{position:absolute;left:14px;bottom:76px;width:42px;height:42px;border-radius:50%;background:var(--wa-in);color:var(--wa-sub);border:0;display:none;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;z-index:4}.sx-down.on{display:grid}.sx-down .sx-bdg{position:absolute;top:-8px;left:-2px}',
    '.sx-comp{display:flex;align-items:flex-end;gap:6px;padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));background:transparent}',
    '.sx-pill{flex:1;min-width:0;display:flex;align-items:flex-end;background:var(--wa-in);border-radius:24px;padding:2px 4px;color:var(--wa-text);box-shadow:0 1px 1px rgba(0,0,0,.2)}',
    '.sx-pill .sx-ib{color:var(--wa-sub);width:40px;height:44px;border-radius:50%}',
    '.sx-pill textarea{flex:1;min-width:0;background:transparent;border:0;outline:0;resize:none;max-height:124px;height:44px;font:inherit;font-size:.96rem;padding:11px 4px;color:inherit;line-height:1.4;overflow-y:auto}.sx-pill textarea::placeholder{color:var(--wa-sub)}',
    '.sx-send{width:48px;height:48px;border-radius:50%;background:var(--wa-green);color:#fff;border:0;display:grid;place-items:center;flex:none;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:opacity .15s,transform .1s}.sx-send svg{transform:scaleX(-1)}.sx-send:active{transform:scale(.93)}.sx-send.idle{opacity:.55}',
    '.sx-emoji{display:none;height:250px;overflow-y:auto;background:var(--card-bg);border-top:1px solid var(--card-border);padding:8px;grid-template-columns:repeat(8,1fr);gap:2px}.sx-emoji.on{display:grid}.sx-emoji button{background:transparent;border:0;font-size:1.55rem;padding:5px 0;border-radius:8px;cursor:pointer}.sx-emoji button:active{background:var(--sx-sep)}',
    '.sx-attach{position:absolute;bottom:68px;left:10px;right:10px;background:var(--wa-in);border-radius:20px;padding:18px 12px;display:none;grid-template-columns:repeat(3,1fr);gap:8px;box-shadow:0 8px 28px rgba(0,0,0,.45);z-index:6}.sx-attach.on{display:grid}',
    '.sx-attach label{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:.74rem;color:var(--wa-text);cursor:pointer}.sx-attach .ci{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;color:#fff}',

    /* قوائم الأفعال + العارض + التنبيه */
    '.sx-ov{position:fixed;inset:0;z-index:2147482400;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center}.sx-ov.on{display:flex}',
    '.sx-sheet{width:100%;max-width:560px;background:var(--card-bg);color:var(--text-primary);border-radius:20px 20px 0 0;padding:8px 0 calc(10px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.4);direction:rtl}',
    '.sx-sheet .tt{padding:10px 18px 6px;font-size:.78rem;color:var(--text-secondary);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sx-sheet button{display:flex;align-items:center;gap:14px;width:100%;background:none;border:0;color:inherit;padding:14px 20px;font-size:.96rem;font-weight:600;cursor:pointer;text-align:right}.sx-sheet button:active{background:var(--sx-sep)}.sx-sheet button.dg{color:#ff6b6b}',
    '.sx-viewer{position:fixed;inset:0;z-index:2147482600;background:rgba(0,0,0,.94);display:none;align-items:center;justify-content:center}.sx-viewer.on{display:flex}.sx-viewer img{max-width:100%;max-height:100%;object-fit:contain}.sx-viewer .x{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:12px;color:#fff;background:rgba(255,255,255,.16);border:0;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer}',
    '.sx-snack{position:absolute;left:50%;bottom:92px;transform:translate(-50%,20px);max-width:88%;background:#222b31;color:#fff;padding:11px 18px;border-radius:12px;font-size:.84rem;line-height:1.5;opacity:0;pointer-events:none;transition:all .22s;z-index:30;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.45)}.sx-snack.on{opacity:1;transform:translate(-50%,0)}',
    '.sx-onb{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 22px;gap:12px}.sx-onb .logo{width:96px;height:96px;border-radius:28px;background:var(--accent-glow);display:grid;place-items:center;font-size:3rem}.sx-onb h2{margin:6px 0 0;font-size:1.3rem}.sx-onb p{margin:0;color:var(--text-secondary);font-size:.88rem;line-height:1.8;max-width:340px}.sx-onb .sp-in{text-align:center;max-width:320px}.sx-onb .btn{width:100%;max-width:320px}',
    '.sx-day,.sx-sys{-webkit-user-select:none;user-select:none}'
  ].join('');
  document.head.appendChild(s);
}


function card(inner) { return '<div class="sp-card">' + inner + '</div>'; }
function presence(p) { return (p && p.seen && Date.now() - p.seen < 7 * 60000) ? '<span class="sp-ok" title="نشط الآن">●</span> ' : ''; }
function credTag(p) { var c = credOf(p); return c == null ? '' : '<span class="sp-chip ' + (c >= 80 ? 'sp-ok' : c >= 50 ? 'sp-wait' : 'sp-bad') + '">✔ مصداقية ' + c + '%</span>'; }

function sentMap() { try { return JSON.parse(LS.getItem('sp_sent') || '{}'); } catch (e) { return {}; } }

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

/* ================== الصفحات والتنقّل ================== */
function ensurePage() {
  var p = $('spPage'); if (p) return p;
  css(); p = document.createElement('div'); p.id = 'spPage'; p.setAttribute('dir', 'rtl');
  p.innerHTML = '<div class="sx-head" id="sxHead"></div><div class="sx-body" id="sxBody"></div><div class="sx-foot" id="sxFoot"></div><div class="sx-snack" id="spSnack"></div>';
  document.body.appendChild(p);
  try { if (window.visualViewport) { window.visualViewport.addEventListener('resize', vvFit); window.visualViewport.addEventListener('scroll', vvFit); } } catch (e) { }
  return p;
}
function vvFit() {
  var p = $('spPage'); if (!p || !UI.open) return;
  try { var vv = window.visualViewport; if (vv) { p.style.height = vv.height + 'px'; p.style.bottom = 'auto'; p.style.top = vv.offsetTop + 'px'; } } catch (e) { }
  var b = $('sxMsgs'); if (b && curView().t === 'chat') { clearTimeout(UI.vvT); UI.vvT = setTimeout(function () { var bb = $('sxMsgs'); if (bb && UI.stickKb) bb.scrollTop = bb.scrollHeight; }, 60); }
}
function setHead(h) { var e = $('sxHead'); if (e) e.innerHTML = h; }
function setBody(h, cls) { var e = $('sxBody'); if (e) { e.className = 'sx-body' + (cls ? ' ' + cls : ''); e.innerHTML = h; } }
function setFoot(h) { var e = $('sxFoot'); if (e) e.innerHTML = h; }
function hb(title, right) { return '<button class="sx-ib" onclick="spBack()" aria-label="رجوع">' + ic('back') + '</button><div class="sx-title">' + esc(title) + '</div>' + (right || ''); }
function ibtn(icon, fn, label) { return '<button class="sx-ib" onclick="' + fn + '" aria-label="' + esc(label || '') + '">' + ic(icon, 23) + '</button>'; }

function navPush(v) { NAV.push(v); try { history.pushState({ sx: NAV.length }, ''); } catch (e) { UI.hist = false; } render(true); }
function navReplace(v) { NAV[NAV.length - 1] = v; try { history.replaceState({ sx: NAV.length }, ''); } catch (e) { } render(true); }
window.spBack = function () {
  if (!NAV.length) { spClose(); return; }
  if (UI.hist) { var len = NAV.length; try { history.back(); } catch (e) { NAV.pop(); render(true); return; } setTimeout(function () { if (UI.open && NAV.length === len) { NAV.pop(); render(true); } }, 400); }
  else { NAV.pop(); render(true); }
};
function goMain(tab, seg) {
  S.tab = tab; if (seg) S.seg[tab] = seg;
  if (!NAV.length) { render(true); return; }
  if (UI.hist) { var len = NAV.length; try { history.go(-len); } catch (e) { } setTimeout(function () { if (UI.open && NAV.length) { NAV = []; render(true); } }, 400); }
  else { NAV = []; render(true); }
}
window.addEventListener('popstate', function (e) {
  if (!UI.open) return; var st = e.state, k = (st && typeof st.sx === 'number') ? st.sx : -1; UI.closing = false;
  if (k < 0) { hidePage(); return; }
  if (NAV.length > k) NAV.length = k; render(true);
});
try {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !UI.open) return;
    var vw = $('sxViewer'), ac = $('sxAct');
    if (vw && vw.classList.contains('on')) { vw.classList.remove('on'); return; }
    if (ac && ac.classList.contains('on')) { actClose(); return; }
    spBack();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && UI.open) { chatMarkRead(); render(); } });
} catch (e) { }

function hidePage() {
  var p = $('spPage'); try { leaveView(UI.keyView); } catch (e) { }
  UI.open = false; UI.key = ''; UI.keyView = null; NAV = []; UI.closing = false;
  if (p) p.style.display = 'none';
  try { spScanClose(); } catch (e) { } try { sgStopChat(); } catch (e) { } try { actClose(); } catch (e) { }
  var vw = $('sxViewer'); if (vw) vw.classList.remove('on');
}
window.spOpen = function () {
  if (UI.open) return;
  css(); var p = ensurePage(); UI.open = true; NAV = []; UI.key = ''; UI.keyView = null; S.dirty = false;
  p.style.display = 'flex'; try { history.pushState({ sx: 0 }, ''); UI.hist = true; } catch (e) { UI.hist = false; }
  vvFit(); msg('');
  render(true);
  if (LS.getItem('sp_on') === '1' && !S.code) init(); else if (S.code) { autoVerify(); consumePending(); syncSent(); }
};
window.spClose = function () {
  if (!UI.open) return;
  if (UI.hist) { UI.closing = true; try { history.go(-(NAV.length + 1)); } catch (e) { UI.closing = false; hidePage(); return; } setTimeout(function () { if (UI.open && UI.closing) hidePage(); }, 500); }
  else hidePage();
};
window.spMainTab = function (t) { if (S.tab === t && !NAV.length) { var b = $('sxBody'); if (b) b.scrollTop = 0; return; } S.tab = t; render(true); };
window.spSeg = function (g, v) { S.seg[g] = v; var b = $('sxBody'); UI.scroll[UI.key] = 0; render(true); if (b) b.scrollTop = 0; };
/* توافق مع النداءات القديمة */
window.spTab = function (t) {
  var map = { rank: ['comp', 'league'], league: ['comp', 'league'], duels: ['comp', 'duels'], feed: ['comp', 'feed'], friends: ['friends'], chat: ['chats'], chats: ['chats'], comp: ['comp'], me: ['me'], home: ['me', 'home'], quests: ['me', 'quests'], badges: ['me', 'badges'], analytics: ['me', 'analytics'] };
  var m = map[t] || ['chats']; goMain(m[0], m[1]);
};
function openAdd(seg) { S.seg.add = seg || 'name'; if (curView().t === 'add') { render(true); return; } navPush({ t: 'add' }); }
window.spAddPage = function (seg) { openAdd(seg); };
window.spRequests = function () { navPush({ t: 'requests' }); };
window.spSettings = function () { navPush({ t: 'settings' }); };
window.spPickChat = function () { navPush({ t: 'pick' }); };
window.spProfile = function (id) { id = sgSafeId(id); if (!id) return; navPush({ t: 'profile', id: id }); };
window.spChat = function (id) {
  id = sgSafeId(id); if (!id || !S.friends[id]) return; var top = curView();
  if (top.t === 'chat' && top.id === id) return;
  if (top.t === 'profile' && NAV.length >= 2 && NAV[NAV.length - 2].t === 'chat' && NAV[NAV.length - 2].id === id) { spBack(); return; }
  if (top.t === 'pick') { navReplace({ t: 'chat', id: id }); return; }
  navPush({ t: 'chat', id: id });
};
window.spDuel = function (id) { navPush({ t: 'duel', id: id }); };
window.spNewDuel = function () { S.form = newForm(); navPush({ t: 'newduel' }); };

/* ---------- قوائم أفعال سفلية + عارض صور ---------- */
function actions(title, items) {
  var o = $('sxAct'); if (!o) { o = document.createElement('div'); o.id = 'sxAct'; o.className = 'sx-ov'; o.onclick = function (e) { if (e.target === o) actClose(); }; document.body.appendChild(o); }
  UI.acts = items;
  o.innerHTML = '<div class="sx-sheet">' + (title ? '<div class="tt">' + esc(title) + '</div>' : '') + items.map(function (it, i) { return '<button class="' + (it.danger ? 'dg' : '') + '" onclick="spAct(' + i + ')">' + (it.ic ? ic(it.ic, 22) : '') + '<span>' + esc(it.t) + '</span></button>'; }).join('') + '</div>';
  o.classList.add('on');
}
function actClose() { var o = $('sxAct'); if (o) o.classList.remove('on'); }
window.spAct = function (i) { var it = (UI.acts || [])[i]; actClose(); if (it && it.f) it.f(); };
window.spView = function (src) {
  if (!src) return; var v = $('sxViewer');
  if (!v) { v = document.createElement('div'); v.id = 'sxViewer'; v.className = 'sx-viewer'; v.onclick = function () { v.classList.remove('on'); }; document.body.appendChild(v); }
  v.innerHTML = '<button class="x" aria-label="إغلاق">' + ic('close', 22) + '</button><img alt="صورة" src="' + esc(src) + '">'; v.classList.add('on');
};
function copyText(t) { try { navigator.clipboard.writeText(t).then(function () { snack('اتنسخ ✅'); }, function () { snack(t); }); } catch (e) { snack(t); } }

/* ---------- التنقّل السفلي والعدّادات ---------- */
var TABS = [['chats', 'chat', 'الدردشات'], ['friends', 'users', 'الأصدقاء'], ['comp', 'trophy', 'المنافسة'], ['me', 'user', 'حسابي']];
function unreadChats() { var n = 0; Object.keys(S.friends).forEach(function (id) { if ((SG.unread[sgChatId(id)] || 0) > 0) n++; }); return n; }
function questsReady() { try { return sgQuests().filter(function (q) { return q.ready && !q.claimed; }).length; } catch (e) { return 0; } }
function tabCount(t) { try { if (!S.code) return 0; if (t === 'chats') return unreadChats(); if (t === 'friends') return Object.keys(S.reqs).length; if (t === 'comp') return reviewsToDo() + invitesCount(); if (t === 'me') return questsReady(); } catch (e) { } return 0; }
function refreshBadges() {
  var el = $('moreSocialBadge'); if (!el) return; var n = 0;
  try { if (S.code) n = Object.keys(S.reqs).length + reviewsToDo() + invitesCount() + unreadChats(); } catch (e) { }
  el.textContent = n > 99 ? '99+' : String(n); el.style.display = n ? 'grid' : 'none';
}
function navHtml() {
  return '<div class="sx-nav">' + TABS.map(function (t) { var n = tabCount(t[0]); return '<button class="sx-ni ' + (S.tab === t[0] ? 'on' : '') + '" onclick="spMainTab(\'' + t[0] + '\')"><span class="pill">' + ic(t[1], 24) + badge(n) + '</span>' + t[2] + '</button>'; }).join('') + '</div>';
}
function avWrap(name, id, sz, p) { return '<span class="sx-avw">' + avatar(name, id, sz) + (isOnline(p) ? '<i class="dot"></i>' : '') + '</span>'; }
function segBar(group, items) {
  return '<div class="sx-seg">' + items.map(function (it) { return '<button class="sx-chipb ' + (S.seg[group] === it[0] ? 'on' : '') + '" onclick="spSeg(\'' + group + '\',\'' + it[0] + '\')">' + it[1] + (it[2] ? badge(it[2]) : '') + '</button>'; }).join('') + '</div>';
}
function emptyBox(big, text, btn) { return '<div class="sx-empty"><div class="big">' + big + '</div>' + text + (btn || '') + '</div>'; }

/* ---------- الدردشات ---------- */
function chatRowsHtml() {
  var ids = Object.keys(S.friends), q = (UI.q || '').trim().toLowerCase();
  var rows = ids.map(function (id) { var c = SG.inbox[sgChatId(id)]; return { id: id, at: (c && c.at) || 0, name: fname(id) }; }).filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; });
  rows.sort(function (a, b) { return (b.at - a.at) || a.name.localeCompare(b.name, 'ar'); });
  if (!rows.length) return q ? '<div class="sx-empty">مفيش نتايج لـ «' + esc(UI.q) + '»</div>' : '';
  return rows.map(function (r) {
    var id = r.id, sid = sgSafeId(id); if (!sid) return '';
    var p = S.fp[id] && S.fp[id].data, c = SG.inbox[sgChatId(id)], n = SG.unread[sgChatId(id)] || 0, sub;
    if (c && c.last) sub = (c.lastFrom === S.uid ? '<span style="display:inline-flex;vertical-align:middle;margin-left:4px;color:var(--text-secondary)">' + ic('check', 16) + '</span>' : '') + esc(c.last);
    else sub = '<span style="opacity:.75">' + esc(lastSeen(p) || 'ابدأ المحادثة 👋') + '</span>';
    return '<div class="sx-r" onclick="spChat(\'' + sid + '\')">' + avWrap(r.name, id, 52, p) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(r.name) + '</span><span class="sx-rm ' + (n ? 'hot' : '') + '">' + (r.at ? listTime(r.at) : '') + '</span></div><div class="sx-rs"><span class="tx">' + sub + '</span>' + badge(n) + '</div></div></div>';
  }).join('');
}
window.spQ = function (v) { UI.q = v; var b = $('sxRows'); if (b) b.innerHTML = chatRowsHtml() || ''; };
function chatsTab() {
  var ids = Object.keys(S.friends), rq = Object.keys(S.reqs).length, h = '';
  if (!ids.length) {
    return emptyBox('💬', 'مفيش محادثات لسه.<br>ضيف أصحابك الأول وابدأ الشات.', '<button class="btn" onclick="spAddPage()">' + ic('userplus', 20) + ' إضافة صديق</button>') + (rq ? '<div class="sx-banner" onclick="spRequests()"><span style="font-size:1.4rem">📨</span><b>طلبات صداقة (' + rq + ')</b>' + badge(rq) + '</div>' : '');
  }
  h += '<div class="sx-search">' + ic('search', 18) + '<input type="text" placeholder="ابحث في الدردشات" value="' + esc(UI.q) + '" oninput="spQ(this.value)"></div>';
  if (rq) h += '<div class="sx-banner" onclick="spRequests()"><span style="font-size:1.4rem">📨</span><b>طلبات صداقة جديدة</b>' + badge(rq) + '</div>';
  h += '<div id="sxRows" style="padding-bottom:90px">' + chatRowsHtml() + '</div>';
  return h;
}

/* ---------- الأصدقاء ---------- */
function friendsTab() {
  var ids = Object.keys(S.friends), rq = Object.keys(S.reqs).length, sm = Object.keys(sentMap()).filter(function (k) { return !S.friends[k]; }).length;
  var h = '<div class="sx-act" onclick="spAddPage()"><span class="ico">' + ic('userplus', 24) + '</span><b>إضافة صديق</b></div>';
  if (rq || sm) h += '<div class="sx-act" onclick="spRequests()"><span class="ico am">' + ic('users', 24) + '</span><b>الطلبات</b><span class="sx-rm">' + (rq ? rq + ' واردة' : '') + (rq && sm ? ' · ' : '') + (sm ? sm + ' مرسلة' : '') + '</span>' + badge(rq) + '</div>';
  h += '<div class="sx-sec">أصدقائي (' + ids.length + ')</div>';
  if (!ids.length) return h + emptyBox('👥', 'لسه مفيش أصدقاء.<br>ابعت طلب بالاسم أو بالكود أو الـ QR.');
  ids.map(function (id) { return { id: id, name: fname(id) }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).forEach(function (r) {
    var id = r.id, sid = sgSafeId(id); if (!sid) return; var p = S.fp[id] && S.fp[id].data, ct = credTag(p);
    h += '<div class="sx-r" onclick="spProfile(\'' + sid + '\')">' + avWrap(r.name, id, 50, p) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(r.name) + '</span></div><div class="sx-rs"><span class="tx ' + (isOnline(p) ? 'sp-ok' : '') + '">' + esc(lastSeen(p) || '—') + '</span></div></div><div class="sx-acts"><button class="sx-rb2" title="دردشة" onclick="event.stopPropagation();spChat(\'' + sid + '\')">' + ic('chat', 19) + '</button><button class="sx-rb2" title="تحدّي" onclick="event.stopPropagation();spChallenge(\'' + sid + '\')">⚔️</button></div></div>';
  });
  return h;
}

/* ---------- المنافسة: الدوري / التحديات / النشاط ---------- */
function leagueHtml() {
  var m = mine(), lw = lastWeek(), mp = sgProgress();
  var me = { id: S.uid, name: S.name + ' (أنت)', pts: m.pts, t: m.t, f: m.f, s: currentStreak || 0, lv: mp.level.level, me: true, p: { cr: myCred() } };
  var rows = [me], lwRows = [{ name: 'أنت', pts: lw.pts, week: lw.week }];
  Object.keys(S.friends).forEach(function (id) {
    var p = S.fp[id] && S.fp[id].data;
    if (!p) { rows.push({ id: id, name: fname(id), pts: 0, none: true }); return; }
    if (p.lw && p.lw.week === lw.week) lwRows.push({ name: p.name, pts: p.lw.pts || 0 });
    if (p.hidden) rows.push({ id: id, name: p.name, pts: -1, hid: true, p: p });
    else if (p.week !== m.week) rows.push({ id: id, name: p.name, pts: 0, t: 0, f: 0, s: p.streak || 0, lv: p.gameLevel || 0, p: p });
    else rows.push({ id: id, name: p.name, pts: p.pts || 0, t: p.tasks || 0, f: p.focus || 0, s: p.streak || 0, lv: p.gameLevel || 0, p: p });
  });
  rows.sort(function (a, b) { return b.pts - a.pts; });
  var med = ['🥇', '🥈', '🥉'], left = Math.max(0, Math.ceil((addDays(wkStart(), 7).getTime() - Date.now()) / DAY)), h = '';
  var mi = 0; rows.forEach(function (r, i) { if (r.me) mi = i; });
  if (rows.length > 1) {
    if (mi === 0) { var nx = rows[1]; h += '<div class="sx-toprank"><b>👑 أنت في المقدمة</b>' + (nx && !nx.hid && !nx.none ? '<div class="sp-sm">الفارق عن ' + esc(nx.name) + ': ' + (rows[0].pts - nx.pts) + ' نقطة — حافظ عليها 💪</div>' : '') + '</div>'; }
    else { var up = rows[mi - 1]; h += '<div class="sx-toprank"><b>📈 ناقصك ' + (up.pts - me.pts + 1) + ' نقطة عشان تعدّي ' + esc(up.name) + '</b><div class="sp-sm">مهمة واحدة = 10 نقاط، ساعة تركيز = 60 نقطة</div></div>'; }
  }
  lwRows.sort(function (a, b) { return b.pts - a.pts; });
  if (lwRows.length > 1 && lwRows[0].pts > 0) h += '<div class="sx-hint" style="margin:6px 14px">👑 بطل الأسبوع اللي فات: <b>' + esc(lwRows[0].name) + '</b> (' + lwRows[0].pts + ' نقطة)</div>';
  rows.forEach(function (r, i) {
    var line = r.hid ? '🙈 إحصائياته مخفية' : r.none ? '—' : '✅ ' + r.t + ' · ⏱ ' + r.f + 'د · 🔥 ' + r.s + (r.lv ? ' · م' + r.lv : '');
    h += '<div class="sx-lrow ' + (r.me ? 'me' : '') + '"><span class="rk">' + (med[i] || (i + 1)) + '</span>' + avatar(r.name, r.id || S.uid, 42) + '<div class="m"><b>' + esc(r.name) + '</b><small>' + line + '</small>' + (r.p ? credTag(r.p) : '') + '</div><div class="pt">' + (r.pts < 0 ? '' : r.pts + '<small>نقطة</small>') + '</div></div>';
  });
  if (rows.length === 1) h += emptyBox('🏆', 'ضيف أصحابك عشان تتنافسوا على المهام والتركيز.', '<button class="btn" onclick="spAddPage()">' + ic('userplus', 20) + ' إضافة صديق</button>');
  h += '<div class="sx-hint" style="margin:10px 16px 24px">الترتيب الأسبوعي بيتصفّر كل سبت — باقي ' + left + ' يوم. المهمة = 10 نقاط، دقيقة تركيز = نقطة، وكل يوم streak (لحد 7) = 5 نقاط. كل الأرقام بتتحسب من سجل تطبيقك الفعلي.</div>';
  return h;
}
function duelRowHtml(d) {
  var now = Date.now(), over = now > d.endsAt, myAcc = accepted(d, S.uid), st = standingsOf(d, now), tot = d.tasks.length || 1;
  var me = st.filter(function (x) { return x.u === S.uid; })[0] || { ok: 0, p: 0 }, top = st[0];
  var rv = 0; if (d.cl && myAcc) Object.keys(d.cl).forEach(function (k) { var c = d.cl[k]; if (c.u !== S.uid && c.s === 'p' && now - ms(c.at) <= GRACE) rv++; });
  var flag = (!myAcc && !over) ? '<span class="sp-chip sp-wait">دعوة جديدة</span>' : rv ? '<span class="sp-chip sp-wait">' + rv + ' محتاجة تأكيدك</span>' : '';
  var win = over && top && top.ok > 0 && (!st[1] || top.ok > st[1].ok) ? top.u : null;
  var sub = over ? ('انتهى' + (win ? ' · الفايز: ' + (win === S.uid ? 'أنت 🏆' : ((d.names && d.names[win]) || fname(win))) : ' · تعادل')) : 'باقي ' + Math.max(1, Math.ceil((d.endsAt - now) / DAY)) + ' يوم · ' + d.members.length + ' لاعب';
  return '<div class="sx-duel" onclick="spDuel(\'' + d.id + '\')"><div class="ico">' + (over ? '🏁' : '⚔️') + '</div><div class="m"><b>' + esc(d.title) + '</b><small>' + esc(sub) + '</small><div class="sp-bar"><i style="width:' + Math.round(me.ok / tot * 100) + '%;background:var(--accent);"></i><i style="width:' + Math.round(me.p / tot * 100) + '%;background:#f39c12;opacity:.6;"></i></div><small>أنت: ' + me.ok + '/' + tot + ' ' + flag + '</small></div></div>';
}
function duelsListHtml() {
  var h = '<div style="padding:6px 12px 2px"><button class="btn" style="width:100%" onclick="spNewDuel()">⚔️ تحدّي جديد</button></div>';
  if (!S.duels.length) return h + emptyBox('⚔️', 'مفيش تحديات لسه.<br>اعمل مهام مشتركة مع صحابك ومين يخلّص أكتر يكسب 🏆');
  var now = Date.now(), list = S.duels.slice().sort(function (a, b) {
    var ia = (a.acc && !a.acc[S.uid] ? 0 : 1) + (now > a.endsAt ? 2 : 0), ib = (b.acc && !b.acc[S.uid] ? 0 : 1) + (now > b.endsAt ? 2 : 0);
    return ia - ib || b.createdAt - a.createdAt;
  });
  list.forEach(function (d) { h += duelRowHtml(d); });
  return h + '<div class="sx-hint" style="margin:10px 16px 24px">🛡 المصداقية: المهام الموثّقة بتتسجّل من سجل تطبيقك مش بزرار، واليدوية لازم صاحبك يأكّدها. أي إنجاز بيتعارض عليه مابيتحسبش.</div>';
}
function compTab() {
  var seg = S.seg.comp, bn = reviewsToDo() + invitesCount();
  var h = segBar('comp', [['league', '🏆 الدوري'], ['duels', '⚔️ التحديات', bn], ['feed', '📣 النشاط']]);
  return h + (seg === 'duels' ? duelsListHtml() : seg === 'feed' ? '<div style="padding:0 12px 24px">' + feedHtml() + '</div>' : leagueHtml());
}

/* ---------- حسابي ---------- */
function meTab() {
  var seg = S.seg.me, qn = questsReady();
  var h = segBar('me', [['home', '🏠 نظرة عامة'], ['quests', '🎯 المهمات', qn], ['badges', '🎖️ الأوسمة'], ['analytics', '📈 التحليلات']]);
  var c = seg === 'quests' ? sgQuestsHtml() : seg === 'badges' ? sgBadgesHtml() : seg === 'analytics' ? sgAnalyticsHtml() : sgHomeHtml();
  return h + '<div class="sx-games">' + c + '</div>';
}

/* ---------- صفحات فرعية ---------- */
function reqPageHtml() {
  var h = '', ids = Object.keys(S.reqs);
  h += '<div class="sx-sec">طلبات واردة (' + ids.length + ')</div>';
  if (!ids.length) h += '<div class="sx-hint" style="padding:0 16px">مفيش طلبات واردة.</div>';
  ids.forEach(function (id) { var nm = S.reqs[id].name || 'صديق'; h += '<div class="sx-r">' + avatar(nm, id, 48) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(nm) + '</span></div></div><div class="sx-acts"><button class="btn sp-mini" onclick="spAcceptReq(\'' + esc(id) + '\')">قبول</button><button class="btn btn-secondary sp-mini" onclick="spDeclineReq(\'' + esc(id) + '\')">رفض</button></div></div>'; });
  var sm = sentMap(), sids = Object.keys(sm).filter(function (k) { return !S.friends[k]; });
  h += '<div class="sx-sec">طلبات أرسلتها (' + sids.length + ')</div>';
  if (!sids.length) h += '<div class="sx-hint" style="padding:0 16px">مفيش طلبات مرسلة.</div>';
  sids.forEach(function (id) { var nm = sm[id].name || 'صديق'; h += '<div class="sx-r">' + avatar(nm, id, 48) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(nm) + '</span></div><div class="sx-rs"><span class="tx sp-wait">⏳ مستني الرد</span></div></div><div class="sx-acts"><button class="btn btn-secondary sp-mini" onclick="spCancelReq(\'' + esc(id) + '\')">إلغاء</button></div></div>'; });
  return h;
}
function addPageHtml() {
  var seg = S.seg.add, h = segBar('add', [['name', '🔎 بالاسم'], ['code', '🔑 بالكود'], ['mine', '📱 كودي']]);
  if (seg === 'name') {
    var sm = sentMap(), nd = LS.getItem('sp_nodisc') === '1';
    h += '<div class="sx-pad"><label class="sx-lbl">اسم صاحبك</label><div style="display:flex;gap:8px"><input type="text" id="spQ" class="sp-in" value="' + esc(S.qraw) + '" placeholder="اكتب الاسم" onkeydown="if(event.key===\'Enter\')spSearch()"><button class="btn" style="flex:none;padding:0 20px" onclick="spSearch()">بحث</button></div>';
    if (S.res) {
      h += '<div class="sx-sec" style="padding-right:2px">النتائج</div>';
      S.res.forEach(function (r) {
        var st = S.friends[r.id] ? '<span class="sp-ok sp-sm">صاحبك بالفعل ✅</span>' : S.reqs[r.id] ? '<button class="btn sp-mini" onclick="spAcceptReq(\'' + esc(r.id) + '\')">قبول طلبه</button>' : sm[r.id] ? '<span class="sp-wait sp-sm">⏳ اتبعت الطلب</span>' : '<button class="btn sp-mini" onclick="spSendReq(\'' + esc(r.id) + '\')">إرسال طلب</button>';
        h += '<div class="sx-r" style="padding:0">' + avatar(r.name, r.id, 46) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(r.name) + '</span></div>' + (r.code ? '<div class="sx-rs"><span class="tx">كوده ينتهي بـ ' + esc(r.code.slice(-2)) + '</span></div>' : '') + '</div><div class="sx-acts">' + st + '</div></div>';
      });
      if (!S.res.length) h += '<div class="sx-hint">مفيش نتايج — جرّب اسم تاني.</div>';
    } else h += '<div class="sx-hint">ابحث بالاسم اللي صاحبك مسجّل بيه. لو مش لاقيه، اطلب منه كوده أو الـ QR.</div>';
    h += '<div class="sx-card" style="margin-top:16px"><div class="sx-sw" onclick="spDisc()"><div><b>ظهوري في البحث</b><small>' + (nd ? 'مخفي — محدش يقدر يلاقيك بالاسم' : 'ظاهر — أصحابك يقدروا يلاقوك بالاسم') + '</small></div><span class="sx-tg ' + (nd ? '' : 'on') + '"></span></div></div></div>';
  } else if (seg === 'code') {
    h += '<div class="sx-pad"><label class="sx-lbl">كود صاحبك (6 حروف/أرقام)</label><input type="text" id="spCodeIn" class="sp-in" maxlength="6" placeholder="••••••" autocomplete="off" style="text-align:center;font-family:monospace;font-size:1.4rem;letter-spacing:6px;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')spAdd()"><div class="sx-btnrow"><button class="btn" onclick="spAdd()">إرسال طلب</button></div>' +
      '<div class="sx-hint" style="text-align:center;margin:18px 0 8px">— أو —</div><button class="btn btn-secondary" style="width:100%" onclick="spScan()">' + ic('camera', 20) + ' مسح QR بالكاميرا</button></div>';
  } else {
    var qr = S.qr ? '<img src="' + S.qr + '" width="200" height="200" alt="QR">' : '<div id="spQR"></div>';
    h += '<div class="sx-pad"><div class="sx-card"><div class="sx-qrbox"><div class="sx-hint" style="margin:0;text-align:center">صاحبك يمسح الـ QR أو يكتب الكود، وبيوصلك طلب صداقة تقبله.</div><div class="sp-qr">' + qr + '</div><div class="sx-code">' + esc(S.code) + '</div></div><div class="sx-btnrow"><button class="btn btn-secondary" onclick="spCopy()">' + ic('copy', 18) + ' نسخ</button><button class="btn btn-secondary" onclick="spShare()">' + ic('share', 18) + ' مشاركة</button></div></div></div>';
  }
  return h;
}
function profilePageHtml(id) {
  var p = S.fp[id] && S.fp[id].data, nm = fname(id), sid = esc(id), h = '<div class="sx-prof">' + avWrap(nm, id, 96, p) + '<h2>' + esc(nm) + '</h2><div class="sx-hint" style="margin:0">' + esc(lastSeen(p) || '') + '</div></div>';
  h += '<div class="sx-btnrow" style="padding:0 14px"><button class="btn" onclick="spChat(\'' + sid + '\')">' + ic('chat', 19) + ' رسالة</button><button class="btn btn-secondary" onclick="spChallenge(\'' + sid + '\')">⚔️ تحدّيه</button></div>';
  if (p && !p.hidden) {
    var m = mine(), cr = credOf(p), cur = p.week === m.week;
    h += '<div class="sx-pad"><div class="sx-sec" style="padding-right:2px">إحصائيات الأسبوع</div><div class="sx-stats"><div class="sx-stat"><b>' + (cur ? (p.pts || 0) : 0) + '</b><small>نقطة</small></div><div class="sx-stat"><b>' + (cur ? (p.tasks || 0) : 0) + '</b><small>مهمة منجزة</small></div><div class="sx-stat"><b>' + (cur ? (p.focus || 0) : 0) + 'د</b><small>تركيز</small></div><div class="sx-stat"><b>🔥 ' + (p.streak || 0) + '</b><small>streak</small></div>' + (p.gameLevel ? '<div class="sx-stat"><b>' + p.gameLevel + '</b><small>المستوى</small></div>' : '') + (p.gameBadges != null ? '<div class="sx-stat"><b>' + p.gameBadges + '</b><small>أوسمة</small></div>' : '') + '</div>' + (cr != null ? '<div class="sx-card" style="text-align:center">✔ مصداقية <b>' + cr + '%</b></div>' : '') + '</div>';
  } else h += '<div class="sx-hint" style="text-align:center;margin-top:18px">🙈 إحصائياته مخفية</div>';
  h += '<div class="sx-pad"><button class="btn btn-secondary" style="width:100%;color:#ff6b6b" onclick="spRemove(\'' + sid + '\')">' + ic('trash', 18) + ' حذف الصديق</button></div>';
  return h;
}
function pickPageHtml() {
  var ids = Object.keys(S.friends), h = '<div class="sx-act" onclick="spAddPage()"><span class="ico">' + ic('userplus', 24) + '</span><b>إضافة صديق جديد</b></div><div class="sx-sec">أصدقائي (' + ids.length + ')</div>';
  ids.map(function (id) { return { id: id, name: fname(id) }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).forEach(function (r) {
    var sid = sgSafeId(r.id); if (!sid) return; var p = S.fp[r.id] && S.fp[r.id].data;
    h += '<div class="sx-r" onclick="spChat(\'' + sid + '\')">' + avWrap(r.name, r.id, 50, p) + '<div class="sx-rb"><div class="sx-rt"><span class="sx-rn">' + esc(r.name) + '</span></div><div class="sx-rs"><span class="tx">' + esc(lastSeen(p) || '') + '</span></div></div></div>';
  });
  return h;
}
function settingsHtml() {
  var hid = LS.getItem('sp_hide') === '1', nd = LS.getItem('sp_nodisc') === '1';
  return '<div class="sx-prof">' + avatar(S.name, S.uid, 84) + '</div><div class="sx-pad"><label class="sx-lbl">اسمي (بيظهر لأصحابي)</label><div style="display:flex;gap:8px"><input type="text" id="spNameIn2" class="sp-in" maxlength="20" value="' + esc(S.name) + '"><button class="btn" style="flex:none;padding:0 20px" onclick="spSaveName()">حفظ</button></div>' +
    '<div class="sx-card" style="margin-top:16px"><div class="sx-sw" onclick="spHide()"><div><b>إخفاء إحصائياتي</b><small>' + (hid ? 'مخفية — أصحابك مش شايفين نقاطك' : 'ظاهرة لأصحابك (نقاط، مهام، تركيز، streak)') + '</small></div><span class="sx-tg ' + (hid ? 'on' : '') + '"></span></div><div class="sx-sw" onclick="spDisc()"><div><b>الظهور في البحث بالاسم</b><small>' + (nd ? 'مخفي — بالكود أو الـ QR بس' : 'ظاهر في نتائج البحث') + '</small></div><span class="sx-tg ' + (nd ? '' : 'on') + '"></span></div></div>' +
    '<div class="sx-card"><div class="sx-hint" style="margin:0">كودي: <b style="font-family:monospace;letter-spacing:3px;color:var(--accent)">' + esc(S.code) + '</b></div><div class="sx-btnrow"><button class="btn btn-secondary" onclick="spAddPage(\'mine\')">' + ic('qr', 18) + ' عرض الـ QR</button></div></div>' +
    '<div class="sx-hint">الأصدقاء بيشوفوا أرقامك بس (نقاط، مهام منجزة، دقايق تركيز، streak) — مش عناوين مهامك ولا ملاحظاتك.</div></div>';
}
window.spSaveName = function () {
  var n = (($('spNameIn2') || {}).value || '').trim(); if (!n) { snack('اكتب اسمك الأول ✏️'); return; }
  S.name = n.slice(0, 20); LS.setItem('sp_name', S.name); push(true); snack('اتحفظ الاسم ✅'); render(true);
};
function duelPageHtml(id) { var d = duelById(id); return d ? '<div class="sx-pad">' + duelCard(d) + '</div>' : ''; }

/* ---------- شاشة البداية (قبل تفعيل الخدمة) ---------- */
function onboardHtml() {
  var pend = LS.getItem('sp_pending');
  return '<div class="sx-onb"><div class="logo">🏆</div><h2>المنافسة والأصدقاء</h2><p>نافس صحابك على المهام والتركيز، وادردش معاهم. الأصدقاء بيشوفوا أرقامك بس (نقاط، مهام، تركيز، streak) — مش عناوين مهامك ولا ملاحظاتك، وتقدر تخفيها في أي وقت.</p>' +
    (S.err ? '<div class="sp-sm" style="color:#e74c3c">' + esc(S.err) + '</div>' : '') + (pend ? '<div class="sp-card" style="width:100%;max-width:320px">🎉 وصلك كود صديق (<b>' + esc(pend) + '</b>) — ابدأ وهنضيفه تلقائيًا.</div>' : '') +
    '<input type="text" id="spNameIn" class="sp-in" maxlength="20" placeholder="اسمك اللي هيظهر لأصحابك" value="' + esc(LS.getItem('sp_name') || LS.getItem('app_ai_user_name') || '') + '"><button class="btn" onclick="spStart()">' + (S.booting ? '⏳ جاري التجهيز...' : '🚀 ابدأ') + '</button></div>';
}

/* ================== الرندر الرئيسي ================== */
function viewKeyOf(v) { return v.t + ':' + (v.id || '') + (v.t === 'main' ? ':' + S.tab : ''); }
function render(force) {
  refreshBadges();
  var p = $('spPage'); if (!p || !UI.open) return;
  var cur = curView(), key = S.code ? viewKeyOf(cur) : 'onboard';
  var ae = document.activeElement, typing = ae && p.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'sxInput';
  if (!force && typing && key === UI.key) { S.dirty = true; return; }
  S.dirty = false;
  /* صفحات اتشالت من تحت إيدينا (صديق اتحذف / تحدي اتمسح) */
  if (S.code) {
    var gone = ((cur.t === 'chat' || cur.t === 'profile') && !S.fFirst && !S.friends[cur.id]) || (cur.t === 'duel' && UI.duelsReady && !duelById(cur.id));
    if (gone) { NAV.pop(); if (UI.hist) { try { history.back(); } catch (e) { } } cur = curView(); key = viewKeyOf(cur); }
  }
  var changed = key !== UI.key, body = $('sxBody');
  if (changed) { if (body && UI.key) UI.scroll[UI.key] = body.scrollTop; try { leaveView(UI.keyView); } catch (e) { } }
  var keep = (!changed && body) ? body.scrollTop : 0;
  UI.key = key; UI.keyView = cur;
  if (!S.code) { setHead(hb('المنافسة والأصدقاء')); setBody(onboardHtml()); setFoot(''); return; }
  switch (cur.t) {
    case 'chat': renderChat(cur, changed); return;
    case 'add': setHead(hb('إضافة صديق')); setBody(addPageHtml()); setFoot(''); break;
    case 'requests': setHead(hb('طلبات الصداقة')); setBody(reqPageHtml()); setFoot(''); break;
    case 'profile': setHead(hb('معلومات الصديق')); setBody(profilePageHtml(cur.id)); setFoot(''); break;
    case 'pick': setHead(hb('محادثة جديدة')); setBody(pickPageHtml()); setFoot(''); break;
    case 'newduel': setHead(hb('تحدّي جديد')); setBody('<div class="sx-pad">' + (S.form ? formHtml() : '') + '</div>'); setFoot(''); break;
    case 'duel': setHead(hb('تفاصيل التحدي')); setBody(duelPageHtml(cur.id)); setFoot(''); break;
    case 'settings': setHead(hb('الإعدادات')); setBody(settingsHtml()); setFoot(''); break;
    default: renderMain(); break;
  }
  if (changed) { enterView(cur); var sb = $('sxBody'); if (sb) sb.scrollTop = UI.scroll[key] || 0; } else { var sb2 = $('sxBody'); if (sb2) sb2.scrollTop = keep; }
  afterRender();
}
function renderMain() {
  var t = S.tab, title = { chats: 'الدردشات', friends: 'الأصدقاء', comp: 'المنافسة', me: 'حسابي' }[t] || '', right = '', body = '', cls = '';
  if (t === 'chats') { right = ibtn('userplus', 'spAddPage()', 'إضافة صديق'); body = chatsTab() + (Object.keys(S.friends).length ? '<button class="sx-fab" onclick="spPickChat()" aria-label="محادثة جديدة">' + ic('chat', 26) + '</button>' : ''); }
  else if (t === 'friends') { right = ibtn('userplus', 'spAddPage()', 'إضافة صديق'); body = friendsTab(); }
  else if (t === 'comp') body = compTab();
  else { right = ibtn('gear', 'spSettings()', 'الإعدادات'); body = meTab(); }
  setHead(hb(title, right)); setBody(body, cls); setFoot(navHtml());
}
function afterRender() {
  var q = $('spQR'); if (!q || S.qr) return;
  if (typeof QRCode === 'undefined') { q.innerHTML = '<div class="sp-sm" style="color:#000;line-height:1.4;padding:20px;">مكتبة QR مش متحمّلة — استخدم الكود المكتوب</div>'; return; }
  try {
    q.innerHTML = ''; new QRCode(q, { text: BASE + '?f=' + S.code, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    var cv = q.querySelector('canvas'); if (cv) { try { S.qr = cv.toDataURL('image/png'); } catch (e) { } }
  } catch (e) { }
}
try { document.addEventListener('focusout', function (e) { if (S.dirty && e.target && e.target.closest && e.target.closest('#spPage')) setTimeout(function () { if (S.dirty) render(); }, 250); }); } catch (e) { }

function enterView(v) {
  if (v && v.t === 'chat') { UI.chatFirst = true; UI.stick = true; UI.newBelow = 0; UI.lastId = ''; UI.emojiOn = false; UI.attachOn = false; SG.chatLimit = 40; chatStart(v.id); }
}
function leaveView(v) {
  if (v && v.t === 'chat') { var i = $('sxInput'); if (i) UI.drafts[v.id] = i.value; sgStopChat(); UI.emojiOn = false; UI.attachOn = false; UI.stickKb = false; }
}

/* ================== الشات (شكل واتساب) ================== */
function sgChatReadMap() { return sgRead('chatRead', {}); }
function sgStopChat() {
  ['chatUnsub', 'readUnsub'].forEach(function (k) { if (SG[k]) { try { SG[k](); } catch (e) { } SG[k] = null; } });
  SG.chatItems = []; SG.chatLoading = false; SG.chatMore = false; SG.readAt = 0; SG.myReadSent = 0; SG.chatFriend = '';
}
function chatStart(fid) {
  sgStopChat(); var d = db(); if (!d || !S.uid) return;
  SG.chatFriend = fid; SG.chatLoading = true; var cid = sgChatId(fid), lim = SG.chatLimit || 40;
  SG.chatUnsub = d.collection('socialChats').doc(cid).collection('messages').orderBy('createdAt', 'desc').limit(lim).onSnapshot({ includeMetadataChanges: true }, function (sn) {
    SG.chatItems = sn.docs.map(function (x) { var o = Object.assign({ id: x.id }, x.data({ serverTimestamps: 'estimate' })); o._p = x.metadata.hasPendingWrites; return o; }).reverse();
    SG.chatMore = sn.size >= lim; SG.chatLoading = false; chatMarkRead(); chatRefresh();
  }, function () { SG.chatLoading = false; snack('تعذّر تحميل الشات. راجع قواعد أمان socialChats في Firestore.'); chatRefresh(); });
  try {
    SG.readUnsub = d.collection('socialChats').doc(cid).collection('reads').doc(fid).onSnapshot(function (s) { var t = s.exists ? ms(s.data({ serverTimestamps: 'estimate' }).at) : 0; if (t !== SG.readAt) { SG.readAt = t; chatRefresh(); } }, function () { });
  } catch (e) { }
}
function chatMarkRead() {
  var v = curView(); if (!UI.open || v.t !== 'chat' || document.visibilityState !== 'visible') return;
  var cid = sgChatId(v.id), m = sgChatReadMap(), it = SG.chatItems, last = it.length ? ms(it[it.length - 1].createdAt) : 0, c = SG.inbox[cid];
  m[cid] = Math.max(m[cid] || 0, last, (c && c.at) || 0); sgWrite('chatRead', m);
  if (SG.unread[cid]) { SG.unread[cid] = 0; sgWrite('chatUnread', SG.unread); }
  /* إيصال القراءة (✓✓ الزرقا عند صاحبك) */
  var inc = null, k; for (k = it.length - 1; k >= 0; k--) { if (it[k].from !== S.uid && !it[k]._p) { inc = it[k]; break; } }
  if (inc && ms(inc.createdAt) > (SG.myReadSent || 0) && db()) {
    SG.myReadSent = ms(inc.createdAt);
    db().collection('socialChats').doc(cid).collection('reads').doc(S.uid).set({ at: FV().serverTimestamp() }).catch(function () { });
  }
  refreshBadges();
}
function tickHtml(m, t) {
  if (m._p) return '<span class="tk" title="جاري الإرسال">' + ic('clock', 13) + '</span>';
  if (SG.readAt && t <= SG.readAt) return '<span class="tk" style="color:var(--wa-tick)" title="اتقرأت">' + ic('check2', 16) + '</span>';
  return '<span class="tk" title="اتبعتت">' + ic('check', 16) + '</span>';
}
function bubbleHtml(m, idx, tail) {
  var t = ms(m.createdAt), mine = m.from === S.uid, url = sgSafeUrl(m.fileUrl), img = sgSafeImg(m.img), cls = 'sx-b ' + (mine ? 'mine' : 'in') + (tail ? ' tail' : ''), body = '';
  var meta = '<span class="sx-m">' + hhmm(t) + (mine ? tickHtml(m, t) : '') + '</span>';
  if (m.type === 'image') { var src = img || url; if (src) { cls += ' img'; body = '<img src="' + esc(src) + '" alt="صورة مرفقة" loading="lazy">'; } else body = '<i style="opacity:.7">الصورة مش متاحة</i>'; }
  else if (m.type === 'file' && m.fileId) body = '<a class="sx-fil" href="#" data-dl="1"><span class="fi">' + ic('file', 22) + '</span><span style="min-width:0"><b>' + esc(m.fileName || 'ملف مرفق') + '</b><small>' + fmtSize(m.fileSize) + ' · اضغط للتحميل</small></span></a>';
  else if (m.type === 'file') body = url ? '<a class="sx-fil" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><span class="fi">' + ic('file', 22) + '</span><span style="min-width:0"><b>' + esc(m.fileName || 'ملف مرفق') + '</b><small>اضغط للفتح</small></span></a>' : '<i style="opacity:.7">الملف مش متاح</i>';
  else body = '<span class="tx">' + linkify(m.text || '') + '</span>';
  return '<div class="' + cls + '" data-i="' + idx + '">' + body + meta + '</div>';
}
function chatMsgsHtml() {
  var it = SG.chatItems, h = '', prev = null;
  if (SG.chatLoading && !it.length) return '<div class="sx-sys">⏳ جاري تحميل الرسائل...</div>';
  if (SG.chatMore) h += '<button class="sx-more" onclick="spOlder()">تحميل رسائل أقدم</button>';
  else h += '<div class="sx-sys">🔒 المحادثة دي خاصة بينك وبين ' + esc(fname(SG.chatFriend)) + ' بس.</div>';
  if (!it.length && !UI.upl.length) h += '<div class="sx-sys" style="margin-top:4px">ابدأ بـ «سلام» 👋</div>';
  it.forEach(function (m, idx) {
    var t = ms(m.createdAt), d = new Date(t);
    if (!prev || !sameDay(new Date(prev.t), d)) h += '<div class="sx-day">' + dayLabel(t) + '</div>';
    var cont = prev && prev.from === m.from && sameDay(new Date(prev.t), d) && t - prev.t < 3 * 60000;
    h += bubbleHtml(m, idx, !cont); prev = { from: m.from, t: t };
  });
  UI.upl.forEach(function (u) { h += '<div class="sx-b mine ' + (prev && prev.from === S.uid ? '' : 'tail') + '"><span class="tx">' + (u.kind === 'image' ? '🖼 جاري تجهيز الصورة...' : '📎 جاري رفع ' + esc(u.name) + (u.prog ? ' (' + u.prog + ')' : '') + '...') + '</span><span class="sx-m"><span class="tk">' + ic('clock', 13) + '</span></span></div>'; });
  return h;
}
function chatRefresh() {
  var box = $('sxMsgs'); if (!box || curView().t !== 'chat') return;
  var near = box.scrollHeight - box.scrollTop - box.clientHeight < 140, oldH = box.scrollHeight, oldTop = box.scrollTop;
  var it = SG.chatItems, last = it.length ? it[it.length - 1] : null, prevId = UI.lastId;
  box.innerHTML = chatMsgsHtml();
  var stickNow = false;
  if (UI.chatFirst && it.length) { box.scrollTop = box.scrollHeight; UI.chatFirst = false; stickNow = true; }
  else if (UI.keepPos) { box.scrollTop = oldTop + (box.scrollHeight - oldH); UI.keepPos = false; }
  else if (UI.stick || near) { box.scrollTop = box.scrollHeight; UI.stick = false; stickNow = true; }
  else { box.scrollTop = oldTop; if (last && last.id !== prevId && last.from !== S.uid && prevId) UI.newBelow++; }
  UI.lastId = last ? last.id : '';
  if (stickNow) { var imgs = box.querySelectorAll('img'), j; for (j = 0; j < imgs.length; j++) { if (!imgs[j].complete) imgs[j].addEventListener('load', function () { box.scrollTop = box.scrollHeight; }, { once: true }); } }
  updDown(); onMsgScroll();
  var st = document.querySelector('.sx-hdr-chat .st'); if (st) { var p = S.fp[curView().id] && S.fp[curView().id].data; st.textContent = lastSeen(p); st.className = 'st ' + (isOnline(p) ? 'on' : ''); }
}
function onMsgScroll() { var b = $('sxMsgs'), d = $('sxDown'); if (!b || !d) return; var near = b.scrollHeight - b.scrollTop - b.clientHeight < 140; d.classList.toggle('on', !near); UI.stickKb = near; if (near && UI.newBelow) { UI.newBelow = 0; updDown(); } }
function updDown() { var d = $('sxDown'); if (d) d.innerHTML = ic('down', 22) + badge(UI.newBelow); }
window.spDown = function () { var b = $('sxMsgs'); if (!b) return; try { b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); } catch (e) { b.scrollTop = b.scrollHeight; } UI.newBelow = 0; updDown(); };
window.spOlder = function () { var fid = SG.chatFriend; if (!fid) return; SG.chatLimit = (SG.chatLimit || 40) + 40; UI.keepPos = true; SG.chatLoading = false; chatStart(fid); };

var EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😐 😑 😶 🙄 😬 🥱 😴 🤤 😷 🤒 🤕 🤢 🤧 😈 👻 💀 🤖 👍 👎 👌 ✌️ 🤞 🤝 👏 🙌 🙏 💪 👋 🤙 👊 ✊ ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 ✨ 🔥 ⭐ 🌟 🎉 🎊 🏆 🥇 🎯 ✅ ❌ ⚡ 💡 📚 ✏️ ⏰ ☕ 🍕 🌹 🌙'.split(' ');
function chatBodyHtml() {
  return '<div class="sx-msgs" id="sxMsgs"></div><button class="sx-down" id="sxDown" onclick="spDown()" aria-label="لأسفل">' + ic('down', 22) + '</button>' +
    '<div class="sx-attach" id="sxAttach"><label><span class="ci" style="background:#7f66ff">' + ic('file', 24) + '</span>مستند<input type="file" hidden onchange="spGameChatFile(this)"></label>' +
    '<label><span class="ci" style="background:#d3396d">' + ic('image', 24) + '</span>المعرض<input type="file" hidden accept="image/*" onchange="spGameChatFile(this)"></label>' +
    '<label><span class="ci" style="background:#ec407a">' + ic('camera', 24) + '</span>الكاميرا<input type="file" hidden accept="image/*" capture="environment" onchange="spGameChatFile(this)"></label></div>';
}
function composerHtml(fid) {
  var dr = UI.drafts[fid] || '';
  return '<div class="sx-comp"><div class="sx-pill"><button class="sx-ib" id="sxEmojiBtn" onpointerdown="event.preventDefault()" onclick="spEmoji()" aria-label="إيموجي">' + ic('smile', 24) + '</button>' +
    '<textarea id="sxInput" rows="1" maxlength="2000" placeholder="اكتب رسالة" oninput="spInp(this)" onkeydown="spKey(event)" onfocus="spFocusIn()">' + esc(dr) + '</textarea>' +
    '<button class="sx-ib" onpointerdown="event.preventDefault()" onclick="spAttach()" aria-label="إرفاق">' + ic('attach', 23) + '</button></div>' +
    '<button class="sx-send ' + (dr.trim() ? '' : 'idle') + '" id="sxSend" onpointerdown="event.preventDefault()" onclick="spGameChatSend()" aria-label="إرسال">' + ic('send', 22) + '</button></div>' +
    '<div class="sx-emoji" id="sxEmoji">' + EMOJIS.map(function (e) { return '<button onpointerdown="event.preventDefault()" onclick="spEmojiAdd(\'' + e + '\')">' + e + '</button>'; }).join('') + '</div>';
}
function renderChat(v, changed) {
  var id = v.id, p = S.fp[id] && S.fp[id].data, nm = fname(id), sid = esc(id);
  setHead('<button class="sx-ib" onclick="spBack()" aria-label="رجوع">' + ic('back') + '</button><div class="sx-hdr-chat" onclick="spProfile(\'' + sid + '\')">' + avWrap(nm, id, 40, p) + '<div style="min-width:0"><div class="nm">' + esc(nm) + '</div><div class="st ' + (isOnline(p) ? 'on' : '') + '">' + esc(lastSeen(p)) + '</div></div></div>' + ibtn('more', 'spChatMenu()', 'المزيد'));
  if (changed || !$('sxMsgs')) {
    setBody(chatBodyHtml(), 'sx-chatbody'); setFoot(composerHtml(id)); bindMsgs($('sxMsgs'));
    var inp = $('sxInput'); if (inp) spInp(inp);
  }
  if (changed) enterView(v);
  chatRefresh();
}
function bindMsgs(box) {
  if (!box) return; var tmr = null, sx = 0, sy = 0;
  box.addEventListener('click', function (e) {
    closePanels(); var im = e.target.closest && e.target.closest('.sx-b.img img'); if (im) spView(im.getAttribute('src'));
    var dl = e.target.closest && e.target.closest('a[data-dl]'); if (dl) { e.preventDefault(); var bb = dl.closest('.sx-b[data-i]'); if (bb) spDownload(+bb.getAttribute('data-i')); }
  });
  box.addEventListener('contextmenu', function (e) { var b = e.target.closest && e.target.closest('.sx-b[data-i]'); if (!b) return; e.preventDefault(); spMsgMenu(+b.getAttribute('data-i')); });
  box.addEventListener('touchstart', function (e) {
    var b = e.target.closest && e.target.closest('.sx-b[data-i]'); if (!b) return; var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    clearTimeout(tmr); tmr = setTimeout(function () { spMsgMenu(+b.getAttribute('data-i')); }, 480);
  }, { passive: true });
  box.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(tmr); }, { passive: true });
  box.addEventListener('touchend', function () { clearTimeout(tmr); }, { passive: true });
  box.addEventListener('touchcancel', function () { clearTimeout(tmr); }, { passive: true });
  box.addEventListener('scroll', onMsgScroll, { passive: true });
}
function closePanels() {
  UI.emojiOn = false; UI.attachOn = false; var e = $('sxEmoji'), a = $('sxAttach'), b = $('sxEmojiBtn');
  if (e) e.classList.remove('on'); if (a) a.classList.remove('on'); if (b) b.innerHTML = ic('smile', 24);
}
window.spEmoji = function () {
  var on = !UI.emojiOn; closePanels(); UI.emojiOn = on; var e = $('sxEmoji'), b = $('sxEmojiBtn');
  if (e) e.classList.toggle('on', on); if (b) b.innerHTML = ic(on ? 'kbd' : 'smile', 24);
  var m = $('sxMsgs'); if (on && m && UI.stickKb) setTimeout(function () { m.scrollTop = m.scrollHeight; }, 30);
};
window.spAttach = function () { var on = !UI.attachOn; closePanels(); UI.attachOn = on; var a = $('sxAttach'); if (a) a.classList.toggle('on', on); };
window.spFocusIn = function () { var e = $('sxEmoji'), b = $('sxEmojiBtn'); UI.emojiOn = false; if (e) e.classList.remove('on'); if (b) b.innerHTML = ic('smile', 24); var a = $('sxAttach'); if (a) a.classList.remove('on'); UI.attachOn = false; setTimeout(function () { var m = $('sxMsgs'); if (m && UI.stickKb) m.scrollTop = m.scrollHeight; }, 320); };
window.spInp = function (el) {
  el.style.height = '44px'; el.style.height = Math.min(el.scrollHeight, 124) + 'px';
  var s = $('sxSend'); if (s) s.classList.toggle('idle', !el.value.trim());
  if (SG.chatFriend) UI.drafts[SG.chatFriend] = el.value;
};
window.spKey = function (e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { var fine = false; try { fine = window.matchMedia('(pointer:fine)').matches; } catch (x) { } if (fine) { e.preventDefault(); spGameChatSend(); } }
};
window.spEmojiAdd = function (e) {
  var i = $('sxInput'); if (!i) return; var a = i.selectionStart == null ? i.value.length : i.selectionStart, b = i.selectionEnd == null ? a : i.selectionEnd;
  i.value = i.value.slice(0, a) + e + i.value.slice(b); try { i.setSelectionRange(a + e.length, a + e.length); } catch (x) { } spInp(i);
};
function sgSendMsg(fid, fields, preview) {
  var d = db(); if (!d || !S.uid || !fid) return Promise.resolve(false);
  var ref = d.collection('socialChats').doc(sgChatId(fid)), mref = ref.collection('messages').doc(), now = FV().serverTimestamp(), b = d.batch();
  b.set(ref, { participants: [S.uid, fid], updatedAt: now, lastMessage: String(preview || '').slice(0, 100), lastFrom: S.uid }, { merge: true });
  b.set(mref, Object.assign({ from: S.uid, to: fid, createdAt: now }, fields));
  UI.stick = true;
  return b.commit().then(function () { return true; }).catch(function () { snack('فشل الإرسال. تحقق من قواعد Firestore الخاصة بالشات.'); return false; });
}
window.spGameChatSend = function () {
  var inp = $('sxInput'), text = (inp && inp.value || '').trim(), fid = SG.chatFriend; if (!text || !fid) return;
  inp.value = ''; spInp(inp); UI.drafts[fid] = ''; closePanels();
  sgSendMsg(fid, { type: 'text', text: text.slice(0, 2000) }, text).then(function (ok) { if (!ok) { var i = $('sxInput'); if (i && !i.value && SG.chatFriend === fid) { i.value = text; spInp(i); } } });
};
function sgCompressImage(f) { return new Promise(function (res, rej) { var url = URL.createObjectURL(f), im = new Image(); im.onload = function () { try { var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, 1024 / Math.max(w, h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h); var q = .72, out = cv.toDataURL('image/jpeg', q); while (out.length > 380000 && q > .35) { q -= .1; out = cv.toDataURL('image/jpeg', q); } URL.revokeObjectURL(url); if (out.length > 480000) rej(new Error('big')); else res(out); } catch (e) { rej(e); } }; im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); }; im.src = url; }); }
function rmUpl(u) { var i = UI.upl.indexOf(u); if (i >= 0) UI.upl.splice(i, 1); chatRefresh(); }
window.spGameChatFile = function (inp) {
  var f = inp.files && inp.files[0]; inp.value = ''; var fid = SG.chatFriend; closePanels(); if (!f || !fid) return;
  var u = { kind: /^image\//.test(f.type || '') ? 'image' : 'file', name: f.name || 'ملف' };
  if (u.kind === 'image') {
    UI.upl.push(u); UI.stick = true; chatRefresh();
    sgCompressImage(f).then(function (dataUrl) { rmUpl(u); UI.stick = true; return sgSendMsg(fid, { type: 'image', text: '', img: dataUrl }, '📷 صورة'); }).catch(function () { rmUpl(u); snack('تعذّر تجهيز الصورة. جرّب صورة تانية.'); });
    return;
  }
  if (f.size > MAXFILE) { snack('الحد الأقصى للملف ' + fmtSize(MAXFILE)); return; }
  if (!f.size) { snack('الملف فاضي'); return; }
  UI.upl.push(u); UI.stick = true; chatRefresh();
  uploadFile(f, fid, u).then(function (info) { rmUpl(u); UI.stick = true; return sgSendMsg(fid, { type: 'file', text: '', fileId: info.id, fileName: f.name.slice(0, 120), fileSize: f.size, chunks: info.n }, '📎 ' + f.name.slice(0, 100)); })
    .catch(function () { rmUpl(u); snack('فشل رفع الملف. راجع الاتصال وقواعد Firestore.'); });
};
/* الملفات بتتخزّن مقسّمة جوه Firestore (من غير Firebase Storage) */
var MAXFILE = 8 * 1024 * 1024, CHUNK = 680000;
function fmtSize(n) { n = +n || 0; return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
function uploadFile(f, fid, u) {
  return new Promise(function (res, rej) {
    var fr = new FileReader(); fr.onerror = function () { rej(new Error('read')); };
    fr.onload = function () {
      var b64 = String(fr.result).split(',')[1] || '', n = Math.ceil(b64.length / CHUNK), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), cid = sgChatId(fid), d = db(), i = 0;
      (function next() {
        if (i >= n) { res({ id: id, n: n }); return; }
        u.prog = (i + 1) + '/' + n; chatRefresh();
        d.collection('socialChats').doc(cid).collection('blobs').doc(id + '_' + i).set({ from: S.uid, fid: id, idx: i, total: n, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) }).then(function () { i++; next(); }, rej);
      })();
    };
    fr.readAsDataURL(f);
  });
}
function blobIds(id, n) { var a = [], i; for (i = 0; i < n; i++) a.push(id + '_' + i); return a; }
window.spDownload = function (i) {
  var m = SG.chatItems[i]; if (!m || !m.fileId || !/^[A-Za-z0-9_-]{1,40}$/.test(m.fileId)) return; var d = db(), cid = sgChatId(SG.chatFriend), n = Math.min(+m.chunks || 1, 16);
  snack('⏳ جاري تحميل الملف...');
  Promise.all(blobIds(m.fileId, n).map(function (k) { return d.collection('socialChats').doc(cid).collection('blobs').doc(k).get(); })).then(function (ss) {
    var b64 = ss.map(function (s) { if (!s.exists) throw new Error('missing'); return s.data().data; }).join(''), bin = atob(b64), arr = new Uint8Array(bin.length), k;
    for (k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    var url = URL.createObjectURL(new Blob([arr], { type: 'application/octet-stream' })), a = document.createElement('a');
    a.href = url; a.download = String(m.fileName || 'file').replace(/[\\/:*?"<>|]/g, '_'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); snack('✅ تم تحميل الملف');
  }).catch(function () { snack('تعذّر تحميل الملف (ممكن يكون اتحذف)'); });
};
window.spMsgMenu = function (i) {
  if (Date.now() - (UI.menuAt || 0) < 700) return; UI.menuAt = Date.now();
  var m = SG.chatItems[i]; if (!m) return; var items = [];
  if (m.type === 'text' && m.text) items.push({ t: 'نسخ', ic: 'copy', f: function () { copyText(m.text); } });
  if (m.from === S.uid) items.push({ t: 'حذف الرسالة', ic: 'trash', danger: true, f: function () { if (!confirm('تحذف الرسالة دي؟')) return; var cc = db().collection('socialChats').doc(sgChatId(SG.chatFriend)); if (m.fileId && /^[A-Za-z0-9_-]{1,40}$/.test(m.fileId)) blobIds(m.fileId, Math.min(+m.chunks || 1, 16)).forEach(function (k) { cc.collection('blobs').doc(k).delete().catch(function () { }); }); cc.collection('messages').doc(m.id).delete().catch(function () { snack('تعذّر الحذف'); }); } });
  if (!items.length) return; actions(hhmm(ms(m.createdAt)) + ' · ' + dayLabel(ms(m.createdAt)), items);
};
window.spChatMenu = function () {
  var id = SG.chatFriend || curView().id; if (!id) return;
  actions(fname(id), [
    { t: 'معلومات الصديق', ic: 'user', f: function () { spProfile(id); } },
    { t: 'تحدّيه ⚔️', ic: 'swords', f: function () { spChallenge(id); } },
    { t: 'حذف الصديق', ic: 'trash', danger: true, f: function () { spRemove(id); } }
  ]);
};

/* ---------- صندوق الوارد: آخر رسالة + عدّاد غير المقروء ---------- */
function sgInboxStop() { if (SG.inboxUnsub) { try { SG.inboxUnsub(); } catch (e) { } } SG.inboxUnsub = null; SG.inboxFor = null; SG.inbox = {}; SG.inboxReady = false; }
function isViewingChat(cid) { var v = curView(); return UI.open && v.t === 'chat' && sgChatId(v.id) === cid && document.visibilityState === 'visible'; }
function sgInboxStart() {
  var d = db(); if (!d || !S.uid || SG.inboxFor === S.uid) return; sgInboxStop(); SG.inboxFor = S.uid; SG.unread = sgRead('chatUnread', {});
  try {
    SG.inboxUnsub = d.collection('socialChats').where('participants', 'array-contains', S.uid).onSnapshot(function (sn) {
      var fresh = {}, first = !SG.inboxReady, rm = sgChatReadMap();
      sn.forEach(function (x) { var v = x.data({ serverTimestamps: 'estimate' }); fresh[x.id] = { lastFrom: v.lastFrom || '', at: ms(v.updatedAt), last: v.lastMessage || '' }; });
      Object.keys(fresh).forEach(function (cid) {
        var o = SG.inbox[cid], f = fresh[cid], fid = cid.split('__')[0] === S.uid ? cid.split('__')[1] : cid.split('__')[0];
        if (!f.lastFrom || f.lastFrom === S.uid || isViewingChat(cid)) { SG.unread[cid] = 0; return; }
        var changed = first || !o || f.at > o.at;
        if (changed) { if (!first) toast('💬 ' + fname(f.lastFrom) + ': ' + String(f.last).slice(0, 40)); recountUnread(cid, fid); }
      });
      SG.inbox = fresh; SG.inboxReady = true; sgWrite('chatUnread', SG.unread); render();
    }, function () { SG.inboxReady = true; });
  } catch (e) { }
}

/* عدّاد غير المقروء الحقيقي: بيتحسب من السيرفر (وقت قراءتي المتزامن بين الأجهزة) فنفس الرقم يظهر على أي جهاز */
function recountUnread(cid, fid) {
  var d = db(); if (!d || !S.uid) return;
  d.collection('socialChats').doc(cid).collection('reads').doc(S.uid).get().then(function (s) {
    var sr = s.exists ? ms(s.data({ serverTimestamps: 'estimate' }).at) : 0, since = Math.max(sr, sgChatReadMap()[cid] || 0);
    return d.collection('socialChats').doc(cid).collection('messages').where('createdAt', '>', new Date(since)).orderBy('createdAt').limit(100).get().then(function (sn) {
      var n = 0; sn.forEach(function (x) { if (x.data().from === fid) n++; });
      if (isViewingChat(cid)) n = 0;
      if ((SG.unread[cid] || 0) !== n) { SG.unread[cid] = n; sgWrite('chatUnread', SG.unread); render(); }
    });
  }).catch(function () { });
}


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
window.spStart = function () {
  var n = ($('spNameIn').value || '').trim(); if (!n) { msg('اكتب اسمك الأول ✏️'); return; }
  LS.setItem('sp_name', n.slice(0, 20)); S.name = n.slice(0, 20); init().then(function () { render(true); });
  render(true);
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
window.spF = function (k, v) { if (S.form) S.form[k] = v; };
window.spR = function (i, k, v) { var r = S.form && S.form.rows[i]; if (!r) return; r[k] = v; if (k === 'k') { if ((v === 'focus' || v === 'count') && !r.n) r.n = v === 'focus' ? 60 : 3; render(true); } };
window.spRowAdd = function () { S.form.rows.push({ k: 'man', t: '', n: 0 }); render(true); };
window.spRowDel = function (i) { if (S.form.rows.length > 1) { S.form.rows.splice(i, 1); render(true); } };
window.spPick = function (id, on) { if (S.form) S.form.picks[id] = !!on; };
window.spTpl = function (i) {
  var t = TEMPLATES[i]; if (!S.form) S.form = newForm();
  S.form.title = t.t; S.form.rows = t.rows.map(function (r) { return { k: r.k, t: r.t || '', n: r.n || 0 }; }); render(true);
};
window.spChallenge = function (id) { S.form = newForm(); S.form.picks[id] = true; if (curView().t !== 'newduel') navPush({ t: 'newduel' }); else render(true); };
window.spRematch = function (id) {
  var d = duelById(id); if (!d) return;
  var f = newForm(); f.title = d.title + ' (جولة تانية)'; f.prize = d.prize || ''; f.days = Math.max(3, Math.min(30, Math.round((d.endsAt - d.createdAt) / DAY)));
  f.rows = d.tasks.map(function (t, i) { var k = taskKind(d, i); return { k: k.k, t: (k.k === 'focus' || k.k === 'count') ? '' : t, n: k.n || 0 }; });
  d.members.forEach(function (u) { if (u !== S.uid && S.friends[u]) f.picks[u] = true; });
  S.form = f; navPush({ t: 'newduel' });
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
  var names = {}, acc = {}, bs = {}; names[S.uid] = S.name; acc[S.uid] = now; bs[S.uid] = { f: totalFocusSec(), c: completedHistory.length, cd: sgDoneList().length, at: now };
  ids.forEach(function (i) { names[i] = fname(i); });
  db().collection('duels').add({ v: 2, title: title, tasks: tasksArr, tk: tk, prize: (f.prize || '').trim().slice(0, 60), members: [S.uid].concat(ids), names: names, acc: acc, bs: bs, cl: {}, done: {}, nd: {}, createdBy: S.uid, createdAt: now, endsAt: now + days * DAY })
    .then(function (ref) {
      var n = addLinkedTasks({ id: ref.id, tasks: tasksArr, tk: tk });
      S.form = null; msg('بدأ التحدي ⚔️' + (n ? ' — واتضافت ' + n + ' مهمة لقايمة مهامك 📌' : '')); goMain('comp', 'duels');
    }).catch(function () { msg('تعذّر إنشاء التحدي ⚠️'); });
};

/* قبول/انسحاب/تحفيز/ربط */
window.spAccept = function (id) {
  var d = duelById(id); if (!d) return; var now = Date.now();
  db().collection('duels').doc(id).update('acc.' + S.uid, now, 'bs.' + S.uid, { f: totalFocusSec(), c: completedHistory.length, cd: sgDoneList().length, at: now }).then(function () {
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
  spScanClose(); openAdd('code'); addByCode(c); return true;
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

/* ================== SOCIAL GAME EXPANSION v3 ==================
   Adds daily quests, XP/levels, badges, seasonal event, league and analytics.
   XP and reward claims are local-first; cloud chat uses the existing isolated social Firebase app.
*/
var SG = { chatFriend: '', chatUnsub: null, chatItems: [], chatBusy: false, chatLoading: false, inbox: {}, inboxReady: false, inboxUnsub: null, inboxFor: null, storageP: null, lastTab: {}, unread: {}, chatLimit: 40, chatMore: false, readAt: 0, myReadSent: 0, readUnsub: null };
/* completedHistory بيتسجّل فيه كل مرة تعلّم فيها مهمة كمكتملة (حتى لو لغيتها ورجعت علّمتها) — هنا بنحسب كل مهمة مرة واحدة في اليوم */
function sgDoneList() { var seen = {}, out = []; try { (completedHistory || []).forEach(function (h) { if (!h) return; var k = h.date ? sgDateKey(new Date(h.date)) : 'nd'; var u = (h.taskId != null ? h.taskId : (h.title || h.id)) + '|' + k; if (seen[u]) return; seen[u] = 1; out.push(h); }); } catch (e) { } return out; }
function sgDateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function sgRead(k, fallback) { try { var v = JSON.parse(LS.getItem('sp_game_' + k)); return v == null ? fallback : v; } catch(e) { return fallback; } }
function sgWrite(k, v) { try { LS.setItem('sp_game_' + k, JSON.stringify(v)); } catch(e) {} }
function sgLifetime() { var tasksN = sgDoneList().length, focusMin = Math.floor((typeof totalFocusSec === 'function' ? totalFocusSec() : 0) / 60), cur = Math.max(0, Number(typeof currentStreak !== 'undefined' ? currentStreak : 0) || 0), old = Number(sgRead('bestStreak', 0)) || 0, best = Math.max(old, cur); if (best > old) sgWrite('bestStreak', best); return { tasks: tasksN, focus: focusMin, streak: cur, best: best }; }
function sgLevel(xp) { var level=1, remain=Math.max(0,xp); while(level<100 && remain>=level*120){remain-=level*120;level++;} return {level:level, into:remain, next:level*120, pct:Math.min(100,Math.round(remain/(level*120)*100))}; }
function sgProgress() { var l=sgLifetime(), bonus=0, log=sgRead('questRewardLog',{}); Object.keys(log||{}).forEach(function(k){bonus+=Math.max(0,Number(log[k]&&log[k].xp)||0);}); var xp=l.tasks*10 + l.focus + Math.min(l.best,30)*15 + bonus; var lv=sgLevel(xp); return {xp:xp, bonus:bonus, level:lv, life:l}; }
function sgBadges() { var p=sgProgress(), l=p.life, out=[]; var defs=[
 {id:'first',e:'🌱',n:'أول خطوة',d:'أكمل أول مهمة',ok:l.tasks>=1}, {id:'ten',e:'🔟',n:'عشرة إنجازات',d:'أكمل 10 مهام',ok:l.tasks>=10}, {id:'fifty',e:'💥',n:'ماكينة إنجاز',d:'أكمل 50 مهمة',ok:l.tasks>=50}, {id:'hundred',e:'💯',n:'أسطورة المهام',d:'أكمل 100 مهمة',ok:l.tasks>=100}, {id:'focus60',e:'⏳',n:'ساعة تركيز',d:'اجمع 60 دقيقة تركيز',ok:l.focus>=60}, {id:'focus600',e:'🧠',n:'عقل فولاذي',d:'اجمع 600 دقيقة تركيز',ok:l.focus>=600}, {id:'streak3',e:'🔥',n:'شرارة الاستمرار',d:'سلسلة 3 أيام',ok:l.best>=3}, {id:'streak7',e:'🗓️',n:'أسبوع ثابت',d:'سلسلة 7 أيام',ok:l.best>=7}, {id:'level5',e:'🏅',n:'صاعد بقوة',d:'وصل للمستوى 5',ok:p.level.level>=5}, {id:'level10',e:'👑',n:'نخبة سأنجزها',d:'وصل للمستوى 10',ok:p.level.level>=10}
 ]; defs.forEach(function(b){if(b.ok)out.push(b);}); return {earned:out, total:defs.length, defs:defs}; }
function sgDayStats() { var today=sgDateKey(), tasksN=0, focus=0; try { sgDoneList().forEach(function(h){if(h.date && sgDateKey(new Date(h.date))===today)tasksN++;}); } catch(e){} try { if(typeof dailyFocusHistory!=='undefined') focus=Math.floor((dailyFocusHistory[today]||0)/60); }catch(e){} return {tasks:tasksN,focus:focus,streak:Math.max(0,Number(typeof currentStreak!=='undefined'?currentStreak:0)||0)}; }
function sgQuests() { var d=sgDayStats(), day=sgDateKey(), claims=sgRead('questClaims',{}), qs=[
 {id:'task1',e:'✅',n:'بداية قوية',d:'أنجز مهمة واحدة اليوم',cur:Math.min(d.tasks,1),goal:1,xp:25},
 {id:'task3',e:'🎯',n:'ثلاثية الإنجاز',d:'أنجز 3 مهام اليوم',cur:Math.min(d.tasks,3),goal:3,xp:45},
 {id:'focus25',e:'⏱️',n:'جلسة تركيز',d:'اجمع 25 دقيقة تركيز اليوم',cur:Math.min(d.focus,25),goal:25,xp:35},
 {id:'focus60',e:'🧠',n:'ساعة لنفسك',d:'اجمع 60 دقيقة تركيز اليوم',cur:Math.min(d.focus,60),goal:60,xp:60},
 {id:'streak',e:'🔥',n:'حافظ على السلسلة',d:'حافظ على سلسلتك بنشاط واحد على الأقل اليوم',cur:(d.streak>0&&(d.tasks>0||d.focus>0))?1:0,goal:1,xp:20}
 ]; qs.forEach(function(q){q.claimed=claims[day+'_'+q.id]===1;q.ready=q.cur>=q.goal;}); return qs; }
function sgSeason() { var now=new Date(), m=now.getMonth(), name, emoji, color, sy=(m<=1?now.getFullYear()-1:now.getFullYear()), sm=((m===11||m<=1)?11:Math.floor((m-2)/3)*3+2), start=new Date(sy,sm,1), end=new Date(sy,sm+3,0), seasonTasks=0, seasonFocus=0; if(m===11||m<=1){name='شتاء الأبطال';emoji='❄️';color='#67b7eb';} else if(m<=4){name='ربيع الانطلاقة';emoji='🌸';color='#56c596';} else if(m<=7){name='صيف التحدي';emoji='☀️';color='#f4b942';} else {name='خريف الأساطير';emoji='🍂';color='#ef8b52';} try{sgDoneList().forEach(function(h){if(h.date){var d=new Date(h.date);if(d>=start&&d<new Date(end.getFullYear(),end.getMonth(),end.getDate()+1))seasonTasks++;}});}catch(e){} try{if(typeof dailyFocusHistory!=='undefined')Object.keys(dailyFocusHistory).forEach(function(k){var d=new Date(k+'T00:00:00');if(d>=start&&d<new Date(end.getFullYear(),end.getMonth(),end.getDate()+1))seasonFocus+=Math.floor((dailyFocusHistory[k]||0)/60);});}catch(e){} var p=sgProgress(), daily=sgDayStats(); return {name:name,emoji:emoji,color:color,from:sgDateKey(start),to:sgDateKey(end),xp:p.xp,level:p.level.level,tasks:daily.tasks,focus:daily.focus,seasonTasks:seasonTasks,seasonFocus:seasonFocus}; }
function sgLeagueRows() { var m = mine(), mp = sgProgress(), rows = [{ id: S.uid, name: S.name || 'أنت', pts: m.pts, lv: mp.level.level, me: true }]; Object.keys(S.friends).forEach(function (id) { var p = S.fp[id] && S.fp[id].data; if (p && p.hidden) return; rows.push({ id: id, name: (p && p.name) || fname(id), pts: (p && p.week === m.week) ? (p.pts || 0) : 0, lv: (p && p.gameLevel) || 0 }); }); rows.sort(function (a, b) { return (b.pts - a.pts) || ((b.lv || 0) - (a.lv || 0)); }); return rows; }
function sgAnalyticsHtml() { var l=sgLifetime(), p=sgProgress(), s=sgDayStats(), week=mine(), days=[], today=new Date(); for(var i=6;i>=0;i--){var d=new Date(today);d.setDate(today.getDate()-i);var key=sgDateKey(d), n=0;try{sgDoneList().forEach(function(h){if(h.date&&sgDateKey(new Date(h.date))===key)n++;});}catch(e){} days.push({key:key,n:n,label:['أح','إث','ث','أر','خ','ج','س'][d.getDay()]});} var max=Math.max(1,...days.map(function(x){return x.n;})); var h='<div class="sg-hero"><div class="sg-eyebrow">لوحة القيادة الشخصية</div><div class="sg-big">📊 تحليلك بالأرقام</div><div class="sg-sub">الأرقام مستخرجة من سجل التطبيق المتاح، مش من ضغط أزرار شكلية.</div></div>';
 h+='<div class="sg-grid"><div class="sg-stat"><span>⚡ XP</span><b>'+p.xp.toLocaleString('en-US')+'</b><small>نقاط الخبرة</small></div><div class="sg-stat"><span>🏅 المستوى</span><b>'+p.level.level+'</b><small>من 100</small></div><div class="sg-stat"><span>✅ المهام</span><b>'+l.tasks+'</b><small>إجمالي مكتمل</small></div><div class="sg-stat"><span>⏱️ التركيز</span><b>'+Math.floor(l.focus/60)+'س '+(l.focus%60)+'د</b><small>إجمالي الدقائق</small></div></div>';
 h+=card('<div class="sg-row"><b>📅 آخر 7 أيام</b><span class="sg-muted">معدل '+(days.reduce(function(a,x){return a+x.n;},0)/7).toFixed(1)+' مهمة/يوم</span></div><div class="sg-chart">'+days.map(function(x){return '<div class="sg-chart-col"><b>'+x.n+'</b><div class="sg-chart-track"><i style="height:'+Math.max(x.n?8:2,Math.round(x.n/max*100))+'%"></i></div><small>'+x.label+'</small></div>';}).join('')+'</div>');
 h+=card('<div class="sg-row"><b>🎯 ملخص الأسبوع</b><b>'+week.pts+' نقطة</b></div><div class="sg-muted">'+week.t+' مهمة مكتملة · '+week.f+' دقيقة تركيز · سلسلة '+s.streak+' يوم</div><div class="sg-progress"><i style="width:'+p.level.pct+'%"></i></div><div class="sg-muted">المستوى '+p.level.level+' — '+p.level.into+' / '+p.level.next+' XP للمستوى التالي</div>'); return h; }
function sgHomeHtml() { var p=sgProgress(), q=sgQuests(), season=sgSeason(), rows=sgLeagueRows(), rank=rows.findIndex(function(x){return x.me;})+1, b=sgBadges(); var h='<div class="sg-hero"><div class="sg-eyebrow">سأنجزها · Social RPG</div><div class="sg-big">أهلاً يا '+esc(S.name||'بطل')+' 👋</div><div class="sg-sub">كل مهمة بتقربك من مستواك الجاي. العب بذكاء، نافس أصحابك، وحافظ على الاستمرار.</div><div class="sg-level"><div class="sg-level-icon">'+(p.level.level>=10?'👑':p.level.level>=5?'🏆':'⚔️')+'</div><div class="sg-level-info"><div class="sg-row"><b>المستوى '+p.level.level+'</b><b>'+p.xp.toLocaleString('en-US')+' XP</b></div><div class="sg-progress"><i style="width:'+p.level.pct+'%"></i></div><small>'+p.level.into+' / '+p.level.next+' XP للمستوى التالي</small></div></div></div>';
 h+='<div class="sg-grid"><div class="sg-stat"><span>🔥 السلسلة</span><b>'+p.life.streak+'</b><small>يوم متواصل</small></div><div class="sg-stat"><span>🏆 ترتيبك</span><b>#'+(rank||1)+'</b><small>بينك وبين أصدقائك</small></div><div class="sg-stat"><span>🎖️ أوسمتك</span><b>'+b.earned.length+'</b><small>من '+b.total+'</small></div><div class="sg-stat"><span>⚔️ التحديات</span><b>'+S.duels.filter(function(d){return Date.now()<d.endsAt&&accepted(d,S.uid);}).length+'</b><small>نشطة</small></div></div>';
 h+='<div class="sg-section-title">🎯 مهماتك اليومية <span class="sg-muted">تتجدد كل يوم</span></div>'; h+=q.map(function(x){return '<div class="sg-quest"><div class="sg-quest-emoji">'+x.e+'</div><div class="sg-quest-info"><b>'+x.n+'</b><small>'+x.d+'</small><div class="sg-progress"><i style="width:'+Math.min(100,Math.round(x.cur/x.goal*100))+'%"></i></div><small>'+x.cur+' / '+x.goal+' · مكافأة '+x.xp+' XP</small></div><button class="sg-claim" '+(!x.ready||x.claimed?'disabled':'')+' onclick="spGameClaim(\''+x.id+'\')">'+(x.claimed?'تمت ✓':x.ready?'استلم':'واصل')+'</button></div>';}).join('');
 h+='<div class="sg-season" style="--sg-season:'+season.color+'"><div class="sg-row"><b>'+season.emoji+' الحدث الموسمي: '+season.name+'</b><span class="sg-chip">مباشر</span></div><p>مهمة الموسم: أكمل 20 مهمة خلال الموسم الحالي لتحصل على مكافأة '+250+' XP. التقدم من سجل المهام الفعلي.</p><div class="sg-grid sg-grid-three"><div><b>'+season.xp+'</b><small>XP إجمالي</small></div><div><b>'+season.seasonTasks+' / 20</b><small>مهام الموسم</small></div><div><b>'+season.seasonFocus+' د</b><small>تركيز الموسم</small></div></div><div class="sg-progress"><i style="width:'+Math.min(100,Math.round(season.seasonTasks/20*100))+'%"></i></div><button class="sg-claim" '+(season.seasonTasks<20||sgRead('seasonClaims',{})[season.from]?'disabled':'')+' onclick="spGameClaimSeason()">'+(sgRead('seasonClaims',{})[season.from]?'مكافأة الموسم مستلمة ✓':season.seasonTasks>=20?'استلم 250 XP':'واصل التقدم')+'</button></div>';
 if(b.earned.length)h+='<div class="sg-section-title">🎖️ أحدث أوسمتك</div><div class="sg-badges">'+b.earned.slice(-4).map(function(x){return '<div class="sg-badge"><span>'+x.e+'</span><b>'+x.n+'</b></div>';}).join('')+'</div>';
 return h; }
function sgQuestsHtml() { var q=sgQuests(), h='<div class="sg-hero"><div class="sg-big">🎯 مركز المهمات</div><div class="sg-sub">مكافآت المهمات لا تُمنح إلا بعد تحقق الشرط من بيانات التطبيق، وكل مهمة يمكن استلامها مرة واحدة في اليوم.</div></div>'; return h+q.map(function(x){return '<div class="sg-quest"><div class="sg-quest-emoji">'+x.e+'</div><div class="sg-quest-info"><b>'+x.n+'</b><small>'+x.d+'</small><div class="sg-progress"><i style="width:'+Math.min(100,Math.round(x.cur/x.goal*100))+'%"></i></div><small>'+x.cur+' / '+x.goal+' · '+x.xp+' XP</small></div><button class="sg-claim" '+(!x.ready||x.claimed?'disabled':'')+' onclick="spGameClaim(\''+x.id+'\')">'+(x.claimed?'تمت ✓':x.ready?'استلم':'واصل')+'</button></div>';}).join(''); }
function sgLeagueHtml() { var rows=sgLeagueRows(), me=sgProgress(), h='<div class="sg-hero"><div class="sg-big">🏆 دوري الأصدقاء</div><div class="sg-sub">دوري أسبوعي يتجدد السبت. الترتيب الحالي يعتمد على نقاط الأسبوع الفعلية في التطبيق.</div><div class="sg-level"><div class="sg-level-icon">🏆</div><div class="sg-level-info"><b>مجموعتك الحالية · '+rows.length+' لاعب</b><small>هدفك: ارفع نقاطك وتجاوز اللاعب اللي فوقك.</small></div></div></div>'; h+=rows.map(function(x,i){return '<div class="sg-league-row '+(x.me?'sg-me':'')+'"><div class="sg-rank">'+(['🥇','🥈','🥉'][i]||(i+1))+'</div><div class="sg-league-name"><b>'+esc(x.name)+(x.me?' (أنت)':'')+'</b><small>'+(i===0?'متصدر الدوري':i===1?'مطارد الصدارة':'منافس في الدوري')+(x.lv?' · المستوى '+x.lv:'')+'</small></div><b>'+x.pts+' نقطة</b></div>';}).join(''); h+='<div class="sg-muted">ملاحظة: الترتيب بنقاط الأسبوع، والمستوى المعروض هو اللي نشره كل لاعب من جهازه. الأوسمة شخصية.</div>'; return h; }
function sgBadgesHtml() { var b=sgBadges(), p=sgProgress(), h='<div class="sg-hero"><div class="sg-big">🎖️ قاعة الأوسمة</div><div class="sg-sub">كل وسام مرتبط بإنجاز من سجل مهامك أو وقت تركيزك.</div><b>'+b.earned.length+' / '+b.total+' أوسمة · المستوى '+p.level.level+'</b></div><div class="sg-badges sg-badges-all">'; b.defs.forEach(function(x){h+='<div class="sg-badge '+(x.ok?'sg-badge-earned':'sg-badge-locked')+'"><span>'+x.e+'</span><b>'+x.n+'</b><small>'+x.d+'</small><i>'+(x.ok?'تم فتحه ✓':'🔒 مقفول')+'</i></div>';}); return h+'</div>'; }
function sgSafeId(id) { return /^[A-Za-z0-9_-]{1,128}$/.test(String(id)) ? String(id) : ''; }
function sgSafeUrl(u) { u = String(u || ''); return /^https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9.-]+\.firebasestorage\.app)\//i.test(u) ? u : ''; }
function sgSafeImg(u) { u = String(u || ''); return (u.length < 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(u)) ? u : ''; }
function sgChatId(uid) { return [String(S.uid), String(uid)].sort().join('__'); }

window.spGameClaim=function(id){var q=sgQuests().filter(function(x){return x.id===id;})[0];if(!q||!q.ready||q.claimed){toast('المهمة لسه ما اكتملتش أو استلمت مكافأتها');return;}var claims=sgRead('questClaims',{}),key=sgDateKey()+'_'+id;claims[key]=1;sgWrite('questClaims',claims);var rewards=sgRead('questRewardLog',{});rewards[key]={xp:q.xp,at:Date.now()};sgWrite('questRewardLog',rewards);toast('🎁 استلمت مكافأة المهمة! +'+q.xp+' XP');render(true);};
window.spGameClaimSeason=function(){var s=sgSeason(),claims=sgRead('seasonClaims',{});if(s.seasonTasks<20||claims[s.from]){toast('مهمة الموسم لسه ما اكتملتش أو استلمت المكافأة');return;}claims[s.from]=1;sgWrite('seasonClaims',claims);var rewards=sgRead('questRewardLog',{});rewards['season_'+s.from]={xp:250,at:Date.now()};sgWrite('questRewardLog',rewards);toast('🏅 مكافأة الموسم! +250 XP');render(true);};

setTimeout(function () {
  css();
  if (LS.getItem('sp_pending')) { spOpen(); }
  else if (LS.getItem('sp_on') === '1') init();
}, 2500);
})();
