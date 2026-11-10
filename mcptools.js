(function(){
try{
// =====================================================================
// mcptools.js — موصّلات MCP جوه "سأنجزها": المستخدم يربط حسابه بمواقع (كانفا أولًا) والمدرب يستخدمها.
// بيكلّم بوابة الـ Worker (mcp-gateway.js) بس. مفيش أسرار هنا: الأسرار والتوكنز عند الـ Worker.
// بيتحط في index.html بعد videotools.js:  <script src="mcptools.js"></script>   ولإلغائه: شيل السطر بس.
// لو أي حاجة ناقصة (APP_ACTIONS / fbAuth) بيسكت ومبيكسرش حاجة.
// v12: دوس على صورة الكارت تتفتح للتعليم (علامات مرقمة + ملاحظات) وتتبعت للمدرب.
// v11: الكروت (صور/تصميم/نسخ) بقت صف عادي في الشات مش جوه فقاعة الأسهم، عرض الكارت على حسب عرض الصورة، بتتحفظ مع المحادثة وترجع بأزرارها (حتى لو رابط الصورة انتهى)، ونسبة الأبعاد للمولّد العادي.
// v10: إعادة محاولة تلقائية عند 409، المدرب يعرف إن كانفا متوصّلة من غير ما يسأل (أسرع وطلبات أقل)، ودمج/تعديل صور المستخدم المرفوعة في canva_image.
// v9: خطوة 1 — تظبيط شكل الكروت: عرض ثابت، الصورة جوه الكارت، وأزرار مش بتتكسر (تنزيل كانت بتتكتب حرف حرف).
// v8: أداة canva_image (خطوة واحدة) + تعليمة الجدول.
// v7: عرض صور كانفا تلقائيًا في الشات (تنزيل + نسخ رابط)، تنزيل عن طريق البوابة، وكاش لقايمة الأدوات.
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

// أشكال الكروت (موحّدة): عرض ثابت عشان الكارت ميتكمّشش جوه فقاعة الشات، والأزرار ميتكسرش كلامها
var CARDW='direction:rtl;text-align:right;box-sizing:border-box;display:block;width:fit-content;min-width:230px;max-width:min(440px,calc(100vw - 64px));border:1px solid rgba(128,140,160,.35);border-radius:16px;padding:10px;background:rgba(128,128,128,.08)';
var BTN='flex:1 1 0;min-width:96px;padding:10px 12px;cursor:pointer;white-space:nowrap;text-align:center;border-radius:12px;font-family:inherit';
var IMGS='width:auto;max-width:100%;height:auto;max-height:60vh;object-fit:contain;margin-inline:auto;border-radius:12px;display:block;margin-bottom:8px;background:rgba(128,128,128,.15)';

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
// ---------- إعدادات المدرب: بتتفتح من ⚙️ في القايمة الجانبية بتاعة المدرب ----------
// كل إعداد هنا مربوط بسلوك حقيقي: الاسم والصورة والأسلوب والتعليمات بتتحفظ على الجهاز ده، والتعليمات بتتضاف لتعليمات المدرب في كل رد.
var PK='mcp_ai_prefs',AVK='mcp_ai_avatar';
function getPrefs(){
  var d={len:'balanced',tone:'default',about:'',custom:''};
  try{return Object.assign(d,JSON.parse(localStorage.getItem(PK)||'{}'))}catch(e){return d}
}
function setPrefs(p){try{localStorage.setItem(PK,JSON.stringify(p))}catch(e){}}
function prefsText(){
  var p=getPrefs(),t='';
  if(p.about)t+=' معلومات المستخدم عن نفسه (استخدمها لما تفيد): '+p.about+'.';
  if(p.len==='short')t+=' أسلوب الرد المطلوب: مختصر جدًا ومباشر.';
  else if(p.len==='long')t+=' أسلوب الرد المطلوب: مفصّل وشامل، وده يتغلّب على أي تعليمات تانية بتطلب الاختصار.';
  if(p.tone==='formal')t+=' النبرة المطلوبة: رسمية ومهذّبة.';
  else if(p.tone==='fun')t+=' النبرة المطلوبة: مرحة وخفيفة.';
  try{
    if(canvaCache&&canvaCache.on&&Date.now()-canvaCache.at<900000)t+=' كانفا متوصّلة عند المستخدم دلوقتي (مؤكد). لأي طلب صورة أو رسمة نادي canva_image فورًا، ولأي تصميم فيه نص (بوستر، غلاف، بانر، فلاير، بوست، كارت) نادي canva_design فورًا، من غير mcp_status ولا mcp_list_tools ولا mcp_call ولا أسئلة. الأداتين بيعرضوا النتيجة للمستخدم لوحدهم، فبعدهم رد بجملة واحدة بس.';
  }catch(e){}
  t+=' الجداول: لما المستخدم يطلب جدول أو مقارنة عادي اكتبه جدول Markdown في الرد نفسه مباشرة من غير أي أداة. ملف إكسل أو CSV بس لو المستخدم طلب ملف أو تنزيل صراحة.';
  return ' ——— إعدادات المستخدم الشخصية:'+t;
}
['buildAISystemInstructionText','buildAIFastChatSystemInstructionText'].forEach(function(n){
  try{
    var f=window[n];
    if(typeof f==='function'&&!f.__mcp){var w=function(){return String(f.apply(this,arguments))+prefsText()};w.__mcp=1;window[n]=w}
  }catch(e){}
});
function getThink(){try{return (typeof aiThinkingPreference!=='undefined'&&aiThinkingPreference)||localStorage.getItem('app_ai_thinking_preference')||'auto'}catch(e){return 'auto'}}
function setThink(v){
  try{localStorage.setItem('app_ai_thinking_preference',v)}catch(e){}
  try{aiThinkingPreference=v}catch(e){}
  try{if(typeof updateAIThinkingButton==='function')updateAIThinkingButton()}catch(e){}
}
function getAv(){try{return localStorage.getItem(AVK)||''}catch(e){return ''}}
function avatarHtml(sz){
  var a=getAv();
  return a?'<img src="'+esc(a)+'" alt="" style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;object-fit:cover;display:block">'
    :'<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:rgba(128,140,160,.3);display:flex;align-items:center;justify-content:center;font-size:'+Math.round(sz*.5)+'px">👤</div>';
}
function applyDrawerAvatar(){
  try{
    var dr=document.getElementById('amDrawer');if(!dr)return;
    var h=dr.querySelector('h2');if(!h||!h.parentNode)return;
    var ex=dr.querySelector('#mcpAv'),a=getAv();
    if(!a){if(ex)ex.remove();return}
    if(!ex){ex=document.createElement('img');ex.id='mcpAv';ex.alt='';ex.style.cssText='width:46px;height:46px;border-radius:50%;object-fit:cover;display:block;margin:0 0 8px';h.parentNode.insertBefore(ex,h)}
    ex.src=a;
  }catch(e){}
}
function pickAvatar(file,done){
  try{
    var fr=new FileReader();
    fr.onload=function(){
      var im=new Image();
      im.onload=function(){
        try{
          var S=160,c=document.createElement('canvas');c.width=c.height=S;
          var m=Math.min(im.width,im.height);
          c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,S,S);
          localStorage.setItem(AVK,c.toDataURL('image/jpeg',.85));done(true);
        }catch(e){done(false)}
      };
      im.onerror=function(){done(false)};
      im.src=fr.result;
    };
    fr.onerror=function(){done(false)};
    fr.readAsDataURL(file);
  }catch(e){done(false)}
}
var AIS=null;
function customLS(){try{return localStorage.getItem('app_ai_custom')||''}catch(e){return ''}}
function aiName(){try{return typeof getAIUserName==='function'?getAIUserName():(localStorage.getItem('app_ai_user_name')||'')}catch(e){return ''}}
function closeAIS(){if(AIS)AIS.style.display='none'}
function sel(id,opts,val){
  return '<select data-a="'+id+'" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px">'+
    opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>';
}
var SEC='padding:12px 0;border-top:1px solid rgba(128,140,160,.25)',LBL='font-size:.78rem;opacity:.75;margin-bottom:6px;display:block',INP='width:100%;box-sizing:border-box;padding:10px;border-radius:10px';
function renderAIS(){
  var o=AIS,p=getPrefs();
  o.firstChild.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><b style="flex:1;font-size:1.05rem">⚙️ إعدادات المدرب</b><button data-a="x" style="background:none;border:0;color:inherit;font-size:1.3rem;cursor:pointer" aria-label="إغلاق">✕</button></div>'+
    '<div style="'+SEC+'"><span style="'+LBL+'">👤 اسمك وصورتك</span>'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div data-a="av">'+avatarHtml(56)+'</div>'+
      '<div style="flex:1;display:flex;gap:6px;flex-wrap:wrap"><button data-a="pic" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">📷 اختار صورة</button>'+(getAv()?'<button data-a="rmpic" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">🗑️ شيل</button>':'')+'</div>'+
      '<input data-a="file" type="file" accept="image/*" style="display:none"></div>'+
      '<div style="display:flex;gap:6px"><input data-a="name" maxlength="40" placeholder="اسمك (المدرب بينادّيك بيه)" style="'+INP+';flex:1;min-width:0"><button data-a="savename" class="btn" style="padding:8px 14px;cursor:pointer">حفظ</button></div>'+
      '<div style="font-size:.68rem;opacity:.6;margin-top:5px">الصورة بتتحفظ على الجهاز ده بس.</div></div>'+
    '<div style="'+SEC+'"><span style="'+LBL+'">🗣️ أسلوب الرد</span>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
      '<div><span style="'+LBL+'">طول الرد</span>'+sel('len',[['short','مختصر'],['balanced','متوازن'],['long','مفصّل']],p.len)+'</div>'+
      '<div><span style="'+LBL+'">النبرة</span>'+sel('tone',[['default','عادية'],['formal','رسمية'],['fun','مرحة']],p.tone)+'</div></div></div>'+
    '<div style="'+SEC+'"><span style="'+LBL+'">🧠 مستوى التفكير</span>'+sel('think',[['auto','تلقائي'],['on','عميق (أبطأ وأدق)'],['off','متوقف (أسرع)']],getThink())+'</div>'+
    '<div style="'+SEC+'"><span style="'+LBL+'">📝 تعريف بنفسك (اختياري)</span>'+
      '<textarea data-a="about" rows="2" maxlength="500" placeholder="مثلًا: أنا طالب ثانوية، وبذاكر بالليل" style="'+INP+'">'+esc(p.about)+'</textarea>'+
      '<span style="'+LBL+';margin-top:8px">تعليمات خاصة للمدرب (نفس زرار "تخصيص")</span>'+
      '<textarea data-a="custom" rows="3" maxlength="2000" placeholder="مثلًا: ناديني بلقب كذا، ولما أطلب شرح اديني مثال دايمًا" style="'+INP+'">'+esc(customLS())+'</textarea>'+
      '<button data-a="savetxt" class="btn" style="margin-top:8px;padding:8px 14px;cursor:pointer">حفظ</button></div>'+
    '<div style="'+SEC+'"><button data-a="mcp" class="btn btn-secondary" style="width:100%;padding:12px;cursor:pointer;text-align:right">🔌 ربط المواقع (كانفا وغيره)</button>'+
    '<button data-a="app" class="btn btn-secondary" style="width:100%;padding:12px;margin-top:8px;cursor:pointer;text-align:right">🔑 المفتاح وإعدادات التطبيق العامة</button></div>';
  var q=function(x){return o.querySelector('[data-a='+x+']')};
  q('x').onclick=closeAIS;
  q('name').value=aiName();
  q('savename').onclick=function(){
    var v=(q('name').value||'').trim();
    if(!v){snack('اكتب اسمك الأول 🙂');return}
    try{localStorage.setItem('app_ai_user_name',v);snack('اتحفظ الاسم ✅');try{if(typeof renderAIChatEmptyState==='function')renderAIChatEmptyState(false)}catch(e){}}catch(e){snack('معرفتش أحفظ الاسم')}
  };
  q('pic').onclick=function(){q('file').click()};
  q('file').onchange=function(){
    var f=this.files&&this.files[0];if(!f)return;
    pickAvatar(f,function(ok){if(ok){applyAvatars();renderAIS();snack('اتحفظت الصورة ✅')}else snack('معرفتش أحفظ الصورة دي')});
  };
  if(q('rmpic'))q('rmpic').onclick=function(){try{localStorage.removeItem(AVK)}catch(e){}applyAvatars();renderAIS()};
  ['len','tone'].forEach(function(k){q(k).onchange=function(){var np=getPrefs();np[k]=this.value;setPrefs(np);snack('اتحفظ ✅')}});
  q('think').onchange=function(){setThink(this.value);snack('اتحفظ ✅')};
  q('savetxt').onclick=function(){var np=getPrefs();np.about=(q('about').value||'').trim();setPrefs(np);try{localStorage.setItem('app_ai_custom',(q('custom').value||'').trim())}catch(e){}snack('اتحفظ ✅')};
  q('mcp').onclick=function(){closeAIS();open()};
  q('app').onclick=function(){closeAIS();try{if(typeof closeSectionOpenSettings==='function')closeSectionOpenSettings()}catch(e){}};
}
function openAISettings(){
  if(!AIS){
    var o=document.createElement('div');
    o.id='mcpAIS';
    o.style.cssText='position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.55);display:none;align-items:flex-end;justify-content:center;direction:rtl';
    o.innerHTML='<div style="width:100%;max-width:560px;max-height:88vh;overflow:auto;background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border-radius:20px 20px 0 0;padding:14px 14px calc(16px + env(safe-area-inset-bottom,0px));font-family:inherit;text-align:right"></div>';
    o.addEventListener('click',function(e){if(e.target===o)closeAIS()});
    document.body.appendChild(o);
    AIS=o;
  }
  renderAIS();
  var dk=false;try{dk=!!(window.__isDesk&&window.__isDesk())}catch(e){}
  AIS.style.alignItems=dk?'center':'flex-end';
  AIS.firstChild.style.borderRadius=dk?'20px':'20px 20px 0 0';
  AIS.style.display='flex';
}
window.openAISettings=openAISettings;
// ⚙️ في قايمة المدرب كانت بتفتح إعدادات التطبيق مباشرة. دلوقتي بتفتح إعدادات المدرب. القايمة بتتبني متأخر فبنراقب.
function hookDrawerGear(){
  try{
    var dr=document.getElementById('amDrawer');
    if(!dr)return false;
    var g=dr.querySelector('.am-av');
    if(!g)return false;
    applyDrawerAvatar();
    if(g.getAttribute('data-mcp')==='1')return true;
    g.setAttribute('data-mcp','1');
    g.addEventListener('click',function(e){
      e.stopPropagation();e.preventDefault();
      var dim=document.getElementById('amDim');if(dim)dim.click();
      openAISettings();
    });
    return true;
  }catch(e){return false}
}
// ---------- الديسكتوب: صف الاسم تحت في الشريط الجانبي (#aiSide .sb-u) ----------
// الصورة أقصى الشمال، بعدها الاسم، و"مدرب الإنتاجية" على اليمين. الضغط على الصف يفتح إعدادات المدرب.
function injectDeskCss(){
  if(document.getElementById('mcpDeskCss'))return;
  var st=document.createElement('style');st.id='mcpDeskCss';
  st.textContent='html.dev-desktop #aiSide .sb-u{direction:ltr;cursor:pointer;border-radius:10px;padding:10px 8px 8px;transition:background .15s}'+
    'html.dev-desktop #aiSide .sb-u:hover{background:rgba(128,140,160,.16)}'+
    'html.dev-desktop #aiSide .sb-u #aiUN{unicode-bidi:plaintext;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
    'html.dev-desktop #aiSide .sb-u small{margin-inline-start:auto;white-space:nowrap}';
  document.head.appendChild(st);
}
function applyDeskAvatar(){
  try{
    var b=document.getElementById('aiUI');if(!b)return;
    var a=getAv();
    if(a){b.style.backgroundImage='url("'+a+'")';b.style.backgroundSize='cover';b.style.backgroundPosition='center';b.style.color='transparent'}
    else{b.style.backgroundImage='';b.style.backgroundSize='';b.style.backgroundPosition='';b.style.color=''}
  }catch(e){}
}
function applyAvatars(){applyDrawerAvatar();applyDeskAvatar()}

// قايمة منبثقة فوق صف الاسم في الديسكتوب (زي Claude)
var DESKM=null;
function closeDeskMenu(){if(DESKM){DESKM.remove();DESKM=null}}
function toggleDeskMenu(u){
  if(DESKM){closeDeskMenu();return}
  var r=u.getBoundingClientRect();
  var m=document.createElement('div');m.id='mcpDeskMenu';
  m.style.cssText='position:fixed;z-index:2147483100;left:'+Math.max(8,r.left)+'px;bottom:'+(window.innerHeight-r.top+6)+'px;width:'+Math.max(230,r.width)+'px;background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border:1px solid rgba(128,140,160,.3);border-radius:14px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.35);direction:rtl;text-align:right;font-family:inherit;font-size:14px';
  var items=[
    ['⚙️','إعدادات المدرب',function(){openAISettings()}],
    ['🔌','ربط المواقع',function(){if(window.openMcpConnectors)window.openMcpConnectors()}],
    ['🔑','المفتاح وإعدادات التطبيق العامة',function(){try{if(typeof closeSectionOpenSettings==='function')closeSectionOpenSettings()}catch(e){}}]
  ];
  items.forEach(function(it){
    var b=document.createElement('div');
    b.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;cursor:pointer';
    b.innerHTML='<span>'+it[0]+'</span><span>'+it[1]+'</span>';
    b.onmouseenter=function(){b.style.background='rgba(128,140,160,.18)'};
    b.onmouseleave=function(){b.style.background=''};
    b.onclick=function(e){e.stopPropagation();closeDeskMenu();it[2]()};
    m.appendChild(b);
  });
  m.addEventListener('click',function(e){e.stopPropagation()});
  document.body.appendChild(m);DESKM=m;
  setTimeout(function(){document.addEventListener('click',closeDeskMenu,{once:true})},0);
}
function hookDeskFooter(){
  try{
    var u=document.querySelector('#aiSide .sb-u');
    if(!u)return false;
    injectDeskCss();
    applyDeskAvatar();
    if(u.getAttribute('data-mcp')!=='1'){
      u.setAttribute('data-mcp','1');u.title='قايمة المدرب';
      u.addEventListener('click',function(e){e.stopPropagation();toggleDeskMenu(u)});
    }
    return true;
  }catch(e){return false}
}
try{
  var gOk=hookDrawerGear(),dOk=hookDeskFooter();
  if(!gOk||!dOk){
    var tmr=null,mo=new MutationObserver(function(){
      if(tmr)return;
      tmr=setTimeout(function(){
        tmr=null;
        if(!gOk)gOk=hookDrawerGear();
        if(!dOk)dOk=hookDeskFooter();
        if(gOk&&dOk)mo.disconnect();
      },300);
    });
    mo.observe(document.body,{childList:true,subtree:true});
  }
}catch(e){}

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
    if(res==='connected'){
      try{
        var pj=JSON.parse(localStorage.getItem('mcp_pending')||'null');
        localStorage.removeItem('mcp_pending');
        if(pj&&(pj.t||pj.n)&&Date.now()-pj.at<1800000)setTimeout(function(){resumeAfterConnect(pj.t,pj.n)},3500);
      }catch(e){}
    }
  }
}catch(e){}

