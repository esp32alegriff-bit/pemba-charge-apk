// Builds the PDF report in Chromium with a fake Android bridge and checks the new sections. Usage: node report_test.js <out.pdf>
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path'), fs=require('fs');
(async()=>{
 const out=process.argv[2]||'/tmp/farrq_report.pdf';
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const D=864e5, N0=Date.now()-5*D;
 await pg.addInitScript(({N0,D})=>{
  const cfg={remoteUrl:'https://script.google.com/macros/s/abc/exec',remoteToken:'pw',remoteName:'Antonio',meterUrl:'http://192.168.1.128'};
  const sess=[
   {start_ms:N0+2*D+9*3600e3,end_ms:N0+2*D+12*3600e3,kwh:9.2,duration_s:3*3600,peak_w:3050,avg_w:3000,end_reason:'below_threshold'},
   {start_ms:N0+3*D+8*3600e3,end_ms:N0+3*D+8*3600e3+240e3,kwh:0.063,duration_s:240,peak_w:1671,avg_w:1560,end_reason:'below_threshold'},
   {start_ms:N0+4*D+7*3600e3,end_ms:N0+4*D+10*3600e3,kwh:7.1,duration_s:3*3600,peak_w:3000,avg_w:2400,end_reason:'below_threshold'}];
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:sess});
    return JSON.stringify({});},
   call(id,m,a){setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated (122 rows checked)',script:'2.1.2',readings:[]})),10);},
   shareText(){},shareFile(){}};
  localStorage.setItem('farrq.rmInfo',JSON.stringify({okTs:Date.now()-120e3,tryTs:Date.now()-60e3,tryOk:true,msg:'Sheet updated (122 rows checked)',script:'2.1.2',match:true,added:2,filled:1}));
  localStorage.setItem('farrq.entries',JSON.stringify([
   {ts:N0,kind:'start',odo:1000,pct:100},
   {ts:N0+3600e3,kind:'trip',odo:1060,pct:88,carKm:330},
   {ts:N0+D,kind:'trip',odo:1130,pct:70,carKm:290},
   {ts:N0+D+4*3600e3,kind:'charge',odo:1130,pct:100,where:'Home'},
   {ts:N0+2*D+8*3600e3,kind:'trip',odo:1200,pct:82,carKm:320},
   {ts:N0+3*D+7*3600e3,kind:'trip',odo:1250,pct:70,carKm:290},
   {ts:N0+4*D+6*3600e3,kind:'trip',odo:1300,pct:58,carKm:240},
   {ts:N0+4*D+12*3600e3,kind:'charge',odo:1300,pct:92,where:'Home'}]));
 },{N0,D});
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1800);
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 const info=await pg.evaluate(()=>({auto:derive().filter(x=>x.auto).length,ri:farrReportInfo(),ms:farrMeterSessions().length}));
 ok(info.ms===3,'three meter sessions visible to the report');
 ok(info.ri.sheetOn&&info.ri.match&&info.ri.okTs>0,'report info knows the Sheet status');
 const b64=await pg.evaluate(()=>{const doc=buildReport(window.jspdf.jsPDF,{rows:rowsFor('all'),inc:()=>true,periodLabel:'All entries',cut:0});return (()=>{const u=new Uint8Array(doc.output('arraybuffer'));let t='';for(let i=0;i<u.length;i+=8192)t+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return btoa(t);})();});
 fs.writeFileSync(out,Buffer.from(b64,'base64'));
 ok(fs.statSync(out).size>5000,'PDF built ('+fs.statSync(out).size+' bytes)');
 // each include flag alone and all off must still build
 const flags=await pg.evaluate(()=>['sum','graph','trips','charges','car','method','auto','sheet'].map(k=>{try{buildReport(window.jspdf.jsPDF,{rows:rowsFor('all'),inc:id=>id===k,periodLabel:'x',cut:0});return k+':ok';}catch(e){return k+':'+e.message;}}));
 ok(flags.every(x=>x.endsWith(':ok')),'every section builds on its own '+flags.join(' '));
 ok(await pg.evaluate(()=>{try{buildReport(window.jspdf.jsPDF,{rows:[],inc:()=>true,periodLabel:'Today',cut:Date.now()});return true;}catch(e){return e.message;}})===true,'empty period builds');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 console.log(f?'FAILED '+f:'ALL PASS');await b.close();process.exit(f?1:0);
})();
