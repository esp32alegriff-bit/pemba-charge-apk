/* FARR Q Charge Ver_FarrQ_2.2 layer: Shelly charge graphs, battery % prompt, learning and live estimate.
   Loaded AFTER the main app script, so it can read S and E. Additive only: it never changes charging,
   never touches the entries (E) or the Google Sheet, and every part fails quietly if data is missing. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const n2=(v,d)=>v==null||isNaN(v)?'--':Number(v).toFixed(d);
const row=(a,b)=>`<div class="row"><span>${a}</span><b style="text-align:right">${b}</b></div>`;
const say=m=>{try{toast(m);}catch(e){}};
const call=(m,a)=>window.farrCall?window.farrCall(m,a):Promise.reject(new Error('Only works inside the Android app'));
const syncc=(m,a)=>window.farrSync?window.farrSync(m,a):null;
const rate=()=>{try{return +S.rateHome||3.88;}catch(e){return 3.88;}};
const pack=()=>{try{return +S.pack||42.7;}catch(e){return 42.7;}};
const lossPct=()=>{try{return S.loss==null||isNaN(+S.loss)?10:+S.loss;}catch(e){return 10;}};
const hhmm=ts=>new Date(ts).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
const dstamp=ts=>new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const dur=s=>{s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+' h '+m+' min':m+' min';};
const durMin=m=>dur(m*60);
const lsGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const VER=()=>window.FARR_VER||'';
const DEF_PACK=42.7;

/* ---------- stored battery % readings (kept apart from the trip and charge logs) ---------- */
let PCT=lsGet('farrq.sessPct',[]);
function addPct(pct,src,kwh){
  PCT.push({ts:Date.now(),pct:Math.round(pct*10)/10,src:src||'prompt',kwh:kwh==null?null:Math.round(kwh*1000)/1000});
  PCT.sort((a,b)=>a.ts-b.ts); if(PCT.length>800)PCT=PCT.slice(-800);
  lsSet('farrq.sessPct',PCT); MODEL=null;
}
function anchors(){
  const a=PCT.map(p=>({ts:p.ts,pct:+p.pct,kwh:p.kwh,src:'session'}));
  try{(E||[]).forEach(e=>{if(e&&typeof e.pct==='number'&&e.ts&&!e.auto&&e.pct>=0&&e.pct<=100)a.push({ts:e.ts,pct:e.pct,kwh:null,src:'log'});});}catch(x){}
  return a.sort((x,y)=>x.ts-y.ts);
}

/* ---------- measured Shelly sessions and minute data ---------- */
let MSL=[],MSstamp=0;
function sessions(force){
  if(force||Date.now()-MSstamp>20000){const s=syncc('sessions');MSL=((s&&s.sessions)||[]).filter(x=>x&&x.start_ms&&x.end_ms&&x.kwh>0).sort((a,b)=>a.start_ms-b.start_ms);MSstamp=Date.now();}
  return MSL;
}
let MINS=lsGet('farrq.mins',{});
function saveMins(){
  const ks=Object.keys(MINS).sort((a,b)=>+a-+b);
  while(ks.length>120)delete MINS[ks.shift()];
  lsSet('farrq.mins',MINS);
}
async function minutesFor(startMs,endMs,open){
  if(!open&&MINS[startMs])return MINS[startMs].pts;
  const r=await call('meterMinutes',{from:Math.floor(startMs/1000)-120,to:Math.ceil(endMs/1000)+120});
  const pts=((r&&r.points)||[]).filter(p=>p[0]>=startMs-120000&&p[0]<=endMs+120000);
  if(!open&&pts.length){MINS[startMs]={pts,end:endMs};saveMins();MODEL=null;}
  return pts;
}
function cumKwh(pts,ts){let k=0;for(const p of pts){if(p[0]+60000<=ts)k+=p[1]/60000;else if(p[0]<ts)k+=p[1]/60000*((ts-p[0])/60000);}return k;}

