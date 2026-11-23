/* =====================================================================
   MASSR Universal Search — محرك البحث الشامل (v1)
   ملف مستقل: بيشتغل في المتصفح (window.MASSR_SEARCH) وفي Node للاختبار (module.exports).
   الفكرة:
   1) تصنيف نية الطلب (كلمات + تلميحات الموديل types) ← 2) خطة مصادر ← 3) تشغيل بالتوازي بمهلة لكل مصدر
   4) توحيد النتايج + حذف المكرر + حجب مواقع القرصنة ← 5) ترتيب بالصلة والجودة ← 6) تقرير بحالة كل مصدر.
   - البحث العام (web_research ثم web_find) هو الأساس دايمًا، وفشل أي مصدر متخصص مايوقفوش.
   - Gemini احتياطي أخير: بيتنادى بس لو النتايج المفيدة أقل من 3 بعد كل المصادر.
   - موصّلات مجانية من غير مفاتيح (Open Library, Gutenberg, Internet Archive, GitHub, npm, Wikipedia,
     OpenAlex, Crossref, Openverse, iTunes, GDELT) بتشتغل مباشرة من المتصفح، حتى لو الوركر مش متوصّل.
   - إضافة محرك جديد: MASSR_SEARCH.registerConnector({id,label,kinds,run,...}) من غير لمس باقي الكود.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MASSR_SEARCH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.0.0';

  // ---------------------------------------------------------------- نصوص
  const DIAC = /[ً-ٰٟـ]/g;
  function normAr(s) {
    return String(s == null ? '' : s).toLowerCase().replace(DIAC, '')
      .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  // نسخ مختلفة من الكلمة: من غير "ال" ومن غير حرف الجر الملزوق (و/ب/ل/ف/ك)
  function variants(t) {
    const v = new Set([t]);
    const strip = x => { if (x.startsWith('ال') && x.length > 4) v.add(x.slice(2)); };
    strip(t);
    if (t.length > 3 && /^[وبلفك]/.test(t)) { const r = t.slice(1); v.add(r); strip(r); }
    if (/^[a-z]+s$/.test(t) && t.length > 3) v.add(t.slice(0, -1));
    return v;
  }
  const tokensOf = s => normAr(s).split(' ').filter(Boolean);
  function relTokens(s) {
    return tokensOf(s).filter(t => t.length >= 2).map(t => (t.startsWith('ال') && t.length > 4 ? t.slice(2) : t));
  }
  const hasArabic = s => /[؀-ۿ]/.test(String(s || ''));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uniq = a => Array.from(new Set(a));
  const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------- تصنيف النية
  // كل الكلمات مكتوبة بعد التطبيع (ة→ه، أ/إ→ا، ى→ي، من غير تشكيل)
  const KW = {
    image: ['صوره', 'صور', 'خلفيه', 'خلفيات', 'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'wallpaper', 'wallpapers', 'صورة'],
    video: ['فيديو', 'فيديوهات', 'يوتيوب', 'youtube', 'video', 'videos', 'clip', 'clips', 'كليب', 'تريلر', 'trailer', 'مشاهده', 'مقطع فيديو'],
    audio: ['اغنيه', 'اغاني', 'انشوده', 'اناشيد', 'نشيد', 'انشودة', 'song', 'songs', 'music', 'audio', 'mp3', 'podcast', 'بودكاست', 'موسيقي', 'nasheed', 'nasheeds', 'مقطع صوتي', 'ريمكس'],
    academic: ['ابحاث', 'بحث علمي', 'ابحاث علميه', 'ورقه بحثيه', 'اوراق بحثيه', 'دراسه علميه', 'دراسات علميه', 'مجله علميه', 'بحث اكاديمي', 'اطروحه', 'رساله ماجستير', 'رساله دكتوراه',
      'academic', 'scholar', 'paper', 'papers', 'journal', 'journals', 'doi', 'pubmed', 'arxiv', 'citation', 'citations', 'thesis', 'peer reviewed', 'literature review', 'clinical trial', 'research paper', 'research papers', 'scientific study'],
    book: ['كتاب', 'كتب', 'روايه', 'روايات', 'قصه', 'قصص', 'ebook', 'ebooks', 'epub', 'book', 'books', 'novel', 'novels', 'story', 'stories', 'مؤلف', 'كتاب الكتروني'],
    file: ['pdf', 'تحميل', 'download', 'ملف', 'تقرير', 'تقارير', 'وثيقه', 'وثائق', 'whitepaper', 'report', 'reports', 'document', 'documents', 'filetype'],
    product: ['سعر', 'اسعار', 'بكام', 'ثمن', 'منتج', 'منتجات', 'شراء', 'اشتري', 'متجر', 'مقارنه اسعار', 'price', 'prices', 'buy', 'product', 'products', 'shopping', 'deal', 'deals', 'discount', 'عروض'],
    code: ['github', 'مستودع', 'مستودعات', 'كود', 'اكواد', 'مكتبه برمجيه', 'مكتبات برمجيه', 'library', 'libraries', 'package', 'npm', 'pypi', 'repo', 'repository', 'repositories', 'source code', 'documentation', 'api docs', 'framework', 'sdk', 'open source', 'مفتوح المصدر', 'مفتوحه المصدر', 'مكتبه جافاسكربت', 'مكتبات جافاسكربت', 'مكتبه جافا سكريبت', 'مكتبات جافا سكريبت', 'javascript library', 'javascript libraries', 'js library', 'js libraries', 'cdn'],
    news: ['خبر', 'اخبار', 'عاجل', 'اخر الاخبار', 'news', 'headline', 'headlines', 'breaking'],
    live: ['نتيجه', 'نتايج', 'ماتش', 'مباراه', 'مباريات', 'دوري', 'كاس', 'ترتيب الدوري', 'هدافين', 'سعر الدولار', 'سعر الذهب', 'سعر العمله', 'طقس', 'الطقس', 'درجه الحراره', 'score', 'scores', 'fixtures', 'standings', 'weather', 'exchange rate']
  };
  const RECENCY = ['اليوم', 'النهارده', 'الان', 'حاليا', 'حديث', 'حديثه', 'اخر', 'latest', 'today', 'now', 'recent', 'newest', 'currently'];
  const PLAY = ['شغل', 'شغلي', 'شغلها', 'شغله', 'play', 'استمع', 'اسمع', 'سماع', 'listen'];
  const INTENT_KEYS = Object.keys(KW);

  // منصات ومواقع مشهورة: لو اسمها في الطلب بنبحث جواها (site:) عبر محرك البحث — صفحات عامة بس
  const PLATFORMS = [
    { id: 'facebook', label: 'فيسبوك', site: 'facebook.com', k: ['فيسبوك', 'فيس بوك', 'facebook'] },
    { id: 'instagram', label: 'انستجرام', site: 'instagram.com', k: ['انستجرام', 'انستغرام', 'instagram'] },
    { id: 'tiktok', label: 'تيك توك', site: 'tiktok.com', k: ['تيك توك', 'تيكتوك', 'tiktok'] },
    { id: 'twitter', label: 'تويتر/X', site: 'x.com', k: ['تويتر', 'twitter'] },
    { id: 'reddit', label: 'ريديت', site: 'reddit.com', k: ['ريديت', 'reddit'] },
    { id: 'linkedin', label: 'لينكدإن', site: 'linkedin.com', k: ['لينكدان', 'لينكد ان', 'linkedin'] },
    { id: 'telegram', label: 'تيليجرام', site: 't.me', k: ['تيليجرام', 'تليجرام', 'telegram'] },
    { id: 'stackoverflow', label: 'Stack Overflow', site: 'stackoverflow.com', k: ['ستاك اوفرفلو', 'stackoverflow', 'stack overflow'] },
    { id: 'imdb', label: 'IMDb', site: 'imdb.com', k: ['imdb', 'اي ام دي بي'] },
    { id: '365scores', label: '365Scores', site: '365scores.com', k: ['365scores', '365 scores', '365 سكورز', '365سكورز'] },
    { id: 'filgoal', label: 'في الجول', site: 'filgoal.com', k: ['في الجول', 'فيلجول', 'filgoal'] },
    { id: 'yallakora', label: 'يلا كورة', site: 'yallakora.com', k: ['يلا كوره', 'يلاكوره', 'yallakora'] },
    { id: 'kooora', label: 'كورة', site: 'kooora.com', k: ['kooora', 'كووورة'] }
  ];
  function detectPlatforms(query) {
    const padded = ' ' + normAr(query) + ' ';
    return PLATFORMS.filter(pl => pl.k.some(w => { const nw = normAr(w); return nw && padded.includes(' ' + nw + ' '); }));
  }
  function stripPlatformWords(q, pls) {
    const toks = String(q || '').split(/\s+/).filter(Boolean), nt = toks.map(normAr), drop = new Set();
    pls.forEach(pl => pl.k.forEach(w => {
      const kw = normAr(w).split(' ');
      for (let i = 0; i + kw.length <= nt.length; i++) if (kw.every((x, j) => nt[i + j] === x)) for (let j = 0; j < kw.length; j++) drop.add(i + j);
    }));
    const kept = toks.filter((_, i) => !drop.has(i));
    while (kept.length && FILLER.includes(normAr(kept[0]))) kept.shift();
    while (kept.length && FILLER.includes(normAr(kept[kept.length - 1]))) kept.pop();
    const out = kept.join(' ').trim();
    return out.length >= 2 ? out : String(q || '').trim();
  }

  function classify(query, hints) {
    const n = normAr(query), padded = ' ' + n + ' ';
    const toks = n.split(' ').filter(Boolean);
    const vs = new Set(); toks.forEach(t => variants(t).forEach(x => vs.add(x)));
    const hit = list => list.reduce((c, w) => {
      const nw = normAr(w);
      if (!nw) return c;
      return c + ((nw.includes(' ') ? padded.includes(' ' + nw + ' ') : vs.has(nw)) ? 1 : 0);
    }, 0);
    const score = {};
    INTENT_KEYS.forEach(k => { score[k] = hit(KW[k]); });
    // تلميحات الموديل (هو أفهم من الكلمات): بتتحسب بقوة أكبر
    (Array.isArray(hints) ? hints : []).forEach(h => { const k = String(h || '').toLowerCase().trim(); if (k in score) score[k] += 3; });
    // كتاب/ملف: pdf لوحدها تعني ملف مش بالضرورة كتاب
    const intents = {};
    INTENT_KEYS.forEach(k => { intents[k] = score[k] > 0; });
    const types = INTENT_KEYS.filter(k => intents[k]).sort((a, b) => score[b] - score[a]);
    return {
      intents, types, score, primary: types[0] || 'general',
      recency: hit(RECENCY) > 0, wantsPlay: hit(PLAY) > 0, arabic: hasArabic(query)
    };
  }

  // تنضيف عبارة البحث للموصّلات (بنشيل كلمات الأمر وأسماء الفئات)
  const LEAD = /^(?:(?:لو سمحت|من فضلك|يا (?:كلود|مصر|اسطي|اسطى)|ممكن|عايز|عاوز|اريد|ابي|ابغي|محتاج|please|can you|could you|i want|i need)\s+)+/i;
  const CMD = /^(?:(?:ابحث|دور|دوري|دورلي|هات|هاتلي|جيب|جيبلي|اعرض|اعطني|وريني|شوفلي|search|find|show|get|lookup|look up|give me)\s*(?:لي|لى|لنا|ل|لي عن|عن|على|علي|في|فى|for|me|about)?\s+)+/i;
  const DROP = {
    image: ['صوره', 'صور', 'خلفيه', 'خلفيات', 'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'wallpaper', 'wallpapers'],
    video: ['فيديو', 'فيديوهات', 'يوتيوب', 'youtube', 'video', 'videos', 'على', 'في'],
    audio: ['اغنيه', 'اغاني', 'انشوده', 'اناشيد', 'نشيد', 'song', 'songs', 'mp3', 'audio', 'music'],
    book: ['كتاب', 'كتب', 'روايه', 'روايات', 'قصه', 'قصص', 'pdf', 'تحميل', 'download', 'ebook', 'ebooks', 'book', 'books', 'novel', 'novels', 'مجانا', 'free', 'epub'],
    file: ['pdf', 'تحميل', 'download', 'ملف', 'ملفات'],
    academic: ['ابحاث', 'بحث', 'علمي', 'علميه', 'ورقه', 'بحثيه', 'دراسه', 'دراسات', 'paper', 'papers', 'research', 'academic', 'scholar', 'journal'],
    code: ['github', 'مستودع', 'مستودعات', 'repo', 'repository', 'repositories', 'كود', 'اكواد', 'مكتبه', 'برمجيه', 'library', 'package', 'npm', 'open', 'source'],
    product: ['سعر', 'اسعار', 'بكام', 'ثمن', 'price', 'prices', 'buy', 'شراء', 'اشتري', 'كام'],
    news: ['اخبار', 'خبر', 'news', 'عاجل', 'اخر', 'headline', 'headlines']
  };
  const FILLER = ['عن', 'على', 'علي', 'في', 'فى', 'ل', 'لي', 'لى', 'من', 'ال', 'و', 'about', 'for', 'the', 'a', 'of', 'on', 'me', 'to'];
  function cleanQuery(q, cls, forKind) {
    let s = String(q || '').replace(/\s+/g, ' ').trim();
    s = s.replace(LEAD, '').replace(CMD, '').trim();
    const drop = new Set();
    const kinds = forKind ? [forKind] : (cls ? cls.types : []);
    kinds.forEach(k => (DROP[k] || []).forEach(w => drop.add(normAr(w))));
    const kept = s.split(' ').filter(w => {
      const nw = normAr(w);
      if (!nw) return false;
      for (const v of variants(nw)) if (drop.has(v)) return false;
      return true;
    });
    // شيل حروف الربط من الأطراف بس
    while (kept.length && FILLER.includes(normAr(kept[0]))) kept.shift();
    while (kept.length && FILLER.includes(normAr(kept[kept.length - 1]))) kept.pop();
    const out = kept.join(' ').trim();
    return out.length >= 2 ? out : (s.length >= 2 ? s : String(q || '').trim());
  }

  // ---------------------------------------------------------------- روابط
  const TRACK = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|spm|yclid|_hsenc|_hsmi)$/i;
  function canonUrl(u) {
    try {
      const x = new URL(String(u).trim());
      if (!/^https?:$/.test(x.protocol)) return '';
      let host = x.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
      if (host === 'youtu.be') { const id = x.pathname.slice(1); return id ? 'https://youtube.com/watch?v=' + id : ''; }
      if (host === 'youtube.com' || host === 'music.youtube.com') {
        const v = x.searchParams.get('v'); if (v) return 'https://youtube.com/watch?v=' + v;
      }
      const keep = [];
      x.searchParams.forEach((val, k) => { if (!TRACK.test(k)) keep.push([k, val]); });
      keep.sort((a, b) => a[0].localeCompare(b[0]));
      const qs = keep.map(([k, val]) => encodeURIComponent(k) + '=' + encodeURIComponent(val)).join('&');
      const path = x.pathname.replace(/\/+$/, '') || '';
      return 'https://' + host + path + (qs ? '?' + qs : '');
    } catch (e) { return ''; }
  }
  const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
  const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1)/;
  const isSafeUrl = u => { const h = hostOf(u); return !!h && !PRIVATE_HOST.test(h) && /^https?:\/\//i.test(u); };

  // مواقع قرصنة/تنزيل غير مصرّح به: بتتشال من كل النتايج. القايمة قابلة للتوسيع (BLOCKLIST.push)
  const BLOCKLIST = [
    /(^|\.)(libgen\.[a-z]+|library\.lol|annas-archive\.[a-z]+|sci-hub\.[a-z]+|scihub\.[a-z]+|bookzz\.[a-z]+|bookfi\.[a-z]+|b-ok\.[a-z]+|1lib\.[a-z]+)$/i,
    /(^|\.)(z-lib\.[a-z]+|zlibrary[a-z0-9-]*\.[a-z]+|singlelogin\.[a-z]+)$/i,
    /(^|\.)(pdfdrive\.[a-z]+|vdoc\.pub|dokumen\.pub|ebin\.pub|epdf\.[a-z]+|kupdf\.[a-z]+|pdfcoffee\.com|idoc\.pub|ebookee\.[a-z]+|freebooksummary\.com)$/i,
    /(^|\.)(mp3juices?\.[a-z]+|mp3skull\.[a-z]+|ytmp3\.[a-z]+|y2mate\.[a-z]+|savefrom\.net|9convert\.com|flvto\.[a-z]+|tubidy\.[a-z]+|mp3-?download[a-z0-9-]*\.[a-z]+)$/i,
    /(^|\.)(thepiratebay\.[a-z]+|1337x\.[a-z]+|rarbg\.[a-z]+|yts\.[a-z]+|nyaa\.[a-z]+|torrentz?\d*\.[a-z]+|limetorrents\.[a-z]+|kickass[a-z]*\.[a-z]+)$/i,
    /(^|\.)(egybest\.[a-z]+|cima4u\.[a-z]+|mycima\.[a-z]+|shahid4u\.[a-z]+|akwam\.[a-z]+|fushaar\.[a-z]+|movies7\.[a-z]+|fmovies\.[a-z]+|123movies\.[a-z]+)$/i
  ];
  const isBlocked = u => { const h = hostOf(u); return !!h && BLOCKLIST.some(r => r.test(h)); };

  // مصادر معروفة قانونيًا للقراءة/التحميل المجاني (للتصنيف فقط، مش ضمان لكل ملف فيها)
  const OPEN_HOSTS = /(^|\.)(gutenberg\.org|wikisource\.org|hindawi\.org|openstax\.org|doabooks\.org|doaj\.org|arxiv\.org|biorxiv\.org|medrxiv\.org|ncbi\.nlm\.nih\.gov|europepmc\.org|zenodo\.org|plos\.org|loc\.gov|wikimedia\.org|commons\.wikimedia\.org)$/i;
  const TRUST_HIGH = /(^|\.)(wikipedia\.org|wikisource\.org|gutenberg\.org|hindawi\.org|github\.com|npmjs\.com|pypi\.org|developer\.mozilla\.org|stackoverflow\.com|arxiv\.org|doi\.org|nih\.gov|nature\.com|science\.org|sciencedirect\.com|springer\.com|ieee\.org|acm\.org|openalex\.org|crossref\.org|bbc\.com|aljazeera\.(net|com)|reuters\.com|apnews\.com|apple\.com|spotify\.com|openlibrary\.org|britannica\.com)$|\.(gov|edu)(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/i;
  const TRUST_MID = /(^|\.)(youtube\.com|archive\.org|amazon\.[a-z.]+|noon\.com|jumia\.[a-z.]+|btech\.com|2b\.com\.eg|soundcloud\.com|anghami\.com|medium\.com|wikimedia\.org|openverse\.org|unsplash\.com|pexels\.com|npmjs\.org)$/i;
  const TRUST_LOW = /(^|\.)(pinterest\.[a-z.]+|quora\.com|scribd\.com|slideshare\.net|issuu\.com|facebook\.com|tiktok\.com|ask\.com|answers\.com|ehow\.com)$/i;
  function trustOf(u) {
    const h = hostOf(u);
    if (!h) return 0.2;
    if (TRUST_HIGH.test(h)) return 0.95;
    if (TRUST_LOW.test(h)) return 0.2;
    if (TRUST_MID.test(h)) return 0.65;
    return 0.45;
  }
  const DIRECT_FILE = /\.(pdf|epub|mobi|djvu|azw3?|docx?|xlsx?|pptx?|mp3|m4a|flac|ogg|zip)(\?|#|$)/i;

  // ---------------------------------------------------------------- أدوات عامة
  function withTimeout(p, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), ms);
      Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });
  }
  function makeCache(ttlMs, max) {
    const m = new Map();
    return {
      get(k) { const e = m.get(k); if (!e) return undefined; if (Date.now() - e.t > (e.ttl || ttlMs)) { m.delete(k); return undefined; } return e.v; },
      set(k, v, ttl) { m.set(k, { v, t: Date.now(), ttl }); if (m.size > (max || 200)) m.delete(m.keys().next().value); },
      clear() { m.clear(); }, size() { return m.size; }
    };
  }
  // حماية الكوتا: لو الوركر رجّع 429 (حد 20 طلب/دقيقة للمستخدم العادي) نوقف أدواته دقيقة ونكمّل بالمصادر المباشرة؛
  // ولو موصّل مباشر (زي GitHub) رجّع 429/403 نسيبه 5 دقايق.
  const WORKER_TOOLS = new Set(['web_research', 'web_find', 'web_scholar', 'web_images']);
  const RATE_RE = /طلبات كتير|استنى دقيقة|(?:^|\D)429(?:\D|$)/;
  const state = { workerBackoffUntil: 0, breaker: {}, reset() { this.workerBackoffUntil = 0; this.breaker = {}; } };
  const resultCache = makeCache(10 * 60 * 1000, 100);
  const httpCache = makeCache(5 * 60 * 1000, 300);

  // طلب JSON مباشر مع مهلة وكاش (الموصّلات المجانية)
  async function fetchJson(url, o) {
    o = o || {};
    const f = o.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new Error('no_fetch');
    const key = 'J:' + url;
    const c = httpCache.get(key);
    if (c !== undefined) return c;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const tm = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) { } }, o.timeout || 10000);
    try {
      const r = await f(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) throw new Error('http_' + r.status);
      const j = await r.json();
      httpCache.set(key, j, o.ttl);
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('timeout');
      throw e;
    } finally { clearTimeout(tm); }
  }
  const qs = o => Object.keys(o).filter(k => o[k] !== undefined && o[k] !== '').map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');

  // ---------------------------------------------------------------- الموصّلات المجانية
  // كل موصّل: {id,label,kinds,when(cls),timeout,run(ctx)→[record]}
  // record = {title,url,snippet,type,rights?,meta?}
  const CONNECTORS = {};
  function registerConnector(def) {
    if (!def || !def.id || typeof def.run !== 'function') throw new Error('connector needs id and run()');
    CONNECTORS[def.id] = Object.assign({ label: def.id, kinds: [], timeout: 10000, when: () => true }, def);
    return CONNECTORS[def.id];
  }

  registerConnector({
    id: 'wikipedia', label: 'ويكيبيديا', kinds: ['general'], timeout: 8000,
    async run(c) {
      const lang = hasArabic(c.q) ? 'ar' : 'en';
      const j = await c.getJson('https://' + lang + '.wikipedia.org/w/api.php?' + qs({ action: 'query', list: 'search', srsearch: c.q, srlimit: Math.min(c.limit, 6), format: 'json', origin: '*' }));
      return ((j.query && j.query.search) || []).map(x => ({
        title: x.title, url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(String(x.title).replace(/ /g, '_')),
        snippet: stripHtml(x.snippet), type: 'article', meta: { words: x.wordcount }
      }));
    }
  });

  registerConnector({
    id: 'openlibrary', label: 'Open Library', kinds: ['book', 'file'], timeout: 10000,
    async run(c) {
      const j = await c.getJson('https://openlibrary.org/search.json?' + qs({ q: c.qBook, limit: Math.min(c.limit, 10), fields: 'key,title,author_name,first_publish_year,ia,has_fulltext,public_scan_b,language,edition_count' }));
      return (j.docs || []).filter(d => d && d.key && d.title).map(d => {
        const ia = Array.isArray(d.ia) && d.ia[0];
        const pd = d.public_scan_b === true && ia;
        return {
          title: d.title + (d.author_name ? ' — ' + d.author_name.slice(0, 2).join('، ') : ''),
          url: pd ? 'https://archive.org/details/' + ia : 'https://openlibrary.org' + d.key,
          snippet: [d.first_publish_year ? 'أول نشر ' + d.first_publish_year : '', d.edition_count ? d.edition_count + ' طبعة' : '', pd ? 'نسخة مسحوحة متاحة للقراءة (ملك عام)' : (d.has_fulltext ? 'متاح للاستعارة/القراءة على Archive.org (مش بالضرورة مجاني للتنزيل)' : 'سجل فهرسة فقط')].filter(Boolean).join(' · '),
          type: 'book', rights: pd ? 'public-domain' : 'catalog', meta: { authors: d.author_name, year: d.first_publish_year, ia: ia || undefined, openLibrary: 'https://openlibrary.org' + d.key }
        };
      });
    }
  });

  registerConnector({
    id: 'gutenberg', label: 'Project Gutenberg', kinds: ['book', 'file'], timeout: 10000,
    when: (cls, raw) => !hasArabic(cleanQuery(raw, cls, 'book')), // كتالوجه أغلبه إنجليزي/أوروبي؛ للعناوين العربي بنعتمد على Hindawi/ويكي مصدر عبر البحث العام
    async run(c) {
      const j = await c.getJson('https://gutendex.com/books?' + qs({ search: c.qBook }));
      return (j.results || []).slice(0, Math.min(c.limit, 8)).map(b => {
        const f = b.formats || {};
        const epub = f['application/epub+zip'], html = f['text/html'] || f['text/html; charset=utf-8'], txt = f['text/plain; charset=utf-8'] || f['text/plain'], pdf = f['application/pdf'];
        const au = (b.authors || []).map(a => a.name).slice(0, 2).join('، ');
        return {
          title: b.title + (au ? ' — ' + au : ''), url: 'https://www.gutenberg.org/ebooks/' + b.id,
          snippet: 'ملك عام على Project Gutenberg · تنزيلات: ' + (b.download_count || 0),
          type: 'book', rights: 'public-domain',
          meta: { authors: au, languages: b.languages, files: { epub: epub || undefined, html: html || undefined, txt: txt || undefined, pdf: pdf || undefined } }
        };
      });
    }
  });

  registerConnector({
    id: 'internetarchive', label: 'Internet Archive', kinds: ['book', 'file'], timeout: 12000,
    async run(c) {
      const term = c.qBook.replace(/["():]/g, ' ').trim();
      const j = await c.getJson('https://archive.org/advancedsearch.php?' + qs({ q: '(' + term + ') AND mediatype:(texts)', 'fl[]': 'identifier', rows: Math.min(c.limit, 10), output: 'json', 'sort[]': 'downloads desc' }) +
        '&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=downloads');
      return ((j.response && j.response.docs) || []).filter(d => d && d.identifier).map(d => ({
        title: (Array.isArray(d.title) ? d.title[0] : d.title || d.identifier) + (d.creator ? ' — ' + (Array.isArray(d.creator) ? d.creator[0] : d.creator) : ''),
        url: 'https://archive.org/details/' + d.identifier,
        snippet: 'مرفوع على Archive.org' + (d.year ? ' · ' + d.year : '') + (d.downloads ? ' · ' + d.downloads + ' تنزيل' : '') + ' — الحقوق مش مضمونة لكل ملف، اتأكد من صفحة الكتاب.',
        type: 'book', rights: 'unverified', meta: { identifier: d.identifier, year: d.year }
      }));
    }
  });

  // مكتبات JavaScript على cdnjs: رابط CDN جاهز + الإصدار + الصفحة الرئيسية
  registerConnector({
    id: 'cdnjs', label: 'cdnjs (مكتبات JavaScript)', kinds: ['code'], timeout: 8000,
    when: (cls, raw) => /javascript|\bjs\b|جافا ?سكريبت|جافاسكربت|\bcdn\b|مكتبه|مكتبات|librar|plugin|اضافه/i.test(normAr(raw)),
    async run(c) {
      const term = String(c.qCode || '').replace(/جافا ?سكريبت|جافاسكربت|javascript|\bjs\b|\bcdn\b/gi, ' ').replace(/\s+/g, ' ').trim();
      if (term.length < 2) return [];
      const j = await c.getJson('https://api.cdnjs.com/libraries?' + qs({ search: term, fields: 'name,description,version,latest,homepage', limit: Math.min(c.limit, 8) }));
      return (j.results || []).filter(r => r && r.name && /^https:\/\//.test(r.latest || '')).map(r => ({
        title: r.name + (r.version ? ' v' + r.version : ''), url: r.latest,
        snippet: (r.description || 'مكتبة JavaScript') + ' · رابط CDN جاهز' + (r.homepage ? ' · الصفحة: ' + r.homepage : ''),
        type: 'package', rights: 'open-access', meta: { version: r.version, homepage: r.homepage, cdn: r.latest }
      }));
    }
  });

  // صوت وفيديو مفتوح على Internet Archive: صفحة العنصر + رابط التنزيل (الحقوق من رخصة العنصر لو مكتوبة)
  registerConnector({
    id: 'ia_media', label: 'Internet Archive (صوت وفيديو)', kinds: ['audio', 'video'], timeout: 12000,
    async run(c) {
      const term = String(c.qAudio || c.q || '').replace(/[\"():]/g, ' ').replace(/\s+/g, ' ').trim();
      if (term.length < 2) return [];
      const I = (c.cls && c.cls.intents) || {};
      const media = I.video && !I.audio ? 'movies' : (I.audio && !I.video ? 'audio' : '(audio OR movies)');
      const j = await c.getJson('https://archive.org/advancedsearch.php?' + qs({ q: '(' + term + ') AND mediatype:' + media, 'fl[]': 'identifier', rows: Math.min(c.limit, 8), output: 'json', 'sort[]': 'downloads desc' }) +
        '&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&fl%5B%5D=downloads&fl%5B%5D=mediatype&fl%5B%5D=licenseurl');
      return ((j.response && j.response.docs) || []).filter(d => d && d.identifier).map(d => ({
        title: (Array.isArray(d.title) ? d.title[0] : d.title || d.identifier) + (d.creator ? ' — ' + (Array.isArray(d.creator) ? d.creator[0] : d.creator) : ''),
        url: 'https://archive.org/details/' + d.identifier,
        snippet: 'مرفوع على Archive.org' + (d.year ? ' · ' + d.year : '') + (d.licenseurl ? ' · رخصة مفتوحة مكتوبة على العنصر' : ' · الرخصة مش مكتوبة: اتأكد قبل التنزيل'),
        type: d.mediatype === 'audio' ? 'audio' : 'video', rights: d.licenseurl ? 'open-license' : 'unverified',
        meta: { identifier: d.identifier, year: d.year, dl: 'https://archive.org/download/' + d.identifier, license: d.licenseurl || undefined }
      }));
    }
  });

  registerConnector({
    id: 'github', label: 'GitHub', kinds: ['code'], timeout: 10000,
    async run(c) {
      const j = await c.getJson('https://api.github.com/search/repositories?' + qs({ q: c.qCode, sort: 'stars', order: 'desc', per_page: Math.min(c.limit, 10) }));
      return (j.items || []).map(r => ({
        title: r.full_name, url: r.html_url,
        snippet: (r.description || 'من غير وصف') + ' · ⭐ ' + (r.stargazers_count || 0) + (r.language ? ' · ' + r.language : '') + (r.license && r.license.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? ' · ' + r.license.spdx_id : '') + (r.updated_at ? ' · آخر تحديث ' + String(r.updated_at).slice(0, 10) : ''),
        type: 'repo', meta: { stars: r.stargazers_count, language: r.language, license: r.license && r.license.spdx_id, topics: r.topics, updated: r.updated_at, archived: r.archived }
      }));
    }
  });

  registerConnector({
    id: 'npm', label: 'npm', kinds: ['code'], timeout: 8000,
    when: (cls, raw) => /\b(npm|node|javascript|js|typescript|library|package|مكتبه|مكتبة)\b/i.test(normAr(raw)) || /npm|مكتبه/.test(normAr(raw)),
    async run(c) {
      const j = await c.getJson('https://registry.npmjs.org/-/v1/search?' + qs({ text: c.qCode, size: Math.min(c.limit, 8) }));
      return (j.objects || []).map(o => o.package).filter(Boolean).map(p => ({
        title: p.name + '@' + p.version, url: (p.links && p.links.npm) || ('https://www.npmjs.com/package/' + p.name),
        snippet: (p.description || '') + (p.date ? ' · ' + String(p.date).slice(0, 10) : ''), type: 'package',
        meta: { homepage: p.links && p.links.homepage, repository: p.links && p.links.repository }
      }));
    }
  });

  registerConnector({
    id: 'openalex', label: 'OpenAlex', kinds: ['academic'], fallbackFor: 'web_scholar', timeout: 12000,
    async run(c) {
      const j = await c.getJson('https://api.openalex.org/works?' + qs({ search: c.qAcademic, 'per-page': Math.min(c.limit, 10), select: 'id,doi,title,publication_year,cited_by_count,primary_location,authorships,open_access' }));
      return (j.results || []).filter(w => w && w.title).map(w => {
        const doi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, '') : '';
        const loc = w.primary_location || {};
        const oa = w.open_access && w.open_access.oa_url;
        return {
          title: w.title, url: doi ? 'https://doi.org/' + doi : (loc.landing_page_url || w.id),
          snippet: [w.publication_year, loc.source && loc.source.display_name, (w.authorships || []).slice(0, 3).map(a => a.author && a.author.display_name).filter(Boolean).join('، '), 'استشهادات ' + (w.cited_by_count || 0)].filter(Boolean).join(' · '),
          type: 'paper', rights: oa ? 'open-access' : 'catalog', meta: { doi, year: w.publication_year, citations: w.cited_by_count, pdf: oa || undefined }
        };
      });
    }
  });

  registerConnector({
    id: 'crossref', label: 'Crossref', kinds: ['academic'], fallbackFor: 'web_scholar', timeout: 12000,
    async run(c) {
      const j = await c.getJson('https://api.crossref.org/works?' + qs({ 'query.bibliographic': c.qAcademic, rows: Math.min(c.limit, 10), select: 'DOI,title,author,issued,container-title,URL,is-referenced-by-count' }));
      return ((j.message && j.message.items) || []).filter(w => w && w.title && w.title[0]).map(w => ({
        title: w.title[0], url: 'https://doi.org/' + w.DOI,
        snippet: [w.issued && w.issued['date-parts'] && w.issued['date-parts'][0] && w.issued['date-parts'][0][0], (w['container-title'] || [])[0], (w.author || []).slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(' ')).join('، '), 'استشهادات ' + (w['is-referenced-by-count'] || 0)].filter(Boolean).join(' · '),
        type: 'paper', rights: 'catalog', meta: { doi: w.DOI, citations: w['is-referenced-by-count'] }
      }));
    }
  });

  registerConnector({
    id: 'openverse', label: 'Openverse', kinds: ['image'], fallbackFor: 'web_images', timeout: 10000,
    async run(c) {
      const j = await c.getJson('https://api.openverse.org/v1/images/?' + qs({ q: c.qImage, page_size: Math.min(c.limit, 12) }));
      return (j.results || []).filter(r => r && (r.foreign_landing_url || r.url)).map(r => ({
        title: r.title || 'صورة', url: r.foreign_landing_url || r.url,
        snippet: [r.creator ? 'المصور: ' + r.creator : '', r.license ? 'رخصة ' + String(r.license).toUpperCase() + (r.license_version ? ' ' + r.license_version : '') : '', r.source].filter(Boolean).join(' · '),
        type: 'image', rights: 'open-license', meta: { image: r.url, thumb: r.thumbnail, license: r.license, creator: r.creator }
      }));
    }
  });

  registerConnector({
    id: 'commons', label: 'Wikimedia Commons', kinds: ['image'], fallbackFor: 'web_images', timeout: 10000,
    async run(c) {
      const j = await c.getJson('https://commons.wikimedia.org/w/api.php?' + qs({ action: 'query', generator: 'search', gsrsearch: c.qImage, gsrnamespace: 6, gsrlimit: Math.min(c.limit, 10), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: 400, format: 'json', origin: '*' }));
      const pages = (j.query && j.query.pages) || {};
      return Object.keys(pages).map(k => pages[k]).filter(p => p && p.imageinfo && p.imageinfo[0]).map(p => {
        const ii = p.imageinfo[0], md = ii.extmetadata || {};
        return {
          title: String(p.title || '').replace(/^File:/, ''), url: ii.descriptionurl || ii.url,
          snippet: [md.LicenseShortName && md.LicenseShortName.value, md.Artist && stripHtml(md.Artist.value).slice(0, 60)].filter(Boolean).join(' · '),
          type: 'image', rights: 'open-license', meta: { image: ii.url, thumb: ii.thumburl }
        };
      });
    }
  });

  registerConnector({
    id: 'itunes', label: 'Apple Music/iTunes (رسمي)', kinds: ['audio'], timeout: 8000,
    async run(c) {
      const j = await c.getJson('https://itunes.apple.com/search?' + qs({ term: c.qAudio, media: 'music', limit: Math.min(c.limit, 8) }));
      return (j.results || []).filter(r => r && (r.trackViewUrl || r.collectionViewUrl)).map(r => ({
        title: (r.trackName || r.collectionName) + ' — ' + (r.artistName || ''),
        url: r.trackViewUrl || r.collectionViewUrl,
        snippet: [r.collectionName, r.releaseDate && String(r.releaseDate).slice(0, 4), r.previewUrl ? 'فيه مقطع معاينة رسمي 30 ثانية' : ''].filter(Boolean).join(' · '),
        type: 'audio', rights: 'official-store', meta: { artist: r.artistName, preview: r.previewUrl, album: r.collectionName }
      }));
    }
  });

  registerConnector({
    id: 'gdelt', label: 'GDELT (أخبار)', kinds: ['news'], fallbackFor: 'web', timeout: 12000,
    async run(c) {
      const j = await c.getJson('https://api.gdeltproject.org/api/v2/doc/doc?' + qs({ query: c.qNews, mode: 'artlist', maxrecords: Math.min(c.limit, 12), format: 'json', sort: 'datedesc', timespan: c.cls.recency ? '3d' : '14d' }));
      return (j.articles || []).filter(a => a && a.url && a.title).map(a => ({
        title: a.title, url: a.url, snippet: [a.domain, a.seendate && String(a.seendate).replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3'), a.language, a.sourcecountry].filter(Boolean).join(' · '),
        type: 'news', meta: { date: a.seendate, domain: a.domain }
      }));
    }
  });

  // ---------------------------------------------------------------- تحويل نتايج أدوات MASSR الحالية لسجلات موحّدة
  const okRes = r => r && r.status === 'ok';
  const errMsg = r => (r && (r.message || r.error)) || 'failed';
  const ADAPT = {
    web_research(r) {
      const out = [];
      (r.pages || []).forEach(p => p && p.url && out.push({ title: p.title || hostOf(p.url), url: p.url, snippet: String(p.excerpt || p.description || '').replace(/\s+/g, ' ').slice(0, 320), type: 'page', read: true, meta: { published: p.published, structured: p.structured, blocked: p.blocked, kind: p.kind } }));
      (r.more || []).forEach(x => x && x.url && out.push({ title: x.title || hostOf(x.url), url: x.url, snippet: x.snippet || '', type: 'page' }));
      return out;
    },
    web_find(r) { return (r.results || []).filter(x => x && x.url).map(x => ({ title: x.title || hostOf(x.url), url: x.url, snippet: x.snippet || '', type: 'page', meta: { via: x.via, kind: x.kind } })); },
    web_scholar(r) {
      return (r.papers || []).map(p => ({
        title: p.title, url: p.url || (p.doi ? 'https://doi.org/' + p.doi : ''), type: 'paper',
        snippet: [p.year, p.venue, Array.isArray(p.authors) ? p.authors.slice(0, 3).join('، ') : p.authors, p.citations != null ? 'استشهادات ' + p.citations : '', p.abstract ? String(p.abstract).slice(0, 200) : ''].filter(Boolean).join(' · '),
        rights: p.pdf ? 'open-access' : 'catalog', meta: { doi: p.doi, year: p.year, citations: p.citations, pdf: p.pdf }
      })).filter(x => x.url);
    },
    youtube_search(r) { return (r.results || []).map(x => ({ title: x.title, url: x.url || '', type: 'video', snippet: x.channel ? 'قناة: ' + x.channel : '', meta: { channel: x.channel, shownInChat: !x.url } })); },
    web_images(r) { return (r.images || []).map(i => ({ title: i.title || 'صورة', url: i.page || '', type: 'image', snippet: [i.size, i.license ? 'رخصة: ' + i.license : '', i.from].filter(Boolean).join(' · '), rights: i.license ? 'open-license' : 'unverified', meta: { n: i.n } })); }
  };

  // ---------------------------------------------------------------- توحيد + ترتيب
  function toRecord(rec, source, pos) {
    const url = canonUrl(rec.url);
    if (!url || !isSafeUrl(url)) return null;
    return {
      title: stripHtml(rec.title || hostOf(url)).slice(0, 200), url, rawUrl: rec.url, snippet: stripHtml(rec.snippet || '').slice(0, 360),
      type: rec.type || 'page', rights: rec.rights, meta: rec.meta, read: !!rec.read,
      sources: [source], pos, host: hostOf(url)
    };
  }
  function mergeRecords(lists) {
    const map = new Map(); let blocked = 0, invalid = 0;
    lists.forEach(({ source, records }) => {
      (records || []).forEach((r, i) => {
        const rec = toRecord(r, source, i);
        if (!rec) { invalid++; return; }
        if (isBlocked(rec.url)) { blocked++; return; }
        const ex = map.get(rec.url);
        if (!ex) { map.set(rec.url, rec); return; }
        if (!ex.sources.includes(source)) ex.sources.push(source);
        if (rec.snippet.length > ex.snippet.length) ex.snippet = rec.snippet;
        if (rec.read) ex.read = true;
        ex.pos = Math.min(ex.pos, rec.pos);
        ex.meta = Object.assign({}, rec.meta, ex.meta);
        if (!ex.rights && rec.rights) ex.rights = rec.rights;
        if (ex.type === 'page' && rec.type !== 'page') ex.type = rec.type;
      });
    });
    return { records: Array.from(map.values()), blocked, invalid };
  }
  const TYPE_FOR_INTENT = { image: ['image'], video: ['video'], audio: ['audio', 'video'], academic: ['paper'], book: ['book'], file: ['book', 'page'], product: ['page'], code: ['repo', 'package'], news: ['news', 'page'], live: ['page', 'news'] };
  function rank(records, query, cls) {
    const qt = uniq(relTokens(query));
    const wantTypes = new Set(); (cls.types || []).forEach(k => (TYPE_FOR_INTENT[k] || []).forEach(t => wantTypes.add(t)));
    records.forEach(r => {
      const tt = new Set(relTokens(r.title)), st = new Set(relTokens(r.snippet));
      let rel = 0;
      if (qt.length) {
        const hitT = qt.filter(t => tt.has(t) || [...tt].some(x => x.length > 3 && (x.includes(t) || t.includes(x)) && Math.min(x.length, t.length) >= 3)).length;
        const hitS = qt.filter(t => st.has(t)).length;
        rel = clamp((hitT * 1.0 + hitS * 0.4) / qt.length, 0, 1);
      } else rel = 0.5;
      const pos = 1 / (1 + (r.pos || 0) * 0.35);
      const trust = trustOf(r.url);
      const fit = wantTypes.size ? (wantTypes.has(r.type) ? 1 : (r.type === 'page' ? 0.55 : 0.35)) : 0.7;
      const agree = clamp((r.sources.length - 1) * 0.5, 0, 1);
      const bonus = (r.read ? 0.05 : 0) + (r.rights === 'public-domain' || r.rights === 'open-access' ? 0.05 : 0) + (r.meta && r.meta.archived ? -0.1 : 0) + (r.meta && r.meta.platform ? 0.15 : 0);
      r.score = Math.round((0.40 * rel + 0.15 * pos + 0.20 * trust + 0.15 * fit + 0.10 * agree + bonus) * 1000) / 1000;
      r.trust = trust;
    });
    return records.sort((a, b) => b.score - a.score || a.pos - b.pos);
  }
  function legalFlag(r) {
    const h = r.host, direct = DIRECT_FILE.test(r.url);
    if (r.rights === 'public-domain') return 'ملك عام';
    if (r.rights === 'catalog') return 'سجل فهرسة/صفحة بيانات (مش رابط تحميل)';
    if (r.rights === 'unverified') return 'الحقوق غير مؤكدة: افتح الصفحة وتأكد قبل التنزيل';
    if (r.rights === 'open-access' || OPEN_HOSTS.test(h)) return 'مصدر مفتوح/مجاني معروف';
    if (r.rights === 'official-store' || /(^|\.)(apple\.com|spotify\.com|youtube\.com|anghami\.com|deezer\.com)$/.test(h)) return 'منصة رسمية';
    if (r.rights === 'open-license') return 'رخصة مفتوحة (اتأكد من شروطها)';
    if (direct) return 'ملف مباشر: تأكد من حقوقه قبل التنزيل';
    return undefined;
  }

  // ---------------------------------------------------------------- المنسّق
  const ms = t0 => Date.now() - t0;
  async function run(rawQuery, opts, deps) {
    opts = opts || {}; deps = deps || {};
    const T0 = Date.now();
    const raw = String(rawQuery || '').replace(/\s+/g, ' ').trim();
    if (raw.length < 2) return { status: 'error', message: 'اكتب موضوع البحث أو السؤال.' };
    const tools = deps.tools || {};
    const log = deps.log || (() => { });
    const limit = clamp(Number(opts.max_results) || 8, 3, 15);
    const deep = opts.depth === 'deep';
    const cls = classify(raw, opts.types);
    const I = cls.intents;
    const region = opts.region || (cls.arabic && (I.product || I.news) ? 'eg-ar' : '');
    const fresh = opts.fresh || (I.news || cls.recency ? (I.news ? 'w' : 'm') : '');
    const alt = (Array.isArray(opts.queries) ? opts.queries : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 3);

    const cacheKey = JSON.stringify([normAr(raw), cls.types, region, fresh, deep, limit, alt]);
    if (!opts.nocache) {
      const hit = resultCache.get(cacheKey);
      if (hit) return Object.assign({}, hit, { cached: true });
    }

    const qMain = cleanQuery(raw, cls);
    const ctxBase = {
      cls, raw, limit, q: qMain,
      qBook: cleanQuery(raw, cls, 'book'), qCode: cleanQuery(raw, cls, 'code'), qAcademic: cleanQuery(raw, cls, 'academic'),
      qImage: cleanQuery(raw, cls, 'image'), qAudio: cleanQuery(raw, cls, 'audio'), qNews: cleanQuery(raw, cls, 'news'),
      getJson: (u, o) => fetchJson(u, Object.assign({ fetch: deps.fetch }, o))
    };

    const sources = []; // تقرير كل مصدر
    const lists = [];   // {source, records}
    let pagesOut = [], googleSummary = '', inlineImages = null, imagesNote = '';
    const jobs = [];
    const actEmit = o => { try { if (typeof window !== 'undefined' && window.massrAct) window.massrAct.step(o); } catch (e) { } };
    let announced = false;
    const job = (id, label, timeout, fn) => {
      const t = Date.now();
      if (!announced) { announced = true; actEmit({ icon: '🔎', text: 'بدور على «' + String(qMain).slice(0, 60) + '»', detail: 'في كذا مصدر بالتوازي' }); }
      jobs.push((async () => {
        try {
          const out = await withTimeout(fn(), timeout);
          const recs = (out && out.records) || [];
          lists.push({ source: id, records: recs });
          actEmit({ icon: recs.length ? '✅' : '⚪', text: label + (recs.length ? ' — ' + recs.length + ' نتيجة' : ' — مفيش نتايج'), url: recs[0] && recs[0].url, detail: recs[0] && recs[0].title ? String(recs[0].title).slice(0, 90) : '' });
          if (out && out.pages) pagesOut = pagesOut.concat(out.pages);
          sources.push({ source: id, label, ok: recs.length > 0 || !!(out && out.ok), count: recs.length, ms: ms(t), error: recs.length || (out && out.ok) ? undefined : ((out && out.error) || 'مفيش نتايج') });
        } catch (e) {
          sources.push({ source: id, label, ok: false, count: 0, ms: ms(t), error: String((e && e.message) || e).slice(0, 160) });
          actEmit({ icon: '⚠️', text: label + ' — ماردّش', state: 'err' });
        }
      })());
    };
    // تشغيل أداة MASSR حالية مع تحويل نتيجتها لسجلات
    async function viaTool(name, args) {
      const tl = tools[name];
      if (!tl || typeof tl.handler !== 'function') return { records: [], error: 'الأداة ' + name + ' مش موجودة في التطبيق' };
      if (WORKER_TOOLS.has(name) && Date.now() < state.workerBackoffUntil) return { records: [], error: 'الوركر في فترة راحة بسبب حد الطلبات (حوالي دقيقة)' };
      const r = await tl.handler(args);
      if (!okRes(r)) { if (WORKER_TOOLS.has(name) && RATE_RE.test(errMsg(r))) state.workerBackoffUntil = Date.now() + 60000; return { records: [], error: errMsg(r) }; }
      return { raw: r, records: (ADAPT[name] ? ADAPT[name](r) : []), ok: true };
    }
    // مصدر بتدرّج: جرّب الأداة الأول، ولو فشلت/فاضية جرّب الموصّلات البديلة بالتوازي
    const runConnector = async (id) => {
      const cn = CONNECTORS[id];
      if (Date.now() < (state.breaker[id] || 0)) throw new Error('حد الطلبات: المصدر في راحة 5 دقايق');
      try { return { id, records: await cn.run(Object.assign({ cls }, ctxBase)) }; }
      catch (e) { if (/(?:^|\D)(429|403)(?:\D|$)/.test(String((e && e.message) || e))) state.breaker[id] = Date.now() + 5 * 60000; throw e; }
    };
    const connectorJob = (id) => {
      const cn = CONNECTORS[id]; if (!cn) return;
      job(id, cn.label, cn.timeout, async () => ({ records: (await runConnector(id)).records }));
    };
    const withFallbackConnectors = (toolName, label, timeout, args, kind, nonOkNote) => {
      job(toolName, label, timeout, async () => {
        let first = null;
        try { first = await viaTool(toolName, args); } catch (e) { first = { records: [], error: String((e && e.message) || e) }; }
        if (first.records.length) { first.ok = true; return first; }
        const fb = Object.values(CONNECTORS).filter(c => c.fallbackFor === toolName && c.kinds.includes(kind));
        const settled = await Promise.all(fb.map(c => withTimeout(runConnector(c.id), c.timeout).then(v => ({ c, v }), e => ({ c, e }))));
        const recs = [];
        settled.forEach(s => {
          if (s.v && s.v.records.length) { recs.push(...s.v.records); sources.push({ source: s.c.id, label: s.c.label, ok: true, count: s.v.records.length, ms: ms(T0), fallbackFor: toolName }); }
          else sources.push({ source: s.c.id, label: s.c.label, ok: false, count: 0, ms: ms(T0), error: s.e ? String(s.e.message || s.e).slice(0, 120) : 'مفيش نتايج', fallbackFor: toolName });
        });
        return { records: recs, ok: !!recs.length, error: first.error + (nonOkNote || '') };
      });
    };

    // ---- 1) الأساس: البحث العام دايمًا (من غير Gemini؛ هو احتياطي أخير تحت)
    const webArgs = { query: raw, queries: alt, region, fresh, pages: deep ? 6 : 4, depth: deep ? 'deep' : 'brief', noGemini: true };
    job('web', 'بحث الويب العام', 62000, async () => {
      let out = null, err = '';
      try {
        if (tools.web_research) out = await viaTool('web_research', webArgs);
        if ((!out || !out.records.length) && tools.web_find) {
          const alt2 = await viaTool('web_find', { query: raw, queries: alt, region, fresh, num: limit, noGemini: true });
          if (alt2.records.length || !out) out = alt2;
        }
      } catch (e) { err = String((e && e.message) || e); }
      if (!out) return { records: [], error: err || 'أدوات الويب مش متاحة' };
      const pages = out.raw && out.raw.pages ? out.raw.pages.slice(0, deep ? 5 : 3).map(p => ({ url: p.url, title: p.title, excerpt: String(p.excerpt || '').slice(0, deep ? 2200 : 1400), published: p.published, structured: p.structured, blocked: p.blocked || undefined })) : [];
      return { records: out.records, pages, ok: out.records.length > 0, error: out.error };
    });

    // ---- 2) المصادر المتخصصة (إضافية، مش بديل)
    if (I.academic) withFallbackConnectors('web_scholar', 'أبحاث (OpenAlex/Crossref/Semantic Scholar)', 40000, { query: ctxBase.qAcademic, num: limit }, 'academic');
    if (I.image && tools.web_images) {
      job('web_images', 'صور', 55000, async () => {
        const r = await viaTool('web_images', { query: ctxBase.qImage, num: Math.min(8, limit) });
        if (r.raw && r.raw.__imageInlineDataList) { inlineImages = r.raw.__imageInlineDataList; delete r.raw.__imageInlineDataList; imagesNote = r.raw.message || ''; }
        if (r.records.length) { r.ok = true; return r; }
        const fb = ['openverse', 'commons'].filter(id => CONNECTORS[id]);
        const s = await Promise.all(fb.map(id => withTimeout(runConnector(id), CONNECTORS[id].timeout).then(v => v.records, () => [])));
        const recs = [].concat(...s);
        return { records: recs, ok: recs.length > 0, error: r.error };
      });
    } else if (I.image) { ['openverse', 'commons'].forEach(connectorJob); }
    if (I.video || I.audio) {
      const asVideo = I.video && !(I.audio && cls.wantsPlay);
      job('youtube', 'يوتيوب', 40000, async () => {
        let r = null;
        if (tools.youtube_search) { try { r = await viaTool('youtube_search', { query: ctxBase.qAudio && I.audio && !I.video ? ctxBase.qAudio : cleanQuery(raw, cls, 'video'), limit: Math.min(limit, 6), video: asVideo }); } catch (e) { r = { records: [], error: String((e && e.message) || e) }; } }
        if (r && r.records.length) { r.ok = true; return r; }
        if (tools.web_find) {
          const w = await viaTool('web_find', { query: raw + ' site:youtube.com', queries: [raw + ' YouTube official'], num: limit, region, noGemini: true });
          w.records = w.records.filter(x => /youtube\.com|youtu\.be/.test(x.url)).map(x => Object.assign({}, x, { type: 'video' }));
          if (w.records.length) { w.ok = true; return w; }
        }
        return { records: [], error: (r && r.error) || 'يوتيوب مش متاح' };
      });
    }
    if (I.audio) connectorJob('itunes');
    if (I.book || I.file) {
      ['openlibrary', 'gutenberg', 'internetarchive'].forEach(id => { if (CONNECTORS[id] && CONNECTORS[id].when(cls, raw)) connectorJob(id); });
      if (tools.web_find) {
        const bq = ctxBase.qBook;
        const extra = [bq + ' filetype:pdf', cls.arabic ? bq + ' site:hindawi.org' : bq + ' open access ebook', bq + ' site:archive.org'];
        job('books_web', 'بحث كتب وملفات (ويب)', 40000, async () => { const r = await viaTool('web_find', { query: bq, queries: extra, num: limit, region, noGemini: true }); r.records = r.records.map(x => Object.assign({}, x, { type: DIRECT_FILE.test(x.url) || /\bbook|كتاب|pdf/i.test(x.title) ? 'book' : 'page' })); return r; });
      }
    }
    if (I.code) {
      connectorJob('github');
      if (CONNECTORS.npm.when(cls, raw)) connectorJob('npm');
      if (tools.web_find) job('code_web', 'توثيق وأكواد (ويب)', 40000, () => viaTool('web_find', { query: ctxBase.qCode, queries: [ctxBase.qCode + ' site:github.com', ctxBase.qCode + ' documentation'], num: limit, noGemini: true }));
    }
    if (I.product && tools.web_research) {
      job('products', 'أسعار ومنتجات', 60000, async () => {
        const r = await viaTool('web_research', { query: ctxBase.q + ' سعر', queries: [ctxBase.q + ' price', ctxBase.q + ' buy ' + (region === 'eg-ar' ? 'Egypt noon amazon.eg jumia' : '')], region: region || 'eg-ar', pages: 5, depth: 'brief', noGemini: true });
        if (r.raw && r.raw.pages) r.pages = r.raw.pages.slice(0, 4).map(p => ({ url: p.url, title: p.title, excerpt: String(p.excerpt || '').slice(0, 1100), structured: p.structured, published: p.published }));
        return r;
      });
    }
    if (I.news) {
      connectorJob('gdelt');
    }
    if (I.code && CONNECTORS.cdnjs && CONNECTORS.cdnjs.when(cls, raw)) connectorJob('cdnjs');
    if (I.audio || I.video) connectorJob('ia_media');
    // منصات ومواقع مسمّاة في الطلب: بحث جواها عبر محرك البحث (صفحات عامة بس)
    const plats = detectPlatforms(raw).slice(0, 2);
    if (plats.length && tools.web_find) {
      const pq = stripPlatformWords(cleanQuery(raw, cls), plats);
      plats.forEach(pl => job('site_' + pl.id, 'بحث داخل ' + pl.label, 40000, async () => {
        const r = await viaTool('web_find', { query: pq, site: pl.site, num: limit, region, noGemini: true });
        r.records = r.records.filter(x => { const h = hostOf(x.url); return h === pl.site || h.endsWith('.' + pl.site); }).map(x => Object.assign({}, x, { type: 'page', meta: Object.assign({}, x.meta, { platform: pl.label }) }));
        r.ok = r.records.length > 0;
        if (!r.ok && !r.error) r.error = 'مفيش نتايج عامة من ' + pl.label + ' (غالبًا محتواه محتاج تسجيل دخول)';
        return r;
      }));
    }
    // ويكيبيديا: معلومة عامة سريعة وروابط موثوقة (بتتشغّل لو الطلب مش منتجات/صور/كود بحت)
    if (!I.product && !I.image && !I.code && !I.audio) connectorJob('wikipedia');
    // موصّلات سجّلها المستخدم لاحقًا
    Object.values(CONNECTORS).forEach(c => {
      if (c.custom && c.kinds.some(k => k === 'general' || I[k]) && c.when(cls, raw)) connectorJob(c.id);
    });

    await Promise.all(jobs);

    // ---- 3) توحيد وترتيب
    const merged = mergeRecords(lists);
    let ranked = rank(merged.records, qMain, cls);
    const webSrc = sources.find(s => s.source === 'web');
    const webOk = !!(webSrc && webSrc.ok);

    // ---- 4) Gemini: احتياطي أخير فقط لو النتايج المفيدة أقل من 3
    let fallback = null;
    if ((ranked.length < 3 || I.live) && typeof deps.grounded === 'function' && opts.gemini !== false) {
      const t = Date.now();
      try {
        const g = await withTimeout(deps.grounded(I.live ? raw + ' (اذكر النتيجة أو الرقم بالظبط مع التاريخ والتوقيت واسم المصدر)' : raw, region, 8), 25000);
        if (g && g.ok) {
          googleSummary = g.text || '';
          const gl = (g.sources || []).map(s => ({ title: s.title || hostOf(s.url), url: s.url, snippet: '', type: 'page' }));
          const m2 = mergeRecords(lists.concat([{ source: 'gemini', records: gl }]));
          ranked = rank(m2.records, qMain, cls);
          merged.blocked = m2.blocked;
          sources.push({ source: 'gemini', label: 'Gemini (احتياطي أخير)', ok: true, count: gl.length, ms: ms(t) });
          fallback = 'gemini';
        } else sources.push({ source: 'gemini', label: 'Gemini (احتياطي أخير)', ok: false, count: 0, ms: ms(t), error: (g && g.note) || 'مرجعش حاجة' });
      } catch (e) { sources.push({ source: 'gemini', label: 'Gemini (احتياطي أخير)', ok: false, count: 0, ms: ms(t), error: String((e && e.message) || e).slice(0, 120) }); }
    }

    // لو فيه نتيجة قريبة من النوع المطلوب خلّيها ضمن الـ limit
    const top = ranked.slice(0, limit);
    const results = top.map((r, i) => {
      const o = { n: i + 1, type: r.type, title: r.title, url: r.url, snippet: r.snippet || undefined, score: r.score, from: r.sources };
      const lf = legalFlag(r); if (lf) o.rights = lf;
      if (DIRECT_FILE.test(r.url)) o.direct_file = true;
      if (r.read) o.read_by_search = true;
      if (r.meta) {
        const m = {}; ['doi', 'year', 'citations', 'pdf', 'authors', 'stars', 'language', 'license', 'updated', 'files', 'artist', 'preview', 'channel', 'published', 'image', 'creator', 'ia', 'openLibrary', 'dl', 'platform', 'cdn', 'version', 'homepage'].forEach(k => { if (r.meta[k] != null && r.meta[k] !== '') m[k] = r.meta[k]; });
        if (Object.keys(m).length) o.meta = m;
      }
      return o;
    });

    const okSources = sources.filter(s => s.ok), badSources = sources.filter(s => !s.ok);
    const byType = {}; results.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });
    if (!results.length && !pagesOut.length && !googleSummary) {
      return { status: 'error', message: 'مقدرتش ألاقي نتايج قابلة للاستخدام لـ "' + raw + '". ' + badSources.map(s => s.label + ': ' + (s.error || 'فشل')).join(' | ') + ' — جرّب صياغة تانية أو بالإنجليزي.', sources, tookMs: ms(T0) };
    }
    const notes = [];
    if (!webOk) notes.push('البحث العام (الوركر) ماردّش' + (webSrc && webSrc.error ? ' (' + webSrc.error + ')' : '') + ' فاعتمدت على المصادر المباشرة المتاحة.');
    if (merged.blocked) notes.push('اتشالت ' + merged.blocked + ' نتيجة من مواقع قرصنة/تنزيل غير مصرّح به.');
    if (I.live) notes.push('طلب حي (نتيجة/ترتيب/سعر/طقس): الأرقام في google_summary من بحث جوجل الحي وبتتغيّر مع الوقت. اذكر المصدر والتوقيت لو ظاهر، ولو مفيش رقم أكيد قول كده وماتخمّنش. لو المستخدم سمّى موقع (365Scores/في الجول/يلا كورة) شوف results اللي من الموقع ده.');
    if (fallback === 'gemini' && !I.live) notes.push('النتايج كانت قليلة فاستخدمت بحث جوجل الحي عبر Gemini كاحتياطي أخير: اعتبره ملخصًا مش قراءة مباشرة.');
    if (I.book || I.file) notes.push('مفيش رابط تحميل يتقدّم كـ"مجاني/قانوني" غير اللي عليه rights (ملك عام/مفتوح/منصة رسمية). صفحة الكتاب مش هي ملف PDF مباشر إلا لو direct_file=true.');
    if (I.audio || I.video) notes.push('قدّم مصادر الاستماع/المشاهدة الرسمية فقط (يوتيوب الرسمي، Apple Music...)، وماتدلّش على مواقع تنزيل.');
    if (results.some(r => r.from && r.from.some(f => ['openlibrary', 'gutenberg', 'internetarchive', 'github', 'npm', 'wikipedia', 'openalex', 'crossref', 'openverse', 'commons', 'itunes', 'gdelt'].includes(f))))
      notes.push('روابط المصادر المباشرة (Open Library/GitHub/…) ممكن web_read يرفضها لو الوركر شغّال؛ استخدم البيانات اللي في النتيجة نفسها.');

    try {
      const top = results.filter(r => r && r.url).slice(0, 8);
      if (top.length) actEmit({ kind: 'sources', list: top.map(r => ({ title: r.title, url: r.url })) });
      const ims = results.map(r => (r.meta && (r.meta.thumb || r.meta.image)) || (r.type === 'image' ? r.url : '')).filter(Boolean).slice(0, 8);
      if (ims.length) actEmit({ kind: 'images', imgs: ims });
    } catch (e) { }
    const out = {
      status: 'ok', query: raw, search_query: qMain, detected_types: cls.types, primary: cls.primary, region: region || undefined, fresh: fresh || undefined,
      result_count: results.length, by_type: byType, results,
      pages: pagesOut.length ? dedupePages(pagesOut).slice(0, deep ? 6 : 4) : undefined,
      google_summary: googleSummary || undefined, fallback_used: fallback || undefined,
      sources, sources_ok: okSources.length, sources_failed: badSources.map(s => ({ source: s.source, label: s.label, error: s.error })),
      notes: notes.length ? notes.join(' ') : undefined, took_ms: ms(T0), engine: 'massr-universal-search/' + VERSION
    };
    if (inlineImages && inlineImages.length) { out.images_attached = inlineImages.length; out.images_note = imagesNote; }
    // الكاش للنتايج الناجحة بس (الأخبار مدة أقصر)
    if (okSources.length) resultCache.set(cacheKey, out, I.news || cls.recency ? 2 * 60 * 1000 : undefined);
    out.__inlineImages = inlineImages || undefined;
    return out;
  }
  function dedupePages(pages) { const s = new Set(); return pages.filter(p => { const u = canonUrl(p.url); if (!u || s.has(u) || isBlocked(u)) return false; s.add(u); return true; }); }

  return {
    version: VERSION, run, classify, cleanQuery, canonUrl, isBlocked, isSafeUrl, trustOf, normAr, rank, mergeRecords, legalFlag,
    connectors: CONNECTORS, registerConnector: def => { const c = registerConnector(Object.assign({}, def, { custom: true })); return c; },
    BLOCKLIST, caches: { results: resultCache, http: httpCache }, fetchJson, withTimeout
  };
});

/* =====================================================================
   تسجيل الأداة في MASSR: massr_universal_search
   بيعتمد على الجسر window.__massrWT اللي بيعرّضه webtools.js (reg/ok/er/taint/act/groundedSearch).
   لو الجسر مش موجود (webtools.js ماتحمّلش) الملف بيسكت ومفيش حاجة في التطبيق بتتكسر.
   ===================================================================== */
