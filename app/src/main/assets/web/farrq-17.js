/* FARR Q Charge Ver_FarrQ_1.7 layer.
   Adds the EV meter, relays, AUTO, calibration, alerts, demo meter and diagnostics
   on top of the unchanged 1.6 screens. Talks to the Android side through window.FarrNative.
   Loaded BEFORE the main app script, so it must not read app variables (S, E, ...) at load time. */
(function(){
'use strict';
const N=window.FarrNative||null;
window.FARR_VER='2.0.0.1';
window.FARR_APP_URL='https://github.com/esp32alegriff-bit/farr-q-charge-apk/releases/latest';

/* ---------- bridge ---------- */
let cbId=0; const pend={};
window.__farrCb=function(id,ok,txt){
  const p=pend[id]; if(!p)return; delete pend[id];
  let v=null; try{v=JSON.parse(txt);}catch(e){v={error:String(txt)};}
  if(ok)p.res(v); else p.rej(new Error((v&&v.error)||'Failed'));
};
function call(m,a){
  if(!N)return Promise.reject(new Error('Only works inside the Android app'));
  return new Promise((res,rej)=>{const id=++cbId;pend[id]={res,rej};N.call(id,m,JSON.stringify(a||{}));});
}
function sync(m,a){
  if(!N)return null;
  try{return JSON.parse(N.sync(m,JSON.stringify(a||{})));}catch(e){return null;}
}
window.farrCall=call; window.farrSync=sync;

/* ---------- sharing inside the APK (Android WebView has no Web Share) ---------- */
async function blobToB64(b){
  const u=new Uint8Array(await b.arrayBuffer()); let s='';
  for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
  return btoa(s);
}
if(N){
  try{
    navigator.canShare=function(d){return !!(d&&((d.files&&d.files.length)||d.text||d.url));};
    navigator.share=async function(d){
      d=d||{};
      if(d.files&&d.files.length){
        const f=d.files[0];
        N.shareFile(await blobToB64(f),f.name||'file',f.type||'application/octet-stream',d.title||'');
      }else{
        const t=[d.text||'',d.url||''].filter(Boolean).join('\n');
        N.shareText(t,d.title||'');
      }
    };
  }catch(e){}
}

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R=(a,b)=>`<div class="row"><span>${a}</span><b style="text-align:right">${b}</b></div>`;
const n2=(v,d)=>v==null||isNaN(v)?'--':Number(v).toFixed(d);
const tstamp=ts=>ts?new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'--';
const dur=s=>{s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+' h '+m+' min':m+' min';};
const ago=ts=>{if(!ts)return 'never';const s=(Date.now()-ts)/1000;return s<90?Math.round(s)+' s ago':s<5400?Math.round(s/60)+' min ago':s<172800?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago';};
const rate=()=>{try{return S.rateHome;}catch(e){return 3.88;}};
const say=m=>{try{toast(m);}catch(e){}};
function b64e(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o))));}
function b64d(t){return JSON.parse(decodeURIComponent(escape(atob(t))));}

/* ---------- 1.8: plain in-app dialogs (replace the browser boxes that showed the web address) ---------- */
let dlgClose=null;
const DLG_CSS=`
#fdlg{position:fixed;inset:0;background:rgba(4,7,12,.72);display:none;align-items:center;justify-content:center;padding:20px;z-index:50}
#fdlg.on{display:flex}
#fdlg .box{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-top-width:5px;border-radius:16px;padding:20px 20px 18px;box-shadow:0 12px 40px rgba(0,0,0,.55)}
#fdlg .ttl{font-size:21px;font-weight:800;letter-spacing:.2px;color:var(--text);margin-bottom:10px;line-height:1.25}
#fdlg .txt{font-size:15px;line-height:1.5;color:var(--muted);margin-bottom:20px}
#fdlg .acts{display:flex;gap:10px}
#fdlg .acts button{flex:1;padding:14px 10px;border-radius:12px;border:0;font-size:16px;font-weight:700;font-family:inherit;cursor:pointer}
#fdlg .cancel{background:transparent;border:1px solid var(--line);color:var(--text)}
#fdlg .ok-red{background:var(--red);color:#fff}
#fdlg .ok-green{background:var(--green);color:#052e1c}
#fdlg .ok-cyan{background:var(--cyan);color:#06222a}
.btn.r-on{background:var(--green);border-color:var(--green);color:#052e1c;font-weight:700}
.btn.r-off{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
`;
(function(){const s=document.createElement('style');s.textContent=DLG_CSS;document.head.appendChild(s);})();
function askUser(o){
  return new Promise(res=>{
    const tone=o.tone||'red', col={red:'var(--red)',green:'var(--green)',cyan:'var(--cyan)'}[tone];
    const w=document.createElement('div'); w.id='fdlg';
    w.innerHTML=`<div class="box" role="dialog" aria-modal="true" style="border-top-color:${col}"><div class="ttl">${esc(o.title)}</div><div class="txt">${esc(o.text)}</div><div class="acts"><button class="cancel">Cancel</button><button class="ok-${tone}">${esc(o.ok)}</button></div></div>`;
    document.body.appendChild(w);
    const kd=e=>{if(e.key==='Escape')done(false);};
    function done(v){
      if(!dlgClose)return;
      dlgClose=null; document.removeEventListener('keydown',kd); w.remove(); res(v);
    }
    dlgClose=done;
    w.querySelector('.cancel').onclick=()=>done(false);
    w.querySelector('.ok-'+tone).onclick=()=>done(true);
    w.onclick=e=>{if(e.target===w)done(false);};
    document.addEventListener('keydown',kd);
    w.classList.add('on');
    w.querySelector('.cancel').focus();
  });
}

/* ---------- measured sessions (from the meter, kept on this phone) ---------- */
let MS=[], MSdemo=[];
function loadMS(){const s=sync('sessions');MS=(s&&s.sessions)||[];MSdemo=(s&&s.demo)||[];}
loadMS();
window.measuredBetween=function(a,b){
  let k=0,n=0;
  for(const x of MS){if(x.end_ms>a&&x.end_ms<=b){k+=+x.kwh||0;n++;}}
  return n?{kwh:k,count:n}:null;
};

/* ---------- backup rows (same 8 columns as 1.6, so 1.6 simply skips them) ---------- */
window.farrBackupExtra=function(){
  if(!N)return [];
  const out=[], row=(ts,kind,payload)=>{const d=new Date(ts);out.push([d.toLocaleDateString('en-ZA'),d.toLocaleTimeString('en-ZA'),kind,'','',b64e(payload),'',ts].join(','));};
  MS.forEach(x=>row(x.start_ms||x.end_ms,'meter',x));
  try{if(window.farr22)farr22.backupRows().forEach(r=>row(r.ts,r.kind,r.obj));}catch(e){}
  const a=sync('alerts'); ((a&&a.alerts)||[]).filter(x=>!x.demo).slice(0,300).forEach(x=>row(x.ts,'alert',x));
  const c=sync('config'); if(c){const k=Object.assign({},c);delete k.relayToken;delete k.mqttPass;delete k.demo;delete k.remoteUrl;delete k.remoteToken;delete k.remoteName;delete k.remoteLastOk;delete k.remoteLastMsg;row(Date.now(),'settings17',k);}
  return out;
};
window.farrImportExtra=function(c){
  const kind=c[2];
  if(kind==='pctread'||kind==='fsettings'){
    try{window.__fsetTs=parseFloat(c[7])||0;if(window.farr22)farr22.importRow(kind,b64d(c[5]));if(kind==='fsettings'&&window.__fsetChanged){window.__fsetChanged=false;try{save();}catch(e){}}}catch(e){}
    return true;
  }
  if(kind!=='meter'&&kind!=='alert'&&kind!=='settings17')return false;
  try{sync('importExtra',{kind,obj:b64d(c[5])});}catch(e){}
  if(kind==='meter')loadMS();
  return true;
};
window.farrImportText=function(text){
  try{const n=mergeCSV(String(text||''));save();renderAll();say('Imported '+n+' new entries');if(E.length)go('home');}
  catch(e){say('That is not a FARR Q backup');}
};

/* ---------- Android back button ---------- */
window.farrBack=function(){
  if(dlgClose){dlgClose(false);return true;}
  const on=document.querySelector('.screen.on'); const id=on?on.id.slice(2):'home';
  if(id==='home')return false;
  if(['meter','relay','alerts','conn','info','learn'].includes(id))go('set');
  else if(id==='set')go('graph');
  else go('home');
  return true;
};

/* ---------- live polling, only while a meter screen is on show ---------- */
let LIVE=null, screen='home', timer=null, inflight=false, relayTimer=null, RELAY=null;
function period(){return screen==='meter'?1000:(screen==='home'||screen==='relay')?2000:0;}
function schedule(){
  clearTimeout(timer);
  const p=period();
  if(!p||document.visibilityState!=='visible')return;
  timer=setTimeout(tick,p);
}
async function tick(){
  if(inflight){schedule();return;}
  inflight=true;
  try{LIVE=await call('live');}catch(e){LIVE={online:false,error:e.message};}
  inflight=false;
  if(LIVE&&LIVE.sessionsCount!=null&&LIVE.sessionsCount!==MS.length){loadMS();try{renderHome();}catch(e){}try{rmSoon(4000);}catch(e){}}
  paintLive();
  schedule();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){tick();relayLoop();}else{clearTimeout(timer);clearTimeout(relayTimer);}});

function statusText(L){
  if(!L)return 'Checking…';
  if(L.demo)return 'DEMO';
  if(!L.online)return L.everSeen?'Offline':'Not found';
  return L.live&&L.live.charging?'Charging':'Idle';
}
function paintLive(){
  try{if(window.farr22)window.farr22.onLive(LIVE);}catch(e){}
  if(screen==='home')paintHomeCard();
  if(screen==='meter')paintMeter();
  if(screen==='relay')paintRelayAuto();
  if(screen==='home')paintRelayAuto();
  if(screen==='info'){const el=$('infoBody');if(el)el.innerHTML=infoHTML();}
}

