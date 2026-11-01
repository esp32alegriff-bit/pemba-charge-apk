/* Pemba Charge 1.0.0.1: electricity cost only.
   No odometer, no trips, no Anytime log, no car claim, no petrol comparison.
   The stored data format is unchanged (odometer is always 0), so Sheet script 2.2.5 keeps working
   and no distance is ever stored or sent. Loaded after farrq-22.js. */
(function(){
'use strict';
window.PEMBA_V=1;
const EFF_DEFAULT=14.5;

/* fixed settings: loss 10% (x1.10), estimated use for the km estimate */
if(!(S.effEst>0))S.effEst=EFF_DEFAULT;
S.loss=10;
if(typeof SET_FIELDS!=='undefined'&&!SET_FIELDS.includes('effEst'))SET_FIELDS.push('effEst');

/* odometer can never enter the log: every save clears it */
const _save=save;
save=function(){
  E.forEach(e=>{e.odo=0;delete e.carKm;});
  S.loss=10;
  _save();
};

/* a first, hidden starting entry so the meter can add charges from the first session */
if(!E.length){E=[{kind:'start',ts:Date.now(),odo:0,pct:50}];}
save();

const rateOf=w=>w==='Station'?S.rateStation:w==='Solar'?S.rateSolar:S.rateHome;
const kmOf=stored=>stored>0&&S.effEst>0?stored/(S.effEst/100):0;
const solarEnds=()=>Array.isArray(S.solarEnds)?S.solarEnds:[];
const dayKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
const kwh2=n=>(+n||0).toFixed(2);

/* ---------- maths: charges only ---------- */
derive=function(){
  const src=[...E].sort((a,b)=>a.ts-b.ts), out=[];
  let prev=null, lastC=0;
  for(const e of src){
    if(e.kind==='start'){prev=e;lastC=e.ts;continue;}
    if(!prev){prev=e;continue;}
    if(e.kind==='trip'){prev=e;continue;}              /* "before %" reading: no distance, never shown */
    const stored=Math.max(0,(e.pct-prev.pct)/100*S.pack);
    const m=e.where!=='Station'&&window.measuredBetween?measuredBetween(lastC,e.ts):null;
    const wall=m?m.kwh:stored*(1+S.loss/100);
    out.push({...e,type:'charge',stored,wall,cost:wall*rateOf(e.where),measured:!!m});
    prev=e;lastC=e.ts;
  }
  if(window.farrAutoRows){
    const au=farrAutoRows(src);
    au.forEach(r=>{if(solarEnds().includes(r.ts)){r.where='Solar';r.cost=r.wall*S.rateSolar;}});
    if(au.length){out.push(...au);out.sort((x,y)=>x.ts-y.ts);}
  }
  return out;
};

function totals(rows){
  const s=summ(rows), C=s.C;
  const stored=C.reduce((a,r)=>a+(r.stored||0),0);
  const eskom=C.filter(c=>c.where!=='Station'&&c.where!=='Solar').reduce((a,c)=>a+c.wall,0);
  const eskomCost=C.filter(c=>c.where!=='Station'&&c.where!=='Solar').reduce((a,c)=>a+c.cost,0);
  const solar=C.filter(c=>c.where==='Solar').reduce((a,c)=>a+c.wall,0);
  const station=C.filter(c=>c.where==='Station').reduce((a,c)=>a+c.wall,0);
  const stationCost=C.filter(c=>c.where==='Station').reduce((a,c)=>a+c.cost,0);
  const km=kmOf(stored);
  return {s,C,stored,eskom,eskomCost,solar,station,stationCost,km,perKm:km>0?s.cost/km:null};
}
window.pembaTotals=totals;

/* ---------- small bar chart: one bar per day ---------- */
function dayBars(rows,pick,fmt,color,unit){
  const C=rows.filter(r=>r.type==='charge'), days={};
  C.forEach(r=>{const k=dayKey(r.ts);if(!days[k])days[k]={v:0,ts:r.ts};days[k].v+=pick(r);});
  const keys=Object.keys(days).sort((a,b)=>days[a].ts-days[b].ts);
  if(!keys.length)return '<div class="small">No charges in this range yet.</div>';
  const W=320,H=190,L=30,R=6,T0=14,B=38,pw=W-L-R,ph=H-T0-B;
  const max=Math.max(...keys.map(k=>days[k].v),0.01), top=niceTop(max);
  const bw=pw/Math.max(keys.length,1), y=v=>T0+ph*(1-v/top);
  let g='';
  for(let i=0;i<=4;i++){const v=top*i/4;g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-4}" y="${y(v)+3}" text-anchor="end" fill="var(--muted)" font-size="9">${fmt(v)}</text>`;}
  keys.forEach((k,i)=>{
    const d=days[k], x=L+i*bw+bw*0.18, w=bw*0.64, dt=new Date(d.ts);
    g+=`<rect x="${x}" y="${y(d.v)}" width="${w}" height="${Math.max(T0+ph-y(d.v),0)}" rx="2" fill="${color}"><title>${dt.toLocaleDateString('en-ZA')}: ${fmt(d.v)}${unit}</title></rect>`;
    if(keys.length<=16){
      g+=`<text x="${x+w/2}" y="${T0+ph+13}" text-anchor="middle" fill="var(--text)" font-size="9">${dt.getDate()}</text>`;
      g+=`<text x="${x+w/2}" y="${T0+ph+25}" text-anchor="middle" fill="var(--muted)" font-size="8">${dt.toLocaleDateString('en-ZA',{weekday:'short'})}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
function niceTop(m){const p=Math.pow(10,Math.floor(Math.log10(m))),f=m/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p;}
const fmtR=v=>'R'+(v>=100?v.toFixed(0):v.toFixed(v>=10?0:1));
const fmtK=v=>v>=10?v.toFixed(0):v.toFixed(1);

/* ---------- Home: cost first ---------- */
renderHome=function(){
  const rows=rowsFor(range), t=totals(rows), s=t.s;
  const U=derive().filter(r=>r.type==='charge'&&!r.where).length;
  let a='';
  if(U)a+=`<div class="card" style="border-color:var(--gold)"><div class="small" style="color:var(--gold)">${U} charge${U>1?'s':''} still need${U>1?'':'s'} Eskom, Station or Solar. Open History to set ${U>1?'them':'it'}.</div></div>`;
  document.getElementById('homeAlert').innerHTML=a;
  document.getElementById('effLabel').textContent=range==='today'?'Charging cost, today':'Charging cost, last '+(range===1?'day':range+' days');
  document.getElementById('effBig').textContent=money(s.cost);
  document.getElementById('effSub').textContent=s.charges?(kwh2(s.wall)+' kWh at the wall · '+s.charges+' charge'+(s.charges>1?'s':'')):'No charges in this range yet';
  document.getElementById('homeBar').innerHTML=dayBars(rows,r=>r.cost,fmtR,'var(--cyan)','');
  document.getElementById('homeRows').innerHTML=[
    row('Eskom',kwh2(t.eskom)+' kWh · '+money(t.eskomCost)),
    row('Solar (free)',kwh2(t.solar)+' kWh · '+money(0)),
    row('Station',kwh2(t.station)+' kWh · '+money(t.stationCost)),
    row('Estimated distance (from kWh)','≈ '+t.km.toFixed(0)+' km'),
    row('Estimated cost per km',t.perKm==null?'--':'R'+t.perKm.toFixed(2))
  ].join('');
};

/* ---------- Charge log: before % and after % ---------- */
function lastChargeTs(){
  const c=E.filter(e=>e.kind==='charge'||e.kind==='start').reduce((m,e)=>Math.max(m,e.ts),0);
  return c;
}
openCharge=function(){
  document.getElementById('cStamp').textContent=stamp(Date.now());
  document.getElementById('cBefore').value='';
  document.getElementById('cPct').value='';
  setWhere('Home');
};
chargeCheck=function(){
  const b=parseFloat(document.getElementById('cBefore').value), p=parseFloat(document.getElementById('cPct').value);
  if(isNaN(b)||b<0||b>99)return {ok:false,msg:'Enter the battery % before charging (0 to 99).'};
  if(isNaN(p)||p<1||p>100)return {ok:false,msg:'Enter the battery % after charging (1 to 100).'};
  if(p<=b)return {ok:false,msg:'The battery % after must be higher than before.'};
  const stored=(p-b)/100*S.pack;
  const m=where!=='Station'&&window.measuredBetween?measuredBetween(lastChargeTs(),Date.now()):null;
  const wall=m?m.kwh:stored*(1+S.loss/100), rate=rateOf(where);
  return {ok:true,before:b,pct:p,stored,wall,cost:wall*rate,rate,measured:!!m};
};
previewCharge=function(){
  const c=chargeCheck(), el=document.getElementById('cPrev');
  if(!c.ok){el.textContent=c.msg;return;}
  el.textContent=(c.measured?`Wall ${kwh2(c.wall)} kWh measured by the EV meter`:`Stored ${kwh2(c.stored)} kWh · wall ${kwh2(c.wall)} kWh (+${S.loss}% loss)`)+` · ${money(c.cost)} at R${c.rate.toFixed(2)}/kWh · ≈ ${kmOf(c.stored).toFixed(0)} km`;
};
saveCharge=function(){
  const c=chargeCheck();
  if(!c.ok)return toast(c.msg);
  const last=[...E].sort((a,b)=>a.ts-b.ts).pop(), now=Date.now();
  const bts=Math.min(now-1,(last?last.ts:now-2)+1);   /* just after the last entry, so the meter sessions in between belong to this charge */
  E.push({kind:'trip',ts:bts,odo:0,pct:c.before});
  E.push({kind:'charge',ts:now,odo:0,pct:c.pct,where});
  save();toast('Charge saved');
  go('home');
};
setWhere=function(w){
  where=w;
  document.getElementById('wHome').classList.toggle('on',w==='Home');
  document.getElementById('wStation').classList.toggle('on',w==='Station');
  document.getElementById('wSolar').classList.toggle('on',w==='Solar');
  previewCharge();
};

/* mark a meter charge as Solar or Eskom (kept on this phone) */
window.pembaTagSolar=function(ts,solar){
  const a=solarEnds().filter(x=>x!==ts);
  if(solar)a.push(ts);
  S.solarEnds=a;save();renderAll();toast(solar?'Marked Solar (free)':'Marked Eskom');
};

/* ---------- History: charges only ---------- */
renderHist=function(){
  const rows=rowsFor(hRange), t=totals(rows), s=t.s;
  document.getElementById('histTotals').innerHTML=
    row('Charges',s.charges)+row('Charged (wall)',kwh2(s.wall)+' kWh')+row('Charging spend',money(s.cost))+
    row('Eskom',kwh2(t.eskom)+' kWh · '+money(t.eskomCost))+row('Solar (free)',kwh2(t.solar)+' kWh')+
    row('Station',kwh2(t.station)+' kWh · '+money(t.stationCost))+row('Estimated distance (from kWh)','≈ '+t.km.toFixed(0)+' km');
  document.getElementById('carCompare').innerHTML='';
  const list=rows.filter(r=>r.type==='charge').reverse();
  document.getElementById('histList').innerHTML=list.length?list.map(r=>{
    const w=r.where==='Solar'?'Solar':r.where==='Station'?'Station':r.where?'Eskom':'Unlogged';
    const btns=r.where?'':`<div class="pair" style="margin-top:6px"><button class="chip" onclick="setWhereOf(${r.ts},'Home')">Eskom</button><button class="chip" onclick="setWhereOf(${r.ts},'Station')">Station</button><button class="chip" onclick="setWhereOf(${r.ts},'Solar')">Solar</button></div>`;
    const tag=r.auto?`<div class="pair" style="margin-top:6px"><button class="chip ${r.where==='Solar'?'':'on'}" onclick="pembaTagSolar(${r.ts},false)">Eskom</button><button class="chip ${r.where==='Solar'?'on':''}" onclick="pembaTagSolar(${r.ts},true)">Solar</button></div>`:'';
    return `<div class="row"><div><span class="tag c">Charge</span>${r.measured?'<span class="tag g">MEASURED</span>':'<span class="tag">ESTIMATED</span>'}${r.auto?'<span class="tag">AUTO</span>':''}${stamp(r.ts)}<div class="small">${w} · ${kwh2(r.wall)} kWh wall · ≈ ${kmOf(r.stored).toFixed(0)} km${r.auto?' · added from the meter':''}</div>${btns}${tag}</div><div class="small">${money(r.cost)}</div></div>`;
  }).join(''):'<div class="small">Nothing logged in this range.</div>';
};

/* ---------- Graphs: cost and energy ---------- */
renderGraph=function(){
  const rows=rowsFor('all');
  document.getElementById('gBar').innerHTML=dayBars(rows,r=>r.cost,fmtR,'var(--cyan)','');
  document.getElementById('gPie').innerHTML=pieSVG(rows);
  document.getElementById('gLine').innerHTML=dayBars(rows,r=>r.wall,fmtK,'var(--blue)',' kWh');
};

/* ---------- no "calculated battery %" or "full charge" tags: they need the Anytime log ---------- */
window.farrCalcTag=function(){return '';};
window.farrFullTag=function(){return '';};

/* ---------- Share: cost preview ---------- */
renderShare=function(){
  const rows=rowsFor(sRange), t=totals(rows), s=t.s;
  const inc=id=>{const c=document.getElementById('inc_'+id);return c?c.checked:false;};
  let pages=1;
  if(inc('charges'))pages+=Math.max(1,Math.ceil(s.charges/40));
  if(inc('auto'))pages+=2;
  if(inc('sheet'))pages+=1;
  if(inc('method'))pages+=1;
  document.getElementById('sharePreview').innerHTML=
    `<div class="label" style="margin-bottom:6px">Preview</div>`+
    row('Period',periodName(sRange))+
    row('Charges · wall kWh',s.charges+' · '+kwh2(s.wall)+' kWh')+
    row('Charging spend',money(s.cost))+
    row('Eskom',kwh2(t.eskom)+' kWh · '+money(t.eskomCost))+
    row('Solar (free)',kwh2(t.solar)+' kWh')+
    row('Station',kwh2(t.station)+' kWh · '+money(t.stationCost))+
    row('Estimated pages',pages);
};

/* ---------- screens: hide what 1.0.0.1 does not have ---------- */
function hide(el){if(el)el.style.display='none';}
function hideField(id){const e=document.getElementById(id);if(e)hide(e.closest('.field')||e);}
function hideCard(id){const e=document.getElementById(id);if(e)hide(e.closest('.card')||e);}
['set_loss','set_claim','set_carPrice'].forEach(hideField);
['set_petrol'].forEach(hideCard);
hideCard('st_odo');                                               /* starting point card */
document.querySelectorAll('#s-set .app-row').forEach(b=>{
  const t=b.textContent||'';
  if(/Learning and estimates|Distance units/.test(t))hide(b);
});
['inc_graph','inc_trips','inc_car','inc_detail'].forEach(id=>{
  const c=document.getElementById(id);
  if(c){c.checked=false;hide(c.closest('label')||c);}
});
hide(document.getElementById('carCompare'));
const logo=document.querySelector('header img');if(logo)logo.style.filter='hue-rotate(170deg) saturate(1.1)';
const eskomBtn=document.getElementById('wHome');if(eskomBtn)eskomBtn.textContent='Eskom';

renderAll();
go('home');
})();
