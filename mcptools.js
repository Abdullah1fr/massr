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
  return t?(' ——— إعدادات المستخدم الشخصية:'+t):'';
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
  return '<div style="direction:rtl;text-align:right;border:1px solid rgba(128,140,160,.35);border-radius:14px;padding:12px;max-width:340px;background:rgba(128,128,128,.08)">'+
    '<div style="font-weight:800;margin-bottom:6px">🎨 عايز جودة أحسن؟</div>'+
    '<div style="font-size:.82rem;opacity:.85;line-height:1.7;margin-bottom:10px">كانفا بتطلّع تصاميم وصور بجودة أعلى من المولّد العادي. اربط حسابك مرة واحدة وأكمّل طلبك عليها على طول.</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
    '<button data-a="go" class="btn" style="padding:8px 12px;cursor:pointer">🎨 اربط كانفا</button>'+
    '<button data-a="no" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">كمّل بالمولّد العادي</button>'+
    '</div><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em"></div></div>';
}
function showOffer(args,origGen){
  var host=null;
  try{host=appendAIBubble('action','')}catch(e){}
  if(!(host&&host.nodeType===1))return false;
  host.innerHTML=offerHtml();
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
    try{
      if(args.saveToNote===true||Date.now()<skipUntil||declined()||!gwReady())return orig(args);
      var a=(typeof fbAuth!=='undefined')?fbAuth:null;
      if(!a||!a.currentUser)return orig(args);
      var on=await canvaOn();
      if(on){
        if(Date.now()-hintedAt<180000)return orig(args);
        hintedAt=Date.now();
        return er('كانفا متوصّلة عند المستخدم، والمطلوب إن الصور والتصاميم تتعمل من كانفا لأن جودتها أحسن. نادي mcp_list_tools بـ provider=canva، وبعدين mcp_call لإنشاء التصميم، واعرض النتيجة بـ mcp_show_card. لو كانفا فشلت أو ما قدرتش تعمل المطلوب، نادي generate_image تاني وهيشتغل عادي.');
      }
      if(showOffer(args,orig))return ok({message:'عرضت للمستخدم كارت فيه اختيارين: يربط كانفا لجودة أحسن، أو يكمّل بالمولّد العادي. استنى اختياره، ولا تكرر الطلب ولا تقول إن الصورة اتعملت.'});
    }catch(e){}
    return orig(args);
  };
})();


// ---------- كروت عامة: ربط أي موقع + اقتراح موقع جديد + كارت نسخ ----------
function mountCard(html){
  var host=null;
  try{host=appendAIBubble('action','')}catch(e){}
  if(host&&host.nodeType===1){host.innerHTML=html;return host}
  var o=document.createElement('div');
  o.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483200;display:flex;justify-content:center;padding:10px calc(10px + env(safe-area-inset-bottom,0px)) 10px';
  o.innerHTML='<div style="background:var(--card-bg,#1c1626);color:var(--text-primary,#fff);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.5);position:relative;max-width:360px;width:100%">'+html+'<button data-a="x" style="position:absolute;top:6px;left:8px;background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer">✕</button></div>';
  document.body.appendChild(o);
  var x=o.querySelector('[data-a=x]');if(x)x.onclick=function(){o.remove()};
  return o;
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
    '<div style="display:flex;gap:6px;align-items:center"><input data-f="'+id+'"'+(pw?' type="password" autocomplete="off"':'')+' value="'+esc(val||'')+'"'+(ro?' readonly':'')+' style="'+BOX+';flex:1;min-width:0">'+
    (pw?'':'<button data-copy="'+id+'" class="btn btn-secondary" style="padding:8px 10px;cursor:pointer;white-space:nowrap">📋 نسخ</button>')+'</div></div>';
}
var CARD='direction:rtl;text-align:right;border:1px solid rgba(128,140,160,.35);border-radius:14px;padding:12px;max-width:360px;background:rgba(128,128,128,.08)';
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
      '<button data-a="go" class="btn" style="padding:8px 14px;cursor:pointer">🔌 ربط</button><div data-a="msg" style="font-size:.75rem;opacity:.8;margin-top:6px;min-height:1em"></div></div>');
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
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button data-a="add" class="btn" style="padding:8px 14px;cursor:pointer">إضافة وربط</button>'+
      '<button data-a="key" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">🔑 عندي مفتاح API</button></div>'+
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
 'يعرض للمستخدم كارت فيه نص أو أكتر وكل واحد معاه زرار نسخ. استخدمه لما المستخدم يطلب "هات لي كذا / اكتب لي كذا" وهو هيحتاج ينسخه (رابط، اسم، كود، رسالة، عنوان...). items_json = مصفوفة JSON زي [{"label":"الرابط","text":"https://..."}]. أو text لنص واحد.',
 {title:d(S,'عنوان الكارت (اختياري)'),text:d(S,'النص المراد نسخه لو واحد'),items_json:d(S,'مصفوفة JSON من {label,text} لو أكتر من نص')},[],
 async function(a){
  try{
    var items=[];
    if(a.items_json){try{var j=JSON.parse(a.items_json);if(Array.isArray(j))items=j}catch(e){return er('items_json مش JSON سليم.')}}
    if(!items.length&&a.text)items=[{label:'',text:a.text}];
    items=items.filter(function(x){return x&&x.text!=null&&String(x.text).length}).slice(0,8);
    if(!items.length)return er('محتاج text أو items_json.');
    var html='<div style="'+CARD+'">'+(a.title?'<div style="font-weight:800;margin-bottom:8px">'+esc(String(a.title).slice(0,100))+'</div>':'');
    items.forEach(function(it,i){
      var t=String(it.text).slice(0,5000),long=t.length>120||t.indexOf('\n')>=0;
      html+=long?
        ('<div style="margin-bottom:8px">'+(it.label?'<div style="font-size:.72rem;opacity:.75;margin-bottom:3px">'+esc(String(it.label).slice(0,60))+'</div>':'')+
         '<textarea data-f="c'+i+'" readonly rows="'+Math.min(8,Math.max(3,Math.ceil(t.length/45)))+'" style="'+BOX+';direction:rtl;text-align:right;display:block;margin-bottom:6px">'+esc(t)+'</textarea>'+
         '<button data-copy="c'+i+'" class="btn btn-secondary" style="padding:8px 12px;cursor:pointer">📋 نسخ</button></div>'):
        field('c'+i,String(it.label||'').slice(0,60),t,true);
    });
    html+='</div>';
    wireCopy(mountCard(html));
    return ok({message:'عرضت كارت النسخ. متكررش النص في ردك.'});
  }catch(e){return er(e.message||String(e))}
 });

}catch(e){try{console.warn('mcptools.js:',e)}catch(_){}}
})();