/* ---------- learning ---------- */
let MODEL=null,MODELSIG='';
function sig(){return sessions().length+'/'+sessions().filter(x=>x.full).map(x=>x.full[0]).join('')+'/'+PCT.length+'/'+((typeof E!=='undefined'&&E)?E.length:0)+'/'+Object.keys(MINS).length+'/'+pack()+'/'+lossPct();}
function buildModel(){
  const key=sig(); if(MODEL&&MODELSIG===key)return MODEL;
  const ss=sessions().filter(s=>s.kwh>=0.2&&s.duration_s>=300), an=anchors();
  const used=new Set(), taper=[], ratioS=[], info=[];
  let sumW=0,sumB=0;
  ss.forEach((s,i)=>{
    const nextStart=i+1<ss.length?ss[i+1].start_ms:Infinity;
    let b=null,a=null;
    for(const x of an){if(x.ts<=s.start_ms+180000&&x.ts>=s.start_ms-12*3600000)b=x;}
    for(const x of an){if(x.ts>=s.end_ms-180000&&x.ts<=s.end_ms+8*3600000&&x.ts<nextStart){a=x;break;}}
    /* 2.2.3: a charge the car ended by itself (Shelly at 0 W, both relays still ON for 5 min) counts as 100%, if the kWh fits within 5% */
    let autoFull=null;
    if(s.full==='full'){
      if(a)autoFull='typed';
      else if(b){
        if(FULL_OK(b.pct,s.kwh)){a={ts:s.end_ms,pct:100,kwh:null,src:'auto'};autoFull='clean';}
        else autoFull='unsure';
      }else autoFull='nostart';
    }
    const ins=an.filter(x=>x.ts>s.start_ms+180000&&x.ts<s.end_ms-180000);
    const rec={s,b,a,ins,autoFull};info.push(rec);
    if(b&&a&&a.pct-b.pct>=15){
      const batt=pack()*(a.pct-b.pct)/100, r=s.kwh/batt;
      if(r>=1.0&&r<=1.6){sumW+=s.kwh;sumB+=batt;ratioS.push(r);used.add(s.start_ms);}
    }
    if(b&&a&&a.pct>=98&&a.pct-b.pct>=3){
      const pts=[{pct:b.pct,kwh:0,min:0}];
      const mc=MINS[s.start_ms];
      if(mc)ins.forEach(x=>{if(x.pct>pts[pts.length-1].pct&&x.pct<a.pct)pts.push({pct:x.pct,kwh:cumKwh(mc.pts,x.ts),min:(x.ts-s.start_ms)/60000});});
      pts.push({pct:a.pct,kwh:s.kwh,min:(s.end_ms-s.start_ms)/60000});
      taper.push({s,pts});used.add(s.start_ms);
    }
  });
  const ratio=sumB>0&&ratioS.length>=3?sumW/sumB:null;
  const typW=(()=>{const v=ss.map(x=>x.avg_w||0).filter(x=>x>300).sort((p,q)=>p-q);return v.length?v[Math.floor(v.length/2)]:2400;})();
  MODEL={n:used.size,nRatio:ratioS.length,ratio,ratioAll:sumB>0?sumW/sumB:null,taper,typW,total:ss.length,nAnch:an.length,info,builtAt:Date.now()};
  MODELSIG=key; return MODEL;
}
/* 2.2.3: the 5% battery check for a charge the car ended by itself (same rule as FullLogic.java) */
const FULL_TOL=5;
function FULL_OK(startPct,kwhWall){
  const stored=kwhWall/(1+lossPct()/100), end=startPct+stored/pack()*100;
  return Math.abs(end-100)<=FULL_TOL;
}
function fullCounts(){
  const M=buildModel(); const c={full:0,clean:0,unsure:0,notFull:0,nostart:0};
  sessions().forEach(s=>{if(s.full==='not_full')c.notFull++;});
  M.info.forEach(r=>{if(r.autoFull==='clean')c.clean++;else if(r.autoFull==='unsure')c.unsure++;else if(r.autoFull==='nostart')c.nostart++;if(r.s.full==='full')c.full++;});
  return c;
}
function conf(n){return n>=10?'Good':n>=3?'Improving':'Rough';}
function ratioNow(M){return M.ratio!=null?M.ratio:1+lossPct()/100;}
/* what is left to reach 100% from a battery level p */
function remaining(p,liveW){
  const M=buildModel(); p=Math.max(0,Math.min(100,p));
  const R=ratioNow(M); let out;
  const rows=[];
  M.taper.forEach(t=>{
    const P=t.pts; if(P[0].pct>p+0.5)return;
    let k,m;
    if(p>=P[P.length-1].pct){k=0;m=0;}
    else{for(let i=1;i<P.length;i++){if(P[i].pct>=p){const f=(p-P[i-1].pct)/Math.max(0.01,P[i].pct-P[i-1].pct);k=P[i-1].kwh+f*(P[i].kwh-P[i-1].kwh);m=P[i-1].min+f*(P[i].min-P[i-1].min);break;}}}
    if(k!=null)rows.push({k:t.s.kwh-k,m:(P[P.length-1].min)-m});
  });
  if(rows.length){
    const wall=rows.reduce((a,x)=>a+x.k,0)/rows.length, min=rows.reduce((a,x)=>a+x.m,0)/rows.length;
    out={wall,min,basis:'learned from '+rows.length+' full charge'+(rows.length>1?'s':''),taperN:rows.length};
  }else{
    const batt=pack()*(100-p)/100, wall=batt*R, w=(liveW&&liveW>400)?liveW:M.typW;
    out={wall,min:wall/(w/1000)*60,basis:'straight-line from '+pack().toFixed(1)+' kWh'+(M.ratio!=null?' and the measured '+((M.ratio-1)*100).toFixed(0)+'% loss':' and '+lossPct()+'% loss'),taperN:0};
  }
  out.batt=out.wall/R; out.cost=out.wall*rate(); out.n=M.n; out.conf=conf(M.n); out.pct=p;
  return out;
}

