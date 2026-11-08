(function(){
try{
// =====================================================================
// aisteps.js — كارت "خطوات التنفيذ" لكل أدوات المساعد (ملف منفصل جنب webtools.js / filetools.js / videotools.js).
// بدل رسايل حالة متفرقة، كل أداة بتشتغل بتظهر في الشات ككارت واحد: العنوان واسم الأداة + آخر خطوة + الوقت + سهم على الجنب.
// دوس على الكارت (أو السهم) تشوف كل الخطوات اللي عملتها الأداة بالترتيب، ولو فشلت الكارت بيتفتح لوحده ويوريك السبب.
// شغّال على كل الأدوات من غير ما نعدّل فيها: بنغلّف executeAIFunctionCall (نقطة تنفيذ كل الأدوات) وappendAIBubble('action')
// (اللي الأدوات بتكتب بيه خطواتها) أثناء تشغيل الأداة بس. لو أي حاجة ناقصة الملف بيسكت ومبيكسرش حاجة.
// لإلغاء الكارت: شيل سطر الـ script بس والتطبيق يرجع لشكله القديم.
// =====================================================================
if(window.__aiRunCards)return;
if(typeof window.executeAIFunctionCall!=='function'||typeof window.appendAIBubble!=='function')return;
window.__aiRunCards=1;
const SKIP=/^(request_tools)$/;       // أدوات داخلية مش محتاجة كارت
const active=[];                       // الأدوات اللي شغالة دلوقتي (آخر واحدة بدأت هي اللي بتستلم الخطوات)
const fmt=ms=>{const s=Math.max(0,Math.round(ms/1000));return s<60?s+'ث':Math.floor(s/60)+'د '+(s%60)+'ث'};
const oneLine=(t,n)=>String(t==null?'':t).replace(/\s+/g,' ').trim().slice(0,n||240);

const st=document.createElement('style');st.id='aiRunCss';
st.textContent=`
.aiRun{align-self:flex-start;width:min(92%,430px);flex-shrink:0;border-radius:14px;overflow:hidden;font-size:.74rem;color:var(--text-primary,inherit);
  background:var(--accent-glow,rgba(255,176,32,.15));border:1px solid var(--card-border,rgba(255,176,32,.2));animation:aiRunIn .16s ease-out}
.aiRun-h{display:flex;align-items:center;gap:9px;padding:9px 11px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.aiRun-h:focus-visible{outline:2px solid var(--accent,#ffb020);outline-offset:-2px}
.aiRun-i{flex:0 0 auto;width:16px;height:16px;border-radius:50%;box-sizing:border-box;border:2px solid color-mix(in srgb,var(--accent,#ffb020) 30%,transparent);border-top-color:var(--accent,#ffb020);animation:aiRunSpin .8s linear infinite}
.aiRun[data-s=ok] .aiRun-i,.aiRun[data-s=err] .aiRun-i{animation:none;border:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.62rem;font-weight:800;line-height:1}
.aiRun[data-s=ok] .aiRun-i{background:#2fa36b}.aiRun[data-s=ok] .aiRun-i::before{content:'✓'}
.aiRun[data-s=err] .aiRun-i{background:#e5484d}.aiRun[data-s=err] .aiRun-i::before{content:'✕'}
.aiRun-m{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.aiRun-t{font-weight:700;color:var(--accent,#ffb020);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aiRun-u{opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aiRun[data-s=err] .aiRun-t{color:#e5484d}
.aiRun-d{flex:0 0 auto;opacity:.7;font-variant-numeric:tabular-nums}
.aiRun-x{flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;
  background:color-mix(in srgb,var(--accent,#ffb020) 14%,transparent);transition:transform .2s}
.aiRun.open .aiRun-x{transform:rotate(180deg)}
.aiRun-b{display:none;max-height:240px;overflow:auto;padding:4px 11px 9px;border-top:1px solid var(--card-border,rgba(255,176,32,.2))}
.aiRun.open .aiRun-b{display:block}
.aiRun-s{padding:3px 0 3px 0;line-height:1.5;word-break:break-word;opacity:.92}
.aiRun-s::before{content:'•';margin-inline-end:6px;color:var(--accent,#ffb020)}
@keyframes aiRunSpin{to{transform:rotate(360deg)}}
@keyframes aiRunIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.aiRun,.aiRun-i,.aiRun-x{animation:none!important;transition:none!important}}
`;
document.head.appendChild(st);

function stepEl(run,text){
  const d=document.createElement('div');d.className='aiRun-s';d.textContent=String(text==null?'':text);
  run.list.appendChild(d);return d;
}
function keepBottom(){
  try{const b=document.getElementById('aiChatMessages');if(b&&b.scrollHeight-b.scrollTop-b.clientHeight<260)b.scrollTop=b.scrollHeight}catch(e){}
}
function startRun(name,args){
  if(SKIP.test(String(name)))return null;
  const box=document.getElementById('aiChatMessages');if(!box)return null;
  let label='';try{label=typeof aiFnStatusLabel==='function'?aiFnStatusLabel(name,args):''}catch(e){}
  if(!label)label='⚙️ بنفّذ: '+name;
  const el=document.createElement('div');el.className='aiRun';el.dataset.s='run';
  const h=document.createElement('div');h.className='aiRun-h';h.setAttribute('role','button');h.tabIndex=0;h.setAttribute('aria-expanded','false');h.setAttribute('aria-label','عرض خطوات التنفيذ');
  h.innerHTML='<span class="aiRun-i"></span><span class="aiRun-m"><span class="aiRun-t"></span><span class="aiRun-u"></span></span><span class="aiRun-d">0ث</span><span class="aiRun-x" aria-hidden="true">▾</span>';
  const b=document.createElement('div');b.className='aiRun-b';
  el.appendChild(h);el.appendChild(b);
  h.querySelector('.aiRun-t').textContent=oneLine(label,80);
  const run={el,name,t0:Date.now(),list:b,sub:h.querySelector('.aiRun-u'),dur:h.querySelector('.aiRun-d')};
  const toggle=()=>{const o=el.classList.toggle('open');h.setAttribute('aria-expanded',o?'true':'false');if(o)try{b.scrollTop=b.scrollHeight}catch(e){}};
  run.open=()=>{if(!el.classList.contains('open'))toggle()};
  h.addEventListener('click',toggle);
  h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  // العنوان الفرعي بيعرض آخر خطوة، حتى لو الأداة بتحدّث نفس السطر (زي نسبة التصوير)
  run.obs=new MutationObserver(()=>{const l=b.lastElementChild;if(l)run.sub.textContent=oneLine(l.textContent,140)});
  run.obs.observe(b,{childList:true,subtree:true,characterData:true});
  stepEl(run,'▶ بدأت التنفيذ');
  run.timer=setInterval(()=>{run.dur.textContent=fmt(Date.now()-run.t0)},500);
  try{typeof appendToAIMessages==='function'?appendToAIMessages(el):box.appendChild(el)}catch(e){box.appendChild(el)}
  keepBottom();
  return run;
}
function finishRun(run,result){
  if(!run)return;
  clearInterval(run.timer);
  const ok=!(result&&result.status==='error');
  const dur=fmt(Date.now()-run.t0);
  run.el.dataset.s=ok?'ok':'err';run.dur.textContent=dur;
  const msg=oneLine(result&&result.message,240);
  const last=stepEl(run,ok?('✅ خلصت في '+dur+(msg?' — '+msg:'')):('❌ فشلت: '+(msg||'سبب غير معروف')));
  run.sub.textContent=oneLine(last.textContent,140);
  try{run.obs.disconnect()}catch(e){}
  if(!ok)run.open();
  keepBottom();
}

const _ex=window.executeAIFunctionCall;
window.executeAIFunctionCall=async function(name,args){
  let run=null;
  try{run=startRun(name,args||{})}catch(e){run=null}
  if(run)active.push(run);
  try{
    const r=await _ex.apply(this,arguments);
    try{finishRun(run,r)}catch(e){}
    return r;
  }catch(e){
    try{finishRun(run,{status:'error',message:(e&&e.message)||String(e)})}catch(_){}
    throw e;
  }finally{const i=active.indexOf(run);if(i>=0)active.splice(i,1)}
};

// الخطوات اللي الأداة بتكتبها أثناء شغلها بتروح جوه الكارت (وبترجّع نفس العنصر عشان الأدوات اللي بتحدّثه تفضل تشتغل)
const _ab=window.appendAIBubble;
window.appendAIBubble=function(kind,text,scroll){
  if(kind==='action'&&active.length){
    try{const run=active[active.length-1],d=stepEl(run,text);keepBottom();return d}catch(e){}
  }
  return _ab.apply(this,arguments);
};
}catch(e){try{console.warn('aisteps.js:',e)}catch(_){}}
})();
