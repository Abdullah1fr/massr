// نواة التتبع: محاذاة اللي النموذج سمعه على نص السورة + بحث في القرآن كله. بتشتغل في الصفحة وفي الـworker.
(function (root) {
  function buildSurah(REFS, n) {
    let ref = ''; const words = [];
    for (let a = 1; ; a++) {
      const v = REFS.ayat[n + ':' + a]; if (!v) break;
      v.s.forEach(([x, y], i) => words.push({ a: ref.length + x, b: ref.length + y, ay: a, t: v.w[i] }));
      ref += v.p;
    }
    const cw = new Int32Array(ref.length).fill(-1);
    words.forEach((w, i) => cw.fill(i, w.a, w.b));
    let last = 0; for (let i = 0; i < cw.length; i++) { if (cw[i] < 0) cw[i] = last; else last = cw[i]; }
    return { ref, words, cw };
  }
  // القرآن كله في نص واحد (للبحث عن آية مش في السورة الحالية)
  function buildAll(REFS) {
    let ref = ''; const wa = [], wb = [], wsur = [], way = [];
    const sCS = new Int32Array(116), sCE = new Int32Array(116), sWS = new Int32Array(116);
    for (let n = 1; n <= 114; n++) {
      sCS[n] = ref.length; sWS[n] = wa.length;
      for (let a = 1; ; a++) {
        const v = REFS.ayat[n + ':' + a]; if (!v) break;
        for (const [x, y] of v.s) { wa.push(ref.length + x); wb.push(ref.length + y); wsur.push(n); way.push(a); }
        ref += v.p;
      }
      sCE[n] = ref.length;
    }
    const cw = new Int32Array(ref.length).fill(-1);
    for (let i = 0; i < wa.length; i++) cw.fill(i, wa[i], wb[i]);
    let last = 0; for (let i = 0; i < cw.length; i++) { if (cw[i] < 0) cw[i] = last; else last = cw[i]; }
    return { ref, cw, sCS, sCE, sWS, wsur: Uint8Array.from(wsur), way: Uint16Array.from(way) };
  }
  // محاذاة: اللي سمعه كله (heard) على جزء من المرجع [a,b) بدايةً ونهايةً حرّتين
  function align(heard, ref, a, b, pref) {
    const H = heard.length, R = b - a;
    let pc = new Int32Array(R + 1), ps = new Int32Array(R + 1), cc = new Int32Array(R + 1), cs = new Int32Array(R + 1);
    for (let j = 0; j <= R; j++) ps[j] = j;
    for (let i = 1; i <= H; i++) {
      cc[0] = i; cs[0] = 0; const h = heard.charCodeAt(i - 1);
      for (let j = 1; j <= R; j++) {
        let best = pc[j - 1] + (h === ref.charCodeAt(a + j - 1) ? 0 : 1), st = ps[j - 1];
        const d = pc[j] + 1; if (d < best) { best = d; st = ps[j]; }
        const ins = cc[j - 1] + 1; if (ins < best) { best = ins; st = cs[j - 1]; }
        cc[j] = best; cs[j] = st;
      }
      [pc, cc] = [cc, pc]; [ps, cs] = [cs, ps];
    }
    let bj = 1, bc = 1e9, bd = 1e9;
    for (let j = 1; j <= R; j++) { const d = Math.abs(a + j - pref); if (pc[j] < bc || (pc[j] === bc && d < bd)) { bc = pc[j]; bj = j; bd = d; } }
    return { cost: bc, start: a + ps[bj], end: a + bj };
  }
  // أحسن مطابقة لآخر جزء من الكلام: الكل، أو آخر 65%، أو آخر 40% (للإعادة جوه النافذة ولقطع أول النافذة)
  function best(heard, s, a, b, pref) {
    const H = heard.length; let pick = null;
    for (const f of [1, 0.65, 0.4]) {
      const len = f === 1 ? H : Math.round(H * f);
      if (f !== 1 && len < 8) continue;
      const r = align(heard.slice(H - len), s.ref, a, b, pref);
      const F = s.cw[r.start], L = s.cw[r.end - 1];
      const c = { q: 1 - r.cost / len, F, L, n: L - F + 1, len };
      if (!pick || c.q > pick.q + 0.08) pick = c;
    }
    return pick;
  }
  // بحث في القرآن كله ما عدا السورة الحالية (skip). بيرجع أحسن مكان: سورة وآية وكلمة.
  function searchAll(all, heard, skip) {
    const H = heard.length, ranges = skip ? [[0, all.sCS[skip]], [all.sCE[skip], all.ref.length]] : [[0, all.ref.length]];
    let pick = null;
    for (const f of [1, 0.65]) {
      const len = f === 1 ? H : Math.round(H * f);
      if (f !== 1 && len < 10) continue;
      const h = heard.slice(H - len);
      for (const [a, b] of ranges) {
        if (b - a < len) continue;
        const r = align(h, all.ref, a, b, a);
        let F = all.cw[r.start]; const L = all.cw[r.end - 1], sur = all.wsur[L];
        F = Math.max(F, all.sWS[sur]);
        const c = { q: 1 - r.cost / len, surah: sur, ay: all.way[L], F: F - all.sWS[sur], L: L - all.sWS[sur], n: L - F + 1, len };
        if (!pick || c.q > pick.q + 0.08) pick = c;
      }
    }
    return pick || { q: 0, surah: 0, ay: 0, F: 0, L: 0, n: 0, len: 0 };
  }
  class Tracker {
    constructor(s, Q, QG) { this.s = s; this.Q = Q || 0.58; this.QG = QG || 0.7; this.ptr = -1; this.pend = null; this.pendAge = 0; this.lost = 0; this.gp = null; this.tick = 0; }
    switchTo(s, ptr) { this.s = s; this.ptr = ptr; this.pend = null; this.pendAge = 0; this.lost = 0; this.gp = null; }
    // عرض مرشّح من سورة تانية: بيتقبل لو المحلي فاشل، أو لو المرشّح أحسن بوضوح؛ وبيتأكد في عرضين ورا بعض
    offer(c, localQ) {
      const strong = c.n >= 3 && c.q >= 0.75;
      const better = localQ < this.Q || (c.n >= 4 && c.q >= 0.85 && c.q >= localQ + 0.12);
      if (!strong || !better) { this.gp = null; return null; }
      const g = this.gp;
      if (g && this.tick - g.t <= 8 && g.surah === c.surah && Math.abs(g.L - c.L) <= 1) { this.gp = null; return { ev: 'switch', surah: c.surah, ptr: c.L, ay: c.ay }; }
      this.gp = { surah: c.surah, L: c.L, t: this.tick }; return { ev: 'pending-switch' };
    }
    step(heard) {
      const s = this.s, H = heard.length; this.tick++;
      if (H < 8) return { ev: 'silence', ptr: this.ptr };
      if (this.pend !== null && ++this.pendAge > 6) this.pend = null;
      const first = this.ptr < 0;
      const a = first ? 0 : s.words[Math.max(0, this.ptr - 30)].a;
      const b = first ? s.ref.length : s.words[Math.min(s.words.length - 1, this.ptr + 90)].b;
      const pref = first ? 0 : s.words[this.ptr].b;
      let c = best(heard, s, a, b, pref), scope = 'local';
      const okG = x => x.q >= this.QG && (x.n >= 3 || (x.n >= 2 && x.q >= 0.72));
      const bad = x => ({ q: x.q, F: x.F, L: x.L, n: x.n, ev: this.lost >= 3 ? 'lost' : 'unclear', ptr: this.ptr });
      if (first) {
        if (!okG(c)) { this.lost++; return { ...bad(c), ptr: -1 }; }
      } else if (c.q < 0.8) {
        const g = best(heard, s, 0, s.ref.length, pref);
        if (okG(g) && g.q > c.q + 0.1 && Math.abs(g.L - this.ptr) > 6) { c = g; scope = 'global'; }
        else if (c.q < this.Q) { this.lost++; return bad(c); }
      }
      const { q, F, L, n } = c, base = { q, F, L, n };
      let ev = 'forward', confirm = false;
      if (this.ptr >= 0) {
        if (scope === 'global' && Math.abs(L - this.ptr) > 6) { ev = 'relocate'; confirm = true; }
        else if (L < this.ptr - 1) { if (n < 3 && !(n >= 2 && q >= 0.85)) return { ...base, ev: 'ignored', ptr: this.ptr }; ev = 'back'; confirm = true; }
        else if (L > this.ptr + 6) { ev = 'jump'; confirm = true; }
      }
      if (confirm && !(this.pend !== null && Math.abs(this.pend - L) <= 1)) { this.pend = L; return { ...base, ev: 'pending-' + ev, ptr: this.ptr }; }
      this.ptr = (ev === 'forward' && this.ptr >= 0) ? Math.max(this.ptr, L) : L;
      this.pend = null; this.pendAge = 0; this.lost = 0; return { ...base, ev, ptr: this.ptr };
    }
  }
  const Core = { buildSurah, buildAll, align, searchAll, Tracker };
  root.TajweedCore = Core;
  if (typeof module !== 'undefined') module.exports = Core;
})(typeof self !== 'undefined' ? self : globalThis);