/* ---------- SVG zoom and pan charts ---------- */
let SEL=null;                 // {open, start, end}
let DATA=null;                // {pts, marks}
let VIEW=null, FULL=null, CUR=null;
const CH=[{id:'shP',name:'Power',unit:'W',idx:1,col:'var(--cyan)'},{id:'shA',name:'Current',unit:'A',idx:2,col:'var(--gold)'},{id:'shC',name:'Cost',unit:'R',col:'var(--green)'}];
function niceStep(range,n){const raw=range/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p;}
function seriesOf(c){
  const pts=DATA.pts;
  if(c.id==='shC'){let k=0;return pts.map(p=>{k+=p[1]/60000;return [p[0]+60000,k*rate()];});}
  return pts.map(p=>[p[0]+30000,p[c.idx]]);
}
function drawChart(c,host){
  const x0=VIEW[0], x1=VIEW[1];
  const W=Math.max(260,host.clientWidth||320),ml=46,mr=10,mt=14,mb=34,pw=W-ml-mr;
  const mk=DATA.marks.filter(m=>m.ts>=x0&&m.ts<=x1).sort((a,b)=>a.ts-b.ts), lastX=[-999,-999,-999,-999];
  mk.forEach(m=>{const px=ml+(m.ts-x0)/(x1-x0)*pw;let l=0;while(l<3&&px-lastX[l]<42)l++;m._l=l;lastX[l]=px;});
  const maxL=mk.reduce((a,m)=>Math.max(a,m._l),0), H=210+maxL*18, ph=H-mt-mb-maxL*18;
  const s=seriesOf(c);
  const vis=s.filter(p=>p[0]>=x0-120000&&p[0]<=x1+120000);
  let ymax=0;(vis.length?vis:s).forEach(p=>{if(p[1]>ymax)ymax=p[1];});
  let step,top;
  if(c.id==='shC'){step=5;top=Math.max(5,Math.ceil(ymax/5)*5);while(top/step>10){step*=2;top=Math.ceil(ymax/step)*step;}}
  else{ymax=Math.max(ymax*1.08,c.unit==='A'?2:100);step=niceStep(ymax,4);top=Math.ceil(ymax/step)*step;}
  const X=t=>ml+(t-x0)/(x1-x0)*pw, Y=v=>mt+ph-(v/top)*ph;
  let g='';
  for(let v=0;v<=top+1e-6;v+=step){g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/><text x="${ml-6}" y="${Y(v)+4}" text-anchor="end" style="fill:var(--muted);font-size:11px">${c.unit==='R'?'R'+v:(c.unit==='A'?v.toFixed(step<1?1:0):Math.round(v))}</text>`;}
  const span=x1-x0, ts=[1,2,5,10,15,30,60,120,180,360].map(m=>m*60000).find(m=>span/m<=5)||360*60000;
  for(let t=Math.ceil(x0/ts)*ts;t<=x1;t+=ts){g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--line);opacity:.5"/><text x="${X(t)}" y="${mt+ph+14}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${hhmm(t)}</text>`;}
  if(vis.length>1){
    let d='';vis.forEach((p,i)=>{d+=(i?'L':'M')+X(Math.max(x0,Math.min(x1,p[0])))+' '+Y(p[1]);});
    g+=`<path d="${d}" fill="none" style="stroke:${c.col}" stroke-width="2" stroke-linejoin="round"/>`;
  }else g+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" style="fill:var(--muted);font-size:13px">No minute data in this view</text>`;
  mk.forEach(m=>{
    const ty=H-mb+17-0+m._l*18-maxL*0;
    g+=`<line x1="${X(m.ts)}" x2="${X(m.ts)}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--gold)" stroke-width="1.5" stroke-dasharray="4 3"/>`+
       `<rect x="${X(m.ts)-19}" y="${mt+ph+17+m._l*18}" width="38" height="16" rx="4" style="fill:var(--gold)"/><text x="${X(m.ts)}" y="${mt+ph+29+m._l*18}" text-anchor="middle" style="fill:#1a1405;font-size:11px;font-weight:700">${Math.round(m.pct)}%</text>`;
  });
  if(CUR!=null&&CUR>=x0&&CUR<=x1){
    let best=null;s.forEach(p=>{if(best==null||Math.abs(p[0]-CUR)<Math.abs(best[0]-CUR))best=p;});
    if(best){
      const bx=X(best[0]),by=Y(best[1]),lab=hhmm(best[0])+'  '+(c.unit==='R'?'R'+best[1].toFixed(2):c.unit==='A'?best[1].toFixed(2)+' A':Math.round(best[1])+' W');
      const tx=Math.min(Math.max(bx,ml+60),W-mr-60);
      g+=`<line x1="${bx}" x2="${bx}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--text);opacity:.6"/><circle cx="${bx}" cy="${by}" r="4" style="fill:${c.col}"/><rect x="${tx-58}" y="${mt}" width="116" height="18" rx="4" style="fill:var(--panel);stroke:var(--line)"/><text x="${tx}" y="${mt+13}" text-anchor="middle" style="fill:var(--text);font-size:12px">${lab}</text>`;
    }
  }
  host.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;touch-action:pan-y;user-select:none">${g}</svg>`;
  host._geo={ml,pw};
}
function drawAll(){
  if(!DATA||!VIEW)return;
  CH.forEach(c=>{const h=$(c.id+'Host');if(h)drawChart(c,h);});
}
function setView(a,b){
  const full=FULL[1]-FULL[0], min=Math.min(3*60000,full);
  let span=Math.max(min,Math.min(full,b-a));
  a=Math.max(FULL[0],Math.min(FULL[1]-span,a)); VIEW=[a,a+span];
}
function attach(host){
  if(host._att)return; host._att=true;
  const ptrs=new Map(); let moved=false,lastD=0;
  host.addEventListener('pointerdown',e=>{try{host.setPointerCapture(e.pointerId);}catch(x){}ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;lastD=0;});
  host.addEventListener('pointermove',e=>{
    const p=ptrs.get(e.pointerId); if(!p||!VIEW||!host._geo)return;
    const pw=host._geo.pw, span=VIEW[1]-VIEW[0];
    if(ptrs.size===1){
      const dx=e.clientX-p.x; if(Math.abs(dx)>0){if(Math.abs(dx)>1)moved=true; setView(VIEW[0]-dx/pw*span,VIEW[1]-dx/pw*span);}
      p.x=e.clientX;p.y=e.clientY; drawAll();
    }else if(ptrs.size===2){
      p.x=e.clientX;p.y=e.clientY;
      const [a,b]=[...ptrs.values()], d=Math.abs(a.x-b.x)||1, mid=(a.x+b.x)/2;
      if(lastD){const f=lastD/d, r=host.getBoundingClientRect(), fx=Math.max(0,Math.min(1,(mid-r.left-host._geo.ml)/pw)), cx=VIEW[0]+fx*span, ns=span*f; setView(cx-fx*ns,cx-fx*ns+ns);}
      lastD=d;moved=true;drawAll();
    }
  });
  const up=e=>{
    const had=ptrs.has(e.pointerId); ptrs.delete(e.pointerId); lastD=0;
    if(had&&!moved&&ptrs.size===0&&host._geo){const r=host.getBoundingClientRect();CUR=VIEW[0]+(e.clientX-r.left-host._geo.ml)/host._geo.pw*(VIEW[1]-VIEW[0]);drawAll();}
  };
  host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  host.addEventListener('wheel',e=>{
    if(!VIEW||!host._geo)return; e.preventDefault();
    const r=host.getBoundingClientRect(), fx=Math.max(0,Math.min(1,(e.clientX-r.left-host._geo.ml)/host._geo.pw)), span=VIEW[1]-VIEW[0], cx=VIEW[0]+fx*span, ns=span*(e.deltaY>0?1.25:0.8);
    setView(cx-fx*ns,cx-fx*ns+ns);drawAll();
  },{passive:false});
}

/* ---------- Graphs screen: three Shelly charts for the current or a past session ---------- */
function ensureGraphDom(){
  if($('shHead'))return;
  const sg=document.getElementById('s-graph'); if(!sg)return;
  const btn=[...sg.children].filter(x=>x.tagName==='BUTTON').pop();
  const wrap=document.createElement('div'); wrap.id='shWrap';
  wrap.innerHTML=`<div class="card" id="shHead"><div class="label">Shelly charge graphs</div>
    <div class="small" id="shSub" style="margin:4px 0 8px">Pinch or drag to zoom and move. Tap a spot to read it. Gold tags are battery % you entered.</div>
    <select id="shPick" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:15px;font-family:inherit" onchange="farr22.pick(this.value)"></select>
    <div class="pair" style="margin-top:8px"><button class="chip" onclick="farr22.reset()">Reset zoom</button><button class="chip" onclick="farr22.askNow()">Enter battery %</button></div>
    <div id="shInfo" style="margin-top:8px"></div></div>`+
    CH.map(c=>`<div class="card"><div class="label">${c.name} (${c.unit==='R'?'Rands, R5 steps':c.unit})</div><div id="${c.id}Host" style="margin-top:6px"></div></div>`).join('');
  sg.insertBefore(wrap,btn||null);
  CH.forEach(c=>attach($(c.id+'Host')));
}
function pickList(){
  const L=window.__L22, live=L&&L.live&&L.live.charging&&L.live.session;
  const ss=sessions().slice().reverse().slice(0,60);
  const sel=$('shPick'); if(!sel)return;
  let h=''; if(live)h+=`<option value="open">Current session (charging now)</option>`;
  h+=ss.map(s=>`<option value="${s.start_ms}">${dstamp(s.start_ms)} · ${n2(s.kwh,2)} kWh · ${dur(s.duration_s)}</option>`).join('');
  if(!h)h='<option value="">No Shelly sessions yet</option>';
  sel.innerHTML=h;
  if(SEL)sel.value=SEL.open?'open':String(SEL.start);
}
async function loadSel(){
  const info=$('shInfo'); if(!SEL){if(info)info.innerHTML='<div class="small">No Shelly session to show yet. Graphs appear after the first charge measured by the Shelly.</div>';DATA=null;CH.forEach(c=>{const h=$(c.id+'Host');if(h)h.innerHTML='';});return;}
  if(info)info.innerHTML='<div class="small">Loading minute data from the Shelly…</div>';
  try{
    const end=SEL.open?Date.now():SEL.end, pts=await minutesFor(SEL.start,end,SEL.open);
    const marks=anchors().filter(a=>a.ts>=SEL.start-600000&&a.ts<=end+600000).map(a=>({ts:a.ts,pct:a.pct}));
    DATA={pts,marks};
    FULL=[SEL.start-60000,Math.max(end,(pts.length?pts[pts.length-1][0]+60000:end))+60000];
    if(!VIEW||VIEW._k!==SEL.start+(SEL.open?'o':'')){VIEW=[FULL[0],FULL[1]];VIEW._k=SEL.start+(SEL.open?'o':'');}
    else setView(VIEW[0],VIEW[1]);
    let kwh=0,pk=0;pts.forEach(p=>{kwh+=p[1]/60000;pk=Math.max(pk,p[3]||p[1]);});
    const pc=marks.length?marks.map(m=>Math.round(m.pct)+'% at '+hhmm(m.ts)).join(', '):'none entered';
    if(info)info.innerHTML=row('Started',dstamp(SEL.start))+row(SEL.open?'Running for':'Length',dur(((SEL.open?Date.now():SEL.end)-SEL.start)/1000))+row('Energy (wall)',n2(kwh,2)+' kWh')+row('Cost at home rate','R'+n2(kwh*rate(),2))+row('Peak power',Math.round(pk)+' W')+row('Battery %',esc(pc));
    drawAll();
  }catch(e){
    if(info)info.innerHTML='<div class="small">Could not read the minute data: '+esc(e.message)+'. Join the home Wi-Fi and open this page again.</div>';
    DATA=null;
  }
}
function defaultSel(){
  const L=window.__L22, live=L&&L.live&&L.live.charging&&L.live.session;
  if(live)return {open:true,start:L.live.session.start_ms};
  const ss=sessions(); const s=ss[ss.length-1]; return s?{open:false,start:s.start_ms,end:s.end_ms}:null;
}
function paintGraphs(){
  ensureGraphDom(); sessions(true);
  if(!SEL)SEL=defaultSel();
  pickList(); loadSel();
}
let graphTimer=null;
setInterval(()=>{const on=document.getElementById('s-graph');if(on&&on.classList.contains('on')&&SEL&&SEL.open&&document.visibilityState==='visible')loadSel();},60000);

