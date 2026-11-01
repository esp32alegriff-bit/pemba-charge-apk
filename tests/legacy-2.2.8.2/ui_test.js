// Loads the real app page in Chromium with a fake Android bridge. Usage: node ui_test.js
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const T=Date.now()-6*3600e3;
 await pg.addInitScript(({T})=>{
  const cfg={remoteUrl:'',remoteToken:'',remoteName:'',meterUrl:'x'};
  window.__calls=[];
  const sess=[{start_ms:T+3600e3,end_ms:T+3600e3*2,kwh:10,duration_s:3600,peak_w:7000,end_reason:'below_threshold'}];
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:window.__sess||sess});
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated',script:window.__script===undefined?'2.2.5':window.__script,readings:window.__remote||[]})),10);},
   shareText(){},shareFile(){}};
  localStorage.setItem('farrq.entries',JSON.stringify([
   {ts:T-3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},
   {ts:T,kind:'trip',odo:1040,pct:40,where:''}]));
 },{T});
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1500);
 const r=await pg.evaluate(()=>{const d=derive();return {n:d.length,auto:d.filter(x=>x.auto).map(x=>({wall:x.wall,pct:x.pct,w:x.where})),s:summ(rowsFor('all')).charges};});
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 ok(r.auto.length===1,'one auto row for unlogged session');
 ok(r.auto[0]&&r.auto[0].wall===10&&r.auto[0].w==='Home','auto row = measured kWh at Home');
 ok(r.auto[0]&&r.auto[0].pct>40,'battery % estimated above last reading ('+(r.auto[0]&&r.auto[0].pct)+')');
 // real charge log after the session hides the auto row
 await pg.evaluate(({T})=>{E.push({ts:T+3600e3*3,kind:'charge',odo:1040,pct:80,where:'Home'});},{T});
 ok(await pg.evaluate(()=>derive().filter(x=>x.auto).length)===0,'real charge log replaces auto row');
 await pg.evaluate(()=>{E.pop();});
 ok(await pg.evaluate(()=>localStorage.getItem('farrq.entries').includes('"auto"'))===false,'auto rows never stored in the log');
 // history tag
 await pg.evaluate(()=>{go('hist');});await pg.waitForTimeout(300);
 ok((await pg.evaluate(()=>document.body.innerText)).includes('AUTO'),'History shows AUTO tag');
 // connections card
 await pg.evaluate(()=>{go('conn');});await pg.waitForTimeout(300);
 ok(await pg.evaluate(()=>!!document.getElementById('rm_url')),'Connections has View from anywhere card');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).startsWith('Off'),'shows Off until set up');
 await pg.fill('#rm_url','http://bad');await pg.evaluate(()=>farrRemoteSave());
 ok((await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').length))===0,'http address refused, nothing sent');
 await pg.fill('#rm_url','https://script.google.com/macros/s/abc/exec');await pg.fill('#rm_token','pw');await pg.fill('#rm_name','Antonio');
 await pg.evaluate(()=>farrRemoteSave());await pg.waitForTimeout(500);
 const c=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush'));
 ok(c.length===1,'Save sends one copy');
 const p=c[0]&&c[0].a;
 ok(p&&p.kind==='app'&&p.charges.length===1&&p.charges[0].auto,'payload has the auto charge');
 ok(p&&p.readings.length===2&&p.trips.length===1&&p.sessions.length===1,'payload has readings, trip, session');
 ok(p&&!('token' in p),'JS never adds the password to the payload');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('Sheet updated'),'status shows result');

 // ---- two-way sync: entries from the other phone
 const ts0=await pg.evaluate(()=>E[0].ts), tN=await pg.evaluate(()=>E[E.length-1].ts);
 await pg.evaluate(({ts0,tN})=>{window.__remote=[
   {ts:tN+60000,kind:'trip',odo:1060,pct:35,where:'',carKm:140},
   {ts:ts0+5,kind:'charge',odo:1005,pct:60,where:'',carKm:''},
   {ts:ts0+7,kind:'start',odo:990,pct:100,where:'',carKm:''},
   {ts:'x',kind:'trip',odo:1,pct:1}, {ts:tN+9,kind:'bogus',odo:1,pct:1}];},{ts0,tN});
 const before=await pg.evaluate(()=>E.length);
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 const after=await pg.evaluate(()=>({n:E.length,t:E.some(e=>e.kind==='trip'&&e.odo===1060&&e.carKm===140),c:E.some(e=>e.kind==='charge'&&e.odo===1005&&e.unlogged),st:E.filter(e=>e.kind==='start').length,bad:E.some(e=>e.kind==='bogus')}));
 ok(after.n===before+3,'three valid entries added, junk ignored ('+before+'->'+after.n+')');
 ok(after.t&&after.c,'trip with car km and unlogged charge arrived');
 ok(after.st===1,'starting point added because this phone had none');
 ok((await pg.evaluate(()=>localStorage.getItem('farrq.entries'))).includes('1060'),'merged entries saved on this phone');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('3 new from the other phone'),'status says what arrived');
 // second send: nothing new, no loop
 const calls1=await pg.evaluate(()=>window.__calls.length);
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 ok((await pg.evaluate(()=>E.length))===before+3,'second sync adds nothing');
 ok((await pg.evaluate(()=>window.__calls.length))===calls1+1,'merge does not trigger extra sends');
 // blank where filled from other phone
 await pg.evaluate(({ts0})=>{window.__remote=[{ts:ts0+5,kind:'charge',odo:1005,pct:60,where:'Home',carKm:''}];},{ts0});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 ok(await pg.evaluate(({ts0})=>{const e=E.find(x=>x.ts===ts0+5);return e&&e.where==='Home'&&!e.unlogged;},{ts0}),'unlogged charge gets Home from other phone');
 // starting points: later ignored, earlier wins
 await pg.evaluate(({ts0})=>{window.__remote=[{ts:ts0+99,kind:'start',odo:1,pct:1,where:'',carKm:''}];},{ts0});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(500);
 ok(await pg.evaluate(({ts0})=>{const s=E.filter(e=>e.kind==='start');return s.length===1&&s[0].ts===ts0+7;},{ts0}),'later starting point ignored');
 await pg.evaluate(({ts0})=>{window.__remote=[{ts:ts0+1,kind:'start',odo:900,pct:100,where:'',carKm:''}];},{ts0});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(500);
 ok(await pg.evaluate(({ts0})=>{const s=E.filter(e=>e.kind==='start');return s.length===1&&s[0].ts===ts0+1;},{ts0}),'earlier starting point replaces ours');
 // AUTO row superseded by a real charge log is reported for removal
 await pg.evaluate(()=>{window.__remote=[];});
 await pg.evaluate(()=>{E.length=0;E.push({ts:Date.now()-9*3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},{ts:Date.now()-6*3600e3,kind:'trip',odo:1040,pct:40});save();});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 const withAuto=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').pop().a);
 ok(withAuto.charges.some(x=>x.auto)&&withAuto.autoRemove.length===0,'AUTO row sent, nothing to remove yet');
 await pg.evaluate(()=>{E.push({ts:Date.now()-1000,kind:'charge',odo:1040,pct:80,where:'Home'});});
 const nc=await pg.evaluate(()=>window.__calls.length);
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 const after2=await pg.evaluate((nc)=>window.__calls.slice(nc).find(c=>c.m==='remotePush').a,nc);
 ok(!after2.charges.some(x=>x.auto)&&after2.autoRemove.length===1,'real charge log replaces AUTO row and Sheet is told to remove it');
 // reset on this phone: older Sheet entries stay out
 await pg.evaluate(()=>{document.getElementById('st_odo').value='5000';document.getElementById('st_pct').value='90';startFresh();});
 await pg.evaluate(({ts0})=>{window.__remote=[{ts:ts0+5,kind:'charge',odo:1005,pct:60,where:'Home',carKm:''}];},{ts0});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 ok((await pg.evaluate(()=>E.length))===1,'after Start fresh old Sheet entries are not brought back');
 // versions shown
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('App Ver_Pemba_2.2.8.2')&&(await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('matches'),'status shows app version and matching sheet script');
 await pg.evaluate(()=>{window.__script='2.0';});await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(500);
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('paste the new script'),'old script version is flagged');
 await pg.evaluate(()=>{window.__script=null;});await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(500);
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('OLD'),'missing script version is flagged as OLD');
 // backup/diagnostics must not leak password
 const leak=await pg.evaluate(()=>{try{return JSON.stringify(window.farrInfoData?farrInfoData():'')}catch(e){return ''}});
 ok(!leak.includes('"pw"'),'diagnostics do not show the password');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS');await b.close();process.exit(f?1:0);
})();
