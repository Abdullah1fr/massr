/* التعرف على الصوت أوفلاين بالكامل (Whisper متخصص في القرآن عبر transformers.js + ONNX Runtime WASM).
   - بيسجّل من الميكروفون، يقطّع الكلام عند كل وقفة، ويبعت كل جملة للـ Worker.
   - كل ملفاته على موقعك (مجلد asr/) والـ sw.js بيخزّنها، فبعد أول تحميل مفيش نت مطلوب.
   الواجهة: OfflineASR.supported() / load(onProgress) / start({onText,onStatus,onError}) / stop() */
(function () {
  const SR = 16000, FRAME = 1600;           // 100ms
  const BASE = new URL('asr/', document.baseURI).href;
  let worker = null, ready = false, loadP = null, progressCb = null;
  let session = null;                        // الجلسة الشغالة
  let pending = new Map(), seq = 0;

  function supported() {
    return !!(window.WebAssembly && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Worker);
  }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(BASE + 'asr-worker.js', { type: 'module' });
    worker.onmessage = ev => {
      const m = ev.data;
      if (m.type === 'progress') { if (progressCb) progressCb(m.pct, m.file); }
      else if (m.type === 'ready') { ready = true; }
      else if (m.type === 'text') { const cb = pending.get(m.id); pending.delete(m.id); if (cb) cb.res(m); }
      else if (m.type === 'error') {
        const cb = pending.get(m.id); pending.delete(m.id);
        if (cb) cb.rej(new Error(m.message)); else if (loadP && loadP.rej) loadP.rej(new Error(m.message));
      }
    };
    worker.onerror = e => { if (loadP && loadP.rej) loadP.rej(new Error(e.message || 'worker')); };
    return worker;
  }
  function load(onProgress) {
    progressCb = onProgress || null;
    if (ready) return Promise.resolve();
    if (loadP) return loadP.p;
    const st = loadP = {};
    st.p = new Promise((res, rej) => {
      let iv = 0;
      const fail = e => { clearInterval(iv); if (loadP === st) loadP = null; try { worker && worker.terminate(); } catch (x) {} worker = null; ready = false; rej(e); };
      st.rej = fail;
      const w = getWorker(), id = ++seq;
      pending.set(id, { res: () => {}, rej: fail });
      iv = setInterval(() => { if (ready) { clearInterval(iv); if (loadP === st) loadP = null; res(); } }, 120);
      w.postMessage({ type: 'load', id });
    });
    return st.p;
  }
  function transcribe(samples, uid, final) {
    return new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      getWorker().postMessage({ type: 'run', id, uid, final, audio: samples }, [samples.buffer]);
    });
  }
  function resampleTo16k(f32, inRate) {
    if (inRate === SR) return f32;
    const ratio = inRate / SR, n = Math.floor(f32.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = i * ratio, a = Math.floor(p), b = Math.min(a + 1, f32.length - 1); out[i] = f32[a] + (f32[b] - f32[a]) * (p - a); }
    return out;
  }
  function concat(chunks) {
    let n = 0; chunks.forEach(c => n += c.length);
    const o = new Float32Array(n); let k = 0; chunks.forEach(c => { o.set(c, k); k += c.length; });
    return o;
  }

  // مقسّم الكلام: بيحدد بداية ونهاية كل جملة من طاقة الصوت (بيتكيّف مع ضوضاء المكان)
  function makeSegmenter(emit) {
    let floor = 0.006, speaking = false, run = 0, silent = 0, voiced = 0, sinceInterim = 0, uid = 0;
    let buf = [], pre = [];
    const PRE = 4, END_SIL = 7, MAX = 200, INTERIM = 26, MIN_VOICED = 4; // بالفريمات (كل فريم 100ms)
    return {
      push(frame) {
        let s = 0; for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
        const rms = Math.sqrt(s / frame.length), thr = Math.max(0.014, floor * 3.2);
        if (!speaking) {
          floor = floor * 0.95 + Math.min(rms, 0.05) * 0.05;
          pre.push(frame); if (pre.length > PRE) pre.shift();
          run = rms > thr ? run + 1 : 0;
          if (run >= 2) { speaking = true; uid++; buf = pre.slice(); pre = []; silent = 0; voiced = run; sinceInterim = 0; }
          return;
        }
        buf.push(frame);
        if (rms > thr) { silent = 0; voiced++; } else silent++;
        sinceInterim++;
        if (silent >= END_SIL || buf.length >= MAX) {
          const keep = voiced >= MIN_VOICED;
          const cur = uid, audio = buf;
          speaking = false; run = 0; buf = []; voiced = 0;
          if (keep) emit(cur, concat(audio), true);
        } else if (sinceInterim >= INTERIM && voiced >= MIN_VOICED) {
          sinceInterim = 0;
          emit(uid, concat(buf), false);
        }
      },
      flush() { if (speaking && voiced >= MIN_VOICED) emit(uid, concat(buf), true); speaking = false; buf = []; }
    };
  }

  async function start(h) {
    stop();
    const s = session = { alive: true, busy: false, queued: null, h: h };
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { session = null; throw new Error(e && e.name === 'NotAllowedError' ? 'محتاجين إذن الميكروفون 🎙️⚠️' : 'مفيش ميكروفون متاح ⚠️'); }
    const AC = window.AudioContext || window.webkitAudioContext;
    try { s.ctx = new AC({ sampleRate: SR }); } catch (e) { s.ctx = new AC(); }
    const rate = s.ctx.sampleRate;
    const seg = s.seg = makeSegmenter((uid, audio, final) => dispatch(s, uid, audio, final));
    let acc = [], accN = 0;
    const need = Math.round(FRAME * rate / SR);
    const onBlock = block => {
      if (!s.alive) return;
      acc.push(block); accN += block.length;
      while (accN >= need) {
        const all = concat(acc), fr = all.subarray(0, need);
        const rest = all.subarray(need); acc = rest.length ? [new Float32Array(rest)] : []; accN = rest.length;
        seg.push(resampleTo16k(new Float32Array(fr), rate));
      }
    };
    const src = s.src = s.ctx.createMediaStreamSource(s.stream);
    let ok = false;
    if (s.ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        const code = 'class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("qpcm",P)';
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        await s.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
        const node = s.node = new AudioWorkletNode(s.ctx, 'qpcm');
        node.port.onmessage = e => onBlock(e.data);
        src.connect(node); node.connect(s.ctx.destination); ok = true;
      } catch (e) { ok = false; }
    }
    if (!ok) {
      const node = s.node = s.ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = e => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node); node.connect(s.ctx.destination);
    }
    if (s.ctx.state === 'suspended') { try { await s.ctx.resume(); } catch (e) {} }
    return true;
  }

  // جملة واحدة بتتفسّر في المرة: لو الـ Worker مشغول، الأحدث بس هو اللي بيستنى (والنهائي له الأولوية)
  function dispatch(s, uid, audio, final) {
    if (!s.alive) return;
    if (s.busy) {
      if (final || !s.queued || !s.queued.final) s.queued = { uid, audio, final };
      return;
    }
    s.busy = true;
    transcribe(audio, uid, final).then(r => {
      if (s.alive && r.text && r.text.trim()) s.h.onText(r.uid, r.text.trim(), r.final);
    }).catch(e => {
      if (s.alive && s.h.onError) s.h.onError('تعذّر التعرف على الصوت: ' + e.message);
    }).finally(() => {
      s.busy = false;
      const q = s.queued; s.queued = null;
      if (q && s.alive) dispatch(s, q.uid, q.audio, q.final);
    });
  }

  function stop() {
    const s = session; if (!s) return;
    session = null; s.alive = false;
    try { s.node && s.node.disconnect(); } catch (e) {}
    try { s.src && s.src.disconnect(); } catch (e) {}
    try { s.stream && s.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { s.ctx && s.ctx.close(); } catch (e) {}
  }

  window.OfflineASR = { supported, load, start, stop, _makeSegmenter: makeSegmenter, isReady: () => ready };
})();
