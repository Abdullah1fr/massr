(function(){
try{
// =====================================================================
// mcptools.js — موصّلات MCP جوه "سأنجزها": المستخدم يربط حسابه بمواقع (كانفا أولًا) والمدرب يستخدمها.
// بيكلّم بوابة الـ Worker (mcp-gateway.js) بس. مفيش أسرار هنا: الأسرار والتوكنز عند الـ Worker.
// بيتحط في index.html بعد videotools.js:  <script src="mcptools.js"></script>   ولإلغائه: شيل السطر بس.
// لو أي حاجة ناقصة (APP_ACTIONS / fbAuth) بيسكت ومبيكسرش حاجة.
// ده لسه ما اتجرّبش على سيرفرات حقيقية ولا على موبايلك.
// =====================================================================

// عنوان البوابة: بعد ما تنشر الـ Worker حط عنوانه هنا (من غير / في الآخر). أو من الكونسول: localStorage.mcp_gw='https://...'
var GATEWAY='https://sanjiz-mcp.abdo-kh66666.workers.dev';

if(typeof APP_ACTIONS==='undefined'||typeof AI_TOOLS_DECLARATION==='undefined'||typeof AI_FN_STATUS_LABELS==='undefined')return;
var AA=APP_ACTIONS,DECL=AI_TOOLS_DECLARATION[0].functionDeclarations,LB=AI_FN_STATUS_LABELS;
if(AA.mcp_status)return;

var S={type:'string'};
var d=function(t,x){return Object.assign({},t,{description:x})};
var reg=function(n,lab,desc,p,r,h){AA[n]={description:desc,parameters:{type:'object',properties:p,required:r||[]},handler:h};DECL.push({name:n,description:desc,parameters:AA[n].parameters});LB[n]=lab};
var ok=function(o){return Object.assign({status:'ok'},o)},er=function(m){return {status:'error',message:m}};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var MAX_OUT=30000;

function gw(){var u='';try{u=localStorage.getItem('mcp_gw')||''}catch(e){}return String(u||GATEWAY).replace(/\/+$/,'')}
function gwReady(){var u=gw();return /^https:\/\//.test(u)&&u.indexOf('REPLACE-ME')<0}
function snack(t){try{if(typeof showToast==='function')showToast(t)}catch(e){}}

// طلب للبوابة بتوكن Firebase بتاع المستخدم
async function api(path,body){
  if(!gwReady())throw new Error('بوابة المواقع لسه ما اتظبطتش (mcp-setup.txt).');
  var a=(typeof fbAuth!=='undefined')?fbAuth:null;
  if(!a||!a.currentUser)throw new Error('لازم تسجّل دخول الأول.');
  var tok=await a.currentUser.getIdToken();
  var r,j;
  try{r=await fetch(gw()+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body||{})})}
  catch(e){throw new Error('مفيش اتصال بالبوابة. اتأكد من النت.')}
  j=await r.json().catch(function(){return {}});
  if(!r.ok){var e=new Error(j.message||('خطأ '+r.status));e.code=j.error||'';throw e}
  return j;
}

// ---------- واجهة الربط ----------
var UI=null;
function ensureUI(){
  if(UI)return UI;
  var o=document.createElement('div');
  o.id='mcpSheet';
  o.style.cssText='position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.55);display:none;align-items:flex-end;justify-content:center;direction:rtl';
  o.innerHTML='<div style="width:100%;max-width:560px;max-height:86vh;overflow:auto;background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border-radius:20px 20px 0 0;padding:14px 14px calc(16px + env(safe-area-inset-bottom,0px));font-family:inherit;text-align:right">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="flex:1;font-size:1.05rem">🔌 ربط المواقع</b><button id="mcpX" style="background:none;border:0;color:inherit;font-size:1.3rem;cursor:pointer" aria-label="إغلاق">✕</button></div>'+
    '<div style="font-size:.78rem;opacity:.75;line-height:1.7;margin-bottom:8px">اربط حسابك في موقع، والمدرب يقدر يشتغل عليه بصلاحياتك إنت. تقدر تفصل الربط في أي وقت.</div>'+
    '<div id="mcpList"></div></div>';
  o.addEventListener('click',function(e){if(e.target===o)close()});
  document.body.appendChild(o);
  o.querySelector('#mcpX').onclick=close;
  UI=o;return o;
}
function close(){if(UI)UI.style.display='none'}
async function render(){
  var box=ensureUI().querySelector('#mcpList');
  box.innerHTML='<div style="padding:18px;text-align:center;opacity:.7">⏳ بحمّل...</div>';
  var list;
  try{list=(await api('/mcp/providers')).providers||[]}
  catch(e){box.innerHTML='<div style="padding:14px;color:#ff7b7b;line-height:1.7">'+esc(e.message||e)+'</div>';return}
  box.innerHTML=list.map(function(p){
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px 4px;border-top:1px solid rgba(128,140,160,.25)">'+
      '<span style="font-size:1.6rem">'+esc(p.icon||'🔗')+'</span>'+
      '<span style="flex:1"><b>'+esc(p.name)+'</b><small style="display:block;opacity:.7">'+(p.connected?'متوصّل ✅':'مش متوصّل')+(p.host?' · '+esc(p.host):'')+'</small></span>'+
      (p.custom?'<button data-rm="'+esc(p.id)+'" title="حذف الموقع" style="background:none;border:0;color:inherit;opacity:.7;font-size:1.1rem;cursor:pointer">🗑️</button>':'')+
      ((p.connected&&p.custom&&p.auth!=='oauth')?'':'<button data-p="'+esc(p.id)+'" data-c="'+(p.connected?1:0)+'" class="btn '+(p.connected?'btn-secondary':'')+'" style="padding:8px 14px;cursor:pointer">'+(p.connected?'فصل':'ربط')+'</button>')+'</div>';
  }).join('')||'<div style="padding:14px;opacity:.7">مفيش مواقع متاحة حاليًا.</div>';
  box.innerHTML+=ADD_HTML;
  wireAdd(box);
  Array.prototype.forEach.call(box.querySelectorAll('button[data-rm]'),function(b){
    b.onclick=async function(){
      if(!confirm('أحذف الموقع ده وأفصل الربط؟'))return;
      b.disabled=true;
      try{await api('/mcp/remove',{provider:b.getAttribute('data-rm')});snack('اتحذف');render()}
      catch(e){b.disabled=false;snack(e.message||String(e))}
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('button[data-p]'),function(b){
    b.onclick=async function(){
      var pid=b.getAttribute('data-p'),on=b.getAttribute('data-c')==='1';
      b.disabled=true;
      try{
        if(on){await api('/mcp/disconnect',{provider:pid});snack('اتفصل الربط');render()}
        else{
          // رجوع للصفحة نفسها بدون باراميترات قديمة
          var back=location.origin+location.pathname;
          var r=await api('/mcp/connect',{provider:pid,returnTo:back});
          location.href=r.url; // بيودّيك لصفحة تسجيل الدخول عند الموقع وبعدين يرجّعك
        }
      }catch(e){b.disabled=false;snack(e.message||String(e))}
    };
  });
}
var ADD_HTML='<div style="border-top:1px solid rgba(128,140,160,.25);padding-top:12px;margin-top:4px">'+
  '<button id="mcpAddT" class="btn btn-secondary" style="width:100%;padding:10px;cursor:pointer">➕ إضافة موقع تاني</button>'+
  '<div id="mcpAddF" style="display:none;margin-top:10px;line-height:1.7">'+
  '<div style="font-size:.78rem;opacity:.75;margin-bottom:6px">الصق رابط سيرفر MCP بتاع الموقع (بيبدأ بـ https). لو الموقع بيدّيك مفتاح (API key) حطه تحت، ولو مفيش سيبه فاضي وهنجرّب تسجيل الدخول تلقائيًا.</div>'+
  '<input id="mcpN" placeholder="اسم الموقع (مثلًا: Notion)" maxlength="40" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;margin-bottom:6px">'+
  '<input id="mcpU" dir="ltr" placeholder="https://.../mcp" inputmode="url" autocapitalize="off" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;margin-bottom:6px">'+
  '<input id="mcpK" dir="ltr" type="password" placeholder="مفتاح API (اختياري)" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;margin-bottom:8px">'+
  '<button id="mcpAddB" class="btn" style="width:100%;padding:10px;cursor:pointer">إضافة</button>'+
  '<div style="font-size:.7rem;opacity:.65;margin-top:6px">ضيف مواقع انت واثق فيها بس: المدرب هيقدر يستخدم أدواتها بصلاحياتك.</div></div></div>';
function wireAdd(box){
  var t=box.querySelector('#mcpAddT'),f=box.querySelector('#mcpAddF');
  t.onclick=function(){f.style.display=f.style.display==='none'?'block':'none'};
  box.querySelector('#mcpAddB').onclick=async function(){
    var b=this,n=box.querySelector('#mcpN').value.trim(),u=box.querySelector('#mcpU').value.trim(),k=box.querySelector('#mcpK').value.trim();
    if(!n||!u){snack('اكتب الاسم والرابط');return}
    b.disabled=true;b.textContent='⏳ بتأكد من الموقع...';
    try{
      var r=await api('/mcp/add',{name:n,url:u,token:k});
      if(r.connected){snack('✅ اتضاف '+n);render()}
      else{
        snack('اتضاف. هنفتحلك تسجيل الدخول');
        var c=await api('/mcp/connect',{provider:r.id,returnTo:location.origin+location.pathname});
        location.href=c.url;
      }
    }catch(e){b.disabled=false;b.textContent='إضافة';snack(e.message||String(e))}
  };
}
function open(){ensureUI().style.display='flex';render()}
window.openMcpConnectors=open;

// زرار "ربط المواقع" في الشريط الجانبي: محاولة تلقائية بدون ما أعرف تركيبة الشريط عندك (ما اتجرّبتش).
// لو ما ظهرش، حط في index.html زرار فيه onclick="openMcpConnectors()" جوه الشريط الجانبي.
function addSideItem(){
  try{
    if(document.getElementById('mcpSideBtn'))return true;
    var sel=['#sidebar','#sideMenu','#side-menu','#sidemenu','#drawer','#menuDrawer','.sidebar','.side-menu','.sidemenu','.drawer','aside','#sideNav','.side-nav'];
    var sb=null;for(var i=0;i<sel.length&&!sb;i++)sb=document.querySelector(sel[i]);
    if(!sb)return false;
    var ref=sb.querySelector('button, a, li, .menu-item, .side-item, .nav-item');
    var el=document.createElement(ref&&ref.tagName==='LI'?'li':(ref&&ref.tagName==='A'?'a':'button'));
    el.id='mcpSideBtn';if(ref&&ref.className)el.className=ref.className;
    el.textContent='🔌 ربط المواقع';
    if(el.tagName==='A')el.href='#';
    el.style.cursor='pointer';
    el.addEventListener('click',function(e){e.preventDefault();open()});
    (ref&&ref.parentNode?ref.parentNode:sb).appendChild(el);
    return true;
  }catch(e){return false}
}
// الزرار اتحط يدويًا في الإعدادات، فالإضافة التلقائية للشريط الجانبي اتعطّلت.

// رجوع من تسجيل الدخول عند الموقع: ?mcp=connected&provider=canva
try{
  var q=new URLSearchParams(location.search);
  if(q.get('mcp')){
    var res=q.get('mcp'),prov=q.get('provider')||'',why=q.get('reason')||'';
    ['mcp','provider','reason'].forEach(function(k){q.delete(k)});
    var qs=q.toString();
    history.replaceState(null,'',location.pathname+(qs?'?'+qs:'')+location.hash);
    setTimeout(function(){
      snack(res==='connected'?'✅ اتربط '+prov+' بنجاح':'⚠️ الربط مانفعش'+(why?' ('+why+')':'')+'. جرّب تاني.');
      if(res!=='connected')open();
    },1500);
  }
}catch(e){}

// ---------- أدوات المدرب ----------
reg('mcp_status','🔌 بشوف المواقع المربوطة',
 'يرجّع المواقع اللي المستخدم ممكن يربطها بحسابه (زي كانفا) وهل كل واحد متوصّل. استخدمها قبل أي شغل على موقع.',
 {},[],
 async function(){
  try{var r=await api('/mcp/providers');return ok({providers:r.providers||[]})}
  catch(e){return er(e.message||String(e))}
 });

reg('mcp_open_connect','🔌 بفتح شاشة الربط',
 'يفتح للمستخدم شاشة ربط المواقع عشان يضغط ربط ويسجّل دخول بنفسه. استخدمها لو الموقع مش متوصّل. المستخدم هو اللي بيدخل بياناته، مش المدرب.',
 {},[],
 async function(){open();return ok({message:'فتحت شاشة الربط. قول للمستخدم يضغط "ربط" جنب الموقع.'})});

reg('mcp_list_tools','🔎 بشوف أدوات الموقع',
 'يجيب قايمة الأدوات اللي الموقع المربوط بيقدمها (الاسم والوصف والمدخلات). لازم تناديها قبل mcp_call عشان تعرف أسماء الأدوات ومدخلاتها بالظبط، ومتفترضش أسماء.',
 {provider:d(S,'معرّف الموقع زي ما بيرجع من mcp_status (مثلًا canva أو u_xxxx للمواقع اللي المستخدم ضافها)')},['provider'],
 async function(a){
  try{
    var r=await api('/mcp/tools',{provider:String(a.provider||'')});
    return ok({tools:r.tools||[]});
  }catch(e){return er(e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))}
 });

reg('mcp_call','🛠️ بنفّذ على الموقع',
 'ينفّذ أداة على موقع مربوط. tool = اسم الأداة من mcp_list_tools، وarguments_json = المدخلات كنص JSON. لو الأداة بترجّع مرشحات/اختيارات (زي تصاميم كانفا) اعرضها على المستخدم ودَعه يختار، متختارش بدالُه. مدخلات الأداة ممكن تكون طويلة وبتأخد وقت، فنفّذ بس لما المستخدم يطلب.',
 {provider:d(S,'معرّف الموقع زي ما بيرجع من mcp_status (مثلًا canva أو u_xxxx للمواقع اللي المستخدم ضافها)'),tool:d(S,'اسم الأداة بالظبط'),intent:d(S,'جملة قصيرة: المستخدم عايز إيه (بتتبعت لأدوات كانفا كـ user_intent)'),arguments_json:d(S,'مدخلات الأداة كنص JSON (مثلًا {"query":"..."}). فاضي لو الأداة من غير مدخلات')},
 ['provider','tool'],
 async function(a){
  try{
    var args={};
    if(a.arguments_json){try{args=JSON.parse(a.arguments_json)}catch(e){return er('arguments_json مش JSON سليم.')}}
    if(!args||typeof args!=='object'||Array.isArray(args))return er('arguments_json لازم يكون كائن JSON.');
    if(args.user_intent==null)args.user_intent=String(a.intent||('تنفيذ '+a.tool)).slice(0,200);
    var r=(await api('/mcp/call',{provider:String(a.provider||''),tool:String(a.tool||''),arguments:args})).result||{};
    if(r.truncated)return ok({truncated:true,content:String(r.text||'').slice(0,MAX_OUT),note:'النتيجة كبيرة واتقطعت.'});
    var txt=(Array.isArray(r.content)?r.content:[]).map(function(c){return c&&c.type==='text'?c.text:(c&&c.type?'['+c.type+']':'')}).filter(Boolean).join('\n');
    if(r.isError)return er(txt.slice(0,2000)||'الموقع رجّع خطأ.');
    var out={content:txt.slice(0,MAX_OUT)};
    if(r.structuredContent)try{var sj=JSON.stringify(r.structuredContent);out.structured=sj.length<=MAX_OUT?r.structuredContent:sj.slice(0,MAX_OUT)}catch(e){}
    if(txt.length>MAX_OUT)out.note='النص اتقطع.';
    return ok(out);
  }catch(e){return er(e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))}
 });

// روابط التصدير عند المواقع (زي كانفا) مؤقتة وبتنتهي بسرعة، فنحفظ الملف في المحادثة فورًا.
// ملحوظة: لو الموقع مش بيسمح بالتحميل من المتصفح (CORS) هيفشل وبنقول كده صراحة.
reg('mcp_save_file','💾 بحفظ الملف في المحادثة',
 'ينزّل ملف من رابط (مثلًا رابط تصدير تصميم من كانفا) ويحفظه في المحادثة عشان المستخدم يحمّله. الروابط دي بتنتهي بسرعة فنادي الأداة دي مباشرة بعد ما تاخد الرابط.',
 {url:d(S,'رابط https للملف'),name:d(S,'اسم الملف بدون امتداد'),ext:d(S,'الامتداد: png | jpg | pdf | mp4 ... الافتراضي png')},['url'],
 async function(a){
  try{
    var u=String(a.url||'');
    if(!/^https:\/\//i.test(u))return er('الرابط لازم يبدأ بـ https.');
    var r;try{r=await fetch(u)}catch(e){return er('المتصفح مقدرش ينزّل الملف من الموقع ده (غالبًا بسبب حماية CORS). افتح الرابط يدويًا وحمّله بنفسك.')}
    if(!r.ok)return er('الرابط رجّع '+r.status+(r.status===403||r.status===410?' (غالبًا انتهت صلاحيته، اطلب التصدير تاني)':''));
    var buf=new Uint8Array(await r.arrayBuffer());
    if(buf.length>25*1048576)return er('الملف أكبر من 25 ميجا.');
    var ext=String(a.ext||'png').replace(/[^a-z0-9]/gi,'').toLowerCase()||'png';
    var mime=(r.headers.get('content-type')||'').split(';')[0]||(ext==='pdf'?'application/pdf':ext==='png'?'image/png':'application/octet-stream');
    var nm=String(a.name||'ملف').replace(/\s+/g,' ').trim()||'ملف';
    var file=await aiAddOutputFile(aiBase(nm,'',ext),mime,buf);
    return ok({message:'اتحفظ الملف ('+(buf.length/1048576).toFixed(2)+' ميجا)',file:file});
  }catch(e){return er(e.message||String(e))}
 });


// ---------- كارت التصميم: تعديل في كانفا + تنزيل ----------
// بعد ما المدرب يخلّص تصميم، بينادي mcp_show_card ويظهر كارت: صورة مصغّرة + زرار "تعديل في كانفا" + زرار تنزيل (PNG/JPG/PDF).
// التنزيل: بينادي export-design عن طريق البوابة، وبعدين البوابة تنزّل الملف (لأن رابط التصدير مؤقت ومغلق CORS)، ويتحفظ في المحادثة ويتنزّل على جهازك.
var URLRX=/https:\/\/[^\s"'<>\\)\]]+/g;
async function apiBin(path,body){
  if(!gwReady())throw new Error('بوابة المواقع لسه ما اتظبطتش (mcp-setup.txt).');
  var a=(typeof fbAuth!=='undefined')?fbAuth:null;
  if(!a||!a.currentUser)throw new Error('لازم تسجّل دخول الأول.');
  var tok=await a.currentUser.getIdToken(),r;
  try{r=await fetch(gw()+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body||{})})}
  catch(e){throw new Error('مفيش اتصال بالبوابة.')}
  if(!r.ok){var j=await r.json().catch(function(){return {}});throw new Error(j.message||('خطأ '+r.status))}
  return {buf:new Uint8Array(await r.arrayBuffer()),type:(r.headers.get('content-type')||'').split(';')[0]};
}
function textOf(res){
  var r=res||{};
  var t=(Array.isArray(r.content)?r.content:[]).map(function(c){return c&&c.type==='text'?c.text:''}).join('\n');
  try{if(r.structuredContent)t+='\n'+JSON.stringify(r.structuredContent)}catch(e){}
  return t;
}
function designIdOf(s){var m=String(s||'').match(/\bD[A-Za-z0-9_-]{10}\b/);return m?m[0]:''}
async function exportDesign(designId,type,nameBase){
  var res=(await api('/mcp/call',{provider:'canva',tool:'export-design',arguments:{design_id:designId,format:{type:type},user_intent:'تنزيل التصميم كملف '+type}})).result||{};
  var txt=textOf(res);
  if(res.isError)throw new Error(txt.slice(0,300)||'الموقع رجّع خطأ في التصدير.');
  var urls=(txt.match(URLRX)||[]).map(function(u){return u.replace(/[.,;]+$/,'')});
  // الأفضل رابط فيه امتداد الملف المطلوب، وإلا أول رابط
  var url=urls.filter(function(u){return u.toLowerCase().indexOf('.'+type)>=0})[0]||urls[0];
  if(!url)throw new Error('التصدير خلص بس معرفتش ألاقي رابط التنزيل في الرد.');
  var f=await apiBin('/mcp/fetch',{url:url});
  var mime=f.type||(type==='pdf'?'application/pdf':type==='png'?'image/png':type==='jpg'?'image/jpeg':'application/octet-stream');
  var nm=String(nameBase||'تصميم').replace(/\s+/g,' ').trim()||'تصميم';
  var file=null;
  try{file=await aiAddOutputFile(aiBase(nm,'',type),mime,f.buf)}catch(e){}
  // تنزيل على الجهاز
  try{
    var u=URL.createObjectURL(new Blob([f.buf],{type:mime})),l=document.createElement('a');
    l.href=u;l.download=nm+'.'+type;document.body.appendChild(l);l.click();l.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},60000);
  }catch(e){}
  return {file:file,size:f.buf.length};
}
function safeUrl(u){u=String(u||'');return /^https:\/\//i.test(u)?u:''}
function cardHtml(c){
  var th=safeUrl(c.thumbnail_url);
  return '<div style="direction:rtl;text-align:right;border:1px solid rgba(128,140,160,.35);border-radius:14px;padding:10px;max-width:340px;background:rgba(128,128,128,.08)">'+
    (th?'<img src="'+esc(th)+'" alt="" referrerpolicy="no-referrer" style="width:100%;border-radius:10px;display:block;margin-bottom:8px">':'')+
    '<div style="font-weight:800;margin-bottom:8px">🎨 '+esc(c.title||'تصميم كانفا')+'</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
    (safeUrl(c.edit_url)?'<button data-a="edit" class="btn" style="padding:8px 12px;cursor:pointer">✏️ تعديل في كانفا</button>':'')+
    (c.design_id?'<select data-a="fmt" style="padding:8px;border-radius:10px"><option>png</option><option>jpg</option><option>pdf</option></select><button data-a="dl" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">⬇️ تنزيل</button>':'')+
    '</div><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em"></div></div>';
}
function wireCard(root,c){
  var msg=root.querySelector('[data-a=msg]');
  var say=function(t){if(msg)msg.textContent=t};
  var e=root.querySelector('[data-a=edit]');
  if(e)e.onclick=function(){window.open(safeUrl(c.edit_url),'_blank','noopener')};
  var b=root.querySelector('[data-a=dl]');
  if(b)b.onclick=async function(){
    var f=(root.querySelector('[data-a=fmt]')||{}).value||'png';
    b.disabled=true;say('⏳ بصدّر التصميم... ممكن ياخد شوية');
    try{var r=await exportDesign(c.design_id,f,c.title);say('✅ اتنزّل واتحفظ في المحادثة ('+(r.size/1048576).toFixed(2)+' ميجا)')}
    catch(x){say('⚠️ '+(x.message||x))}
    b.disabled=false;
  };
}
function showCard(c){
  var host=null;
  try{host=appendAIBubble('action','')}catch(e){}
  if(host&&host.nodeType===1){host.innerHTML=cardHtml(c);wireCard(host,c);return 'chat'}
  // لو الشات مش بيدّينا عنصر نحط فيه: كارت عايم
  var o=document.createElement('div');
  o.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483200;display:flex;justify-content:center;padding:10px calc(10px + env(safe-area-inset-bottom,0px)) 10px';
  o.innerHTML='<div style="background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.5);position:relative">'+cardHtml(c)+'<button data-a="x" style="position:absolute;top:6px;left:8px;background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer">✕</button></div>';
  document.body.appendChild(o);wireCard(o,c);
  o.querySelector('[data-a=x]').onclick=function(){o.remove()};
  return 'overlay';
}

reg('mcp_show_card','🎨 بعرض التصميم',
 'اعرض للمستخدم كارت التصميم في الشات (صورة مصغّرة + زرار "تعديل في كانفا" + زرار تنزيل PNG/JPG/PDF). نادي الأداة دي بعد ما التصميم يتعمل أو المستخدم يختار مرشح، وهات القيم من نتيجة كانفا الحقيقية (متألفش روابط). design_id بيبدأ بـ D وطوله 11 حرف، ولو مش معاك مرّر edit_url وهنستخرجه منه.',
 {title:d(S,'عنوان التصميم'),design_id:d(S,'معرّف التصميم (بيبدأ بـ D) لو معاك'),edit_url:d(S,'رابط التعديل في كانفا (https)'),thumbnail_url:d(S,'رابط الصورة المصغّرة (https) اختياري')},
 [],
 async function(a){
  try{
    var c={title:String(a.title||'').slice(0,120),edit_url:safeUrl(a.edit_url),thumbnail_url:safeUrl(a.thumbnail_url),design_id:/^D[A-Za-z0-9_-]{10}$/.test(String(a.design_id||''))?a.design_id:designIdOf(a.edit_url)};
    if(!c.edit_url&&!c.design_id)return er('محتاج edit_url أو design_id على الأقل. لو لسه ما اخترتش مرشح وعملت التصميم، اعمل ده الأول.');
    var where=showCard(c);
    return ok({message:'عرضت الكارت'+(where==='overlay'?' (عايم تحت الشاشة)':'')+'. قول للمستخدم يضغط "تعديل في كانفا" يعدّل، أو "تنزيل" ينزّل الملف.',design_id:c.design_id||null});
  }catch(e){return er(e.message||String(e))}
 });

}catch(e){try{console.warn('mcptools.js:',e)}catch(_){}}
})();
