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
    if (e && e.code === 'auth/unauthorized-domain') return 'الرابط ده مش معتمد في Firebase ⚠ (لازم يتضاف في Authorized domains)';
    try { if (typeof emailAuthErrorMessage === 'function') return emailAuthErrorMessage(e); } catch (x) { }
    return 'حصل خطأ، حاول تاني (' + ((e && e.code) || 'unknown') + ')';
  }
  /* الإيميل: لو كتب الاسم بس بنكمّله @gmail.com، ولو كتبه كامل بيفضل زي ما هو */
  function normEmail(s) {
    s = String(s == null ? '' : s).replace(/[\s‎‏]/g, '').toLowerCase();
    if (!s) return '';
    if (s.indexOf('@') < 0) return /^[a-z0-9._%+-]+$/.test(s) ? s + '@gmail.com' : s;
    var m = s.match(/^([^@]+)@(gmail|gmail\.|gmail\.c|gmail\.co|gmial\.com|gamil\.com|gmai\.com)$/);
    return m ? m[1] + '@gmail.com' : s;
  }
  function isApk() { return !!window.AndroidNative; }
  function withTimeout(p, ms) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej({ code: 'timeout' }); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }
  function jget(k, d) { try { var v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }

  /* ---------- بيانات الجهاز ---------- */
  var DATA_KEYS = ['app_tasks', 'app_categories', 'app_history_logs', 'app_daily_history', 'app_completed_history', 'app_note_pages',
    'app_today_sessions', 'app_today_focus', 'app_today_focus_seconds', 'app_streak', 'app_last_active_date', 'app_daily_goal_minutes',
    'app_ai_conversations', 'app_ai_artifacts', 'app_ai_projects', 'app_ai_chat_history', 'app_ai_user_name', 'app_user_name',
    'sp_name', 'sp_pic', 'sp_pic_big', 'sp_on', 'sp_sess'];
  /* التطبيق بيعمل صفحة ملاحظات فاضية اسمها «صفحة جديدة» أول ما يتحمّل (initNotes)، فما تتعدّش بيانات: وإلا أي جهاز جديد كان هيشوف «لقينا بيانات في الحالتين» أول ما Firebase يتأخر شوية */
  function realNotes(n) {
    if (!Array.isArray(n)) return false;
    return n.some(function (p) {
      if (!p) return false;
      var txt = String(p.content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim(), title = String(p.title || '').trim();
      return txt.length > 0 || (title !== '' && !/^صفحة جديدة( \d+)?$/.test(title));
    });
  }
  function hasLocalData() {
    var t = jget('app_tasks', []), c = jget('app_completed_history', []), n = jget('app_note_pages', []), h = jget('app_daily_history', {}), ai = jget('app_ai_conversations', []);
    return (Array.isArray(t) && t.length) || (Array.isArray(c) && c.length) || realNotes(n) ||
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
  /* الجهاز كان مربوط بمجموعة أجهزة الحساب القديم: نفكّ الربط الأول (بهدوء) عشان المسح ما يتحسبش «حذف» ويوصل لباقي الأجهزة، ولا الجهاز يسحب بيانات المجموعة القديمة تاني */
  function detachLink() {
    try { if (typeof window.__dlDetach === 'function') window.__dlDetach(); } catch (e) { }
    ['app_link_state', 'app_link_meta', 'app_link_ctr', 'app_link_backup_before_merge', 'app_link_pending_secrets'].forEach(function (k) { try { LS.removeItem(k); } catch (e) { } });
  }
  /* نسخة «قبل الاستبدال» بتاعة الحساب القديم بتتمسح مع تبديل الحساب، عشان زرار الاسترجاع ما يرجّعش بيانات حساب في حساب تاني */
  function wipeLocal() { detachLink(); DATA_KEYS.forEach(function (k) { try { LS.removeItem(k); } catch (e) { } }); ['app_pre_replace_backup', 'app_pre_replace_at'].forEach(function (k) { try { LS.removeItem(k); } catch (e) { } }); }
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
      '#onbRoot .logo{display:block;width:104px;height:104px;border-radius:24px;margin:0 auto;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.18)}#onbRoot .logo.sm{width:64px;height:64px;border-radius:16px}' +
      '#onbRoot .hero{text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center}#onbRoot .hero p{max-width:320px}' +
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
      '#onbRoot .steps{display:flex;gap:6px}#onbRoot .steps i{flex:1;height:4px;border-radius:2px;background:var(--card-border,#d9deea)}#onbRoot .steps i.on{background:var(--accent,#1b8a5a)}' +
      '#onbRoot .warn{background:rgba(230,160,30,.12);border:1px solid rgba(230,160,30,.5);border-radius:12px;padding:10px 12px;font-size:.82rem;line-height:1.7;display:flex;flex-direction:column;gap:4px}#onbRoot .warn .lnk{padding:4px;font-size:.84rem}';
    document.head.appendChild(st);
  }
  function coverOff() { try { if (window.__onbCoverOff) window.__onbCoverOff(); } catch (e) { } }
  function mount() {
    css();
    if (!root) { root = document.createElement('div'); root.id = 'onbRoot'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); document.body.appendChild(root); }
    coverOff();
    return root;
  }
  function paint(html) { ctx.busy = false; mount().innerHTML = '<div class="ob">' + html + '</div>'; }
  function setMsg(t, bad) { var m = document.getElementById('onbMsg'); if (m) { m.textContent = t || ''; m.className = 'msg ' + (t ? (bad ? 'err' : 'ok') : ''); } }
  function stepsBar(n) { var h = '<div class="steps" aria-hidden="true">'; for (var i = 1; i <= 3; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return h + '</div>'; }
  function busy(b) { ctx.busy = b; var bs = root ? root.querySelectorAll('button') : []; for (var i = 0; i < bs.length; i++) bs[i].disabled = !!b; }
  function $(id) { return document.getElementById(id); }
  /* أيقونة التطبيق (نفس icon-192.png اللي في الـ manifest)؛ لو ما اتحمّلتش بتتشال من غير ما تبوّظ الشاشة */
  function logo(sm) { return '<img class="logo' + (sm ? ' sm' : '') + '" src="icon-192.png" alt="سأنجزها" onerror="this.style.display=\'none\'">'; }

  function closeGate() {
    gateOpen = false; phase = 'done'; coverOff(); gateEvt();
    if (root) { root.remove(); root = null; }
    try { if (typeof window.spActivate === 'function') window.spActivate(); } catch (e) { }
  }
  /* بيبلّغ باقي الملفات (الربط بين الأجهزة) إن البوابة اتفتحت أو اتقفلت، عشان يوقفوا ويكمّلوا في الوقت الصح */
  function gateEvt() { try { window.dispatchEvent(new Event('onb-gate')); } catch (e) { } }
  function openGate() { var was = gateOpen; gateOpen = true; if (!was) gateEvt(); }

  /* ---------- المتصفح الداخلي والتخزين (واتساب/إنستجرام بيخزّنوا بعيد عن المتصفح العادي، فالحساب والدعوة بيضيعوا بينهم) ---------- */
  function inApp() {
    if (window.AndroidNative && !window.AndroidNative.__web) return false;   /* تطبيق الأندرويد الحقيقي (مش بديل الويب) */
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Pinterest|LinkedInApp/i.test(ua)) return true;
    if (/; wv\)/.test(ua)) return true;
    if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//.test(ua) && !navigator.standalone && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return true;
    return false;
  }
  function storageOk() { try { var k = '__onb_t'; LS.setItem(k, '1'); LS.removeItem(k); return true; } catch (e) { return false; } }
  /* كود دعوة صديق مستني (social.js بيخزّنه JSON، ولو لسه ما اتحمّلش بنقراه من الرابط نفسه) */
  function pendCode() {
    try {
      var v = LS.getItem('sp_pending');
      if (v) { var o = v.charAt(0) === '{' ? JSON.parse(v) : { c: v }; if (o && /^[A-Za-z0-9]{6,8}$/.test(o.c || '')) return String(o.c).toUpperCase(); }
      var m = location.search.match(/[?&]f=([A-Za-z0-9]{6,8})(?![A-Za-z0-9])/); if (m) return m[1].toUpperCase();
    } catch (e) { }
    return '';
  }
  function shareUrl() { try { var c = pendCode(); return location.origin + location.pathname + (c ? '?f=' + c : ''); } catch (e) { return location.href; } }
  function fallbackCopy(t) {
    try { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return !!ok; } catch (e) { return false; }
  }
  function copyText(t) {
    return new Promise(function (res) {
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { res(true); }, function () { res(fallbackCopy(t)); }); return; } } catch (e) { }
      res(fallbackCopy(t));
    });
  }
  function warnHtml() {
    var h = '';
    if (!storageOk()) h += '<div class="warn">⚠️ التخزين مقفول في المتصفح ده (غالبًا وضع التصفح الخاص)، فالدخول والبيانات مش هيتحفظوا بعد ما تقفله.</div>';
    if (inApp()) h += '<div class="warn"><span>⚠️ إنت فاتح التطبيق من متصفح داخلي (واتساب/إنستجرام/...). هنا الدخول بجوجل ممكن ما يشتغلش، وحسابك ودعوتك ممكن ما يظهروش لما تفتح التطبيق من متصفحك العادي.</span><button type="button" class="lnk" id="onbCopyUrl">📋 انسخ الرابط وافتحه في Chrome أو Safari</button></div>';
    return h;
  }
  function bindWarn() {
    var b = $('onbCopyUrl'); if (!b) return;
    b.onclick = function () { copyText(shareUrl()).then(function (ok) { b.textContent = ok ? '✅ اتنسخ، الصقه في المتصفح بتاعك' : 'انسخ الرابط يدويًا: ' + shareUrl(); }); };
  }
  /* خروج / تغيير الحساب من جوه شاشات الاسم والصورة (ضغطتين عشان ما يحصلش بالغلط) */
  function outLink() { return '<button type="button" class="lnk" id="onbOut2">مش حسابك؟ سجّل خروج</button>'; }
  function bindOut() {
    var b = $('onbOut2'); if (!b) return; var armed = false, t;
    b.onclick = function () {
      if (ctx.busy) return;
      if (!armed) { armed = true; b.textContent = 'اضغط تاني للتأكيد'; t = setTimeout(function () { armed = false; try { b.textContent = 'مش حسابك؟ سجّل خروج'; } catch (e) { } }, 4000); return; }
      clearTimeout(t); busy(true);
      try { A().signOut().then(null, function () { busy(false); }); } catch (e) { busy(false); }
    };
  }
  function backBtn(id) { return '<button type="button" class="lnk" id="' + id + '" style="align-self:flex-start;padding:4px 0">‹ رجوع</button>'; }

  /* --- splash --- */
  function showSplash() { phase = 'splash'; paint('<div style="text-align:center;padding:60px 0">' + logo() + '<h1 style="margin:16px 0 18px">سأنجزها</h1><div class="spin" role="status" aria-label="جاري التحميل"></div></div>'); }

  /* --- الدخول --- */
  var mode = 'register';
  /* --- أول شاشة: الأيقونة + الترحيب + زرارين --- */
  function showWelcome() {
    openGate(); phase = 'welcome';
    var offline = navigator.onLine === false;
    paint('<div class="hero">' + logo() + '<h1>أهلًا في سأنجزها</h1><p>سجّل دخولك عشان بياناتك تتحفظ على حسابك، وتقدر تدخل من أي جهاز وتنافس أصحابك.</p></div>' + warnHtml() +
      '<button type="button" class="pri" id="onbNew">إنشاء حساب</button>' +
      '<button type="button" class="sec" id="onbHave">تسجيل الدخول</button>' +
      (offline ? '<p style="text-align:center">مفيش نت دلوقتي، أول دخول محتاج اتصال بالإنترنت.</p>' : '') +
      '');
    bindWarn();
    $('onbNew').onclick = function () { mode = 'register'; showAuth(); };
    $('onbHave').onclick = function () { mode = 'login'; showAuth(); };
    bindBypass();
  }
  function bindBypass() {
    var b = $('onbBypass'); if (!b) return;
    b.onclick = function () { tempBypass = true; gateOpen = false; gateEvt(); if (root) { root.remove(); root = null; } toast('شغّال بدون حساب مؤقتًا، هنطلب الدخول لما النت يرجع'); };
  }
  /* --- نموذج الإنشاء / الدخول (بعد ما يختار من الشاشة اللي فوق) --- */
  function showAuth(note) {
    openGate(); phase = 'auth';
    var offline = navigator.onLine === false, google = !isApk(), reg = mode === 'register';
    var h = '<button type="button" class="lnk" id="onbBack" style="align-self:flex-start;padding:4px 0">‹ رجوع</button>' +
      '<div class="hero">' + logo(true) + '<h1>' + (reg ? 'إنشاء حساب جديد' : 'تسجيل الدخول') + '</h1></div>' + warnHtml() +
      '<input type="email" id="onbEmail" placeholder="الإيميل (لو جيميل اكتب اسمه بس)" autocomplete="email" inputmode="email" dir="ltr" style="text-align:left">' +
      '<input type="password" id="onbPass" placeholder="كلمة المرور' + (reg ? ' (6 خانات على الأقل)' : '') + '" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" dir="ltr" style="text-align:left">' +
      '<div id="onbMsg" class="msg" role="alert"></div>' +
      '<button type="button" class="pri" id="onbGo">' + (reg ? 'إنشاء الحساب' : 'تسجيل الدخول') + '</button>' +
      (google ? '<div class="or">أو</div><button type="button" class="sec" id="onbGoogle"><span aria-hidden="true">G</span> ' + (reg ? 'الإنشاء' : 'الدخول') + ' بحساب جوجل</button>' : '<p>الدخول بجوجل مش متاح في تطبيق الأندرويد دلوقتي، استخدم الإيميل وكلمة المرور.</p>') +
      (!reg ? '<button type="button" class="lnk" id="onbForgot">نسيت كلمة المرور؟</button>' : '') +
      '<button type="button" class="lnk" id="onbSwitch">' + (reg ? 'عندي حساب بالفعل' : 'معنديش حساب، إنشاء حساب جديد') + '</button>' +
      (offline ? '<p>مفيش نت دلوقتي، أول دخول محتاج اتصال بالإنترنت.</p>' : '') +
      '';
    paint(h); bindWarn();
    if (note) setMsg(note, true);
    $('onbBack').onclick = showWelcome;
    $('onbSwitch').onclick = function () { mode = reg ? 'login' : 'register'; showAuth(); };
    $('onbGo').onclick = doEmail;
    $('onbPass').onkeydown = function (e) { if (e.key === 'Enter') doEmail(); };
    if ($('onbGoogle')) $('onbGoogle').onclick = doGoogle;
    if ($('onbForgot')) $('onbForgot').onclick = doForgot;
    bindBypass();
  }
  function doEmail() {
    var a = A(); if (!a) { setMsg('خدمة الحساب مش متاحة دلوقتي ⚠', true); return; }
    var email = normEmail($('onbEmail').value), pass = $('onbPass').value || ''; if ($('onbEmail').value !== email) $('onbEmail').value = email;
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
    var a = A(), email = normEmail($('onbEmail').value); if (email) $('onbEmail').value = email;
    if (!email) { setMsg('اكتب إيميلك فوق الأول', true); $('onbEmail').focus(); return; }
    a.sendPasswordResetEmail(email, { url: 'https://my-productivity-app-da499.firebaseapp.com', handleCodeInApp: false })
      .then(function () { setMsg('بعتنالك رابط تغيير كلمة المرور على الإيميل. راجع Spam لو ما ظهرش.', false); })
      .catch(function (e) { setMsg(errMsg(e), true); });
  }

  /* --- بعد الدخول: بيانات الجهاز مقابل السحابة --- */
  var lastErr = '', attempt = 1, dlog = [], t0 = Date.now(), stT = null, stI = null, stStart = 0, curStage = 0;
  function lg(x) { dlog.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + x); if (dlog.length > 40) dlog.shift(); }
  function diagText() { return dlog.join('\n') + '\nonLine=' + navigator.onLine + ' ' + new Date().toISOString() + '\n' + navigator.userAgent; }
  var STAGES = ['جاري تسجيل الدخول لحسابك', 'جاري التحقق من حسابك', 'جاري قراءة بيانات حسابك من السحابة', 'جاري مقارنة بياناتك مع بيانات الجهاز', 'جاري استرجاع بياناتك على الجهاز', 'جاري إنهاء التجهيز'];
  var SLOW = ['تسجيل الدخول بياخد وقت أطول من العادي', 'التحقق من الحساب بياخد وقت أطول من العادي', 'قراءة بيانات حسابك بتاخد وقت أطول من العادي بسبب النت', 'المقارنة بتاخد وقت أطول من العادي', 'استرجاع بياناتك بياخد وقت أطول من العادي', 'إنهاء التجهيز بياخد وقت أطول من العادي'];
  var LIMIT = [0, 0, 12, 0, 15, 0];
  /* شاشة تقدّم: شريط واحد تحت ورسالة بتتغيّر مع كل مرحلة بتبدأ فعلًا في الكود (مفيش مؤقت وهمي) */
  function showData(text, stage) {
    phase = 'data';
    paint('<div style="text-align:center;padding:60px 0 150px">' + logo() + '<div class="spin" role="status" style="margin-top:18px"></div></div>' +
      '<div style="position:fixed;left:0;right:0;bottom:0;padding:16px 24px max(22px,env(safe-area-inset-bottom));text-align:center;background:var(--bg-main, #f4f6fb)">' +
      '<div id="onbStageNo" style="font-size:.74rem;opacity:.65;margin-bottom:4px"></div>' +
      '<p id="onbDataTxt" style="margin:0 0 10px;font-weight:700;color:var(--text-primary, #1c2233)"></p>' +
      '<div style="height:6px;border-radius:3px;background:var(--card-border, #d9deea);overflow:hidden;max-width:420px;margin:0 auto"><div id="onbBar" style="height:100%;width:3%;background:var(--accent, #1b8a5a);transition:width .5s ease"></div></div>' +
      '<p id="onbDataSub" style="margin:8px 0 0;font-size:.8rem;min-height:1.2em;color:var(--text-secondary, #5d667a)"></p>' +
      '<button type="button" class="lnk" id="onbDiagB" style="font-size:.74rem;padding:2px 8px">تفاصيل</button>' +
      '<pre id="onbDiag" style="display:none;text-align:left;direction:ltr;font-size:.66rem;max-height:110px;overflow:auto;margin:6px auto 0;max-width:420px;white-space:pre-wrap"></pre></div>');
    var bt = $('onbDiagB'); if (bt) bt.onclick = function () { var d = $('onbDiag'); if (!d) return; d.style.display = d.style.display === 'none' ? 'block' : 'none'; d.textContent = diagText(); };
    setStage(stage == null ? 0 : stage, text);
  }
  function setStage(i, text) {
    curStage = i; stStart = Date.now(); lg('stage ' + (i + 1) + ' ' + (text || STAGES[i]));
    clearTimeout(stT); clearInterval(stI);
    var m = $('onbDataTxt'), b = $('onbBar'), n = $('onbStageNo'), sub = $('onbDataSub');
    if (m) m.textContent = (text || STAGES[i]) + '...';
    if (n) n.textContent = 'المرحلة ' + (i + 1) + ' من ' + STAGES.length;
    if (b) b.style.width = Math.round((i + 0.5) / STAGES.length * 100) + '%';
    if (sub) sub.textContent = '';
    stT = setTimeout(function () {
      function upd() {
        var e = $('onbDataSub'); if (!e || phase !== 'data' || curStage !== i) { clearInterval(stI); return; }
        var sec = Math.round((Date.now() - stStart) / 1000);
        e.textContent = SLOW[i] + ' · ' + sec + ' ث' + (LIMIT[i] ? ' من ' + LIMIT[i] : '');
      }
      upd(); stI = setInterval(upd, 1000);
    }, 5000);
  }
  function dataDone() { clearTimeout(stT); clearInterval(stI); var b = $('onbBar'); if (b) b.style.width = '100%'; }
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
  /* السحابة أحدث من آخر مزامنة للجهاز ده؟ (جهاز تاني رفع بعدنا) */
  function cloudNewer(doc) {
    try {
      var t = doc.data().updated_at, ms = (t && t.toMillis) ? t.toMillis() : 0;
      if (!ms) return true; /* توقيت مش مفهوم: نعتبر السحابة أحدث ونسأل، ما نرفعش فوقها بصمت */
      var last = Date.parse(LS.getItem('app_cloud_last_sync') || '') || 0;
      return ms > last + 90000;
    } catch (e) { return true; }
  }
  /* بيرجّع { ok:true } لو خلّص، أو { fail:true } لو ما قدرناش نقرا/نكتب على السحابة (ما نكمّلش وإحنا مش عارفين إيه عليها) */
  function resolveData(user) {
    var d = D(), uid = user.uid, owner = LS.getItem(OWNER) || '';
    var fresh = ctx.fresh || (Date.now() - parseInt(LS.getItem(FRESH) || '0', 10) < 600000);
    if (!d) return Promise.resolve({ fail: true });
    setStage(1);
    /* التوكن بيتجدد قبل قراءة السحابة: بنفصله عشان نعرف لو التأخير من الحساب نفسه ولا من قراءة البيانات (لو فشل بنكمّل عادي) */
    var tokenP = withTimeout(Promise.resolve().then(function () { return user.getIdToken(); }), 8000).then(function () { lg('token ok'); }, function (e) { lg('token ' + ((e && e.code) || 'err')); });
    return tokenP.then(function () {
      setStage(2);
      return withTimeout(d.collection('users').doc(uid).get(), 12000);
    }).then(function (doc) {
      lg('cloud read ok exists=' + (doc && doc.exists));
      setStage(3);
      var cloudName = doc.exists ? cleanName(doc.data().acctName) : '';
      if (validName(cloudName)) { LS.setItem('app_user_name', cloudName); LS.setItem('sp_name', cloudName); LS.setItem('app_ai_user_name', cloudName); }
      var has = cloudHas(doc), local = hasLocalData();
      /* حساب قديم (عليه بيانات على السحابة، أو مستخدم قديم قبل البوابة): ما نعرضلوش الصورة والقفل تاني، بيلاقيهم في الإعدادات */
      ctx.returning = !!(has || (!owner && !fresh));
      /* القفل محلي لكل جهاز: مستخدم قديم دخل دلوقتي على جهاز جديد بيتعرض عليه خطوة القفل الاختيارية (مش بيورثه من الحساب). مستخدم قديم على جهازه الأصلي (من غير ضغطة دخول) ما بيتسألش */
      ctx.askLock = !!(ctx.returning && fresh);
      /* جهاز كان عليه حساب تاني: بيانات حد تاني، منقلهاش للحساب ده */
      if (owner && owner !== uid) {
        backupLocal(); wipeLocal(); LS.setItem(OWNER, uid); LS.removeItem(FRESH);
        location.reload(); return new Promise(function () { });
      }
      if (!owner && !fresh) { LS.setItem(OWNER, uid); return; }     /* مستخدم قديم كان مسجّل أصلًا: بياناته بتاعته */
      if (local && has) {
        /* الجهاز أصلًا بتاع نفس الحساب والسحابة مش أحدث منه: مفيش تعارض، بيانات الجهاز هي الأحدث */
        if (owner === uid && !cloudNewer(doc)) { setStage(4, 'جاري رفع بيانات الجهاز لحسابك'); return withTimeout(uploadLocal(uid), 15000); }
        return askConflict(doc).then(function (c) {
          showData(c === 'cloud' ? STAGES[4] : 'جاري رفع بيانات الجهاز لحسابك', 4);
          if (c === 'cloud') { restoreCloud(doc); return; }
          return withTimeout(uploadLocal(uid), 15000);
        });
      }
      if (local && !has) { setStage(4, 'جاري رفع بيانات الجهاز لحسابك'); return withTimeout(uploadLocal(uid), 15000); }
      if (!local && has) { setStage(4); restoreCloud(doc); return; }
    }).then(function () { LS.setItem(OWNER, uid); LS.removeItem(FRESH); return { ok: true }; }, function (e) {
      lastErr = String((e && e.code) || (e && e.message) || 'unknown'); lg('FAIL ' + lastErr);
      try { console.warn('onb data', e && e.code); } catch (x) { }
      return { fail: true };
    });
  }
  /* ما قدرناش نوصل لبيانات الحساب: ما نكمّلش ولا نرفع حاجة فوقها */
  function errWhy(c) {
    c = String(c || '');
    if (/permission-denied/.test(c)) return 'السيرفر رفض قراءة بيانات حسابك (صلاحيات قاعدة البيانات)';
    if (/timeout/.test(c)) return 'السيرفر ما ردّش في الوقت المحدد (النت بطيء أو متحجب)';
    if (/unavailable|offline/.test(c)) return 'مش قادرين نوصل لسيرفر البيانات (النت أو شبكة بتحجب الاتصال)';
    if (/unauthenticated/.test(c)) return 'الحساب مش متأكد على السيرفر، جرّب تسجيل الخروج وتدخل تاني';
    return 'سبب غير معروف';
  }
  function showRetry(user) {
    phase = 'retry';
    var owner = LS.getItem(OWNER) || '', mine = !owner || owner === user.uid;
    paint('<div class="hero">' + logo(true) + '<h1>تعذّر الوصول لبيانات حسابك</h1><p>لازم نقرا بيانات حسابك قبل ما نكمّل عشان ما نكتبش فوقها بالغلط. اتأكد من النت وحاول تاني.</p></div>' +
      '<div id="onbMsg" class="msg err" role="alert">' + esc(errWhy(lastErr)) + ' · المحاولة ' + attempt + ' · <span dir="ltr">' + esc(lastErr) + '</span></div>' +
      '<button type="button" class="pri" id="onbRetry">حاول تاني</button>' +
            '<button type="button" class="lnk" id="onbOut">تسجيل الخروج</button>' +
      '<button type="button" class="lnk" id="onbDiagR" style="font-size:.74rem">تفاصيل</button><pre id="onbDiagRP" style="display:none;text-align:left;direction:ltr;font-size:.66rem;max-height:140px;overflow:auto;white-space:pre-wrap"></pre>');
    $('onbDiagR').onclick = function () { var d = $('onbDiagRP'); d.style.display = d.style.display === 'none' ? 'block' : 'none'; d.textContent = diagText(); };
    $('onbRetry').onclick = function () { attempt++; handleUser(user, true); };
    $('onbOut').onclick = function () { try { A().signOut(); } catch (e) { } };
  }

  /* --- الاسم --- */
  function showName() {
    phase = 'name'; var u = ctx.user, pre = storedName() || cleanName(u.displayName || '');
    paint(stepsBar(1) + '<div><h1>اسمك إيه؟</h1><p>اكتب اسمك من كلمتين على الأقل. هيظهر لأصحابك في المنافسة، والمدرب الذكي هيناديك بيه، ومش هنسألك عنه تاني.</p>' + (pre && nameError(pre) ? '<p style="margin-top:6px">الاسم اللي جه من حسابك محتاج يتكمّل: ' + esc(nameError(pre)) + '</p>' : '') + '</div>' +
      '<input type="text" id="onbName" maxlength="30" placeholder="مثلًا: محمد أحمد" autocomplete="name" value="' + esc(pre) + '">' +
      '<div id="onbMsg" class="msg" role="alert"></div><button type="button" class="pri" id="onbNext">متابعة</button>' + outLink());
    bindOut();
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
    paint(backBtn('onbBackStep') + stepsBar(2) + '<div><h1>تحب تضيف صورة؟</h1><p>اختياري. أصحابك هيشوفوها جنب اسمك، وتقدر تغيّرها بعدين من المنافسة.</p></div>' +
      '<label class="av" id="onbAv" tabindex="0">' + (cur ? '<img alt="صورتك" src="' + esc(cur) + '">' : '📷') + '<input type="file" id="onbFile" accept="image/*" hidden></label>' +
      '<div id="onbMsg" class="msg" role="alert"></div>' +
      '<button type="button" class="pri" id="onbNext">' + (cur ? 'متابعة' : 'اختار صورة') + '</button><button type="button" class="lnk" id="onbSkip">تخطي</button>' + outLink());
    bindOut(); $('onbBackStep').onclick = function () { if (!ctx.busy) showName(); };
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
    var ret = !!ctx.returning;
    paint((ret ? '' : backBtn('onbBackStep') + stepsBar(3)) + '<div><h1>' + (ret ? 'تحب تقفل التطبيق على الجهاز ده؟' : 'تحب تقفل التطبيق؟') + '</h1><p>اختياري. لو فعّلته، التطبيق هيطلب بصمة أو كلمة مرور كل ما تفتحه. القفل بيتحفظ على الجهاز ده بس (مش بيتنقل مع حسابك)، فكل جهاز بتظبطه لوحده. تقدر تفعّله أو تلغيه بعدين من الإعدادات.</p></div>' +
      (bioAvailable() ? '<button type="button" class="sec" id="onbBio"><span aria-hidden="true">👆</span> بصمة أو قفل الجهاز</button>' : '') +
      '<button type="button" class="sec" id="onbPw"><span aria-hidden="true">🔒</span> كلمة مرور</button>' +
      '<div id="onbPwBox" style="display:none;flex-direction:column;gap:10px"><input type="password" id="onbP1" placeholder="كلمة المرور" autocomplete="new-password"><input type="password" id="onbP2" placeholder="أعد كتابة كلمة المرور" autocomplete="new-password"><p>6 خانات على الأقل، وفيها حرف ورقم ورمز. لو نسيتها هنرجّعها على إيميل حسابك.</p><button type="button" class="pri" id="onbPwSave">حفظ كلمة المرور</button></div>' +
      '<div id="onbMsg" class="msg" role="alert"></div><button type="button" class="lnk" id="onbSkip">' + (lockOn() ? 'متابعة' : 'تخطي') + '</button>');
    if ($('onbBackStep')) $('onbBackStep').onclick = function () { if (!ctx.busy) showPhoto(); };
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
    $('onbPw').onclick = function () { $('onbPwBox').style.display = 'flex'; $('onbPw').style.display = 'none'; setTimeout(function () { var e = $('onbP1'); if (e) e.focus(); }, 50); };
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
    if (ctx.returning) { if (ctx.askLock && phase !== 'lock' && !lockOn()) { showLock(); return; } finish(); return; }
    if (phase === 'name') { if (!LS.getItem('sp_pic')) { showPhoto(); return; } if (!lockOn()) { showLock(); return; } finish(); return; }
    if (phase === 'photo') { if (!lockOn()) { showLock(); return; } finish(); return; }
    finish();
  }

  /* النت بطيء ومستخدم مسجّل قبل كده: ما نعرضلوش شاشة التسجيل، نستنى الرد */
  function showSlow() {
    phase = 'slow';
    paint('<div class="hero">' + logo() + '<h1>سأنجزها</h1><div class="spin" role="status" aria-label="جاري التحميل"></div><p>بنتأكد من حسابك... النت شكله بطيء، هنكمّل أول ما يرد.</p></div>' +
      '<button type="button" class="lnk" id="onbSlowOut">تسجيل الخروج</button>');
    if ($('onbSlowOut')) $('onbSlowOut').onclick = function () { try { A().signOut(); } catch (e) { } };
  }

  /* --- نقطة الدخول: بعد ما الحساب يتأكد --- */
  function handleUser(user, retry) {
    ctx.user = user; tempBypass = false; openGate();
    var done = LS.getItem(DONE) === user.uid;
    if (done && validName(storedName())) {
      /* مستخدم خلّص الشاشة قبل كده: مفيش حاجة تتعرض */
      if (!LS.getItem(OWNER)) LS.setItem(OWNER, user.uid);
      window.__noCloudPush = false;
      closeGate(); return;
    }
    if (!retry) { dlog = []; t0 = Date.now(); attempt = 1; lastErr = ''; } else lg('--- retry #' + attempt);
    var tStart = Date.now();
    showData(null, 0);
    resolveData(user).then(function (r) {
      if (r && r.fail) {
        /* لو الفشل فوري: نسيب شاشة التقدّم ثانية على الأقل عشان المستخدم يشوف إن الزرار اشتغل */
        var wait = Math.max(0, 1200 - (Date.now() - tStart));
        setTimeout(function () { dataDone(); showRetry(user); }, wait); return;
      }
      if (phase === 'data') setStage(5);
      dataDone();
      window.__noCloudPush = false;
      if (!validName(storedName())) { showName(); return; }
      phase = 'name'; next();
    });
  }

  /* ---------- مكتبات Firebase ما اتحمّلتش (13) ---------- */
  function loadFbProbe() {
    return new Promise(function (res) {
      var el = document.querySelector('script[src*="firebase-app-compat"]');
      var s = document.createElement('script'), done = false;
      function fin(ok) { if (done) return; done = true; try { s.remove(); } catch (e) { } res(ok); }
      s.onload = function () { fin(true); }; s.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 12000);
      s.src = (el && el.src) || 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js';
      document.head.appendChild(s);
    });
  }
  function fbReloadOk() {
    try { var n = parseInt(sessionStorage.getItem('onb_fb_rl') || '0', 10); if (n >= 2) return false; sessionStorage.setItem('onb_fb_rl', String(n + 1)); } catch (e) { }
    return true;
  }
  function showNoFb() {
    openGate(); phase = 'nofb';
    paint('<div class="hero">' + logo() + '<h1>محتاجين اتصال بالإنترنت</h1><p>لازم نحمّل خدمة الحساب عشان تسجّل أول مرة. اتأكد من النت وحاول تاني.</p></div>' + warnHtml() +
      '<div id="onbMsg" class="msg" role="alert"></div><button type="button" class="pri" id="onbRetryFb">حاول تاني</button>');
    bindWarn();
    $('onbRetryFb').onclick = function () {
      busy(true); setMsg('بنحاول نوصل للخدمة...', false);
      loadFbProbe().then(function (ok) { if (ok) { location.reload(); return; } busy(false); setMsg('لسه مش قادرين نوصل. جرّب شبكة تانية أو حاول بعد شوية.', true); });
    };
  }
  function noFirebase() {
    var known = !!(LS.getItem(DONE) || LS.getItem(OWNER)) || hasLocalData();
    if (!known) {
      /* زائر جديد من غير أي بيانات: مينفعش يسجّل من غير الخدمة، نوضّحله بدل ما يدخل التطبيق من غير حساب */
      showNoFb();
      window.addEventListener('online', function () { if (phase === 'nofb' && fbReloadOk()) loadFbProbe().then(function (ok) { if (ok) location.reload(); }); });
      return;
    }
    /* عنده حساب أو بيانات على الجهاز: ما نقفلش عليه، بس نقوله ونحاول تاني لما النت يرجع */
    gateOpen = false; gateEvt(); coverOff(); if (root) { root.remove(); root = null; }
    setTimeout(function () { toast('خدمة الحساب مش متاحة دلوقتي، شغّال ببيانات الجهاز من غير مزامنة ⚠️'); }, 1200);
    window.addEventListener('online', function once() {
      loadFbProbe().then(function (ok) { if (ok) { try { window.removeEventListener('online', once); } catch (e) { } toast('خدمة الحساب رجعت ✅ اقفل التطبيق وافتحه تاني عشان المزامنة تشتغل'); } });
    });
  }
  /* فشل الرجوع من جوجل (redirect) وصل متأخر: نعرضه بدل ما المستخدم يتلخبط */
  window.__onbRedirectErr = function (e) {
    try {
      var c = e && e.code; if (!c || /popup-closed|cancelled/.test(c)) return;
      if (!gateOpen || ctx.user || (A() && A().currentUser)) return;
      busy(false); mode = 'login'; showAuth(errMsg(e));
    } catch (x) { }
  };

  function start() {
    /* نسخة احتياطية من حساب سابق: بتتمسح بعد 14 يوم عشان ما تفضلش بيانات حد على الجهاز للأبد */
    try { var pb = JSON.parse(LS.getItem('app_pre_account_backup') || 'null'); if (pb && pb.at && Date.now() - pb.at > 14 * 864e5) LS.removeItem('app_pre_account_backup'); } catch (e) { }
    try { var pr = parseInt(LS.getItem('app_pre_replace_at') || '0', 10); if (pr && Date.now() - pr > 14 * 864e5) { LS.removeItem('app_pre_replace_backup'); LS.removeItem('app_pre_replace_at'); } } catch (e) { }
    var a = A();
    if (!a || !D()) { noFirebase(); return; }
    showSplash();
    var resolved = false, prev;
    var timer = setTimeout(function () {
      if (resolved) return;
      /* فيه حساب خلّص التسجيل على الجهاز ده: ما نقولوش «إنشاء حساب»، نستنى Firebase يرد */
      if (LS.getItem(DONE)) { showSlow(); return; }
      resolved = true; showWelcome();
    }, 8000);
    a.onAuthStateChanged(function (u) {
      resolved = true; clearTimeout(timer);
      var uid = u ? u.uid : '';
      if (u) { if (uid !== prev || gateOpen) { prev = uid; handleUser(u); } else prev = uid; }
      else {
        prev = ''; ctx.user = null; busy(false);
        if (!tempBypass) {
          var re = window.__redirectErr; window.__redirectErr = null;
          if (re && re.code && !/popup-closed|cancelled/.test(re.code)) { mode = 'login'; showAuth(errMsg(re)); } else showWelcome();
        }
      }
    });
    window.addEventListener('online', function () {
      if (tempBypass && !(A() && A().currentUser)) { tempBypass = false; showAuth('رجع النت. سجّل دخولك عشان تكمّل'); return; }
      /* كنا فاتحين بيانات الجهاز من غير مزامنة: نكمّل تجهيز الحساب دلوقتي */
      if (window.__noCloudPush && !gateOpen && A() && A().currentUser) { toast('رجع النت، بنكمّل تجهيز حسابك'); handleUser(A().currentUser); }
    });
  }

  /* أي كود قديم بينده afterCloudLogin (إعدادات / redirect جوجل) ما يطلعش confirm تاني وإحنا في شاشة البداية */
  try {
    var origAfter = window.afterCloudLogin;
    window.afterCloudLogin = function (u) { if (gateOpen) return Promise.resolve(); return typeof origAfter === 'function' ? origAfter(u) : Promise.resolve(); };
  } catch (e) { }

  function boot() { try { start(); } catch (e) { try { console.warn('onboarding failed', e); } catch (x) { } gateOpen = false; gateEvt(); coverOff(); if (root) { root.remove(); root = null; } } }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
