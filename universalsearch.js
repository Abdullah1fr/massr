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
    code: ['github', 'مستودع', 'مستودعات', 'كود', 'اكواد', 'مكتبه برمجيه', 'مكتبات برمجيه', 'library', 'libraries', 'package', 'npm', 'pypi', 'repo', 'repository', 'repositories', 'source code', 'documentation', 'api docs', 'framework', 'sdk', 'open source', 'مفتوح المصدر', 'مفتوحه المصدر'],
    news: ['خبر', 'اخبار', 'عاجل', 'اخر الاخبار', 'news', 'headline', 'headlines', 'breaking']
  };
  const RECENCY = ['اليوم', 'النهارده', 'الان', 'حاليا', 'حديث', 'حديثه', 'اخر', 'latest', 'today', 'now', 'recent', 'newest', 'currently'];
  const PLAY = ['شغل', 'شغلي', 'شغلها', 'شغله', 'play', 'استمع', 'اسمع', 'سماع', 'listen'];
  const INTENT_KEYS = Object.keys(KW);

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
  const TYPE_FOR_INTENT = { image: ['image'], video: ['video'], audio: ['audio', 'video'], academic: ['paper'], book: ['book'], file: ['book', 'page'], product: ['page'], code: ['repo', 'package'], news: ['news', 'page'] };
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
      const bonus = (r.read ? 0.05 : 0) + (r.rights === 'public-domain' || r.rights === 'open-access' ? 0.05 : 0) + (r.meta && r.meta.archived ? -0.1 : 0);
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
    const job = (id, label, timeout, fn) => {
      const t = Date.now();
      jobs.push((async () => {
        try {
          const out = await withTimeout(fn(), timeout);
          const recs = (out && out.records) || [];
          lists.push({ source: id, records: recs });
          if (out && out.pages) pagesOut = pagesOut.concat(out.pages);
          sources.push({ source: id, label, ok: recs.length > 0 || !!(out && out.ok), count: recs.length, ms: ms(t), error: recs.length || (out && out.ok) ? undefined : ((out && out.error) || 'مفيش نتايج') });
        } catch (e) {
          sources.push({ source: id, label, ok: false, count: 0, ms: ms(t), error: String((e && e.message) || e).slice(0, 160) });
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
    if (ranked.length < 3 && typeof deps.grounded === 'function' && opts.gemini !== false) {
      const t = Date.now();
      try {
        const g = await withTimeout(deps.grounded(raw, region, 8), 25000);
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
        const m = {}; ['doi', 'year', 'citations', 'pdf', 'authors', 'stars', 'language', 'license', 'updated', 'files', 'artist', 'preview', 'channel', 'published', 'image', 'creator', 'ia', 'openLibrary'].forEach(k => { if (r.meta[k] != null && r.meta[k] !== '') m[k] = r.meta[k]; });
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
    if (fallback === 'gemini') notes.push('النتايج كانت قليلة فاستخدمت بحث جوجل الحي عبر Gemini كاحتياطي أخير: اعتبره ملخصًا مش قراءة مباشرة.');
    if (I.book || I.file) notes.push('مفيش رابط تحميل يتقدّم كـ"مجاني/قانوني" غير اللي عليه rights (ملك عام/مفتوح/منصة رسمية). صفحة الكتاب مش هي ملف PDF مباشر إلا لو direct_file=true.');
    if (I.audio || I.video) notes.push('قدّم مصادر الاستماع/المشاهدة الرسمية فقط (يوتيوب الرسمي، Apple Music...)، وماتدلّش على مواقع تنزيل.');
    if (results.some(r => r.from && r.from.some(f => ['openlibrary', 'gutenberg', 'internetarchive', 'github', 'npm', 'wikipedia', 'openalex', 'crossref', 'openverse', 'commons', 'itunes', 'gdelt'].includes(f))))
      notes.push('روابط المصادر المباشرة (Open Library/GitHub/…) ممكن web_read يرفضها لو الوركر شغّال؛ استخدم البيانات اللي في النتيجة نفسها.');

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
    const TYPES = ['image', 'video', 'audio', 'academic', 'book', 'file', 'product', 'code', 'news'];
    W.reg('massr_universal_search', '🌐 بحث شامل — MASSR',
      'المدخل الأول لأي طلب بحث بلغة طبيعية (عربي أو إنجليزي): مواقع ومقالات ومعلومات وأخبار وكتب وروايات وPDF وأبحاث علمية وصور وفيديوهات ويوتيوب وأغاني وأناشيد ومنتجات وأسعار ومستودعات GitHub ومكتبات. بيفهم النوع تلقائيًا ويشغّل البحث العام دايمًا + المصادر المتخصصة المناسبة بالتوازي، ويشيل المكرر ومواقع القرصنة، ويرتّب بالصلة والجودة، ويرجّع روابط حقيقية وحالة كل مصدر (اللي فشل بيتذكر). لو عايز تشغّل أنشودة/أغنية مباشرة جوه الشات استخدم youtube_search؛ ولقراءة صفحة معيّنة web_read.',
      {
        query: d(S, 'طلب المستخدم بلغته (كلمات مفتاحية أو جملة طبيعية).'),
        types: d(SA, 'اختياري، تلميح منك لنوع الطلب لو واضح: ' + TYPES.join(' | ') + ' (تقدر تبعت أكتر من نوع).'),
        queries: d(SA, 'اختياري: لحد 3 صياغات بديلة (بالإنجليزي أو بلغة المصدر) للبحث العام.'),
        region: d(S, 'اختياري: منطقة ولغة مثل eg-ar أو us-en (للأسعار والأخبار المحلية).'),
        fresh: d(S, 'اختياري: حداثة d يوم | w أسبوع | m شهر | y سنة.'),
        depth: d(S, 'brief (افتراضي) أو deep لبحث أوسع وقراءة أطول.'),
        max_results: d(N, 'عدد الروابط المرجّعة 3-15 (افتراضي 8).')
      },
      ['query'],
      async a => {
        const q = W.norm(a.query);
        if (q.length < 2) return W.er('اكتب موضوع البحث أو السؤال.');
        W.act('🌐 بحث شامل: ' + q.slice(0, 60));
        const tools = {}; ['web_research', 'web_find', 'web_scholar', 'web_images', 'youtube_search'].forEach(n => { if (APP_ACTIONS[n] && APP_ACTIONS[n].handler) tools[n] = APP_ACTIONS[n]; });
        let r;
        try { r = await M.run(q, { query: q, types: a.types, queries: a.queries, region: a.region, fresh: a.fresh, depth: a.depth, max_results: a.max_results }, { tools, grounded: W.groundedSearch, fetch: window.fetch ? window.fetch.bind(window) : undefined }); }
        catch (e) { return W.er('البحث الشامل فشل: ' + String((e && e.message) || e).slice(0, 160)); }
        if (!r || r.status !== 'ok') return r || W.er('مفيش نتايج.');
        W.taint();
        const imgs = r.__inlineImages; delete r.__inlineImages;
        r.message = 'دي نتايج حقيقية من مصادر متعددة (النوع المكتشف: ' + (r.detected_types.join('، ') || 'عام') + '). استخدم الروابط اللي في results بس، وماتألفش رابط ولا سعر ولا رابط تحميل. اقرا pages (مقتطفات اتقرت فعلًا) واعتمد عليها، ولو محتاج صفحة تانية افتحها بـ web_read. اذكر للمستخدم المصادر اللي فشلت (sources_failed) بصراحة لو أثّرت على الرد. rights بيوضح القانونية: ماتقدّمش أي رابط كتحميل مجاني إلا لو عليه ملك عام/مصدر مفتوح/منصة رسمية. '
          + (imgs ? 'الصور المرفقة هي مرشحين لطلب المستخدم: شوفها واختار المطابق وبعدين web_show_images بالأرقام. ' : '') + W.UNTRUSTED;
        if (imgs && imgs.length) r.__imageInlineDataList = imgs;
        return W.ok(r);
      });
    const RULES = '\n\nMASSR Universal Search (قواعد، بتحل محل أي قاعدة قديمة بتتعارض معاها): لأي طلب بحث أو استكشاف بلغة طبيعية (معلومة، مقال، خبر، كتاب، رواية، PDF، بحث علمي، صور، فيديو، أغنية/أنشودة، منتج وسعر، مستودع GitHub، مكتبة...) ابدأ بـ massr_universal_search واحدة، ومتطلبش من المستخدم يختار محرك أو نوع بحث. ابعت في types تلميح نوع الطلب لو واضح، وفي queries صياغة إنجليزي لو الموضوع عالمي. الأداة بتدوّر في الويب دايمًا وبتضيف المصادر المتخصصة وبتقولك مين فشل. بعدها: اقرا pages واعتمد على اللي اتقرا فعلًا، وافتح أهم رابط بـ web_read لو محتاج تفاصيل، وماتألفش أي رابط أو سعر أو رابط تحميل. الكتب والملفات: فرّق بين صفحة الكتاب وملف PDF المباشر (direct_file)، واعرض كرابط تحميل مجاني بس اللي rights بتاعه ملك عام/مصدر مفتوح/منصة رسمية، ولو مفيش قول إن مفيش مصدر قانوني ظاهر بدل ما تدلّ على مواقع قرصنة. الأغاني والأناشيد: مصادر رسمية فقط. لو الطلب مجرد "شغّل أنشودة/أغنية كذا" فاستخدم youtube_search مباشرة. الاستثناءات: طلبات التقارير الشاملة بملف تفضل زي ما هي (web_research عميق + أدوات الملفات)، وgemini احتياطي أخير جوه الأداة نفسها.';
    const _b = window.buildAISystemInstructionText;
    if (typeof _b === 'function') window.buildAISystemInstructionText = function () { return _b.apply(this, arguments) + RULES; };
  } catch (e) { try { console.warn('massr universal search register failed', e); } catch (_) { } }
})();
