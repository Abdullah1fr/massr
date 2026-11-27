/* Whisper 80-bin log-mel in plain JS (same math as faster-whisper FeatureExtractor, no 30 s padding).
   Whole-clip transform. Works in a Worker, the page, or Node. */
(function (root) {
  const SR = 16000, N_FFT = 400, HOP = 160, N_MELS = 80, N_BINS = N_FFT / 2 + 1;

  function hzToMel(f) {
    const fsp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fsp, logstep = Math.log(6.4) / 27;
    return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logstep : f / fsp;
  }
  function melToHz(m) {
    const fsp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fsp, logstep = Math.log(6.4) / 27;
    return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fsp * m;
  }

  // Slaney mel filterbank, [N_MELS * N_BINS] row-major (only the non-zero band of each row is kept for speed)
  function buildFilters() {
    const fft = new Float64Array(N_BINS);
    for (let i = 0; i < N_BINS; i++) fft[i] = (SR / 2) * i / (N_BINS - 1);
    const lo = hzToMel(0), hi = hzToMel(SR / 2), hz = new Float64Array(N_MELS + 2);
    for (let i = 0; i < N_MELS + 2; i++) hz[i] = melToHz(lo + (hi - lo) * i / (N_MELS + 1));
    const rows = [];
    for (let m = 0; m < N_MELS; m++) {
      const f0 = hz[m], f1 = hz[m + 1], f2 = hz[m + 2], en = 2 / (f2 - f0);
      let start = -1; const w = [];
      for (let k = 0; k < N_BINS; k++) {
        const v = Math.max(0, Math.min((fft[k] - f0) / (f1 - f0), (f2 - fft[k]) / (f2 - f1))) * en;
        if (v > 0) { if (start < 0) start = k; w.push(v); }
        else if (start >= 0) break;
      }
      rows.push({ start: Math.max(start, 0), w: Float32Array.from(w) });
    }
    return rows;
  }

  const FILTERS = buildFilters();
  const WIN = new Float32Array(N_FFT);               // periodic Hann
  for (let i = 0; i < N_FFT; i++) WIN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT);
  // Mixed-radix FFT for N_FFT = 400: split even/odd down to size 25, then a direct DFT (about 7x faster than a full DFT)
  const COS = new Float64Array(N_FFT), SIN = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) { const a = 2 * Math.PI * i / N_FFT; COS[i] = Math.cos(a); SIN[i] = Math.sin(a); }
  function fft(x, off, stride, n, re, im, o) {        // transform x[off + i*stride], i < n, into re/im[o .. o+n)
    const step = N_FFT / n;
    if (n & 1) {
      for (let k = 0; k < n; k++) {
        let r = 0, s = 0;
        for (let j = 0, p = 0; j < n; j++) {
          const v = x[off + j * stride]; r += v * COS[p]; s -= v * SIN[p];
          p += k * step; if (p >= N_FFT) p %= N_FFT;
        }
        re[o + k] = r; im[o + k] = s;
      }
      return;
    }
    const h = n >> 1;
    fft(x, off, stride * 2, h, re, im, o); fft(x, off + stride, stride * 2, h, re, im, o + h);
    for (let k = 0; k < h; k++) {
      const c = COS[k * step], d = SIN[k * step], a = o + k, b = a + h;
      const tr = re[b] * c + im[b] * d, ti = im[b] * c - re[b] * d, er = re[a], ei = im[a];
      re[a] = er + tr; im[a] = ei + ti; re[b] = er - tr; im[b] = ei - ti;
    }
  }

  const BUF = new Float64Array(N_FFT), RE = new Float64Array(N_FFT), IM = new Float64Array(N_FFT);
  function powerFrame(x, off, out) {                  // x[off .. off+N_FFT) already padded; out = [N_BINS] power
    for (let n = 0; n < N_FFT; n++) BUF[n] = x[off + n] * WIN[n];
    fft(BUF, 0, 1, N_FFT, RE, IM, 0);
    for (let k = 0; k < N_BINS; k++) out[k] = RE[k] * RE[k] + IM[k] * IM[k];
  }

  function melFrame(pow, out, o, stride) {            // out[m*stride + o] = log10 mel (before the 8 dB floor)
    for (let m = 0; m < N_MELS; m++) {
      const r = FILTERS[m]; let s = 0;
      for (let i = 0; i < r.w.length; i++) s += r.w[i] * pow[r.start + i];
      out[m * stride + o] = Math.log10(Math.max(s, 1e-10));
    }
  }

  // Whole clip -> Float32Array [80 * frames] (row-major, mel x time), frames returned. Reflect-pads like Whisper/torch.
  function logMel(audio) {
    const pad = N_FFT / 2, n = audio.length, x = new Float32Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) x[i] = audio[Math.min(pad - i, n - 1)];
    x.set(audio, pad);
    for (let i = 0; i < pad; i++) x[pad + n + i] = audio[Math.max(n - 2 - i, 0)];
    const total = 1 + Math.floor((x.length - N_FFT) / HOP), frames = total - 1; // Whisper drops the last frame
    const out = new Float32Array(N_MELS * frames), pow = new Float32Array(N_BINS);
    for (let t = 0; t < frames; t++) { powerFrame(x, t * HOP, pow); melFrame(pow, out, t, frames); }
    let mx = -Infinity; for (let i = 0; i < out.length; i++) if (out[i] > mx) mx = out[i];
    const floor = mx - 8;
    for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], floor) + 4) / 4;
    return { data: out, frames };
  }

  const api = { SR, HOP, N_MELS, logMel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TajweedMel = api;
})(typeof self !== 'undefined' ? self : this);
