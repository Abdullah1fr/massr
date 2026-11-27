/* CTC best-path decode, a port of hear() in HisnLabs inference.py.
   logprobs: Float32Array [frames * 43] (frame-major), phonemes: config.json "phonemes" (index i-1 for class i, 0 = blank).
   Returns { script, probs, times } like the Python: probs[i] = exp(logprob) of symbol i, times[i] = centre time (s) of its
   frame minus the lead silence; times has one extra entry: the end of the last symbol. */
(function (root) {
  function decode(logprobs, frames, classes, phonemes, totalSeconds, leadSeconds) {
    const step = totalSeconds / frames, lead = leadSeconds || 0;
    let script = '', probs = [], times = [], prev = 0, last = -1;
    for (let t = 0; t < frames; t++) {
      let best = 0, bv = -Infinity; const o = t * classes;
      for (let c = 0; c < classes; c++) { const v = logprobs[o + c]; if (v > bv) { bv = v; best = c; } }
      if (best !== 0) last = t;
      if (best !== prev && best !== 0) { script += phonemes[best - 1]; probs.push(Math.exp(bv)); times.push((t + 0.5) * step - lead); }
      prev = best;
    }
    times.push(last >= 0 ? (last + 1) * step - lead : 0);
    return { script, probs, times };
  }
  const api = { decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TajweedCTC = api;
})(typeof self !== 'undefined' ? self : this);