// ---------- أدوات المدرب ----------
reg('mcp_status','🔌 بشوف المواقع المربوطة',
 'يرجّع المواقع اللي المستخدم ممكن يربطها بحسابه (الجاهزة زي كانفا + اللي المستخدم ضافها بنفسه) وهل كل واحد متوصّل. استخدمها قبل أي شغل على موقع، ولما المستخدم يقول عايز يربط موقع: شوف لو الموقع في القايمة دي. لو موجود ومش متوصّل نادي mcp_offer_connect. لو مش موجود قول للمستخدم بوضوح إنه مش موجود عندنا بس يقدر يضيفه، وادوّر بـ web_search على رابط سيرفر MCP الرسمي بتاعه (remote MCP server URL) وقدّمه بـ mcp_suggest_site. متألفش رابط أبدًا: لو ما لقيتش رابط مؤكد من مصدر رسمي قول كده.',
 {},[],
 async function(){
  try{var r=await api('/mcp/providers');return ok({providers:r.providers||[]})}
  catch(e){return er(e.message||String(e))}
 });

reg('mcp_open_connect','🔌 بفتح شاشة الربط',
 'يفتح للمستخدم شاشة ربط المواقع كاملة. الأفضل تستخدم mcp_offer_connect (كارت لموقع واحد) أو mcp_suggest_site (لموقع جديد). المستخدم هو اللي بيدخل بياناته، مش المدرب.',
 {},[],
 async function(){open();return ok({message:'فتحت شاشة الربط. قول للمستخدم يضغط "ربط" جنب الموقع.'})});

