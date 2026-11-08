(function(){
try{
// =====================================================================
// videotools.js — أداة make_video لمدرب الذكاء الاصطناعي (ملف منفصل جنب webtools.js / filetools.js).
// بتعمل فيديو قصير (مشاهد: عنوان + نص + صورة اختيارية) بالكامل جوه المتصفح: Canvas + MediaRecorder.
// من غير سيرفر ومن غير أي مكتبة خارجية. الناتج ملف .webm (أو .mp4 على سفاري) بيتحفظ في المحادثة زي باقي الملفات.
// لو أي حاجة ناقصة (APP_ACTIONS / MediaRecorder) الملف بيسكت ومبيكسرش حاجة. لإلغاء الأداة: شيل سطر الـ script بس.
// =====================================================================
if(typeof APP_ACTIONS==='undefined'||typeof AI_TOOLS_DECLARATION==='undefined'||typeof AI_FN_STATUS_LABELS==='undefined')return;
const AA=APP_ACTIONS,DECL=AI_TOOLS_DECLARATION[0].functionDeclarations,LB=AI_FN_STATUS_LABELS;
if(AA.make_video)return;
const S={type:'string'},N={type:'number'};
const d=(t,x)=>Object.assign({},t,{description:x});
const E=(a,x)=>({type:'string',enum:a,description:x});
const reg=(n,lab,desc,p,r,h)=>{AA[n]={description:desc,parameters:{type:'object',properties:p,required:r||[]},handler:h};DECL.push({name:n,description:desc,parameters:AA[n].parameters});LB[n]=lab};
const ok=o=>Object.assign({status:'ok'},o),er=m=>({status:'error',message:m});
const act=t=>{try{appendAIBubble('action',t)}catch(e){}};
const norm=t=>String(t||'').replace(/\s+/g,' ').trim();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const FONT='Cairo, Tajawal, Almarai, "Segoe UI", Arial, sans-serif';
const STYLES={
  clean:{bg:['#F7F3EA','#E6DCC3'],fg:'#1E2A32',ac:'#2E7D6B'},
  dark:{bg:['#0F1B2D','#223657'],fg:'#F4F7FB',ac:'#E9B44C'},
  warm:{bg:['#FF9F6B','#D6456B'],fg:'#FFFFFF',ac:'#FFF1B8'},
  neon:{bg:['#12002B','#4A0FA8'],fg:'#FFFFFF',ac:'#4CC9F0'},
  ocean:{bg:['#0B3C5D','#1D8A99'],fg:'#FFFFFF',ac:'#FFD166'}
};
const SIZES={'9:16':[720,1280],'16:9':[1280,720],'1:1':[900,900]};
const ANIMS=['rise','fade','slide','zoom','type'];
const FPS=30,MAX_SCENES=12,MAX_TOTAL=60,FADE=0.35;

const hx=v=>{v=String(v||'').trim();return /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)?('#'+v.replace('#','')):null};
const parseBg=(v,def)=>{const p=String(v||'').split(/[,\s]+/).map(hx).filter(Boolean);return p.length>=2?[p[0],p[1]]:p.length===1?[p[0],p[0]]:def};
const isAr=s=>/[\u0600-\u06FF]/.test(s||'');

function wrapWords(ctx,text,maxW){
  const words=norm(text).split(' ').filter(Boolean),lines=[];let cur=[];
  for(const w of words){
    const test=cur.concat(w).join(' ');
    if(cur.length&&ctx.measureText(test).width>maxW){lines.push(cur);cur=[w]}else cur.push(w);
  }
  if(cur.length)lines.push(cur);
  return lines;
}

// بيرسم المشهد sc عند الثانية t من مدته dur. gt/total = التقدم في الفيديو كله (لشريط التقدم).
function drawScene(ctx,W,H,sc,t,gt,total){
  const dur=sc.dur,u=Math.min(W,H);
  // الخلفية
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,sc.bg[0]);g.addColorStop(1,sc.bg[1]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  if(!sc.img){ // دواير ناعمة بتتحرك ببطء عشان الخلفية متبقاش ساكنة
    ctx.save();ctx.fillStyle=sc.ac;
    for(let i=0;i<3;i++){
      const ph=(gt*0.35+i*2.1),x=W*(0.2+0.3*i)+Math.sin(ph)*W*0.05,y=H*(0.25+0.25*i)+Math.cos(ph*0.8)*H*0.03,r=u*(0.28+0.08*i);
      ctx.globalAlpha=0.10;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  let txtColor=sc.fg;
  if(sc.img){ // صورة بملء الشاشة (cover) مع زوم بطيء + تعتيم تحت عشان النص يبان
    const im=sc.img,k=1+0.08*clamp(t/dur,0,1),s=Math.max(W/im.width,H/im.height)*k,w=im.width*s,h=im.height*s;
    ctx.drawImage(im,(W-w)/2,(H-h)/2,w,h);
    const o=ctx.createLinearGradient(0,H*0.30,0,H);o.addColorStop(0,'rgba(0,0,0,0)');o.addColorStop(1,'rgba(0,0,0,0.72)');
    ctx.fillStyle=o;ctx.fillRect(0,0,W,H);
    txtColor='#FFFFFF';
  }
  // النص
  const inP=ease(t/0.7),outA=clamp((dur-t)/FADE,0,1),alpha=clamp(inP*1.15,0,1)*outA;
  const tsz=Math.round(u*0.085),bsz=Math.round(tsz*0.58),maxW=W*0.84;
  const rtl=isAr(sc.title+' '+sc.text);
  ctx.direction=rtl?'rtl':'ltr';ctx.textAlign='center';ctx.textBaseline='alphabetic';
  ctx.font='800 '+tsz+'px '+FONT;const tl=sc.title?wrapWords(ctx,sc.title,maxW):[];
  ctx.font='600 '+bsz+'px '+FONT;const bl=sc.text?wrapWords(ctx,sc.text,maxW):[];
  const tlh=tsz*1.35,blh=bsz*1.5,gap=(tl.length&&bl.length)?tsz*0.45:0,bar=tl.length||bl.length?tsz*0.5:0;
  const blockH=bar+tl.length*tlh+gap+bl.length*blh;
  let y0=sc.img?H*0.90-blockH:(H-blockH)/2;
  ctx.save();
  ctx.globalAlpha=alpha;
  const cx=W/2,cy=y0+blockH/2;
  if(sc.anim==='slide')ctx.translate((1-inP)*W*0.18,0);
  else if(sc.anim==='zoom'){const z=0.82+0.18*inP;ctx.translate(cx,cy);ctx.scale(z,z);ctx.translate(-cx,-cy)}
  else if(sc.anim==='rise')ctx.translate(0,(1-inP)*u*0.06);
  let y=y0;
  if(bar){ctx.fillStyle=sc.ac;const bw=W*0.14*inP,bh=Math.max(6,u*0.011);ctx.beginPath();
    (ctx.roundRect?ctx.roundRect(cx-bw/2,y,bw,bh,bh/2):ctx.rect(cx-bw/2,y,bw,bh));ctx.fill();y+=bar}
  ctx.fillStyle=txtColor;
  ctx.font='800 '+tsz+'px '+FONT;
  tl.forEach(l=>{y+=tlh;ctx.fillText(l.join(' '),cx,y-tlh*0.25)});
  y+=gap;
  ctx.font='600 '+bsz+'px '+FONT;ctx.globalAlpha=alpha*0.92;
  let shown=Infinity;
  if(sc.anim==='type'){const total=bl.reduce((s,l)=>s+l.length,0);shown=Math.ceil(total*clamp((t-0.5)/Math.max(0.8,dur*0.6),0,1))}
  bl.forEach(l=>{
    y+=blh;
    const take=Math.min(l.length,Math.max(0,shown));shown-=l.length;
    if(take>0)ctx.fillText(l.slice(0,take).join(' '),cx,y-blh*0.25);
  });
  ctx.restore();
  // شريط التقدم
  ctx.save();ctx.globalAlpha=0.25;ctx.fillStyle=txtColor;ctx.fillRect(0,H-6,W,6);
  ctx.globalAlpha=0.95;ctx.fillStyle=sc.ac;ctx.fillRect(0,H-6,W*clamp(gt/total,0,1),6);ctx.restore();
}

// فريم واحد على الخط الزمني للفيديو كله (مع تلاشي بين المشهد اللي فات والحالي)
function renderAt(ctx,W,H,scenes,total,gt){
  let acc=0,i=0;
  for(;i<scenes.length-1;i++){if(gt<acc+scenes[i].dur)break;acc+=scenes[i].dur}
  const sc=scenes[i],t=clamp(gt-acc,0,sc.dur);
  if(i>0&&t<FADE){
    const prev=scenes[i-1];
    drawScene(ctx,W,H,prev,prev.dur,gt,total);
    ctx.save();ctx.globalAlpha=t/FADE;drawScene(ctx,W,H,sc,t,gt,total);ctx.restore();
  }else drawScene(ctx,W,H,sc,t,gt,total);
}

async function loadImage(ref){
  let mime,bytes;
  if(/^(last|آخر|اخر)/i.test(String(ref).trim())){
    if(typeof lastGeneratedImage==='undefined'||!lastGeneratedImage)throw new Error('مفيش صورة متولّدة أستخدمها. ولّد صورة الأول أو ابعت واحدة.');
    mime=lastGeneratedImage.mimeType;bytes=aiB64ToBytes(lastGeneratedImage.base64);
  }else{
    const r=await aiFileBytes(ref);
    if(!/^image\//.test(r.f.mime))throw new Error('الملف "'+ref+'" مش صورة');
    mime=r.f.mime;bytes=r.bytes;
  }
  return await createImageBitmap(new Blob([bytes],{type:mime}));
}

reg('make_video','🎬 بعمل فيديو',
 'عمل فيديو قصير (مقاطع/ريلز/عرض تقديمي متحرك) من مشاهد: كل مشهد فيه عنوان ونص وصورة اختيارية، بحركات ونص عربي سليم وشريط تقدم، ويطلع ملف فيديو جاهز للتحميل (webm، أو mp4 على سفاري). بيتصوّر جوه المتصفح في الوقت الحقيقي، يعني فيديو مدته 20 ثانية بياخد حوالي 20 ثانية، والشاشة لازم تفضل مفتوحة. مفيش صوت. للصورة في مشهد اكتب في image: "last" لآخر صورة اتولّدت، أو رقم/اسم صورة من المحادثة. الحد الأقصى 12 مشهد و60 ثانية.',
 {
  scenes:{type:'array',description:'المشاهد بالترتيب (من 1 لـ 12)',items:{type:'object',properties:{
    title:d(S,'عنوان المشهد (قصير)'),
    text:d(S,'نص المشهد (اختياري)'),
    image:d(S,'اختياري: "last" أو رقم/اسم صورة من المحادثة تبقى خلفية المشهد'),
    bg:d(S,'اختياري: لون خلفية hex أو لونين مفصولين بفاصلة (تدرّج). الافتراضي من الـ style'),
    duration:d(N,'مدة المشهد بالثواني (2 لـ 8). الافتراضي بيتحسب من طول النص'),
    anim:E(ANIMS,'حركة دخول النص: rise (الافتراضي) | fade | slide | zoom | type (كتابة كلمة كلمة)')
  },required:['title']}},
  style:E(Object.keys(STYLES),'شكل الألوان: clean | dark | warm | neon | ocean. الافتراضي dark'),
  aspect:E(Object.keys(SIZES),'المقاس: 9:16 (ريلز/ستوري، الافتراضي) | 16:9 | 1:1'),
  name:d(S,'اسم الملف بدون امتداد')
 },['scenes'],
 async a=>{
  try{
    if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)return er('المتصفح ده مش بيدعم تسجيل الفيديو من الكانفاس. جرّب كروم أو سفاري حديث.');
    const raw=Array.isArray(a.scenes)?a.scenes.filter(s=>s&&(norm(s.title)||norm(s.text))):[];
    if(!raw.length)return er('محتاج مشهد واحد على الأقل فيه عنوان أو نص.');
    if(raw.length>MAX_SCENES)return er('الحد الأقصى '+MAX_SCENES+' مشهد. قسّم الفيديو لجزئين.');
    const st=STYLES[a.style]||STYLES.dark,[W,H]=SIZES[a.aspect]||SIZES['9:16'];
    const scenes=[];
    for(const s of raw){
      const text=norm(s.text),title=norm(s.title);
      const words=(title+' '+text).split(' ').filter(Boolean).length;
      let dur=+s.duration;if(!isFinite(dur)||dur<=0)dur=2.2+words*0.32;
      let img=null;
      if(s.image){try{img=await loadImage(s.image)}catch(e){return er(e.message||String(e))}}
      scenes.push({title,text,img,dur:clamp(dur,2,8),bg:parseBg(s.bg,st.bg),fg:st.fg,ac:st.ac,anim:ANIMS.includes(s.anim)?s.anim:'rise'});
    }
    let total=scenes.reduce((x,s)=>x+s.dur,0);
    if(total>MAX_TOTAL){const k=MAX_TOTAL/total;scenes.forEach(s=>s.dur=Math.max(1.5,s.dur*k));total=scenes.reduce((x,s)=>x+s.dur,0)}
    try{await Promise.race([document.fonts.load('800 40px Cairo'),wait(1500)])}catch(e){}
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;
    const ctx=cv.getContext('2d');
    renderAt(ctx,W,H,scenes,total,0);
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(m=>{try{return MediaRecorder.isTypeSupported(m)}catch(e){return false}});
    if(!mime)return er('المتصفح مش بيدعم أي صيغة فيديو متاحة للتسجيل.');
    const rec=new MediaRecorder(cv.captureStream(FPS),{mimeType:mime,videoBitsPerSecond:2500000});
    const chunks=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    const stopped=new Promise(res=>{rec.onstop=res});
    act('🎬 بصوّر الفيديو ('+Math.round(total)+' ثانية تقريبًا). سيب الشاشة مفتوحة لحد ما يخلص...');
    rec.start(250);
    const t0=performance.now();
    await new Promise(res=>{
      const tick=()=>{
        const el=(performance.now()-t0)/1000;
        renderAt(ctx,W,H,scenes,total,Math.min(el,total));
        if(el>=total)return res();
        document.hidden?setTimeout(tick,1000/FPS):requestAnimationFrame(tick);
      };tick();
    });
    await wait(250);
    if(rec.state!=='inactive')rec.stop();
    await stopped;
    const baseMime=mime.split(';')[0],ext=baseMime==='video/mp4'?'mp4':'webm';
    const blob=new Blob(chunks,{type:baseMime});
    if(!blob.size)return er('التسجيل خرج فاضي. جرّب تاني وسيب التبويب ظاهر على الشاشة.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const nm=norm(a.name)||'فيديو';
    const file=await aiAddOutputFile(aiBase(nm,'',ext),baseMime,bytes);
    return ok({message:'اتعمل الفيديو ('+scenes.length+' مشاهد، '+Math.round(total)+' ثانية، '+W+'×'+H+')',file,
      note:'من غير صوت. لو المشغّل ما بيسمحش بالتقديم، ده طبيعي في ملفات webm المسجّلة من المتصفح.'});
  }catch(e){return er(e.message||String(e))}
 });
// للاختبار فقط: رسم فريم واحد بدل تسجيل فيديو كامل
AA.make_video._renderAt=renderAt;AA.make_video._styles=STYLES;
}catch(e){try{console.warn('videotools.js:',e)}catch(_){}}
})();
