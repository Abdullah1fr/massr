(function(){
try{
// =====================================================================
// filetools.js — أدوات الملفات المطوّرة (ملف منفصل جنب index.html، زي webtools.js).
// الإصدار 1: html_to_pdf بطبقة نص غير مرئية (PDF قابل للبحث والنسخ).
// بيستبدل تعريف html_to_pdf القديم في index.html من غير ما يغيّر اسمه ولا معاملاته (وبيضيف معامل text_layer اختياري).
// =====================================================================
const AA=APP_ACTIONS,DECL=AI_TOOLS_DECLARATION[0].functionDeclarations,LB=AI_FN_STATUS_LABELS;
const S={type:'string'},N={type:'number'},B={type:'boolean'};
const d_=(t,x)=>Object.assign({},t,{description:x});
const E=(a,x)=>({type:'string',enum:a,description:x});
const reg=(n,lab,desc,p,r,h)=>{AA[n]={description:desc,parameters:{type:'object',properties:p,required:r||[]},handler:h};DECL.push({name:n,description:desc,parameters:AA[n].parameters});LB[n]=lab};
// استبدال أداة موجودة: بنشيل تعريفها القديم من DECL الأول عشان ما يتكرّرش عند المساعد
const ftReplace=n=>{for(let i=DECL.length-1;i>=0;i--)if(DECL[i].name===n)DECL.splice(i,1);delete AA[n]};

const H2P_SIZES={A3:[297,420],A4:[210,297],A5:[148,210],Letter:[215.9,279.4],Legal:[215.9,355.6]};
const H2P_FONTS=['Cairo','Tajawal','Amiri','Almarai','Changa'];
const H2P_MMPX=96/25.4;
const h2pWait=ms=>new Promise(r=>setTimeout(r,ms));
const h2pRace=(p,ms)=>Promise.race([p,h2pWait(ms)]);
function h2pHexRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h.slice(0,6),16);return[(n>>16)&255,(n>>8)&255,n&255]}
function h2pClean(doc){
  doc.querySelectorAll('script,iframe,frame,object,embed,base,meta[http-equiv]').forEach(e=>e.remove());
  doc.querySelectorAll('*').forEach(el=>{
    Array.from(el.attributes).forEach(at=>{
      const n=at.name.toLowerCase(),v=String(at.value||'').trim().toLowerCase();
      if(n.indexOf('on')===0)el.removeAttribute(at.name);
      else if((n==='href'||n==='src'||n==='xlink:href'||n==='action')&&v.indexOf('javascript:')===0)el.removeAttribute(at.name);
    });
  });
}
// بيحسب أماكن قطع الصفحات: مش مضاعفات ثابتة، لكن أقرب مكان آمن (بين سطرين، قبل كارت أو جدول أو صورة، ومش بين عنوان وأول سطر بعده)
function h2pCuts(fr,ch,effH){
  const win=fr.contentWindow,doc=fr.contentDocument,root=doc.getElementById('__h2p'),sy=win.pageYOffset||0;
  const lines=[],soft=[],forced=[];
  const R=el=>{const r=el.getBoundingClientRect();return{t:r.top+sy,b:r.bottom+sy,h:r.height}};
  const tw=doc.createTreeWalker(root,4,null),rg=doc.createRange();let n,cnt=0;
  while((n=tw.nextNode())&&cnt<40000){
    if(!n.nodeValue||!n.nodeValue.trim())continue;
    const p=n.parentElement;if(!p)continue;
    const cs=win.getComputedStyle(p);if(cs.display==='none'||cs.visibility==='hidden')continue;
    rg.selectNodeContents(n);
    for(const r of rg.getClientRects()){cnt++;if(r.height<2||r.width<1)continue;lines.push([r.top+sy+r.height*0.08,r.bottom+sy-r.height*0.08])}
  }
  const els=Array.from(root.querySelectorAll('*')).slice(0,8000);
  for(const el of els){
    const cs=win.getComputedStyle(el);if(cs.display==='none')continue;
    const tg=el.tagName.toLowerCase(),r=R(el);if(r.h<2)continue;
    const cn=typeof el.className==='string'?el.className:'';
    const brk=cs.breakBefore==='page'||cs.breakBefore==='always'||cs.pageBreakBefore==='always'||cs.pageBreakBefore==='left'||cs.pageBreakBefore==='right'||/(^|\s)(page-break|pagebreak|new-page)(\s|$)/.test(cn);
    if(brk&&r.t>2)forced.push(r.t);
    const avoid=cs.breakInside==='avoid'||cs.pageBreakInside==='avoid'||cs.breakInside==='avoid-page';
    const media=/^(img|svg|canvas|video|figure)$/.test(tg);
    const row=tg==='tr';
    const textBlk=/^(p|li|dd|dt|figcaption|summary|h[1-6])$/.test(tg);
    const bgc=cs.backgroundColor,hasBg=!!bgc&&bgc!=='rgba(0, 0, 0, 0)'&&bgc!=='transparent';
    const hasBorder=['Top','Bottom','Left','Right'].some(k=>parseFloat(cs['border'+k+'Width'])>0&&cs['border'+k+'Style']!=='none');
    const card=(hasBg||hasBorder)&&r.h<=ch*0.35&&(el.textContent||'').trim().length>0&&!/^(html|body|span|a|b|i|em|strong|code|u|small)$/.test(tg);
    if(((avoid||media)&&r.h<=ch*0.95)||(row&&r.h<=ch*0.6)||(textBlk&&r.h<=ch*0.14)||card)soft.push([r.t+1,r.b-1]);
    if(/^h[1-6]$/.test(tg)){
      const nx=el.nextElementSibling;let end=r.b;
      if(nx){const q=R(nx);end=Math.max(r.b,Math.min(q.b,q.t+60))}
      soft.push([r.t+1,end]);
    }
  }
  const merge=a=>{const s=a.slice().sort((x,y)=>x[0]-y[0]),o=[];for(const v of s){const l=o[o.length-1];if(l&&v[0]<l[1])l[1]=Math.max(l[1],v[1]);else o.push([v[0],v[1]])}return o};
  const mAll=merge(lines.concat(soft)),mLines=merge(lines);
  const find=(set,start,limit)=>{
    let y=limit;
    for(let k=0;k<400;k++){
      let hit=null;for(const v of set){if(v[0]>=y)break;if(y<v[1]&&v[0]<y){hit=v;break}}
      if(!hit)return y;
      y=hit[0]-1;if(y<=start+10)return -1;
    }
    return -1;
  };
  forced.sort((a,b)=>a-b);
  const cuts=[0];let g=0;
  while(cuts[cuts.length-1]<effH-2&&g++<400){
    const start=cuts[cuts.length-1],limit=start+ch;
    const f=forced.find(v=>v>start+3&&v<=limit&&v<effH-2);
    if(f!==undefined){cuts.push(Math.round(f));continue}
    if(effH<=limit+1){cuts.push(effH);break}
    let cut=find(mAll,start,limit);
    if(cut<0||cut<start+ch*0.55){const c2=find(mLines,start,limit);cut=(c2>start+ch*0.3)?c2:limit}
    cuts.push(Math.floor(cut));
  }
  if(cuts[cuts.length-1]<effH)cuts.push(effH);
  return cuts;
}
// إصلاح النص العربي قبل التصوير: letter-spacing بيقطّع الحروف ويعكسها في html2canvas، وbidi-override وdirection:ltr بيعكسوا العنوان، والنص المتدرّج (background-clip:text) بيختفي أو بيتشوّه
function h2pFixText(fr,rtl){
  const win=fr.contentWindow,doc=fr.contentDocument,root=doc.getElementById('__h2p');
  const AR=/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g,LT=/[A-Za-z]/g;
  const own=el=>{let s='';for(const c of el.childNodes)if(c.nodeType===3)s+=c.nodeValue;return s};
  Array.from(root.querySelectorAll('*')).slice(0,8000).concat([root]).forEach(el=>{
    const cs=win.getComputedStyle(el),t=own(el),ar=(t.match(AR)||[]).length,lt=(t.match(LT)||[]).length;
    el.style.setProperty('letter-spacing','normal','important');
    el.style.setProperty('word-break','normal','important');
    if(/^(inherit|none)$/.test(cs.textTransform)===false)el.style.setProperty('text-transform','none','important');
    if(ar>0){
      if(/override/.test(cs.unicodeBidi))el.style.setProperty('unicode-bidi','isolate','important');
      if(rtl&&cs.direction==='ltr'&&ar>=lt*1.5&&ar>=2){el.style.setProperty('direction','rtl','important');if(cs.textAlign==='left'||cs.textAlign==='start')el.style.setProperty('text-align','right','important')}
      el.style.setProperty('font-variant-ligatures','normal','important');
    }
    const clip=cs.webkitBackgroundClip||cs.backgroundClip;
    if(clip==='text'){
      const g=(cs.backgroundImage||'').match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
      let col=g?g[0]:'#1a1a1a';
      el.style.setProperty('-webkit-background-clip','border-box','important');
      el.style.setProperty('background-clip','border-box','important');
      el.style.setProperty('background','none','important');
      el.style.setProperty('-webkit-text-fill-color',col,'important');
      el.style.setProperty('color',col,'important');
    }
  });
}

// بيقيس المحتوى الفعلي جوه الصفحة (أعلى/أسفل أول وآخر عنصر ظاهر) ويطلّع أكبر الفراغات بين العناصر
function h2pMeasure(fr){
  const win=fr.contentWindow,doc=fr.contentDocument,root=doc.getElementById('__h2p');
  const sy=win.pageYOffset||0,rr=root.getBoundingClientRect(),rootH=rr.height||1;
  let top=Infinity,bottom=0;const items=[];
  const desc=el=>{let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;const c=(typeof el.className==='string'?el.className:'').trim().split(/\s+/)[0];if(c)s+='.'+c;const tx=(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,18);return tx?s+'("'+tx+'")':s};
  const els=Array.from(root.querySelectorAll('*')).slice(0,5000);
  for(const el of els){
    const cs=win.getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;
    const r=el.getBoundingClientRect();if(r.height<1||r.width<1)continue;
    let own=false;for(const n of el.childNodes){if(n.nodeType===3&&n.textContent.trim()){own=true;break}}
    const tg=el.tagName.toLowerCase();
    const media=/^(img|svg|canvas|video|hr)$/.test(tg);
    const bgc=cs.backgroundColor;const hasBg=!!bgc&&bgc!=='rgba(0, 0, 0, 0)'&&bgc!=='transparent'&&r.height<rootH*0.85;
    const hasBorder=['Top','Bottom'].some(k=>parseFloat(cs['border'+k+'Width'])>0&&cs['border'+k+'Style']!=='none')&&r.height<rootH*0.85;
    if(!(own||media||hasBg||hasBorder))continue;
    const t=r.top+sy,b=r.bottom+sy;top=Math.min(top,t);bottom=Math.max(bottom,b);items.push({t,b,d:desc(el)});
  }
  if(!items.length){top=0;bottom=rr.bottom+sy}
  items.sort((x,y)=>x.t-y.t);
  const gaps=[];let maxB=null,maxD='';
  for(const it of items){
    if(maxB!==null&&it.t-maxB>H2P_MMPX*8)gaps.push({mm:(it.t-maxB)/H2P_MMPX,before:maxD,after:it.d});
    if(maxB===null||it.b>maxB){maxB=it.b;maxD=it.d}
  }
  gaps.sort((x,y)=>y.mm-x.mm);
  return {top:Math.max(0,top),bottom,gaps:gaps.slice(0,3)};
}
async function h2pRun(a){
  if(a&&!String(a.html||'').trim()&&a.file){const fb=await aiFileBytes(a.file);a=Object.assign({},a,{html:new TextDecoder('utf-8').decode(fb.bytes)})}
  if(!a||!String(a.html||'').trim())throw new Error('محتاج كود HTML في الحقل html (أو اسم ملف HTML من المحادثة في الحقل file)');
  if(typeof html2canvas==='undefined')throw new Error('مكتبة html2canvas مش متحمّلة — محتاج اتصال بالإنترنت وجرّب تاني');
  let wmm,hmm;
  const clampMm=(v,d)=>Math.max(50,Math.min(2000,isNaN(+v)||!+v?d:+v));
  if(a.page_size==='custom'||(!a.page_size&&(+a.width_mm||+a.height_mm))){wmm=clampMm(a.width_mm,210);hmm=clampMm(a.height_mm,297)}
  else{[wmm,hmm]=H2P_SIZES[a.page_size]||H2P_SIZES.A4;const land=a.orientation==='landscape';if(land&&wmm<hmm)[wmm,hmm]=[hmm,wmm]}
  const fit=(a.fit==='content'||a.fit==='trim_last')?a.fit:'none';
  const mm=Math.max(0,Math.min(40,a.margin_mm==null||isNaN(+a.margin_mm)?12:+a.margin_mm));
  const pw=Math.round(wmm*H2P_MMPX),ph=Math.round(hmm*H2P_MMPX),m=Math.round(mm*H2P_MMPX),ch=ph-2*m;
  if(ch<200)throw new Error('الهوامش كبيرة أوي، قلّلها');
  const scale=Math.max(1,Math.min(3,+a.scale||2));
  const rtl=a.rtl!==false;
  const bg=/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(a.background||''))?a.background:'#ffffff';
  const printBg=a.print_background!==false;
  const font=H2P_FONTS.indexOf(a.font)!==-1?a.font:'';

  // 1) تجهيز الـ HTML: تنظيف + لفّ المحتوى في حاوية بعرض الصفحة
  const doc=new DOMParser().parseFromString(String(a.html),'text/html');
  h2pClean(doc);
  if(!doc.head)doc.documentElement.insertBefore(doc.createElement('head'),doc.body);
  const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.insertBefore(meta,doc.head.firstChild);
  const base=doc.createElement('style');
  const ff=(font?"'"+font+"',":'')+"'Segoe UI',Tahoma,'Noto Naskh Arabic','Noto Sans Arabic',Arial,sans-serif";
  base.textContent='html,body{margin:0;padding:0;}html{background:'+bg+';}body{background:'+bg+';}'
    +'#__h2p{box-sizing:border-box;width:'+pw+'px;padding:0 '+m+'px;direction:'+(rtl?'rtl':'ltr')+';text-align:'+(rtl?'right':'left')+';font-family:'+ff+';line-height:1.7;color:#111;overflow-wrap:break-word;word-break:normal;}#__h2p *{letter-spacing:normal!important;}'
    +'#__h2p img{max-width:100%;height:auto;}#__h2p table{max-width:100%;}'
    +(printBg?'':'#__h2p *{background:none!important;box-shadow:none!important;}');
  doc.head.insertBefore(base,doc.head.children[1]||null);
  if(font){const lk=doc.createElement('link');lk.rel='stylesheet';lk.href='https://fonts.googleapis.com/css2?family='+font+':wght@400;700&display=swap';doc.head.appendChild(lk);}
  const wrap=doc.createElement('div');wrap.id='__h2p';
  while(doc.body.firstChild)wrap.appendChild(doc.body.firstChild);
  doc.body.appendChild(wrap);
  doc.documentElement.setAttribute('dir',rtl?'rtl':'ltr');
  const srcdoc='<!DOCTYPE html>'+doc.documentElement.outerHTML;

  const fr=document.createElement('iframe');
  fr.setAttribute('aria-hidden','true');
  fr.style.cssText='position:fixed;left:-100000px;top:0;width:'+pw+'px;height:'+ph+'px;border:0;opacity:0;pointer-events:none;';
  try{
    await new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error('تحميل الصفحة اتأخر أوي')),20000);fr.onload=()=>{clearTimeout(t);ok()};fr.srcdoc=srcdoc;document.body.appendChild(fr);});
    const idoc=fr.contentDocument;
    // 2) استنى الخطوط والصور
    try{await h2pRace(idoc.fonts.ready,9000)}catch(e){}
    await h2pRace(Promise.all(Array.from(idoc.images).map(im=>im.complete?1:new Promise(r=>{im.onload=im.onerror=r}))),12000);
    await h2pWait(150);
    // 3) فواصل الصفحات والعناصر اللي مينفعش تتقطع
    h2pFixText(fr,rtl);
    await h2pWait(80);
    const meas=h2pMeasure(fr);
    const bcs=fr.contentWindow.getComputedStyle(idoc.body);
    const totalH=Math.max(20,Math.ceil(idoc.getElementById('__h2p').getBoundingClientRect().bottom+(parseFloat(bcs.paddingBottom)||0)+(parseFloat(bcs.marginBottom)||0)));
    const effH=fit==='none'?totalH:Math.max(20,Math.min(totalH,Math.ceil(meas.bottom)+2));
    const cuts=fit==='content'?[0,effH]:h2pCuts(fr,ch,effH);
    const pages=fit==='content'?1:Math.max(1,cuts.length-1);
    if(pages>60)throw new Error('المحتوى طويل أوي ('+pages+' صفحة) — قسّمه لأكتر من ملف (الحد 60 صفحة)');
    // طبقة النص الخفية: بنجمّع الكلمات ومواضعها قبل التصوير والـ iframe لسه موجود
    let words=null;if(a.text_layer!==false){try{words=ftCollectWords(fr)}catch(e){words=null}}

    // 4) تصوير كل صفحة
    const root=idoc.documentElement,shots=[];
    if(fit==='content'){
      const y0=Math.max(0,Math.floor(meas.top)-2),h0=Math.max(20,effH-y0);
      const sc=Math.min(scale,15000/h0);
      if(sc<0.9)throw new Error('المحتوى طويل أوي لصفحة واحدة ('+Math.round(h0/H2P_MMPX)+' مم). استخدم fit=trim_last أو قسّمه.');
      const cv=await html2canvas(root,{backgroundColor:bg,scale:sc,useCORS:true,logging:false,x:0,y:y0,width:pw,height:h0,windowWidth:pw,windowHeight:totalH,scrollX:0,scrollY:0});
      shots.push({url:cv.toDataURL('image/jpeg',0.92),h:h0});cv.width=cv.height=0;
    }else{
      for(let i=0;i<pages;i++){
        const y=cuts[i],h=Math.max(20,cuts[i+1]-cuts[i]);
        const cv=await html2canvas(root,{backgroundColor:bg,scale:scale,useCORS:true,logging:false,x:0,y:y,width:pw,height:h,windowWidth:pw,windowHeight:totalH,scrollX:0,scrollY:0});
        shots.push({url:cv.toDataURL('image/jpeg',0.92),h:h});
        cv.width=cv.height=0;
        await h2pWait(0);
      }
    }
    const heights=shots.map((s,i)=>(fit==='content'||(fit==='trim_last'&&i===shots.length-1))?Math.max(20,s.h*wmm/pw+2*mm):hmm);

    // 5) تجميع الـ PDF
    const [br,bgc,bb]=h2pHexRgb(bg);
    let bytes;
    const J=window.jspdf&&window.jspdf.jsPDF;
    if(J){
      const pdf=new J({orientation:wmm>heights[0]?'landscape':'portrait',unit:'mm',format:[wmm,heights[0]],compress:true});
      shots.forEach((s,i)=>{
        if(i>0)pdf.addPage([wmm,heights[i]],wmm>heights[i]?'landscape':'portrait');
        pdf.setFillColor(br,bgc,bb);pdf.rect(0,0,wmm,heights[i],'F');
        pdf.addImage(s.url,'JPEG',0,mm,wmm,s.h*wmm/pw,undefined,'FAST');
        if(a.page_numbers&&shots.length>1&&fit!=='content'){try{pdf.setFontSize(9);pdf.setTextColor(120,120,120);pdf.text((i+1)+' / '+shots.length,wmm/2,heights[i]-Math.min(5,Math.max(2.5,mm/2.5)),{align:'center'})}catch(e){}}
      });
      bytes=new Uint8Array(pdf.output('arraybuffer'));
    }else{
      const P=await aiLib('PDFLib'),pd=await P.PDFDocument.create(),W=wmm*72/25.4,Hh=hmm*72/25.4;
      for(let si=0;si<shots.length;si++){
        const s=shots[si],HH=heights[si]*72/25.4;
        const pg=pd.addPage([W,HH]);
        pg.drawRectangle({x:0,y:0,width:W,height:HH,color:P.rgb(br/255,bgc/255,bb/255)});
        const img=await pd.embedJpg(aiB64ToBytes(s.url.split(',')[1]));
        const ih=s.h*W/pw;
        pg.drawImage(img,{x:0,y:HH-mm*72/25.4-ih,width:W,height:ih});
      }
      bytes=await pd.save();
    }
    let textOk=false;
    if(words&&words.length){try{const P=await aiLib('PDFLib');const tops=fit==='content'?[Math.max(0,Math.floor(meas.top)-2)]:cuts.slice(0,pages);bytes=await ftAddTextLayer(bytes,words,{tops:tops,wmm:wmm,pw:pw,mm:mm,rtl:rtl},P);textOk=true}catch(e){textOk=false}}
    const nm=aiBase(a.name||'مستند','','pdf');
    const file=await aiAddOutputFile(nm,'application/pdf',bytes);
    const f1=x=>Math.round(x*10)/10;
    const sizeTxt=fit==='content'?(wmm+'×'+f1(heights[0])+' مم (صفحة واحدة على قد المحتوى)'):((fit==='trim_last'&&pages===1)?(wmm+'×'+f1(heights[0])+' مم (صفحة واحدة مقصوصة من تحت على قد المحتوى)'):(wmm+'×'+hmm+' مم'+(fit==='trim_last'?' (آخر صفحة مقصوصة على قد المحتوى)':'')));
    const lastFill=Math.round(((effH-cuts[Math.max(0,pages-1)])/ch)*100);
    const diag=' تشخيص الفراغات: فراغ داخلي في الـ HTML فوق أول عنصر '+f1(meas.top/H2P_MMPX)+' مم وتحت آخر عنصر '+f1(Math.max(0,totalH-meas.bottom)/H2P_MMPX)+' مم'
      +(fit==='none'?('، آخر صفحة ممتلئة '+Math.min(100,lastFill)+'% بس'):'')
      +(meas.gaps.length?('. أكبر فراغات بين العناصر: '+meas.gaps.map(g=>f1(g.mm)+' مم بين '+g.before+' و '+g.after).join(' | ')):'')
      +'. لو عايز فراغات أقل: قلّل margin/padding في الأماكن دي (html_edit أو file_replace) وأعد التحويل'+(fit==='content'?'.':'، أو استخدم fit="content" وmargin_mm صغير.');
    return aiOk('اتعمل ملف PDF: '+nm+' ('+pages+' صفحة، '+sizeTxt+(rtl?'، RTL':'')+').'+(textOk?' النص قابل للتحديد والبحث والنسخ (طبقة نص خفية فوق الصورة، '+words.length+' كلمة).':' ملحوظة: النص جوه الملف صورة وغير قابل للتحديد أو النسخ'+(a.text_layer===false?' (انت طلبت من غير طبقة نص).':' (طبقة النص ما اتضافتش، غالبًا مكتبة PDFLib ما اتحمّلتش).'))+diag,file);
  }finally{try{fr.remove()}catch(e){}}
}
// ============================================================
// طبقة نص غير مرئية فوق صور html_to_pdf (الخطوة أ)
// الفكرة: كل كلمة بتتكتب في الـ PDF كنص بوضع Tr=3 (غير مرئي) فوق مكانها في الصورة بالظبط، فالملف يبقى قابل للبحث والتحديد والنسخ من غير ما شكله يتغيّر.
// من غير أي خط: بنستخدم خطوط Type3 فاضية (كل حرف إجراءه فاضي) + ToUnicode بيربط كل كود بالحرف الحقيقي. فمفيش fontkit ومفيش خط عربي يتحمّل.
// ============================================================
function ftCollectWords(fr){
  const win=fr.contentWindow,doc=fr.contentDocument,root=doc.getElementById('__h2p'),sy=win.pageYOffset||0;
  const out=[],tw=doc.createTreeWalker(root,4,null),rg=doc.createRange();let n,cnt=0;
  const okEl=new Map();
  const visible=p=>{
    for(let e=p;e&&e!==root.parentElement;e=e.parentElement){
      let v=okEl.get(e);
      if(v===undefined){const cs=win.getComputedStyle(e);v=!(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TITLE)$/.test(e.tagName));okEl.set(e,v)}
      if(!v)return false;
    }
    return true;
  };
  while((n=tw.nextNode())&&cnt<60000){
    const v=n.nodeValue;if(!v||!v.trim())continue;
    const p=n.parentElement;if(!p||!visible(p))continue;
    const re=/\S+/g;let m;
    while((m=re.exec(v))&&cnt<60000){
      rg.setStart(n,m.index);rg.setEnd(n,m.index+m[0].length);
      const rs=Array.from(rg.getClientRects()).filter(r=>r.height>=2&&r.width>=1);
      if(!rs.length)continue;
      const chars=Array.from(m[0]);
      if(rs.length===1){cnt++;out.push({x:rs[0].left,t:rs[0].top+sy,b:rs[0].bottom+sy,w:rs[0].width,s:chars.join('')});continue}
      // كلمة اتقسمت على أكتر من سطر: بنوزّع حروفها على القطع بنسبة عرضها
      const tot=rs.reduce((a,r)=>a+r.width,0);let at=0;
      rs.forEach((r,k)=>{const take=k===rs.length-1?chars.length-at:Math.max(1,Math.round(chars.length*r.width/tot));const s=chars.slice(at,at+take).join('');at+=take;if(s){cnt++;out.push({x:r.left,t:r.top+sy,b:r.bottom+sy,w:r.width,s})}});
    }
  }
  return out;
}
// ترتيب الحروف المرئي: القارئات (pdftotext وpdfium وpdf.js...) بتفترض إن ترتيب الحروف في الملف هو ترتيب الرسم من الشمال لليمين، وبتعكس الكلمات العربي بنفسها. فبنكتب كل كلمة بترتيبها المرئي (الحروف العربي معكوسة، والأرقام واللاتيني زي ما هي).
function ftVisual(str,rtl){
  const R=c=>/[\u0590-\u05FF\u0600-\u065F\u066A-\u06EF\u06FA-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(c);
  const L=c=>/[A-Za-z0-9\u00C0-\u024F\u0660-\u0669\u06F0-\u06F9]/.test(c);
  const cs=Array.from(str);if(!cs.some(R))return rtl?cs.join(''):str;
  let prev=rtl?'R':'L';const dir=cs.map(c=>{const d=R(c)?'R':(L(c)?'L':prev);prev=d;return d});
  const runs=[];cs.forEach((c,i)=>{const r=runs[runs.length-1];if(r&&r.d===dir[i])r.c.push(c);else runs.push({d:dir[i],c:[c]})});
  runs.forEach(r=>{if(r.d==='R')r.c.reverse()});
  if(rtl)runs.reverse();
  return runs.map(r=>r.c.join('')).join('');
}
// geo = {tops:[بداية كل صفحة في الـ iframe بالبكسل], wmm, pw, mm, heights:[ارتفاع كل صفحة بالمم]}
async function ftAddTextLayer(bytes,words,geo,P){
  const doc=await P.PDFDocument.load(bytes),ctx=doc.context,pages=doc.getPages();
  const k=geo.wmm/geo.pw,kpt=k*72/25.4,mmpt=72/25.4;
  // توزيع الحروف على خطوط Type3 (كل خط 254 كود)
  const fonts=[],map=new Map();
  const codeOf=ch=>{
    let r=map.get(ch);if(r)return r;
    let f=fonts[fonts.length-1];if(!f||f.codes.length>=254){f={codes:[]};fonts.push(f)}
    f.codes.push(ch);r={f:fonts.length-1,c:f.codes.length};map.set(ch,r);return r;
  };
  const hex2=n=>(n<16?'0':'')+n.toString(16).toUpperCase();
  const uhex=ch=>{let s='';for(let i=0;i<ch.length;i++)s+=('000'+ch.charCodeAt(i).toString(16)).slice(-4).toUpperCase();return s};
  const perPage=pages.map(()=>[]);
  for(const w of words){
    const cy=(w.t+w.b)/2;let pi=0;
    for(let i=0;i<geo.tops.length;i++)if(cy>=geo.tops[i])pi=i;
    if(pi>=pages.length)pi=pages.length-1;
    perPage[pi].push(w);
  }
  const ops=pages.map(()=>[]);
  perPage.forEach((ws,pi)=>{
    const Hpt=pages[pi].getSize().height;
    ws.forEach(w=>{
      const chars=Array.from(ftVisual(w.s,geo.rtl!==false)).filter(c=>c.trim()||c===' ').map(c=>c===' '?' ':c);
      if(!chars.length)return;
      const h=Math.max(2,w.b-w.t),S=Math.max(2,Math.min(72,h*0.72*kpt));
      const wpt=Math.max(1,w.w*kpt);
      const tz=Math.max(5,Math.min(1000,wpt/(chars.length*S)*100));
      const xpt=w.x*kpt,ymm=geo.mm+(w.b-0.2*h-geo.tops[pi])*k,ypt=Hpt-ymm*mmpt;
      // الكلمة + مسافة في الآخر (عرضها صفر) عشان النسخ يفصل الكلمات
      const runs=[];let cur=null;
      chars.concat([' ']).forEach((ch,idx)=>{const r=codeOf(ch);if(!cur||cur.f!==r.f){cur={f:r.f,h:''};runs.push(cur)}cur.h+=hex2(r.c)});
      let s='BT 3 Tr '+tz.toFixed(2)+' Tz 1 0 0 1 '+xpt.toFixed(2)+' '+ypt.toFixed(2)+' Tm ';
      runs.forEach(r=>{s+='/FTL'+(r.f+1)+' '+S.toFixed(2)+' Tf <'+r.h+'> Tj '});
      ops[pi].push(s+'ET');
    });
  });
  if(!fonts.length)return bytes;
  // إجراء الحرف الفاضي (مشترك بين كل الحروف)
  const emptyProc=ctx.register(ctx.stream('1000 0 d0'));
  const fontRefs=fonts.map(f=>{
    const names=f.codes.map((_,i)=>'g'+(i+1));
    const procs={};names.forEach(n=>{procs[n]=emptyProc});
    let cm='/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange\n';
    for(let i=0;i<f.codes.length;i+=100){const part=f.codes.slice(i,i+100);cm+=part.length+' beginbfchar\n'+part.map((ch,j)=>'<'+hex2(i+j+1)+'> <'+uhex(ch)+'>').join('\n')+'\nendbfchar\n'}
    cm+='endcmap CMapName currentdict /CMap defineresource pop end end';
    const tu=ctx.register(ctx.stream(cm));
    return ctx.register(ctx.obj({Type:'Font',Subtype:'Type3',FontBBox:[0,0,0,0],FontMatrix:[0.001,0,0,0.001,0,0],
      CharProcs:procs,Encoding:{Type:'Encoding',Differences:[1].concat(names)},FirstChar:1,LastChar:f.codes.length,
      Widths:f.codes.map(ch=>ch===' '?0:1000),Resources:{},ToUnicode:tu}));
  });
  pages.forEach((pg,pi)=>{
    if(!ops[pi].length)return;
    const st=ctx.register(ctx.flateStream('q\n'+ops[pi].join('\n')+'\nQ'));
    fontRefs.forEach((r,i)=>pg.node.setFontDictionary(P.PDFName.of('FTL'+(i+1)),r));
    pg.node.addContentStream(st);
  });
  return await doc.save();
}

ftReplace('html_to_pdf');
reg('html_to_pdf','📄 بحوّل الـ HTML لـ PDF',
 'تحويل كود HTML/CSS لملف PDF جاهز للتنزيل. بيتحكم في المقاس (page_size/custom) وفي الفراغات (fit)، وبيرجّع تشخيص للفراغات الداخلية وأكبر فراغات بين العناصر. بيدعم العربي واتجاه اليمين لليسار (RTL) وألوان الخلفية والجداول والصور (data: URI أو روابط تدعم CORS) وفواصل الصفحات (page-break-before: always) وخطوط جوجل العربية (حقل font). الـ HTML بيتنضّف من السكريبتات. النص في الـ PDF الناتج قابل للتحديد والبحث والنسخ (طبقة نص خفية فوق صورة كل صفحة، والشكل ما بيتغيّرش)، وممكن تقفلها بـ text_layer=false. الحد الأقصى 60 صفحة.',
 {html:d_(S,'كود HTML كامل أو جزء منه. CSS جوه <style> أو inline مدعوم. لازم يكون كامل ومكتوب مباشرة في الحقل (أو استخدم file بدله).'),
  file:d_(S,'بديل عن html: اسم ملف HTML موجود في المحادثة (مثلًا اتكتب بـ file_write) أو رقمه f1, f2... — بيوفر إنك تلزق الكود تاني'),
  name:d_(S,'اسم الملف الناتج (بدون .pdf)'),
  page_size:E(['A4','A3','A5','Letter','Legal','custom'],'مقاس الصفحة (الافتراضي A4). custom = مقاس مخصص بـ width_mm و height_mm'),
  width_mm:d_(N,'عرض الصفحة بالمم (مع page_size=custom أو وحدها). من 50 لـ 2000'),
  height_mm:d_(N,'طول الصفحة بالمم (مع custom). بيتجاهل مع fit=content'),
  fit:E(['none','content','trim_last'],'none (افتراضي) صفحات بمقاس ثابت | content صفحة واحدة طولها على قد المحتوى بالظبط من غير أي فراغ زيادة (استخدمه لما المستخدم يقول المحتوى بس / من غير فراغات) | trim_last صفحات عادية وآخر صفحة بس مقصوصة على قد محتواها'),
  orientation:E(['portrait','landscape'],'portrait طولي (افتراضي) أو landscape عرضي'),
  margin_mm:d_(N,'الهامش بالمليمتر (الافتراضي 12، من 0 لـ 40)'),
  rtl:d_(B,'اتجاه من اليمين لليسار (الافتراضي true)'),
  font:E(H2P_FONTS,'خط جوجل عربي اختياري (محتاج إنترنت)'),
  background:d_(S,'لون خلفية الصفحة hex مثل #ffffff (الافتراضي أبيض)'),
  print_background:d_(B,'طباعة ألوان وخلفيات العناصر (الافتراضي true)'),
  scale:d_(N,'جودة التصوير من 1 لـ 3 (الافتراضي 2، الأعلى أبطأ وأكبر حجمًا)'),
  text_layer:d_(B,'طبقة نص خفية تخلي الـ PDF قابل للبحث والنسخ (الافتراضي true)'),
  page_numbers:d_(B,'ترقيم الصفحات في الأسفل (1 / 5). استخدمه للتقارير الطويلة مع هامش 12مم أو أكتر')},
 [],async a=>{try{return await h2pRun(a)}catch(e){return aiFail(e)}});

// تصحيح لقواعد المساعد: الرسالة القديمة بتقول إن نص الـ PDF صورة
const FT_RULES="\n\n[تحديث أدوات الملفات] html_to_pdf بقى بيطلّع PDF نصه قابل للتحديد والبحث والنسخ (طبقة نص خفية فوق صورة الصفحة)، فمتقولش للمستخدم إن النص صورة ومتعرضش Word كبديل للنسخ إلا لو طلب تعديل. docx_to_pdf لسه نصه صورة.";
const _bf=window.buildAISystemInstructionText;
if(typeof _bf==='function')window.buildAISystemInstructionText=function(){return _bf.apply(this,arguments)+FT_RULES};
}catch(e){try{console.warn('filetools failed',e)}catch(_){}}
})();