var TOOLS_CACHE={};
reg('mcp_list_tools','🔎 بشوف أدوات الموقع',
 'يجيب قايمة الأدوات اللي الموقع المربوط بيقدمها (الاسم والوصف والمدخلات). لازم تناديها قبل mcp_call عشان تعرف أسماء الأدوات ومدخلاتها بالظبط، ومتفترضش أسماء. نادي عليها مرة واحدة بس في الطلب (النتيجة بتتخزّن).',
 {provider:d(S,'معرّف الموقع زي ما بيرجع من mcp_status (مثلًا canva أو u_xxxx للمواقع اللي المستخدم ضافها)')},['provider'],
 async function(a){
  try{
    var pk=String(a.provider||'');
    if(TOOLS_CACHE[pk]&&Date.now()-TOOLS_CACHE[pk].at<600000)return ok({tools:TOOLS_CACHE[pk].tools,cached:true});
    var r=await api('/mcp/tools',{provider:pk});
    TOOLS_CACHE[pk]={at:Date.now(),tools:r.tools||[]};
    return ok({tools:r.tools||[]});
  }catch(e){return er(e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))}
 });

reg('mcp_call','🛠️ بنفّذ على الموقع',
 'ينفّذ أداة على موقع مربوط. tool = اسم الأداة من mcp_list_tools، وarguments_json = المدخلات كنص JSON. لو الأداة بترجّع مرشحات/اختيارات (زي تصاميم كانفا) اعرضها على المستخدم ودَعه يختار، متختارش بدالُه. أي صورة أو رابط تصميم في النتيجة بيتعرض للمستخدم تلقائيًا في الشات (من غير ما تنادي أي أداة عرض). مدخلات الأداة ممكن تكون طويلة وبتأخد وقت، فنفّذ بس لما المستخدم يطلب.',
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
    // عرض الصور/روابط التصميم للمستخدم تلقائيًا في الشات
    try{
      var mm=pickMedia(r);
      if(mm.images.length||mm.links.length){
        mm.title=String(a.intent||'').slice(0,80);
        if(showMedia(mm)){
          out.shown_to_user=true;
          out.note=(out.note?out.note+' ':'')+(mm.images.length
            ?'الصورة اتعرضت للمستخدم تلقائيًا في الشات بزرار تنزيل ونسخ رابط. متنادش mcp_show_card ولا show_copy_card ولا mcp_save_file. لو دي مرشحات اسأله يختار واحد، ولو دي النتيجة النهائية رد بجملة واحدة قصيرة.'
            :'اتعرض للمستخدم كارت فيه رابط كانفا. لو النتيجة مفيهاش رابط صورة مباشر ومعاك design_id، نادي mcp_show_card عشان يظهر تنزيل.');
        }
      }
    }catch(e){}
    return ok(out);
  }catch(e){return er(e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))}
 });

