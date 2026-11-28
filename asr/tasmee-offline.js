/* التسميع الأوفلاين داخل التطبيق.
   - ضغطة عادية على زرار «تسميع»: لو الوضع أوفلاين بتفتح صفحة التسميع الأوفلاين فوق التطبيق، ولو أونلاين بتشتغل الدالة الأصلية زي ما هي.
   - ضغطة مطوّلة على الزرار: بيطلع فوقه ميكروفون بلون الوضع التاني (أخضر أوفلاين / أزرق أونلاين)، تسحب لفوق وتسيب أو تدوس عليه فيتبدّلوا.
   - بتتحمّل من sw.js في كل فتحة، ومبتغيّرش حاجة في كود التطبيق. */
(function () {
  'use strict';
/* ===== التسميع الأونلاين: تعرّف سحابي من المتصفح بدل نموذج Whisper (120 ميجا) =====
   بيستبدل window.OfflineASR بنفس واجهته (supported/load/start/stop)، فتسميع التطبيق الأصلي بيشتغل زي ما هو من غير تحميل أي نموذج.
   لو المتصفح مالوش SpeechRecognition بيرجع للنموذج القديم لو لسه موجود. */
(function () {
  if (window.__asrShim) return; window.__asrShim = 1;
  const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
  let real = window.OfflineASR, sess = null, base = 0;
  const shim = {
    supported() { return !!SRC || !!(real && real.supported && real.supported()); },
    load(cb) { if (!SRC && real) return real.load(cb); if (cb) try { cb(100, 'cloud'); } catch (e) {} return Promise.resolve(); },
    isReady() { return SRC ? true : !!(real && real.isReady && real.isReady()); },
    start(h) {
      if (!SRC) return real.start(h);
      shim.stop();
      const s = sess = { alive: true, h, rec: null, opened: false };
      return new Promise((res, rej) => {
        const fire = msg => { if (s.alive && h.onError) try { h.onError(msg); } catch (e) {} };
        const begin = () => {
          if (!s.alive) return;
          const r = s.rec = new SRC(); r.lang = 'ar-SA'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
          r.onstart = () => { if (!s.opened) { s.opened = true; res(true); } };
          r.onresult = e => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const t = (e.results[i][0] && e.results[i][0].transcript || '').trim();
              if (t && s.alive) try { h.onText(base + i, t, !!e.results[i].isFinal); } catch (x) {}
            }
          };
          r.onerror = e => {
            const c = e && e.error;
            if (c === 'not-allowed' || c === 'service-not-allowed') { s.alive = false; const m = 'محتاجين إذن الميكروفون 🎙️⚠️'; if (!s.opened) rej(new Error(m)); else if (h.onError) h.onError(m); }
            else if (c === 'network') { s.alive = false; const m = 'التسميع الأونلاين محتاج نت. اختار أوفلاين من الضغطة المطوّلة على زرار تسميع.'; if (!s.opened) rej(new Error(m)); else if (h.onError) h.onError(m); }
            else if (c === 'audio-capture') { s.alive = false; const m = 'مفيش ميكروفون متاح ⚠️'; if (!s.opened) rej(new Error(m)); else if (h.onError) h.onError(m); }
          };
          r.onend = () => { if (!s.alive) return; base += 1000; setTimeout(begin, 120); };   // المتصفح بيقفل الجلسة بعد سكوت: بنفتحها تاني لوحدنا
          try { r.start(); } catch (e) { if (!s.opened) { s.alive = false; rej(e); } }
        };
        begin();
      });
    },
    stop() { const s = sess; if (!s) { if (!SRC && real && real.stop) real.stop(); return; } sess = null; s.alive = false; try { s.rec && s.rec.abort(); } catch (e) {} },
    _makeSegmenter: (...a) => real && real._makeSegmenter ? real._makeSegmenter(...a) : null
  };
  try {
    Object.defineProperty(window, 'OfflineASR', { configurable: true, get() { return shim; }, set(v) { real = v; } });
  } catch (e) { window.OfflineASR = shim; }
  // تنظيف نسخة Whisper المتخزّنة على الموبايل (120 ميجا) أول ما التعرف السحابي يبقى متاح
  if (SRC && window.caches) {
    (async () => {
      try {
        const c = await caches.open('asr-models-v1'), ks = await c.keys();
        await Promise.all(ks.filter(r => /\/asr\/models\/quran-tiny\//.test(r.url)).map(r => c.delete(r)));
      } catch (e) {}
    })();
  }
})();

/* منتقي أوفلاين/أونلاين: ضغطة مطوّلة تطلّع ميكروفون بلون الوضع التاني فوق الزرار بالظبط، تسحب لفوق وتسيب (أو تدوس عليه) فيتبدّلوا بأنيميشن */
function makeChooser(getEng, onPick) {
  const COL = { offline: '#1f8a5b', online: '#2d6cdf' }, NM = { offline: 'أوفلاين', online: 'أونلاين' }, oth = e => e === 'offline' ? 'online' : 'offline';
  if (!document.getElementById('ecStyle')) {
    const s = document.createElement('style'); s.id = 'ecStyle';
    s.textContent = '.ecRoot{position:fixed;inset:0;z-index:2147483200;touch-action:none;-webkit-user-select:none;user-select:none}.ecM{position:fixed;border-radius:50%;display:grid;place-items:center;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.3),0 0 0 4px rgba(255,255,255,.85);will-change:transform,opacity}.ecM span{font-size:55%;line-height:1;filter:grayscale(1) brightness(3)}.ecL{position:fixed;transform:translateX(-50%);white-space:nowrap;background:#2b2b2b;color:#fff;font:700 12px system-ui,sans-serif;padding:4px 10px;border-radius:10px;pointer-events:none;will-change:opacity}';
    document.head.appendChild(s);
  }
  let root = null, tg = null, lb = null, st = null, dead = 0, busy = false, tm = null;
  const near = (x, y) => st && Math.hypot(x - st.x, y - st.y) < st.S * 0.95;
  function mk(eng) { const d = document.createElement('div'); d.className = 'ecM'; d.style.cssText = 'width:' + st.S + 'px;height:' + st.S + 'px;left:' + (st.x - st.S / 2) + 'px;top:' + (st.y - st.S / 2) + 'px;background:' + COL[eng]; d.innerHTML = '<span>🎙️</span>'; return d; }
  function close() { clearTimeout(tm); if (root) { root.remove(); root = tg = lb = st = null; } busy = false; }
  function pick() {
    if (!root || busy) return; busy = true; clearTimeout(tm);
    const cur = getEng(), nx = oth(cur), dx = st.bx - st.x, dy = st.by - st.y;
    const ghost = mk(cur); ghost.style.left = (st.bx - st.S / 2) + 'px'; ghost.style.top = (st.by - st.S / 2) + 'px'; root.appendChild(ghost);
    const ease = 'cubic-bezier(.3,1.3,.5,1)', D = 420;
    try {
      lb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      tg.animate([{ transform: 'translate(0,0) rotate(0) scale(1.1)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(360deg) scale(1)' }], { duration: D, easing: ease, fill: 'forwards' });
      ghost.animate([{ transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 }, { transform: 'translate(' + (-dx) + 'px,' + (-dy) + 'px) rotate(-360deg) scale(.8)', opacity: 0 }], { duration: D, easing: ease, fill: 'forwards' });
    } catch (e) {}
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    setTimeout(() => { onPick(nx); close(); }, D + 30);
  }
  return {
    get on() { return !!root; },
    open(btn) {
      if (root) close();
      const r = btn.getBoundingClientRect(), S = Math.max(46, Math.min(64, Math.min(r.width, r.height) || 56)), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      const up = r.top > S + 40, x = Math.min(Math.max(bx, S / 2 + 8), innerWidth - S / 2 - 8), y = up ? r.top - S / 2 - 12 : r.bottom + S / 2 + 12;
      st = { S, x, y, bx, by }; root = document.createElement('div'); root.className = 'ecRoot';
      tg = mk(oth(getEng())); lb = document.createElement('div'); lb.className = 'ecL'; lb.textContent = NM[oth(getEng())];
      lb.style.left = x + 'px'; lb.style.top = (up ? y - S / 2 - 30 : y + S / 2 + 6) + 'px';
      root.appendChild(tg); root.appendChild(lb); document.body.appendChild(root);
      root.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (near(e.clientX, e.clientY)) pick(); else close(); }, true);
      try { tg.animate([{ transform: 'translate(0,' + (up ? 28 : -28) + 'px) scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)' }); lb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
      tm = setTimeout(close, 7000);
    },
    move(x, y) { if (!root || busy) return; try { tg.style.transform = near(x, y) ? 'scale(1.18)' : 'none'; } catch (e) {} },
    release(x, y, cancel) { if (!root || busy) return; if (!cancel && near(x, y)) pick(); /* غير كده بتفضل مفتوحة: دوس عليها أو دوس برّه */ }
  };
}

  if (window.__tasmeeOff) return; window.__tasmeeOff = 1;
  const K = 'tasmeeCfg4', PAGE = new URL('asr/tajweed-final5.html', location.href).href;
  const NAMES = 'الفاتحة،البقرة،آل عمران،النساء،المائدة،الأنعام،الأعراف،الأنفال،التوبة،يونس،هود،يوسف،الرعد،إبراهيم،الحجر،النحل،الإسراء،الكهف،مريم،طه،الأنبياء،الحج،المؤمنون،النور،الفرقان،الشعراء،النمل،القصص،العنكبوت،الروم،لقمان،السجدة،الأحزاب،سبأ،فاطر،يس،الصافات،ص،الزمر،غافر،فصلت،الشورى،الزخرف،الدخان،الجاثية،الأحقاف،محمد،الفتح،الحجرات،ق،الذاريات،الطور،النجم،القمر،الرحمن،الواقعة،الحديد،المجادلة،الحشر،الممتحنة،الصف،الجمعة،المنافقون،التغابن،الطلاق،التحريم،الملك،القلم،الحاقة،المعارج،نوح،الجن،المزمل،المدثر،القيامة،الإنسان،المرسلات،النبأ،النازعات،عبس،التكوير،الانفطار،المطففين،الانشقاق،البروج،الطارق،الأعلى،الغاشية،الفجر،البلد،الشمس،الليل،الضحى،الشرح،التين،العلق،القدر،البينة،الزلزلة،العاديات،القارعة،التكاثر،العصر،الهمزة،الفيل،قريش،الماعون،الكوثر،الكافرون،النصر،المسد،الإخلاص،الفلق،الناس'.split('،');
  const norm = s => String(s).replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const NN = NAMES.map(norm);
  const getCfg = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
  const setCfg = o => { try { localStorage.setItem(K, JSON.stringify(Object.assign(getCfg(), o))); } catch (e) {} };
  const engine = () => getCfg().engine === 'online' ? 'online' : 'offline';
  const ENG = { offline: 'أوفلاين', online: 'أونلاين' }, ICO = { offline: '📴', online: '🌐' }, other = e => e === 'offline' ? 'online' : 'offline';
  let bypass = false, wrap = null, lastBtn = null, pt = null, longFired = false, down = null;
  const COL = { offline: '#1f8a5b', online: '#2d6cdf' };

  // ---------- إيجاد زرار التسميع ----------
  function matches(e) {
    const tx = (e.textContent || '').trim(); if (tx.length > 40) return false;
    const lab = (e.getAttribute && ((e.getAttribute('aria-label') || '') + ' ' + (e.title || ''))) || '';
    const meta = (e.id || '') + ' ' + (typeof e.className === 'string' ? e.className : '');
    return /تسميع/.test(tx + ' ' + lab) || /tasme|tasmi/i.test(meta);
  }
  function clickable(e) { return e.matches && e.matches('button,a,[role=button],[onclick]'); }
  function findBtn(t) {
    for (let e = t, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) {
      if (e.closest && e.closest('#tsmWrap,.ecRoot')) return null;
      if (clickable(e) && matches(e)) return e;
    }
    return null;
  }
  // ---------- السورة اللي إنت فيها (من عنوان «سورة …» الأقرب للزرار) ----------
  function curSurah(near) {
    const r = near.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = 0, bd = 1e9;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue; if (!t || t.length > 40 || t.indexOf('سور') < 0) continue;
      const m = norm(t).match(/^سوره (.+)$/); if (!m) continue;
      const i = NN.indexOf(m[1]); if (i < 0) continue;
      const p = n.parentElement; if (!p || p.closest('#tsmWrap')) continue;
      const b = p.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const d = Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy); if (d < bd) { bd = d; best = i + 1; }
    }
    return best;
  }
  // ---------- الصفحة فوق التطبيق ----------
  function open(btn) {
    if (wrap) return;
    const sur = curSurah(btn) || getCfg().sur || 1; setCfg({ sur }); lastBtn = btn;
    wrap = document.createElement('div'); wrap.id = 'tsmWrap';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#fdfbf6;transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.9,.3,1)';
    const f = document.createElement('iframe'); f.src = PAGE + '?embed=1&sur=' + sur; f.allow = 'microphone; screen-wake-lock; autoplay';
    f.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#fdfbf6'; wrap.appendChild(f); document.body.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (wrap) wrap.style.transform = 'none'; }));
    try { history.pushState({ tsm: 1 }, ''); } catch (e) {}
  }
  function close(popped) {
    if (!wrap) return; const w = wrap; wrap = null; w.style.transform = 'translateY(100%)'; setTimeout(() => w.remove(), 340);
    if (!popped) { try { if (history.state && history.state.tsm) history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', () => { if (wrap) close(true); });
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || !e.data.tasmee) return;
    if (e.data.tasmee === 'close') close();
    else if (e.data.tasmee === 'online') { const b = lastBtn; close(); setTimeout(() => { if (b && b.isConnected) { bypass = true; try { b.click(); } finally { bypass = false; } } }, 420); }
  });
  // ---------- التقاط الضغطات ----------
  const CH = makeChooser(engine, eng => { setCfg({ engine: eng }); badges(); });
  window.addEventListener('pointerdown', e => {
    if (wrap || CH.on) return; const b = findBtn(e.target); if (!b) return;
    longFired = false; down = { x: e.clientX, y: e.clientY }; clearTimeout(pt); pt = setTimeout(() => { longFired = true; CH.open(b); }, 420);
  }, true);
  window.addEventListener('pointermove', e => {
    if (CH.on) { CH.move(e.clientX, e.clientY); return; }
    if (pt && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) { clearTimeout(pt); pt = null; }
  }, true);
  window.addEventListener('pointerup', e => { clearTimeout(pt); pt = null; if (CH.on) CH.release(e.clientX, e.clientY, false); }, true);
  window.addEventListener('pointercancel', e => { clearTimeout(pt); pt = null; if (CH.on) CH.release(e.clientX, e.clientY, true); }, true);
  window.addEventListener('contextmenu', e => { if (findBtn(e.target)) e.preventDefault(); }, true);
  window.addEventListener('touchmove', e => { if (CH.on) e.preventDefault(); }, { passive: false, capture: true });
  window.addEventListener('click', e => {
    if (bypass) return; const b = findBtn(e.target); if (!b) return;
    if (longFired) { e.preventDefault(); e.stopImmediatePropagation(); longFired = false; return; }
    if (engine() === 'online') return;
    e.preventDefault(); e.stopImmediatePropagation(); open(b);
  }, true);
  const st = document.createElement('style');
  st.textContent = '.tsmBadge{position:absolute;left:50%;top:100%;transform:translateX(-50%);font:700 10px system-ui,sans-serif;white-space:nowrap;pointer-events:none;transition:color .3s}';
  document.head.appendChild(st);
  // ---------- كلمة «أوفلاين/أونلاين» تحت الزرار ----------
  function badges() {
    document.querySelectorAll('button,[role=button],a,[onclick]').forEach(b => {
      if (b.closest('#tsmWrap') || !matches(b)) return;
      let t = b.querySelector(':scope > .tsmBadge');
      if (!t) { if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; t = document.createElement('span'); t.className = 'tsmBadge'; b.appendChild(t); }
      const v = ENG[engine()]; if (t.textContent !== v) t.textContent = v; t.style.color = COL[engine()];
    });
  }
  let bt = null; const sched = () => { if (bt) return; bt = setTimeout(() => { bt = null; try { badges(); } catch (e) {} }, 1200); };
  try { new MutationObserver(sched).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  sched();
})();
