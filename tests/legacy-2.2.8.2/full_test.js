// Ver_FarrQ_2.2.3: full-charge verdicts in the learning, charge log tags, and the pasted backup. Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright node tests/v22/full_test.js
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const D=3600e3, T0=Date.now()-10*24*D;
 const page=async(init)=>{
  const pg=await b.newPage({viewport:{width:400,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.__errs=errs;
  await pg.addInitScript(init,{T0,D});
  await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
  await pg.waitForTimeout(1800);return pg;};
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 // pack 42.7, loss 10: 20% to 100% needs 37.58 kWh at the wall
 const A=await page(({T0,D})=>{
  const mk=(i,kwh,full)=>{const st=T0+i*24*D;const o={seq:i+1,start_ms:st,end_ms:st+4*D,kwh,duration_s:4*3600,avg_w:2600,peak_w:2650};if(full)o.full=full;return o;};
  const sess=[mk(0,37.6,'full'),mk(1,34.0,'full'),mk(2,37.6,'not_full'),mk(3,37.6,'full'),mk(4,37.6,'full'),mk(5,37.6,'unsure')];
  const entries=[
   {ts:T0-600e3,kind:'trip',odo:1000,pct:20,where:''},                 // start of 0: ok
   {ts:T0+1*24*D-600e3,kind:'trip',odo:1100,pct:20,where:''},           // start of 1: 34 kWh is 9% short
   {ts:T0+2*24*D-600e3,kind:'trip',odo:1200,pct:20,where:''},           // start of 2: relay stop
   // session 3 has no start reading at all
   {ts:T0+4*24*D-600e3,kind:'trip',odo:1300,pct:20,where:''},           // start of 4 ...
   {ts:T0+4*24*D+4*D+300e3,kind:'charge',odo:1310,pct:97,where:'Home'}, // ... and a typed 97% after it wins
   {ts:T0+5*24*D-600e3,kind:'trip',odo:1400,pct:20,where:''}
  ].sort((a,b)=>a.ts-b.ts);
  window.FarrNative={sync(m){if(m==='config')return JSON.stringify({meterUrl:'x'});if(m==='sessions')return JSON.stringify({sessions:sess});return '{}';},
   call(id,m,a){setTimeout(()=>window.__farrCb(id,true,'{}'),5);},shareText(){},shareFile(){}};
  localStorage.setItem('farrq.entries',JSON.stringify(entries));
  localStorage.setItem('farrq.sessPct',JSON.stringify([{ts:T0+3600e3,pct:55,src:'prompt',kwh:5},{ts:T0+2*3600e3,pct:70,src:'prompt',kwh:11}]));
 });
 const info=await A.evaluate(()=>farr22.model().info.map(r=>({k:r.s.full,af:r.autoFull,a:r.a&&r.a.pct,asrc:r.a&&r.a.src})));
 ok(info[0].af==='clean'&&info[0].a===100&&info[0].asrc==='auto','full + start 20% + 37.6 kWh: counts as 100%  '+JSON.stringify(info[0]));
 ok(info[1].af==='unsure'&&!info[1].a,'full but 9% short: kept, not used  '+JSON.stringify(info[1]));
 ok(!info[2].af&&!info[2].a,'not full: no automatic 100%  '+JSON.stringify(info[2]));
 ok(info[3].af==='nostart'&&!info[3].a,'full without a start %: not used  '+JSON.stringify(info[3]));
 ok(info[4].af==='typed'&&info[4].a===97&&info[4].asrc==='log','a typed end % wins over the automatic one  '+JSON.stringify(info[4]));
 ok(!info[5].af,'unsure verdict: nothing automatic');
 const M=await A.evaluate(()=>{const m=farr22.model();return {n:m.n,nr:m.nRatio};});
 ok(M.nr===2,'learning uses the clean automatic charge and the typed 97% one, nothing else '+JSON.stringify(M));
 // charge log tags
 const tags=await A.evaluate(()=>{const s=farr22.model().info.map(r=>r.s);return s.map(x=>farrFullTag({type:'charge',ts:x.end_ms}));});
 ok(/FULL CHARGE/.test(tags[0])&&!/NOT USED/.test(tags[0]),'clean full charge tag');
 ok(/FULL CHARGE/.test(tags[1])&&/NOT USED FOR LEARNING/.test(tags[1]),'full but unchecked: tagged full, not used for learning');
 ok(/NOT FULL/.test(tags[2]),'not full tag');
 ok(/FULL CHARGE\?/.test(tags[5]),'unsure tag');
 const lt=await A.evaluate(()=>{go('learn');return new Promise(r=>setTimeout(()=>r(document.getElementById('learnBody').innerText),1200));});
 ok(/Full charges the car ended by itself/i.test(lt)&&/Stopped by a relay, not full/i.test(lt),'learning page shows the counts');
 // backup text carries the readings and the settings
 const txt=await A.evaluate(()=>{S.pack=44.1;S.loss=8;save();return csvText();});
 ok(/,pctread,/.test(txt)&&/,fsettings,/.test(txt),'backup has battery readings and shared settings');
 ok(!/relayToken|mqttPass/.test(Buffer.from((txt.match(/,fsettings,,,([^,]+),/)||[])[1]||'','base64').toString()),'no secrets in the settings row');
 // paste into a clean phone
 const B=await page(({T0,D})=>{window.FarrNative={sync(m){if(m==='config')return JSON.stringify({meterUrl:'x'});if(m==='sessions')return JSON.stringify({sessions:[]});return '{}';},call(id,m,a){setTimeout(()=>window.__farrCb(id,true,'{}'),5);},shareText(){},shareFile(){}};});
 const r1=await B.evaluate(t=>{const n=mergeCSV(t);save();renderAll();return {n,pct:JSON.parse(localStorage.getItem('farrq.sessPct')||'[]').length,pack:S.pack,loss:S.loss,E:E.length};},txt);
 ok(r1.pct===2&&r1.pack===44.1&&r1.loss===8&&r1.E===6,'paste brings readings, settings and log '+JSON.stringify(r1));
 const r2=await B.evaluate(t=>{const n=mergeCSV(t);return {n,pct:JSON.parse(localStorage.getItem('farrq.sessPct')||'[]').length,E:E.length};},txt);
 ok(r2.n===0&&r2.pct===2&&r2.E===6,'pasting twice adds nothing '+JSON.stringify(r2));
 // a reading she already has is not doubled, a new one is added; her own settings are not overwritten by an older paste
 const r3=await B.evaluate(t=>{S.pack=40;save();localStorage.setItem('farrq.fsetStamp',String(Date.now()+60000));const pr=JSON.parse(localStorage.getItem('farrq.sessPct'));pr.push({ts:1,pct:5,src:'prompt',kwh:null});localStorage.setItem('farrq.sessPct',JSON.stringify(pr));mergeCSV(t);return {pack:S.pack,pct:JSON.parse(localStorage.getItem('farrq.sessPct')).length};},txt);
 ok(r3.pack===40&&r3.pct===3,'older paste keeps her newer settings and her own readings '+JSON.stringify(r3));
 ok(A.__errs.length===0&&B.__errs.length===0,'no page errors '+A.__errs.concat(B.__errs).join('|'));
 await b.close();process.exit(f?1:0);
})();