/* ---------- History: list of Shelly sessions to graph ---------- */
function paintHistShelly(){
  const h=document.getElementById('s-hist'); if(!h)return;
  let c=$('histShelly'); if(!c){c=document.createElement('div');c.className='card';c.id='histShelly';h.appendChild(c);}
  const ss=sessions(true).slice().reverse().slice(0,25), an=anchors();
  if(!ss.length){c.innerHTML='<div class="label">Shelly charge sessions</div><div class="small" style="margin-top:6px">No Shelly sessions yet.</div>';return;}
  c.innerHTML='<div class="label">Shelly charge sessions</div><div class="small" style="margin:4px 0 6px">Tap Graph to see power, current and cost over time.</div>'+ss.map(s=>{
    const pc=an.filter(a=>a.ts>=s.start_ms-600000&&a.ts<=s.end_ms+600000).map(a=>Math.round(a.pct)+'%').join(' → ');
    const rec=calcAll().find(c=>c.s.start_ms===s.start_ms);
    const cl=window.PEMBA_V?'':rec&&rec.status==='calc'?'<div class="small" style="color:var(--gold)">Before % calculated: '+Math.round(rec.before)+'% to '+Math.round(rec.after)+'% ('+rec.quality+')</div>':(rec&&rec.status==='pending'?'<div class="small" style="color:var(--gold)">Charge before not recorded. It is calculated from your next Anytime log.</div>':'');
    return `<div class="row"><div>${dstamp(s.start_ms)}<div class="small">${n2(s.kwh,2)} kWh · ${dur(s.duration_s)} · R${n2(s.kwh*rate(),2)}${pc?' · '+esc(pc):''}</div>${cl}</div><button class="chip" onclick="farr22.show(${s.start_ms})">Graph</button></div>`;
  }).join('');
}

/* ---------- battery % prompt during a Shelly session ---------- */
let PST=lsGet('farrq.pctState',{}), promptOpen=null, promptWhy='';
const SAMP=[];
function noteSample(w){const now=Date.now();SAMP.push([now,+w||0]);while(SAMP.length&&now-SAMP[0][0]>6*60000)SAMP.shift();}
function sustainedDrop(peak){const now=Date.now(),w=SAMP.filter(p=>now-p[0]<=4*60000);if(w.length<5||now-w[0][0]<3*60000)return false;return w.every(p=>p[1]<0.85*peak&&p[1]>100);}
function ensurePromptDom(){
  if($('pctPrompt'))return;
  const m=$('meterCard'); if(!m)return;
  const d=document.createElement('div'); d.id='pctPrompt'; m.parentNode.insertBefore(d,m);
}
function showPrompt(why){
  ensurePromptDom(); const d=$('pctPrompt'); if(!d)return;
  promptOpen=true; promptWhy=why;
  d.innerHTML=`<div class="card" style="border-color:var(--gold)"><div class="label" style="color:var(--gold)">Battery % now?</div>
    <div class="small" style="margin:4px 0 8px">${esc(why)} Optional. It makes the charge estimates better. Charging is not affected.</div>
    <div class="pair"><input id="pctIn" type="number" inputmode="numeric" min="0" max="100" placeholder="e.g. 62" style="padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:18px;font-family:inherit;width:100%;box-sizing:border-box"><button class="btn gold" onclick="farr22.savePct()">Save</button></div>
    <button class="btn ghost" style="margin-top:8px" onclick="farr22.skipPct()">Skip</button></div>`;
}
function hidePrompt(){promptOpen=null;const d=$('pctPrompt');if(d)d.innerHTML='';}
function checkPrompt(L){
  const v=L&&L.live, se=v&&v.session, charging=!!(v&&v.charging&&se&&!L.demo);
  if(!charging){if(promptOpen)hidePrompt();return;}
  const sid=se.start_ms, now=Date.now();
  if(PST.sid!==sid){PST={sid,lastAsk:0,tapered:false,peak:0};lsSet('farrq.pctState',PST);}
  noteSample(v.watts);
  if(promptOpen)return;
  const lastPct=PCT.length?PCT[PCT.length-1].ts:0, last=Math.max(PST.lastAsk||0,lastPct>=sid-60000?lastPct:0);
  let why=null;
  if(!PST.lastAsk&&!(lastPct>=sid-60000))why='Charging has started.';
  else if(now-last>=30*60000)why='It has been 30 minutes or more since the last battery %.';
  else if(!PST.tapered&&se.peak_w>1000&&se.duration_s>600&&sustainedDrop(se.peak_w)){PST.tapered=true;lsSet('farrq.pctState',PST);why='The charge power is dropping, the battery is nearing full.';}
  if(why)showPrompt(why);
}

