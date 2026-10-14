(function () {
var LS = localStorage, $ = function (i) { return document.getElementById(i); };
var S = { uid: null, name: '', code: '', friends: {}, fp: {}, duels: [], unsubs: [], tab: 'rank', err: '', booting: false };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
/* تطبيق Firebase ثانوي ("social") — هوية الأصدقاء المجهولة معزولة تمامًا عن حساب الإيميل بتاع النسخ الاحتياطي */
function sapp() {
  if (S.app) return S.app;
  if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') return null;
  try { S.app = firebase.app('social'); } catch (e) { S.app = firebase.initializeApp(firebaseConfig, 'social'); }
  return S.app;
}
function db() { try { if (!S.db) { var a = sapp(); if (a) S.db = a.firestore(); } return S.db || null; } catch (e) { return null; } }
function sauth() { try { var a = sapp(); return a ? a.auth() : null; } catch (e) { return null; } }
function whenUser(a) {
  return new Promise(function (res, rej) {
    var un = a.onAuthStateChanged(function (u) {
      try { un(); } catch (e) { }
      if (u) res(u); else a.signInAnonymously().then(function (c) { res(c.user); }, rej);
    }, rej);
  });
}
function msg(t) { var m = $('spMsg'); if (m) m.innerText = t || ''; }
function wkStart() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return d; }
function mine() {
  var ws = wkStart(), t = 0, f = 0, k;
  completedHistory.forEach(function (h) { if (h.date && new Date(h.date) >= ws) t++; });
  for (k in dailyFocusHistory) { if (new Date(k + 'T00:00:00') >= ws) f += dailyFocusHistory[k]; }
  f = Math.round(f / 60);
  return { t: t, f: f, pts: t * 10 + f + Math.min(currentStreak || 0, 7) * 5, week: getDateKey(ws) };
}
function fail(e) {
  var c = (e && (e.code || e.message)) || 'unknown';
  S.err = (c === 'permission-denied' || /auth\//.test(c)) ? 'الخدمة مش جاهزة حاليًا، حاول بعد شوية ⚠️ (' + c + ')' : 'مفيش اتصال أو حصل خطأ، حاول تاني ⚠️';
  S.booting = false; render();
}
function gen() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', i; for (i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
function fname(id) { var p = S.fp[id]; return (p && p.data && p.data.name) || (S.friends[id] && S.friends[id].name) || 'صديق'; }

function init() {
  var a = sauth();
  if (!a || !db()) { S.err = 'خدمة Firebase مش متاحة دلوقتي ⚠️'; render(); return Promise.resolve(); }
  if (S.booting) return Promise.resolve();
  S.booting = true; S.err = '';
  var p = whenUser(a);
  return p.then(function (u) { if (S.uid === u.uid && S.code) { S.booting = false; return; } teardown(); S.uid = u.uid; return boot(); }).catch(fail);
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
  }).then(function () { LS.setItem('sp_on', '1'); S.booting = false; listen(); push(true); render(); }).catch(fail);
}
function teardown() {
  S.unsubs.forEach(function (u) { try { u(); } catch (e) { } }); S.unsubs = [];
  Object.keys(S.fp).forEach(function (k) { try { S.fp[k].u && S.fp[k].u(); } catch (e) { } }); S.fp = {}; S.friends = {}; S.duels = [];
  if (S.timer) clearInterval(S.timer); S.code = '';
}
function listen() {
  var d = db();
  S.unsubs.push(d.collection('profiles').doc(S.uid).collection('friends').onSnapshot(function (sn) {
    var cur = {}; sn.forEach(function (x) { cur[x.id] = x.data(); });
    Object.keys(S.fp).forEach(function (k) { if (!cur[k]) { try { S.fp[k].u && S.fp[k].u(); } catch (e) { } delete S.fp[k]; } });
    Object.keys(cur).forEach(function (k) {
      if (S.fp[k]) return;
      S.fp[k] = { data: null };
      S.fp[k].u = d.collection('profiles').doc(k).onSnapshot(function (s) { S.fp[k].data = s.exists ? s.data() : null; render(); }, function () { });
    });
    S.friends = cur; render();
  }, fail));
  S.unsubs.push(d.collection('duels').where('members', 'array-contains', S.uid).onSnapshot(function (sn) {
    S.duels = sn.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    render();
  }, fail));
  S.timer = setInterval(function () { push(false); }, 30000);
}
function push(force) {
  if (!S.uid || !S.code || !db()) return;
  var m = mine(), h = LS.getItem('sp_hide') === '1';
  var data = { name: S.name, week: m.week, pts: h ? null : m.pts, tasks: h ? null : m.t, focus: h ? null : m.f, streak: h ? null : (currentStreak || 0), hidden: h, updatedAt: Date.now() };
  var sig = JSON.stringify([data.name, data.week, data.pts, data.tasks, data.focus, data.streak, data.hidden]);
  if (!force && sig === S.sig) return;
  S.sig = sig; db().collection('profiles').doc(S.uid).set(data, { merge: true }).catch(function () { S.sig = null; });
}

