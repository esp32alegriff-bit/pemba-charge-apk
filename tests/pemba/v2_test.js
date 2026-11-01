// Pemba Charge 2.0.0.1 checks in Chromium with a fake Android bridge. Usage: node v2_test.js [out.pdf]
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path'), fs=require('fs');
(async()=>{
 const out=process.argv[2]||'/tmp/pemba2_report.pdf';
 const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
 const pg=await b.newPage({viewport:{width:420,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const D=864e5, N0=Date.now()-5*D;
 await pg.addInitScript(({N0,D})=>{
  const cfg={remoteUrl:'https://script.google.com/macros/s/test/exec',remoteToken:'t',remoteName:'Pemba',meterUrl:'http://192.168.1.128'};
  window.__calls=[];
  localStorage.setItem('farrq.entries',JSON.stringify([{kind:'start',ts:N0,odo:0,pct:50}]));
  const sess=[
   {start_ms:N0+2*D+9*3600e3,end_ms:N0+2*D+12*3600e3,kwh:10,duration_s:3*3600,peak_w:3050,avg_w:3000,end_reason:'below_threshold'}];
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:sess});
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated',script:'2.2.5',readings:[]})),10);},
   shareText(){},shareFile(){}};
 },{N0,D});
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1800);
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 const BAD=/anytime|trip|car claim|petrol|efficiency|kwh\/100 km driven/i;
 // 1 screens: no Anytime log, trips, petrol or car claim
 for(const id of ['home','charge','hist','graph','set','share']){
  await pg.evaluate(i=>go(i),id);await pg.waitForTimeout(150);
  const t=await pg.evaluate(i=>[...document.querySelectorAll('#s-'+i+' *')].filter(e=>e.offsetParent!==null&&e.children.length===0).map(e=>e.textContent).join(' | '),id);
  const m=t.match(BAD);
  ok(!m,'screen '+id+' has no Anytime, trip, petrol or efficiency wording'+(m?' -> '+t.slice(Math.max(0,m.index-40),m.index+50):''));
 }
 const ver=await pg.evaluate(()=>({v:window.FARR_VER,pv:window.PEMBA_V,sub:document.querySelector('header .sub').textContent}));
 ok(ver.v==='2.0.0.1'&&ver.pv===2&&/2\.0\.0\.1/.test(ver.sub),'version 2.0.0.1 ('+JSON.stringify(ver)+')');
 // 2 the odometer box is visible in the Charge log, and only there
 await pg.evaluate(()=>go('charge'));
 const vis=await pg.evaluate(()=>{const e=document.getElementById('cOdo');return {shown:e.offsetParent!==null,type:e.type};});
 ok(vis.shown&&vis.type==='number','Charge log shows an odometer box');
 // 3 first charge with an odometer
 await pg.evaluate(()=>{go('charge');openCharge();document.getElementById('cBefore').value='30';document.getElementById('cPct').value='80';document.getElementById('cOdo').value='10000';setWhere('Home');});
 let prev=await pg.evaluate(()=>document.getElementById('cPrev').textContent);
 ok(/first charge with an odometer/.test(prev),'preview, first charge ('+prev+')');
 await pg.evaluate(()=>saveCharge());await pg.waitForTimeout(250);
 // 4 second charge 55% -> 100%, odometer 10120 => 120 km, 25% of 42.7 = 10.675 kWh used
 await pg.evaluate(()=>{go('charge');openCharge();document.getElementById('cBefore').value='55';document.getElementById('cPct').value='100';document.getElementById('cOdo').value='10120';setWhere('Home');});
 prev=await pg.evaluate(()=>document.getElementById('cPrev').textContent);
 ok(/120 km since the last charge/.test(prev)&&/8\.9 kWh\/100 km/.test(prev),'preview shows 120 km and 8.9 kWh/100 km ('+prev+')');
 const ph=await pg.evaluate(()=>document.getElementById('cOdo').placeholder);
 ok(true,'placeholder text: '+ph);
 await pg.evaluate(()=>saveCharge());await pg.waitForTimeout(250);
 // 5 refusals
 const chk=async(b,p,o)=>pg.evaluate(([b,p,o])=>{go('charge');openCharge();document.getElementById('cBefore').value=b;document.getElementById('cPct').value=p;document.getElementById('cOdo').value=o;return chargeCheck();},[b,p,o]);
 ok(!(await chk('20','60','')).ok,'no odometer is refused');
 ok(!(await chk('20','60','10100')).ok,'odometer below the last charge is refused');
 ok(!(await chk('20','60','14000')).ok,'a jump above 3000 km is refused');
 ok(!(await chk('60','50','10200')).ok,'after % below before % is refused');
 ok((await chk('20','60','10200')).ok,'a normal charge is accepted');
 // 6 stored entries: odometer only on charges
 const ent=await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.entries')));
 ok(ent.filter(e=>e.kind!=='charge').every(e=>e.odo===0),'start and before-% entries keep odometer 0');
 ok(ent.filter(e=>e.kind==='charge').map(e=>e.odo).join()==='10000,10120','charge entries carry 10000 and 10120');
 ok(ent.every(e=>e.carKm===undefined),'no car km stored');
 ok(ent.filter(e=>e.kind==='trip').length===2,'two before-% readings stored');
 // 7 maths
 const d=await pg.evaluate(()=>derive().filter(r=>r.type==='charge'&&!r.auto).map(r=>({odo:r.odo,km:r.km,used:r.used,cons:r.cons})));
 ok(d.length===2&&d[0].km===0&&d[1].km===120&&Math.abs(d[1].used-10.675)<0.01&&Math.abs(d[1].cons-8.896)<0.01,'second charge: 120 km, 10.675 kWh, 8.90 kWh/100 km ('+JSON.stringify(d[1])+')');
 const tt=await pg.evaluate(()=>{const t=pembaTotals(rowsFor('all'));return {km:t.kmReal,cons:t.consReal,pk:t.perKmReal};});
 ok(tt.km===120&&Math.abs(tt.cons-8.896)<0.01&&tt.pk>0,'totals: 120 km, 8.9 kWh/100 km, cost per km R'+(tt.pk||0).toFixed(2));
 // 8 Home and History show the odometer figures
 await pg.evaluate(()=>{go('home');setRange(document.querySelector('#rangeChips [data-d="10"]'));});
 await pg.waitForTimeout(300);
 const rows=await pg.evaluate(()=>document.getElementById('homeRows').textContent);
 ok(/Driven \(from the odometer\)120 km/.test(rows)&&/8\.9 kWh\/100 km/.test(rows)&&/Cost per kmR/.test(rows),'Home shows driven km, use and cost per km ('+rows.slice(0,200)+')');
 await pg.evaluate(()=>{go('hist');});await pg.waitForTimeout(250);
 const h=await pg.evaluate(()=>document.getElementById('histList').textContent);
 ok(/10120 km odometer/.test(h)&&/\+120 km/.test(h),'History row shows odometer and +120 km');
 // 9 Sheet payload: odometer only on charge readings, no trips
 await pg.evaluate(()=>{window.__calls.length=0;});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(600);
 const pl=await pg.evaluate(()=>{const c=window.__calls.find(x=>x.a&&x.a.readings);return c?c.a:null;});
 ok(!!pl,'a Sheet payload was sent');
 if(pl){
  ok(pl.readings.filter(r=>r.kind!=='charge').every(r=>r.odo===0),'payload: non-charge readings have odometer 0');
  ok(pl.readings.filter(r=>r.kind==='charge').map(r=>r.odo).join()==='10000,10120','payload: charge readings carry the odometer');
  ok(pl.trips.length===0,'payload: no trips');
  ok(pl.readings.every(r=>r.carKm===''),'payload: no car km');
 }
 // 10 a Sheet read-back cannot bring a non-charge odometer in
 await pg.evaluate(()=>{const e=JSON.parse(localStorage.getItem('farrq.entries'));e.push({kind:'trip',ts:Date.now()-1000,odo:555,pct:60});localStorage.setItem('farrq.entries',JSON.stringify(e));});
 await pg.reload();await pg.waitForTimeout(1500);
 const ent2=await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.entries')));
 ok(ent2.filter(e=>e.kind!=='charge').every(e=>e.odo===0),'an odometer on a non-charge entry is cleared on load');
 // 11 settings and report
 await pg.evaluate(()=>go('set'));
 const set=await pg.evaluate(()=>({eff:document.getElementById('set_effEst').value,home:document.getElementById('set_rateHome').value,st:document.getElementById('set_rateStation').value,sol:document.getElementById('set_rateSolar').value}));
 ok(set.eff==='14.5'&&set.home==='3.88'&&set.st==='7.35'&&set.sol==='0','defaults: 14.5 kWh/100 km, R3.88, R7.35, R0');
 const b64=await pg.evaluate(()=>{go('share');const inc=id=>{const c=document.getElementById('inc_'+id);return c?c.checked:true;};
   const doc=buildReport(window.jspdf.jsPDF,{rows:rowsFor('all'),inc,periodLabel:'All entries',cut:0});
   const u=new Uint8Array(doc.output('arraybuffer'));let t='';for(let i=0;i<u.length;i+=0x8000)t+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(t);});
 fs.writeFileSync(out,Buffer.from(b64,'base64'));
 ok(fs.statSync(out).size>20000,'PDF built ('+fs.statSync(out).size+' bytes)');
 ok(errs.length===0,'no page errors '+errs.join(' ; '));
 console.log(f?'FAILED '+f:'ALL PASS');process.exit(f?1:0);
})();
