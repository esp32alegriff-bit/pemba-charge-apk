// Ver_FarrQ_2.2.5: the Sheet script returns the finished Shelly charges, and the app adds them as copies without ever double counting.
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/meter_copy_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};

/* ---------- part 1: the script (fake Google Sheet) ---------- */
const src=fs.readFileSync(path.join(__dirname,'../../docs/remote-viewing-google-sheet.gs'),'utf8').replace("'CHANGE-ME'","'pw1'");
function mkSheet(name){const rows=[];const sh={name,rows,
 appendRow(r){rows.push(r.slice());},setFrozenRows(){},setColumnWidth(){},clear(){rows.length=0;},
 getLastRow(){return rows.length;},deleteRow(n){rows.splice(n-1,1);},
 getRange(r,c,nr,nc){nr=nr||1;nc=nc||1;if(typeof r==='string')return {setFontWeight(){return this;}};
  return {setFontWeight(){return this;},
   getValues(){return rows.slice(r-1,r-1+nr).map(x=>{const o=[];for(let i=0;i<nc;i++)o.push(x[c-1+i]===undefined?'':x[c-1+i]);return o;});},
   setValues(v){v.forEach((x,i)=>{rows[r-1+i]=rows[r-1+i]||[];x.forEach((y,j)=>rows[r-1+i][c-1+j]=y);});return this;},
   sort(o){const body=rows.slice(r-1,r-1+nr);body.sort((a,b)=>(+a[o.column-1])<(+b[o.column-1])?1:-1);body.forEach((x,i)=>rows[r-1+i]=x);}};}};return sh;}
const sheets={};const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=mkSheet(n)};
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 ContentService:{MimeType:{JSON:1},createTextOutput:s=>({s,setMimeType(){return this;}})},Date,JSON,Math,String};
vm.createContext(ctx);vm.runInContext(src,ctx);
const post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).s);
const T=1761200000000;
let r=post({token:'pw1',kind:'app',phone:'Estelle',wantMeter:true,readings:[]});
ok(r.ok&&r.meter&&r.meter.sessions.length===0&&r.meter.live===null,'empty Sheet: meter copy is empty, no error');
post({token:'pw1',kind:'app',phone:'Estelle',readings:[]});   // the Summary tab exists once a phone has sent
post({token:'pw1',kind:'meter',phone:'Estelle',sessions:[
  {start_ms:T,end_ms:T+3600000,kwh:2.701,duration_s:3600,peak_w:2826,end_reason:'below_threshold'},
  {start_ms:T+86400000,end_ms:T+86400000+7200000,kwh:5,duration_s:7200,peak_w:2800,end_reason:'below_threshold',tariff:4.5,cost:22.5},
  {demo:true,start_ms:5,end_ms:6,kwh:9}],live:{charging:false,watts:0,today_kwh:7.7,month_kwh:120.5,total_kwh:900}});
r=post({token:'pw1',kind:'app',phone:'Antonio',wantMeter:true,readings:[]});
ok(r.ok&&r.meter&&r.meter.sessions.length===2,'both finished sessions come back, demo skipped');
const s1=r.meter.sessions.find(x=>x.start_ms===T);
ok(s1&&s1.end_ms===T+3600000&&s1.kwh===2.701&&s1.peak_w===2826&&s1.end_reason==='below_threshold','session fields intact (exact times)');
ok(s1&&Math.abs(s1.cost-10.48)<0.005&&s1.tariff===3.88,'cost = kWh x 3.88 when the app sent none');
const s2=r.meter.sessions.find(x=>x.start_ms===T+86400000);
ok(s2&&s2.cost===22.5&&s2.tariff===4.5,'cost and rate the app sent are kept');
ok(r.meter.live&&r.meter.live.updated_ms>0&&r.meter.live.charging===false&&r.meter.live.today_kwh===7.7&&r.meter.live.month_kwh===120.5,'last EV METER block comes back');
r=post({token:'pw1',kind:'app',phone:'Antonio',readings:[]});
ok(r.ok&&!('meter' in r),'an app that does not ask gets no meter copy (old apps unchanged)');
ok(post({token:'bad',kind:'app',wantMeter:true}).ok===false,'wrong password refused');
const rowsBefore=JSON.stringify(sheets['Meter sessions'].rows);
post({token:'pw1',kind:'app',phone:'Antonio',wantMeter:true,readings:[]});
ok(JSON.stringify(sheets['Meter sessions'].rows)===rowsBefore,'asking for the copy changes nothing in the Sheet');
const sheetReply=r; // keep for part 2 shape