/* ---------- الواجهة ---------- */
function card(inner) { return '<div style="background:var(--input-bg);border:1px solid var(--card-border);border-radius:12px;padding:10px;margin:8px 0;text-align:right;">' + inner + '</div>'; }
function rankHtml() {
  var m = mine(), rows = [{ id: S.uid, name: S.name + ' (أنت)', pts: m.pts, t: m.t, f: m.f, s: currentStreak || 0, me: true }];
  Object.keys(S.friends).forEach(function (id) {
    var p = S.fp[id] && S.fp[id].data;
    if (!p) { rows.push({ id: id, name: fname(id), pts: 0, none: true }); return; }
    if (p.hidden) rows.push({ id: id, name: p.name, pts: -1, hid: true });
    else if (p.week !== m.week) rows.push({ id: id, name: p.name, pts: 0, t: 0, f: 0, s: p.streak || 0 });
    else rows.push({ id: id, name: p.name, pts: p.pts || 0, t: p.tasks || 0, f: p.focus || 0, s: p.streak || 0 });
  });
  rows.sort(function (a, b) { return b.pts - a.pts; });
  var med = ['🥇', '🥈', '🥉'], left = Math.max(0, Math.ceil((wkStart().getTime() + 7 * 864e5 - Date.now()) / 864e5));
  var h = '<div class="settings-section-desc">الترتيب الأسبوعي (بيتصفّر كل سبت) — باقي ' + left + ' يوم. المهمة = 10 نقاط، دقيقة تركيز = نقطة، وكل يوم streak (لحد 7) = 5 نقاط.</div>';
  rows.forEach(function (r, i) {
    var line = r.hid ? '🙈 مخفي إحصائياته' : r.none ? '—' : '✅ ' + r.t + ' مهمة · ⏱ ' + r.f + ' د · 🔥 ' + r.s;
    h += card('<div style="display:flex;justify-content:space-between;align-items:center;' + (r.me ? 'color:var(--accent);' : '') + '"><b>' + (med[i] || (i + 1) + '.') + ' ' + esc(r.name) + '</b><b>' + (r.pts < 0 ? '' : r.pts + ' نقطة') + '</b></div><div style="font-size:.75rem;opacity:.8;margin-top:4px;">' + line + '</div>');
  });
  if (rows.length === 1) h += '<div class="settings-section-desc">لسه مفيش أصدقاء — من تاب "الأصدقاء" أضف صاحبك بالكود.</div>';
  return h;
}
function friendsHtml() {
  var h = card('<div style="font-size:.8rem;opacity:.8;">كودك — ابعته لصحابك:</div><div style="font-family:monospace;font-size:1.6rem;letter-spacing:4px;text-align:center;color:var(--accent);margin:6px 0;">' + esc(S.code) + '</div><div style="display:flex;gap:6px;"><button class="btn btn-secondary" style="flex:1;" onclick="spCopy()">📋 نسخ</button><button class="btn btn-secondary" style="flex:1;" onclick="spShare()">📤 مشاركة</button></div>');
  h += '<div class="task-options-row"><input type="text" id="spCodeIn" maxlength="6" placeholder="اكتب كود صاحبك" autocomplete="off" style="text-align:center;font-family:monospace;text-transform:uppercase;"></div><button class="btn" style="width:100%;margin-top:6px;" onclick="spAdd()">➕ إضافة صديق</button>';
  var ids = Object.keys(S.friends);
  h += '<div style="margin:12px 0 2px;font-weight:700;opacity:.8;">أصدقائي (' + ids.length + ')</div>';
  ids.forEach(function (id) { h += card('<div style="display:flex;justify-content:space-between;align-items:center;"><span>👤 ' + esc(fname(id)) + '</span><button class="btn btn-secondary" style="padding:4px 10px;font-size:.75rem;" onclick="spRemove(\'' + id + '\')">حذف</button></div>'); });
  var hid = LS.getItem('sp_hide') === '1';
  h += '<div style="margin-top:12px;display:flex;gap:6px;"><button class="btn btn-secondary" style="flex:1;" onclick="spName()">✏️ اسمي: ' + esc(S.name) + '</button><button class="btn btn-secondary" style="flex:1;" onclick="spHide()">' + (hid ? '👁 إظهار إحصائياتي' : '🙈 إخفاء إحصائياتي') + '</button></div>';
  return h;
}
function duelsHtml() {
  var h = '<button class="btn" style="width:100%;" onclick="spToggleForm()">⚔️ تحدي جديد</button><div id="spForm" style="display:none;">';
  var ids = Object.keys(S.friends);
  if (!ids.length) h += '<div class="settings-section-desc">أضف أصدقاء الأول من تاب "الأصدقاء".</div>';
  else {
    h += '<div class="task-options-row"><input type="text" id="spDT" placeholder="اسم التحدي (مثلًا: مذاكرة الأسبوع)" style="text-align:center;"></div><textarea id="spDK" rows="4" placeholder="المهام المشتركة، كل مهمة في سطر" style="width:100%;margin-top:6px;border-radius:10px;padding:8px;background:var(--input-bg);color:var(--text-primary,inherit);border:1px solid var(--card-border);"></textarea><div style="text-align:right;margin:6px 0;font-size:.85rem;">مين يشارك؟</div>';
    ids.forEach(function (id) { h += '<label style="display:block;text-align:right;padding:3px 0;"><input type="checkbox" class="spPick" value="' + id + '"> ' + esc(fname(id)) + '</label>'; });
    h += '<button class="btn" style="width:100%;margin-top:6px;" onclick="spMkDuel()">🚀 ابدأ التحدي (7 أيام)</button>';
  }
  h += '</div>';
  if (!S.duels.length) h += '<div class="settings-section-desc" style="margin-top:10px;">مفيش تحديات لسه. اعمل مهام مشتركة مع صحابك ومين يخلّص أكتر يكسب 🏆</div>';
  S.duels.forEach(function (d) {
    var done = d.done || {}, over = Date.now() > d.endsAt, sc = d.members.map(function (u) { return { u: u, n: (done[u] || []).length }; }).sort(function (a, b) { return b.n - a.n; });
    var tot = d.tasks.length, win = over && sc[0].n > 0 && (!sc[1] || sc[0].n > sc[1].n) ? sc[0].u : null;
    var inner = '<div style="display:flex;justify-content:space-between;"><b>⚔️ ' + esc(d.title) + '</b><span style="font-size:.72rem;opacity:.8;">' + (over ? 'انتهى' : 'باقي ' + Math.max(1, Math.ceil((d.endsAt - Date.now()) / 864e5)) + ' يوم') + '</span></div>';
    sc.forEach(function (x) { var nm = x.u === S.uid ? 'أنت' : ((d.names && d.names[x.u]) || fname(x.u)); inner += '<div style="font-size:.8rem;margin-top:6px;">' + (win === x.u ? '🏆 ' : '') + esc(nm) + ' — ' + x.n + '/' + tot + '<div style="height:6px;border-radius:4px;background:var(--card-border);"><div style="height:6px;border-radius:4px;width:' + Math.round(x.n / tot * 100) + '%;background:var(--accent);"></div></div></div>'; });
    var my = done[S.uid] || [];
    d.tasks.forEach(function (t, i) {
      var ok = my.indexOf(i) >= 0;
      inner += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:.85rem;"><span style="' + (ok ? 'text-decoration:line-through;opacity:.6;' : '') + '">' + esc(t) + '</span>' + (ok || over ? (ok ? '✅' : '') : '<button class="btn btn-secondary" style="padding:3px 10px;font-size:.72rem;" onclick="spDone(\'' + d.id + '\',' + i + ')">أنجزتها</button>') + '</div>';
    });
    if (d.createdBy === S.uid) inner += '<div style="text-align:left;margin-top:6px;"><button class="btn btn-secondary" style="padding:3px 10px;font-size:.72rem;" onclick="spDelDuel(\'' + d.id + '\')">🗑 حذف التحدي</button></div>';
    h += card(inner);
  });
  return h;
}
function render() {
  var body = $('spBody'); if (!body || $('spModal').style.display !== 'flex') return;
  ['rank', 'friends', 'duels'].forEach(function (t) { var b = $('spTab-' + t); if (b) b.classList.toggle('active', t === S.tab); });
  var keep = ($('spCodeIn') || {}).value, f = $('spForm') && $('spForm').style.display === 'block';
  if (!S.code) {
    body.innerHTML = (S.err ? '<div class="settings-section-desc" style="color:#c0392b;">' + esc(S.err) + '</div>' : '') +
      '<div class="settings-section-desc">نافس صحابك على المهام والتركيز. الأصدقاء بيشوفوا أرقامك بس (نقاط، مهام منجزة، دقايق تركيز، streak) — مش عناوين مهامك ولا ملاحظاتك، وتقدر تخفيها في أي وقت.</div>' +
      '<div class="task-options-row"><input type="text" id="spNameIn" placeholder="اسمك اللي هيظهر لأصحابك" value="' + esc(LS.getItem('sp_name') || LS.getItem('app_ai_user_name') || '') + '" style="text-align:center;"></div>' +
      '<button class="btn" style="width:100%;margin-top:6px;" onclick="spStart()">' + (S.booting ? '⏳ جاري التجهيز...' : '🚀 ابدأ') + '</button>';
    return;
  }
  body.innerHTML = (S.err ? '<div class="settings-section-desc" style="color:#c0392b;">' + esc(S.err) + '</div>' : '') + (S.tab === 'rank' ? rankHtml() : S.tab === 'friends' ? friendsHtml() : duelsHtml());
  if (keep && $('spCodeIn')) $('spCodeIn').value = keep;
  if (f && $('spForm')) $('spForm').style.display = 'block';
}