/* ---------- live estimate on Home ---------- */
function liveAnchor(se){
  const now=Date.now(), an=anchors().filter(a=>a.ts<=now);
  if(!an.length)return null;
  const a=an[an.length-1];
  return a;
}
function paintEst(){
  const el=$('liveEst'); if(!el)return;
  const L=window.__L22, v=L&&L.live, se=v&&v.session;
  if(!(v&&v.charging&&se&&!L.demo)){el.innerHTML='';return;}
  const M=buildModel(), a=liveAnchor(se);
  let p0=a?a.pct:null, enteredHere=!!(a&&a.src==='session'&&a.ts>=se.start_ms-60000), kwhSince;
  if(a){
    if(enteredHere&&a.kwh!=null)kwhSince=Math.max(0,se.kwh-a.kwh);
    else{
      kwhSince=se.kwh; const ss=sessions();
      ss.forEach(s=>{if(s.end_ms>a.ts&&s.start_ms<se.start_ms)kwhSince+=s.kwh;});
    }
  }
  if(p0==null){el.innerHTML=`<div class="card"><div class="hdr-row"><div class="label">Live charge estimate</div><div class="small">Rough</div></div><div class="small">Enter a battery % to see the time, kWh and cost to 100%. Delivered so far: ${n2(se.kwh,2)} kWh.</div><button class="btn ghost" style="margin-top:8px" onclick="farr22.askNow()">Enter battery %</button></div>`;return;}
  const R=ratioNow(M), pNow=Math.min(100,p0+100*(kwhSince/R)/pack());
  const full=pNow>=99.5, e=remaining(pNow,v.watts);
  const basis=enteredHere?'From the battery % you entered at '+hhmm(a.ts)+' and the live Shelly reading.':'Based on kWh only: the last known battery % ('+Math.round(p0)+'%) plus the energy delivered since.';
  el.innerHTML=`<div class="card"><div class="hdr-row"><div class="label">Live charge estimate</div><div class="small">${e.conf} · ${M.n} session${M.n===1?'':'s'}</div></div>`+
    row('Battery now (estimated)','≈ '+Math.round(pNow)+'%')+
    (full?row('Status','About full'):
    row('Time left to 100%',durMin(e.min))+row('Expected finish',hhmm(Date.now()+e.min*60000))+
    row('kWh still to deliver (wall)',n2(e.wall,2)+' kWh')+row('kWh still to go into battery',n2(e.batt,2)+' kWh')+
    row('Cost to 100% at home rate','R'+n2(e.cost,2)))+
    `<div class="small" style="margin-top:6px">${esc(basis)} ${esc(e.basis)}.</div>`+
    `<div class="pair" style="margin-top:8px"><button class="chip" onclick="farr22.askNow()">Enter battery %</button><button class="chip" onclick="farr22.show(${se.start_ms},true)">Charge graphs</button></div></div>`;
}

