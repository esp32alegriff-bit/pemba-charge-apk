// Pemba Charge 1.0.0.1 checks in Chromium with a fake Android bridge. Usage: node v1_test.js [out.pdf]
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path'), fs=require('fs');
(async()=>{
 const out=process.argv[2]||'/tmp/pemba1_report.pdf';
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:420,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const D=864e5, N0=Date.now()-5*D;
 await pg.addInitScript(({N0,D})=>{
  const cfg={remoteUrl:'',remoteToken:'',remoteName:'',meterUrl:'http://192.168.1.128'};
  window.__calls=[];
  localStorage.setItem('farrq.entries',JSON.stringify([{kind:'start',ts:N0,odo:0,pct:50}]));
  const sess=[
   {start_ms:N0+2*D+9*3600e3,end_ms:N0+2*D+12*3600e3,kwh:10,duration_s:3*3600,peak_w:3050,avg_w:3000,end_reason:'below_threshold'},
   {start_ms:N0+4*D+7*3600e3,end_ms:N0+4*D+10*3600e3,kwh:5,duration_s:3*3600,peak_w:3000,avg_w:1700,end_reason:'below_threshold'}];
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
 const BAD=/odometer|anytime|trip|car claim|petrol|efficiency|km\/|kwh\/100 km driven/i;
 // 1 screens carry no distance wording
 for(const id of ['home','charge','hist','graph','set','share']){
  await pg.evaluate(i=>go(i),id);await pg.waitForTimeout(150);
  const t=await pg.evaluate(i=>[...document.querySelectorAll('#s-'+i+' *')].filter(e=>e.offsetParent!==null&&e.children.length===0).map(e=>e.textContent).join(' | '),id);
  const m=t.match(BAD);
  ok(!m,'screen '+id+' has no odometer, trip, petrol or efficiency wording'+(m?' -> '+t.slice(Math.max(0,m.index-40),m.index+50):''));
 }
 // 2 Home shows cost from the meter: 15 kWh x R3.88
 await pg.evaluate(()=>{go('home');setRange(document.querySelector('#rangeChips [data-d="10"]'));});
 await pg.waitForTimeout(300);
 const home=await pg.evaluate(()=>({big:document.getElementById('effBig').textContent,sub:document.getElementById('effSub').textContent,rows:document.getElementById('homeRows').textContent}));
 ok(home.big==='R58.20','Home cost = 15 kWh x R3.88 = R58.20 ('+home.big+')');
 ok(/15\.00 kWh/.test(home.sub),'Home shows kWh at the wall ('+home.sub+')');
 ok(/Solar \(free\)/.test(home.rows)&&/Station/.test(home.rows),'Home splits Eskom, Solar, Station');
 // 3 mark the first meter charge Solar: cost drops to 5 x 3.88
 const ts=await pg.evaluate(()=>derive().filter(r=>r.auto).map(r=>r.ts));
 ok(ts.length===2,'two AUTO charges from the meter ('+ts.length+')');
 await pg.evaluate(t=>pembaTagSolar(t,true),ts[0]);
 await pg.waitForTimeout(200);
 const big2=await pg.evaluate(()=>{go('home');return document.getElementById('effBig').textContent;});
 ok(big2==='R19.40','Solar charge is free: 5 kWh x R3.88 = R19.40 ('+big2+')');
 // 4 typed Station charge 40% -> 90%, no meter in window
 await pg.evaluate(()=>{go('charge');document.getElementById('cBefore').value='40';document.getElementById('cPct').value='90';setWhere('Station');});
 const prev=await pg.evaluate(()=>document.getElementById('cPrev').textContent);
 ok(/R172\.\d\d at R7\.35/.test(prev)||/R172/.test(prev),'preview: 50% of 42.7 kWh x 1.10 x R7.35 ~ R172 ('+prev+')');
 await pg.evaluate(()=>saveCharge());await pg.waitForTimeout(200);
 const ent=await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.entries')));
 ok(ent.every(e=>e.odo===0),'every stored entry has odometer 0');
 ok(ent.some(e=>e.kind==='charge'&&e.where==='Station'&&e.pct===90),'Station charge stored');
 const st=await pg.evaluate(()=>{const c=derive().filter(r=>r.type==='charge'&&!r.auto&&r.where==='Station')[0];return c&&{wall:c.wall,cost:c.cost};});
 ok(st&&Math.abs(st.wall-23.485)<0.01&&Math.abs(st.cost-172.6)<0.1,'Station charge wall 23.49 kWh, cost R172.6 ('+JSON.stringify(st)+')');
 // 5 bad input refused
 await pg.evaluate(()=>{go('charge');document.getElementById('cBefore').value='80';document.getElementById('cPct').value='70';});
 const bad=await pg.evaluate(()=>chargeCheck());
 ok(!bad.ok,'after % below before % is refused');
 // 6 estimated km from kWh only
 const tt=await pg.evaluate(()=>{const t=pembaTotals(rowsFor('all'));return {km:t.km,stored:t.stored};});
 ok(tt.km>0&&Math.abs(tt.km-tt.stored/0.145)<0.5,'estimated km = stored kWh / 0.145 ('+tt.km.toFixed(1)+')');
 // 7 nothing sent to the Sheet carries a distance
 await pg.evaluate(()=>{const c=JSON.parse(window.FarrNative.sync('config'));});
 const calls=await pg.evaluate(()=>JSON.stringify(window.__calls));
 ok(!/"odo":[1-9]/.test(calls)&&!/"km":[1-9]/.test(calls),'no distance in any bridge call');
 // 8 settings
 await pg.evaluate(()=>go('set'));
 const set=await pg.evaluate(()=>({loss:getComputedStyle(document.getElementById('set_loss').closest('.field')).display,eff:document.getElementById('set_effEst').value,home:document.getElementById('set_rateHome').value,st:document.getElementById('set_rateStation').value,sol:document.getElementById('set_rateSolar').value}));
 ok(set.loss==='none','loss field hidden (fixed 10%)');
 ok(set.eff==='14.5'&&set.home==='3.88'&&set.st==='7.35'&&set.sol==='0','defaults: 14.5 kWh/100 km, R3.88, R7.35, R0');
 // 9 report builds and has no distance wording
 const b64=await pg.evaluate(()=>{go('share');const inc=id=>{const c=document.getElementById('inc_'+id);return c?c.checked:true;};
   const doc=buildReport(window.jspdf.jsPDF,{rows:rowsFor('all'),inc,periodLabel:'All entries',cut:0});
   const u=new Uint8Array(doc.output('arraybuffer'));let t='';for(let i=0;i<u.length;i+=0x8000)t+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(t);});
 fs.writeFileSync(out,Buffer.from(b64,'base64'));
 ok(fs.statSync(out).size>20000,'PDF built ('+fs.statSync(out).size+' bytes)');
 ok(errs.length===0,'no page errors '+errs.join(' ; '));
 console.log(f?'FAILED '+f:'ALL PASS');process.exit(f?1:0);
})();
