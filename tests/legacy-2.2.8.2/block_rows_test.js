// Ver_FarrQ_2.2.6: the "EV meter copied from the Sheet" block shows the last battery %, who logged it, car km, odometer and the last finished charge.
// It must use only data 2.2.5 already sends and receives (nothing new is asked from the Sheet, nothing new is sent).
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/block_rows_test.js
const path=require('path');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const now=Date.now(), H=3600e3;
 await pg.addInitScript(()=>{
  const cfg={remoteUrl:'https://script.google.com/macros/s/abc/exec',remoteToken:'pw',remoteName:'Antonio',meterUrl:'x'};
  window.__calls=[];window.__store=[];window.__meter=null;window.__readings=[];
  const key=s=>(s.store_id||'')+'#'+(s.seq||0)+'#'+s.start_ms;
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:window.__store});
    if(m==='importExtra'){if(a.kind==='meter'){const o=a.obj;if(!window.__store.some(s=>key(s)===key(o)))window.__store.push(o);}return '{}';}
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated',script:'2.2.5',readings:window.__readings,meter:window.__meter})),10);},
   shareText(){},shareFile(){}};
  const t=Date.now();
  localStorage.setItem('farrq.entries',JSON.stringify([{ts:t-30*3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},{ts:t-20*3600e3,kind:'trip',odo:1040,pct:40}]));
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1200);

 // nothing synced yet: the block adds nothing and does not break
 let t0=await pg.evaluate(()=>{try{return typeof farrRemoteExtraRows==='function'?farrRemoteExtraRows().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim():'NOFUNC';}catch(e){return 'ERR '+e.message;}});
 ok(t0!=='NOFUNC'&&!t0.startsWith('ERR'),'helper exists and runs');
 ok(t0.includes('Last battery % logged')&&t0.includes('40%'),'before any sync it shows this phone\'s own last reading (40%)');
 ok(!t0.includes('Last charge'),'no finished charge yet: no charge rows');

 // the Sheet answers with Estelle's newer Anytime log and one finished charge
 const B={start_ms:now-5*H,end_ms:now-3*H,kwh:8.25,minutes:120,peak_w:2810,end_reason:'below_threshold',cost:32.01,tariff:3.88};
 const live={updated_ms:now-3*H,charging:true,watts:2600,today_kwh:13.75,month_kwh:99.5,total_kwh:900};
 await pg.evaluate(({B,live,now,H})=>{
  window.__meter={sessions:[B],live};
  window.__readings=[
   {ts:now-2*H,kind:'trip',odo:1100,pct:87,where:'',carKm:346,phone:'Estelle the Wife'},
   {ts:now-20*H,kind:'trip',odo:1040,pct:40,where:'',carKm:'',phone:'Antonio'}];
 },{B,live,now,H});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(800);
 const html=await pg.evaluate(()=>farrRemoteBlockHTML());
 const txt=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 ok(html.includes('EV meter · copied from the Sheet'),'the block is still there');
 ok(/Last battery % logged\s*87%\s*·\s*Estelle the Wife/.test(txt),'last battery % 87% and who logged it');
 ok(/Car said\s*346 km/.test(txt),'car said 346 km');
 ok(/Odometer\s*1100 km/.test(txt),'odometer 1100 km');
 ok(/Last charge\s*8\.25 kWh · 120 min · R32\.01/.test(txt),'last finished charge: 8.25 kWh, 120 min, R32.01');
 ok(txt.includes('Last charge ended'),'last charge end time shown');
 ok(txt.includes('Charging then')&&txt.includes('Day total then')&&txt.includes('Month total then'),'old rows unchanged');

 // an older local entry gets its name from the Sheet, nothing else changes
 const who=await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.entries')||'[]').map(e=>({ts:e.ts,pct:e.pct,who:e.who})));
 ok(who.some(e=>e.pct===40&&e.who==='Antonio'),'older local entry gets "Antonio" from the Sheet');

 // 2.2.5 compatibility: nothing new is sent to the Sheet
 const sent=await pg.evaluate(()=>JSON.stringify(window.__calls.map(c=>c.a)));
 ok(!sent.includes('"who"'),'the payload sent to the Sheet never carries "who"');
 const keys=await pg.evaluate(()=>{const c=window.__calls.filter(x=>x.a&&x.a.kind==='app').pop();return c?Object.keys(c.a).sort().join(','):'';});
 ok(keys==='autoRemove,charges,kind,readings,sent,sessions,summary,trips,wantMeter,wantReadings',"payload keys are exactly the 2.2.5 keys ("+keys+")");
 const rk=await pg.evaluate(()=>{const c=window.__calls.filter(x=>x.a&&x.a.kind==='app').pop();return c&&c.a.readings[0]?Object.keys(c.a.readings[0]).sort().join(','):'';});
 ok(rk==='carKm,kind,odo,pct,ts,where',"each reading sent has exactly the 2.2.5 fields ("+rk+")");

 // a Sheet reply without a phone name (older script) shows no name and does not break
 await pg.evaluate(({now,H})=>{window.__readings=[{ts:now-1*H,kind:'trip',odo:1110,pct:85,where:'',carKm:340}];},{now,H});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(800);
 const t2=(await pg.evaluate(()=>farrRemoteBlockHTML())).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 ok(/Last battery % logged\s*85%\s/.test(t2)&&!/85%\s*·/.test(t2),'no phone name: shows 85% with no name, no error');

 // 2.2.7: estimated battery % = last logged % + energy delivered since, same maths as the Home "Live charge estimate"
 const est=await pg.evaluate(async({now,H})=>{
  const out={};
  const d=new Date(now);d.setHours(0,0,0,0);const dayMs=d.getTime();
  const A={start_ms:now-0.8*H,end_ms:now-0.4*H,kwh:5.5,minutes:24,peak_w:2800,end_reason:'below_threshold',cost:21.34,tariff:3.88};
  const todayDone=A.end_ms>=dayMs?5.5:0;
  // 50% was logged 54 min ago (newer than every earlier entry). One charge of 5.5 kWh ended 24 min ago. A charge of 2.2 kWh is running now.
  window.__readings=[{ts:now-0.9*H,kind:'trip',odo:1200,pct:50,where:'',carKm:200,phone:'Estelle the Wife'}];
  window.__meter={sessions:[A],live:{updated_ms:now-30000,charging:true,watts:2600,today_kwh:todayDone+2.2,month_kwh:80,total_kwh:900}};
  window.__store.length=0;   // only this scenario's charge is on the phone
  await farrRemoteSend();await new Promise(r=>setTimeout(r,800));
  out.html=farrRemoteBlockHTML();
  // same data, but not charging: only the finished charge counts
  window.__meter={sessions:[A],live:{updated_ms:now-30000,charging:false,watts:0,today_kwh:todayDone,month_kwh:80,total_kwh:900}};
  await farrRemoteSend();await new Promise(r=>setTimeout(r,800));
  out.html2=farrRemoteBlockHTML();
  // a newer log (70%) than every charge, not charging: no energy since, so no estimate row
  window.__readings=[{ts:now-0.2*H,kind:'trip',odo:1210,pct:70,where:'',carKm:260,phone:'Estelle the Wife'}];
  window.__meter={sessions:[A],live:{updated_ms:now-30000,charging:false,watts:0,today_kwh:0,month_kwh:80,total_kwh:900}};
  await farrRemoteSend();await new Promise(r=>setTimeout(r,800));
  out.html3=farrRemoteBlockHTML();
  return out;
 },{now,H});
 const tx=h=>h.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 // the dot matrix display's own maths: 42.7 kWh pack, 10% loss, whole % cut off, minutes at the present power
 const dp=since=>Math.min(100,50+since*0.9/42.7*100);
 const dmin=(p,w)=>Math.round((100-p)/100*42.7/(w/1000*0.9)*60);
 const fmt=m=>m>=60?Math.floor(m/60)+' h '+(m%60)+' min':m+' min';
 const m1=tx(est.html).match(/Battery then \(estimated\)\s*≈\s*(\d+)%/);
 ok(m1&&+m1[1]===Math.floor(dp(7.7)),'charging: finished 5.5 kWh + running 2.2 kWh = 7.7 kWh, display maths ('+(m1?m1[1]:'none')+'% expected '+Math.floor(dp(7.7))+'%)');
 ok(!m1||+m1[1]!==Math.floor(dp(13.2)),'the running part is not counted twice');
 const t1=tx(est.html).match(/Time left then \(estimated\)\s*([^A-Z]*?)\s*(Last battery|$)/);
 ok(t1&&t1[1].trim()===fmt(dmin(dp(7.7),2600)),'time left at 2600 W, display maths ('+(t1?t1[1].trim():'none')+' expected '+fmt(dmin(dp(7.7),2600))+')');
 const m2=tx(est.html2).match(/Battery then \(estimated\)\s*≈\s*(\d+)%/);
 ok(m2&&+m2[1]===Math.floor(dp(5.5)),'not charging: only the finished 5.5 kWh counted ('+(m2?m2[1]:'none')+'%)');
 ok(!/Time left then/.test(tx(est.html2)),'not charging: no time left row');
 ok(!/Battery then \(estimated\)/.test(tx(est.html3)),'nothing delivered since the last log: no estimate row');
 ok(/Last battery % logged\s*50%/.test(tx(est.html)),'the real logged % is still shown beside the estimate');
 const sent2=await pg.evaluate(()=>JSON.stringify(window.__calls.map(c=>c.a)));
 ok(!/Battery then|Time left then|battery_then/i.test(sent2),'the estimate is never sent to the Sheet');

 // 2.2.8: "Refresh latest data" button at the bottom of the block
 const ref=await pg.evaluate(async({now})=>{
  const o={};
  window.__readings=[];window.__meter={sessions:[],live:{updated_ms:now-30000,charging:true,watts:2650,today_kwh:3.1,month_kwh:80,total_kwh:900}};
  await farrRemoteSend();await new Promise(r=>setTimeout(r,500));
  o.htmlHas=farrRemoteBlockHTML().includes('Refresh latest data')&&farrRemoteBlockHTML().includes('farrRefreshBlock()');
  o.last=farrRemoteBlockHTML().lastIndexOf('Refresh latest data')>farrRemoteBlockHTML().lastIndexOf('Last charge');
  o.calls0=window.__calls.length;
  // the Sheet now has newer data; the button must fetch it
  window.__meter={sessions:[],live:{updated_ms:now+60000,charging:true,watts:2650,today_kwh:3.5,month_kwh:80,total_kwh:900}};
  const btn=document.getElementById('rmRefreshBtn'); o.btnInDom=!!btn;
  await farrRefreshBlock();
  o.calls1=window.__calls.length;
  o.kind=window.__calls[window.__calls.length-1].a.kind;
  o.keys=Object.keys(window.__calls[window.__calls.length-1].a).filter(k=>k!=='extra').sort().join(',');   // 'extra' (the extra Sheet tabs) is an existing 2.2.2 field, sent only when due
  o.todayAfter=JSON.parse(localStorage.getItem('farrq.remoteLive')).today;
  return o;
 },{now});
 ok(ref.htmlHas,'the block has the button "Refresh latest data"');
 ok(ref.last,'the button is at the bottom of the block');
 ok(ref.btnInDom,'the button is on the Home screen');
 ok(ref.calls1===ref.calls0+1&&ref.kind==='app','tapping it runs one normal sync (same as Send now)');
 ok(ref.keys==='autoRemove,charges,kind,readings,sent,sessions,summary,trips,wantMeter,wantReadings','the sync sends exactly the 2.2.5 keys ('+ref.keys+')');
 ok(Math.abs(ref.todayAfter-3.5)<1e-9,'the block data is the new Sheet data after the tap');
 await pg.waitForTimeout(2500);
 await pg.evaluate(()=>{window.__calls.length=0;});
 await pg.waitForTimeout(1200);
 const base=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').length);   // syncs the app starts on its own in the same time
 await pg.evaluate(()=>{window.__calls.length=0;});
 const realBtn=await pg.$('#rmRefreshBtn');
 if(realBtn){await realBtn.scrollIntoViewIfNeeded();await realBtn.click();await pg.waitForTimeout(900);
  const nreal=await pg.evaluate(()=>window.__calls.length+':'+window.__calls.map(c=>c.m+'/'+c.a.kind).join(','));
  const pushes=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').length);
  ok(pushes>=1&&pushes<=base+1,'a real tap on the button sends one sync ('+nreal+', own syncs in the same time: '+base+')');
  ok((await pg.evaluate(()=>{const b=document.getElementById('rmRefreshBtn');return !b||(!b.disabled&&b.textContent==='Refresh latest data');})),'the button is ready again after the refresh');}
 else ok(false,'real button found on the page');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
 await b.close();
 console.log(fail?('FAILED '+fail):'ALL PASS');process.exit(fail?1:0);
})();