/* ---------- Learning and estimates page ---------- */
function curveSVG(M){
  const ps=[50,55,60,65,70,75,80,85,90,95,98], d=ps.map(p=>({p,e:remaining(p,M.typW)}));
  const W=Math.max(280,($('learnBody')&&$('learnBody').clientWidth-28)||320),H=170,ml=44,mr=10,mt=10,mb=26,pw=W-ml-mr,ph=H-mt-mb;
  const mx=Math.max(30,...d.map(x=>x.e.min)), top=Math.ceil(mx/30)*30;
  const X=p=>ml+(p-50)/48*pw, Y=m=>mt+ph-m/top*ph;
  let g='';for(let v=0;v<=top;v+=top/4)g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/><text x="${ml-6}" y="${Y(v)+4}" text-anchor="end" style="fill:var(--muted);font-size:11px">${Math.round(v)}m</text>`;
  ps.filter((p,i)=>i%2===0).forEach(p=>{g+=`<text x="${X(p)}" y="${H-8}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${p}%</text>`;});
  g+=`<path d="${d.map((x,i)=>(i?'L':'M')+X(x.p)+' '+Y(x.e.min)).join('')}" fill="none" style="stroke:var(--cyan)" stroke-width="2.5"/>`;
  d.forEach(x=>{g+=`<circle cx="${X(x.p)}" cy="${Y(x.e.min)}" r="3" style="fill:${x.e.taperN?'var(--green)':'var(--muted)'}"/>`;});
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
let learnBusy=false;
async function prefetch(){
  if(learnBusy)return; learnBusy=true; let got=0;
  try{
    const ss=sessions().filter(x=>x.kwh>=0.1&&!MINS[x.start_ms]).slice().reverse();
    for(const r of ss){
      if(got>=6)break;
      try{await minutesFor(r.start_ms,r.end_ms,false);got++;}catch(e){break;}
    }
  }finally{learnBusy=false;}
  return got;
}
function paintLearn(){
  const body=$('learnBody'); if(!body)return;
  sessions(true);
  const M=buildModel(), c=conf(M.n), R=ratioNow(M);
  const rebuilt=lsGet('farrq.learnVer','');
  if(rebuilt!==VER()){lsSet('farrq.learnVer',VER());MODEL=null;}
  const rows=[50,60,70,80,85,90,95,98].map(p=>{const e=remaining(p,M.typW);return `<div class="row"><span>${p}% → 100%</span><b style="text-align:right">${durMin(e.min)} · ${n2(e.wall,1)} kWh · R${n2(e.cost,0)}</b></div>`;}).join('');
  body.innerHTML=
    `<div class="card"><div class="hdr-row"><div class="label">How sure the estimates are</div><div class="small"><b>${c}</b></div></div>`+
    row('Shelly sessions stored',M.total)+row('Sessions used for learning',M.n)+row('Full charges used for the taper',M.taper.length)+
    row('Battery % readings stored',M.nAnch)+
    (()=>{const f=fullCounts();return row('Full charges the car ended by itself',f.full)+row('Used for learning (within 5%)',f.clean)+row('Kept in the log, not used for learning',f.unsure+f.nostart)+row('Stopped by a relay, not full',f.notFull);})()+
    `<div class="small" style="margin-top:6px">Rough is 0 to 2 sessions, Improving is 3 to 9, Good is 10 or more. Until there is enough history the app uses ${pack().toFixed(1)} kWh and the ${lossPct()}% loss from Settings.</div></div>`+
    `<div class="card"><div class="label">Wall to battery</div>`+
    row('Used now',M.ratio!=null?'measured '+R.toFixed(2)+' (loss ≈ '+((R-1)*100).toFixed(0)+'%)':'setting '+R.toFixed(2)+' (loss '+lossPct()+'%)')+
    row('Sessions with start and end %',M.nRatio)+
    `<div class="small" style="margin-top:6px">${M.ratio!=null?'The measured value is used because 3 or more sessions have a start and end battery %.':'The measured value is used once 3 sessions have a start and end battery %.'} Your Settings value is not changed.</div></div>`+
    `<div class="card"><div class="label">Taper near 100%</div><div class="small" style="margin:4px 0 6px">Time left to 100% from each battery level. Green dots are learned, grey dots are straight-line.</div><div id="learnCurve">${curveSVG(M)}</div>${rows}</div>`+
    `<div class="card"><div class="label">Estimate from any battery %</div><div class="field" style="margin-top:8px"><label for="lnPct">Battery % now</label><input id="lnPct" type="number" inputmode="numeric" min="0" max="100" oninput="farr22.est()"></div><div id="lnOut" class="small">Type a battery % to see the time, kWh and cost to 100%.</div></div>`+
    `<div class="card"><div class="small" id="lnFetch">Figures rebuilt from all stored sessions for ${esc(VER())}. Minute detail for older sessions is fetched from the Shelly when you are on home Wi-Fi.</div><button class="btn ghost" style="margin-top:8px" onclick="farr22.fetch()">Fetch charge detail now</button></div>`;
  prefetch().then(n=>{if(n){MODEL=null;if(document.getElementById('s-learn').classList.contains('on'))paintLearn();}}).catch(()=>{});
}
function estFromInput(){
  const el=$('lnOut'), v=parseFloat(($('lnPct')||{}).value); if(!el)return;
  if(isNaN(v)||v<0||v>100){el.textContent='Type a battery % between 0 and 100.';return;}
  const L=window.__L22, w=L&&L.live&&L.live.charging?L.live.watts:null, e=remaining(v,w);
  el.innerHTML=row('Time to 100%',durMin(e.min))+row('Finish if started now',hhmm(Date.now()+e.min*60000))+row('kWh from the wall',n2(e.wall,2)+' kWh')+row('kWh into the battery',n2(e.batt,2)+' kWh')+row('Cost at home rate','R'+n2(e.cost,2))+row('Confidence',e.conf+' · '+e.n+' session'+(e.n===1?'':'s'))+`<div class="small" style="margin-top:6px">${esc(e.basis)}.</div>`;
}


/* ---------- 2.2.2: calculated battery % (separate, display only: it never feeds a total) ---------- */
function effNow(){try{const e=summ(rowsFor('all')).eff;return e&&e>5&&e<40?e:14.4;}catch(x){return 14.4;}}
let CALC=null,CALCSIG='';
function calcAll(){
  const key=sig()+'/'+(typeof E!=='undefined'?E.length:0);
  if(CALC&&CALCSIG===key)return CALC;
  const ss=sessions().filter(s=>s.kwh>=0.2&&s.duration_s>=300);
  let src=[];try{src=[...E].sort((a,b)=>a.ts-b.ts);}catch(x){}
  const M=buildModel(),R=ratioNow(M),eff=effNow(),out=[];
  ss.forEach((s,i)=>{
    const nextStart=i+1<ss.length?ss[i+1].start_ms:Infinity;
    const added=(s.kwh/R)/pack()*100, rec={s,status:'pending',added};
    const real=src.find(e=>e.kind==='charge'&&!e.auto&&e.ts>=s.start_ms-60000&&e.ts<=Math.min(nextStart,s.end_ms+24*3600000));
    if(real){rec.status='real';rec.after=real.pct;rec.before=real.pct-added;rec.method='your Charge log';out.push(rec);return;}
    const r1=src.find(e=>e.ts>=s.end_ms-180000&&e.ts<nextStart&&e.kind==='trip');
    if(!r1){out.push(rec);return;}
    const r0=[...src].reverse().find(e=>e.ts<=s.start_ms+180000&&e.ts<r1.ts);
    rec.r1=r1;rec.r0=r0||null;rec.after=r1.pct;rec.before=r1.pct-added;rec.method='next Anytime log';
    rec.gapH=(r1.ts-s.end_ms)/3600000;
    rec.status=(rec.before<-3||rec.before>100)?'check':'calc';
    if(r0){rec.km=Math.max(0,r1.odo-r0.odo);rec.fwd=r0.pct-rec.km*eff/pack();rec.diff=Math.abs(rec.before-rec.fwd);rec.quality=(rec.diff<=3&&rec.gapH<=14)?'good':'estimate';}
    else rec.quality='estimate';
    out.push(rec);
  });
  CALC=out;CALCSIG=key;return out;
}
window.farrFullTag=function(r){
  try{
    if(!r||r.type!=='charge')return '';
    const s=sessions().find(x=>x.end_ms===r.ts)||sessions().find(x=>r.ts>=x.start_ms-60000&&r.ts<=x.end_ms+24*3600000&&x.full);
    if(!s||!s.full)return '';
    if(s.full==='full'){
      const rec=buildModel().info.find(x=>x.s.start_ms===s.start_ms);
      const used=rec&&rec.autoFull==='clean';
      return '<span class="tag g">FULL CHARGE</span>'+(used?'':'<span class="tag">NOT USED FOR LEARNING</span>');
    }
    if(s.full==='not_full')return '<span class="tag">NOT FULL</span>';
    return '<span class="tag g">FULL CHARGE?</span><span class="tag">NOT USED FOR LEARNING</span>';
  }catch(e){}
  return '';
};
window.farrCalcTag=function(r){
  try{
    if(!r||!r.auto)return '';
    const rec=calcAll().find(x=>x.s.end_ms===r.ts); if(!rec)return '';
    const st='<div class="small" style="color:var(--gold)">';
    if(rec.status==='calc')return st+'Before % calculated: '+Math.round(rec.before)+'% to '+Math.round(rec.after)+'% ('+rec.quality+')</div>';
    if(rec.status==='pending')return st+'Charge before not recorded. It is calculated from your next Anytime log.</div>';
    if(rec.status==='check')return st+'Before % could not be calculated. Check your readings.</div>';
  }catch(e){}
  return '';
};

/* ---------- 2.2.2: data for the PDF report pages ---------- */
function nowKwhAt(pts,ts){return cumKwh(pts,ts);}
function reportData(cut){
  const M=buildModel(),R=ratioNow(M),calc=calcAll();
  const ss=sessions().filter(x=>x.end_ms>=(cut||0)&&x.kwh>=0.1).sort((a,b)=>a.start_ms-b.start_ms);
  const items=ss.map(x=>{
    const mc=MINS[x.start_ms], pts=mc?mc.pts:null;
    const marks=PCT.filter(p=>p.ts>=x.start_ms-600000&&p.ts<=x.end_ms+600000);
    const batt=x.kwh/R, lossK=x.kwh-batt;
    let avgA=null,peakA=null;
    if(pts&&pts.length){let sa=0,n=0;pts.forEach(p=>{if(p[1]>100){sa+=p[2];n++;}peakA=Math.max(peakA||0,p[2]);});avgA=n?sa/n:null;}
    return {s:x,pts,marks,rec:calc.find(c=>c.s.start_ms===x.start_ms)||null,batt,lossK,lossR:lossK*rate(),cost:x.kwh*rate(),avgA,peakA,
      lossW:x.duration_s>0?lossK*3600000/x.duration_s:0};
  });
  const est=[50,60,70,80,85,90,95,98].map(p=>Object.assign({p},remaining(p,M.typW)));
  let al=[];try{al=((syncc('alerts')||{}).alerts||[]).filter(a=>!a.demo&&a.ts>=(cut||0));}catch(e){}
  return {M,R,calc,items,est,pct:PCT.filter(p=>p.ts>=(cut||0)),alerts:al,typW:M.typW,conf:conf(M.n)};
}
async function prepareReport(cut){
  const ss=sessions(true).filter(x=>x.end_ms>=(cut||0)&&x.kwh>=0.1&&!MINS[x.start_ms]).slice(-25);
  for(const x of ss){
    try{await Promise.race([minutesFor(x.start_ms,x.end_ms,false),new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')),8000))]);}
    catch(e){break;}
  }
}

/* ---------- 2.2.2: extra detail copied to the Google Sheet (only when the new script is in place) ---------- */
function setSig(){try{return [S.rateHome,S.rateStation,S.rateSolar,S.loss,S.pack,S.claim,S.petrol,S.compare,S.carPrice].join('|');}catch(e){return '';}}
function sheetExtra(){
  const M=buildModel(),R=ratioNow(M),calc=calcAll(),all=sessions(true).slice(-300),ss=all.filter(x=>!x.from_sheet);   // 2.2.4: copies that came from the Sheet only count in the totals, never as detail rows
  const iso=ts=>ts||0;
  // settings log: a row each time a rate or car setting changes
  let log=lsGet('farrq.setLog',[]);const sg=setSig();
  if(sg&&(!log.length||log[log.length-1].sig!==sg)){log.push({ts:Date.now(),sig:sg,v:[S.rateHome,S.rateStation,S.rateSolar,S.loss,S.pack,S.claim,S.petrol,S.compare,S.carPrice]});log=log.slice(-60);lsSet('farrq.setLog',log);}
  const sent=lsGet('farrq.minSent',[]);
  const detail=ss.map(x=>{
    const rec=calc.find(c=>c.s.start_ms===x.start_ms), batt=x.kwh/R, mc=MINS[x.start_ms];
    let avgA='',peakA='';if(mc&&mc.pts.length){let sa=0,n=0,pk=0;mc.pts.forEach(p=>{if(p[1]>100){sa+=p[2];n++;}pk=Math.max(pk,p[2]);});avgA=n?+(sa/n).toFixed(2):'';peakA=+pk.toFixed(2);}
    const b=rec&&rec.before!=null?Math.round(rec.before*10)/10:'', a=rec&&rec.after!=null?Math.round(rec.after*10)/10:'';
    return {start:x.start_ms,end:x.end_ms,min:Math.round(x.duration_s/60),wall:+(+x.kwh).toFixed(3),batt:+batt.toFixed(3),cost:+(x.kwh*rate()).toFixed(2),
      peakW:Math.round(x.peak_w||0),avgW:Math.round(x.avg_w||0),avgA,peakA,why:x.end_reason||'',before:b,after:a,
      src:rec?(rec.status==='real'?'Charge log':rec.status==='calc'?'Calculated ('+rec.quality+')':rec.status==='check'?'Check readings':'Not recorded yet'):'',
      lossK:+(x.kwh-batt).toFixed(3),lossR:+((x.kwh-batt)*rate()).toFixed(2),rate:rate()};
  });
  const calcRows=calc.filter(c=>!(c.s&&c.s.from_sheet)).map(c=>({start:c.s.start_ms,end:c.s.end_ms,wall:+(+c.s.kwh).toFixed(3),added:+c.added.toFixed(1),
    before:c.before==null?'':+c.before.toFixed(1),after:c.after==null?'':+c.after.toFixed(1),status:c.status,method:c.method||'',quality:c.quality||'',
    laterAt:c.r1?c.r1.ts:0,laterOdo:c.r1?c.r1.odo:'',earlierAt:c.r0?c.r0.ts:0,earlierPct:c.r0?c.r0.pct:'',earlierOdo:c.r0?c.r0.odo:'',
    fwd:c.fwd==null?'':+c.fwd.toFixed(1),diff:c.diff==null?'':+c.diff.toFixed(1)}));
  const minutes=[];let rows=0;
  ss.forEach(x=>{const mc=MINS[x.start_ms];if(!mc||sent.includes(x.start_ms)||rows>1500)return;
    let k=0;const out=mc.pts.map(p=>{k+=p[1]/60000;return [p[0],p[1],p[2],p[3],+k.toFixed(4),+(k*rate()).toFixed(3)];});
    minutes.push({start:x.start_ms,rows:out});rows+=out.length;});
  const day=new Date();day.setHours(0,0,0,0);
  const est=[50,60,70,80,90,95].map(p=>remaining(p,M.typW));
  const estRow={date:day.getTime(),stored:M.total,used:M.n,conf:conf(M.n),ratio:+R.toFixed(3),loss:+((R-1)*100).toFixed(1),src:M.ratio!=null?'measured':'setting',taper:M.taper.length,
    vals:est.reduce((a,e)=>a.concat([Math.round(e.min),+e.wall.toFixed(2),+e.cost.toFixed(2)]),[])};
  const daily={};
  try{rowsFor('all').forEach(r=>{const d=new Date(r.ts);d.setHours(0,0,0,0);const k=d.getTime();const o=daily[k]||(daily[k]={date:k,trips:0,km:0,used:0,charges:0,wall:0,cost:0,shelly:0});
    if(r.type==='trip'&&r.km>0){o.trips++;o.km+=r.km;if(r.countEff)o.used+=r.used;}if(r.type==='charge'){o.charges++;o.wall+=r.wall;o.cost+=r.cost;}});}catch(e){}
  all.forEach(x=>{const d=new Date(x.end_ms);d.setHours(0,0,0,0);const o=daily[d.getTime()]||(daily[d.getTime()]={date:d.getTime(),trips:0,km:0,used:0,charges:0,wall:0,cost:0,shelly:0});o.shelly+=x.kwh;});
  const pk=(S.compare/100*S.petrol);
  const dailyRows=Object.values(daily).sort((a,b)=>a.date-b.date).slice(-120).map(o=>({date:o.date,trips:o.trips,km:+o.km.toFixed(1),used:+o.used.toFixed(2),charges:o.charges,wall:+o.wall.toFixed(2),cost:+o.cost.toFixed(2),
    shelly:+o.shelly.toFixed(2),petrol:+(o.km*pk).toFixed(2),saving:o.km>0&&o.wall>0?+(o.km*pk-o.cost).toFixed(2):''}));
  let al=[];try{al=((syncc('alerts')||{}).alerts||[]).filter(a=>!a.demo&&!a.from_sheet).slice(0,200).map(a=>({ts:a.ts,type:a.type,level:a.level,text:a.text}));}catch(e){}
  return {detail,calc:calcRows,pct:PCT.map(p=>{const x=all.find(z=>p.ts>=z.start_ms-600000&&p.ts<=z.end_ms+600000);return {ts:p.ts,pct:p.pct,src:p.src,kwh:p.kwh==null?'':p.kwh,session:x?x.start_ms:0};}),
    minutes,estimates:[estRow],daily:dailyRows,alerts:al,settings:log.map(l=>({ts:l.ts,v:l.v}))};
}
function sheetSent(extra){
  try{if(!extra||!extra.minutes)return;const sent=lsGet('farrq.minSent',[]);extra.minutes.forEach(m=>{if(!sent.includes(m.start))sent.push(m.start);});lsSet('farrq.minSent',sent.slice(-400));}catch(e){}
}

/* ---------- wiring ---------- */
const farr22={
  onLive(L){
    window.__L22=L;
    try{ensurePromptDom();checkPrompt(L);}catch(e){}
    try{paintEst();}catch(e){}
    try{if(L&&L.online&&Date.now()-(farr22._pf||0)>5*60000){farr22._pf=Date.now();setTimeout(()=>prefetch().catch(()=>{}),4000);}}catch(e){}
  },
  savePct(){
    const x=parseFloat(($('pctIn')||{}).value);
    if(isNaN(x)||x<0||x>100){say('Enter a battery % from 0 to 100');return;}
    const L=window.__L22, se=L&&L.live&&L.live.session;
    addPct(x,'prompt',se?se.kwh:null); PST.lastAsk=Date.now(); lsSet('farrq.pctState',PST);
    /* 2.2.2.1: tell the dot matrix display the battery % (best effort, only while a charge is running; never blocks the app) */
    try{if(se&&window.farrCall)window.farrCall('displayStart',{pct:Math.round(x)}).catch(()=>{});}catch(e){}
    hidePrompt(); say('Battery '+Math.round(x)+'% saved'); paintEst(); if(SEL)loadSel();
  },
  skipPct(){PST.lastAsk=Date.now();lsSet('farrq.pctState',PST);hidePrompt();},
  askNow(){
    const L=window.__L22, charging=L&&L.live&&L.live.charging;
    if(!charging){say('Battery % can be entered while a Shelly charge is running');return;}
    if(!document.getElementById('s-home').classList.contains('on'))go('home');
    showPrompt('You asked to enter the battery %.');
    const d=$('pctPrompt');if(d&&d.scrollIntoView)d.scrollIntoView({block:'center'});
  },
  pick(v){
    if(v==='open'){const L=window.__L22;SEL=L&&L.live&&L.live.session?{open:true,start:L.live.session.start_ms}:null;}
    else{const s=sessions().find(x=>String(x.start_ms)===String(v));SEL=s?{open:false,start:s.start_ms,end:s.end_ms}:null;}
    VIEW=null;CUR=null;loadSel();
  },
  show(startMs,open){
    sessions(true);
    if(open){const L=window.__L22;SEL=L&&L.live&&L.live.session?{open:true,start:L.live.session.start_ms}:null;}
    else{const s=sessions().find(x=>x.start_ms===startMs);SEL=s?{open:false,start:s.start_ms,end:s.end_ms}:null;}
    VIEW=null;CUR=null;go('graph');
    const h=$('shHead');if(h&&h.scrollIntoView)h.scrollIntoView();
  },
  reset(){if(FULL){VIEW=[FULL[0],FULL[1]];VIEW._k=SEL?SEL.start+(SEL.open?'o':''):'';CUR=null;drawAll();}},
  est:estFromInput,
  fetch(){const el=$('lnFetch');if(el)el.textContent='Fetching from the Shelly…';prefetch().then(n=>{MODEL=null;paintLearn();say(n?'Fetched '+n+' session'+(n>1?'s':''):'Nothing new to fetch');}).catch(e=>{if(el)el.textContent='Could not reach the Shelly: '+e.message;});},
  backupRows(){
    /* 2.2.3: battery % readings and the shared settings go into the pasted backup, so the other phone has the same learning data */
    const out=[];
    PCT.forEach(p=>out.push({ts:p.ts,kind:'pctread',obj:p}));
    try{const k=['pack','loss','claim','petrol','compare','rateHome','rateStation','rateSolar'],o={};k.forEach(x=>{if(S&&S[x]!=null)o[x]=S[x];});out.push({ts:Date.now(),kind:'fsettings',obj:o});}catch(e){}
    return out;
  },
  importRow(kind,obj){
    if(kind==='pctread'){
      if(!obj||typeof obj.ts!=='number'||typeof obj.pct!=='number')return true;
      if(PCT.some(p=>p.ts===obj.ts&&p.pct===obj.pct))return true;
      PCT.push({ts:obj.ts,pct:obj.pct,src:obj.src||'prompt',kwh:obj.kwh==null?null:obj.kwh});
      PCT.sort((a,b)=>a.ts-b.ts); if(PCT.length>800)PCT=PCT.slice(-800);
      lsSet('farrq.sessPct',PCT); MODEL=null; return true;
    }
    if(kind==='fsettings'){
      try{
        const stamp=lsGet('farrq.fsetStamp',0);
        if(obj&&typeof obj==='object'&&(window.__fsetTs||0)>stamp){
          ['pack','loss','claim','petrol','compare','rateHome','rateStation','rateSolar'].forEach(x=>{if(typeof obj[x]==='number'&&isFinite(obj[x]))S[x]=obj[x];});
          lsSet('farrq.fsetStamp',window.__fsetTs); MODEL=null; window.__fsetChanged=true;
        }
      }catch(e){}
      return true;
    }
    return false;
  },
  model:buildModel,remaining:remaining,anchors:anchors,addPct:addPct,calcAll:calcAll,reportData:reportData,prepareReport:prepareReport,sheetExtra:sheetExtra,sheetSent:sheetSent
};
window.farr22=farr22;
const prevOn=window.farrOnScreen;
window.farrOnScreen=function(id){
  if(prevOn)prevOn(id);
  try{
    if(id==='graph')paintGraphs();
    if(id==='hist')paintHistShelly();
    if(id==='learn')paintLearn();
    if(id==='home'){ensurePromptDom();paintEst();}
  }catch(e){}
};
try{ensurePromptDom();}catch(e){}
})();
