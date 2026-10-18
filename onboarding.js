/* ===== onboarding.js — شاشة البداية الإجبارية (سأنجزها) =====
   الدخول بإيميل أو جوجل (إجباري) ← الاسم (كلمتين على الأقل) ← الصورة (اختيارية) ← قفل التطبيق (اختياري).
   هوية واحدة لكل مستخدم: حساب Firebase الرئيسي هو نفسه المنافسة والأصدقاء والـ AI.
   الملف منفصل: لو ما اتحمّلش التطبيق بيشتغل عادي (index بيتعامل مع window.__onbPending بـ typeof).
   بيتربط في index بسطر واحد قبل social.js. */
(function () {
  'use strict';
  if (window.__onbV1) return; window.__onbV1 = 1;

  var LS = localStorage, DONE = 'app_onb_done', OWNER = 'app_data_owner', FRESH = 'app_onb_fresh';
  var gateOpen = true;      /* true من أول لحظة لحد ما الشاشة تتقفل: social.js مش بيشغّل حاجة وقتها */
  var phase = 'splash';     /* splash | auth | data | name | photo | lock */
  var tempBypass = false, ctx = { user: null, fresh: false, busy: false };
  var root = null;

  window.__onbPending = function () { return gateOpen; };

  /* ---------- أدوات صغيرة ---------- */
  function A() { try { return (typeof fbAuth !== 'undefined' && fbAuth) ? fbAuth : null; } catch (e) { return null; } }
  function D() { try { return (typeof fbDb !== 'undefined' && fbDb) ? fbDb : null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { if (typeof showToast === 'function') showToast(m); } catch (e) { } }
  function errMsg(e) {
    try { if (typeof emailAuthErrorMessage === 'function') return emailAuthErrorMessage(e); } catch (x) { }
    return 'حصل خطأ، حاول تاني (' + ((e && e.code) || 'unknown') + ')';
  }
  function isApk() { return !!window.AndroidNative; }
  function jget(k, d) { try { var v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }

  /* ---------- بيانات الجهاز ---------- */
  var DATA_KEYS = ['app_tasks', 'app_categories', 'app_history_logs', 'app_daily_history', 'app_completed_history', 'app_note_pages',
    'app_today_sessions', 'app_today_focus', 'app_today_focus_seconds', 'app_streak', 'app_last_active_date', 'app_daily_goal_minutes',
    'app_ai_conversations', 'app_ai_artifacts', 'app_ai_projects', 'app_ai_chat_history', 'app_ai_user_name', 'app_user_name',
    'sp_name', 'sp_pic', 'sp_pic_big', 'sp_on', 'sp_sess'];
  function hasLocalData() {
    var t = jget('app_tasks', []), c = jget('app_completed_history', []), n = jget('app_note_pages', []), h = jget('app_daily_history', {}), ai = jget('app_ai_conversations', []);
    return (Array.isArray(t) && t.length) || (Array.isArray(c) && c.length) || (Array.isArray(n) && n.length) ||
      (h && typeof h === 'object' && Object.keys(h).length > 0) || (Array.isArray(ai) && ai.length > 0);
  }
  function backupLocal() {
    var snap = {};
    DATA_KEYS.forEach(function (k) { var v = LS.getItem(k); if (v != null) snap[k] = v; });
    var json = JSON.stringify({ at: Date.now(), data: snap });
    try { LS.setItem('app_pre_account_backup', json); return true; } catch (e) { }
    try {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'sanjiz-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 2000); return true;
    } catch (e) { return false; }
  }
  function wipeLocal() { DATA_KEYS.forEach(function (k) { try { LS.removeItem(k); } catch (e) { } }); }
  function cloudHas(doc) { return !!(doc && doc.exists && doc.data() && doc.data().updated_at); }
  function uploadLocal(uid) {
    var d = D(); if (!d || typeof buildDataBundle !== 'function') return Promise.resolve();
    return d.collection('users').doc(uid).set(Object.assign({}, buildDataBundle('cloud'), { updated_at: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true })
      .then(function () { LS.setItem('app_cloud_last_sync', new Date().toISOString()); });
  }
  function restoreCloud(doc) {
    if (typeof applyImportedDataBundle === 'function') { applyImportedDataBundle(doc.data()); LS.setItem('app_cloud_last_sync', new Date().toISOString()); }
  }

  /* ---------- الاسم ---------- */
  function cleanName(s) { return String(s || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim(); }
  function nameError(raw) {
    var n = cleanName(raw);
    if (!n) return 'اكتب اسمك الأول';
    if (n.length > 30) return 'الاسم طويل، الحد الأقصى 30 حرف';
    if (/https?:|www\.|@|\.(com|net|org|io)\b/i.test(n)) return 'الاسم مينفعش يكون رابط أو إيميل';
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(n)) return 'استخدم حروف بس (من غير أرقام أو رموز)';
    var words = n.split(' ').filter(function (w) { return w.replace(/[^\p{L}]/gu, '').length >= 2; });
    if (words.length < 2) return 'اكتب اسمك من كلمتين على الأقل (مثلًا: محمد أحمد)';
    return '';
  }
  function validName(n) { return !!n && !nameError(n); }
  function storedName() { return cleanName(LS.getItem('app_user_name') || ''); }
  function saveName(n, user) {
    n = cleanName(n);
    LS.setItem('app_user_name', n); LS.setItem('sp_name', n); LS.setItem('app_ai_user_name', n);
    try { user.updateProfile({ displayName: n }).catch(function () { }); } catch (e) { }
    var d = D(); if (d) return d.collection('users').doc(user.uid).set({ acctName: n }, { merge: true }).catch(function () { });
    return Promise.resolve();
  }

  /* ---------- الصورة (نفس تجهيز social.js: 192 للأفاتار و640 للعرض الكبير) ---------- */
  function savePhoto(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        try {
          var m = Math.min(im.width, im.height), sx = (im.width - m) / 2, sy = (im.height - m) / 2;
          var c = document.createElement('canvas'); c.width = c.height = 192; c.getContext('2d').drawImage(im, sx, sy, m, m, 0, 0, 192, 192);
          var small = c.toDataURL('image/jpeg', .8);
          var zb = Math.min(640, m), cb = document.createElement('canvas'); cb.width = cb.height = zb; cb.getContext('2d').drawImage(im, sx, sy, m, m, 0, 0, zb, zb);
          LS.setItem('sp_pic', small); LS.setItem('sp_pic_big', cb.toDataURL('image/jpeg', .82));
          URL.revokeObjectURL(url); res(small);
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      im.src = url;
    });
  }

  /* ---------- قفل التطبيق (نفس مفاتيح الإعدادات الحالية app_lock_*) ---------- */
  function lockOn() { return !!(LS.getItem('app_lock_hash') || LS.getItem('app_lock_biometric_enabled') === '1'); }
  function sha(str) {
    if (typeof sha256Hex === 'function') return sha256Hex(str);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
  }
  function salt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }
  function pwError(pw) {
    if (typeof passwordStrengthError === 'function') return passwordStrengthError(pw) || '';
    if (!pw || pw.length < 6) return 'كلمة المرور لازم تكون 6 خانات على الأقل';
    if (!/[A-Za-z\u0600-\u06FF]/.test(pw)) return 'لازم تحتوي على حرف واحد على الأقل';
    if (!/[0-9]/.test(pw)) return 'لازم تحتوي على رقم واحد على الأقل';
    if (!/[^A-Za-z0-9\u0600-\u06FF]/.test(pw)) return 'لازم تحتوي على رمز واحد على الأقل (مثل !@#$)';
    return '';
  }
  function bioAvailable() { try { return typeof isBiometricBridgeImplemented === 'function' && isBiometricBridgeImplemented() && typeof onBiometricLockToggleChange === 'function'; } catch (e) { return false; } }

  /* ---------- الواجهة ---------- */
  function css() {
    if (document.getElementById('onbCss')) return;
    var st = document.createElement('style'); st.id = 'onbCss';
    st.textContent =
      '#onbRoot{position:fixed;inset:0;z-index:9000;background:var(--bg-main,#f4f6fb);color:var(--text-primary,#1c2233);direction:rtl;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;justify-content:center;font-family:inherit}' +
      '#onbRoot .ob{width:100%;max-width:420px;padding:max(28px,env(safe-area-inset-top)) 22px max(28px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:14px;margin:auto 0}' +
      '#onbRoot h1{font-size:1.5rem;margin:0;font-weight:800;line-height:1.3}' +
      '#onbRoot p{margin:0;color:var(--text-secondary,#5d667a);font-size:.92rem;line-height:1.7}' +
      '#onbRoot .brand{font-size:2.4rem;line-height:1}' +
      '#onbRoot .tabs{display:flex;background:var(--card-bg,#fff);border:1px solid var(--card-border,#d9deea);border-radius:12px;padding:4px;gap:4px}' +
      '#onbRoot .tabs button{flex:1;border:0;background:none;color:inherit;font:inherit;font-weight:700;padding:10px;border-radius:9px;cursor:pointer}' +
      '#onbRoot .tabs button.on{background:var(--accent,#1b8a5a);color:#fff}' +
      '#onbRoot input[type=text],#onbRoot input[type=email],#onbRoot input[type=password]{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:12px;border:1px solid var(--card-border,#cfd5e3);background:var(--card-bg,#fff);color:inherit;font:inherit;font-size:1rem}' +
      '#onbRoot input:focus-visible,#onbRoot button:focus-visible{outline:2px solid var(--accent,#1b8a5a);outline-offset:2px}' +
      '#onbRoot .pri{width:100%;border:0;border-radius:12px;padding:14px;background:var(--accent,#1b8a5a);color:#fff;font:inherit;font-weight:800;font-size:1rem;cursor:pointer}' +
      '#onbRoot .sec{width:100%;border:1px solid var(--card-border,#cfd5e3);border-radius:12px;padding:13px;background:var(--card-bg,#fff);color:inherit;font:inherit;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}' +
      '#onbRoot .lnk{background:none;border:0;color:var(--text-secondary,#5d667a);font:inherit;text-decoration:underline;cursor:pointer;padding:8px;align-self:center}' +
      '#onbRoot button:disabled{opacity:.6;cursor:default}' +
      '#onbRoot .msg{min-height:1.2em;font-size:.88rem;font-weight:600}' +
      '#onbRoot .msg.err{color:#c0392b}#onbRoot .msg.ok{color:#2e7d32}' +
      '#onbRoot .or{display:flex;align-items:center;gap:10px;color:var(--text-secondary,#5d667a);font-size:.82rem}#onbRoot .or:before,#onbRoot .or:after{content:"";flex:1;height:1px;background:var(--card-border,#d9deea)}' +
      '#onbRoot .av{width:132px;height:132px;border-radius:50%;margin:6px auto;background:var(--card-bg,#fff);border:2px dashed var(--card-border,#cfd5e3);display:flex;align-items:center;justify-content:center;font-size:2.6rem;overflow:hidden;cursor:pointer}' +
      '#onbRoot .av img{width:100%;height:100%;object-fit:cover}' +
      '#onbRoot .spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--card-border,#d9deea);border-top-color:var(--accent,#1b8a5a);animation:onbs 1s linear infinite;margin:0 auto}' +
      '@keyframes onbs{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){#onbRoot .spin{animation:none}}' +
      '#onbRoot .steps{display:flex;gap:6px}#onbRoot .steps i{flex:1;height:4px;border-radius:2px;background:var(--card-border,#d9deea)}#onbRoot .steps i.on{background:var(--accent,#1b8a5a)}';
    document.head.appendChild(st);
  }
  function mount() {
    css();
    if (!root) { root = document.createElement('div'); root.id = 'onbRoot'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); document.body.appendChild(root); }
    return root;
  }
  function paint(html) { mount().innerHTML = '<div class="ob">' + html + '</div>'; }
  function setMsg(t, bad) { var m = document.getElementById('onbMsg'); if (m) { m.textContent = t || ''; m.className = 'msg ' + (t ? (bad ? 'err' : 'ok') : ''); } }
  function stepsBar(n) { var h = '<div class="steps" aria-hidden="true">'; for (var i = 1; i <= 3; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return h + '</div>'; }
  function busy(b) { ctx.busy = b; var bs = root ? root.querySelectorAll('button') : []; for (var i = 0; i < bs.length; i++) bs[i].disabled = !!b; }
  function $(id) { return document.getElementById(id); }

  function closeGate() {
    gateOpen = false; phase = 'done';
    if (root) { root.remove(); root = null; }
    try { if (typeof window.spActivate === 'function') window.spActivate(); } catch (e) { }
  }
  function openGate() { gateOpen = true; }

  /* --- splash --- */
  function showSplash() { phase = 'splash'; paint('<div style="text-align:center;padding:60px 0"><div class="brand">✅</div><h1 style="margin:14px 0 18px">سأنجزها</h1><div class="spin" role="status" aria-label="جاري التحميل"></div></div>'); }

  /* --- الدخول --- */
  var mode = 'register';
  function showAuth(note) {
    openGate(); phase = 'auth';
    var offline = navigator.onLine === false, google = !isApk();
    var h = '<div><div class="brand">✅</div><h1 style="margin-top:10px">أهلًا في سأنجزها</h1><p>سجّل دخولك عشان بياناتك تتحفظ على حسابك، وتقدر تدخل من أي جهاز وتنافس أصحابك.</p></div>' +
      '<div class="tabs" role="tablist"><button type="button" id="onbTabReg" class="' + (mode === 'register' ? 'on' : '') + '" role="tab">حساب جديد</button><button type="button" id="onbTabIn" class="' + (mode === 'login' ? 'on' : '') + '" role="tab">عندي حساب</button></div>' +
      '<input type="email" id="onbEmail" placeholder="الإيميل" autocomplete="email" inputmode="email" dir="ltr" style="text-align:left">' +
      '<input type="password" id="onbPass" placeholder="كلمة المرور (6 خانات على الأقل)" autocomplete="' + (mode === 'register' ? 'new-password' : 'current-password') + '" dir="ltr" style="text-align:left">' +
      '<div id="onbMsg" class="msg" role="alert">' + '</div>' +
      '<button type="button" class="pri" id="onbGo">' + (mode === 'register' ? 'إنشاء الحساب' : 'تسجيل الدخول') + '</button>' +
      (google ? '<div class="or">أو</div><button type="button" class="sec" id="onbGoogle"><span aria-hidden="true">G</span> الدخول بحساب جوجل</button>' : '<p>الدخول بجوجل مش متاح في تطبيق الأندرويد دلوقتي، استخدم الإيميل وكلمة المرور.</p>') +
      (mode === 'login' ? '<button type="button" class="lnk" id="onbForgot">نسيت كلمة المرور؟</button>' : '') +
      (offline ? '<p>مفيش نت دلوقتي، أول دخول محتاج اتصال بالإنترنت.</p>' : '') +
      (offline && hasLocalData() ? '<button type="button" class="lnk" id="onbBypass">افتح بياناتي على الجهاز مؤقتًا لحد ما النت يرجع</button>' : '');
    paint(h);
    if (note) setMsg(note, true);
    $('onbTabReg').onclick = function () { mode = 'register'; showAuth(); };
    $('onbTabIn').onclick = function () { mode = 'login'; showAuth(); };
    $('onbGo').onclick = doEmail;
    $('onbPass').onkeydown = function (e) { if (e.key === 'Enter') doEmail(); };
    if ($('onbGoogle')) $('onbGoogle').onclick = doGoogle;
    if ($('onbForgot')) $('onbForgot').onclick = doForgot;
    if ($('onbBypass')) $('onbBypass').onclick = function () { tempBypass = true; gateOpen = false; if (root) { root.remove(); root = null; } toast('شغّال بدون حساب مؤقتًا، هنطلب الدخول لما النت يرجع'); };
  }
  function doEmail() {
    var a = A(); if (!a) { setMsg('خدمة الحساب مش متاحة دلوقتي ⚠', true); return; }
    var email = ($('onbEmail').value || '').trim(), pass = $('onbPass').value || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg('اكتب إيميل صحيح', true); return; }
    if (!pass) { setMsg('اكتب كلمة المرور', true); return; }
    if (mode === 'register' && pass.length < 6) { setMsg('كلمة المرور لازم تكون 6 خانات على الأقل', true); return; }
    busy(true); setMsg(mode === 'register' ? 'جاري إنشاء الحساب...' : 'جاري تسجيل الدخول...', false);
    ctx.fresh = true; LS.setItem(FRESH, String(Date.now()));
    var p = mode === 'register' ? a.createUserWithEmailAndPassword(email, pass) : a.signInWithEmailAndPassword(email, pass);
    p.then(function (cred) {
      if (mode === 'register') { try { cred.user.sendEmailVerification().catch(function () { }); ctx.verifySent = true; } catch (e) { } }
      /* onAuthStateChanged هو اللي بيكمّل التدفق */
    }).catch(function (e) { busy(false); ctx.fresh = false; LS.removeItem(FRESH); setMsg(errMsg(e), true); });
  }
  function doGoogle() {
    var a = A(); if (!a) { setMsg('خدمة الحساب مش متاحة دلوقتي ⚠', true); return; }
    busy(true); setMsg('جاري فتح حساب جوجل...', false); ctx.fresh = true; LS.setItem(FRESH, String(Date.now()));
    var prov = new firebase.auth.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
    a.signInWithPopup(prov).catch(function (e) {
      var c = e && e.code;
      if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') { a.signInWithRedirect(prov); return; }
      busy(false); ctx.fresh = false; LS.removeItem(FRESH);
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') { setMsg('', false); return; }
      if (c === 'auth/unauthorized-domain') { setMsg('الرابط ده مش معتمد في Firebase ⚠', true); return; }
      if (c === 'auth/operation-not-allowed') { setMsg('الدخول بجوجل مش مفعّل في Firebase ⚠', true); return; }
      setMsg(errMsg(e), true);
    });
  }
  function doForgot() {
    var a = A(), email = ($('onbEmail').value || '').trim();
    if (!email) { setMsg('اكتب إيميلك فوق الأول', true); $('onbEmail').focus(); return; }
    a.sendPasswordResetEmail(email, { url: 'https://my-productivity-app-da499.firebaseapp.com', handleCodeInApp: false })
      .then(function () { setMsg('بعتنالك رابط تغيير كلمة المرور على الإيميل. راجع Spam لو ما ظهرش.', false); })
      .catch(function (e) { setMsg(errMsg(e), true); });
  }

  /* --- بعد الدخول: بيانات الجهاز مقابل السحابة --- */
  function showData(text) { phase = 'data'; paint('<div style="text-align:center;padding:60px 0"><div class="spin" role="status"></div><p style="margin-top:16px">' + esc(text || 'جاري تجهيز حسابك...') + '</p></div>'); }
  function askConflict(doc) {
    return new Promise(function (res) {
      phase = 'data';
      paint('<div><div class="brand">🗂️</div><h1 style="margin-top:10px">لقينا بيانات في الحالتين</h1><p>على الجهاز ده فيه بيانات، وحسابك كمان عليه نسخة محفوظة. اختار اللي تكمل بيه. هنحفظ نسخة احتياطية من بيانات الجهاز قبل أي تغيير.</p></div>' +
        '<button type="button" class="pri" id="onbCloud">استرجع بيانات حسابي</button>' +
        '<button type="button" class="sec" id="onbLocal">كمّل ببيانات الجهاز وارفعها للحساب</button>' +
        '<p>الاختيار التاني بيستبدل النسخة اللي على الحساب ببيانات الجهاز ده.</p>');
      $('onbCloud').onclick = function () { backupLocal(); res('cloud'); };
      $('onbLocal').onclick = function () { backupLocal(); res('local'); };
    });
  }
  function resolveData(user) {
    var d = D(), uid = user.uid, owner = LS.getItem(OWNER) || '';
    var fresh = ctx.fresh || (Date.now() - parseInt(LS.getItem(FRESH) || '0', 10) < 600000);
    if (!d) return Promise.resolve();
    return d.collection('users').doc(uid).get().then(function (doc) {
      var cloudName = doc.exists ? cleanName(doc.data().acctName) : '';
      if (validName(cloudName)) { LS.setItem('app_user_name', cloudName); LS.setItem('sp_name', cloudName); LS.setItem('app_ai_user_name', cloudName); }
      var has = cloudHas(doc), local = hasLocalData();
      /* جهاز كان عليه حساب تاني: بيانات حد تاني، منقلهاش للحساب ده */
      if (owner && owner !== uid) {
        backupLocal(); wipeLocal(); LS.setItem(OWNER, uid); LS.removeItem(FRESH);
        location.reload(); return new Promise(function () { });
      }
      if (!owner && !fresh) { LS.setItem(OWNER, uid); return; }     /* مستخدم قديم كان مسجّل أصلًا: بياناته بتاعته */
      if (local && has) {
        return askConflict(doc).then(function (c) {
          showData('جاري تجهيز حسابك...');
          if (c === 'cloud') { restoreCloud(doc); return; }
          return uploadLocal(uid);
        });
      }
      if (local && !has) return uploadLocal(uid);
      if (!local && has) { restoreCloud(doc); return; }
    }).then(function () { LS.setItem(OWNER, uid); LS.removeItem(FRESH); }, function (e) {
      /* مفيش نت/خطأ قراءة: ما نحجبش المستخدم، بنكمّل ونحاول لاحقًا */
      try { console.warn('onb data', e && e.code); } catch (x) { }
      if (!owner) LS.setItem(OWNER, uid);
    });
  }

  /* --- الاسم --- */
  function showName() {
    phase = 'name'; var u = ctx.user, pre = storedName() || cleanName(u.displayName || '');
    paint(stepsBar(1) + '<div><h1>اسمك إيه؟</h1><p>اكتب اسمك من كلمتين على الأقل. هيظهر لأصحابك في المنافسة، والمدرب الذكي هيناديك بيه، ومش هنسألك عنه تاني.</p></div>' +
      '<input type="text" id="onbName" maxlength="30" placeholder="مثلًا: محمد أحمد" autocomplete="name" value="' + esc(pre) + '">' +
      '<div id="onbMsg" class="msg" role="alert"></div><button type="button" class="pri" id="onbNext">متابعة</button>');
    var inp = $('onbName'); setTimeout(function () { try { inp.focus(); } catch (e) { } }, 150);
    function go() {
      var er = nameError(inp.value); if (er) { setMsg(er, true); return; }
      busy(true); saveName(inp.value, ctx.user).then(function () { busy(false); next(); });
    }
    $('onbNext').onclick = go; inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }
  /* --- الصورة --- */
  function showPhoto() {
    phase = 'photo'; var cur = LS.getItem('sp_pic') || '';
    paint(stepsBar(2) + '<div><h1>تحب تضيف صورة؟</h1><p>اختياري. أصحابك هيشوفوها جنب اسمك، وتقدر تغيّرها بعدين من المنافسة.</p></div>' +
      '<label class="av" id="onbAv" tabindex="0">' + (cur ? '<img alt="صورتك" src="' + esc(cur) + '">' : '📷') + '<input type="file" id="onbFile" accept="image/*" hidden></label>' +
      '<div id="onbMsg" class="msg" role="alert"></div>' +
      '<button type="button" class="pri" id="onbNext">' + (cur ? 'متابعة' : 'اختار صورة') + '</button><button type="button" class="lnk" id="onbSkip">تخطي</button>');
    var f = $('onbFile');
    f.onchange = function () {
      var file = f.files && f.files[0]; f.value = ''; if (!file) return;
      busy(true); setMsg('جاري تجهيز الصورة...', false);
      savePhoto(file).then(function (small) { busy(false); setMsg('', false); $('onbAv').innerHTML = '<img alt="صورتك" src="' + esc(small) + '"><input type="file" id="onbFile" accept="image/*" hidden>'; $('onbNext').textContent = 'متابعة'; $('onbFile').onchange = f.onchange; f = $('onbFile'); })
        .catch(function () { busy(false); setMsg('الصورة دي مش مدعومة، جرّب غيرها', true); });
    };
    $('onbAv').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } };
    $('onbNext').onclick = function () { if (!LS.getItem('sp_pic')) { f.click(); return; } next(); };
    $('onbSkip').onclick = function () { next(); };
  }
  /* --- القفل --- */
  function showLock() {
    phase = 'lock';
    paint(stepsBar(3) + '<div><h1>تحب تقفل التطبيق؟</h1><p>اختياري. لو فعّلته، التطبيق هيطلب بصمة أو كلمة مرور كل ما تفتحه. تقدر تفعّله أو تلغيه بعدين من الإعدادات.</p></div>' +
      (bioAvailable() ? '<button type="button" class="sec" id="onbBio"><span aria-hidden="true">👆</span> بصمة أو قفل الجهاز</button>' : '') +
      '<button type="button" class="sec" id="onbPw"><span aria-hidden="true">🔒</span> كلمة مرور</button>' +
      '<div id="onbPwBox" style="display:none;flex-direction:column;gap:10px"><input type="password" id="onbP1" placeholder="كلمة المرور" autocomplete="new-password"><input type="password" id="onbP2" placeholder="أعد كتابة كلمة المرور" autocomplete="new-password"><p>6 خانات على الأقل، وفيها حرف ورقم ورمز. لو نسيتها هنرجّعها على إيميل حسابك.</p><button type="button" class="pri" id="onbPwSave">حفظ كلمة المرور</button></div>' +
      '<div id="onbMsg" class="msg" role="alert"></div><button type="button" class="lnk" id="onbSkip">' + (lockOn() ? 'متابعة' : 'تخطي') + '</button>');
    if ($('onbBio')) $('onbBio').onclick = function () {
      busy(true);
      Promise.resolve(onBiometricLockToggleChange(true)).then(function () {
        /* نتيجة الأندرويد بتيجي بـ callback، فبنستنى شوية ونفحص */
        var tries = 0, t = setInterval(function () {
          tries++;
          if (LS.getItem('app_lock_biometric_enabled') === '1') { clearInterval(t); busy(false); next(); }
          else if (tries > 40) { clearInterval(t); busy(false); }
        }, 500);
      }).catch(function () { busy(false); });
    };
    $('onbPw').onclick = function () { $('onbPwBox').style.display = 'flex'; $('onbPw').style.display = 'none'; setTimeout(function () { $('onbP1').focus(); }, 50); };
    $('onbPwSave').onclick = function () {
      var p1 = $('onbP1').value || '', p2 = $('onbP2').value || '', er = pwError(p1);
      if (er) { setMsg(er, true); return; } if (p1 !== p2) { setMsg('كلمتا المرور مش متطابقتين', true); return; }
      busy(true); var s = salt();
      sha(s + p1).then(function (h) {
        LS.setItem('app_lock_salt', s); LS.setItem('app_lock_hash', h);
        if (ctx.user && ctx.user.email) LS.setItem('app_lock_email', ctx.user.email);
        try { sessionStorage.setItem('app_unlocked', '1'); } catch (e) { }
        busy(false); toast('اتفعّل قفل التطبيق 🔒'); next();
      }).catch(function () { busy(false); setMsg('تعذّر حفظ كلمة المرور، حاول تاني', true); });
    };
    $('onbSkip').onclick = function () { next(); };
  }

  function finish() {
    var u = ctx.user; if (u) { LS.setItem(DONE, u.uid); LS.setItem(OWNER, u.uid); }
    closeGate();
    var first = (storedName().split(' ')[0]) || '';
    toast(first ? 'أهلًا ' + first + ' 👋' : 'أهلًا بيك 👋');
    if (ctx.verifySent) setTimeout(function () { toast('بعتنالك رسالة تأكيد على إيميلك 📧'); }, 2500);
  }
  function next() {
    if (phase === 'name') { if (!LS.getItem('sp_pic')) { showPhoto(); return; } if (!lockOn()) { showLock(); return; } finish(); return; }
    if (phase === 'photo') { if (!lockOn()) { showLock(); return; } finish(); return; }
    finish();
  }

  /* --- نقطة الدخول: بعد ما الحساب يتأكد --- */
  function handleUser(user) {
    ctx.user = user; tempBypass = false; openGate();
    var done = LS.getItem(DONE) === user.uid;
    if (done && validName(storedName())) {
      /* مستخدم خلّص الشاشة قبل كده: مفيش حاجة تتعرض */
      if (!LS.getItem(OWNER)) LS.setItem(OWNER, user.uid);
      closeGate(); return;
    }
    showData('جاري تجهيز حسابك...');
    resolveData(user).then(function () {
      if (!validName(storedName())) { showName(); return; }
      phase = 'name'; next();
    });
  }

  function start() {
    var a = A();
    if (!a) {
      /* Firebase مش متاح (أوفلاين تمامًا أو خطأ تهيئة): ما نقفلش المستخدم برا */
      gateOpen = false; if (root) { root.remove(); root = null; } return;
    }
    showSplash();
    var resolved = false, prev;
    var timer = setTimeout(function () { if (!resolved) { resolved = true; showAuth(); } }, 8000);
    a.onAuthStateChanged(function (u) {
      resolved = true; clearTimeout(timer);
      var uid = u ? u.uid : '';
      if (u) { if (uid !== prev || gateOpen) { prev = uid; handleUser(u); } else prev = uid; }
      else { prev = ''; ctx.user = null; busy(false); if (!tempBypass) showAuth(); }
    });
    window.addEventListener('online', function () {
      if (tempBypass && !(A() && A().currentUser)) { tempBypass = false; showAuth('رجع النت. سجّل دخولك عشان تكمّل'); }
    });
  }

  /* أي كود قديم بينده afterCloudLogin (إعدادات / redirect جوجل) ما يطلعش confirm تاني وإحنا في شاشة البداية */
  try {
    var origAfter = window.afterCloudLogin;
    window.afterCloudLogin = function (u) { if (gateOpen) return Promise.resolve(); return typeof origAfter === 'function' ? origAfter(u) : Promise.resolve(); };
  } catch (e) { }

  function boot() { try { start(); } catch (e) { try { console.warn('onboarding failed', e); } catch (x) { } gateOpen = false; if (root) { root.remove(); root = null; } } }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