// روابط التصدير عند المواقع (زي كانفا) مؤقتة وبتنتهي بسرعة، فنحفظ الملف في المحادثة فورًا.
// التنزيل بيحاول من المتصفح الأول، ولو CORS منعه بيعدّي على البوابة (بتنزّل الملف من سيرفر كانفا).
reg('mcp_save_file','💾 بحفظ الملف في المحادثة',
 'ينزّل ملف من رابط (مثلًا رابط تصدير تصميم من كانفا) ويحفظه في المحادثة عشان المستخدم يحمّله. الروابط دي بتنتهي بسرعة فنادي الأداة دي مباشرة بعد ما تاخد الرابط.',
 {url:d(S,'رابط https للملف'),name:d(S,'اسم الملف بدون امتداد'),ext:d(S,'الامتداد: png | jpg | pdf | mp4 ... الافتراضي png')},['url'],
 async function(a){
  try{
    var u=String(a.url||'');
    if(!/^https:\/\//i.test(u))return er('الرابط لازم يبدأ بـ https.');
    var buf=null,ctype='';
    try{
      var r=await fetch(u);
      if(!r.ok)return er('الرابط رجّع '+r.status+(r.status===403||r.status===410?' (غالبًا انتهت صلاحيته، اطلب التصدير تاني)':''));
      buf=new Uint8Array(await r.arrayBuffer());
      ctype=(r.headers.get('content-type')||'').split(';')[0];
    }catch(e){
      try{var f=await apiBin('/mcp/fetch',{url:u});buf=f.buf;ctype=f.type||''}
      catch(e2){return er('معرفتش أنزّل الملف: '+(e2.message||e2)+'. افتح الرابط يدويًا وحمّله بنفسك.')}
    }
    if(buf.length>25*1048576)return er('الملف أكبر من 25 ميجا.');
    var ext=String(a.ext||'png').replace(/[^a-z0-9]/gi,'').toLowerCase()||'png';
    var mime=ctype||(ext==='pdf'?'application/pdf':ext==='png'?'image/png':'application/octet-stream');
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
  try{(Array.isArray(r.content)?r.content:[]).forEach(function(c){if(!c)return;if(c.uri)t+='\n'+c.uri;if(c.resource&&c.resource.uri)t+='\n'+c.resource.uri})}catch(e){}
  try{if(r.structuredContent)t+='\n'+JSON.stringify(r.structuredContent)}catch(e){}
  return t;
}
function designIdOf(s){var m=String(s||'').match(/\bD[A-Za-z0-9_-]{10}\b/);return m?m[0]:''}
function saveBlob(buf,mime,fname){
  try{
    var u=URL.createObjectURL(new Blob([buf],{type:mime})),l=document.createElement('a');
    l.href=u;l.download=fname;document.body.appendChild(l);l.click();l.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},60000);
  }catch(e){}
}
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
  saveBlob(f.buf,mime,nm+'.'+type);
  return {file:file,size:f.buf.length};
}
function safeUrl(u){u=String(u||'');return /^https:\/\//i.test(u)?u:''}
function cardHtml(c){
  var th=(c._th!==undefined)?c._th:!!safeUrl(c.thumbnail_url);
  return '<div style="'+CARDW+'">'+
    (th?'<img data-fit="1" data-s="0" alt="" referrerpolicy="no-referrer" style="'+IMGS+'">':'')+
    '<div style="font-weight:800;margin-bottom:8px;line-height:1.6">🎨 '+esc(c.title||'تصميم كانفا')+'</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
    (c.design_id?'<div style="display:flex;gap:6px;align-items:stretch"><select data-a="fmt" style="flex:0 0 auto;padding:8px;border-radius:12px"><option>png</option><option>jpg</option><option>pdf</option></select><button data-a="dl" class="btn" style="'+BTN+'">⬇️ تنزيل</button></div>':'')+
    (safeUrl(c.edit_url)?'<button data-a="edit" class="btn btn-secondary" style="'+BTN+';width:100%;flex:none">✏️ تعديل في كانفا</button>':'')+
    '</div><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em;line-height:1.6"></div></div>';
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
  var host=mountCard(cardHtml(c));
  prepImgs(host,[safeUrl(c.thumbnail_url)]);
  wireCard(host,c);
  saveCardRec(c);
  return host.className==='mcp-card-row'?'chat':'overlay';
}

reg('mcp_show_card','🎨 بعرض التصميم',
 'اعرض للمستخدم كارت التصميم في الشات (صورة مصغّرة + زرار "تعديل في كانفا" + زرار تنزيل PNG/JPG/PDF). نادي الأداة دي بعد ما التصميم يتعمل أو المستخدم يختار مرشح، وهات القيم من نتيجة كانفا الحقيقية (متألفش روابط). design_id بيبدأ بـ D وطوله 11 حرف، ولو مش معاك مرّر edit_url وهنستخرجه منه. ملحوظة: لو mcp_call رجّعت shared_to_user/shown_to_user=true يبقى الصورة اتعرضت خلاص ومتناديش الأداة دي.',
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


// ---------- عرض صور كانفا تلقائيًا في الشات (بعد أي mcp_call) ----------
// بنقرا الروابط من نتيجة الأداة: الصور بتظهر في الشات بزرار تنزيل ونسخ رابط، وروابط التصميم بزرار فتح.
// الصور بتظهر بـ <img> (مفيش CORS)، والتنزيل بيعدّي على البوابة.
var NOTIMG=/\.(pdf|mp4|mov|webm|pptx?|zip|docx?)(\?|#|$)/i;
var ISIMG=/\.(png|jpe?g|webp|gif)(\?|#|$)/i;
var IMGHOST=/(thumbnail|export-download|media-public|document-export|\/media\/|media\.canva\.com)/i;
function pickMedia(res){
  var t=textOf(res),seen={},images=[],links=[];
  (t.match(URLRX)||[]).forEach(function(u){
    u=u.replace(/[.,;:]+$/,'');
    if(seen[u])return;
    seen[u]=1;
    if(/canva\.com\/(design\/|d\/)/i.test(u)&&!ISIMG.test(u)){links.push(u);return}
    if(NOTIMG.test(u))return;
    if(ISIMG.test(u)||IMGHOST.test(u))images.push(u);
  });
  try{(Array.isArray((res||{}).content)?res.content:[]).forEach(function(c){
    if(!c)return;
    if(c.type==='image'&&c.data&&/^image\//.test(c.mimeType||''))images.push('data:'+c.mimeType+';base64,'+c.data);
    var ru=c.uri||(c.resource&&c.resource.uri)||c.url,rm=c.mimeType||(c.resource&&c.resource.mimeType)||'';
    if(ru&&/^https:\/\//i.test(ru)&&(/^image\//.test(rm)||c.type==='image')&&images.indexOf(ru)<0)images.push(ru);
    var rb=c.resource&&c.resource.blob;
    if(rb&&/^image\//.test(rm))images.push('data:'+rm+';base64,'+rb);
  })}catch(e){}
  return {images:images.slice(0,6),links:links.slice(0,4),title:''};
}
async function downloadUrl(u,nm){
  var buf=null,ct='';
  if(/^data:/i.test(u)){
    var dm=u.match(/^data:([^;,]+);base64,(.*)$/i);
    if(!dm)throw new Error('الصورة مش مقروءة');
    var bin=atob(dm[2]);buf=new Uint8Array(bin.length);for(var q=0;q<bin.length;q++)buf[q]=bin.charCodeAt(q);ct=dm[1];
  }else try{var f=await apiBin('/mcp/fetch',{url:u});buf=f.buf;ct=f.type||''}
  catch(e1){
    try{var r=await fetch(u);if(!r.ok)throw new Error('رجّع '+r.status);buf=new Uint8Array(await r.arrayBuffer());ct=(r.headers.get('content-type')||'').split(';')[0]}
    catch(e2){window.open(u,'_blank','noopener');throw new Error('فتحتلك الصورة في تبويب جديد، حمّلها من هناك')}
  }
  if(/text\/html/i.test(ct))throw new Error('الرابط ده صفحة مش صورة مباشرة. افتحها من "فتح في كانفا" وحمّل من هناك');
  if(ct.indexOf('image/')!==0)ct=ct||'image/png';
  var ext=(ct.split('/')[1]||'png').replace('jpeg','jpg').replace(/[^a-z0-9]/gi,'')||'png';
  var base=String(nm||'تصميم').replace(/\s+/g,' ').trim()||'تصميم';
  try{await aiAddOutputFile(aiBase(base,'',ext),ct,buf)}catch(e3){}
  saveBlob(buf,ct,base+'.'+ext);
  return buf.length;
}
function mediaHtml(mm){
  var h='<div style="'+CARDW+'">';
  if(mm.title)h+='<div style="font-weight:800;margin-bottom:8px;line-height:1.6">🎨 '+esc(mm.title)+'</div>';
  mm.images.forEach(function(u,i){
    h+='<div style="margin-bottom:10px"><img data-fit="1" data-s="'+i+'" alt="" referrerpolicy="no-referrer" style="'+IMGS+';min-height:60px;margin-bottom:8px">'+
      '<div style="display:flex;gap:6px">'+
      '<button data-m="dl" data-i="'+i+'" class="btn" style="'+BTN+'">⬇️ تنزيل</button>'+
      '<button data-m="cp" data-i="'+i+'" class="btn btn-secondary" style="'+BTN+'">🔗 نسخ الرابط</button></div>'+(mm.edit&&i===0?'<button data-m="ed2" class="btn btn-secondary" style="'+BTN+';width:100%;flex:none;margin-top:6px">✏️ تعديل في كانفا</button>':'')+'</div>';
  });
  if(mm.links.length){
    h+='<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">';
    mm.links.forEach(function(u,i){h+='<button data-m="ed" data-i="'+i+'" class="btn btn-secondary" style="'+BTN+';width:100%;flex:none">'+(mm.linkLabel||'✏️ تعديل في كانفا')+(mm.links.length>1?' '+(i+1):'')+'</button>'});
    h+='</div>';
  }
  h+='<div data-m="msg" style="font-size:.75rem;opacity:.8;margin-top:4px;min-height:1em;line-height:1.6"></div>';
  if(mm.diag)h+='<div style="font-size:.62rem;opacity:.5;margin-top:4px;direction:ltr;text-align:left;word-break:break-all">'+esc(mm.diag)+'</div>';
  h+='</div>';
  return h;
}
function wireMedia(root,mm){
  var msg=root.querySelector('[data-m=msg]'),say=function(t){if(msg)msg.textContent=t};
  // دوس على الصورة: تتفتح للتكبير والتعليم (علامات مرقمة + ملاحظات) وتتبعت للمدرب
  Array.prototype.forEach.call(root.querySelectorAll('img[data-fit]'),function(im){
    im.style.cursor='zoom-in';
    im.onclick=async function(){
      var u=mm.images[+im.getAttribute('data-s')];
      try{
        if(!/^data:/i.test(u)){say('⏳ بجهّز الصورة للتعليم...');u=await fetchDataUrl(u);say('')}
        if(!u||typeof openImageMarkupViewer!=='function')throw new Error('x');
        openImageMarkupViewer(u);
      }catch(e){say('⚠️ معرفتش أفتح الصورة للتعليم. نزّلها وارفعها من زرار +')}
    };
  });
  Array.prototype.forEach.call(root.querySelectorAll('button[data-m=dl]'),function(b){
    b.onclick=async function(){
      var u=mm.images[+b.getAttribute('data-i')];
      b.disabled=true;say('⏳ بنزّل الصورة...');
      try{var n=await downloadUrl(u,mm.title);say('✅ اتنزّلت واتحفظت في المحادثة ('+(n/1048576).toFixed(2)+' ميجا)')}
      catch(x){say('⚠️ '+(x.message||x))}
      b.disabled=false;
    };
  });
  Array.prototype.forEach.call(root.querySelectorAll('button[data-m=cp]'),function(b){
    b.onclick=async function(){
      var ci=+b.getAttribute('data-i');
      var cu=(mm.orig&&mm.orig[ci])||mm.images[ci];
      var okc=/^data:/i.test(cu)?false:await copyText(cu);
      var old=b.textContent;b.textContent=okc?'✅ اتنسخ':'⚠️ مانفعش';
      setTimeout(function(){b.textContent=old},1500);
    };
  });
  Array.prototype.forEach.call(root.querySelectorAll('button[data-m=ed2]'),function(b){
    b.onclick=async function(){
      var img=(mm.orig&&mm.orig[0])||mm.images[0],fb=(mm.links&&mm.links[0])||img;
      var w=null;try{w=window.open('about:blank','_blank')}catch(e){}
      var go=function(u){if(w&&!w.closed){try{w.location.href=u;return}catch(e){}}window.open(u,'_blank','noopener')};
      b.disabled=true;say('⏳ بجهّز الصورة للتعديل في كانفا...');
      try{
        var r=await canvaTool('import-design-from-url',{url:img,name:String(mm.title||'صورة').slice(0,60)},'فتح الصورة للتعديل');
        var t=textOf(r);
        if(r.isError)throw new Error(t.slice(0,200)||'كانفا رجّعت خطأ');
        var m=t.match(/https:\/\/www\.canva\.com\/design\/[A-Za-z0-9_-]+[^\s"'<>\\)]*/),id=designIdOf(t);
        var u=m?m[0].replace(/[.,;]+$/,''):(id?'https://www.canva.com/design/'+id+'/edit':'');
        if(!u)throw new Error('معرفتش ألاقي رابط التصميم');
        go(u);say('✅ اتفتحت في كانفا للتعديل');
      }catch(x){
        go(fb);say('⚠️ معرفتش أفتحها في المحرر ('+(x.message||x)+')، فتحت صفحة الصورة في كانفا');
      }
      b.disabled=false;
    };
  });
  Array.prototype.forEach.call(root.querySelectorAll('button[data-m=ed]'),function(b){
    b.onclick=function(){window.open(mm.links[+b.getAttribute('data-i')],'_blank','noopener')};
  });
}
function showMedia(mm){
  try{
    var host=mountCard(mediaHtml(mm));
    prepImgs(host,mm.images);
    wireMedia(host,mm);
    saveMediaRec(mm);
    return true;
  }catch(e){return false}
}


// ---------- طلب صورة: نعرض كانفا (جودة أحسن) بدل المولّد العادي ----------
// لو كانفا مش متوصّلة: كارت فيه "اربط كانفا" و"كمّل بالمولّد العادي". بعد الربط الطلب بيتكمّل لوحده.
// لو متوصّلة: بنقول للمدرب يستخدم كانفا. لو كانفا فشلت، generate_image العادي بيشتغل تاني.
var canvaCache={at:0,on:false},hintedAt=0,skipUntil=0;
function declined(){try{return sessionStorage.getItem('mcp_decl')==='1'}catch(e){return false}}
async function canvaOn(){
  if(Date.now()-canvaCache.at<30000)return canvaCache.on;
  var r=await api('/mcp/providers');
  var c=(r.providers||[]).filter(function(p){return p.id==='canva'})[0];
  canvaCache={at:Date.now(),on:!!(c&&c.connected)};
  return canvaCache.on;
}
// تسخين: نعرف من الأول إن كانفا متوصّلة عشان المدرب ميضيّعش طلب يسأل
function warmCanva(){try{if(gwReady()&&typeof fbAuth!=='undefined'&&fbAuth&&fbAuth.currentUser)canvaOn().catch(function(){})}catch(e){}}
setTimeout(warmCanva,6000);setTimeout(warmCanva,20000);setInterval(warmCanva,600000);
function lastUserText(){
  try{
    for(var i=aiChatHistory.length-1;i>=0;i--){
      var m=aiChatHistory[i];
      if(m&&m.role==='user'){
        var t=(m.parts||[]).filter(function(p){return p&&p.text}).map(function(p){return p.text}).join(' ');
        if(t)return t.slice(0,500);
      }
    }
  }catch(e){}
  return '';
}
async function connectProvider(pid,pendingText,name){
  try{localStorage.setItem('mcp_pending',JSON.stringify({t:pendingText||'',n:name||'',at:Date.now()}))}catch(e){}
  var r=await api('/mcp/connect',{provider:pid,returnTo:location.origin+location.pathname});
  location.href=r.url;
}
function connectCanva(pendingText){return connectProvider('canva',pendingText,'كانفا')}
function resumeAfterConnect(t,n){
  try{
    if(typeof openAIAssistantEntry==='function')openAIAssistantEntry();
    var n=0,iv=setInterval(function(){
      var inp=document.getElementById('aiChatInput');
      var busy=(typeof aiRequestInProgress!=='undefined'&&aiRequestInProgress);
      if(inp&&typeof sendAIChatMessage==='function'&&!busy){
        clearInterval(iv);
        inp.value=(n&&n!=='كانفا')?('اتربط '+n+'. '+(t?('كمّل طلبي: '+t):'اتأكد من mcp_status إنه متوصّل وقولي.')):('كانفا اتربطت. كمّل طلبي باستخدام كانفا: '+(t||''));
        try{if(typeof updateAIChatInputRowState==='function')updateAIChatInputRowState()}catch(e){}
        sendAIChatMessage();
      }else if(++n>20)clearInterval(iv);
    },500);
  }catch(e){}
}
function offerHtml(){
  return '<div style="'+CARDW+';padding:12px;width:min(340px,calc(100vw - 64px))">'+
    '<div style="font-weight:800;margin-bottom:6px">🎨 عايز جودة أحسن؟</div>'+
    '<div style="font-size:.82rem;opacity:.85;line-height:1.7;margin-bottom:10px">كانفا بتطلّع تصاميم وصور بجودة أعلى من المولّد العادي. اربط حسابك مرة واحدة وأكمّل طلبك عليها على طول.</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '<button data-a="go" class="btn" style="'+BTN+'">🎨 اربط كانفا</button>'+
    '<button data-a="no" class="btn btn-secondary" style="'+BTN+'">كمّل بالمولّد العادي</button>'+
    '</div><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em"></div></div>';
}
function showOffer(args,origGen){
  var host=mountCard(offerHtml());
  if(!(host&&host.nodeType===1))return false;
  var msg=host.querySelector('[data-a=msg]'),say=function(t){if(msg)msg.textContent=t};
  var pend=lastUserText()||String(args.prompt||'');
  var go=host.querySelector('[data-a=go]'),no=host.querySelector('[data-a=no]');
  go.onclick=async function(){
    go.disabled=no.disabled=true;say('⏳ بفتحلك تسجيل الدخول في كانفا...');
    try{await connectCanva(pend)}catch(e){go.disabled=no.disabled=false;say('⚠️ '+(e.message||e))}
  };
  no.onclick=async function(){
    go.disabled=no.disabled=true;say('⏳ بولّد الصورة...');
    try{sessionStorage.setItem('mcp_decl','1')}catch(e){}
    skipUntil=Date.now()+600000;
    try{await origGen(args);say('')}catch(e){say('⚠️ '+(e.message||e))}
  };
  return true;
}
(function(){
  var g=AA.generate_image,orig=g&&g.handler;
  if(!orig)return;
  g.handler=async function(args){
    args=args||{};
    try{if(!args.aspect){var ga=guessAspect(lastUserText())||guessAspect(args.prompt);if(ga)args.aspect=ga}}catch(e){}
    try{
      if(args.saveToNote===true||Date.now()<skipUntil||declined()||!gwReady())return orig(args);
      var a=(typeof fbAuth!=='undefined')?fbAuth:null;
      if(!a||!a.currentUser)return orig(args);
      var on=await canvaOn();
      if(on){
        try{
          var rr=await AA.canva_image.handler({prompt:String(args.prompt||lastUserText()||''),aspect:String(args.aspect||args.aspectRatio||'')});
          if(rr&&rr.status==='ok')return rr;
        }catch(e){}
        return orig(args);
      }
      if(showOffer(args,orig))return ok({message:'عرضت للمستخدم كارت فيه اختيارين: يربط كانفا لجودة أحسن، أو يكمّل بالمولّد العادي. استنى اختياره، ولا تكرر الطلب ولا تقول إن الصورة اتعملت.'});
    }catch(e){}
    return orig(args);
  };
})();


// ---------- كروت عامة: ربط أي موقع + اقتراح موقع جديد + كارت نسخ ----------
// الكارت بقى صف عادي في الشات (زي رد المدرب) مش جوه فقاعة "الأسهم"، وبيتحفظ مع المحادثة (aiRecordCard) ويرجع بعد القفل.
function chatRow(){
  try{
    var box=document.getElementById('aiChatMessages');
    if(!box)return null;
    var emp=document.getElementById('aiChatEmptyState');if(emp)emp.style.display='none';
    var row=document.createElement('div');
    row.className='mcp-card-row';
    row.style.cssText='align-self:flex-start;max-width:100%;min-width:0;flex-shrink:0;direction:rtl;text-align:right';
    if(typeof appendToAIMessages==='function')appendToAIMessages(row);else box.appendChild(row);
    return row;
  }catch(e){return null}
}
function scrollChat(){try{var b=document.getElementById('aiChatMessages');if(b)b.scrollTop=b.scrollHeight}catch(e){}}
function rec(kind,data){try{if(typeof aiRecordCard==='function')aiRecordCard(kind,data)}catch(e){}}
// عرض الكارت على حسب عرض الصورة: طولية تطلع طولية وعرضية عرضية (أقصى عرض 440)
function fitImg(im){
  try{
    var nw=im.naturalWidth,nh=im.naturalHeight;if(!nw||!nh)return;
    var box=document.getElementById('aiChatMessages');
    var maxW=Math.min(440,((box&&box.clientWidth)||window.innerWidth)-48),maxH=Math.min(window.innerHeight*0.6,520);
    var w=Math.max(120,Math.round(Math.min(nw,maxW,maxH*nw/nh)));
    im.style.width=w+'px';im.style.height='auto';im.style.maxHeight='none';
  }catch(e){}
}
function prepImgs(root,srcs){
  Array.prototype.forEach.call(root.querySelectorAll('img[data-fit]'),function(im){
    var u=srcs&&srcs[+im.getAttribute('data-s')];
    im.onload=function(){fitImg(im)};
    im.onerror=function(){
      var p=im.parentNode;if(!p)return;
      var n=document.createElement('div');
      n.style.cssText='font-size:.78rem;opacity:.75;line-height:1.7;padding:14px 8px;text-align:center';
      n.textContent='⚠️ الصورة مش بتتحمّل (رابطها ممكن يكون انتهى)';
      p.replaceChild(n,im);
    };
    if(u)im.src=u;
  });
}
function b64(buf){var s='',k=0x8000;for(var i=0;i<buf.length;i+=k)s+=String.fromCharCode.apply(null,buf.subarray(i,i+k));return btoa(s)}
function hashStr(t){var h=5381;for(var i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36)+t.length.toString(36)}
// نسخة من الصورة في مخزن صور المحادثة (IndexedDB) عشان الكارت يفضل شغال حتى لو رابط كانفا انتهى
async function fetchDataUrl(url){
  try{
    var u=String(url||''),buf,ct='';
    if(/^data:image\//i.test(u))return u;
    try{var f=await apiBin('/mcp/fetch',{url:u});buf=f.buf;ct=f.type||''}
    catch(e1){var r=await fetch(u);if(!r.ok)return '';buf=new Uint8Array(await r.arrayBuffer());ct=(r.headers.get('content-type')||'').split(';')[0]}
    if(ct.indexOf('image/')!==0||!buf||!buf.length||buf.length>8*1048576)return '';
    return 'data:'+ct+';base64,'+b64(buf);
  }catch(e){return ''}
}
async function cacheImage(url){
  try{
    if(typeof saveAIChatImageToDB!=='function')return '';
    var d=await fetchDataUrl(url);if(!d)return '';
    var id='mcpimg_'+hashStr(String(url));
    await saveAIChatImageToDB(d,id);
    return id;
  }catch(e){return ''}
}
function saveMediaRec(mm){
  try{
    var okU=function(u){return /^https:\/\//i.test(u)};
    var d={mm:{title:mm.title||'',images:(mm.images||[]).filter(okU).slice(0,6),links:(mm.links||[]).filter(okU).slice(0,4),linkLabel:mm.linkLabel||'',edit:!!mm.edit},refs:[]};
    if(!d.mm.images.length&&!d.mm.links.length)return;
    rec('mcpm',d);
    (async function(){
      for(var i=0;i<d.mm.images.length;i++)d.refs[i]=await cacheImage(d.mm.images[i]);
      if(d.refs.some(Boolean)&&typeof persistAIChatState==='function')persistAIChatState();
    })().catch(function(){});
  }catch(e){}
}
function saveCardRec(c){
  try{
    var d={c:{title:c.title||'',design_id:c.design_id||'',edit_url:c.edit_url||'',thumbnail_url:c.thumbnail_url||''},ref:''};
    rec('mcpc',d);
    if(d.c.thumbnail_url)cacheImage(d.c.thumbnail_url).then(function(id){
      if(id){d.ref=id;if(typeof persistAIChatState==='function')persistAIChatState()}
    }).catch(function(){});
  }catch(e){}
}
// رجوع الكروت لما المحادثة تتفتح تاني (index.html بينادي aiExtraReplay[نوع الكارت])
window.aiExtraReplay=window.aiExtraReplay||{};
window.aiExtraReplay.mcpm=function(d){
  var m0=d&&d.mm;if(!m0)return;
  var mm={title:m0.title||'',images:(m0.images||[]).slice(),links:(m0.links||[]).slice(),linkLabel:m0.linkLabel||'',edit:!!m0.edit};
  mm.orig=mm.images.slice();
  var row=chatRow();if(!row)return;
  var refs=d.refs||[];
  Promise.all(mm.images.map(function(u,i){
    return (refs[i]&&typeof loadAIChatImageFromDB==='function')?loadAIChatImageFromDB(refs[i]).catch(function(){return null}):null;
  })).then(function(srcs){
    srcs.forEach(function(x,i){if(x)mm.images[i]=x});
    row.innerHTML=mediaHtml(mm);prepImgs(row,mm.images);wireMedia(row,mm);
  });
};
window.aiExtraReplay.mcpc=function(d){
  var c0=d&&d.c;if(!c0)return;
  var c={title:c0.title,design_id:c0.design_id,edit_url:c0.edit_url,thumbnail_url:c0.thumbnail_url};
  var row=chatRow();if(!row)return;
  var fin=function(src){
    var th=src||safeUrl(c.thumbnail_url);
    c._th=!!th;row.innerHTML=cardHtml(c);prepImgs(row,[th]);wireCard(row,c);
  };
  if(d.ref&&typeof loadAIChatImageFromDB==='function')loadAIChatImageFromDB(d.ref).then(function(x){fin(x)},function(){fin('')});else fin('');
};
window.aiExtraReplay.mcpcopy=function(d){
  if(!d||!Array.isArray(d.items))return;
  var h=mountCard(copyHtml(d.title,d.items));wireCopyCards(h,d.items);
};

function mountCard(html){
  var host=chatRow();
  if(host){host.innerHTML=html;scrollChat();return host}
  var o=document.createElement('div');
  o.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483200;display:flex;justify-content:center;padding:10px calc(10px + env(safe-area-inset-bottom,0px)) 10px';
  o.innerHTML='<div style="background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.5);position:relative;max-width:360px;width:100%">'+html+'<button data-a="x" style="position:absolute;top:6px;left:8px;background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer">✕</button></div>';
  document.body.appendChild(o);
  var x=o.querySelector('[data-a=x]');if(x)x.onclick=function(){o.remove()};
  return o;
}
function copyHtml(title,items){
  var h='<div style="'+CARDW+'">'+(title?'<div style="font-weight:800;margin-bottom:8px;line-height:1.6">'+esc(title)+'</div>':'');
  items.forEach(function(it,i){
    var t=String(it.text),short=t.length<=60&&t.indexOf('\n')<0,ar=/[؀-ۿ]/.test(t);
    var box='flex:1 1 auto;min-width:0;box-sizing:border-box;padding:9px 11px;border-radius:12px;background:rgba(128,128,128,.14);line-height:1.9;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;max-height:240px;overflow:auto;direction:'+(ar?'rtl':'ltr')+';text-align:'+(ar?'right':'left');
    h+='<div style="margin-bottom:8px">'+(it.label?'<div style="font-size:.72rem;opacity:.75;margin-bottom:4px">'+esc(it.label)+'</div>':'')+
      '<div style="display:flex;gap:6px;align-items:'+(short?'center':'stretch')+';'+(short?'':'flex-direction:column')+'">'+
      '<div style="'+box+'">'+esc(t)+'</div>'+
      '<button data-cc="'+i+'" class="btn btn-secondary" style="'+BTN+';'+(short?'flex:0 0 auto;min-width:84px':'width:100%;flex:none')+'">📋 نسخ</button></div></div>';
  });
  return h+'</div>';
}
function wireCopyCards(root,items){
  Array.prototype.forEach.call(root.querySelectorAll('button[data-cc]'),function(b){
    b.onclick=async function(){
      var ok=await copyText(String((items[+b.getAttribute('data-cc')]||{}).text||''));
      var old=b.textContent;b.textContent=ok?'✅ اتنسخ':'⚠️ مانفعش';
      setTimeout(function(){b.textContent=old},1500);
    };
  });
}
function fbCopy(t){try{var ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();var ok=document.execCommand('copy');ta.remove();return !!ok}catch(e){return false}}
function copyText(t){
  try{if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t).then(function(){return true},function(){return fbCopy(t)})}catch(e){}
  return Promise.resolve(fbCopy(t));
}
function wireCopy(root){
  Array.prototype.forEach.call(root.querySelectorAll('button[data-copy]'),function(b){
    b.onclick=async function(){
      var el=root.querySelector('[data-f="'+b.getAttribute('data-copy')+'"]');
      var ok=await copyText(el?el.value:'');
      var old=b.textContent;b.textContent=ok?'✅ اتنسخ':'⚠️ مانفعش';
      setTimeout(function(){b.textContent=old},1500);
    };
  });
}
var BOX='width:100%;box-sizing:border-box;padding:9px;border-radius:10px;direction:ltr;text-align:left';
function field(id,label,val,ro,pw){
  return '<div style="margin-bottom:8px"><div style="font-size:.72rem;opacity:.75;margin-bottom:3px">'+esc(label)+'</div>'+
    '<div style="display:flex;gap:6px;align-items:center"><input data-f="'+id+'"'+(pw?' type="password" autocomplete="off"':'')+' value="'+esc(val||'')+'"'+(ro?' readonly':'')+' style="'+BOX+(/[؀-ۿ]/.test(val||'')?';direction:rtl;text-align:right':'')+';flex:1;min-width:0">'+
    (pw?'':'<button data-copy="'+id+'" class="btn btn-secondary" style="padding:8px 10px;cursor:pointer;white-space:nowrap;flex:0 0 auto">📋 نسخ</button>')+'</div></div>';
}
var CARD=CARDW+';width:min(360px,calc(100vw - 64px))';
function tellCoach(text){
  try{
    var n=0,iv=setInterval(function(){
      var inp=document.getElementById('aiChatInput');
      var busy=(typeof aiRequestInProgress!=='undefined'&&aiRequestInProgress);
      if(inp&&typeof sendAIChatMessage==='function'&&!busy){
        clearInterval(iv);inp.value=text;
        try{if(typeof updateAIChatInputRowState==='function')updateAIChatInputRowState()}catch(e){}
        sendAIChatMessage();
      }else if(++n>20)clearInterval(iv);
    },500);
  }catch(e){}
}

// 1) كارت ربط موقع موجود عندنا
reg('mcp_offer_connect','🔌 بعرض كارت الربط',
 'يعرض للمستخدم كارت ربط لموقع موجود فعلًا في قايمة mcp_status ومش متوصّل (مش لكانفا بس). المستخدم يضغط "ربط" ويسجّل دخول بنفسه، ولما يرجع المحادثة بتكمّل لوحدها. لو الموقع مش في القايمة استخدم mcp_suggest_site.',
 {provider:d(S,'معرّف الموقع زي ما بيرجع من mcp_status (مثلًا canva أو u_xxxx)')},['provider'],
 async function(a){
  try{
    var list=(await api('/mcp/providers')).providers||[];
    var p=list.filter(function(x){return x.id===String(a.provider||'')})[0];
    if(!p)return er('الموقع ده مش في القايمة. قول للمستخدم إنه مش موجود عندنا وقدّم له mcp_suggest_site مع الرابط الرسمي.');
    if(p.connected)return ok({message:p.name+' متوصّل أصلًا، كمّل شغلك عليه.'});
    var pend=lastUserText();
    var host=mountCard('<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">'+esc(p.icon||'🔗')+' ربط '+esc(p.name)+'</div>'+
      '<div style="font-size:.82rem;opacity:.85;line-height:1.7;margin-bottom:10px">اربط حسابك في '+esc(p.name)+' مرة واحدة، وبعدها أكمّل طلبك عليه على طول.</div>'+
      '<button data-a="go" class="btn" style="'+BTN+';width:100%;flex:none">🔌 ربط</button><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em"></div></div>');
    var go=host.querySelector('[data-a=go]'),msg=host.querySelector('[data-a=msg]');
    go.onclick=async function(){
      go.disabled=true;msg.textContent='⏳ بفتحلك تسجيل الدخول...';
      try{await connectProvider(p.id,pend,p.name)}catch(e){go.disabled=false;msg.textContent='⚠️ '+(e.message||e)}
    };
    return ok({message:'عرضت كارت الربط. استنى المستخدم يضغط "ربط". بعد ما يرجع هتوصلك رسالة منه، وتأكد بـ mcp_status إنه متوصّل.'});
  }catch(e){return er(e.message||String(e))}
 });

// 2) كارت اقتراح موقع جديد (اسم + رابط قابلين للنسخ والتعديل + زرار إضافة وربط)
reg('mcp_suggest_site','➕ بقترح موقع للربط',
 'يعرض كارت فيه اسم الموقع ورابط سيرفر MCP الرسمي بتاعه، كل واحد معاه زرار نسخ وخانة تعديل، وزرار "إضافة وربط" بيضيف الموقع ويبدأ الربط. استخدمه لما المستخدم يطلب موقع مش موجود في mcp_status. الرابط لازم يكون من مصدر رسمي لقيته بـ web_search (https بس)، ممنوع تألفه. قول للمستخدم في الكلام إن الموقع مش موجود عندنا بس يقدر يضيفه من الكارت.',
 {name:d(S,'اسم الموقع (مثلًا Notion)'),url:d(S,'رابط سيرفر MCP الرسمي (https://...)'),note:d(S,'جملة قصيرة اختيارية: مين المصدر أو لو الموقع بيحتاج مفتاح API')},['name','url'],
 async function(a){
  try{
    var nm=String(a.name||'').slice(0,40),u=String(a.url||'').trim();
    if(!/^https:\/\//i.test(u))return er('الرابط لازم يبدأ بـ https وتجيبه من مصدر رسمي.');
    var pend=lastUserText();
    var host=mountCard('<div style="'+CARD+'"><div style="font-weight:800;margin-bottom:6px">➕ إضافة موقع</div>'+
      (a.note?'<div style="font-size:.78rem;opacity:.8;line-height:1.7;margin-bottom:8px">'+esc(String(a.note).slice(0,300))+'</div>':'')+
      field('n','اسم الموقع',nm)+field('u','رابط سيرفر MCP',u)+
      '<div data-a="keybox" style="display:none">'+field('k','مفتاح API (لو الموقع طلبه)','',false,true)+'</div>'+
      '<div style="display:flex;gap:6px"><button data-a="add" class="btn" style="'+BTN+'">إضافة وربط</button>'+
      '<button data-a="key" class="btn btn-secondary" style="'+BTN+'">🔑 عندي مفتاح API</button></div>'+
      '<div data-a="msg" style="font-size:.75rem;opacity:.85;margin-top:6px;min-height:1em;line-height:1.6"></div>'+
      '<div style="font-size:.68rem;opacity:.6;margin-top:6px">ضيف مواقع انت واثق فيها بس: المدرب هيقدر يستخدم أدواتها بصلاحياتك.</div></div>');
    wireCopy(host);
    var q=function(x){return host.querySelector(x)},msg=q('[data-a=msg]'),add=q('[data-a=add]');
    q('[data-a=key]').onclick=function(){var kb=q('[data-a=keybox]');kb.style.display=kb.style.display==='none'?'block':'none'};
    add.onclick=async function(){
      var n=(q('[data-f=n]').value||'').trim(),url=(q('[data-f=u]').value||'').trim(),k=(q('[data-f=k]').value||'').trim();
      if(!n||!url){msg.textContent='اكتب الاسم والرابط';return}
      add.disabled=true;msg.textContent='⏳ بتأكد من الموقع...';
      try{
        var r=await api('/mcp/add',{name:n,url:url,token:k});
        if(r.connected){
          msg.textContent='✅ اتضاف واتربط: '+n;
          tellCoach('اتضاف واتربط موقع '+n+' (المعرّف '+r.id+'). اتأكد بـ mcp_status وكمّل'+(pend?(' طلبي: '+pend):'')+'.');
        }else{
          msg.textContent='اتضاف. بفتحلك تسجيل الدخول...';
          await connectProvider(r.id,pend,n);
        }
      }catch(e){
        add.disabled=false;msg.textContent='⚠️ '+(e.message||e);
        if(e.code==='needs_key'||e.code==='bad_key'){var kb=q('[data-a=keybox]');if(kb)kb.style.display='block'}
      }
    };
    return ok({message:'عرضت كارت إضافة '+nm+'. استنى المستخدم يضغط "إضافة وربط". لما يخلص هتوصلك رسالة منه وتأكد بـ mcp_status.'});
  }catch(e){return er(e.message||String(e))}
 });

// 3) كارت نسخ عام: أي نص/رابط/اسم المستخدم عايز ينسخه
reg('show_copy_card','📋 بجهّز كارت النسخ',
 'يعرض للمستخدم كارت فيه نص أو أكتر وكل واحد معاه زرار نسخ. استخدمه لما المستخدم يطلب "هات لي كذا / اكتب لي كذا" وهو هيحتاج ينسخه (رابط، اسم، كود، رسالة، عنوان...). items_json = مصفوفة JSON زي [{"label":"الرابط","text":"https://..."}]. أو text لنص واحد. متستخدمهوش لصور كانفا: دي بتتعرض لوحدها بعد mcp_call.',
 {title:d(S,'عنوان الكارت (اختياري)'),text:d(S,'النص المراد نسخه لو واحد'),items_json:d(S,'مصفوفة JSON من {label,text} لو أكتر من نص')},[],
 async function(a){
  try{
    var items=[];
    if(a.items_json){try{var j=JSON.parse(a.items_json);if(Array.isArray(j))items=j}catch(e){return er('items_json مش JSON سليم.')}}
    if(!items.length&&a.text)items=[{label:'',text:a.text}];
    items=items.filter(function(x){return x&&x.text!=null&&String(x.text).length}).slice(0,8);
    if(!items.length)return er('محتاج text أو items_json.');
    items=items.map(function(it){return {label:String(it.label||'').slice(0,60),text:String(it.text).slice(0,5000)}});
    var title=a.title?String(a.title).slice(0,100):'';
    var host=mountCard(copyHtml(title,items));wireCopyCards(host,items);scrollChat();
    rec('mcpcopy',{title:title,items:items});
    return ok({message:'عرضت كارت النسخ. متكررش النص في ردك.'});
  }catch(e){return er(e.message||String(e))}
 });


// ---------- canva_image: أداة واحدة بتعمل كل الخطوات جواها (طلبين بس للنموذج) ----------
// generate-image عند كانفا بترجّع jobId، والتطبيق نفسه بيستنى النتيجة (get-generate-image-job) ويعرض الكارت.
var RATIOS={'1:1':'SQUARE_1_1','16:9':'LANDSCAPE_16_9','4:3':'LANDSCAPE_4_3','3:2':'LANDSCAPE_3_2','9:16':'PORTRAIT_9_16','3:4':'PORTRAIT_3_4','2:3':'PORTRAIT_2_3','5:4':'LANDSCAPE_5_4','2:1':'LANDSCAPE_2_1','4:5':'PORTRAIT_4_5','1:2':'PORTRAIT_1_2'};
function guessAspect(t){
  t=String(t||'').toLowerCase();
  var m=t.match(/(\d{1,2})\s*[:×x]\s*(\d{1,2})/);
  if(m&&RATIOS[m[1]+':'+m[2]])return m[1]+':'+m[2];
  if(/ستوري|story|stories|ريلز|reels|reel|تيك ?توك|tiktok|طولي|رأسي|راسي|portrait|خلفية (ال)?(موبايل|هاتف|جوال)/.test(t))return '9:16';
  if(/بوستر|poster|غلاف كتاب|بروفايل طولي/.test(t))return '3:4';
  if(/يوتيوب|youtube|عرضي|أفقي|افقي|landscape|بانر|banner|غلاف|cover|wallpaper|خلفية (ال)?(سطح|كمبيوتر|لاب)|شاشة|عرض تقديمي|presentation/.test(t))return '16:9';
  if(/مربع|square|لوجو|logo|أيقونة|ايقونة|icon|انستجرام|instagram/.test(t))return '1:1';
  return '';
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
async function canvaTool(tool,args,intent){
  args.user_intent=String(intent||'صورة').slice(0,200);
  var err=null;
  for(var k=0;k<3;k++){
    try{return (await api('/mcp/call',{provider:'canva',tool:tool,arguments:args})).result||{}}
    catch(e){
      err=e;
      // 409 (تعارض) / 429 (زحمة) / أخطاء السيرفر المؤقتة: نحاول تاني لوحدنا بدل ما نبوّظ الطلب
      if(k===2||!/\b(409|429|500|502|503|504)\b/.test(String(e&&e.message||'')))throw e;
      await sleep(2500*(k+1));
    }
  }
  throw err;
}
function jobIdOf(r){
  var sc=r.structuredContent||{};
  if(sc.jobId||sc.job_id)return String(sc.jobId||sc.job_id);
  var m=textOf(r).match(/job[_ ]?id["'\s:=]+([A-Za-z0-9_-]{6,})/i);
  return m?m[1]:'';
}
function attachedImages(){
  var out=[];
  try{
    for(var i=aiChatHistory.length-1;i>=0&&i>=aiChatHistory.length-8;i--){
      var m=aiChatHistory[i];
      if(!m||m.role!=='user')continue;
      (m.parts||[]).forEach(function(p){
        var x=p&&(p.inlineData||p.inline_data);
        var mt=x&&(x.mimeType||x.mime_type);
        if(x&&x.data&&/^image\//i.test(mt||''))out.push({mime:mt,data:x.data});
      });
      if(out.length)break;
    }
  }catch(e){}
  return out.slice(0,4);
}
function findMediaId(o){
  if(!o||typeof o!=='object')return '';
  var ks=['mediaId','media_id','assetId','asset_id','id'];
  for(var i=0;i<ks.length;i++)if(typeof o[ks[i]]==='string'&&o[ks[i]])return o[ks[i]];
  for(var k in o){var v=findMediaId(o[k]);if(v)return v}
  return '';
}
async function uploadToCanva(img,intent){
  var r=await canvaTool('create-upload-url',{},intent);
  var sc=r.structuredContent||{},t=textOf(r);
  var up=sc.upload_url||sc.uploadUrl||((t.match(URLRX)||[])[0]||'');
  if(!up)throw new Error('كانفا مادّتنيش رابط رفع');
  var bin=atob(img.data),buf=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);
  var resp;
  try{resp=await fetch(up,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:buf})}
  catch(e){throw new Error('المتصفح مقدرش يرفع صورتك لكانفا (غالبًا حماية CORS)')}
  var txt=await resp.text();
  if(!resp.ok)throw new Error('رفع الصورة لكانفا رجّع '+resp.status);
  var id='';
  try{id=findMediaId(JSON.parse(txt))}catch(e){}
  if(!id){var mm=txt.match(/\bM[A-Za-z0-9_-]{9,}\b/);id=mm?mm[0]:''}
  if(!id)throw new Error('الصورة اترفعت بس معرفتش رقمها عند كانفا');
  return id;
}
reg('canva_image','🎨 بعمل الصورة في كانفا',
 'يعمل صورة من كانفا بالكامل في خطوة واحدة: يطلب الصورة، يستنى لحد ما تخلص، ويعرضها للمستخدم في الشات بزرار تنزيل ونسخ رابط. استخدمها لأي طلب صورة لما كانفا متوصّلة، ومتنادش mcp_list_tools ولا mcp_call ولا أي أداة عرض معاها. prompt = كلام المستخدم زي ما هو. بعد ما ترجع رد بجملة واحدة قصيرة بس. لو رجّعت خطأ نادي generate_image العادية.',
 {prompt:d(S,'طلب المستخدم للصورة بكلامه زي ما هو'),use_attachments:d({type:'boolean'},'خليها true لو المستخدم رفع صورة أو أكتر في الشات وعايزها تتعدّل أو تتدمج أو تتغيّر أو تتستخدم كمرجع للصورة الجديدة (لحد 4 صور). سيبها فاضية لو مفيش صور مرفوعة.'),aspect:d(S,'نسبة الأبعاد، اختارها بنفسك حسب الغرض ومتسيبهاش مربعة دايمًا: 16:9 لمنظر طبيعي أو غلاف أو يوتيوب أو خلفية كمبيوتر، 9:16 لستوري أو ريلز أو خلفية موبايل، 3:4 لبوستر طولي، 4:3 لصورة عادية عرضية، 1:1 لأيقونة أو لوجو بس. القيم: 1:1 أو 16:9 أو 9:16 أو 4:3 أو 3:4')},['prompt'],
 async function(a){
  try{
    if(!(await canvaOn()))return er('كانفا مش متوصّلة. نادي generate_image العادية أو mcp_offer_connect.');
    var intent=String(a.prompt||'').slice(0,120);
    var args={prompt:String(a.prompt||'')};
    var ar=RATIOS[String(a.aspect||'').replace(/\s/g,'')]||RATIOS[guessAspect(a.prompt)];
    if(a.use_attachments===true||a.use_attachments==='true'){
      var imgs=attachedImages();
      if(!imgs.length)return er('مفيش صور مرفوعة في آخر رسايل المستخدم. قوله يرفع الصورة الأول من زرار +.');
      try{
        var ids=[];
        for(var u=0;u<imgs.length;u++)ids.push(await uploadToCanva(imgs[u],intent));
        args.imageReferences=ids.map(function(id){return {type:'MEDIA',id:id}});
      }catch(ue){return er('معرفتش أستخدم صورك: '+(ue.message||ue)+'. قول للمستخدم السبب بجملة، ومتعملش الصورة من غير صوره.')}
    }
    if(ar)args.aspectRatio=ar;
    var r=await canvaTool('generate-image',args,intent);
    if(r.isError)return er((textOf(r)||'كانفا رجّعت خطأ').slice(0,400)+' — نادي generate_image العادية.');
    var mm=pickMedia(r),jid=jobIdOf(r),last=r,extra=0;
    for(var i=0;i<40&&!mm.images.length;i++){
      if(!jid)break;
      await sleep(i?3000:1500);
      last=await canvaTool('get-generate-image-job',{jobId:jid},intent);
      var t=textOf(last);
      if(last.isError)return er(t.slice(0,400)||'فشل متابعة الصورة');
      if(/\bFAILURE\b/i.test(t))return er('كانفا ماقدرتش تعمل الصورة: '+t.slice(0,300)+' — نادي generate_image العادية.');
      mm=pickMedia(last);
      if(!mm.images.length&&/\bSUCCESS\b/i.test(t)&&++extra>4)break;
    }
    if(!mm.images.length){
      // مفيش رابط صورة مباشر: نعرض أي رابط كانفا لو لقيناه
      var seen={},ls=[];
      (textOf(last).match(URLRX)||[]).forEach(function(u){u=u.replace(/[.,;:]+$/,'');if(!seen[u]&&/canva\.com/i.test(u)){seen[u]=1;ls.push(u)}});
      if(!ls.length)return er(jid?'الصورة لسه ماجهزتش أو مفيش رابط ليها. نادي generate_image العادية.':'مفهمتش رد كانفا (مفيش jobId). نادي generate_image العادية.');
      mm.images=ls.slice(0,2);mm.links=ls.slice(0,2);mm.linkLabel='🔗 فتح الصورة في كانفا';
      try{mm.diag='blocks: '+(Array.isArray(last.content)?last.content.map(function(c){return c&&(c.type+(c.mimeType?'('+c.mimeType+')':''))}).join(','):'-')+' | '+ls.map(function(u){try{return new URL(u).host+new URL(u).pathname.slice(0,30)}catch(e){return '?'}}).join(' ; ')}catch(e){}
    }
    if(mm.images.length&&!mm.diag){
      var sn={},ex=[];
      (textOf(last).match(URLRX)||[]).forEach(function(u){u=u.replace(/[.,;:]+$/,'');if(!sn[u]&&/canva\.com/i.test(u)&&mm.images.indexOf(u)<0&&!/media\.canva\.com/i.test(u)){sn[u]=1;ex.push(u)}});
      mm.links=(mm.links||[]).concat(ex).slice(0,2);mm.linkLabel='🔗 فتح الصورة في كانفا';
      mm.edit=/^https:/i.test(mm.images[0]);
    }
    mm.title=intent;
    if(!showMedia(mm))return er('معرفتش أعرض الكارت. نادي generate_image العادية.');
    return ok({shown_to_user:true,message:'اتعرضت للمستخدم. رد بجملة واحدة قصيرة بس ومتكررش أي رابط.'});
  }catch(e){return er((e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))+' — نادي generate_image العادية.')}
 });


// ---------- canva_design: تصميم قابل للتعديل (النص نص حقيقي) ----------
// create-design بترجّع job_id وcontinuation_token، والتطبيق بيستنى ويكرر السؤال لحد ما التصميم يخلص، وبعدين يعرض كارت: معاينة + تعديل في كانفا + تنزيل.
function jobOf(r){
  var sc=r.structuredContent||{},t=textOf(r),m;
  var j=sc.job_id||sc.jobId||((m=t.match(/job_id["'\s:=]+([A-Za-z0-9_-]{6,})/))&&m[1])||'';
  var c=sc.continuation_token||sc.continuationToken||((m=t.match(/continuation_token["'\s:=]+([A-Za-z0-9_.\-=+\/]{6,})/))&&m[1])||'';
  var w=+(sc.polling_policy&&sc.polling_policy.wait_seconds)||+(((m=t.match(/wait_seconds["'\s:=]+(\d+)/))&&m[1])||0)||5;
  return {job:String(j),tok:String(c),wait:Math.min(Math.max(w,2),15)};
}
reg('canva_design','🎨 بعمل التصميم في كانفا',
 'يعمل تصميم قابل للتعديل في كانفا (بوستر، بوست، بانر، صورة مصغرة، فلاير، كارت...) والنص فيه نص حقيقي يتمسح ويتغيّر والعناصر تتحرك. بيطلب التصميم، يستنى لحد ما يخلص، ويعرض للمستخدم كارت فيه معاينة وزرار "تعديل في كانفا" وتنزيل. استخدمها لما المستخدم يطلب تصميم أو يقول إنه عايز يعدّل النص أو العناصر. للصورة العادية استخدم canva_image. متنادش mcp_call ولا أداة عرض معاها. brief = طلب المستخدم بكلامه. بعد ما ترجع رد بجملة واحدة قصيرة بس. لو رجّعت خطأ قول للمستخدم السبب بجملة.',
 {brief:d(S,'طلب المستخدم للتصميم بكلامه زي ما هو، مع أي نص عايزه مكتوب بالحرف'),format:d(S,'اختياري: نوع التصميم مثل "Instagram Post" أو "YouTube Thumbnail" أو "Poster (Portrait)". سيبه فاضي لو مش محدد')},['brief'],
 async function(a){
  try{
    if(!(await canvaOn()))return er('كانفا مش متوصّلة. نادي mcp_offer_connect.');
    var intent=String(a.brief||'').slice(0,120);
    var args={brief:String(a.brief||'')};
    if(a.format)args.format=String(a.format).slice(0,80);
    var r=await canvaTool('create-design',args,intent);
    if(r.isError)return er((textOf(r)||'كانفا رجّعت خطأ').slice(0,400));
    var J=jobOf(r),last=r,DRX=/https:\/\/www\.canva\.com\/design\/(D[A-Za-z0-9_-]{10})[^\s"'<>\\)]*/;
    var t0=textOf(r);
    for(var i=0;i<30&&!DRX.test(t0);i++){
      if(!J.job||!J.tok)break;
      await sleep(J.wait*1000);
      last=await canvaTool('get-create-design-async-job',{job_id:J.job,continuation_token:J.tok},intent);
      t0=textOf(last);
      if(last.isError)return er(t0.slice(0,400)||'فشلت متابعة التصميم');
      if(/\b(FAILED|FAILURE|ERROR)\b/i.test(t0)&&!DRX.test(t0))return er('كانفا ماقدرتش تعمل التصميم: '+t0.slice(0,300));
      var nj=jobOf(last);if(nj.tok)J.tok=nj.tok;if(nj.wait)J.wait=nj.wait;
    }
    var m=t0.match(DRX);
    if(!m)return er(J.job?'التصميم لسه ماخلصش أو مفيش رابط ليه. جرّب تاني بعد شوية.':'مفهمتش رد كانفا (مفيش job_id).');
    var id=m[1],th=pickMedia(last).images.filter(function(u){return /^https:/i.test(u)})[0]||'';
    showCard({title:intent,design_id:id,edit_url:'https://www.canva.com/design/'+id+'/edit',thumbnail_url:th});
    return ok({shown_to_user:true,design_id:id,message:'اتعرض للمستخدم كارت التصميم بزرار تعديل وتنزيل. رد بجملة واحدة قصيرة بس ومتكررش أي رابط.'});
  }catch(e){return er(e.code==='not_connected'?(e.message+' (نادي mcp_open_connect)'):(e.message||String(e)))}
 });

}catch(e){try{console.warn('mcptools.js:',e)}catch(_){}}
})();
