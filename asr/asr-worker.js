// عامل (Worker) بيشغّل نموذج Whisper المتخصص في القرآن جوه المتصفح — من غير نت ولا سيرفر.
// الملفات كلها بتتحمّل من نفس موقع التطبيق (GitHub Pages / Firebase) وبتتخزّن في الجهاز أول مرة.
import { pipeline, env } from './transformers.min.js';

const BASE = new URL('./', self.location.href).href;
const MODEL = 'quran-tiny';
let asr = null, loading = null, parts = null;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = BASE + 'models/';
env.backends.onnx.wasm.wasmPaths = BASE + 'ort/';
env.backends.onnx.wasm.numThreads = 1; // أكتر من 1 محتاج هيدرز COOP/COEP مش متاحة على الاستضافة العادية

// ملفات النموذج الكبيرة بتتقسّم أجزاء (حد الرفع من موقع GitHub 25MB) ونجمّعها هنا
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(key) {
    const url = typeof key === 'string' ? key : key.url;
    if (!parts) return undefined;
    const name = Object.keys(parts).find(n => url.endsWith('/' + n));
    if (!name) return undefined;
    const list = parts[name], bufs = [];
    let got = 0;
    for (let i = 0; i < list.length; i++) {
      const r = await fetch(BASE + 'models/' + MODEL + '/onnx/' + list[i]);
      if (!r.ok) throw new Error('جزء ناقص: ' + list[i]);
      const b = await r.arrayBuffer();
      bufs.push(b); got += b.byteLength;
      self.postMessage({ type: 'progress', pct: Math.round(((i + 1) / list.length) * 100), file: name });
    }
    return new Response(new Blob(bufs), { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(got) } });
  },
  async put() {}
};

async function load() {
  if (asr) return;
  if (!loading) loading = (async () => {
    try {
      const r = await fetch(BASE + 'models/' + MODEL + '/onnx/parts.json', { cache: 'no-cache' });
      parts = r.ok ? await r.json() : {};
    } catch (e) { parts = {}; }
    asr = await pipeline('automatic-speech-recognition', MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: p => { if (p && p.status === 'progress') self.postMessage({ type: 'progress', pct: Math.round(p.progress || 0), file: p.file }); }
    });
  })();
  await loading;
}

self.onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.type === 'load') { await load(); self.postMessage({ type: 'ready' }); }
    else if (m.type === 'run') {
      await load();
      const out = await asr(m.audio, { language: 'arabic', task: 'transcribe', return_timestamps: false, chunk_length_s: 30 });
      self.postMessage({ type: 'text', id: m.id, uid: m.uid, final: m.final, text: (out && out.text) || '' });
    }
  } catch (e) {
    loading = null;
    self.postMessage({ type: 'error', id: m.id, message: String((e && e.message) || e) });
  }
};