(function () {
  try {
    if (typeof window === 'undefined' || !window.MASSR_SEARCH || !window.__massrWT || typeof APP_ACTIONS === 'undefined') return;
    const W = window.__massrWT, M = window.MASSR_SEARCH;
    const S = { type: 'string' }, N = { type: 'number' }, SA = { type: 'array', items: { type: 'string' } };
    const d = (t, x) => Object.assign({}, t, { description: x });
    const TYPES = ['image', 'video', 'audio', 'academic', 'book', 'file', 'product', 'code', 'news', 'live'];
    const MODES = ['summary', 'full', 'pdf', 'product', 'download_link'];
    const CHUNK = 14000; // حجم الجزء الواحد من web_read
    const LEGAL_OK = /^(ملك عام|مصدر مفتوح|منصة رسمية|رخصة مفتوحة)/;
    const FILE_EXT = /\.(pdf|epub|mobi|djvu|azw3?|docx?|xlsx?|pptx?|mp3|m4a|flac|ogg|zip)(?:[?#]|$)/i;
    const okUrl = u => /^https?:\/\//i.test(String(u || '')) && M.isSafeUrl(u) && !M.isBlocked(u);

    // كارت تحميل في الشات (نفس شكل كارت الملفات + زرار ⬇)، بيتحفظ ويتعاد رسمه مع المحادثة
    function appendDownloadCard(item, replay) {
      try {
        const m = document.getElementById('aiChatMessages');
        if (!m || !item || !item.url) return;
        if (typeof aiBuildFileCard !== 'function' || typeof appendToAIMessages !== 'function') { if (typeof appendAIWebResultCard === 'function') appendAIWebResultCard({ url: item.url, title: item.title }); return; }
        const es = document.getElementById('aiChatEmptyState'); if (es) es.style.display = 'none';
        let host = ''; try { host = new URL(item.url).hostname; } catch (e) { }
        const ext = ((FILE_EXT.exec(item.url) || [])[1] || 'pdf').toLowerCase();
        const name = String(item.title || host || 'ملف').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) + '.' + ext;
        const card = document.createElement('div'); card.className = 'ai-web-result-card';
        const box = aiBuildFileCard(name, '', 0, item.url);
        const dl = box.querySelector('.aiFC-dl');
        if (dl) { dl.removeAttribute('download'); dl.target = '_blank'; dl.rel = 'noopener noreferrer'; dl.title = 'تحميل'; }
        const note = document.createElement('div');
        note.style.cssText = 'font-size:.7rem;color:var(--text-secondary);margin-top:6px;text-align:right;direction:rtl;white-space:normal';
        note.textContent = [host, item.rights].filter(Boolean).join(' · ');
        card.append(box, note);
        appendToAIMessages(card); m.scrollTop = m.scrollHeight;
        if (!replay && typeof aiRecordCard === 'function' && !(typeof aiReplayingUI !== 'undefined' && aiReplayingUI)) aiRecordCard('dl', { item: { url: item.url, title: item.title, rights: item.rights } });
      } catch (e) { }
    }
    window.aiExtraReplay = window.aiExtraReplay || {};
    window.aiExtraReplay.dl = function (d) { appendDownloadCard(d && d.item, true); };

    // قراءة كاملة لرابط واحد بأجزاء (web_read بيرجّع 14000 حرف في الجزء)؛ بيرجّع {ok,parts,more,...}
    async function readFull(url, maxParts) {
      const tl = APP_ACTIONS.web_read; if (!tl || typeof tl.handler !== 'function') return { ok: false, url, error: 'web_read مش متاح' };
      let first;
      try { first = await tl.handler({ url, max_chars: CHUNK, page: 0 }); } catch (e) { return { ok: false, url, error: String((e && e.message) || e).slice(0, 120) }; }
      if (!first || first.status !== 'ok') return { ok: false, url, error: (first && first.message) || 'القراءة فشلت' };
      const t0 = String(first.text || '');
      if (first.warning || t0.trim().length < 400 || first.quality === 'poor' || first.quality === 'empty') return { ok: false, url, error: first.warning || first.pdfNote || 'النص ناقص أو فاضي' };
      const total = Number(first.totalChars) || t0.length;
      const need = Math.max(1, Math.min(maxParts, Math.ceil(total / CHUNK)));
      const texts = [t0];
      if (need > 1) {
        const rest = await Promise.all(Array.from({ length: need - 1 }, (_, i) => tl.handler({ url, max_chars: CHUNK, page: i + 1 }).catch(() => null)));
        for (const r of rest) { if (r && r.status === 'ok' && r.text) texts.push(String(r.text)); else break; }
      }
      const covered = Math.min(total, texts.length * CHUNK);
      return {
        ok: true, url: first.url || url, title: first.title || '', type: first.type || 'html', total_chars: total,
        parts: texts.map((t, i) => ({ part: i + 1, text: t })), parts_count: texts.length,
        more: covered < total ? { next_page: texts.length, remaining_chars: total - covered, how: 'web_read بنفس الرابط وpage=' + texts.length + ' وmax_chars=' + CHUNK } : undefined
      };
    }
    // مرشحين للقراءة الكاملة: PDF المفتوح الأول (للأوراق) ثم صفحة النتيجة، من غير صور/فيديو/صوت
    function readCandidates(r, limit) {
      const out = [], seen = new Set();
      const add = u => { if (u && okUrl(u) && !seen.has(u)) { seen.add(u); out.push(u); } };
      (r.results || []).filter(x => x && x.url && !/^(image|video|audio)$/.test(x.type) && !(x.meta && x.meta.shownInChat)).forEach(x => {
        if (x.meta && x.meta.pdf) add(x.meta.pdf);
        if (x.direct_file) add(x.url);
      });
      (r.results || []).filter(x => x && x.url && !/^(image|video|audio)$/.test(x.type)).forEach(x => add(x.url));
      return out.slice(0, limit);
    }
    const slimObj = o => { const x = {}; Object.keys(o || {}).slice(0, 14).forEach(k => { const v = o[k]; if (v == null) return; if (typeof v === 'string') x[k] = v.slice(0, 300); else if (typeof v === 'number' || typeof v === 'boolean') x[k] = v; else { try { x[k] = JSON.stringify(v).slice(0, 200); } catch (e) { } } }); return x; };
    W.reg('massr_universal_search', '🌐 بحث شامل — MASSR',
      'المدخل الأول لأي طلب بحث بلغة طبيعية (عربي أو إنجليزي): مواقع ومقالات ومعلومات وأخبار وكتب وروايات وPDF وأبحاث علمية وصور وفيديوهات ويوتيوب وأغاني وأناشيد ومنتجات وأسعار ومستودعات GitHub ومكتبات. بيفهم النوع تلقائيًا ويشغّل البحث العام دايمًا + المصادر المتخصصة المناسبة بالتوازي، ويشيل المكرر ومواقع القرصنة، ويرتّب بالصلة والجودة، ويرجّع روابط حقيقية وحالة كل مصدر (اللي فشل بيتذكر). لو عايز تشغّل أنشودة/أغنية مباشرة جوه الشات استخدم youtube_search؛ ولقراءة صفحة معيّنة web_read. باراميتر mode بيحدد المطلوب: summary (افتراضي: مقتطفات وروابط) | full (النص الكامل للبحث أو المقال أو الورقة مقسّم لأجزاء، مش ملخص) | pdf (النص الكامل جاهز تترجمه وتعمل منه PDF بأدوات الملفات) | product (بيانات المنتج: الاسم والسعر والمواصفات والروابط) | download_link (بيدوّر على رابط تحميل مباشر قانوني وبيعرضه للمستخدم كارت فيه زر تحميل).',
      {
        query: d(S, 'طلب المستخدم بلغته (كلمات مفتاحية أو جملة طبيعية).'),
        types: d(SA, 'اختياري، تلميح منك لنوع الطلب لو واضح: ' + TYPES.join(' | ') + ' (تقدر تبعت أكتر من نوع).'),
        queries: d(SA, 'اختياري: لحد 3 صياغات بديلة (بالإنجليزي أو بلغة المصدر) للبحث العام.'),
        region: d(S, 'اختياري: منطقة ولغة مثل eg-ar أو us-en (للأسعار والأخبار المحلية).'),
        fresh: d(S, 'اختياري: حداثة d يوم | w أسبوع | m شهر | y سنة.'),
        depth: d(S, 'brief (افتراضي) أو deep لبحث أوسع وقراءة أطول.'),
        max_results: d(N, 'عدد الروابط المرجّعة 3-15 (افتراضي 8).'),
        mode: { type: 'string', enum: MODES, description: 'المطلوب بالظبط: summary (افتراضي) | full (النص الكامل) | pdf (النص الكامل للترجمة وعمل PDF) | product (بيانات منتج) | download_link (رابط تحميل في كارت). اختار full لما المستخدم يقول بحث كامل أو عايز النص كله، وproduct لما يسأل عن منتج أو سعر، وdownload_link لما يطلب رابط تحميل.' },
        url: d(S, 'اختياري مع full أو pdf: رابط محدد من نتيجة سابقة عايز نصه الكامل (من غير بحث جديد).')
      },
      ['query'],
      async a => {
        const q = W.norm(a.query);
        if (q.length < 2) return W.er('اكتب موضوع البحث أو السؤال.');
        const mode = MODES.indexOf(a.mode) >= 0 ? a.mode : 'summary';

        // قراءة كاملة لرابط محدد من غير بحث جديد
        if ((mode === 'full' || mode === 'pdf') && a.url) {
          const u = String(a.url || '').trim();
          if (!okUrl(u)) return W.er('الرابط مش صالح أو مش مسموح.');
          W.act('📖 بقرا كامل: ' + W.hostOf(u));
          const f = await readFull(u, mode === 'pdf' ? 6 : 3);
          if (!f.ok) return W.er('مقدرتش أقرا الرابط كامل (' + f.error + '). جرّب مصدر تاني من نتايج البحث.');
          W.taint();
          return W.ok({ mode, query: q, full: f, message: fullMessage(mode, f) + W.UNTRUSTED });
        }

        W.act('🌐 بحث شامل: ' + q.slice(0, 60));
        const tools = {}; ['web_research', 'web_find', 'web_scholar', 'web_images', 'youtube_search'].forEach(n => { if (APP_ACTIONS[n] && APP_ACTIONS[n].handler) tools[n] = APP_ACTIONS[n]; });
        let types = Array.isArray(a.types) ? a.types.slice() : [];
        if (mode === 'product' && types.indexOf('product') < 0) types.push('product');
        if (mode === 'download_link') ['book', 'file'].forEach(t => { if (types.indexOf(t) < 0) types.push(t); });
        let r;
        try { r = await M.run(q, { query: q, types: types.length ? types : a.types, queries: a.queries, region: a.region, fresh: a.fresh, depth: a.depth, max_results: a.max_results }, { tools, grounded: W.groundedSearch, fetch: window.fetch ? window.fetch.bind(window) : undefined }); }
        catch (e) { return W.er('البحث الشامل فشل: ' + String((e && e.message) || e).slice(0, 160)); }
        if (!r || r.status !== 'ok') return r || W.er('مفيش نتايج.');
        W.taint();
        const imgs = r.__inlineImages; delete r.__inlineImages;
        r = Object.assign({}, r); // الكاش بيرجّع نفس الكائن: ما نعدّلش عليه
        r.message = 'دي نتايج حقيقية من مصادر متعددة (النوع المكتشف: ' + (r.detected_types.join('، ') || 'عام') + '). استخدم الروابط اللي في results بس، وماتألفش رابط ولا سعر ولا رابط تحميل. اقرا pages (مقتطفات اتقرت فعلًا) واعتمد عليها، ولو محتاج صفحة تانية افتحها بـ web_read. اذكر للمستخدم المصادر اللي فشلت (sources_failed) بصراحة لو أثّرت على الرد. rights بيوضح القانونية: ماتقدّمش أي رابط كتحميل مجاني إلا لو عليه ملك عام/مصدر مفتوح/منصة رسمية. '
          + (imgs ? 'الصور المرفقة هي مرشحين لطلب المستخدم: شوفها واختار المطابق وبعدين web_show_images بالأرقام. ' : '') + W.UNTRUSTED;
        if (imgs && imgs.length) r.__imageInlineDataList = imgs;

        r.mode = mode;
        try {
          if (mode === 'full' || mode === 'pdf') {
            const cands = readCandidates(r, 4);
            let f = null; const failed = [];
            for (const u of cands) { f = await readFull(u, mode === 'pdf' ? 6 : 3); if (f.ok) break; failed.push({ url: u, error: f.error }); f = null; }
            if (f) {
              r.full = f; delete r.pages; r.results = (r.results || []).slice(0, 5);
              r.message = fullMessage(mode, f) + W.UNTRUSTED;
            } else {
              r.full_failed = failed;
              r.message = 'طلب mode=' + mode + ' بس مقدرتش أقرا نص كامل من أي رابط (الصفحات محجوبة أو بتتحمّل بجافاسكربت أو النص ناقص). اعتمد على pages والروابط في results، وقول للمستخدم بصراحة إن النص الكامل مش متاح، وماتألفش محتوى. ' + r.message;
            }
          } else if (mode === 'product') {
            const offers = [];
            (r.pages || []).forEach(p => { const sp = p && p.structured && p.structured.products; if (Array.isArray(sp)) sp.slice(0, 4).forEach(x => offers.push(Object.assign({}, slimObj(x), { source_url: p.url, source_title: p.title }))); });
            const specPages = (r.pages || []).slice().sort((x, y) => (y.structured && y.structured.products ? 1 : 0) - (x.structured && x.structured.products ? 1 : 0)).slice(0, 2).filter(p => p && okUrl(p.url));
            const rd = APP_ACTIONS.web_read && APP_ACTIONS.web_read.handler;
            const specs = rd ? (await Promise.all(specPages.map(p => rd({ url: p.url, focus: 'المواصفات specifications specs features تفاصيل', max_chars: 2500 }).then(x => (x && x.status === 'ok' && x.text) ? { url: p.url, title: x.title || p.title, text: String(x.text).slice(0, 2500) } : null, () => null)))).filter(Boolean) : [];
            r.product = { offers: offers.slice(0, 10), specs, links: (r.results || []).filter(x => x.type === 'page').slice(0, 6).map(x => ({ title: x.title, url: x.url })) };
            r.message = 'طلب mode=product: اعرض اسم المنتج والسعر (من product.offers بس مع العملة والبائع والرابط)، والمواصفات من product.specs، والروابط من product.links. لو السعر مش ظاهر قول كده وماتخمّنش، وقول إن السعر ممكن يتغير. ' + r.message;
          } else if (mode === 'download_link') {
            const items = [], seen = new Set();
            (r.results || []).forEach(x => {
              [x.meta && x.meta.pdf ? x.meta.pdf : '', x.direct_file ? x.url : '', x.meta && x.meta.dl ? x.meta.dl : ''].forEach(u => {
                if (!u || seen.has(u) || !okUrl(u)) return; seen.add(u);
                items.push({ title: x.title, url: u, rights: x.rights, direct_file: true, legal: LEGAL_OK.test(x.rights || '') });
              });
            });
            const legal = items.filter(i => i.legal).slice(0, 3);
            legal.forEach(i => appendDownloadCard(i));
            let pagesShown = 0;
            if (!legal.length && typeof appendAIWebResultCard === 'function') (r.results || []).filter(x => (x.type === 'book' || x.type === 'paper' || x.type === 'page') && okUrl(x.url)).slice(0, 2).forEach(x => { appendAIWebResultCard({ url: x.url, title: x.title }); pagesShown++; });
            r.download = { cards_shown: legal.length, page_cards_shown: pagesShown, items: items.slice(0, 8).map(i => ({ title: i.title, url: i.url, rights: i.rights, legal: i.legal })) };
            r.message = (legal.length
              ? 'طلب mode=download_link: اتعرض للمستخدم ' + legal.length + ' كارت تحميل بزرار (مصادر قانونية/مفتوحة). ماتكرّرش الروابط كنص؛ قول بسطر واحد اسم الملف ومصدره وحقوقه. '
              : 'طلب mode=download_link: مفيش رابط تحميل مباشر قانوني ظاهر (ملك عام/مصدر مفتوح/منصة رسمية). ' + (pagesShown ? 'اتعرض كارت أو اتنين لصفحات المصدر للفتح بس (مش تحميل). ' : '') + 'قول للمستخدم كده بصراحة وماتدلّش على مواقع قرصنة ولا تألف رابط. ') + r.message;
          }
        } catch (e) { r.mode_error = String((e && e.message) || e).slice(0, 160); }
        return W.ok(r);

        function fullMessage(md, f) {
          const more = f.more ? ' النص كبير: اتعرض ' + f.parts_count + ' جزء من أصل ' + f.total_chars + ' حرف، وباقي ' + f.more.remaining_chars + ' حرف: كمّل بـ ' + f.more.how + ' قبل ما تخلّص الشغل لو محتاج النص كله.' : '';
          return (md === 'pdf'
            ? 'طلب mode=pdf: ده النص الكامل في full.parts (مرتّب). ترجمه أو اكتبه كامل من غير ما تلخّص أو تحذف أجزاء، وبعدين اعمل PDF: اطلب request_tools بمجموعة docs لو أدوات الملفات مش جاهزة، واكتب HTML RTL منسّق بـ file_write ثم html_to_pdf. اذكر المصدر (full.url) في أول الملف. '
            : 'طلب mode=full: ده النص الكامل (مش ملخص) في full.parts مرتّب. اعتمد عليه واعرضه أو لخّصه حسب طلب المستخدم، واذكر المصدر (full.url). ') + more + ' ';
        }
      });
    W.reg('deep_research', '📚 بحث معمّق (مادة تقرير كامل)',
      'للطلبات اللي فيها "بحث كامل" أو "تقرير" أو "حطه في PDF/ملف" عن موضوع: بتبحث في كذا جانب من الموضوع بالتوازي وتقرا نصوص كاملة من أكتر من مصدر وتجيب صور وروابط، وبترجّعلك مادة غنية تكتب منها تقرير طويل ومفصّل (مش ملخص سطرين). استخدمها قبل ما تكتب أي بحث أو ملف.',
      { topic: d(S, 'موضوع البحث.'), aspects: d(SA, 'اختياري: لحد 7 جوانب تغطيها (تعريف، أسباب، تأثيرات، إحصائيات، دراسات، حلول...). لو فاضي بتتحدد تلقائي.'), images: d({ type: 'boolean' }, 'true لو عايز صور للتقرير (افتراضي true).') },
      ['topic'],
      async a => {
        const topic = W.norm(a.topic); if (topic.length < 2) return W.er('اكتب موضوع البحث.');
        const aspects = (Array.isArray(a.aspects) && a.aspects.length ? a.aspects.map(x => W.norm(x)).filter(Boolean) : ['', 'تعريف وأساسيات', 'الأسباب والآلية', 'التأثيرات والنتائج', 'إحصائيات وأرقام', 'دراسات علمية', 'الحلول والوقاية']).slice(0, 7);
        const tools = {}; ['web_research', 'web_find', 'web_scholar', 'web_images'].forEach(n => { if (APP_ACTIONS[n] && APP_ACTIONS[n].handler) tools[n] = APP_ACTIONS[n]; });
        const deps = { tools, grounded: W.groundedSearch, fetch: window.fetch ? window.fetch.bind(window) : undefined };
        const sections = [], sources = [], seen = new Set();
        W.act('📚 بحث معمّق: ' + topic.slice(0, 50));
        await Promise.all(aspects.map(async asp => {
          const q = (topic + ' ' + asp).trim();
          try {
            W.act('🔎 ' + q.slice(0, 60));
            const r = await M.run(q, { query: q, types: /دراس|علم|paper|study/i.test(asp) ? ['academic'] : undefined, depth: 'deep', max_results: 8 }, deps);
            if (!r || r.status !== 'ok') return;
            (r.results || []).filter(x => x && x.url && !/^(image|video|audio)$/.test(x.type)).slice(0, 6).forEach(x => { if (!seen.has(x.url)) { seen.add(x.url); sources.push({ title: x.title, url: x.url }); } });
            for (const uu of readCandidates(r, 3)) {
              if (seen.has('R:' + uu)) continue; seen.add('R:' + uu);
              const f = await readFull(uu, 2);
              if (f.ok) { sections.push({ aspect: asp || 'نظرة عامة', source: f.url, title: f.title, text: f.parts.map(p => p.text).join('\n').slice(0, 5500) }); break; }
            }
          } catch (e) { }
        }));
        let images = [];
        if (a.images !== false) {
          try {
            const ri = await M.run(topic, { query: topic, types: ['image'], max_results: 10 }, deps);
            images = ((ri && ri.results) || []).map(x => ({ title: x.title, url: (x.meta && (x.meta.image || x.meta.thumb)) || (x.type === 'image' ? x.url : ''), page: x.meta && x.meta.page || '' })).filter(x => /^https:\/\//.test(x.url)).slice(0, 8);
          } catch (e) { }
        }
        if (!sections.length && !sources.length) return W.er('مقدرتش أجمع مادة كفاية عن الموضوع. جرّب صياغة تانية أو قول للمستخدم بصراحة.');
        W.taint();
        return W.ok({ topic, sections_count: sections.length, sections, sources: sources.slice(0, 25), images,
          message: 'دي مادة حقيقية من ' + sections.length + ' جانب/مصدر. اكتب منها تقرير طويل ومفصّل (1500 كلمة على الأقل): مقدمة، عنوان لكل جانب، فقرات مشروحة، أرقام وجداول، صور من images (روابط https بس)، خلاصة، وقايمة المصادر بروابطها من sources. ماتألفش معلومة مش في المادة، ولو جانب ناقص قول كده. بعدين اعمل الملف/PDF بالمحتوى كامل.' + W.UNTRUSTED });
      });
    const RESEARCH_RULES = '\n\nبحث كامل أو تقرير أو PDF: لما المستخدم يطلب "بحث كامل" أو "تقرير" أو "حطه في PDF/ملف"، استخدم deep_research الأول (بيجيب مادة من عدة مصادر وصور)، واكتب منها تقرير طويل ومفصّل (1500 كلمة على الأقل: مقدمة، عناوين، فقرات، جداول وأرقام، صور من نتايج الأداة، خلاصة، مصادر بروابطها)، وبعدين اعمل الملف أو الـ PDF بالمحتوى كامل. ممنوع تسلّم ملف قصير أو ملخص سطرين على إنه البحث الكامل، ولو المصادر مش كفاية قول كده بصراحة.';
    const RULES = '\n\nMASSR Universal Search (قواعد، بتحل محل أي قاعدة قديمة بتتعارض معاها): لأي طلب بحث أو استكشاف بلغة طبيعية (معلومة، مقال، خبر، كتاب، رواية، PDF، بحث علمي، صور، فيديو، أغنية/أنشودة، منتج وسعر، مستودع GitHub، مكتبة...) ابدأ بـ massr_universal_search واحدة، ومتطلبش من المستخدم يختار محرك أو نوع بحث. ابعت في types تلميح نوع الطلب لو واضح، وفي queries صياغة إنجليزي لو الموضوع عالمي. الأداة بتدوّر في الويب دايمًا وبتضيف المصادر المتخصصة وبتقولك مين فشل. بعدها: اقرا pages واعتمد على اللي اتقرا فعلًا، وافتح أهم رابط بـ web_read لو محتاج تفاصيل، وماتألفش أي رابط أو سعر أو رابط تحميل. الكتب والملفات: فرّق بين صفحة الكتاب وملف PDF المباشر (direct_file)، واعرض كرابط تحميل مجاني بس اللي rights بتاعه ملك عام/مصدر مفتوح/منصة رسمية، ولو مفيش قول إن مفيش مصدر قانوني ظاهر بدل ما تدلّ على مواقع قرصنة. الأغاني والأناشيد: مصادر رسمية فقط. لو الطلب مجرد "شغّل أنشودة/أغنية كذا" فاستخدم youtube_search مباشرة. الاستثناءات: طلبات التقارير الشاملة بملف تفضل زي ما هي (web_research عميق + أدوات الملفات)، وgemini احتياطي أخير جوه الأداة نفسها.';
    const MODE_RULES = '\n\nباراميتر mode في massr_universal_search (قواعد): الافتراضي summary للأسئلة العادية. اطلب mode=full لما المستخدم يقول بحث كامل أو عايز النص كله أو الورقة أو المقال كامل. mode=pdf لما يطلب ترجمة أو تحويل ما تلاقيه لـ PDF. mode=product لما يسأل عن منتج أو سعر أو مواصفات. mode=download_link لما يطلب رابط تحميل (كتاب أو ملف أو بحث): الأداة بتعرض كارت بزرار تحميل للمصادر القانونية بس. لو عندك رابط محدد من نتيجة سابقة وعايز نصه الكامل ابعت url مع mode=full أو pdf. للنتايج والأرقام الحية (ماتش، ترتيب دوري، سعر دولار أو ذهب، طقس) ابعت types=live واعتمد على google_summary مع ذكر المصدر والتوقيت. لو المستخدم سمّى منصة أو موقع (فيسبوك، انستجرام، تيك توك، ريديت، 365Scores، في الجول، يلا كورة، GitHub، يوتيوب...) الأداة بتبحث جواه تلقائيًا، وماتوعدش بمحتوى محتاج تسجيل دخول. للمكتبات: github وnpm وcdnjs (رابط CDN جاهز). تحميل الفيديو والأغاني والأناشيد: المسموح روابط المشاهدة/الاستماع الرسمية وملفات الرخص المفتوحة (Internet Archive/Openverse) في كارت mode=download_link بس، وماتدلّش على أدوات تنزيل يوتيوب ولا مواقع قرصنة. لو رد الأداة فيه full.more كمّل القراءة بـ web_read بالصفحة اللي في how، وماتخلّصش الشغل على نص ناقص.';
    const _b = window.buildAISystemInstructionText;
    if (typeof _b === 'function') window.buildAISystemInstructionText = function () { return _b.apply(this, arguments) + RULES + MODE_RULES + RESEARCH_RULES; };
  } catch (e) { try { console.warn('massr universal search register failed', e); } catch (_) { } }
})();

// ============================================================================
// MASSR Cards v2 — كروت ورسومات الشات
// 1) بلوكات ``` في الشات العادي (flow / items / callout / stats / timeline / match / info / gallery / ui)
// 2) أداة show_card (للمكالمة الصوتية أو لو المدرب عايز يعرض كارت من غير نص)
// الكارت لقطة وقت الطلب (مش بيتحدّث لوحده)، وبيتحفظ مع المحادثة.
// ============================================================================
(function () {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const S = { type: 'string' };
    const d = (t, x) => Object.assign({}, t, { description: x });

    const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
    const httpUrl = u => { u = String(u || '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 1500) : ''; };
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null && txt !== '') e.textContent = txt; return e; };
    const hhmm = t => { try { return new Date(t).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const emo = (v, n) => Array.from(str(v, 12)).slice(0, n || 2).join('');
    const COLORS = ['green', 'blue', 'amber', 'red', 'purple', 'neutral'];
    const col = v => { v = String(v || '').toLowerCase(); return COLORS.indexOf(v) >= 0 ? v : 'neutral'; };
    const KIND = { info: ['blue', 'ℹ️'], tip: ['green', '💡'], warn: ['amber', '⚠️'], success: ['green', '✅'], error: ['red', '⛔'] };

    // ---------------- الشكل (CSS) ----------------
    function injectCss() {
      if (document.getElementById('massrCardsCss')) return;
      const st = document.createElement('style'); st.id = 'massrCardsCss';
      st.textContent = `
.mc{width:100%;max-width:430px;direction:rtl;text-align:right;background:var(--card-bg);border:1px solid var(--card-border);border-radius:18px;box-shadow:var(--shadow-sm);color:var(--text-primary);overflow:hidden;font-family:inherit;line-height:1.5;white-space:normal;animation:mcIn .28s ease both}
.aix .mc{max-width:100%;margin:.7em 0;box-shadow:none}
@keyframes mcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mc-c-green{--cc:#22c55e}.mc-c-blue{--cc:#3b82f6}.mc-c-amber{--cc:#f59e0b}.mc-c-red{--cc:#ef4444}.mc-c-purple{--cc:#a855f7}.mc-c-neutral{--cc:var(--text-secondary)}
[data-theme="light"] .mc-c-green{--cc:#15803d}[data-theme="light"] .mc-c-blue{--cc:#1d4ed8}[data-theme="light"] .mc-c-amber{--cc:#b45309}[data-theme="light"] .mc-c-red{--cc:#b91c1c}[data-theme="light"] .mc-c-purple{--cc:#7e22ce}
.mc-cell,.mc-callout,.mc-tag{background:rgba(127,127,127,.10);background:color-mix(in srgb,var(--cc) 12%,transparent);border:1px solid rgba(127,127,127,.3);border:1px solid color-mix(in srgb,var(--cc) 38%,transparent)}
.mc-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 13px;font-size:.68rem;color:var(--text-secondary);border-bottom:1px solid var(--card-border);background:var(--input-bg)}
.mc-top b{font-weight:800;color:var(--text-primary);font-size:.72rem}
.mc-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:99px;font-size:.66rem;font-weight:800;background:var(--card-border);color:var(--text-secondary);white-space:nowrap}
.mc-badge.live{background:rgba(239,68,68,.14);color:#ef4444}
.mc-badge.live::before{content:"";width:7px;height:7px;border-radius:50%;background:#ef4444;animation:mcPulse 1.2s ease-in-out infinite}
@keyframes mcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.mc-match{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;padding:16px 10px 12px;direction:rtl}
.mc-team{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;text-align:center}
.mc-team span{font-size:.78rem;font-weight:800;line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.mc-flag{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--card-border);background:var(--input-bg);display:block}
.mc-ini{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.05rem;color:#fff;border:2px solid var(--card-border)}
.mc-score{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:78px}
.mc-score .n{display:flex;align-items:center;gap:9px;direction:rtl;font-size:1.9rem;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
.mc-score .n.live{color:#ef4444}
.mc-score .vs{font-size:1.15rem;font-weight:900;color:var(--text-secondary)}
.mc-score .s{font-size:.66rem;font-weight:700;color:var(--text-secondary)}
.mc-line{padding:0 13px 10px;font-size:.7rem;color:var(--text-secondary);text-align:center;line-height:1.6}
.mc-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 13px;border-top:1px solid var(--card-border);font-size:.62rem;color:var(--text-secondary)}
.mc-foot a{color:var(--accent);font-weight:700;text-decoration:none;direction:ltr}
.mc-pimg{width:100%;aspect-ratio:16/10;background:#fff;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--card-border)}
.mc-pimg img{width:100%;height:100%;object-fit:contain;display:block}
.mc-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.4rem;background:var(--input-bg);color:var(--text-secondary)}
.mc-body{padding:12px 14px;display:flex;flex-direction:column;gap:7px}
.mc-brand{font-size:.66rem;font-weight:800;color:var(--accent)}
.mc-name{font-size:.9rem;font-weight:800;line-height:1.5}
.mc-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.mc-price b{font-size:1.25rem;font-weight:900}
.mc-price s{font-size:.72rem;color:var(--text-secondary)}
.mc-stars{font-size:.74rem;color:#f59e0b;font-weight:700}
.mc-stars i{font-style:normal;color:var(--text-secondary);font-weight:600;margin-inline-start:4px}
.mc-desc{font-size:.74rem;line-height:1.7;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.mc-chips{display:flex;flex-wrap:wrap;gap:5px}
.mc-chips span{font-size:.64rem;padding:3px 9px;border-radius:99px;background:var(--input-bg);border:1px solid var(--card-border)}
.mc-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:12px;background:var(--accent);color:#fff;font-weight:800;font-size:.78rem;text-decoration:none;border:none;cursor:pointer;font-family:inherit}
.mc-grid{display:grid;gap:4px;padding:4px}
.mc-grid.c1{grid-template-columns:1fr}.mc-grid.c2{grid-template-columns:1fr 1fr}.mc-grid.c3{grid-template-columns:1fr 1fr 1fr}
.mc-tile{position:relative;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--input-bg);cursor:zoom-in;border:none;padding:0}
.mc-grid.c1 .mc-tile{aspect-ratio:16/10}
.mc-tile img{width:100%;height:100%;object-fit:cover;display:block}
.mc-tile em{position:absolute;inset:auto 0 0 0;padding:14px 7px 5px;font-style:normal;font-size:.6rem;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72));text-align:right;direction:rtl;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-code{direction:ltr;text-align:left;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:10px 12px;font-family:ui-monospace,Consolas,monospace;font-size:.68rem;line-height:1.6;word-break:break-all;position:relative}
.mc-copy{position:absolute;top:6px;right:6px;border:none;border-radius:8px;padding:3px 9px;font-size:.62rem;font-weight:800;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;font-family:inherit}
.mc-rows{display:flex;flex-direction:column}
.mc-row{display:flex;justify-content:space-between;gap:10px;padding:8px 14px;font-size:.76rem;border-top:1px solid var(--card-border)}
.mc-row span{color:var(--text-secondary)}.mc-row b{font-weight:800;text-align:left}
.mc-ihead{display:flex;align-items:center;gap:10px;padding:13px 14px 10px}
.mc-ihead .e{font-size:1.35rem;line-height:1}.mc-ihead .t{font-size:.9rem;font-weight:800}.mc-ihead .u{font-size:.68rem;color:var(--text-secondary)}
.mc-flow{display:flex;flex-direction:column;gap:6px;padding:4px 12px 14px}
.mc-frow{display:grid;gap:8px}
.mc-cell{border-radius:14px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.mc-cell .i{font-size:1.4rem;line-height:1.2}.mc-cell .t{font-size:.86rem;font-weight:800;color:var(--cc);line-height:1.4}.mc-cell .s{font-size:.7rem;color:var(--text-secondary);line-height:1.5}
.mc-cell.mc-c-neutral .t{color:var(--text-primary)}
.mc-arrow{text-align:center;font-size:1.1rem;line-height:1;color:var(--text-secondary);font-weight:700}
.mc-list{display:flex;flex-direction:column;padding:0 14px}
.mc-li{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--card-border)}
.mc-li:last-child{border-bottom:0}
.mc-limg{flex:0 0 88px;width:88px;height:88px;border-radius:14px;overflow:hidden;background:var(--input-bg)}
.mc-limg img{width:100%;height:100%;object-fit:cover;display:block}
.mc-lbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.mc-lt{font-size:.92rem;font-weight:800;line-height:1.5}
.mc-ld{font-size:.8rem;line-height:1.7;color:var(--text-secondary)}
.mc-ll{font-size:.78rem;font-weight:700;color:var(--accent);text-decoration:none}
.mc-tag{display:inline-block;font-size:.68rem;font-weight:700;padding:2px 10px;border-radius:99px;color:var(--cc)}
.mct-callout{background:transparent;border:0;box-shadow:none;max-width:100%;overflow:visible}
.mc-callout{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px}
.mc-callout .e{font-size:1.2rem;line-height:1.3}.mc-callout .t{font-weight:800;font-size:.86rem;color:var(--cc)}.mc-callout .x{font-size:.8rem;line-height:1.7;color:var(--text-primary)}
.mc-stats{display:grid;gap:8px;padding:4px 12px 12px;grid-template-columns:1fr 1fr}
.mc-stat{background:var(--input-bg);border:1px solid var(--card-border);border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:2px}
.mc-stat .i{font-size:1.1rem}.mc-stat .v{font-size:1.45rem;font-weight:900;line-height:1.2}.mc-stat .l{font-size:.7rem;color:var(--text-secondary)}
.mc-stat .dl{font-size:.7rem;font-weight:800;color:#22c55e}.mc-stat .dl.neg{color:#ef4444}
.mc-tl{padding:4px 16px 14px 14px;display:flex;flex-direction:column}
.mc-ev{position:relative;padding:0 18px 14px 0;margin:0}
.mc-ev::before{content:"";position:absolute;right:4px;top:8px;bottom:-2px;width:2px;background:var(--card-border)}
.mc-ev:last-child::before{display:none}
.mc-ev::after{content:"";position:absolute;right:0;top:5px;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--card-bg)}
.mc-ev .w{font-size:.68rem;font-weight:800;color:var(--accent)}.mc-ev .t{font-size:.86rem;font-weight:800}.mc-ev .x{font-size:.76rem;color:var(--text-secondary);line-height:1.65}
.mct-ui{background:transparent;border:0;box-shadow:none;overflow:visible;max-width:100%}
.mc-ui{display:block;width:100%;border:0;background:transparent;color-scheme:normal}
.mct-activity,.mct-quiz.mc{}
.mc-act{border:0}
.mc-act-h{list-style:none;display:flex;align-items:center;gap:9px;padding:10px 13px;cursor:pointer;font-size:.78rem;font-weight:800;background:var(--input-bg)}
.mc-act-h::-webkit-details-marker{display:none}
.mc-act-t{flex:1}
.mc-act-ch{opacity:.6;transition:transform .2s}
details.mc-act[open] .mc-act-ch{transform:rotate(180deg)}
.mc-act-list{display:flex;flex-direction:column;padding:4px 0 6px}
.mc-act-row{display:flex;align-items:center;gap:10px;padding:8px 13px;text-decoration:none;color:var(--text-primary);animation:mcStep .3s ease both}
@keyframes mcStep{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.mc-act-ic{flex:0 0 22px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:.95rem}
.mc-act-ic img{width:20px;height:20px;border-radius:5px}
.mc-act-ic .mc-ph{width:22px;height:22px;font-size:.95rem;background:transparent}
.mc-act-b{flex:1;min-width:0;display:flex;flex-direction:column}
.mc-act-x{font-size:.76rem;font-weight:700;line-height:1.5}
.mc-act-b small{font-size:.66rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-act-mk{flex:0 0 18px;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:900;color:#22c55e}
.mc-act-mk.err{color:#ef4444}
.mc-act-mk.run{border:2px solid rgba(127,127,127,.3);border-top-color:var(--accent);animation:mcSpin .8s linear infinite}
@keyframes mcSpin{to{transform:rotate(360deg)}}
.mc-act-srcs{display:flex;flex-wrap:wrap;gap:6px;padding:6px 13px;animation:mcStep .3s ease both}
.mc-act-src{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;background:var(--input-bg);border:1px solid var(--card-border);text-decoration:none;color:var(--text-primary);font-size:.66rem;direction:ltr}
.mc-act-src img{width:14px;height:14px;border-radius:3px}
.mc-act-imgs{display:flex;gap:6px;padding:6px 13px;overflow-x:auto;animation:mcStep .3s ease both}
.mc-act-imgs .mc-tile{flex:0 0 64px;width:64px;height:64px;aspect-ratio:auto;border-radius:10px}
.mc-q{padding:12px 14px;border-top:1px solid var(--card-border)}
.mc-qt{font-size:.86rem;font-weight:800;line-height:1.6;margin-bottom:8px}
.mc-qimg{border-radius:12px;overflow:hidden;margin-bottom:8px;background:var(--input-bg)}
.mc-qimg img{width:100%;max-height:200px;object-fit:cover;display:block}
.mc-opts{display:flex;flex-direction:column;gap:7px}
.mc-opt{display:flex;align-items:center;gap:10px;text-align:right;font:inherit;font-size:.8rem;color:var(--text-primary);background:var(--input-bg);border:1.5px solid var(--card-border);border-radius:12px;padding:9px 11px;cursor:pointer;transition:border-color .15s,background .15s,transform .1s}
.mc-opt i{font-style:normal;flex:0 0 24px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;background:var(--card-border)}
.mc-opt span{flex:1;line-height:1.5}
.mc-opt:active{transform:scale(.98)}
.mc-opt.on{border-color:var(--accent);background:rgba(20,184,166,.12)}
.mc-opt.on i{background:var(--accent);color:#fff}
.mct-quiz[data-done] .mc-opt{cursor:default}
.mc-opt.ok{border-color:#22c55e;background:rgba(34,197,94,.14)}.mc-opt.ok i{background:#22c55e;color:#fff}
.mc-opt.bad{border-color:#ef4444;background:rgba(239,68,68,.12)}.mc-opt.bad i{background:#ef4444;color:#fff}
.mc-qe{display:none;margin-top:8px;font-size:.74rem;line-height:1.7;color:var(--text-secondary);padding:8px 10px;border-radius:10px;background:var(--input-bg)}
.mc-qe.show{display:block;animation:mcStep .3s ease both}
.mc-qfoot{padding:12px 14px;border-top:1px solid var(--card-border);display:flex;align-items:center;gap:10px}
.mc-qsend{font:inherit;font-weight:800;font-size:.8rem;padding:10px 18px;border-radius:12px;border:0;background:var(--accent);color:#fff;cursor:pointer}
.mc-qsend:disabled{opacity:.4;cursor:not-allowed}
.mc-qres{display:none;font-weight:900;font-size:.9rem}.mc-qres.show{display:block}
.mc-gal{display:flex;gap:6px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid var(--card-border)}
.mc-gal .mc-tile{flex:0 0 56px;width:56px;height:56px;aspect-ratio:auto;border-radius:10px}
.mc-offers{display:flex;flex-direction:column;border-top:1px solid var(--card-border);margin:4px -14px 0}
.mc-offer{display:flex;align-items:center;gap:10px;padding:9px 14px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--card-border)}
.mc-offer:last-child{border-bottom:0}
.mc-offer img{width:20px;height:20px;border-radius:5px;flex:0 0 20px}
.mc-offer b{flex:1;font-size:.78rem}.mc-offer em{font-style:normal;font-weight:900;font-size:.82rem}.mc-offer span{font-size:.7rem;color:var(--accent);font-weight:800}
.mct-chips,.mct-sources{background:transparent;border:0;box-shadow:none;max-width:100%}
.mc-chips2{display:flex;flex-wrap:wrap;gap:8px;margin:.2em 0}
.mc-chip{font:inherit;font-size:.78rem;font-weight:700;color:var(--text-primary);background:var(--card-bg);border:1px solid var(--card-border);border-radius:99px;padding:7px 14px;cursor:pointer;transition:background .15s,transform .15s}
.mc-chip:active{transform:scale(.96)}
.mc-srcs{display:flex;flex-direction:column}
.mc-src{display:flex;align-items:center;gap:10px;padding:9px 12px;text-decoration:none;color:var(--text-primary);border-top:1px solid var(--card-border)}
.mc-src:first-child{border-top:0}
.mc-src img{width:20px;height:20px;border-radius:5px;flex:0 0 20px}
.mc-src b{display:block;font-size:.78rem;font-weight:700;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.mc-src span{display:block;font-size:.66rem;color:var(--text-secondary);direction:ltr;text-align:right}
.mc-lb{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;cursor:zoom-out}
.mc-lb img{max-width:94vw;max-height:80vh;border-radius:12px;object-fit:contain}
.mc-lb div{color:#fff;font-size:.8rem;text-align:center;direction:rtl}`;
      document.head.appendChild(st);
    }

    // ---------------- صور بحل احتياطي: مباشر ← weserv (بيعدّي حظر الهوتلينك) ← شكل بديل ----------------
    const ph = emoji => el('div', 'mc-ph', emoji || '🖼️');
    function iniEl(name) {
      let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
      const e = el('div', 'mc-ini', Array.from(String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim())[0] || '⚽');
      e.style.background = 'hsl(' + h + ',55%,42%)'; return e;
    }
    // fb: 'ini:<اسم>' | 'ph:<إيموجي>' | 'hide'  (متخزّن كـ attribute عشان الكارت يتحوّل لنص HTML ويفضل شغّال)
    function img(url, alt, cls, fb) {
      const i = el('img', 'mc-img' + (cls ? ' ' + cls : '')); i.alt = alt || ''; i.loading = 'lazy'; i.decoding = 'async'; i.referrerPolicy = 'no-referrer';
      i.setAttribute('data-mc-u', url); i.setAttribute('data-mc-fb', fb || 'hide'); i.src = url; return i;
    }
    document.addEventListener('error', ev => {
      try {
        const i = ev.target; if (!i || i.tagName !== 'IMG' || !i.classList || !i.classList.contains('mc-img')) return;
        const u = i.getAttribute('data-mc-u');
        if (!i.getAttribute('data-mc-s') && u && !/images\.weserv\.nl/.test(i.src)) { i.setAttribute('data-mc-s', '1'); i.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(u) + '&w=800&output=webp&q=85'; return; }
        const fb = i.getAttribute('data-mc-fb') || 'hide';
        if (fb.indexOf('flag:') === 0) { const fe = el('div', 'mc-ini', flagEmoji(fb.slice(5))); fe.style.background = 'var(--input-bg)'; fe.style.fontSize = '1.7rem'; i.replaceWith(fe); }
        else if (fb.indexOf('ini:') === 0) i.replaceWith(iniEl(fb.slice(4)));
        else if (fb.indexOf('ph:') === 0) i.replaceWith(ph(fb.slice(3)));
        else { const t = i.closest('.mc-tile,.mc-limg'); (t || i).style.display = 'none'; }
      } catch (e) { }
    }, true);

    // ---------------- أسماء المنتخبات ← كود الدولة (عشان العلم يظهر حتى لو المدرب نسي الكود) ----------------
    const CC = {};
    ('مصر eg|السعودية sa|المغرب ma|الجزائر dz|تونس tn|ليبيا ly|السودان sd|الأردن jo|فلسطين ps|لبنان lb|سوريا sy|العراق iq|الكويت kw|قطر qa|الإمارات ae|البحرين bh|عمان om|اليمن ye|موريتانيا mr|الصومال so|جيبوتي dj|جزر القمر km|نيجيريا ng|السنغال sn|الكاميرون cm|غانا gh|كوت ديفوار ci|ساحل العاج ci|مالي ml|بوركينا فاسو bf|جنوب أفريقيا za|جنوب افريقيا za|الكونغو الديمقراطية cd|الكونغو cg|أنجولا ao|زامبيا zm|زيمبابوي zw|أوغندا ug|كينيا ke|تنزانيا tz|إثيوبيا et|الجابون ga|غينيا gn|الرأس الأخضر cv|بنين bj|توجو tg|موزمبيق mz|ناميبيا na|بوتسوانا bw|مدغشقر mg|ملاوي mw|رواندا rw|ليبيريا lr|سيراليون sl|غامبيا gm|النيجر ne|تشاد td|إريتريا er|البرازيل br|الأرجنتين ar|أوروغواي uy|أوروجواي uy|كولومبيا co|تشيلي cl|بيرو pe|الإكوادور ec|باراغواي py|فنزويلا ve|بوليفيا bo|المكسيك mx|الولايات المتحدة us|أمريكا us|كندا ca|كوستاريكا cr|بنما pa|هندوراس hn|جامايكا jm|هايتي ht|كوبا cu|إنجلترا gb-eng|انجلترا gb-eng|اسكتلندا gb-sct|ويلز gb-wls|أيرلندا الشمالية gb-nir|أيرلندا ie|فرنسا fr|ألمانيا de|المانيا de|إسبانيا es|اسبانيا es|إيطاليا it|ايطاليا it|البرتغال pt|هولندا nl|بلجيكا be|سويسرا ch|النمسا at|كرواتيا hr|صربيا rs|اليونان gr|تركيا tr|بولندا pl|التشيك cz|سلوفاكيا sk|سلوفينيا si|المجر hu|رومانيا ro|بلغاريا bg|أوكرانيا ua|روسيا ru|السويد se|النرويج no|الدنمارك dk|فنلندا fi|أيسلندا is|ألبانيا al|البوسنة ba|مقدونيا الشمالية mk|الجبل الأسود me|جورجيا ge|أرمينيا am|أذربيجان az|كازاخستان kz|أوزبكستان uz|إيران ir|اليابان jp|كوريا الجنوبية kr|كوريا الشمالية kp|الصين cn|الهند in|باكستان pk|بنغلاديش bd|إندونيسيا id|ماليزيا my|تايلاند th|فيتنام vn|الفلبين ph|سنغافورة sg|أستراليا au|نيوزيلندا nz|أفغانستان af|egypt eg|morocco ma|algeria dz|tunisia tn|saudi arabia sa|nigeria ng|senegal sn|cameroon cm|ghana gh|ivory coast ci|south africa za|brazil br|argentina ar|france fr|germany de|spain es|italy it|portugal pt|netherlands nl|belgium be|england gb-eng|scotland gb-sct|wales gb-wls|croatia hr|usa us|united states us|mexico mx|canada ca|japan jp|south korea kr|australia au|iran ir|turkey tr|jordan jo|qatar qa|uruguay uy|colombia co|poland pl|switzerland ch|denmark dk|sweden se|norway no|ukraine ua|russia ru')
      .split('|').forEach(p => { const i = p.lastIndexOf(' '); CC[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    const normCountry = t => String(t || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^(منتخب|national team of|team)\s+/, '').replace(/\s+/g, ' ').trim();
    const CCN = {}; Object.keys(CC).forEach(k => { CCN[normCountry(k)] = CC[k]; });
    const autoCode = name => CCN[normCountry(name)] || '';
    const flagEmoji = iso => /^[a-z]{2}$/.test(iso) ? String.fromCodePoint.apply(null, iso.split('').map(ch => 0x1F1E6 + ch.charCodeAt(0) - 97)) : '';

    // ---------------- علم/شعار الفريق ----------------
    function toIso(c) {
      c = String(c || '').trim();
      const cps = Array.from(c).map(ch => ch.codePointAt(0));
      if (cps.length === 2 && cps.every(x => x >= 0x1F1E6 && x <= 0x1F1FF)) return cps.map(x => String.fromCharCode(x - 0x1F1E6 + 97)).join('');
      c = c.toLowerCase();
      return /^[a-z]{2}(-[a-z]{2,3})?$/.test(c) ? c : '';
    }
    function teamBadge(name, code, logo) {
      const lg = httpUrl(logo), iso = toIso(code);
      const url = lg || (iso ? 'https://flagcdn.com/w160/' + iso + '.png' : '');
      return url ? img(url, name, 'mc-flag', (!lg && flagEmoji(iso)) ? 'flag:' + iso : 'ini:' + name) : iniEl(name);
    }

    // ---------------- مساعدين ----------------
    function footer(data, extra) {
      const su = httpUrl(data.source_url);
      if (!extra && !su && !data.source) return null;
      const f = el('div', 'mc-foot');
      const l = el('span', '', extra || '');
      const r = su ? Object.assign(el('a', '', '🔗 ' + (str(data.source, 40) || host(su))), { href: su, target: '_blank', rel: 'noopener noreferrer' }) : el('span', '', str(data.source, 40));
      f.append(l, r); return f;
    }
    function copyText(t, btn) {
      const done = () => { const o = btn.getAttribute('data-o') || btn.textContent; btn.setAttribute('data-o', o); btn.textContent = 'اتنسخ ✓'; setTimeout(() => { btn.textContent = o; }, 1400); };
      const fb = () => { try { const ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { } };
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, fb); return; } } catch (e) { }
      fb();
    }
    function lightbox(url, cap) {
      const lb = el('div', 'mc-lb');
      lb.append(img(url, cap, '', 'ph:🖼️'));
      if (cap) lb.append(el('div', '', cap));
      const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = ev => { if (ev.key === 'Escape') close(); };
      lb.addEventListener('click', close); document.addEventListener('keydown', onKey);
      document.body.appendChild(lb);
    }
    // أزرار الكروت بتشتغل بالتفويض (عشان تفضل شغالة حتى لو الكارت اتحوّل لنص HTML)
    document.addEventListener('click', ev => {
      try {
        const t = ev.target && ev.target.closest && ev.target.closest('.mc-tile,.mc-copy'); if (!t) return;
        if (t.classList.contains('mc-copy')) { ev.preventDefault(); copyText(t.getAttribute('data-copy') || '', t); return; }
        const u = t.getAttribute('data-full'); if (u) lightbox(u, t.getAttribute('data-cap') || '');
      } catch (e) { }
    });

    document.addEventListener('click', ev => {
      try {
        const b = ev.target && ev.target.closest && ev.target.closest('.mc-chip'); if (!b) return;
        const inp = document.getElementById('aiChatInput'); if (!inp || typeof sendAIChatMessage !== 'function') return;
        inp.value = b.getAttribute('data-send') || ''; const box = b.closest('.mc-chips2'); if (box) box.style.display = 'none';
        sendAIChatMessage();
      } catch (e) { }
    });

    document.addEventListener('click', ev => {
      try {
        const o = ev.target && ev.target.closest && ev.target.closest('.mc-opt'), sb = ev.target && ev.target.closest && ev.target.closest('.mc-qsend');
        if (!o && !sb) return;
        const card = (o || sb).closest('.mct-quiz'); if (!card || card.hasAttribute('data-done')) return;
        if (o) {
          const q = o.closest('.mc-q');
          if (q.getAttribute('data-multi') === '1') o.classList.toggle('on'); else { q.querySelectorAll('.mc-opt.on').forEach(b => b.classList.remove('on')); o.classList.add('on'); }
          card.querySelector('.mc-qsend').disabled = !Array.prototype.every.call(card.querySelectorAll('.mc-q'), qq => qq.querySelector('.mc-opt.on'));
          return;
        }
        let ok = 0, tot = 0; const lines = [];
        card.querySelectorAll('.mc-q').forEach((q, qi) => {
          const opts = Array.prototype.slice.call(q.querySelectorAll('.mc-opt'));
          const sel = opts.map((b, k) => b.classList.contains('on') ? k : -1).filter(k => k >= 0);
          let ans = null; try { ans = q.getAttribute('data-ans') ? JSON.parse(q.getAttribute('data-ans')) : null; } catch (e) { }
          const set = ans == null ? null : (Array.isArray(ans) ? ans : [ans]);
          let good = false;
          if (set) {
            tot++; good = set.length === sel.length && set.every(k => sel.indexOf(k) >= 0); if (good) ok++;
            opts.forEach((b, k) => { if (set.indexOf(k) >= 0) b.classList.add('ok'); else if (sel.indexOf(k) >= 0) b.classList.add('bad'); });
            q.classList.add(good ? 'good' : 'wrong');
          }
          const e = q.querySelector('.mc-qe'); if (e) e.classList.add('show');
          const txt = q.querySelector('.mc-qt').textContent.replace(/^\d+\.\s*/, '').slice(0, 90);
          lines.push((qi + 1) + ') ' + txt + ' ← ' + (sel.map(k => opts[k].querySelector('span').textContent).join('، ') || '—') + (set ? (good ? ' ✅' : ' ❌') : ''));
        });
        card.setAttribute('data-done', '1'); card.querySelector('.mc-qsend').style.display = 'none';
        const res = card.querySelector('.mc-qres'); res.textContent = tot ? ('النتيجة: ' + ok + ' من ' + tot + (ok === tot ? ' 🎉' : '')) : 'اتبعتت إجاباتك'; res.classList.add('show');
        const inp = document.getElementById('aiChatInput'), title = card.getAttribute('data-title') || '';
        if (inp && typeof sendAIChatMessage === 'function') {
          inp.value = 'إجاباتي في الاختبار' + (title ? ' «' + title + '»' : '') + ':\n' + lines.join('\n') + (tot ? '\n(التصحيح التلقائي: ' + ok + ' من ' + tot + ')' : '') + '\nصحّحلي وقولي الصح والغلط واشرح أخطائي.';
          sendAIChatMessage();
        }
      } catch (e) { }
    });

    // ---------------- النشاط الحي ----------------
    const ACT = { card: null, list: null, head: null, d: null, steps: [], inflight: 0, idle: 0 };
    function actEnsure() {
      if (ACT.card && ACT.card.isConnected) return true;
      const m = document.getElementById('aiChatMessages'); if (!m || typeof appendToAIMessages !== 'function') return false;
      const es = document.getElementById('aiChatEmptyState'); if (es) es.style.display = 'none';
      ACT.steps = []; const c = build('activity', { title: 'بيشتغل...', steps: [], live: true });
      ACT.card = c; ACT.list = c.querySelector('.mc-act-list'); ACT.head = c.querySelector('.mc-act-t'); ACT.d = c.querySelector('details');
      appendToAIMessages(c); m.scrollTop = m.scrollHeight; return true;
    }
    function actBump() {
      if (ACT.head) ACT.head.textContent = 'بيشتغل... (' + ACT.steps.length + ' خطوة)';
      const m = document.getElementById('aiChatMessages'); if (m && m.scrollHeight - m.scrollTop - m.clientHeight < 260) m.scrollTop = m.scrollHeight;
      clearTimeout(ACT.idle); ACT.idle = setTimeout(actFinish, 2600);
    }
    function actFinish() {
      if (ACT.inflight > 0) { ACT.idle = setTimeout(actFinish, 1500); return; }
      if (!ACT.card || !ACT.steps.length) return;
      ACT.steps.forEach(s => { if (s.state === 'run') s.state = 'ok'; });
      if (ACT.head) ACT.head.textContent = '✓ اتنفّذ ' + ACT.steps.length + ' خطوة';
      const mk = ACT.card.querySelector('.mc-act-h .mc-act-mk'); if (mk) { mk.className = 'mc-act-mk'; mk.textContent = '✓'; }
      if (ACT.d) ACT.d.removeAttribute('open');
      try { if (typeof aiRecordCard === 'function' && !(typeof aiReplayingUI !== 'undefined' && aiReplayingUI)) aiRecordCard('card', { t: 'activity', x: { title: '✓ اتنفّذ ' + ACT.steps.length + ' خطوة', steps: ACT.steps.map(s => Object.assign({}, s)) } }); } catch (e) { }
      ACT.card = null;
    }
    const argDetail = a => { a = a || {}; for (const k of ['query', 'q', 'search_query', 'url', 'title', 'name', 'path', 'text', 'prompt', 'file', 'filename']) if (typeof a[k] === 'string' && a[k].trim()) return str(a[k], 80); return ''; };
    const resSummary = r => { if (!r) return ''; if (r.status === 'error') return str(r.message || r.error || 'فشل', 120); const n = r.result_count != null ? r.result_count : (Array.isArray(r.results) ? r.results.length : (Array.isArray(r.pages) ? r.pages.length : null)); return n != null ? n + ' نتيجة' : ''; };
    window.massrAct = {
      step(o) {
        if (!actEnsure()) return null;
        const s = normStep(o); if (!(s.kind === 'sources' ? s.list.length : s.kind === 'images' ? s.imgs.length : s.text)) return null;
        ACT.steps.push(s); const row = stepRow(s); ACT.list.append(row); actBump(); return { s, row, card: ACT.card };
      },
      toolStart(name, args) {
        const EXTRA = { massr_universal_search: '🔎 بحث شامل في المصادر', web_find: '🔎 بحث في الويب', web_read: '📖 بقرا صفحة', web_images: '🖼️ بدور على صور', web_scholar: '🎓 بحث علمي' };
        const lbl = (typeof AI_FN_STATUS_LABELS !== 'undefined' && AI_FN_STATUS_LABELS[name]) || EXTRA[name] || ('⚙️ ' + name);
        const h = this.step({ icon: '⚡', text: lbl, detail: argDetail(args), state: 'run' }); if (h) ACT.inflight++; return h;
      },
      toolEnd(h, res) {
        if (!h) return; ACT.inflight = Math.max(0, ACT.inflight - 1);
        const err = res && res.status === 'error'; h.s.state = err ? 'err' : 'ok';
        const sm = resSummary(res); if (sm) h.s.detail = sm;
        const nr = stepRow(h.s); if (h.row && h.row.isConnected) h.row.replaceWith(nr); h.row = nr; actBump();
      }
    };

    // ---------------- بلوك ui الحر: إطار معزول (من غير شبكة، ومن غير وصول لبيانات التطبيق) ----------------
    const uiH = {};
    const uiHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    function themeVars() {
      try {
        const cs = getComputedStyle(document.body), g = (n, f) => (cs.getPropertyValue(n) || f).trim().replace(/[<>{};]/g, '');
        return ':root{--fg:' + g('--text-primary', '#e5e7eb') + ';--muted:' + g('--text-secondary', '#9ca3af') + ';--card:' + g('--card-bg', '#1f2937') + ';--border:' + g('--card-border', 'rgba(127,127,127,.3)') + ';--accent:' + g('--accent', '#14b8a6') + ';--soft:' + g('--input-bg', 'rgba(127,127,127,.12)') + '}';
      } catch (e) { return ':root{--fg:#e5e7eb;--muted:#9ca3af;--card:#1f2937;--border:rgba(127,127,127,.3);--accent:#14b8a6;--soft:rgba(127,127,127,.12)}'; }
    }
    const UI_KIT = '*{box-sizing:border-box}html,body{margin:0;padding:0}body{padding:2px;font:14px/1.7 system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;color:var(--fg);background:transparent;direction:rtl;text-align:right;overflow-wrap:anywhere}' +
      'img,svg,video{max-width:100%}a{color:var(--accent);font-weight:700}.muted{color:var(--muted)}.h{font-weight:800;font-size:16px}.big{font-size:28px;font-weight:900;line-height:1.2}' +
      '.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.col{display:flex;flex-direction:column;gap:8px}' +
      '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
      '.pill{display:inline-block;padding:2px 10px;border-radius:99px;background:var(--soft);border:1px solid var(--border);font-size:12px;font-weight:700}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:12px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}' +
      '.g{--c:#22c55e}.b{--c:#3b82f6}.a{--c:#f59e0b}.r{--c:#ef4444}.p{--c:#a855f7}.tint{color:var(--c);background:rgba(127,127,127,.12);background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid rgba(127,127,127,.3);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}';
    function uiDoc(html, id) {
      return '<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; font-src data:; media-src https:">' +
        '<style>' + themeVars() + UI_KIT + '</style></head><body>' + html +
        '<script>(function(){var id=' + JSON.stringify(id) + ';function s(){try{parent.postMessage({mcUi:id,h:Math.ceil(document.documentElement.getBoundingClientRect().height)},"*")}catch(e){}}if(window.ResizeObserver)new ResizeObserver(s).observe(document.documentElement);addEventListener("load",s);s();setTimeout(s,250)})()<\/script></body></html>';
    }
    window.addEventListener('message', ev => {
      try {
        const m = ev.data; if (!m || typeof m !== 'object' || !m.mcUi) return;
        Array.prototype.forEach.call(document.querySelectorAll('iframe.mc-ui'), f => {
          if (f.contentWindow === ev.source && f.getAttribute('data-mc-id') === String(m.mcUi)) {
            const h = Math.min(Math.max(Math.ceil(+m.h || 0), 40), 1600); uiH[m.mcUi] = h; f.style.height = h + 'px';
          }
        });
      } catch (e) { }
    });

    const favicon = u => 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host(u)) + '&sz=64';
    function stepRow(s) {
      if (s.kind === 'sources') {
        const w = el('div', 'mc-act-srcs');
        s.list.forEach(i => { const a = Object.assign(el('a', 'mc-act-src'), { href: i.url, target: '_blank', rel: 'noopener noreferrer' }); a.title = i.title || host(i.url); a.append(img(favicon(i.url), '', '', 'hide'), el('span', '', host(i.url))); w.append(a); });
        return w;
      }
      if (s.kind === 'images') {
        const w = el('div', 'mc-act-imgs');
        s.imgs.forEach(u => { const t = el('button', 'mc-tile'); t.type = 'button'; t.setAttribute('data-full', u); t.append(img(u, '', '', 'hide')); w.append(t); });
        return w;
      }
      const r = s.url ? Object.assign(el('a', 'mc-act-row'), { href: s.url, target: '_blank', rel: 'noopener noreferrer' }) : el('div', 'mc-act-row');
      const ic = el('span', 'mc-act-ic');
      if (s.url) ic.append(img(favicon(s.url), '', '', 'ph:' + (s.icon || '🌐'))); else ic.textContent = s.icon || '•';
      const b = el('span', 'mc-act-b'); b.append(el('span', 'mc-act-x', s.text)); if (s.detail) b.append(el('small', '', s.detail));
      r.append(ic, b, el('span', 'mc-act-mk' + (s.state === 'run' ? ' run' : s.state === 'err' ? ' err' : ''), s.state === 'run' ? '' : (s.state === 'err' ? '✗' : '✓')));
      return r;
    }

    // ---------------- بناء الكروت ----------------
    const BUILD = {
      activity(c, x) {
        const d = el('details', 'mc-act'); if (x.live) d.setAttribute('open', '');
        const sm = el('summary', 'mc-act-h');
        sm.append(el('span', 'mc-act-mk' + (x.live ? ' run' : ''), x.live ? '' : '✓'), el('span', 'mc-act-t', x.title || ('اتنفّذ ' + x.steps.length + ' خطوة')), el('span', 'mc-act-ch', '⌄'));
        d.append(sm);
        const list = el('div', 'mc-act-list'); x.steps.forEach(s => list.append(stepRow(s))); d.append(list); c.append(d);
      },
      quiz(c, x) {
        const LET = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
        const t = el('div', 'mc-top'); t.append(el('b', '', '🧠 ' + (x.title || 'اختبار')), el('span', 'mc-badge', x.questions.length + ' سؤال')); c.append(t);
        c.setAttribute('data-title', x.title || '');
        x.questions.forEach((q, qi) => {
          const qb = el('div', 'mc-q'); qb.setAttribute('data-ans', q.answer == null ? '' : JSON.stringify(q.answer)); qb.setAttribute('data-multi', q.multi ? '1' : '0');
          qb.append(el('div', 'mc-qt', (qi + 1) + '. ' + q.q));
          if (q.image) { const w = el('div', 'mc-qimg'); w.append(img(q.image, '', '', 'hide')); qb.append(w); }
          const ol = el('div', 'mc-opts');
          q.options.forEach((o, k) => { const b = el('button', 'mc-opt'); b.type = 'button'; b.setAttribute('data-k', String(k)); b.append(el('i', '', LET[k] || String(k + 1)), el('span', '', o)); ol.append(b); });
          qb.append(ol);
          if (q.explain) qb.append(el('div', 'mc-qe', '💡 ' + q.explain));
          c.append(qb);
        });
        const f = el('div', 'mc-qfoot'); const sb = el('button', 'mc-qsend', 'إرسال الإجابات'); sb.type = 'button'; sb.disabled = true; f.append(sb, el('div', 'mc-qres')); c.append(f);
      },
      match(c, x) {
        const st = x.status;
        const top = el('div', 'mc-top');
        top.append(el('b', '', x.competition || '⚽ مباراة'));
        top.append(el('span', 'mc-badge' + (st === 'live' ? ' live' : ''),
          st === 'live' ? 'لايف' + (x.minute ? ' · \u2066' + x.minute + (/['′’]|\+|انتهى/.test(x.minute) ? '' : "'") + '\u2069' : '') : st === 'halftime' ? 'استراحة' : st === 'finished' ? 'انتهت' : 'قريبًا'));
        c.append(top);
        const row = el('div', 'mc-match');
        const home = el('div', 'mc-team'); home.append(teamBadge(x.home, x.home_code, x.home_logo), el('span', '', x.home));
        const away = el('div', 'mc-team'); away.append(teamBadge(x.away, x.away_code, x.away_logo), el('span', '', x.away));
        const mid = el('div', 'mc-score');
        if (st === 'upcoming' || (x.home_score === '' && x.away_score === '')) { mid.append(el('div', 'vs', 'VS')); if (x.kickoff) mid.append(el('div', 's', x.kickoff)); }
        else { const nn = el('div', 'n' + (st === 'live' ? ' live' : '')); nn.append(el('span', '', x.home_score), el('span', '', '-'), el('span', '', x.away_score)); mid.append(nn); if (x.kickoff && st !== 'live') mid.append(el('div', 's', x.kickoff)); }
        row.append(home, mid, away); c.append(row);
        const line = [x.scorers, x.venue ? '🏟️ ' + x.venue : ''].filter(Boolean).join('  ·  ');
        if (line) c.append(el('div', 'mc-line', line));
        const f = footer(x, x.at ? '📸 لقطة الساعة ' + hhmm(x.at) + ' — اسألني تاني للتحديث' : '📸 لقطة وقت السؤال — اسألني تاني للتحديث'); if (f) c.append(f);
      },
      product(c, x) {
        if (x.image) { const w = el('div', 'mc-pimg'); w.append(img(x.image, x.name, '', 'ph:🛍️')); c.append(w); }
        if (x.images && x.images.length > 1) {
          const g = el('div', 'mc-gal');
          x.images.forEach(u => { const t = el('button', 'mc-tile'); t.type = 'button'; t.setAttribute('data-full', u); t.append(img(u, x.name, '', 'hide')); g.append(t); });
          c.append(g);
        }
        const b = el('div', 'mc-body');
        if (x.brand) b.append(el('div', 'mc-brand', x.brand));
        b.append(el('div', 'mc-name', x.name));
        const pr = el('div', 'mc-price');
        pr.append(el('b', '', x.price ? (x.price + (x.currency ? ' ' + x.currency : '')) : 'السعر مش ظاهر'));
        if (x.old_price) pr.append(el('s', '', x.old_price));
        b.append(pr);
        const rt = parseFloat(x.rating);
        if (rt > 0 && rt <= 5) { const s = el('div', 'mc-stars', '★'.repeat(Math.round(rt)) + '☆'.repeat(5 - Math.round(rt)) + ' ' + rt); if (x.reviews) s.append(el('i', '', '(' + x.reviews + ')')); b.append(s); }
        if (x.availability) b.append(el('div', 'mc-brand', x.availability));
        if (x.description) b.append(el('div', 'mc-desc', x.description));
        if (x.specs.length) { const ch = el('div', 'mc-chips'); x.specs.forEach(sp => ch.append(el('span', '', sp))); b.append(ch); }
        if (x.offers && x.offers.length) {
          const of = el('div', 'mc-offers');
          x.offers.forEach(o => { const a = Object.assign(el('a', 'mc-offer'), { href: o.url, target: '_blank', rel: 'noopener noreferrer' }); a.append(img(favicon(o.url), '', '', 'hide'), el('b', '', o.store || host(o.url)), el('em', '', o.price || ''), el('span', '', 'فتح ↗')); of.append(a); });
          b.append(of);
        }
        const u = httpUrl(x.url);
        if (u) b.append(Object.assign(el('a', 'mc-btn', '🔗 فتح المنتج'), { href: u, target: '_blank', rel: 'noopener noreferrer' }));
        c.append(b);
        const f = footer({ source: x.source || host(u) }, ''); if (f && (x.source || u)) c.append(f);
      },
      images(c, x) {
        if (x.title) { const t = el('div', 'mc-top'); t.append(el('b', '', '🖼️ ' + x.title)); c.append(t); }
        const n = x.images.length;
        const g = el('div', 'mc-grid ' + (n === 1 ? 'c1' : n >= 6 ? 'c3' : 'c2'));
        x.images.forEach(im => {
          const tile = el('button', 'mc-tile'); tile.type = 'button'; tile.setAttribute('data-full', im.url); tile.setAttribute('data-cap', im.caption || '');
          tile.append(img(im.url, im.caption, '', 'hide'));
          if (im.caption) tile.append(el('em', '', im.caption));
          g.append(tile);
        });
        c.append(g);
        const f = footer(x, ''); if (f) c.append(f);
      },
      lib(c, x) {
        const b = el('div', 'mc-body');
        const h = el('div', 'mc-price'); h.append(el('b', '', '📦 ' + x.name)); if (x.version) h.append(el('span', 'mc-badge', 'v' + x.version)); b.append(h);
        if (x.description) b.append(el('div', 'mc-desc', x.description));
        const cdn = httpUrl(x.cdn_url);
        if (cdn) {
          const snip = /\.css(\?|$)/i.test(cdn) ? '<link rel="stylesheet" href="' + cdn + '">' : '<script src="' + cdn + '"></script>';
          const code = el('div', 'mc-code', snip); const cb = el('button', 'mc-copy', 'نسخ'); cb.type = 'button'; cb.setAttribute('data-copy', snip);
          code.append(cb); b.append(code);
        }
        const u = httpUrl(x.url);
        if (u) b.append(Object.assign(el('a', 'mc-btn', '🔗 الصفحة الرسمية'), { href: u, target: '_blank', rel: 'noopener noreferrer' }));
        c.append(b);
        const f = footer(x, ''); if (f) c.append(f);
      },
      info(c, x) {
        const h = el('div', 'mc-ihead'); h.append(el('div', 'e', x.emoji || 'ℹ️'));
        const tx = el('div'); tx.append(el('div', 't', x.title)); if (x.subtitle) tx.append(el('div', 'u', x.subtitle)); h.append(tx); c.append(h);
        if (x.rows.length) { const r = el('div', 'mc-rows'); x.rows.forEach(rw => { const e = el('div', 'mc-row'); e.append(el('span', '', rw.label), el('b', '', rw.value)); r.append(e); }); c.append(r); }
        if (x.note) c.append(el('div', 'mc-line', x.note));
        const f = footer(x, x.at ? '📸 لقطة الساعة ' + hhmm(x.at) : ''); if (f) c.append(f);
      },
      flow(c, x) {
        if (x.title) { const t = el('div', 'mc-ihead'); t.append(el('div', 't', x.title)); c.append(t); }
        const fl = el('div', 'mc-flow');
        const groups = []; x.steps.forEach(s => { const g = groups[groups.length - 1]; if (g && s.row !== '' && g[0].row === s.row) g.push(s); else groups.push([s]); });
        groups.forEach((g, gi) => {
          if (gi) fl.append(el('div', 'mc-arrow', '↓'));
          const n = g.length, cols = n <= 2 ? n : n === 4 ? 2 : 3;
          const r = el('div', 'mc-frow'); r.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
          g.forEach(s => {
            const cell = el('div', 'mc-cell mc-c-' + s.color);
            if (s.icon) cell.append(el('div', 'i', s.icon));
            cell.append(el('div', 't', s.title)); if (s.sub) cell.append(el('div', 's', s.sub));
            r.append(cell);
          });
          fl.append(r);
        });
        c.append(fl);
      },
      items(c, x) {
        if (x.title) { const t = el('div', 'mc-ihead'); t.append(el('div', 't', x.title)); c.append(t); }
        const ls = el('div', 'mc-list');
        x.items.forEach((it, i) => {
          const li = el('div', 'mc-li');
          if (it.image) { const w = el('div', 'mc-limg'); w.append(img(it.image, it.title, '', 'hide')); li.append(w); }
          const b = el('div', 'mc-lbody');
          b.append(el('div', 'mc-lt', (x.numbered ? (i + 1) + '. ' : '') + it.title));
          if (it.text) b.append(el('div', 'mc-ld', it.text));
          if (it.url) b.append(Object.assign(el('a', 'mc-ll', (it.link || host(it.url) || 'فتح') + ' ↗'), { href: it.url, target: '_blank', rel: 'noopener noreferrer' }));
          if (it.tag) b.append(el('span', 'mc-tag mc-c-' + it.tag_color, it.tag));
          li.append(b); ls.append(li);
        });
        c.append(ls);
      },
      callout(c, x) {
        const k = KIND[x.kind] || KIND.info;
        const box = el('div', 'mc-callout mc-c-' + k[0]);
        box.append(el('div', 'e', x.emoji || k[1]));
        const b = el('div'); if (x.title) b.append(el('div', 't', x.title)); if (x.text) b.append(el('div', 'x', x.text));
        box.append(b); c.append(box);
      },
      stats(c, x) {
        if (x.title) { const t = el('div', 'mc-ihead'); t.append(el('div', 't', x.title)); c.append(t); }
        const g = el('div', 'mc-stats'); if (x.stats.length === 3) g.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
        x.stats.forEach(s => {
          const e = el('div', 'mc-stat');
          if (s.icon) e.append(el('div', 'i', s.icon));
          e.append(el('div', 'v', s.value), el('div', 'l', s.label));
          if (s.delta) e.append(el('div', 'dl' + (/^[-−–]/.test(s.delta) ? ' neg' : ''), s.delta));
          g.append(e);
        });
        c.append(g);
      },
      timeline(c, x) {
        if (x.title) { const t = el('div', 'mc-ihead'); t.append(el('div', 't', x.title)); c.append(t); }
        const tl = el('div', 'mc-tl');
        x.events.forEach(ev => {
          const e = el('div', 'mc-ev');
          if (ev.when) e.append(el('div', 'w', ev.when));
          e.append(el('div', 't', ev.title)); if (ev.text) e.append(el('div', 'x', ev.text));
          tl.append(e);
        });
        c.append(tl);
      },
      chips(c, x) {
        const w = el('div', 'mc-chips2');
        x.chips.forEach(t => { const b = el('button', 'mc-chip', t); b.type = 'button'; b.setAttribute('data-send', t); w.append(b); });
        c.append(w);
      },
      sources(c, x) {
        const t = el('div', 'mc-top'); t.append(el('b', '', '🔗 المصادر')); c.append(t);
        const l = el('div', 'mc-srcs');
        x.sources.forEach(s => {
          const a = Object.assign(el('a', 'mc-src'), { href: s.url, target: '_blank', rel: 'noopener noreferrer' });
          const ic = img('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host(s.url)) + '&sz=64', '', '', 'hide');
          const d = el('div'); d.append(el('b', '', s.title || host(s.url)), el('span', '', host(s.url)));
          a.append(ic, d); l.append(a);
        });
        c.append(l);
      },
      ui(c, x) {
        const id = uiHash(x.html);
        const f = el('iframe', 'mc-ui');
        f.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
        f.setAttribute('data-mc-id', id); f.setAttribute('title', 'عرض تفاعلي');
        f.setAttribute('srcdoc', uiDoc(x.html, id)); f.style.height = (uiH[id] || 140) + 'px';
        c.append(f);
      }
    };

    // ---------------- تنضيف البيانات (بتتخزّن مع المحادثة) ----------------
    const arr = v => Array.isArray(v) ? v : [];
    function normalize(type, a, opt) {
      a = a || {};
      const x = { at: opt && opt.fence ? 0 : Date.now(), source: str(a.source, 60), source_url: httpUrl(a.source_url) };
      if (type === 'match') {
        x.home = str(a.home, 40); x.away = str(a.away, 40);
        if (!x.home || !x.away) return null;
        x.home_code = str(a.home_code, 12) || autoCode(x.home); x.away_code = str(a.away_code, 12) || autoCode(x.away);
        x.home_logo = httpUrl(a.home_logo); x.away_logo = httpUrl(a.away_logo);
        x.home_score = str(a.home_score, 4); x.away_score = str(a.away_score, 4);
        const s = String(a.status || '').toLowerCase();
        x.status = /live|لايف|جارية|مباشر/.test(s) ? 'live' : /half|استراحة/.test(s) ? 'halftime' : /final|finish|ended|full|انتهت|انتهى|نهاية/.test(s) ? 'finished' : /upcoming|scheduled|not|قريب|لم تبدأ/.test(s) ? 'upcoming' : ((x.home_score !== '' && x.away_score !== '') ? 'finished' : 'upcoming');
        if ((x.home_score === '') !== (x.away_score === '')) { if (x.home_score === '') x.home_score = '0'; else x.away_score = '0'; }
        if (x.status !== 'upcoming' && x.home_score === '' && x.away_score === '') return null;
        x.minute = str(a.minute, 8); x.competition = str(a.competition, 50); x.kickoff = str(a.kickoff, 40); x.venue = str(a.venue, 50); x.scorers = str(a.scorers, 160);
      } else if (type === 'product') {
        x.name = str(a.name, 140); if (!x.name) return null;
        x.brand = str(a.brand, 50); x.price = str(a.price, 24); x.currency = str(a.currency, 12); x.old_price = str(a.old_price, 24);
        x.rating = str(a.rating, 5); x.reviews = str(a.reviews, 12); x.availability = str(a.availability, 40); x.description = str(a.description, 300);
        x.image = httpUrl(a.image); x.url = httpUrl(a.url);
        x.specs = arr(a.specs).map(v => str(v, 40)).filter(Boolean).slice(0, 6);
        x.images = arr(a.images).map(i => httpUrl(typeof i === 'string' ? i : (i && i.url))).filter(Boolean).slice(0, 6);
        x.offers = arr(a.offers).map(o => ({ store: str(o && (o.store || o.name), 40), price: str(o && o.price, 30), url: httpUrl(o && o.url) })).filter(o => o.url).slice(0, 6);
      } else if (type === 'images') {
        x.title = str(a.title, 60);
        x.images = arr(a.images).map(i => ({ url: httpUrl(i && i.url), caption: str(i && i.caption, 60) })).filter(i => i.url).slice(0, 9);
        if (!x.images.length) return null;
      } else if (type === 'lib') {
        x.name = str(a.name, 60); if (!x.name) return null;
        x.version = str(a.version, 20); x.description = str(a.description, 220); x.cdn_url = httpUrl(a.cdn_url); x.url = httpUrl(a.url);
      } else if (type === 'info') {
        x.title = str(a.title, 80); if (!x.title) return null;
        x.emoji = emo(a.emoji); x.subtitle = str(a.subtitle, 80); x.note = str(a.note, 200);
        x.rows = arr(a.rows).map(r => ({ label: str(r && r.label, 40), value: str(r && r.value, 60) })).filter(r => r.label && r.value).slice(0, 10);
        if (!x.rows.length && !x.note) return null; // كارت عنوان بس ملوش لازمة
      } else if (type === 'flow') {
        x.title = str(a.title, 80);
        x.steps = arr(a.steps).slice(0, 14).map(s => ({ title: str(s && s.title, 60), sub: str(s && s.sub, 100), icon: emo(s && s.icon), color: col(s && s.color), row: s && s.row != null ? str(s.row, 6) : '' })).filter(s => s.title);
        if (!x.steps.length) return null;
      } else if (type === 'items') {
        x.title = str(a.title, 80); x.numbered = !!a.numbered && a.numbered !== 'false';
        x.items = arr(a.items).slice(0, 12).map(i => ({ title: str(i && i.title, 90), text: str(i && i.text, 280), image: httpUrl(i && i.image), url: httpUrl(i && i.url), link: str(i && i.link, 40), tag: str(i && i.tag, 40), tag_color: col(i && i.tag_color) })).filter(i => i.title);
        if (!x.items.length) return null;
      } else if (type === 'callout') {
        x.kind = KIND[String(a.kind || a.type || '').toLowerCase()] ? String(a.kind || a.type).toLowerCase() : 'info';
        x.title = str(a.title, 80); x.text = str(a.text, 420); x.emoji = emo(a.emoji);
        if (!x.title && !x.text) return null;
      } else if (type === 'stats') {
        x.title = str(a.title, 80);
        x.stats = arr(a.stats).slice(0, 6).map(s => ({ icon: emo(s && s.icon), label: str(s && s.label, 40), value: str(s && s.value, 24), delta: str(s && s.delta, 16) })).filter(s => s.label && s.value);
        if (!x.stats.length) return null;
      } else if (type === 'timeline') {
        x.title = str(a.title, 80);
        x.events = arr(a.events).slice(0, 10).map(e => ({ when: str(e && e.when, 30), title: str(e && e.title, 80), text: str(e && e.text, 200) })).filter(e => e.title);
        if (!x.events.length) return null;
      } else if (type === 'quiz') {
        const normAns = (v, opts) => {
          if (v == null || v === '') return null;
          const one = z => { if (typeof z === 'number' && z >= 0 && z < opts.length) return z; if (typeof z === 'string') { const n = parseInt(z, 10); if (!isNaN(n) && String(n) === z.trim() && n >= 0 && n < opts.length) return n; const i = opts.indexOf(z.trim()); if (i >= 0) return i; } return -1; };
          if (Array.isArray(v)) { const r = v.map(one).filter(k => k >= 0); return r.length ? r : null; }
          const k = one(v); return k >= 0 ? k : null;
        };
        x.title = str(a.title, 80);
        x.questions = arr(a.questions).slice(0, 15).map(q => {
          const options = arr(q && (q.options || q.choices)).map(o => str(o, 160)).filter(Boolean).slice(0, 6);
          const answer = normAns(q && (q.answer != null ? q.answer : q.correct), options);
          return { q: str(q && (q.q || q.question), 320), options, answer, multi: Array.isArray(answer) && answer.length > 1, explain: str(q && (q.explain || q.explanation), 420), image: httpUrl(q && q.image) };
        }).filter(q => q.q && q.options.length >= 2);
        if (!x.questions.length) return null;
      } else if (type === 'activity') {
        x.title = str(a.title, 80);
        x.steps = arr(a.steps).slice(0, 60).map(normStep).filter(s => s && (s.kind === 'sources' ? s.list.length : s.kind === 'images' ? s.imgs.length : s.text));
        if (!x.steps.length) return null;
      } else if (type === 'chips') {
        const list = Array.isArray(a) ? a : arr(a.chips || a.items);
        x.chips = list.map(v => str(typeof v === 'string' ? v : (v && (v.text || v.title)), 60)).filter(Boolean).slice(0, 4);
        if (!x.chips.length) return null;
      } else if (type === 'sources') {
        const list = Array.isArray(a) ? a : arr(a.sources || a.items);
        x.sources = list.map(v => ({ title: str(v && v.title, 100), url: httpUrl(v && v.url) })).filter(v => v.url).slice(0, 8);
        if (!x.sources.length) return null;
      } else if (type === 'ui') {
        x.html = String(a.html == null ? '' : a.html).slice(0, 40000);
        if (x.html.trim().length < 8) return null;
      } else return null;
      return x;
    }

    function normStep(o) {
      o = o || {};
      return { icon: emo(o.icon), text: str(o.text, 160), detail: str(o.detail, 200), url: httpUrl(o.url), kind: o.kind === 'sources' || o.kind === 'images' ? o.kind : 'step', state: o.state === 'run' ? 'run' : o.state === 'err' ? 'err' : 'ok',
        list: arr(o.list).map(i => ({ title: str(i && i.title, 80), url: httpUrl(i && i.url) })).filter(i => i.url).slice(0, 8), imgs: arr(o.imgs).map(httpUrl).filter(Boolean).slice(0, 8) };
    }
    function build(type, x) { injectCss(); const c = el('div', 'mc mct-' + type); BUILD[type](c, x); return c; }

    function renderCard(type, x, replay) {
      try {
        const m = document.getElementById('aiChatMessages');
        if (!m || !BUILD[type] || typeof appendToAIMessages !== 'function') return false;
        const es = document.getElementById('aiChatEmptyState'); if (es) es.style.display = 'none';
        appendToAIMessages(build(type, x)); m.scrollTop = m.scrollHeight;
        if (!replay && typeof aiRecordCard === 'function' && !(typeof aiReplayingUI !== 'undefined' && aiReplayingUI)) aiRecordCard('card', { t: type, x });
        return true;
      } catch (e) { return false; }
    }
    window.aiExtraReplay = window.aiExtraReplay || {};
    window.aiExtraReplay.card = function (dd) { if (dd && dd.t && dd.x) renderCard(dd.t, dd.x, true); };

    // بلوكات الشات: ```flow ... ``` وغيرها (aixBlock بينادي على fence)
    const FENCES = { match: 'match', info: 'info', flow: 'flow', diagram: 'flow', items: 'items', callout: 'callout', stats: 'stats', timeline: 'timeline', gallery: 'images', quiz: 'quiz', shop: 'product', chips: 'chips', suggest: 'chips', sources: 'sources', ui: 'ui' };
    window.MASSR_CARDS = {
      has: l => Object.prototype.hasOwnProperty.call(FENCES, l),
      fence(lang, code) {
        const type = FENCES[lang];
        const x = normalize(type, type === 'ui' ? { html: code } : JSON.parse(code), { fence: true });
        if (!x) throw new Error('bad card');
        return build(type, x).outerHTML;
      },
      render: renderCard, normalize
    };

    // ---------------- الأداة (للمكالمة الصوتية أو عرض كارت من غير نص) ----------------
    const W = window.__massrWT;
    const JSON_TYPES = ['flow', 'items', 'callout', 'stats', 'timeline', 'quiz'];
    if (W && typeof APP_ACTIONS !== 'undefined') {
      const OBJ = props => ({ type: 'array', items: { type: 'object', properties: props } });
      W.reg('show_card', '🃏 كارت في الشات',
        'بتعرض كارت شيك في الشات بدل سرد النص (مفيدة خصوصًا وإنت بتتكلم صوت): match نتيجة/مباراة بأعلام الفرق، product منتج بصورته وسعره، images معرض صور، lib مكتبة جافاسكربت برابط CDN، info معلومة منظمة (سعر عملة، طقس، ترتيب)، flow مخطط خطوات بأسهم وألوان، items قايمة بصور ولينكات، callout تنبيه أو نصيحة، stats أرقام كبيرة، timeline خط زمني، ui تصميم حر بـ HTML. الكارت لقطة وقت الطلب ومش بيتحدّث لوحده. استخدمها بعد ما تجيب بيانات حقيقية، وماتألفش أي رقم أو سعر أو رابط صورة: الحقل اللي مش معاك سيبه فاضي.',
        {
          type: { type: 'string', enum: ['match', 'product', 'images', 'lib', 'info', 'flow', 'items', 'callout', 'stats', 'timeline', 'quiz', 'ui'], description: 'نوع الكارت.' },
          data: d(S, 'للأنواع flow وitems وcallout وstats وtimeline: JSON كنص بنفس صيغة بلوك الشات بالظبط (مثلًا {"steps":[{"title":"..","color":"green"}]}). لنوع ui: كود HTML فقط.'),
          home: d(S, 'match: اسم الفريق الأول.'), away: d(S, 'match: اسم الفريق التاني.'),
          home_code: d(S, 'match: كود دولة الفريق الأول بحروف صغيرة ISO زي eg أو sa أو gb-eng (للمنتخبات). للأندية سيبه فاضي.'), away_code: d(S, 'match: كود دولة الفريق التاني.'),
          home_logo: d(S, 'match: اختياري، رابط شعار النادي من نتيجة حقيقية.'), away_logo: d(S, 'match: اختياري، رابط شعار الفريق التاني.'),
          home_score: d(S, 'match: أهداف الفريق الأول (رقم كنص، أو فاضي لو لسه).'), away_score: d(S, 'match: أهداف الفريق التاني.'),
          status: d(S, 'match: live | halftime | finished | upcoming.'), minute: d(S, 'match: الدقيقة لو لايف زي 67.'),
          competition: d(S, 'match: البطولة أو الدوري.'), kickoff: d(S, 'match: موعد المباراة أو تاريخها.'), venue: d(S, 'match: الملعب.'), scorers: d(S, 'match: اختياري، الأهداف والمسجلين في سطر.'),
          name: d(S, 'product أو lib: الاسم.'), brand: d(S, 'product: الشركة أو البراند.'),
          price: d(S, 'product: السعر كرقم كنص من مصدر حقيقي.'), currency: d(S, 'product: العملة.'), old_price: d(S, 'product: السعر قبل الخصم.'),
          rating: d(S, 'product: التقييم من 5.'), reviews: d(S, 'product: عدد التقييمات.'), availability: d(S, 'product: متاح أو غير متاح.'),
          description: d(S, 'product أو lib: وصف مختصر.'), image: d(S, 'product: رابط صورة المنتج من نتايج حقيقية (https).'),
          url: d(S, 'product: رابط المنتج، lib: الصفحة الرسمية.'), specs: d({ type: 'array', items: S }, 'product: لحد 6 مواصفات قصيرة.'),
          images: d(OBJ({ url: S, caption: S }), 'images: لحد 9 صور {url,caption} من نتايج حقيقية.'), title: d(S, 'images أو info: العنوان.'),
          offers: d(OBJ({ store: S, price: S, url: S }), 'product: أماكن الشراء {store,price,url} من نتايج حقيقية (لحد 6).'),
          version: d(S, 'lib: الإصدار.'), cdn_url: d(S, 'lib: رابط CDN المباشر.'),
          emoji: d(S, 'info: إيموجي واحد للعنوان.'), subtitle: d(S, 'info: عنوان فرعي.'),
          rows: d(OBJ({ label: S, value: S }), 'info: صفوف {label,value}.'), note: d(S, 'info: ملاحظة تحت الصفوف.'),
          source: d(S, 'اسم المصدر.'), source_url: d(S, 'رابط المصدر.')
        },
        ['type'],
        async a => {
          const type = String(a.type || '').toLowerCase();
          let src = a || {};
          if (type === 'ui') src = { html: a.data || a.html || '' };
          else if (JSON_TYPES.indexOf(type) >= 0) {
            let j = {}; try { j = typeof a.data === 'string' ? JSON.parse(a.data) : (a.data || {}); } catch (e) { return W.er('data لازم يكون JSON صحيح بنفس صيغة بلوك ' + type + '.'); }
            src = Object.assign({}, a, j);
          }
          const x = normalize(type, src);
          if (!x) {
            const HINT = { match: 'كارت المباراة لازم فيه home وaway، ولو المباراة خلصت أو لايف لازم home_score وaway_score الاتنين (رقم أو 0). لو مش لاقي النتيجة ابحث تاني أو قول للمستخدم إنك مش لاقيها وماتعرضش كارت.', info: 'كارت info لازم فيه rows (صفوف label/value) أو note؛ ماتعملش كارت عنوان بس. لو عايز تنبيه استخدم callout، ولو مفيش بيانات اكتب الرد كنص.' };
            return W.er(HINT[type] || ('بيانات الكارت ناقصة أو مش بالصيغة المطلوبة لنوع ' + type + '.'));
          }
          if (!renderCard(type, x)) return W.er('مقدرتش أعرض الكارت دلوقتي.');
          return W.ok({ shown: type, message: 'اتعرض كارت (' + type + ') للمستخدم. ماتكرّرش بياناته كنص؛ علّق بجملة قصيرة بس. لو المستخدم سأل بعدين عن تحديث (الدقيقة، النتيجة، السعر) ابحث تاني واعرض كارت جديد.' });
        });
      const VOICE = '\n\nكروت في المكالمة والشات: لما تجيب بيانات حقيقية (نتيجة مباراة، منتج، صور، سعر، خطوات) اعرضها بأداة show_card بدل ما تسردها بالكلام الطويل، وعلّق عليها بجملة واحدة بس. الكارت لقطة وقت السؤال: لو سأل تاني "دلوقتي بقت كام" ابحث واعرض كارت جديد. ماتألفش أرقام ولا روابط ولا صور.';
      const _b2 = window.buildAISystemInstructionText;
      if (typeof _b2 === 'function') window.buildAISystemInstructionText = function () { return _b2.apply(this, arguments) + VOICE; };
    }

    // قواعد الشات العادي (بتتضاف لـ AIX_RULE في index.html)
    window.MASSR_CARD_RULES = ' كروت ورسومات جاهزة في الشات (بتتكتب كتل ``` زي الرسوم، من غير أداة): ' +
      '```flow مخطط خطوات بأسهم وألوان: {"title":"..","steps":[{"title":"..","sub":"..","icon":"💻","color":"green|blue|amber|red|purple|neutral","row":1}]} (الخطوات اللي ليها نفس row بتتعرض جنب بعض في صف). ' +
      '```items قايمة بصور ولينكات وتاجات: {"title":"..","numbered":true,"items":[{"title":"..","text":"..","image":"https://..","url":"https://..","link":"التوثيق الرسمي","tag":"..","tag_color":"green"}]}. ' +
      '```callout تنبيه أو نصيحة: {"kind":"info|tip|warn|success|error","title":"..","text":".."}. ' +
      '```stats أرقام كبيرة: {"title":"..","stats":[{"icon":"📈","label":"..","value":"..","delta":"+12%"}]}. ' +
      '```timeline خط زمني: {"title":"..","events":[{"when":"..","title":"..","text":".."}]}. ' +
      'مهم للكروت: ماتعملش كارت فاضي (info لازم rows أو note، وmatch لازم النتيجة الاتنين رقم أو 0 لو المباراة خلصت أو لايف، ولو مش لاقي النتيجة اكتب كده نصًا). ' +
      '```match نتيجة مباراة: {"home":"مصر","away":"الأردن","home_code":"eg","away_code":"jo","home_score":"2","away_score":"1","status":"live|halftime|finished|upcoming","minute":"67","competition":"..","kickoff":"..","scorers":"..","source":"..","source_url":"https://.."} (home_code للمنتخبات بس بكود الدولة ISO صغير، وللأندية سيبه فاضي). ' +
      '```info معلومة منظمة (سعر عملة، طقس، ترتيب): {"emoji":"💵","title":"..","subtitle":"..","rows":[{"label":"..","value":".."}],"note":"..","source":".."}. ' +
      '```gallery معرض صور: {"title":"..","images":[{"url":"https://..","caption":".."}]}. ' +
      '```ui تصميم حر بـ HTML وCSS (وJS خفيف لو محتاج تفاعل) جوه إطار معزول: اكتب الكود بس من غير html/body. فيه متغيرات الألوان var(--fg) var(--muted) var(--card) var(--border) var(--accent) var(--soft) وكلاسات جاهزة: card وrow وcol وgrid2 وgrid3 وpill وbtn وmuted وh وbig، وألوان g وb وa وr وp مع tint (مثال: class="pill tint g"). الاتجاه RTL تلقائي. ممنوع fetch أو أي اتصال نت أو وحدات vh أو ملفات خارجية، والصور https بس، وخلّي التصميم أنيق وبسيط ومتجاوب مع الموبايل. استخدمه لما الكتل الجاهزة مش كفاية (لوحة، بطاقة تعريف، مقارنة مصممة، شرح بصري، أداة تفاعلية صغيرة). ' +
      '```quiz اختبار تفاعلي (سؤال أو أكتر في كارت واحد، أو كارت لكل موضوع حسب طلب المستخدم): {"title":"..","questions":[{"q":"نص السؤال","options":["..","..","..",".."],"answer":1,"explain":"شرح الإجابة الصح","image":"https://.."}]} (answer رقم الخيار الصح ابتداءً من 0، أو مصفوفة أرقام لو أكتر من إجابة صح، وimage اختياري من نتايج حقيقية). المستخدم بيختار ويدوس إرسال، والتطبيق بيصحّح فورًا ويبعتلك اختياراته، فعلّق على أخطائه واشرح. ' +
      '```shop كارت منتج كامل: {"name":"..","brand":"..","price":"..","currency":"جنيه","old_price":"..","rating":"4.5","reviews":"120","availability":"..","description":"..","image":"https://..","images":["https://..",".."],"specs":["..",".."],"url":"https://..","offers":[{"store":"..","price":"..","url":"https://.."}]} من نتايج الأدوات الفعلية بس، والحقل اللي ملقتوش سيبه، وoffers هي المواقع اللي بيتباع فيها بسعرها ورابطها. ' +
      '```chips اقتراحات متابعة قصيرة في آخر الرد لما تفيد (مش في كل رد): ["سؤال تاني قريب",".."] (2 لـ 3 بس، كل واحد أقل من 8 كلمات ومن نفس سياق الكلام). ```sources مصادر الرد بعد أي بحث ويب: [{"title":"..","url":"https://.."}] من نتايج الأدوات الفعلية بس. ' +
      'قواعد الكتل دي: JSON صحيح (تنصيص مزدوج ومن غير فواصل زيادة)، ماتشرحش صيغة الكتلة ولا تكتب نفس البيانات تاني كنص، حط جملة تمهيد قصيرة قبلها وجملة بعدها، ماتألفش أرقام ولا روابط ولا صور (البيانات الحقيقية من أدوات الويب بس، والحقل اللي ملقتوش سيبه)، واستخدمها لما بتفيد القارئ فعلًا (خطوات، مقارنة، أرقام، نتيجة، مصادر) مش في كل رد. الكارت لقطة وقت السؤال مش بيتحدّث: لو سأل تاني عن تحديث ابحث تاني واعرض كتلة جديدة.';
  } catch (e) { try { console.warn('massr cards register failed', e); } catch (_) { } }
})();


// ============================================================================
// أوامر صوتية للمكالمة: كتم الميكروفون، قفل المكالمة، تغيير عنوان المحادثة
// (بتشتغل حتى والدايرة مركونة على الحافة، لأن المكالمة نفسها فاضلة شغالة)
// ============================================================================
(function () {
  try {
    const W = window.__massrWT;
    if (!W || typeof APP_ACTIONS === 'undefined') return;
    W.reg('voice_mic_mute', '🔇 كتم الميكروفون',
      'بتكتم أو بتفتح ميكروفون المستخدم (يعني المساعد مش هيسمعه) أثناء المكالمة. استخدمها بس لو قال صراحة "اكتم الميكروفون" (mute=true) أو "افتح الميكروفون" (mute=false). كلمة "اسكت" لوحدها ماتكتمش الميكروفون: دي معناها وقّف كلامك، واستخدم stop_speaking.',
      { mute: { type: 'boolean', description: 'true للكتم، false للفتح. لو اتساب فاضي بتبدّل الحالة.' } }, [],
      async a => {
        if (typeof aiLiveCallActive === 'undefined' || !aiLiveCallActive) return W.er('مفيش مكالمة صوتية شغالة دلوقتي.');
        const want = (a && a.mute === undefined) ? !aiLiveMicMuted : (a.mute === true || a.mute === 'true');
        if (want !== aiLiveMicMuted) { try { toggleAIVoiceCallMute(); } catch (e) { return W.er('مقدرتش أغيّر حالة الميكروفون.'); } }
        return W.ok({ muted: !!aiLiveMicMuted, message: aiLiveMicMuted ? 'الميكروفون اتكتم. المستخدم يفتحه من الدايرة أو من زر الميكروفون.' : 'الميكروفون اتفتح.' });
      });
    W.reg('project_switch', '📁 تشغيل/إيقاف مشروع',
      'بتشغّل مشروع من مشاريع المستخدم أو بتوقّفه. المشروع الشغال بيفضل شغال في كل المحادثات الجديدة لحد ما المستخدم يوقفه. استخدمها لما يقول "شغّل مشروع كذا" أو "وقف المشروع" أو "غيّر المشروع لـ كذا". project = اسم المشروع، أو "none" للإيقاف.',
      { project: { type: 'string', description: 'اسم المشروع، أو none لإيقاف المشروع الشغال.' } }, ['project'],
      async a => {
        const r = String((a && a.project) || '').trim();
        if (/^(none|لا شيء|بدون|وقف|ايقاف|إيقاف|stop|off)$/i.test(r)) { try { aiShell.pick(0); } catch (e) { localStorage.removeItem('app_ai_proj'); } return W.ok({ active: null, message: 'اتوقف المشروع الشغال.' }); }
        let list = []; try { list = JSON.parse(localStorage.getItem('app_ai_projects') || '[]'); } catch (e) { }
        const lc = r.toLowerCase(), p = list.find(z => String(z.id) === r) || list.find(z => (z.name || '').toLowerCase() === lc) || list.find(z => (z.name || '').toLowerCase().includes(lc));
        if (!p) return W.er('مفيش مشروع بالاسم ده. المشاريع الموجودة: ' + (list.map(z => z.name).join('، ') || 'مفيش'));
        try { aiShell.pick(p.id); } catch (e) { localStorage.setItem('app_ai_proj', p.id); }
        return W.ok({ active: p.name, message: 'اشتغل مشروع «' + p.name + '» وهيفضل شغال لحد ما المستخدم يوقفه.' });
      });
    W.reg('stop_speaking', '⏹ وقف الكلام',
      'بتوقّف كلامك فورًا أثناء المكالمة الصوتية والميكروفون فاضل شغال. استخدمها فورًا لما المستخدم يقول "اسكت" أو "كفاية" أو "بس" أو "وقف" أو "خلاص". بعدها ماتردّش بأي كلام (ولا حتى تأكيد) لحد ما يكلمك هو.',
      {}, [],
      async () => {
        if (typeof aiLiveCallActive === 'undefined' || !aiLiveCallActive) return W.er('مفيش مكالمة صوتية شغالة دلوقتي.');
        try { aiLiveHush(); } catch (e) { return W.er('مقدرتش أوقّف الكلام.'); }
        return W.ok({ message: 'الصوت اتوقف. خليك ساكت تمامًا ومترّدش بأي كلمة لحد ما المستخدم يتكلم تاني.' });
      });
    W.reg('rename_chat', '✏️ تغيير عنوان المحادثة',
      'بتغيّر عنوان المحادثة الحالية لما المستخدم يقول "غيّر عنوان المحادثة دي لكذا" أو "سمّي المحادثة كذا". العنوان اللي بيحدده المستخدم عمره ما بيتغيّر تلقائي بعد كده. من غير طلب منه، عنوان المحادثة بيتكتب تلقائي من محتواها.',
      { title: { type: 'string', description: 'العنوان الجديد بالعربي، قصير (لحد 8 كلمات).' } }, ['title'],
      async a => {
        const t = String((a && a.title) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (t.length < 2) return W.er('العنوان فاضي.');
        let id = (typeof aiActiveConvId !== 'undefined') ? aiActiveConvId : null;
        window.__aiCustomTitle = t;
        if (Array.isArray(aiChatHistory) && aiChatHistory.length) {
          try { const cid = await archiveCurrentAIChatIfNeeded(); if (cid != null) { id = cid; try { setAIActiveConv(cid); } catch (e) { } } } catch (e) { }
        }
        const list = getAIConversations(), c = list.find(z => z.id === id);
        if (c) { c.title = t; c.titleSrc = 'user'; saveAIConversationsList(list); window.__aiCustomTitle = null; }
        const tt = document.getElementById('amTT'); if (tt) tt.textContent = t;
        try { if (typeof renderAIConversationsList === 'function') renderAIConversationsList(); } catch (e) { }
        return W.ok({ title: t, message: 'اتغيّر عنوان المحادثة لـ "' + t + '". أكّد بجملة قصيرة.' });
      });

    const CMDS = '\n\nأوامر صوتية (نفّذها فورًا بالأداة من غير ما تسأل): لو قال "اسكت" أو "كفاية" أو "بس" أو "وقف" استدعي stop_speaking فورًا وبعدها ماتتكلمش خالص لحد ما يكلمك (ده مش كتم ميكروفون). ولو قال صراحة "اكتم الميكروفون" استدعي voice_mic_mute بـ mute=true، و"افتح الميكروفون" mute=false. لو قال "اقفل المحادثة/المكالمة" أو "خلاص كفاية" استدعي end_voice_call. لو قال "غيّر عنوان المحادثة (دي) لـ كذا" أو "سمّي المحادثة كذا" استدعي rename_chat بالعنوان. بعد التنفيذ علّق بجملة قصيرة جدًا.';
    ['buildAILiveSystemInstructionText', 'buildAISystemInstructionText'].forEach(nm => {
      const f = window[nm];
      if (typeof f === 'function' && !f.__massrCmds) {
        const projNote = () => { try { const id = localStorage.getItem('app_ai_proj'); if (!id) return ''; const p = JSON.parse(localStorage.getItem('app_ai_projects') || '[]').find(z => String(z.id) === String(id)); if (!p) return ''; return '\n\nالمشروع الشغال دلوقتي «' + p.name + '» وبيفضل شغال بين كل المحادثات لحد ما المستخدم يوقفه. لو سألك ليه بتتصرف بأسلوب أو طريقة معينة، اشرح بصراحة إن ده بسبب المشروع ده (تعليماته معاك)، واعرض عليه توقفه أو تبدّل لمشروع تاني بأداة project_switch.'; } catch (e) { return ''; } };
        const g = function () { return f.apply(this, arguments) + CMDS + projNote(); }; g.__massrCmds = true; window[nm] = g;
      }
    });
    // الكروت كمان تتعرض في المكالمة: نفس قاعدة الصوت بتتضاف للجلسة الصوتية
    const f2 = window.buildAILiveSystemInstructionText;
    if (typeof f2 === 'function' && !f2.__massrVoiceCards) {
      const VC = '\n\nكروت في المكالمة: لما تجيب بيانات حقيقية (نتيجة مباراة، منتج، صور، سعر، خطوات) اعرضها بأداة show_card بدل السرد الطويل وعلّق بجملة واحدة. الكارت لقطة وقت السؤال، ولو سأل عن تحديث ابحث تاني واعرض كارت جديد. ماتألفش أرقام ولا روابط ولا صور.';
      const g2 = function () { return f2.apply(this, arguments) + VC; }; g2.__massrVoiceCards = true; g2.__massrCmds = true; window.buildAILiveSystemInstructionText = g2;
    }
  } catch (e) { try { console.warn('massr voice tools failed', e); } catch (_) { } }
})();