/* ---------- الأوامر ---------- */
window.spOpen = function () { $('spModal').style.display = 'flex'; S.tab = 'rank'; msg(''); render(); if (LS.getItem('sp_on') === '1' && !S.code) init(); };
window.spClose = function () { $('spModal').style.display = 'none'; };
window.spTab = function (t) { S.tab = t; msg(''); render(); };
window.spStart = function () {
  var n = ($('spNameIn').value || '').trim(); if (!n) { msg('اكتب اسمك الأول ✏️'); return; }
  LS.setItem('sp_name', n); S.name = n; init().then(function () { render(); });
  render();
};
window.spName = function () {
  var n = prompt('اسمك اللي هيظهر لأصحابك:', S.name); if (!n || !n.trim()) return;
  S.name = n.trim().slice(0, 20); LS.setItem('sp_name', S.name); push(true); render();
};
window.spHide = function () { LS.setItem('sp_hide', LS.getItem('sp_hide') === '1' ? '0' : '1'); push(true); render(); };
window.spCopy = function () { try { navigator.clipboard.writeText(S.code); msg('اتنسخ الكود ✅'); } catch (e) { msg(S.code); } };
window.spShare = function () {
  var t = 'تعالى نتنافس على "سأنجزها" 💪 كودي: ' + S.code + '\nhttps://abdullah1fr.github.io/massr/';
  if (navigator.share) navigator.share({ text: t }).catch(function () { }); else { try { navigator.clipboard.writeText(t); msg('اتنسخت رسالة الدعوة ✅'); } catch (e) { msg(t); } }
};
window.spAdd = function () {
  var c = (($('spCodeIn').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')), d = db();
  if (c.length !== 6) { msg('الكود 6 حروف/أرقام'); return; }
  if (c === S.code) { msg('ده كودك إنت 😄'); return; }
  msg('جاري البحث...');
  d.collection('codes').doc(c).get().then(function (s) {
    if (!s.exists) { msg('الكود غلط ⚠️'); return; }
    var fu = s.data().uid; if (S.friends[fu]) { msg('هو صاحبك بالفعل'); return; }
    return d.collection('profiles').doc(fu).collection('friends').doc(S.uid).set({ name: S.name, at: Date.now() })
      .then(function () { return d.collection('profiles').doc(S.uid).collection('friends').doc(fu).set({ name: 'صديق', at: Date.now() }); })
      .then(function () { msg('تمت الإضافة ✅'); $('spCodeIn').value = ''; });
  }).catch(function (e) { msg('تعذّرت الإضافة ⚠️'); });
};
window.spRemove = function (id) {
  if (!confirm('تحذف الصديق ده؟')) return;
  var d = db(); d.collection('profiles').doc(S.uid).collection('friends').doc(id).delete()
    .then(function () { return d.collection('profiles').doc(id).collection('friends').doc(S.uid).delete(); }).catch(function () { });
};
window.spToggleForm = function () { var f = $('spForm'); if (f) f.style.display = f.style.display === 'block' ? 'none' : 'block'; };
window.spMkDuel = function () {
  var title = ($('spDT').value || '').trim() || 'تحدي', tasks = ($('spDK').value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 30);
  var ids = Array.prototype.map.call(document.querySelectorAll('.spPick:checked'), function (x) { return x.value; });
  if (!tasks.length) { msg('اكتب مهمة واحدة على الأقل'); return; }
  if (!ids.length) { msg('اختار صديق واحد على الأقل'); return; }
  var names = {}; names[S.uid] = S.name; ids.forEach(function (i) { names[i] = fname(i); });
  db().collection('duels').add({ title: title, tasks: tasks, members: [S.uid].concat(ids), names: names, done: {}, createdBy: S.uid, createdAt: Date.now(), endsAt: Date.now() + 7 * 864e5 })
    .then(function () { msg('بدأ التحدي ⚔️'); }).catch(function () { msg('تعذّر إنشاء التحدي ⚠️'); });
};
window.spDone = function (id, i) {
  db().collection('duels').doc(id).update('done.' + S.uid, firebase.firestore.FieldValue.arrayUnion(i)).catch(function () { msg('تعذّر التسجيل ⚠️'); });
};
window.spDelDuel = function (id) { if (confirm('تحذف التحدي للكل؟')) db().collection('duels').doc(id).delete().catch(function () { }); };
setTimeout(function () { if (LS.getItem('sp_on') === '1') init(); }, 4000);
})();