/* ---------- Home card ---------- */
/* 2.2.4/2.2.5: shown only when this phone cannot reach the meter (away from home). The phone at home copies the reading to the Sheet
   about every 5 minutes while charging (every 30 minutes otherwise), so it is labelled with that time and is not a live reading. */
/* 2.2.6: extra rows for the block above, built only from data this phone already has (the log entries and the finished charges copied from the Sheet).
   Nothing new is asked from the Sheet and nothing new is sent, so a phone on 2.2.5 is not affected. */
/* 2.2.7: battery % and time left, worked out the same way as the dot matrix display (same pack size 42.7 kWh, same 10% loss, whole % cut off, minutes at the present power).
   The start is the last logged battery %. The energy since then is the finished charges after it plus the running charge. The running charge is the block's
   day total minus the finished charges of that day (the day total is built the same way on the phone at home). */
const DISP_PACK=42.7, DISP_LOSS=0.10;
function remoteEstRow(r,last){
  try{
    if(!r||!(r.at>0)||!last||!(last.ts>0)||last.ts>r.at)return '';
    const d=new Date(r.at);d.setHours(0,0,0,0);const dayMs=d.getTime();
    let since=0,doneToday=0;
    for(const s of (typeof MS!=='undefined'&&MS.length?MS:[])){
      const st=+s.start_ms||+s.end_ms,en=+s.end_ms,k=+s.kwh;
      if(!(en>0&&k>0))continue;
      if(en>=dayMs&&en<=r.at+60000)doneToday+=k;
      if(en>last.ts&&en<=r.at+60000){const span=en-st;since+=span>0?k*Math.min(1,(en-Math.max(st,last.ts))/span):k;}
    }
    if(r.charging)since+=Math.max(0,(+r.today||0)-doneToday);
    if(!(since>=0.05)||isNaN(+last.pct))return '';
    const p=Math.min(100,+last.pct+since*(1-DISP_LOSS)/DISP_PACK*100);
    let h=R('Battery then (estimated)','≈ '+Math.floor(p)+'%');
    if(r.charging&&+r.watts>=500){
      const min=p>=100?0:Math.min(5999,Math.round((100-p)/100*DISP_PACK/((+r.watts)/1000*(1-DISP_LOSS))*60));
      h+=R('Time left then (estimated)',p>=100?'About full':(min>=60?Math.floor(min/60)+' h '+(min%60)+' min':min+' min'));
    }
    return h;
  }catch(e){return '';}
}
/* 2.2.8.1: km driven since the last charge = latest odometer minus the odometer at the latest charge entry. Read from this phone's own log only. */
/* 2.2.8.2: Home charging this calendar month, from this phone's own charge log (same log the Sheet "Charge log" copies). Home only, Station excluded. Measured where the Shelly meter covers the charge, estimated from battery % otherwise. */
function homeMonthStats(now){
  const d=new Date(now||Date.now()), from=new Date(d.getFullYear(),d.getMonth(),1).getTime();
  const rows=derive().filter(x=>x.type==='charge'&&x.where!=='Station'&&x.ts>=from&&isFinite(+x.wall));
  const a={kwh:0,cost:0,mKwh:0,mCost:0,eKwh:0,eCost:0,n:rows.length,from:rows.length?rows.reduce((m,x)=>Math.min(m,x.ts),1e15):null};
  rows.forEach(x=>{const k=+x.wall||0,c=+x.cost||0;a.kwh+=k;a.cost+=c;if(x.measured){a.mKwh+=k;a.mCost+=c;}else{a.eKwh+=k;a.eCost+=c;}});
  return a;
}
function homeMonthRows(){
  try{
    const a=homeMonthStats();if(!a.n)return '';
    const since=new Date(a.from).toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
    return R('Home charging this month (since '+esc(since)+')',n2(a.kwh,2)+' kWh · R'+n2(a.cost,2))+
      R('· measured by meter',n2(a.mKwh,2)+' kWh · R'+n2(a.mCost,2))+
      R('· estimated from battery %',n2(a.eKwh,2)+' kWh · R'+n2(a.eCost,2))+
      `<div class="small" style="margin:4px 0 6px">Source: this phone's charge log, Home only. Station charges left out. Rate is your app setting.</div>`;
  }catch(e){return '';}
}
window.farrHomeMonth=homeMonthStats;
function kmSinceCharge(){
  const L=(typeof E!=='undefined'&&E.length?E:[]);
  const ch=L.filter(e=>e.kind==='charge'&&e.odo>0).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
  const lt=L.filter(e=>e.odo>0).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
  if(!ch||!lt)return null;
  const km=lt.odo-ch.odo;
  return km>=0?{km,since:ch.ts}:null;
}
function kmSinceChargeRow(){
  try{const k=kmSinceCharge();return k?R('Km since last charge',n2(k.km,0)+' km'):'';}catch(e){return '';}
}
window.farrKmSinceCharge=kmSinceCharge;
function remoteExtraRows(r){
  let h='';
  try{
    const last=(typeof E!=='undefined'&&E.length?E:[]).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
    if(last&&last.pct!=null&&!isNaN(last.pct)){
      h+=remoteEstRow(r,last);
      h+=R('Last battery % logged',n2(last.pct,0)+'%'+(last.who?' · '+esc(last.who):''))+
         R('Logged',esc(tstamp(last.ts)))+
         (last.carKm!=null&&!isNaN(last.carKm)?R('Car said',n2(last.carKm,0)+' km'):'')+
         (last.odo>0?R('Odometer',n2(last.odo,0)+' km'):'')+kmSinceChargeRow(last);
    }
  }catch(e){}
  try{
    const m=(typeof MS!=='undefined'&&MS.length?MS:[]).reduce((a,b)=>+b.end_ms>0&&(!a||+b.end_ms>+a.end_ms)?b:a,null);
    if(m&&+m.end_ms>0&&+m.kwh>0){
      const mins=Math.round((+m.end_ms-(+m.start_ms||+m.end_ms))/60000);
      const cost=(m.cost!=null&&m.cost!==''&&isFinite(+m.cost))?+m.cost:(+m.kwh)*rate();
      h+=R('Last charge ended',esc(tstamp(+m.end_ms)))+R('Last charge',n2(m.kwh,2)+' kWh · '+mins+' min · R'+n2(cost,2));
    }
  }catch(e){}
  return h;
}
function remoteLiveHTML(){
  try{
    const r=JSON.parse(localStorage.getItem('farrq.remoteLive')||'null');
    if(!r||!(r.at>0))return '';
    const when=new Date(r.at).toLocaleString('en-ZA');
    return `<div class="card"><div class="hdr-row"><div class="label">EV meter · copied from the Sheet</div><div class="small">${esc(ago(r.at))}</div></div>`+
      R('Last copied',esc(when))+
      R('Charging then',r.charging?'yes':'no')+
      (r.charging?R('Power then',n2(r.watts,0)+' W'):'')+
      R('Day total then',n2(r.today,2)+' kWh · R'+n2((+r.today||0)*rate(),2))+
      R('Month total then',n2(r.month,2)+' kWh · R'+n2((+r.month||0)*rate(),2))+
      homeMonthRows()+
      remoteExtraRows(r)+
      `<div style="margin-top:10px"><button class="btn ghost" id="rmRefreshBtn" onclick="farrRefreshBlock()">Refresh latest data</button></div>`+
      `</div>`;
  }catch(e){return '';}
}
/* 2.2.8: the button at the bottom of the block. Same sync as "Save and send" / "Send now" in Connections: sends this phone's data and asks the Sheet for the latest block, readings and alerts. */
window.farrRefreshBlock=async function(){
  if(!rmOn()){say('Set up the Google Sheet first. Settings, Connections.');return;}
  if(rmBusy){say('Already refreshing…');return;}
  const b=document.getElementById('rmRefreshBtn'); if(b){b.disabled=true;b.textContent='Refreshing…';}
  const before=rmInfoGet().okTs||0;
  try{await rmSend(false);}catch(e){}
  const i=rmInfoGet();
  try{paintHomeCard();}catch(e){}
  if((i.okTs||0)>before&&i.tryOk!==false)say('Latest data received');
  else{say('Could not refresh: '+(i.err||'no answer'));const b2=document.getElementById('rmRefreshBtn');if(b2){b2.disabled=false;b2.textContent='Refresh latest data';}}
};
window.farrRemoteBlockHTML=remoteLiveHTML;window.farrRemoteExtraRows=remoteExtraRows;   /* 2.2.6: for the tests */
function paintHomeCard(){
  const el=$('meterCard'); if(!el)return;
  const L=LIVE, st=statusText(L), v=L&&L.live;
  const unread=(L&&L.unread)||0;
  let h='';
  const ma=$('meterAlert');
  if(ma)ma.innerHTML=unread?`<div class="card" style="border-color:var(--gold)" onclick="go('alerts')"><div class="small" style="color:var(--gold)">${unread} new alert${unread>1?'s':''}. Tap to open.</div></div>`:'';
  if(!v){
    h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter</div><div class="small">${esc(st)}</div></div>`+
       `<div class="small">${L&&L.everSeen?'The meter is not answering. Last seen '+ago(L.lastSeen)+'.':'Meter not found yet. It will show here once it is connected at 192.168.1.128.'}</div></div>`;
    h+=remoteLiveHTML();
    el.innerHTML=h;return;
  }
  const se=v.session;
  h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter${L.demo?' · DEMO':''}</div><div class="small">${esc(st)}</div></div>`+
     `<div class="big">${n2(v.watts,0)} W</div>`+
     R('Current',n2(v.amps,2)+' A')+
     R('This session',se?n2(se.kwh,2)+' kWh · R'+n2(se.kwh*rate(),2)+' · '+dur(se.duration_s):'--')+
     R('Today',n2(v.today_kwh,2)+' kWh · R'+n2((v.today_kwh||0)*rate(),2))+
     R('Mode',esc(v.mode||'--'))+
     R('EV relay',RELAY&&RELAY.connected?(RELAY.relay2On?'ON':'OFF')+' (relay board)':v.relay&&v.relay.reachable?(v.relay.relay2_on?'ON':'OFF')+' (meter report)':'unknown')+
     `</div>`;
  el.innerHTML=h;
}

/* ---------- Meter page ---------- */
let CFG=null;
async function loadMeterConfig(){
  try{CFG=await call('meterConfig');}catch(e){CFG=null;}
  const set=(id,v)=>{const x=$(id);if(x&&v!=null)x.value=v;};
  if(CFG){
    set('calFactor',CFG.cal_factor);set('th_start_w',CFG.start_w);set('th_start_s',CFG.start_s);set('th_end_w',CFG.end_w);set('th_end_s',CFG.end_s);
    set('au_off_w',CFG.auto_off_w);set('au_off_s',CFG.auto_off_s);set('au_nostart',CFG.auto_nostart_min);set('au_over',CFG.overcurrent_a);
  }
  paintModeChips();
}
function paintMeter(){
  const L=LIVE, v=L&&L.live;
  $('mStatus').textContent=statusText(L);
  $('mWatts').textContent=v?n2(v.watts,0)+' W':'-- W';
  $('mRows').innerHTML=v?
    R('Current',n2(v.amps,2)+' A')+R('Raw clamp reading',n2(v.raw,4))+R('Calibration factor',n2(v.cal_factor,3))+
    R('Charging',v.charging?'yes':'no')+
    R('This session',v.session?n2(v.session.kwh,3)+' kWh · '+dur(v.session.duration_s)+' · peak '+n2(v.session.peak_w,0)+' W':'--')+
    R('Today · month',n2(v.today_kwh,2)+' · '+n2(v.month_kwh,2)+' kWh')+
    R('Meter clock',v.time_valid?'set':'not set yet')
    :`<div class="small">${L&&L.error?esc(L.error):'No reading yet.'}</div>`;
}
function paintSessions(){
  loadMS();
  const demoOn=LIVE&&LIVE.demo;
  const list=(demoOn?MSdemo.map(x=>Object.assign({_d:1},x)):[]).concat(MS).sort((a,b)=>b.end_ms-a.end_ms).slice(0,60);
  $('mSessions').innerHTML=list.length?list.map(x=>`<div class="row"><div>${x._d?'<span class="tag c">DEMO</span>':''}${tstamp(x.start_ms)}<div class="small">${dur(x.duration_s)} · peak ${n2(x.peak_w,0)} W · ${esc(x.end_reason||'')}</div></div><div style="text-align:right">${n2(x.kwh,2)} kWh<br><span class="small">R${n2(x.kwh*rate(),2)}</span></div></div>`).join('')
    :'<div class="small">No measured sessions yet.</div>';
}
async function pushMeter(obj,msgEl,okText){
  try{const c=await call('meterConfigSet',obj);CFG=c||CFG;if(LIVE&&LIVE.live&&obj.mode)LIVE.live.mode=obj.mode;if(msgEl)$(msgEl).textContent=okText||'Saved to the meter.';say(okText||'Saved to the meter');paintModeChips();return true;}
  catch(e){const t=(/^AUTO is not available/.test(e.message)?'':'Could not reach the meter: ')+e.message;if(msgEl)$(msgEl).textContent=t;say(t);return false;}
}
window.farrCalMatch=async function(){
  const ref=parseFloat($('calRef').value), v=LIVE&&LIVE.live;
  if(isNaN(ref)||ref<=0)return say('Type the Ellies reading in watts first.');
  if(!v||!(v.watts>50))return say('The meter must be reading above 50 W while the car charges.');
  const f0=v.cal_factor||1, f1=+(f0*ref/v.watts).toFixed(4);
  if(!(f1>0.05&&f1<20))return say('That gives a factor of '+f1+', which looks wrong. Check the reading.');
  if(await pushMeter({cal_factor:f1},'calMsg','Factor changed from '+n2(f0,3)+' to '+n2(f1,3)+'.'))$('calFactor').value=f1;
};
window.farrCalSave=function(){
  const f=parseFloat($('calFactor').value);
  if(isNaN(f)||f<=0.05||f>=20)return say('Enter a factor between 0.05 and 20.');
  pushMeter({cal_factor:f},'calMsg','Factor saved: '+n2(f,3)+'.');
};
window.farrThSave=function(){
  const g=id=>parseFloat($(id).value), o={start_w:g('th_start_w'),start_s:g('th_start_s'),end_w:g('th_end_w'),end_s:g('th_end_s')};
  if(Object.values(o).some(x=>isNaN(x)||x<0))return say('Fill in all four numbers.');
  if(o.end_w>o.start_w)return say('The end level must be at or below the start level.');
  pushMeter(o,null,'Session detection saved to the meter');
};

/* ---------- Relays and AUTO ---------- */
function setTxt(id,t){const x=$(id);if(x)x.textContent=t;}
function paintModeChips(){
  // 1.8: the meter's live mode wins, so a change made from another controller shows at once
  const m=(LIVE&&LIVE.live&&LIVE.live.mode)||(CFG&&CFG.mode)||'MANUAL';
  // 1.8: the same MANUAL/AUTO chips appear on Home and on the Relays page
  [['modeManual','modeAuto'],['hModeManual','hModeAuto']].forEach(([a,b])=>{
    const x=$(a),y=$(b);
    if(x&&y){x.classList.toggle('on',m==='MANUAL');y.classList.toggle('on',m==='AUTO');}
  });
}
function paintRelayAuto(){
  const v=LIVE&&LIVE.live;
  paintModeChips();
  const a=v&&v.auto;
  const t=!v?'Meter not connected, so AUTO cannot run yet.':
    v.meter_type==='shelly'?'AUTO is not available with the Shelly meter yet. START and STOP work as before and charging is never blocked.':
    v.mode!=='AUTO'?'MANUAL: the meter never switches anything.':
    'AUTO is '+(a&&a.state?a.state:'watching')+(a&&a.below_s?' · below the level for '+a.below_s+' s':'')+'.';
  setTxt('autoState',t); setTxt('hAutoState',t);
}
/* 1.8: ON turns green when that relay is on, OFF turns red when it is off; grey when the board is not reachable */
function paintRelayButtons(){
  const r=RELAY, ok=!!(r&&r.connected);
  document.querySelectorAll('[data-relay]').forEach(b=>{
    const cur=ok?(b.dataset.relay==='1'?r.relay1On:r.relay2On):null, want=b.dataset.state==='on';
    b.classList.toggle('r-on',ok&&cur===true&&want);
    b.classList.toggle('r-off',ok&&cur===false&&!want);
  });
}
function paintRelay(){
  const r=RELAY, status=!r?'Checking…':r.connected?'Connected':'Not reachable';
  setTxt('rStatus',status); setTxt('hRStatus',status);
  $('rRows').innerHTML=r&&r.connected?
    R('Relay 1 · Eskom input',r.relay1On?'ON':'OFF')+R('Relay 2 · EV charger',r.relay2On?'ON':'OFF')+R('Relay says',esc(r.message||''))
    :`<div class="small">${esc((r&&r.message)||'')}</div>`;
  paintRelayButtons();
  if(screen==='home')paintHomeCard();
}
let relayGen=0;   // 2.1.6: bumped by every command, so an older status answer can never overwrite a newer command answer
async function relayLoop(){
  clearTimeout(relayTimer);
  if(!(screen==='relay'||screen==='home')||document.visibilityState!=='visible')return;
  const g=relayGen;
  let r; try{r=await call('relayStatus');}catch(e){r={connected:false,message:e.message};}
  if(g===relayGen){RELAY=r;paintRelay();}
  relayTimer=setTimeout(relayLoop,5000);
}
async function relayCmd(path){
  relayGen++;
  try{
    RELAY=await call('relay',{path});paintRelay();
    const m=/relay\/(\d)\/(on|off)$/.exec(path);
    if(RELAY.connected&&m){   // 2.1.6: check the board really did what was asked, and try once more if not
      const want=m[2]==='on', now=m[1]==='1'?RELAY.relay1On:RELAY.relay2On;
      if(now!==want){
        await new Promise(r=>setTimeout(r,700)); relayGen++;
        RELAY=await call('relay',{path}); paintRelay();
        const now2=m[1]==='1'?RELAY.relay1On:RELAY.relay2On;
        return say(RELAY.connected&&now2===want?'Done':'Relay '+m[1]+' did not change. Tap again.');
      }
    }
    say(RELAY.connected?'Done':'Relay did not answer: '+(RELAY.message||''));
  }catch(e){say('Relay did not answer: '+e.message);}
}
window.farrRelay=async function(n,on){
  if(n===1&&!on&&!await askUser({title:'Turn off Eskom input?',text:'This switches Relay 1 (Eskom input) off.',ok:'Turn off',tone:'red'}))return;
  relayCmd('/api/v1/relay/'+n+'/'+(on?'on':'off'));
};
window.farrCharge=async function(start){
  const ok=await askUser(start
    ?{title:'Start charging?',text:'Eskom goes on first, then the EV charger. The relay board runs this order itself.',ok:'Start',tone:'green'}
    :{title:'Stop charging?',text:'The EV charger goes off first, then Eskom. The relay board runs this order itself.',ok:'Stop',tone:'red'});
  if(ok)relayCmd(start?'/api/v1/charge/start':'/api/v1/charge/stop');
};
window.farrMode=async function(m){
  if(m==='AUTO'&&!await askUser({title:'Turn on AUTO?',text:'The meter will switch the EV charger off when charging finishes. AUTO never switches anything on and never touches Eskom.',ok:'Turn on AUTO',tone:'cyan'}))return;
  pushMeter({mode:m},null,'Mode set to '+m);
};
window.farrAutoSave=function(){
  const g=id=>parseFloat($(id).value), o={auto_off_w:g('au_off_w'),auto_off_s:g('au_off_s'),auto_nostart_min:g('au_nostart'),overcurrent_a:g('au_over')};
  if(Object.values(o).some(x=>isNaN(x)||x<0))return say('Fill in all four numbers.');
  pushMeter(o,null,'AUTO rules saved to the meter');
};

/* ---------- Alerts ---------- */
function paintAlerts(){
  const a=sync('alerts')||{alerts:[],types:[],off:[]};
  const st=sync('state')||{};
  $('bgInfo').innerHTML=
    R('Notifications',st.notifAllowed?'allowed':'not allowed yet')+
    R('Checks while the phone sleeps',st.batteryExempt?'allowed':'limited by Android')+
    R('On Wi-Fi now',st.onWifi?'yes':'no')+
    R('Last background check',ago(st.lastPoll))+
    R('Next check in about',st.nextPollS?dur(st.nextPollS):'only when Wi-Fi returns')+
    `<div class="small" style="margin-top:6px">Checks run about every 30 s while charging and every 5 min when idle, only on Wi-Fi. Away from home nothing runs; everything missed is collected the moment the phone is back on home Wi-Fi.</div>`;
  $('alertTypes').innerHTML=(a.types||[]).map(t=>`<label class="check"><input type="checkbox" ${a.off.includes(t.type)?'':'checked'} onchange="farrAlertType('${t.type}',this.checked)"> ${esc(t.label)}</label>`).join('');
  $('alertList').innerHTML=(a.alerts||[]).length?a.alerts.slice(0,300).map(x=>{
    const col=x.level==='critical'?'var(--red)':x.level==='warning'?'var(--gold)':'var(--cyan)';
    return `<div class="row"><div><span class="tag" style="color:${col};border-color:${col}">${esc(x.level||'info')}</span>${x.demo?'<span class="tag c">DEMO</span>':''}${tstamp(x.ts)}<div class="small">${esc(x.text)}</div></div></div>`;
  }).join(''):'<div class="small">No alerts yet.</div>';
  sync('alertsRead');
}
window.farrAlertType=(t,on)=>{sync('setAlertType',{type:t,off:!on});};
window.farrClearAlerts=async function(){
  if(!await askUser({title:'Clear the alert list?',text:'This clears the alert list on this phone only. The meter keeps its own records.',ok:'Clear',tone:'red'}))return;
  sync('clearAlerts');paintAlerts();
};
window.farrSyncNow=async function(){say('Checking the meter…');try{const r=await call('sync');say(r.message||'Done');}catch(e){say(e.message);}loadMS();if(screen==='alerts')paintAlerts();};

/* ---------- Connections ---------- */
let mqOn=false;
function paintConn(){
  const c=sync('config')||{};
  $('cf_meter').value=c.meterUrl||'';$('cf_relay').value=c.relayUrl||'';$('cf_token').value=c.relayToken||'';
  $('cf_mqhost').value=c.mqttHost||'';$('cf_mqport').value=c.mqttPort||'';$('cf_mquser').value=c.mqttUser||'';$('cf_mqpass').value=c.mqttPass||'';
  mqOn=!!c.mqttEnabled;paintMq();paintMqStatus();
  $('connMsg').textContent=c.pendingMeter?'Waiting to send these to the meter when it is found.':'';
}
function paintMq(){$('mqOn').classList.toggle('on',mqOn);$('mqOff').classList.toggle('on',!mqOn);}
/* 1.8: the Pi is optional; say so, and say what the meter reports */
function paintMqStatus(){
  const el=$('mqStatus'); if(!el)return;
  const mq=LIVE&&LIVE.live&&LIVE.live.mqtt;
  el.textContent='Pi/MQTT is OPTIONAL. The meter, relays and history never need it. '+
    (!mqOn?'MQTT is off, so the Pi is not used.':mq&&mq.connected?'MQTT is on and the meter is connected to the broker.':'MQTT is on, but the meter is not connected to the broker yet.');
}
window.farrMq=on=>{mqOn=on;paintMq();paintMqStatus();};
function addr(v){v=String(v||'').trim().replace(/\/+$/,'');if(v&&!/^https?:\/\//.test(v))v='http://'+v;return v;}
window.farrConnSave=async function(){
  const o={meterUrl:addr($('cf_meter').value),relayUrl:addr($('cf_relay').value),relayToken:$('cf_token').value.trim(),
    mqttEnabled:mqOn,mqttHost:$('cf_mqhost').value.trim(),mqttPort:parseInt($('cf_mqport').value,10)||1883,mqttUser:$('cf_mquser').value.trim(),mqttPass:$('cf_mqpass').value,tariff:rate()};
  if(!o.meterUrl||!o.relayUrl)return say('Enter both addresses.');
  sync('setConfig',o);
  $('connMsg').textContent='Saved on this phone. Sending to the meter…';
  try{const r=await call('sync');$('connMsg').textContent=r.pushed?'Saved on this phone and sent to the meter.':'Saved on this phone. It will be sent to the meter when it is found.';}
  catch(e){$('connMsg').textContent='Saved on this phone. It will be sent to the meter when it is found.';}
  say('Connections saved');
};
window.farrMqTest=async function(){
  $('mqMsg').textContent='Asking the meter to test MQTT…';
  try{const r=await call('mqttTest');$('mqMsg').textContent=(r.ok?'Connected: ':'Failed: ')+(r.message||'');}
  catch(e){$('mqMsg').textContent='Could not reach the meter: '+e.message;}
};

/* ---------- Demo ---------- */
function paintDemo(){
  if(!$('demoOn'))return;   // 2.1.4: the demo card is gone
  const c=sync('config')||{};
  $('demoOn').classList.toggle('on',!!c.demo);$('demoOff').classList.toggle('on',!c.demo);
  $('demoRelay').checked=!!c.demoRealRelay;
}
window.farrDemo=async function(on){
  if(!on&&!await askUser({title:'Turn demo off?',text:'Demo sessions and demo alerts are removed from this phone. Your real history is not touched.',ok:'Turn demo off',tone:'red'}))return;
  try{await call('demo',{on});}catch(e){say(e.message);}
  // 1.8: the demo relay switch is always off again once demo is turned off
  if(!on)sync('setConfig',{demoRealRelay:false});
  paintDemo();say(on?'Demo meter on':'Demo meter off');LIVE=null;loadMS();renderInfo();
};
window.farrDemoRelay=on=>{sync('setConfig',{demoRealRelay:on});};

/* ---------- Info and diagnostics ---------- */
const GUIDES=[
['Reserve 192.168.1.128 for the meter in your router',[
 'The meter already sets 192.168.1.128 itself, so this step is optional insurance against the router giving .128 to another device.',
 'On a phone or computer on home Wi-Fi, open a browser and type 192.168.1.1 (the router address printed on its sticker if that does not work).',
 'Sign in with the router admin password from the sticker.',
 'Find the page called DHCP, LAN, Address Reservation, Static Lease or Bound Devices (each router names it differently).',
 'Add a new reservation: paste the meter MAC address shown in the Meter section below, and type 192.168.1.128.',
 'Save or Apply, then restart the meter (unplug and plug its supply).',
 'Do the same check for the relay board at 192.168.1.120 if you like; do not change the relay board itself.']],
['Calibrate with the car and the Ellies meter',[
 'Start a normal home charge and wait two minutes for the car to settle (about 3000 W on the 13 A cable).',
 'Open Settings → Live meter and calibration.',
 'Read the watts on the Ellies meter and type that number into "Ellies meter reading now".',
 'Tap "Match the meter to this reading". The factor is saved on the meter, so both phones and the displays use it.',
 'Watch the live reading for a minute. If it drifts, repeat with a fresh Ellies reading.',
 'For a manual change, type a factor and tap "Save factor to the meter". 1.000 means uncalibrated.']],
['Move your history from 1.6 to 1.7',[
 'Open the old FARR Q Charge 1.6 web app.',
 'Settings → "Send backup as text" → send it to yourself on WhatsApp.',
 'In WhatsApp, long-press the message → Copy.',
 'Open 1.7 → Settings → "Paste backup" → long-press the box → Paste → "Import pasted backup".',
 'Do this once on each phone. Measured meter sessions come from the meter itself on the first sync at home.',
 'You can also share a 1.6 backup .csv from WhatsApp straight to FARR Q Charge.']],
['Install an update',[
 'Open the download page: '+window.FARR_APP_URL,
 'Download the newest FARR-Q-Charge APK and open it.',
 'Tap Update. Your data stays, because every version is signed with the same permanent key.',
 'Never uninstall to update; uninstalling deletes this phone\'s data unless Android offers to keep it.']],
['Alerts and background checks',[
 'Allow notifications on the Alerts page.',
 'Tap "Allow checks while the phone sleeps" and choose Allow, or Android may delay checks by up to about 10 minutes when the screen is off.',
 'At home on Wi-Fi the app checks about every 30 s while charging and every 5 min when idle; each check is one tiny request.',
 'Away from home nothing runs. When the phone rejoins home Wi-Fi it collects every session and alert the meter stored.']],
['Troubleshooting each alert',[
 'Meter offline: check the meter supply, that the 2.4 GHz "Farrusco" Wi-Fi is on channel 6, and the address in Connections.',
 'Relay OFF but power still flowing: normal while no contactor is fitted; later it means a stuck or bypassed contactor.',
 'Relay command failed: check the relay board is on, at 192.168.1.120, and the token in Connections matches.',
 'Current above the limit: the car drew more than the over-current level; check the cable and socket for heat.',
 'Charging stopped suddenly: power fell from a full charge to nothing within a minute (breaker, plug pulled, car fault or power cut).',
 'Meter clock not set: the meter has no internet time yet; sessions are corrected once it gets the time.']]
];
const TECH=[
['Meter web data (phone and Pi)','GET /api/v1/meter (live) · GET /api/v1/sessions?after=N · GET /api/v1/events?after=N · GET and POST /api/v1/config · GET /api/v1/diag · POST /api/v1/mqtt/test. Plain JSON, no token, home network only. Full field list: docs/meter-contract.md in the farr-q-charge-apk repo.'],
['ESP-NOW broadcast','To FF:FF:FF:FF:FF:FF on channel 6, open, every 2 s and on every change. 40-byte packet starting with "FQEV", version 1. Byte layout in docs/meter-contract.md.'],
['MQTT topics','farrusco/evmeter/status (retained online/offline) · /live (every 5 s) · /session (each finished session, retained) · /event (each alert or AUTO action) · /totals (retained) · /config (retained, no secrets) · /diag (every 60 s). Broker 192.168.1.102:1883, own topic tree only, publishes only.'],
['Relay commands used','GET /api/v1/status · POST /api/v1/relay/{1|2}/{on|off} · POST /api/v1/charge/start · POST /api/v1/charge/stop, header X-Farrusco-Token. The relay board firmware is unchanged. AUTO uses only POST /api/v1/relay/2/off.'],
['Planned clamp wiring (confirmed when the meter is built)','Emporia 200A clamp, 25 mm opening. 100 Ω burden across the two clamp wires. Bias: 3.3 V → 10 kΩ → midpoint → 10 kΩ → GND, 10 µF from midpoint to GND. Clamp sleeve wire → midpoint, clamp tip wire → ESP32-S3 ADC1 pin (GPIO4 planned). Clamp round the live conductor only, K→L arrow towards the car.'],
['Wi-Fi','The ESP32-S3 joins the 2.4 GHz "Farrusco" network only (it has no 5 GHz radio). The router must stay on channel 6 for ESP-NOW. TX power set to the maximum (about 20 dBm).']
];
function section(t,body){return `<div class="card"><div class="label" style="margin-bottom:8px">${esc(t)}</div>${body}</div>`;}
let DIAG=null;
async function renderInfo(){
  const el=$('infoBody'); if(!el)return;
  paintDemo();
  el.innerHTML=infoHTML();
  try{const [d,r,rd,dp]=await Promise.allSettled([call('meterDiag'),call('relayStatus'),call('relayDetails'),call('displayStatus')]);DIAG={meter:d.status==='fulfilled'?d.value:{error:d.reason.message},relay:r.status==='fulfilled'?r.value:{connected:false,message:r.reason.message},relayDet:rd.status==='fulfilled'?rd.value:{reachable:false,message:'Relay board not reachable'},display:dp.status==='fulfilled'?dp.value:{reachable:false,message:'Display not reachable'}};}catch(e){}
  if(screen==='info')el.innerHTML=infoHTML();
  /* 2.2.2.1: while this page is open, refresh the relay board and display details every 8 s (read-only) */
  clearTimeout(window.__infoTimer);
  if(screen==='info')window.__infoTimer=setTimeout(()=>{if(screen==='info')renderInfo();},8000);
}
/* 2.2.2.1: relay board details (4 LED dots, radio, reset) and display details. Details page only, never on Home. */
const RST_WORDS={0:'unknown',1:'power on',2:'reset pin',3:'software restart',4:'crash',5:'watchdog',6:'watchdog',7:'watchdog',8:'deep sleep',9:'brownout (weak supply)',10:'SDIO'};
const RST_BAD=[4,5,6,7,9];
function dot(on,col,label){
  const c=on?col:'rgba(128,128,128,.35)';
  return `<span style="display:inline-flex;flex-direction:column;align-items:center;margin:0 10px;font-size:11px"><span style="width:22px;height:22px;border-radius:50%;background:${c};box-shadow:${on?'0 0 8px '+col:'none'};display:block;margin-bottom:4px"></span>${esc(label)}</span>`;
}
function relayDetHTML(){
  const j=DIAG&&DIAG.relayDet;
  if(!j)return section('Relay board, details','<div class="small">Loading…</div>');
  if(!j.reachable)return section('Relay board, details','<div class="small">'+esc(j.message||'Not reachable')+'</div>'+R('Address',esc(j.address||'')));
  const has=j.led_eskom_green!==undefined;
  let b='';
  b+=R('Eskom relay (relay 1)',j.relay1_on?'ON':'OFF')+R('EV relay (relay 2)',j.relay2_on?'ON':'OFF');
  if(has){
    b+='<div style="display:flex;justify-content:center;padding:10px 0 4px"><div style="text-align:center"><div class="small" style="margin-bottom:6px">ESKOM</div>'+dot(j.led_eskom_green==1,'#2fd37a','green')+dot(j.led_eskom_red==1,'#ff4d4d','red')+'</div><div style="text-align:center"><div class="small" style="margin-bottom:6px">EV</div>'+dot(j.led_ev_green==1,'#2fd37a','green')+dot(j.led_ev_red==1,'#ff4d4d','red')+'</div></div>';
    const exp1=j.relay1_on?[1,0]:[0,1], exp2=j.relay2_on?[1,0]:[0,1];
    const match=j.led_eskom_green==exp1[0]&&j.led_eskom_red==exp1[1]&&j.led_ev_green==exp2[0]&&j.led_ev_red==exp2[1];
    b+=R('LEDs match the relays',match?'yes':'no')+R('LED corrections by the board',esc(j.led_fixes));
  } else b+='<div class="small" style="margin-top:6px">LED details need relay board firmware 2.2 (not on the board yet).</div>';
  if(j.reset_reason!==undefined){const rr=+j.reset_reason;b+=R('Last restart',esc(RST_WORDS[rr]||('code '+rr))+(RST_BAD.includes(rr)?' (unexpected)':''));}
  if(j.uptime_s!==undefined)b+=R('Uptime',esc(fmtUp(j.uptime_s)));
  if(j.wifi_rssi!==undefined)b+=R('Wi-Fi signal',esc(j.wifi_rssi)+' dBm ('+rssiWord(j.wifi_rssi)+') · channel '+esc(j.wifi_channel));
  if(j.free_heap!==undefined)b+=R('Free memory',Math.round(j.free_heap/1024)+' kB (lowest '+Math.round((j.min_free_heap||0)/1024)+' kB)');
  if(j.wifi_connects!==undefined)b+=R('Wi-Fi connects · drops',esc(j.wifi_connects)+' · '+esc(j.wifi_disconnects));
  if(j.espnow_age_ms_waveshare!==undefined)b+=R('Waveshare panel',j.espnow_age_ms_waveshare<0?'not heard':'heard '+Math.round(j.espnow_age_ms_waveshare/1000)+' s ago · '+esc(j.espnow_rssi_waveshare)+' dBm')+R('CrowPanel',j.espnow_age_ms_crowpanel<0?'not heard':'heard '+Math.round(j.espnow_age_ms_crowpanel/1000)+' s ago · '+esc(j.espnow_rssi_crowpanel)+' dBm');
  if(j.monitor_tx_ok!==undefined)b+=R('Home Monitor sends ok · failed',esc(j.monitor_tx_ok)+' · '+esc(j.monitor_tx_fail));
  if(j.fw_diag)b+=R('Firmware',esc(j.fw_diag));
  b+=R('Checked',ago(j.checkedAt));
  return section('Relay board, details',b);
}
function fmtUp(s){s=+s||0;const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+' d ':'')+(d||h?h+' h ':'')+m+' min';}
function rssiWord(r){r=+r;return r>-60?'good':r>-70?'fair':r>-80?'weak':'poor';}
function displayHTML(){
  const j=DIAG&&DIAG.display;
  if(!j)return section('Display (dot matrix)','<div class="small">Loading…</div>');
  if(!j.reachable)return section('Display (dot matrix)','<div class="small">'+esc(j.message||'Display not reachable')+'</div>'+R('Address',esc(j.address||'')));
  const stateWord={IDLE:'idle (clock)',CHARGING:'charging',FULL:'full'}[j.state]||esc(j.state);
  const age=v=>v<0?'no good reading':v+' s ago';
  let b=R('Firmware',esc(j.fw))+R('Display state',stateWord)+R('Uptime',esc(fmtUp(j.uptime_s)));
  const rr=String(j.reset_reason||'');
  b+=R('Last restart',esc(rr.replace('_',' '))+(['crash','watchdog','brownout'].includes(rr)?' (unexpected'+(rr==='brownout'?': weak 5 V or USB supply':'')+')':''));
  b+=R('Wi-Fi signal',esc(j.rssi)+' dBm ('+rssiWord(j.rssi)+')')+R('Address · MAC',esc(j.ip)+' · '+esc(j.mac));
  b+=R('Data feeds',j.fault==='none'?'Shelly and relay board OK':'Quiet: '+esc(j.fault));
  b+=R('Shelly power',(j.power_ok?esc(Math.round(j.power_w))+' W':'no fresh reading')+' · '+age(j.shelly_age_s));
  b+=R('Shelly energy',esc(j.energy_wh)+' Wh · '+age(j.energy_age_s));
  b+=R('EV relay as the display reads it',j.relay2===1?'ON':j.relay2===0?'OFF':'unknown')+R('Relay board read',age(j.relay_age_s));
  b+=R('Battery estimate on the display',j.pct_known?esc(Math.round(j.pct))+'%':'--% (no start % sent yet)')+R('Time left on the display',j.minutes_left>=0?esc(j.minutes_left)+' min':'unknown');
  b+=R('Free memory',Math.round((j.heap||0)/1024)+' kB')+R('Checked',ago(j.checkedAt));
  return section('Display (dot matrix)',b);
}
function kv(o,skip){
  if(!o||typeof o!=='object')return '<div class="small">'+esc(o)+'</div>';
  return Object.keys(o).filter(k=>!(skip||[]).includes(k)).map(k=>{const v=o[k];return R(esc(k),esc(v&&typeof v==='object'?JSON.stringify(v):v));}).join('');
}
function infoData(){
  const app=sync('appInfo')||{}, st=sync('state')||{}, c=Object.assign({},sync('config')||{});
  if(c.relayToken)c.relayToken='••••'+c.relayToken.slice(-2);
  if(c.mqttPass)c.mqttPass='••••';
  if(c.remoteToken)c.remoteToken='••••';
  if(c.remoteUrl)c.remoteUrl=c.remoteUrl.slice(0,40)+'…';
  const al=sync('alerts')||{alerts:[]};
  let s1={};try{s1={rateHome:S.rateHome,rateStation:S.rateStation,rateSolar:S.rateSolar,loss:S.loss,pack:S.pack,claim:S.claim,petrol:S.petrol,compare:S.compare,theme:S.theme,entries:E.length,firstEntry:E.length?tstamp(E[0].ts):'--',lastEntry:E.length?tstamp(E[E.length-1].ts):'--'};}catch(e){}
  return {app,st,c,al,s1};
}
/* 1.8: communications health, from what the meter and relay board report right now */
function healthHTML(){
  const L=LIVE&&LIVE.live?LIVE.live:null, RL=DIAG&&DIAG.relay, wf=L&&L.wifi, en=L&&L.espnow, mq=L&&L.mqtt;
  const meter=LIVE&&LIVE.online?'Answering · last read '+ago(LIVE.lastSeen):(LIVE&&LIVE.everSeen?'Not answering · last seen '+ago(LIVE.lastSeen):'Not found yet');
  return section('Communications, live'+(LIVE&&LIVE.demo?' (DEMO)':''),
    R('Architecture','Meter: direct · Relay: direct · Pi/MQTT: optional')+
    R('Meter, HTTP read',esc(meter))+
    R('Wi-Fi signal to meter',wf?esc(wf.rssi)+' dBm · channel '+esc(wf.channel):'not reported yet')+
    R('ESP-NOW to the displays',en?'sent '+esc(en.sent)+' · failed '+esc(en.fail):'not reported yet')+
    R('Last ESP-NOW packet','not reported by the meter yet')+
    R('MQTT to the Pi',mq?esc(mq.enabled?(mq.connected?'connected':'on, not connected'):'off'):'not reported yet')+
    R('Relay board, direct',RL?(RL.connected?'reachable':'not reachable'):'checking…'));
}
function infoHTML(){
  const {app,st,c,al,s1}=infoData(), L=LIVE&&LIVE.live?LIVE.live:(st.lastLive||null), M=DIAG&&DIAG.meter, RL=DIAG&&DIAG.relay;
  let h=healthHTML();
  h+=section('App',kv(app)+R('Background check last ran',ago(st.lastPoll))+R('Last full sync with meter',ago(st.lastSync))+R('Meter last seen',ago(st.lastSeen))+
    R('Measured sessions on this phone',MS.length)+R('Alerts on this phone',(al.alerts||[]).length)+R('Notifications',st.notifAllowed?'allowed':'not allowed')+
    R('Checks while sleeping',st.batteryExempt?'allowed':'limited')+R('On Wi-Fi now',st.onWifi?'yes':'no'));
  h+=section('FARR Q settings (same as 1.6)',kv(s1));
  h+=section('Connections and meter settings stored on this phone',kv(c));
  h+=section('Meter, live reading'+(LIVE&&LIVE.demo?' (DEMO)':''),L?kv(L):'<div class="small">No reading from the meter yet. Address: '+esc(c.meterUrl)+'</div>');
  h+=section('Meter, diagnostics',M?kv(M):'<div class="small">Loading…</div>');
  h+=section('Relay board',RL?kv(RL):'<div class="small">Loading…</div>');
  h+=relayDetHTML();
  h+=displayHTML();
  h+=section('Last 50 alerts and AUTO actions',(al.alerts||[]).slice(0,50).map(x=>R(tstamp(x.ts)+(x.demo?' · DEMO':''),esc(x.text))).join('')||'<div class="small">None.</div>');
  GUIDES.forEach(g=>{h+=section(g[0],'<ol class="small" style="padding-left:18px;margin:0">'+g[1].map(x=>'<li style="margin-bottom:6px">'+esc(x)+'</li>').join('')+'</ol>');});
  TECH.forEach(t=>{h+=section(t[0],'<div class="small">'+esc(t[1])+'</div>');});
  return h;
}
window.farrShareDiag=function(){
  const {app,st,c,al,s1}=infoData(), L=LIVE&&LIVE.live?LIVE.live:(st.lastLive||null);
  const j=o=>JSON.stringify(o,null,1);
  const t=['FARR Q Charge diagnostics · '+new Date().toLocaleString('en-ZA'),
    '== App ==',j(app),j({lastPoll:ago(st.lastPoll),lastSync:ago(st.lastSync),lastSeen:ago(st.lastSeen),onWifi:st.onWifi,notifAllowed:st.notifAllowed,batteryExempt:st.batteryExempt,measuredSessions:MS.length}),
    '== FARR Q settings ==',j(s1),'== Connections ==',j(c),
    '== Meter live ==',j(L),'== Meter diag ==',j(DIAG&&DIAG.meter),'== Relay ==',j(DIAG&&DIAG.relay),'== Relay board details ==',j(DIAG&&DIAG.relayDet),'== Display ==',j(DIAG&&DIAG.display),
    '== Alerts (last 50) ==',(al.alerts||[]).slice(0,50).map(x=>tstamp(x.ts)+' '+(x.demo?'DEMO ':'')+x.level+': '+x.text).join('\n')].join('\n');
  if(N)N.shareText(t,'FARR Q diagnostics');
};


/* ---------- 1.10: charges the owner forgot to log, filled in from the meter ---------- */
/* A finished measured session with no charge log after it becomes a Home charge row (MEASURED kWh, battery % estimated).
   These rows are never stored in the log and never change the trip maths: they disappear as soon as a real charge log is saved. */
window.farrAutoRows=function(src){
  if(!N||!MS||!MS.length||!src||!src.length)return [];
  const sess=MS.filter(x=>!x.demo&&(+x.kwh||0)>=0.1&&x.end_ms>src[0].ts).sort((a,b)=>a.end_ms-b.end_ms);
  const out=[]; let gapKey=null, gapPct=0;
  for(const s of sess){
    let prev=null, next=null;
    for(const e of src){ if(e.ts<s.end_ms)prev=e; else {next=e;break;} }
    if(!prev)continue;
    if(next&&(next.kind==='charge'||next.kind==='start'))continue;     // a real charge log (or a fresh start) after it already covers it
    if(src.some(e=>e.kind==='charge'&&!e.auto&&e.ts>=(+s.start_ms||s.end_ms)&&e.ts<=s.end_ms))continue;   // 2.1.6: a charge log saved while the session was still running covers it too
    if(gapKey!==prev.ts){gapKey=prev.ts;gapPct=prev.pct;}
    const wall=+s.kwh, stored=wall/(1+S.loss/100);
    gapPct=Math.min(100,gapPct+stored/S.pack*100);
    out.push({kind:'charge',type:'charge',ts:s.end_ms,odo:prev.odo,pct:Math.round(gapPct),where:'Home',stored,wall,cost:wall*S.rateHome,measured:true,auto:true});
  }
  return out;
};

/* ---------- 1.10: view from anywhere (a copy of the log in the owner's own Google Sheet) ---------- */
const RM_SCRIPT='2.1.2';
function rmOk(v){return String(v||'')>='2.2.5';}   /* 2.2.5: needs the 2.2.5 script (live reading and alerts for a phone that is away) - an older script says so */
function rmNew(v){return String(v||'')>='2.2.2';}
let rmTimer=null, rmLast=0, rmBusy=false, rmSaveOrig=null, rmPending=null;
/* 2.1.4: the last Sheet sync result, kept so the report can show the Sheet status */
function rmInfoGet(){try{return JSON.parse(localStorage.getItem('farrq.rmInfo')||'{}');}catch(e){return {};}}
function rmInfoSave(o){try{localStorage.setItem('farrq.rmInfo',JSON.stringify(Object.assign(rmInfoGet(),o)));}catch(e){}}
function rmCfg(){const c=sync('config')||{};return c;}
function rmOn(){const c=rmCfg();return !!(N&&c.remoteUrl&&c.remoteToken);}
function rmAutoKeys(rows){return rows.filter(r=>r.type==='charge'&&r.auto).map(r=>r.ts);}
function rmGone(rows){
  /* AUTO rows sent earlier that no longer exist because a real charge log now covers them (the phone still has the session, so it is not just unknown) */
  let sent=[];try{sent=JSON.parse(localStorage.getItem('farrq.rmAuto')||'[]');}catch(e){}
  const now=new Set(rmAutoKeys(rows)), have=new Set((MS||[]).map(x=>x.end_ms));
  return sent.filter(t=>!now.has(t)&&have.has(t));
}
function rmPayload(){
  const real=[...E].sort((a,b)=>a.ts-b.ts), rows=derive();
  const s7=summ(rowsFor(7)), s30=summ(rowsFor(30)), L=lastState()||{};
  const sm=x=>({trips:x.trips,km:+x.km.toFixed(1),eff:x.eff==null?null:+x.eff.toFixed(2),charges:x.charges,wall:+x.wall.toFixed(2),cost:+x.cost.toFixed(2)});
  const autoRemove=rmGone(rows);
  rmPending={sent:rmAutoKeys(rows),gone:autoRemove};
  return {kind:'app',wantReadings:true,wantMeter:true,autoRemove,sent:Date.now(),
    readings:real.map(e=>({ts:e.ts,kind:e.kind,odo:e.odo,pct:e.pct,where:e.where||'',carKm:e.carKm==null?'':e.carKm})),
    charges:rows.filter(r=>r.type==='charge').map(r=>({ts:r.ts,where:r.where||'Unlogged',pct:r.pct,stored:+r.stored.toFixed(2),wall:+r.wall.toFixed(2),cost:+r.cost.toFixed(2),measured:!!r.measured,auto:!!r.auto})),
    trips:rows.filter(r=>r.type==='trip').map(r=>({ts:r.ts,km:+r.km.toFixed(1),kwh:r.countEff?+r.used.toFixed(2):'',cons:r.countEff?+r.cons.toFixed(1):'',odo:r.odo,pct:r.pct})),
    summary:{last7:sm(s7),last30:sm(s30),lastReading:{ts:L.ts||0,odo:L.odo||0,pct:L.pct==null?0:L.pct}},
    sessions:(MS||[]).filter(x=>!x.from_sheet).slice(-300)};   // 2.2.4: copies that came from the Sheet are never sent back
}
function rmPayloadX(){
  const pl=rmPayload();
  try{if(rmNew(rmInfoGet().script)&&window.farr22&&farr22.sheetExtra)pl.extra=farr22.sheetExtra();}catch(e){}
  return pl;
}

/* ---------- 2.1: entries typed on the other phone arrive here (and ours go there) ---------- */
/* Rules: entries are matched by kind + time. Nothing is ever deleted or overwritten here.
   A missing entry is added; a blank "where" or car km is filled in; only the earliest starting point is kept.
   After "Start fresh" on this phone, older entries from the Sheet are ignored. */
function rmMerge(rows){
  const res={added:0,filled:0};
  if(!rows||!rows.length||typeof E==='undefined')return res;
  let epoch=0; try{epoch=+localStorage.getItem('farrq.rmEpoch')||0;}catch(e){}
  const have=new Map(E.map(e=>[e.kind+'|'+e.ts,e]));
  let whoSet=false;   /* 2.2.6: remember who logged an entry (the Sheet keeps the first sender); nothing about this is sent back */
  for(const r of rows){
    const ts=+r.ts, odo=parseFloat(r.odo), pct=parseFloat(r.pct), kind=r.kind;
    if(!ts||isNaN(odo)||isNaN(pct)||!(kind==='trip'||kind==='charge'||kind==='start'))continue;
    if(ts<epoch)continue;
    if(kind==='start'&&E.some(x=>x.kind==='start'&&x.ts<=ts&&!(x.kind+'|'+x.ts===kind+'|'+ts)))continue;   // keep only the earliest starting point
    const where=r.where?String(r.where):'', car=(r.carKm===''||r.carKm==null)?null:parseFloat(r.carKm);
    const loc=have.get(kind+'|'+ts);
    if(!loc){
      const e={kind,ts,odo,pct};
      if(kind==='charge'){if(where)e.where=where;else e.unlogged=true;}
      if(car!=null&&!isNaN(car))e.carKm=car;
      if(r.phone)e.who=String(r.phone);
      E.push(e);have.set(kind+'|'+ts,e);res.added++;
    }else{
      if(!loc.who&&r.phone){loc.who=String(r.phone);whoSet=true;}
      if(kind==='charge'&&!loc.where&&where){loc.where=where;delete loc.unlogged;res.filled++;}
      if(loc.carKm==null&&car!=null&&!isNaN(car)){loc.carKm=car;res.filled++;}
    }
  }
  const starts=E.filter(e=>e.kind==='start').sort((a,b)=>a.ts-b.ts);
  for(let i=1;i<starts.length;i++){E.splice(E.indexOf(starts[i]),1);res.filled++;}
  if(res.added||res.filled||whoSet){
    E.sort((a,b)=>a.ts-b.ts);
    (rmSaveOrig||window.save)();
    try{renderAll();}catch(e){}
  }
  return res;
}
window.farrRmMerge=rmMerge;

/* ---------- 2.2.4: finished Shelly charges and the last meter reading, as copied to the Sheet by the phone at home ---------- */
/* A copy is only added when this phone has no measured session of its own at that time, so at home nothing is ever counted twice.
   Copies are tagged from_sheet: they are never sent back to the Sheet, and the app removes them when the real session arrives. */
function rmMergeMeter(m){
  const res={added:0};
  try{
    if(!m||!Array.isArray(m.sessions)||typeof MS==='undefined')return res;
    loadMS();   // the background check may have stored real sessions since this screen last looked
    let epoch=0; try{epoch=+localStorage.getItem('farrq.rmEpoch')||0;}catch(e){}
    const own=MS.filter(x=>!x.demo&&!x.from_sheet);
    const copies=MS.filter(x=>x.from_sheet).map(x=>x.start_ms);
    for(const s of m.sessions.slice(0,200)){
      const st=+s.start_ms, en=+s.end_ms, kwh=+s.kwh;
      if(!(st>0&&en>st&&kwh>0&&kwh<200)||st<epoch)continue;
      if(copies.some(t=>Math.abs(t-st)<=5000))continue;
      if(own.some(x=>Math.abs(x.start_ms-st)<=60000||(x.start_ms<=en&&x.end_ms>=st)))continue;
      const dur=Math.round((en-st)/1000), tariff=+s.tariff>0?+s.tariff:0;
      const o={store_id:'sheet',seq:0,from_sheet:true,start_ms:st,end_ms:en,kwh:kwh,duration_s:dur,peak_w:+s.peak_w||0,
        avg_w:dur>0?Math.round(kwh*3600000/dur):0,end_reason:String(s.end_reason||'')};
      if(tariff)o.tariff=tariff;
      if(s.cost!==''&&s.cost!=null&&isFinite(+s.cost))o.cost=+s.cost;
      try{sync('importExtra',{kind:'meter',obj:o});copies.push(st);res.added++;}catch(e){}
    }
    const L=m.live;
    if(L&&+L.updated_ms>0){try{localStorage.setItem('farrq.remoteLive',JSON.stringify({at:+L.updated_ms,got:Date.now(),today:L.today_kwh,month:L.month_kwh,total:L.total_kwh,watts:+L.watts||0,charging:!!L.charging}));}catch(e){}}
    if(res.added){loadMS();try{renderAll();}catch(e){}try{renderHome();}catch(e){}}
  }catch(e){}
  return res;
}
window.farrRmMergeMeter=rmMergeMeter;
async function rmSend(manual){
  if(!rmOn()){if(manual)setRm('Enter the web address and password first, then Save.');return;}
  if(rmBusy)return; rmBusy=true;
  if(manual)setRm('Sending…');
  try{
    const pl=rmPayloadX();const r=await call('remotePush',pl);rmLast=Date.now();
    try{if(pl.extra&&window.farr22&&farr22.sheetSent)farr22.sheetSent(pl.extra);}catch(e){}
    try{if(rmPending){const old=JSON.parse(localStorage.getItem('farrq.rmAuto')||'[]').filter(t=>!rmPending.gone.includes(t));localStorage.setItem('farrq.rmAuto',JSON.stringify([...new Set(old.concat(rmPending.sent))].slice(-500)));}}catch(e){}
    let note='', mm={added:0,filled:0};
    try{const m=rmMerge(r.readings);mm=m;if(m.added||m.filled)note=' · '+m.added+' new from the other phone'+(m.filled?', '+m.filled+' filled in':'');if(m.added||m.filled)say('Updated from the other phone');}catch(e){note=' · could not read the other phone ('+e.message+')';}
    try{const mt=rmMergeMeter(r.meter);if(mt.added){note+=' · '+mt.added+' charge'+(mt.added>1?'s':'')+' from the Sheet';say('Charges updated from the Sheet');}}catch(e){}
    const sv=r.script?('Sheet script '+r.script+(rmOk(r.script)?' (matches)':' - paste the new script and redeploy')):'Sheet script is OLD - paste the new script and redeploy';
    rmInfoSave({tryTs:Date.now(),tryOk:true,err:'',okTs:Date.now(),msg:r.message||'ok',script:r.script||'',match:rmOk(r.script),added:mm.added,filled:mm.filled});
    setRm('Synced '+ago(Date.now()).replace('0 s ago','just now')+': '+(r.message||'ok')+note+'\nApp '+(window.FARR_VER||'')+' · '+sv);
  }
  catch(e){rmInfoSave({tryTs:Date.now(),tryOk:false,err:String(e&&e.message||e)});setRm('Not sent: '+e.message);}
  rmBusy=false;
}
function rmSoon(ms){ if(!rmOn())return; clearTimeout(rmTimer); rmTimer=setTimeout(()=>rmSend(false),ms||4000); }
function setRm(t){const el=$('rmMsg');if(el)el.textContent=t;}
function paintRemote(){
  const c=rmCfg();
  if(!$('rm_url'))return;
  $('rm_url').value=c.remoteUrl||'';$('rm_token').value=c.remoteToken||'';$('rm_name').value=c.remoteName||'';
  setRm(c.remoteLastOk?'Last copy sent '+ago(c.remoteLastOk)+'. '+(c.remoteLastMsg||''):(c.remoteUrl?'Not sent yet.':'Off. Nothing leaves this phone until you set this up.'));
}
window.farrRemoteSave=function(){
  const o={remoteUrl:String($('rm_url').value||'').trim(),remoteToken:String($('rm_token').value||'').trim(),remoteName:String($('rm_name').value||'').trim()};
  if(o.remoteUrl&&!/^https:\/\//.test(o.remoteUrl))return say('The Google web address must start with https://');
  sync('setConfig',o); say('Saved'); rmSend(true);
};
window.farrRemoteSend=function(){rmSend(true);};
/* 2.1.4: facts the PDF report prints about the meter and the Google Sheet */
window.farrReportInfo=function(){
  const c=rmCfg(), i=rmInfoGet(), st=sync('state')||{}, now=!!(LIVE&&LIVE.live), L=(LIVE&&LIVE.live)||st.lastLive||null;
  return {ver:window.FARR_VER||'', sheetOn:rmOn(), phone:c.remoteName||'', expectedScript:RM_SCRIPT,
    okTs:i.okTs||c.remoteLastOk||0, msg:i.msg||c.remoteLastMsg||'', script:i.script||'', match:!!i.match,
    added:i.added||0, filled:i.filled||0, tryTs:i.tryTs||0, tryOk:i.tryOk!==false, err:i.err||'',
    meterUrl:c.meterUrl||'', meterType:L?(L.meter_type||''):'', meterSeen:now, lastSeen:st.lastSeen||0,
    rssi:L&&L.wifi?L.wifi.rssi:null, volts:L?L.volts:null, freq:L?L.freq:null};
};
window.farrMeterSessions=function(){return (MS||[]).filter(x=>!x.demo).slice().sort((a,b)=>a.start_ms-b.start_ms);};
window.addEventListener('load',()=>{
  // copy to the Sheet a few seconds after any log is saved, when the app opens, when it comes to the front, and every 90 s while it is open
  try{
    rmSaveOrig=window.save;
    if(typeof rmSaveOrig==='function')window.save=function(){const r=rmSaveOrig.apply(this,arguments);rmSoon(4000);return r;};
    const _sf=window.startFresh;
    if(typeof _sf==='function')window.startFresh=function(){
      const before=E.length;
      const r=_sf.apply(this,arguments);
      if(E.length===1&&before>1){try{localStorage.setItem('farrq.rmEpoch',String(Date.now()-1000));}catch(e){}}
      return r;
    };
  }catch(e){}
  setTimeout(()=>rmSoon(500),6000);
  setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-rmLast>85000)rmSoon(500);},30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-rmLast>30000)rmSoon(1500);});
});