/* ---------- part 2: the app page (fake Android bridge that behaves like Store.java) ---------- */
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const now=Date.now(), H=3600e3;
 await pg.addInitScript(()=>{
  const cfg={remoteUrl:'https://script.google.com/macros/s/abc/exec',remoteToken:'pw',remoteName:'Antonio',meterUrl:'x'};
  window.__calls=[];window.__store=[];window.__meter=null;
  const key=s=>(s.store_id||'')+'#'+(s.seq||0)+'#'+s.start_ms;
  const purge=()=>{for(let i=window.__store.length-1;i>=0;i--){const s=window.__store[i];if(!s.from_sheet)continue;
    if(window.__store.some(r=>!r.from_sheet&&(Math.abs(r.start_ms-s.start_ms)<=60000||(r.start_ms<=s.end_ms&&r.end_ms>=s.start_ms))))window.__store.splice(i,1);}};
  window.__realArrives=o=>{if(!window.__store.some(s=>key(s)===key(o)))window.__store.push(o);purge();};   // like Store.addSessions
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:window.__store});
    if(m==='importExtra'){if(a.kind==='meter'){const o=a.obj;if(!window.__store.some(s=>key(s)===key(o))){window.__store.push(o);if(o.store_id!=='sheet')purge();}}return '{}';}
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated',script:'2.2.5',readings:[],meter:window.__meter})),10);},
   shareText(){},shareFile(){}};
  localStorage.setItem('farrq.entries',JSON.stringify([{ts:Date.now()-30*3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},{ts:Date.now()-20*3600e3,kind:'trip',odo:1040,pct:40,where:''}]));
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1200);
 const A={start_ms:now-10*H,end_ms:now-9*H,kwh:5.5,minutes:60,peak_w:2800,end_reason:'below_threshold',cost:21.34,tariff:3.88};
 const B={start_ms:now-5*H,end_ms:now-3*H,kwh:8.25,minutes:120,peak_w:2810,end_reason:'below_threshold',cost:32.01,tariff:3.88};
 const live={updated_ms:now-3*H,charging:false,watts:0,today_kwh:13.75,month_kwh:99.5,total_kwh:900};

 // away from home: no sessions of its own, the Sheet has two
 await pg.evaluate(({A,B,live})=>{window.__meter={sessions:[A,B],live};},{A,B,live});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(700);
 let st=await pg.evaluate(()=>({n:window.__store.length,all:window.__store.every(s=>s.from_sheet&&s.store_id==='sheet'),ms:farrMeterSessions().length,kwh:farrMeterSessions().reduce((a,x)=>a+x.kwh,0),dur:farrMeterSessions()[0]&&farrMeterSessions()[0].duration_s,avg:farrMeterSessions()[0]&&farrMeterSessions()[0].avg_w,cost:farrMeterSessions()[0]&&farrMeterSessions()[0].cost}));
 ok(st.n===2&&st.all,'two copies added, tagged from_sheet');
 ok(st.ms===2&&Math.abs(st.kwh-13.75)<1e-9,'the app screens now hold the real kWh (13.75)');
 ok(st.dur===3600&&st.avg===5500&&st.cost===21.34,'duration, average W and cost filled in');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('2 charges from the Sheet'),'status says 2 charges came from the Sheet');
 ok(await pg.evaluate(()=>window.measuredBetween(Date.now()-24*3600e3,Date.now()).count===2),'History/Home helpers see both charges');

 // the next send never sends the copies back and does ask for them
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 const last=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').pop().a);
 ok(last.wantMeter===true,'payload asks for the meter copy');
 ok(last.sessions.length===0,'copies are not sent back to the Sheet');
 ok((await pg.evaluate(()=>window.__store.length))===2,'second send adds nothing (no doubles)');
 // the Home card for an unreachable meter shows the totals with their time
 await pg.evaluate(()=>{go('hist');});await pg.waitForTimeout(300);
 await pg.evaluate(()=>{go('home');});await pg.waitForTimeout(3500);
 const card=await pg.evaluate(()=>document.getElementById('meterCard').innerText);
 ok(/copied from the sheet/i.test(card)&&card.includes('13.75')&&card.includes('99.50'),'Home card shows day and month totals from the Sheet');
 ok(!/live|now/i.test(card.replace(/EV meter/i,''))||card.includes('Last copied'),'card is labelled as a copy, with the time');
 // Efficiency / History screens render without errors
 await pg.evaluate(()=>{go('hist');});await pg.waitForTimeout(300);
 await pg.evaluate(()=>{go('graph');});await pg.waitForTimeout(300);

 // home again: the real session for A arrives from the Shelly -> its copy is removed, B's copy stays until B arrives
 await pg.evaluate(({A})=>{window.__realArrives({store_id:'m1',seq:1,start_ms:A.start_ms+30,end_ms:A.end_ms+30,kwh:5.5,duration_s:3600,peak_w:2800});},{A});
 st=await pg.evaluate(()=>({n:window.__store.length,copies:window.__store.filter(s=>s.from_sheet).length,kwh:window.__store.reduce((a,x)=>a+x.kwh,0)}));
 ok(st.n===2&&st.copies===1&&Math.abs(st.kwh-13.75)<1e-9,'A: real replaces copy, total still 13.75 kWh (no double)');
 // a send now (home phone has its own A) must not add A's copy again
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 st=await pg.evaluate(()=>({n:window.__store.length,kwh:window.__store.reduce((a,x)=>a+x.kwh,0)}));
 ok(st.n===2&&Math.abs(st.kwh-13.75)<1e-9,'a send after the real session adds no second copy of A');
 await pg.evaluate(({B})=>{window.__realArrives({store_id:'m1',seq:2,start_ms:B.start_ms,end_ms:B.end_ms,kwh:8.25,duration_s:7200,peak_w:2810});},{B});
 st=await pg.evaluate(()=>({n:window.__store.length,copies:window.__store.filter(s=>s.from_sheet).length,kwh:window.__store.reduce((a,x)=>a+x.kwh,0)}));
 ok(st.n===2&&st.copies===0&&Math.abs(st.kwh-13.75)<1e-9,'B: all copies gone, two real sessions, 13.75 kWh');

 // junk from the Sheet is ignored
 await pg.evaluate(({now})=>{window.__meter={sessions:[{start_ms:'x',end_ms:1,kwh:5},{start_ms:now,end_ms:now-5,kwh:3},{start_ms:now-2e6,end_ms:now-1e6,kwh:-4},{start_ms:now-9e6,end_ms:now-8e6,kwh:9999}],live:null};},{now});
 const before=await pg.evaluate(()=>window.__store.length);
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 ok((await pg.evaluate(()=>window.__store.length))===before,'bad rows (text, end before start, negative or huge kWh) are ignored');
 // an old script that sends no meter copy changes nothing
 await pg.evaluate(()=>{window.__meter=null;});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 ok((await pg.evaluate(()=>window.__store.length))===before,'a reply without a meter copy changes nothing');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 await b.close();
 console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0);
})();
