// Ver_FarrQ_2.2.8.1: km since last charge row + Car claim accuracy line graph (1 week, zoom).
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:390,height:800}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.addInitScript(()=>{
  const D=864e5,t=Date.now();
  const E=[];let odo=1000;
  // each trip follows a full charge within 24h so efficiency counts; car claims differ so accuracy varies
  [[10,260],[8,200],[6,150],[4,110],[2,70]].forEach(([d,c])=>{
    E.push({ts:t-d*D-3*36e5,kind:'charge',odo:odo,pct:100,where:'Home'});
    odo+=40;E.push({ts:t-d*D,kind:'trip',odo:odo,pct:80,carKm:c,where:'Home'});
  });
  E.push({ts:t-3*36e5,kind:'charge',odo:odo+0,pct:100,where:'Home'});
  odo+=0;
  localStorage.setItem('farrq.entries',JSON.stringify(E));
  localStorage.setItem('farrq.remoteLive',JSON.stringify({at:t-3600e3,got:t,today:1,month:5,total:9,watts:0,charging:false}));
  window.FarrNative={sync(m,a){if(m==='config')return JSON.stringify({});return JSON.stringify({});},call(){},shareText(){},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1000);
 const km=await pg.evaluate(()=>window.farrKmSinceCharge&&window.farrKmSinceCharge());
 ok(km&&km.km===0,'km since last charge = 0 ('+JSON.stringify(km)+')');
 const html=await pg.evaluate(()=>window.farrRemoteBlockHTML().replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
 ok(/Km since last charge 0 km/.test(html),'row shown in the EV meter block');
 await pg.evaluate(()=>go('graph'));await pg.waitForTimeout(500);
 ok(await pg.evaluate(()=>!!document.getElementById('gAcc')),'accuracy card exists on Graphs');
 ok(await pg.evaluate(()=>document.querySelectorAll('#gAcc .accDot').length)>0,'dots drawn');
 const n1=await pg.evaluate(()=>document.querySelectorAll('#gAcc .accDot').length);
 const span1=await pg.evaluate(()=>{const v=farrAccTest.get();return v.b-v.a;});
 ok(Math.abs(span1-7*864e5)<1000,'default window is 1 week');
 ok(/Rising|Falling|Steady/.test(await pg.evaluate(()=>document.getElementById('accTrend').textContent)),'trend text: '+await pg.evaluate(()=>document.getElementById('accTrend').textContent));
 // zoom in with wheel
 await pg.evaluate(()=>document.getElementById('accSvg').scrollIntoView({block:'center'}));await pg.waitForTimeout(200);
 const box=await pg.evaluate(()=>{const r=document.getElementById('accSvg').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
 await pg.mouse.move(box.x,box.y);await pg.mouse.wheel(0,-300);await pg.waitForTimeout(200);
 const span2=await pg.evaluate(()=>{const v=farrAccTest.get();return v.b-v.a;});
 ok(span2<span1,'wheel zoom in narrows the window');
 // drag moves window
 const a0=await pg.evaluate(()=>farrAccTest.get().a);
 await pg.mouse.down();await pg.mouse.move(box.x+60,box.y,{steps:5});await pg.mouse.up();await pg.waitForTimeout(100);
 const a1=await pg.evaluate(()=>farrAccTest.get().a);
 ok(a1<a0,'drag right moves the window back in time');
 await pg.click('#accReset');await pg.waitForTimeout(100);
 const span3=await pg.evaluate(()=>{const v=farrAccTest.get();return v.b-v.a;});
 ok(Math.abs(span3-7*864e5)<1000,'reset returns to 1 week');
 // wide zoom out shows more dots
 await pg.mouse.move(box.x,box.y);for(let i=0;i<4;i++)await pg.mouse.wheel(0,300);await pg.waitForTimeout(200);
 const n2=await pg.evaluate(()=>document.querySelectorAll('#gAcc .accDot').length);
 ok(n2>=n1,'zoom out shows at least as many dots ('+n1+' -> '+n2+')');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(fail?1:0);
})();
