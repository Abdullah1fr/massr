// عامل (Worker) نموذج التجويد HisnLabs tajweed-v2: صوت 16k -> كتابة صوتية (فونيمات). أوفلاين بالكامل.
import { AutoModel, Tensor, env } from './transformers.min.js';
import './tajweed-mel.js';
import './tajweed-ctc.js';

const BASE = new URL('./', self.location.href).href;
const MODEL = 'tajweed', LEAD = 6400, MAX = 29 * 16000;   // 0.4 ثانية صمت قبل وبعد (زي تدريب النموذج)
let model = null, cfg = null, parts = null, loading = null, fromCache = false;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = BASE + 'models/';
env.backends.onnx.wasm.wasmPaths = BASE + 'ort/';
env.backends.onnx.wasm.numThreads = 1;
env.useBrowserCache = false;
env.useCustomCache = true;

// كاش-أول: لو الملف في Cache API يرجع منه (من غير نت)، وإلا يجيبه مرة واحدة ويخزّنه
const CACHE = 'tajweed-model-v1';   // غيّر الرقم لو النموذج اتحدّث
async function cached(url, make, flag) {
  let c = null;
  try { c = await caches.open(CACHE); const hit = await c.match(url); if (hit) { if (flag) fromCache = true; return hit; } } catch (e) { c = null; }
  const res = await make();
  if (c) { try { await c.put(url, res.clone()); } catch (e) {} }
  return res;
}

env.customCache = {
  async match(key) {
    const url = typeof key === 'string' ? key : key.url;
    const name = parts && Object.keys(parts).find(n => url.endsWith('/' + n));
    if (!name) return undefined;
    return cached(BASE + 'models/' + MODEL + '/onnx/' + name, async () => {
      const bufs = [];
      for (let i = 0; i < parts[name].length; i++) {
        const r = await fetch(BASE + 'models/' + MODEL + '/onnx/' + parts[name][i]);
        if (!r.ok) throw new Error('جزء ناقص: ' + parts[name][i]);
        bufs.push(await r.arrayBuffer());
        self.postMessage({ type: 'progress', pct: Math.round((i + 1) / parts[name].length * 100) });
      }
      const blob = new Blob(bufs);
      return new Response(blob, { status: 200, headers: { 'Content-Length': String(blob.size) } });
    }, true);
  },
  async put() {}
};

function load() {
  if (!loading) loading = (async () => {
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}   // علشان الموبايل ما يمسحش النموذج
    const get = async p => {
      const r = await cached(BASE + 'models/' + MODEL + '/' + p, async () => { const x = await fetch(BASE + 'models/' + MODEL + '/' + p); if (!x.ok) throw new Error('ملف ناقص: ' + p); return x; });
      return r.json();
    };
    cfg = await get('config.json'); parts = await get('onnx/parts.json');
    model = await AutoModel.from_pretrained(MODEL, { device: 'wasm', dtype: 'fp32' }); // الملف نفسه int8؛ fp32 هنا اسم الملف بس: model.onnx
  })().catch(e => { loading = null; throw e; });
  return loading;
}

async function hear(audio, riwaya) {
  if (audio.length > MAX) audio = audio.subarray(audio.length - MAX);
  const x = new Float32Array(audio.length + 2 * LEAD); x.set(audio, LEAD);
  const t0 = performance.now();
  const mel = self.TajweedMel.logMel(x);
  const T = Math.min(3000, mel.frames - (mel.frames % 2));
  let data = mel.data;
  if (T !== mel.frames) { data = new Float32Array(80 * T); for (let m = 0; m < 80; m++) data.set(mel.data.subarray(m * mel.frames, m * mel.frames + T), m * T); }
  const t1 = performance.now();
  const out = await model({
    mel: new Tensor('float32', data, [1, 80, T]),
    riwaya: new Tensor('int64', BigInt64Array.of(BigInt(Math.max(0, cfg.riwayat.indexOf(riwaya)))), [1])
  });
  const lp = out.logprobs, t2 = performance.now();
  const d = self.TajweedCTC.decode(lp.data, lp.dims[1], lp.dims[2], cfg.phonemes, x.length / 16000, LEAD / 16000);
  return { ...d, melMs: Math.round(t1 - t0), inferMs: Math.round(t2 - t1) };
}

self.onmessage = async ev => {
  const m = ev.data;
  try {
    const t = performance.now();
    await load();
    if (m.type === 'load') self.postMessage({ type: 'ready', id: m.id, ms: Math.round(performance.now() - t), cached: fromCache });
    else if (m.type === 'run') self.postMessage({ type: 'heard', id: m.id, ...(await hear(m.audio, m.riwaya || 'hafs')) });
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String((e && e.message) || e) });
  }
};
