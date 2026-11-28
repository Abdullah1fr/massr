// بحث في القرآن كله (thread لوحده): بياخد هيكل اللي النموذج سمعه ويقول هو في أنهي سورة وآية.
importScripts('tajweed-core4.js?v=6');
let ALL = null;
async function init() {
  const buf = await (await fetch('models/tajweed/refs_hafs.json.gz')).arrayBuffer(), u = new Uint8Array(buf);
  const gz = u[0] === 0x1f && u[1] === 0x8b;
  const text = gz ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(u);
  ALL = self.TajweedCore4.buildAll(JSON.parse(text));
}
self.onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.type === 'init') { await init(); self.postMessage({ type: 'ready' }); }
    else if (m.type === 'search') {
      const t = performance.now(), c = self.TajweedCore4.searchAll(ALL, m.heard, m.skip);
      self.postMessage({ type: 'found', id: m.id, ms: Math.round(performance.now() - t), ...c });
    }
  } catch (e) { self.postMessage({ type: 'error', id: m.id, message: String((e && e.message) || e) }); }
};
