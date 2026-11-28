// نواة التتبع v5: مطابقة "هيكلية" (من غير حركات) + سلسلة صوت متصلة + حكم على كل كلمة + بحث في القرآن كله.
// بتشتغل في الصفحة وفي الـworker.
(function (root) {
  'use strict';
  // ---------- الهيكل: شيل الحركات والهمزة، وحّد المدود، وكرّر الحرف المتتالي مرة واحدة ----------
  function mapc(c) {
    const k = c.charCodeAt(0);
    if ((k >= 0x64B && k <= 0x65F) || k === 0x670 || k === 0x640 || (k >= 0x6D6 && k <= 0x6E4) || (k >= 0x6E7 && k <= 0x6ED)) return '';
    if (k === 0x621 || k === 0x623 || k === 0x625 || k === 0x20 || k === 0x200C || k === 0x200D) return '';
    if (k === 0x6E5 || k === 0x6E6 || k === 0x627 || k === 0x649) return 'ا';
    if (k === 0x6BA) return 'ن';
    return c;
  }
  function skel(str) {
    let out = '', last = '';
    for (let i = 0; i < str.length; i++) { const m = mapc(str[i]); if (!m || m === last) continue; out += m; last = m; }
    return out;
  }
  // ---------- بناء السورة والقرآن ----------
  function buildSurah(REFS, n) {
    let ref = ''; const words = [];
    for (let a = 1; ; a++) {
      const v = REFS.ayat[n + ':' + a]; if (!v) break;
      v.s.forEach(([x, y], i) => words.push({ a: ref.length + x, b: ref.length + y, ay: a, t: v.w[i], sa: 0, sb: 0 }));
      ref += v.p;
    }
    const cw = new Int32Array(ref.length).fill(-1);
    words.forEach((w, i) => cw.fill(i, w.a, w.b));
    let last = 0; for (let i = 0; i < cw.length; i++) { if (cw[i] < 0) cw[i] = last; else last = cw[i]; }
    let sk = '', lc = ''; const skw = [];
    for (let i = 0; i < ref.length; i++) { const m = mapc(ref[i]); if (!m || m === lc) continue; sk += m; skw.push(cw[i]); lc = m; }
    const arr = Int32Array.from(skw);
    // مدى الهيكل لكل كلمة
    let p = 0;
    for (let i = 0; i < words.length; i++) { while (p < arr.length && arr[p] < i) p++; words[i].sa = p; while (p < arr.length && arr[p] === i) p++; words[i].sb = p; }
    return { sk, skw: arr, words };
  }
  function buildAll(REFS) {
    let sk = '', lc = ''; const skw = [], wsur = [], way = [], sS = new Int32Array(116), sE = new Int32Array(116), sWS = new Int32Array(116);
    let wc = 0;
    for (let n = 1; n <= 114; n++) {
      sS[n] = sk.length; sWS[n] = wc; let refLen = 0; const cwloc = [];
      let ref = '', words = [];
      for (let a = 1; ; a++) {
        const v = REFS.ayat[n + ':' + a]; if (!v) break;
        v.s.forEach(([x, y]) => words.push({ a: ref.length + x, b: ref.length + y, ay: a }));
        ref += v.p;
      }
      const cw = new Int32Array(ref.length).fill(-1);
      words.forEach((w, i) => cw.fill(i, w.a, w.b));
      let l = 0; for (let i = 0; i < cw.length; i++) { if (cw[i] < 0) cw[i] = l; else l = cw[i]; }
      words.forEach(w => { wsur.push(n); way.push(w.ay); });
      for (let i = 0; i < ref.length; i++) { const m = mapc(ref[i]); if (!m || m === lc) continue; sk += m; skw.push(wc + cw[i]); lc = m; }
      wc += words.length; sE[n] = sk.length;
    }
    return { sk, skw: Int32Array.from(skw), wsur: Uint8Array.from(wsur), way: Uint16Array.from(way), sS, sE, sWS };
  }
  // ---------- المحاذاة ----------
  // اللي سمعه كله (h) على جزء من المرجع [a,b): بدايةً ونهايةً حرّتين. بيرجّع آخر صف من التكاليف ونقط البداية.
  function scan(h, ref, a, b) {
    const H = h.length, R = b - a;
    let pc = new Int32Array(R + 1), ps = new Int32Array(R + 1), cc = new Int32Array(R + 1), cs = new Int32Array(R + 1);
    for (let j = 0; j <= R; j++) ps[j] = j;
    for (let i = 1; i <= H; i++) {
      cc[0] = i; cs[0] = 0; const hc = h.charCodeAt(i - 1);
      for (let j = 1; j <= R; j++) {
        let best = pc[j - 1] + (hc === ref.charCodeAt(a + j - 1) ? 0 : 1), st = ps[j - 1];
        const d = pc[j] + 1; if (d < best) { best = d; st = ps[j]; }
        const ins = cc[j - 1] + 1; if (ins < best) { best = ins; st = cs[j - 1]; }
        cc[j] = best; cs[j] = st;
      }
      let t = pc; pc = cc; cc = t; t = ps; ps = cs; cs = t;
    }
    return { pc, ps, R };
  }
  function pickEnd(sc, a, pref) {
    let bj = 1, bc = 1e9, bd = 1e9;
    for (let j = 1; j <= sc.R; j++) { const d = Math.abs(a + j - pref); if (sc.pc[j] < bc || (sc.pc[j] === bc && d < bd)) { bc = sc.pc[j]; bj = j; bd = d; } }
    return { cost: bc, start: a + sc.ps[bj], end: a + bj, j: bj };
  }
  function align(h, ref, a, b, pref) { return pickEnd(scan(h, ref, a, b), a, pref); }
  // مطابقة كاملة بالتتبّع للخلف: بترجّع لكل حرف مرجعي (0 مطابق، 1 استبدال، 2 محذوف) وعدد الحروف الزايدة قبل كل موضع
  function trace(h, ref, a, b) {
    const H = h.length, R = b - a, W = R + 1, dir = new Uint8Array((H + 1) * W);
    let prev = new Int32Array(W), cur = new Int32Array(W);
    for (let j = 1; j <= R; j++) { prev[j] = j; dir[j] = 3; }
    for (let i = 1; i <= H; i++) {
      cur[0] = i; dir[i * W] = 2; const hc = h.charCodeAt(i - 1);
      for (let j = 1; j <= R; j++) {
        let best = prev[j - 1] + (hc === ref.charCodeAt(a + j - 1) ? 0 : 1), d = 1;
        const up = prev[j] + 1; if (up < best) { best = up; d = 2; }
        const left = cur[j - 1] + 1; if (left < best) { best = left; d = 3; }
        cur[j] = best; dir[i * W + j] = d;
      }
      const t = prev; prev = cur; cur = t;
    }
    const st = new Uint8Array(R), ins = new Uint8Array(R + 1);
    let i = H, j = R;
    while (i > 0 || j > 0) {
      const d = dir[i * W + j];
      if (i > 0 && j > 0 && d === 1) { st[j - 1] = h.charCodeAt(i - 1) === ref.charCodeAt(a + j - 1) ? 0 : 1; i--; j--; }
      else if (i > 0 && (d === 2 || j === 0)) { ins[j] = Math.min(255, ins[j] + 1); i--; }
      else { st[j - 1] = 2; j--; }
    }
    return { st, ins };
  }
  // أحسن مطابقة لآخر جزء من الكلام: الكل، 75%، 50%، 30% (للإعادة جوه الكلام وقطع الأول)
  const FR = [1, 0.75, 0.5, 0.3];
  function best(h, s, a, b, pref) {
    const H = h.length; let pick = null;
    for (const f of FR) {
      const len = f === 1 ? H : Math.round(H * f);
      if (f !== 1 && len < 8) continue;
      const hh = h.slice(H - len);
      const r = align(hh, s.sk, a, b, pref);
      const F = s.skw[r.start], L = s.skw[r.end - 1];
      const c = { q: 1 - r.cost / len, F, L, n: L - F + 1, len, start: r.start, end: r.end, h: hh };
      if (!pick || c.q > pick.q + 0.08) pick = c;
    }
    return pick;
  }
  // حكم على كل كلمة وقعت كلها جوه المدى المحاذي
  function judge(s, c) {
    const { st, ins } = trace(c.h, s.sk, c.start, c.end), out = [];
    for (let i = c.F; i <= c.L; i++) {
      const w = s.words[i]; if (w.sa < c.start || w.sb > c.end) continue;
      const len = w.sb - w.sa; if (len < 2) continue;
      let m = 0, sub = 0, del = 0, extra = 0;
      for (let p = w.sa; p < w.sb; p++) { const x = st[p - c.start]; if (x === 0) m++; else if (x === 1) sub++; else del++; }
      for (let p = w.sa + 1; p < w.sb; p++) extra += ins[p - c.start];
      const e = sub + del + extra, score = Math.max(0, 1 - e / len);
      out.push({ i, score, kind: (del >= 0.6 * len && sub + extra <= 1) ? 'missing' : 'wrong' });
    }
    return out;
  }
  // ---------- بحث في القرآن كله (ما عدا السورة الحالية) ----------
  const SFR = [1, 0.6, 0.35];
  function searchAll(all, h, skip) {
    const H0 = h.length, N = all.sk.length;
    const ranges = skip ? [[0, all.sS[skip]], [all.sE[skip], N]] : [[0, N]];
    let pick = null;
    for (const f of SFR) {
      const len = f === 1 ? H0 : Math.round(H0 * f);
      if (f !== 1 && len < 16) continue;
      const hh = h.slice(H0 - len);
      let b1 = null, c2 = 1e9;
      const scs = ranges.filter(([a, b]) => b - a > len).map(([a, b]) => ({ a, sc: scan(hh, all.sk, a, b) }));
      for (const { a, sc } of scs) { const r = pickEnd(sc, a, a); if (!b1 || r.cost < b1.cost) b1 = { ...r, sc, a }; }
      if (!b1) continue;
      const gap = len + 10, jb = b1.a + b1.j;
      for (const { a, sc } of scs) for (let j = 1; j <= sc.R; j++) { if (Math.abs(a + j - jb) > gap && sc.pc[j] < c2) c2 = sc.pc[j]; }
      const F0 = all.skw[b1.start], L = all.skw[b1.end - 1], sur = all.wsur[L], F = Math.max(F0, all.sWS[sur]);
      const c = { q: 1 - b1.cost / len, margin: (c2 - b1.cost) / len, surah: sur, ay: all.way[L], F: F - all.sWS[sur], L: L - all.sWS[sur], n: L - F + 1, len };
      if (!pick || c.q > pick.q + 0.08) pick = c;
    }
    return pick || { q: 0, margin: 0, surah: 0, ay: 0, F: 0, L: 0, n: 0, len: 0 };
  }
  // ---------- سلسلة الصوت المتصلة: كل تحليل بيستبدل الجزء الأحدث من الكلام (من غير تكرار النوافذ) ----------
  class Stream {
    constructor() { this.ch = []; this.edge = 0.5; this.cutT = -1; }
    // الكلام اللي اتحكم عليه خلاص: ما يتحسبش تاني (بنسيب ثانية تداخل علشان الكلمة اللي لسه بتتقال)
    consume(now, overlap) { this.cutT = now - (overlap === undefined ? 1.0 : overlap); }
    // times: وقت كل رمز بالنسبة لبداية النافذة. winStart: وقت بداية النافذة (ث) من أول التسجيل
    feed(script, times, winStart, isFirst) {
      const cut = isFirst ? -1 : winStart + this.edge;
      while (this.ch.length && this.ch[this.ch.length - 1].t >= cut) this.ch.pop();
      for (let i = 0; i < script.length; i++) { const t = winStart + times[i]; if (t >= cut) this.ch.push({ c: script[i], t }); }
      const old = winStart - 40; let k = 0; while (k < this.ch.length && this.ch[k].t < old) k++; if (k) this.ch.splice(0, k);
    }
    tail(sec, now) { let s = ''; const from = Math.max(now - sec, this.cutT); for (const x of this.ch) if (x.t >= from) s += x.c; return s; }
    lastT() { return this.ch.length ? this.ch[this.ch.length - 1].t : -1; }
  }
  // ---------- المتتبّع ----------
  // وضعين: train (متساهل، بيمشي وراك في أي مكان) و test (صارم: الآية الجاية بس، وبتبدأ من أولها)
  class Tracker {
    constructor(s, opt) { this.opt = Object.assign({ Q: 0.55, QG: 0.7, QT: 0.6, T: 0.6, mode: 'train', lo: 0, hi: s.words.length - 1 }, opt || {}); this.tick = 0; this.switchTo(s, -1); }
    switchTo(s, ptr) {
      this.s = s; this.ptr = ptr; this.pend = null; this.pendAge = 0; this.lost = 0; this.gp = null; this.ig = null; this.V = new Map(); this.P = new Set();
      const W = s.words, nAy = W.length ? W[W.length - 1].ay : 0; this.nAy = nAy;
      this.ayS = new Int32Array(nAy + 2).fill(-1); this.ayE = new Int32Array(nAy + 2).fill(-1);
      W.forEach((w, i) => { if (this.ayS[w.ay] < 0) this.ayS[w.ay] = i; this.ayE[w.ay] = i; });
    }
    setT(T) { this.opt.T = T; }
    setMode(m) { this.opt.mode = m; this.pend = null; this.ig = null; }
    setRange(lo, hi) { this.opt.lo = lo; this.opt.hi = hi; if (this.opt.mode === 'test' && this.ptr >= 0 && (this.ptr < lo || this.ptr > hi)) this.ptr = -1; }
    status(i) { const v = this.V.get(i); if (!v) return null; return v.best >= this.opt.T ? 'ok' : v.kind; }
    record(list) {
      const ch = [];
      for (const j of list) {
        let v = this.V.get(j.i);
        if (!v) { v = { first: j.score, best: j.score, kind: j.kind, n: 1 }; this.V.set(j.i, v); }
        else { v.n++; if (j.score > v.best) { v.best = j.score; v.kind = j.kind; } if (v.skip && j.score > 0) v.skip = false; }
        ch.push(j.i);
      }
      return ch;
    }
    markMissing(i, skip) { if (this.V.has(i)) return false; this.V.set(i, { first: 0, best: 0, kind: 'missing', n: 1, skip: !!skip }); return true; }
    ayLen(ay) { if (ay < 1 || ay > this.nAy) return 99; const W = this.s.words; return W[this.ayE[ay]].sb - W[this.ayS[ay]].sa; }
    offer(c, lq) {
      if (lq >= 0.65) { this.gp = null; return null; }
      const ok = c.len >= 18 && c.n >= 4 && ((c.q >= 0.8 && c.margin >= 0.08) || (c.q >= 0.62 && c.margin >= 0.2)) && c.q >= lq + 0.1;
      if (!ok) { this.gp = null; return null; }
      const g = this.gp;
      if (g && this.tick - g.t <= 10 && g.surah === c.surah && c.L >= g.L - 1 && c.L <= g.L + 12) { this.gp = null; return { ev: 'switch', surah: c.surah, ptr: c.L, ay: c.ay }; }
      this.gp = { surah: c.surah, L: c.L, t: this.tick }; return { ev: 'pending-switch' };
    }
    step(h) { return this.opt.mode === 'test' ? this.stepTest(h) : this.stepTrain(h); }
    // ----- الاختبار: الآية الجاية بس. أي كلام برّه الترتيب بيتجاهل (ما بيتكتبش) -----
    stepTest(h) {
      const s = this.s, W = s.words, N = s.sk.length, lo = this.opt.lo, hi = this.opt.hi; this.tick++;
      const cur = this.ptr < 0 ? null : W[this.ptr].ay, loAy = W[lo] ? W[lo].ay : 1, hiAy = W[hi] ? W[hi].ay : this.nAy;
      const nxtAy = cur === null ? loAy : cur + 1, want = Math.min(nxtAy, hiAy);
      const need = Math.max(2, Math.min(6, this.ayLen(nxtAy)));
      if (h.length < need) return { ev: 'silence', ptr: this.ptr, want };
      if (this.pend !== null && ++this.pendAge > 6) this.pend = null;
      let a, b, pref;
      if (cur === null) { a = 0; b = N; pref = W[lo].sa; }
      else { a = W[Math.max(0, this.ptr - 40)].sa; b = W[Math.min(W.length - 1, this.ptr + 150)].sb; pref = W[this.ptr].sb; }
      let c = best(h, s, a, b, pref);
      if (c.q < 0.8 && !(a === 0 && b === N)) { const g = best(h, s, 0, N, pref); if (g.q > c.q + 0.1 && Math.abs(g.L - Math.max(this.ptr, 0)) > 6) c = g; }
      const base = { q: c.q, F: c.F, L: c.L, n: c.n, want };
      const F = c.F, L = c.L, aF = W[F].ay; let kind;
      if (cur !== null && aF === cur) kind = L < this.ptr - 1 ? 'back' : 'inside';
      else if (cur !== null && aF < cur) kind = 'back';
      else if (aF < nxtAy) kind = 'before';
      else if (aF > hiAy) kind = 'out';
      else if (aF === nxtAy) kind = F <= this.ayS[nxtAy] + 1 ? 'next' : 'mid';
      else kind = 'ahead';
      let solid = c.q >= this.opt.QT && (c.n >= 3 || (c.n >= 2 && c.q >= 0.8 && c.len >= 8) || (c.n >= 1 && c.q >= 0.85 && c.len >= Math.min(8, need)));
      // المكان المتوقع بالظبط (جوه الآية أو أول الآية الجاية): نقبل نسبة أقل لو في كلمتين على الأقل اتسمعوا صح (كلمة غلط في آية قصيرة بتنزّل النسبة)
      if (!solid && (kind === 'inside' || kind === 'next') && c.q >= 0.38 && c.n >= 2) {
        const good = judge(s, c).filter(j => j.score >= 0.8 && W[j.i].sb - W[j.i].sa >= 3).length;
        if (good >= 2 || (c.n === 2 && good >= 1 && c.q >= 0.5)) solid = true;
      }
      // تقدّم لقدّام: لازم الكلمات الجديدة نفسها تتسمع صح (مش بس نسبة عامة)، علشان الكلام العشوائي ما يحرّكش العلامة
      if (solid && c.q < 0.7 && (kind === 'inside' || kind === 'next') && L > this.ptr) {
        const nj = judge(s, c).filter(j => j.i > this.ptr && W[j.i].sb - W[j.i].sa >= 2), g = nj.filter(j => j.score >= 0.75).length;
        if (nj.length && g < 1) solid = false;
      }
      if (!solid) { this.lost++; return { ...base, ev: this.lost >= 3 ? 'lost' : 'unclear', ptr: this.ptr }; }
      if (kind === 'before' || kind === 'out' || kind === 'mid' || kind === 'ahead') {
        const changed = [];
        if (kind === 'ahead' && cur !== null && c.n >= 3 && c.q >= 0.7 && nxtAy <= hiAy) {
          const g = this.ig;
          if (g && g.key === nxtAy && this.tick - g.t <= 5) { g.cnt++; g.t = this.tick; } else this.ig = { key: nxtAy, cnt: 1, t: this.tick };
          if (this.ig.cnt >= 2 && this.markMissing(this.ayS[nxtAy], true)) changed.push(this.ayS[nxtAy]);
        }
        return { ...base, ev: 'ignored-' + kind, ptr: this.ptr, changed };
      }
      this.ig = null;
      if (kind === 'back') {
        if (!(this.pend !== null && L >= this.pend - 1 && L <= this.pend + 12)) { this.pend = L; return { ...base, ev: 'pending-back', ptr: this.ptr }; }
      }
      const changed = [], prev = this.ptr;
      const mm = i => { if (i >= lo && i <= hi && s.words[i].sb - s.words[i].sa >= 2 && this.markMissing(i)) changed.push(i); };
      const Lc = Math.min(L, hi);
      this.pend = null; this.pendAge = 0; this.lost = 0;
      for (let i = F; i <= Math.min(L, hi); i++) this.P.add(i);
      this.record(judge(s, c)).forEach(i => changed.push(i));
      if (kind === 'next') for (let i = this.ayS[nxtAy]; i < F; i++) mm(i);
      const newPtr = kind === 'back' ? Lc : Math.max(prev, Lc), nAyNew = W[newPtr].ay;
      if (kind !== 'back' && cur !== null && nAyNew > cur) for (let ay = cur; ay < nAyNew; ay++) for (let i = this.ayS[ay]; i <= this.ayE[ay]; i++) mm(i);
      this.ptr = newPtr;
      for (let i = Math.max(lo, F); i <= Lc; i++) if (!changed.includes(i)) changed.push(i);
      return { ...base, ev: kind === 'back' ? 'back' : (kind === 'next' ? 'next' : 'forward'), ptr: this.ptr, changed, consume: true };
    }
    // ----- التدريب: بيمشي وراك في أي مكان (رجوع، إعادة، قفز) بعد تأكيد -----
    stepTrain(h) {
      const s = this.s, N = s.sk.length; this.tick++;
      if (h.length < 6) return { ev: 'silence', ptr: this.ptr };
      if (this.pend !== null && ++this.pendAge > 6) this.pend = null;
      const first = this.ptr < 0;
      let a = 0, b = N, pref = 0;
      if (!first) { a = s.words[Math.max(0, this.ptr - 30)].sa; b = s.words[Math.min(s.words.length - 1, this.ptr + 90)].sb; pref = s.words[this.ptr].sb; }
      let c = best(h, s, a, b, pref), scope = 'local';
      const okG = (x, f) => x.q >= this.opt.QG && (x.n >= 3 || (x.n >= 2 && x.q >= 0.8 && x.len >= 10) || (f && x.n >= 1 && x.q >= 0.85 && x.len >= 8));
      const bad = x => ({ q: x.q, F: x.F, L: x.L, n: x.n, ev: this.lost >= 3 ? 'lost' : 'unclear', ptr: this.ptr });
      if (first) {
        if (!okG(c, true)) { this.lost++; return { ...bad(c), ptr: -1 }; }
      } else if (c.q < 0.8) {
        const g = best(h, s, 0, N, pref);
        if (okG(g) && g.q > c.q + 0.1 && Math.abs(g.L - this.ptr) > 6) { c = g; scope = 'global'; }
        else if (c.q < this.opt.Q) { this.lost++; return bad(c); }
      }
      const { q, F, L, n } = c, base = { q, F, L, n };
      let ev = 'forward', confirm = false;
      if (first) { ev = 'first'; confirm = true; }
      else if (scope === 'global' && Math.abs(L - this.ptr) > 6) { ev = 'relocate'; confirm = true; }
      else if (L < this.ptr - 1) { if (n < 3 && !(n >= 2 && q >= 0.85)) return { ...base, ev: 'ignored', ptr: this.ptr }; ev = 'back'; confirm = true; }
      else if (L > this.ptr + 6) { ev = 'jump'; confirm = true; }
      if (confirm && !(this.pend !== null && (L >= this.pend - 1 && L <= this.pend + 12))) { this.pend = L; return { ...base, ev: 'pending-' + ev, ptr: this.ptr }; }
      const wasFirst = first;
      this.ptr = (ev === 'forward') ? Math.max(this.ptr, L) : L;
      this.pend = null; this.pendAge = 0; this.lost = 0;
      for (let i = c.F; i <= c.L; i++) this.P.add(i);
      const changed = this.record(judge(s, c));
      for (let i = c.F; i <= c.L; i++) if (!changed.includes(i)) changed.push(i);
      return { ...base, ev: wasFirst ? 'forward' : ev, ptr: this.ptr, changed, consume: true };
    }
  }
  const Core = { VERSION: 7, skel, buildSurah, buildAll, align, scan, trace, best, judge, searchAll, Stream, Tracker };
  root.TajweedCore5 = Core;
  if (typeof module !== 'undefined') module.exports = Core;
})(typeof self !== 'undefined' ? self : globalThis);
