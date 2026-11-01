// Ver_FarrQ_2.2.8.2: "Home charging this month" row in the EV meter block.
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:390,height:800}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.addInitScript(()=>{
  const n=new Date(),ms=new Date(n.getFullYear(),n.getMonth(),1).getTime(),D=864e5,H=36e5;
  // entries are placed inside the current month; the test needs 'now' at least 3 days into the month
  const t=ms+1*D, E=[
   {ts:t,kind:'charge',odo:1000,pct:20,where:'Home'},
   {ts:t+8*H,kind:'charge',odo:1000,pct:100,where:'Home'},        // estimated: 80% of 42.7 = 34.16 stored
   {ts:t+D,kind:'charge',odo:1000,pct:50,where:'Station'},          // station: must be left out
   {ts:t+D+8*H,kind:'charge',odo:1000,pct:100,where:'Station'}
  ];
  localStorage.setItem('farrq.entries',JSON.stringify(E));
  localStorage.setItem('farrq.remoteLive',JSON.stringify({at:Date.now()-3600e3,got:Date.now(),today:1,month:5,total:9,watts:0,charging:false}));
  window.FarrNative={sync(m){return m==='config'?JSON.stringify({}):JSON.stringify({sessions:[]});},call(){},shareText(){},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1000);
 const a=await pg.evaluate(()=>window.farrHomeMonth&&window.farrHomeMonth());
 ok(a&&a.n>=1,'home charges counted this month: '+JSON.stringify(a));
 const manual=await pg.evaluate(()=>{const d=derive().filter(x=>x.type==='charge');return {all:d.length,home:d.filter(x=>x.where!=='Station').length,st:d.filter(x=>x.where==='Station').length};});
 ok(manual.st>=1&&a.n===manual.home,'station excluded ('+JSON.stringify(manual)+')');
 ok(Math.abs(a.kwh-(a.mKwh+a.eKwh))<1e-9&&Math.abs(a.cost-(a.mCost+a.eCost))<1e-9,'measured + estimated = total');
 const t=await pg.evaluate(()=>window.farrRemoteBlockHTML().replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
 ok(/Home charging this month \(since/.test(t),'row shown: '+t.slice(t.indexOf('Home charging'),t.indexOf('Home charging')+150));
 ok(/measured by meter/.test(t)&&/estimated from battery %/.test(t),'measured and estimated rows shown');
 ok(/Source: this phone's charge log/.test(t),'source line shown');
 ok(t.includes('Month total then'),'old rows still there');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(fail?1:0);
})();
