const header=document.getElementById('header'),progress=document.getElementById('progress'),nav=document.getElementById('navigation'),menuButton=document.getElementById('menuButton');
function onScroll(){header.classList.toggle('scrolled',window.scrollY>25);const max=document.documentElement.scrollHeight-innerHeight;progress.style.width=`${max>0?window.scrollY/max*100:0}%`;const pos=window.scrollY+innerHeight*.35;let current='home';document.querySelectorAll('main>section[id]').forEach(s=>{if(s.offsetTop<=pos)current=s.id});document.querySelectorAll('.nav-link').forEach(a=>{a.classList.toggle('active',a.getAttribute('href')==='#'+current);if(a.getAttribute('href')==='#'+current)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();
menuButton.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.textContent=open?'×':'☰'});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.textContent='☰'}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

// ISSUU-inspired book reader: actual page surfaces, no mid-turn image swaps.
const chapterStarts={innovation:6,design:14,visual:22,education:34};
const totalPages=44;
const book=document.getElementById('book'),bookArea=document.getElementById('bookArea');
const leftPanel=document.getElementById('bookLeft'),rightPanel=document.getElementById('bookRight');
const imgLeft=document.getElementById('bookLeftImage'),imgRight=document.getElementById('bookRightImage');
const previous=document.getElementById('prevPage'),next=document.getElementById('nextPage'),counter=document.getElementById('bookCount');
const tabs=[...document.querySelectorAll('.book-tab')];
const leaf=document.getElementById('flipLeaf');
const leafFront=document.getElementById('flipFrontImage'),leafBack=document.getElementById('flipBackImage');
const pageSrc=n=>'assets/book/p'+String(n).padStart(2,'0')+'.webp';
const singlePage=()=>window.matchMedia('(max-width:650px)').matches;
const pad=n=>String(n).padStart(2,'0');
const reduceMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentPage=1,turning=false,queued=0,activeAnimation=null,flipGeneration=0;
const FLIP_MS=480;
const imageCache=new Map();
function preload(n){
 if(!n||n<1||n>totalPages)return Promise.resolve();
 if(imageCache.has(n))return imageCache.get(n);
 const im=new Image();im.src=pageSrc(n);
 const ready=im.decode?im.decode().catch(()=>{}):new Promise(resolve=>{im.onload=resolve;im.onerror=resolve;});
 imageCache.set(n,ready);return ready;
}
function spreadStart(page){if(page===1||page===44)return page;return page%2===0?page:page-1;}
function spreadFor(page){
 if(singlePage())return {start:page,end:page,left:null,right:page,kind:'mobile'};
 const start=spreadStart(page);
 if(start===1)return {start:1,end:1,left:null,right:1,kind:'cover'};
 if(start===44)return {start:44,end:44,left:44,right:null,kind:'back'};
 return {start,end:start+1,left:start,right:start+1,kind:'open'};
}
function chapterForPage(page){let active=null;for(const [name,n] of Object.entries(chapterStarts))if(page>=n)active=name;return active;}
function setImage(img,n){const src=n?pageSrc(n):'';if(img.getAttribute('src')!==src)img.setAttribute('src',src);img.alt=n?`作品集第 ${n} 頁`:'';}
function showPanels(left,right){
 setImage(imgLeft,left);setImage(imgRight,right);
 leftPanel.classList.toggle('empty',!left);rightPanel.classList.toggle('empty',!right);
}
function paint(page){
 const p=spreadFor(page);book.classList.toggle('single-cover',p.kind==='cover');book.classList.toggle('single-back',p.kind==='back');
 showPanels(p.left,p.right);
 counter.textContent=pad(p.start)+(p.start===p.end?'':' – '+pad(p.end))+' / '+pad(totalPages);
 previous.disabled=p.start===1;next.disabled=p.end===44;
 const chapter=chapterForPage(p.start);
 tabs.forEach(btn=>{const selected=btn.dataset.chapter===chapter;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));});
}
function prepareNeighbors(page){
 const p=spreadFor(page);
 [p.start-4,p.start-3,p.start-2,p.start-1,p.start,p.end,p.end+1,p.end+2,p.end+3,p.end+4].forEach(preload);
}
function targetPage(dir){const s=spreadFor(currentPage);return singlePage()?currentPage+dir:dir>0?s.end+1:(s.start===44?42:s.start===2?1:s.start-2);}
// Canvas page curl: a deforming paper surface, not a rigid rotateY panel.
// The visible sheet is sliced into narrow image strips whose positions follow a
// smooth folded curve. Other pages remain stationary beneath the moving sheet.
const curlCanvas=document.createElement('canvas');
curlCanvas.id='paperCurl';curlCanvas.setAttribute('aria-hidden','true');
book.appendChild(curlCanvas);
const curlContext=curlCanvas.getContext('2d',{alpha:true});
let animationFrame=0;
function cleanupFlip(){
 if(animationFrame)cancelAnimationFrame(animationFrame);
 animationFrame=0;
 curlCanvas.style.display='none';
 book.classList.remove('flipping','book-reversing');turning=false;
}
function paperImage(n){return n?document.querySelector('img[data-preload-page="'+n+'"]')||imageObjects.get(n):null;}
const imageObjects=new Map();
function cachedImage(n){
 if(!n)return null;
 if(!imageObjects.has(n)){
  const im=new Image();im.decoding='async';im.src=pageSrc(n);imageObjects.set(n,im);
 }
 return imageObjects.get(n);
}
function drawCurl(progress,dir,front,back,before,after){
 const canvas=curlCanvas,ctx=curlContext;
 const width=book.clientWidth,height=book.clientHeight;
 if(!width||!height)return;
 const ratio=Math.min(1.35,window.devicePixelRatio||1);
 const cw=Math.round(width*ratio),ch=Math.round(height*ratio);
 if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.clearRect(0,0,width,height);
 const mobile=singlePage(),half=mobile?width:width/2;
 const spine=mobile?(dir>0?0:width):width/2;
 const coverOffset=!mobile&&before.kind==='cover'&&dir>0?-half/2*(1-progress):0;
 const backOffset=!mobile&&after.kind==='back'&&dir>0?-half/2*progress:0;
 const offset=coverOffset+backOffset;
 const t=progress;
 const sign=dir>0?1:-1;
 const fold=Math.sin(Math.PI*t);
 const frontSide=t<0.5;
 const im=cachedImage(frontSide?front:back);
 if(!im||!im.complete||!im.naturalWidth)return;
 const strips=42;
 const position=u=>spine+offset+sign*((1-2*t)*u+0.19*fold*Math.sin(Math.PI*u))*half;
 // Inner shadow below the curled sheet; the page edges receive their own shading.
 ctx.save();
 const sh=ctx.createLinearGradient(spine-34,0,spine+34,0);
 sh.addColorStop(0,'rgba(17,35,54,0)');sh.addColorStop(.5,`rgba(17,35,54,${(0.08+0.14*fold).toFixed(3)})`);sh.addColorStop(1,'rgba(17,35,54,0)');
 ctx.fillStyle=sh;ctx.fillRect(spine-34,0,68,height);
 ctx.restore();
 for(let i=0;i<strips;i++){
  const u0=i/strips,u1=(i+1)/strips;
  const x0=position(u0),x1=position(u1);
  const destLeft=Math.min(x0,x1),destWidth=Math.max(0.6,Math.abs(x1-x0)+1.1);
  const normalOrientation=(frontSide&&dir>0)||(!frontSide&&dir<0);
  const sx=normalOrientation?u0*im.naturalWidth:(1-u1)*im.naturalWidth;
  const sw=(u1-u0)*im.naturalWidth;
  if(!Number.isFinite(destLeft)||!Number.isFinite(destWidth))continue;
  // The page rotates around the spine; its reverse side becomes visible after halfway.
  const srcX=Math.max(0,Math.floor(sx));
  const srcW=Math.min(im.naturalWidth-srcX,Math.ceil(sw+1));
  ctx.drawImage(im,srcX,0,srcW,im.naturalHeight,destLeft,0,destWidth,height);
  const slope=Math.abs(x1-x0)/Math.max(1,half/strips);
  const shade=0.04+0.26*fold*(1-Math.min(1,slope)) + 0.08*fold*Math.sin(Math.PI*(u0+u1)/2);
  ctx.fillStyle=`rgba(22,35,49,${Math.min(.34,shade).toFixed(3)})`;
  ctx.fillRect(destLeft,0,destWidth,height);
 }
 // Shaded outer edge and soft sheen reinforce a paper rather than a rigid-card feel.
 const edgeX=position(1);
 ctx.fillStyle=`rgba(255,255,255,${(.13*fold).toFixed(3)})`;
 ctx.fillRect(edgeX-1,0,2,height);
}
async function turn(dir){
 if(turning){queued=dir;return;}
 const target=targetPage(dir);
 if(target<1||target>totalPages)return;
 const generation=++flipGeneration;
 const before=spreadFor(currentPage),after=spreadFor(target);
 turning=true;
 if(reduceMotion()){
  currentPage=target;paint(target);prepareNeighbors(target);turning=false;return;
 }
 const front=dir>0?(before.right??before.left):(before.left??before.right);
 const back=dir>0?(after.left??after.right):(after.right??after.left);
 const underLeft=singlePage()?null:(dir>0?before.left:after.left);
 const underRight=singlePage()?after.right:(dir>0?after.right:before.right);
 // Decode both sheet faces and stationary pages before the first animation frame.
 await Promise.all([front,back,underLeft,underRight].map(n=>{cachedImage(n);return preload(n)}));
 if(!turning||generation!==flipGeneration)return;
 const frontIm=cachedImage(front),backIm=cachedImage(back);
 await Promise.all([frontIm,backIm].filter(Boolean).map(im=>im.decode?im.decode().catch(()=>{}):Promise.resolve()));
 if(!turning||generation!==flipGeneration)return;
 book.classList.remove('single-cover','single-back');
 book.classList.add('flipping');
 showPanels(underLeft,underRight);
 curlCanvas.style.display='block';
 const start=performance.now(),duration=dir>0?560:560;
 await new Promise(resolve=>{
  const tick=now=>{
   if(generation!==flipGeneration){resolve();return;}
   const linear=Math.min(1,(now-start)/duration);
   // Gentle acceleration and deceleration for a natural paper curl.
   const eased=linear*linear*(3-2*linear);
   drawCurl(eased,dir,front,back,before,after);
   if(linear>=1){animationFrame=0;resolve();}
   else animationFrame=requestAnimationFrame(tick);
  };
  animationFrame=requestAnimationFrame(tick);
 });
 if(generation!==flipGeneration)return;
 currentPage=target;
 cleanupFlip();paint(currentPage);prepareNeighbors(currentPage);
 if(queued){const q=queued;queued=0;turn(q);}
}
previous.addEventListener('click',()=>turn(-1));next.addEventListener('click',()=>turn(1));
rightPanel.addEventListener('click',()=>turn(1));leftPanel.addEventListener('click',()=>turn(-1));
rightPanel.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();turn(1)}});
for(const button of tabs)button.addEventListener('click',()=>{
 // Jump only on chapter selection. Normal turning continues seamlessly across all chapters.
 flipGeneration++;queued=0;cleanupFlip();
 const start=chapterStarts[button.dataset.chapter];currentPage=singlePage()?start:spreadStart(start);
 paint(currentPage);prepareNeighbors(currentPage);
});
document.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
 if(document.activeElement===bookArea||bookArea.contains(document.activeElement)){
  if(event.key==='ArrowRight'){event.preventDefault();turn(1)}
  if(event.key==='ArrowLeft'){event.preventDefault();turn(-1)}
 }
});
let touchX=null;
book.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].screenX},{passive:true});
book.addEventListener('touchend',e=>{if(touchX===null)return;const delta=e.changedTouches[0].screenX-touchX;touchX=null;if(Math.abs(delta)>45)turn(delta<0?1:-1)},{passive:true});
let wasSingle=singlePage();window.addEventListener('resize',()=>{const now=singlePage();if(wasSingle!==now){cleanupFlip();wasSingle=now;currentPage=now?spreadStart(currentPage):spreadStart(currentPage);paint(currentPage);prepareNeighbors(currentPage);}});
paint(currentPage);prepareNeighbors(currentPage);
// Decode current and nearby spreads only; the rest load when requested.
document.getElementById('year').textContent=new Date().getFullYear();

// Footer: copy contact details instead of starting a phone/mail app.
async function copyContact(value){
 try{if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);return true;}}catch{}
 const el=document.createElement('textarea');el.value=value;el.setAttribute('readonly','');el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();
 let ok=false;try{ok=document.execCommand('copy');}catch{}el.remove();return ok;
}
document.querySelectorAll('.copy-contact').forEach(button=>button.addEventListener('click',async()=>{
 const ok=await copyContact(button.dataset.copy);
 const hint=button.querySelector('.copy-hint');
 hint.textContent=ok?'已複製':'請手動複製';button.classList.toggle('copied',ok);
 document.getElementById('copyLive').textContent=ok?'已複製到剪貼簿':'無法自動複製，請選取文字';
 setTimeout(()=>{hint.textContent='複製';button.classList.remove('copied');},1800);
}));