/* ---------- 2.2.8.1: Car claim accuracy line graph (1 week, zoomable) ---------- */
(function(){
const DAY=864e5, FULLMAX=3650*DAY;
let V=null; // {a,b} visible window in ms
function pts(){
  try{
    const st=carStats(rowsFor('all'));
    if(!st)return {p:[],avg:null};
    const p=st.C.map(r=>{const real=r.pct*st.realPerPct;return {t:r.ts,v:100-Math.abs((real-r.carKm)/r.carKm*100)};}).sort((a,b)=>a.t-b.t);
    return {p,avg:st.accuracy};
  }catch(e){return {p:[],avg:null};}
}
function week(){const b=Date.now();return {a:b-7*DAY,b:b};}
function trend(p,v){
  const w=p.filter(x=>x.t>=v.a&&x.t<=v.b);
  if(w.length<2)return 'Need at least 2 entries in this window to see a trend.';
  const n=w.length, mt=w.reduce((x,q)=>x+q.t,0)/n, mv=w.reduce((x,q)=>x+q.v,0)/n;
  let sxy=0,sxx=0;w.forEach(q=>{sxy+=(q.t-mt)*(q.v-mv);sxx+=(q.t-mt)*(q.t-mt);});
  if(!(sxx>0))return 'Entries are too close in time for a trend.';
  const span=Math.max(w[n-1].t-w[0].t,1), d=sxy/sxx*span;
  const dir=Math.abs(d)<0.5?'Steady':d>0?'Rising':'Falling';
  return dir+': '+(d>=0?'+':'')+d.toFixed(1)+' points across '+n+' entries.';
}
function dlabel(t){const d=new Date(t);return d.getDate()+'/'+(d.getMonth()+1);}
function draw(){
  const host=document.getElementById('gAcc');if(!host)return;
  const {p,avg}=pts();
  if(!p.length){host.innerHTML='<div class="small">Add the car screen range on the Anytime log to see accuracy over time.</div>';return;}
  if(!V)V=week();
  const W=320,H=210,L=34,Rr=10,T=12,B=26,pw=W-L-Rr,ph=H-T-B;
  const vis=p.filter(x=>x.t>=V.a&&x.t<=V.b);
  let lo=Math.min(...(vis.length?vis:p).map(x=>x.v),avg==null?1e9:avg), hi=Math.max(...(vis.length?vis:p).map(x=>x.v),avg==null?-1e9:avg);
  lo=Math.floor((lo-3)/5)*5;hi=Math.ceil((hi+3)/5)*5;if(hi>100)hi=100;if(lo>=hi)lo=hi-10;
  const X=t=>L+(t-V.a)/(V.b-V.a)*pw, Y=v=>T+(hi-v)/(hi-lo)*ph;
  let g='';
  for(let v=lo;v<=hi;v+=(hi-lo>30?10:5)){g+=`<line x1="${L}" x2="${W-Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="${L-4}" y="${Y(v)+3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${v}%</text>`;}
  const span=V.b-V.a, step=span>20*DAY?7*DAY:span>6*DAY?DAY:span>2*DAY?12*36e5:6*36e5;
  for(let t=Math.ceil(V.a/step)*step;t<=V.b;t+=step){
    const lab=step>=DAY?dlabel(t):(new Date(t).getHours()+'h');
    g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T+ph}" stroke="currentColor" opacity=".08"/><text x="${X(t)}" y="${H-10}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">${lab}</text>`;
  }
  if(avg!=null&&avg>=lo&&avg<=hi)g+=`<line x1="${L}" x2="${W-Rr}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#d9a441" stroke-dasharray="4 3"/><text x="${W-Rr}" y="${Y(avg)-3}" font-size="9" text-anchor="end" fill="#d9a441">overall ${avg.toFixed(1)}%</text>`;
  // line through points, clipped to the window via neighbours
  const idx=p.map((x,i)=>i).filter(i=>p[i].t>=V.a&&p[i].t<=V.b);
  const seq=[];
  if(idx.length){const f=idx[0],l=idx[idx.length-1];if(f>0)seq.push(p[f-1]);idx.forEach(i=>seq.push(p[i]));if(l<p.length-1)seq.push(p[l+1]);}
  else{const before=p.filter(x=>x.t<V.a).pop(), after=p.find(x=>x.t>V.b);if(before)seq.push(before);if(after)seq.push(after);}
  if(seq.length>1)g+=`<clipPath id="accClip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath><polyline clip-path="url(#accClip)" fill="none" stroke="#4aa3ff" stroke-width="2" points="${seq.map(x=>X(x.t).toFixed(1)+','+Y(x.v).toFixed(1)).join(' ')}"/>`;
  vis.forEach(x=>{g+=`<circle cx="${X(x.t).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="3.5" fill="#4aa3ff" data-t="${x.t}" data-v="${x.v.toFixed(1)}" class="accDot"/>`;});
  host.innerHTML=`<svg id="accSvg" viewBox="0 0 ${W} ${H}" style="touch-action:none;width:100%">${g}</svg>`+
    `<div class="small" id="accTrend">${trend(p,V)}</div><div class="small" id="accTip">Tap a dot to read it. Drag to move. Pinch or scroll to zoom.</div>`+
    `<div style="margin-top:8px"><button class="btn ghost" id="accReset">Reset to 1 week</button></div>`;
  document.getElementById('accReset').onclick=function(){V=week();draw();};
  const svg=document.getElementById('accSvg');
  svg.querySelectorAll('.accDot').forEach(c=>c.addEventListener('click',()=>{
    const tip=document.getElementById('accTip');if(tip)tip.textContent=new Date(+c.dataset.t).toLocaleString('en-ZA')+' · accuracy '+c.dataset.v+'%';
  }));
  if(!host.__acc){host.__acc=1;attach(host,L,pw);}
}
function clamp(a,b){
  const minSpan=3*36e5;let sp=b-a;
  if(sp<minSpan){const m=(a+b)/2;a=m-minSpan/2;b=m+minSpan/2;sp=minSpan;}
  if(sp>FULLMAX){a=b-FULLMAX;}
  return {a,b};
}
function attach(svg,L,pw){
  const ptrs=new Map();let drag=null,pinch=null;
  const tAt=cx=>{const sv=svg.querySelector('#accSvg')||svg;const r=sv.getBoundingClientRect();const fx=((cx-r.left)/r.width*320-L)/pw;return V.a+Math.min(1,Math.max(0,fx))*(V.b-V.a);};
  const zoom=(f,cx)=>{const c=tAt(cx);V=clamp(c-(c-V.a)*f,c+(V.b-c)*f);draw();};
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.25:0.8,e.clientX);},{passive:false});
  svg.addEventListener('pointerdown',e=>{
    if(!e.target.closest||!e.target.closest('#accSvg'))return;
    ptrs.set(e.pointerId,{x:e.clientX});
    if(ptrs.size===1)drag={x:e.clientX,a:V.a,b:V.b,moved:false};
    if(ptrs.size===2){const [q,r]=[...ptrs.values()];pinch={d:Math.abs(q.x-r.x),a:V.a,b:V.b,c:tAt((q.x+r.x)/2)};drag=null;}
  });
  svg.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;ptrs.get(e.pointerId).x=e.clientX;
    if(pinch&&ptrs.size===2){const [q,r]=[...ptrs.values()];const d=Math.abs(q.x-r.x);if(pinch.d>5&&d>5){const f=pinch.d/d;V=clamp(pinch.c-(pinch.c-pinch.a)*f,pinch.c+(pinch.b-pinch.c)*f);draw();}return;}
    if(drag){const rect=(svg.querySelector('#accSvg')||svg).getBoundingClientRect();const dt=-(e.clientX-drag.x)/rect.width*320/pw*(drag.b-drag.a);if(Math.abs(e.clientX-drag.x)>4)drag.moved=true;if(drag.moved){V={a:drag.a+dt,b:drag.b+dt};draw();}}
  });
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===0)drag=null;};
  svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
}
function ensure(){
  if(document.getElementById('gAcc'))return;
  const car=document.getElementById('gCar');if(!car||!car.parentNode)return;
  const card=document.createElement('div');card.className='card';
  card.innerHTML='<div class="label">Car claim accuracy over time (%)</div><div id="gAcc"></div>';
  car.parentNode.parentNode.insertBefore(card,car.parentNode.nextSibling);
}
window.farrPaintAccGraph=function(){try{ensure();V=week();draw();}catch(e){}};
window.farrAccTest={get:()=>V,pts:pts,draw:draw,trend:trend};
})();

/* ---------- screen changes (called from go()) ---------- */
window.farrOnScreen=function(id){
  screen=id;
  clearTimeout(timer);clearTimeout(relayTimer);
  if(id==='home'){paintHomeCard();tick();relayLoop();}
  if(id==='meter'){paintMeter();paintSessions();loadMeterConfig();tick();}
  if(id==='relay'){RELAY=null;paintRelay();paintRelayAuto();loadMeterConfig();tick();relayLoop();}
  if(id==='graph')window.farrPaintAccGraph();
  if(id==='alerts')paintAlerts();
  if(id==='conn'){paintConn();paintRemote();tick();}
  if(id==='info'){renderInfo();tick();}
  if(id==='set'){const a=sync('alerts');const u=a&&a.unread;const el=$('alertsRowSub');if(el)el.textContent=u?u+' new alert'+(u>1?'s':''):'Every alert, notifications and background checks';}
};
})();
