// Runs docs/remote-viewing-google-sheet.gs against a fake Google Sheet. Usage: node sheet_script_test.js
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../../docs/remote-viewing-google-sheet.gs'),'utf8').replace("'CHANGE-ME'","'pw1'");
function mkSheet(name){const rows=[];const sh={name,rows,
 appendRow(r){rows.push(r.slice());},setFrozenRows(){},setColumnWidth(){},clear(){rows.length=0;},
 getLastRow(){return rows.length;},deleteRow(n){rows.splice(n-1,1);},
 getRange(r,c,nr,nc){nr=nr||1;nc=nc||1;if(typeof r==='string')return {setFontWeight(){return this;}};
  return {setFontWeight(){return this;},
   getValues(){return rows.slice(r-1,r-1+nr).map(x=>{const o=[];for(let i=0;i<nc;i++)o.push(x[c-1+i]===undefined?'':x[c-1+i]);return o;});},
   setValues(v){v.forEach((x,i)=>{rows[r-1+i]=rows[r-1+i]||[];x.forEach((y,j)=>rows[r-1+i][c-1+j]=y);});return this;},
   sort(o){const body=rows.slice(r-1,r-1+nr);body.sort((a,b)=>(+a[o.column-1])<(+b[o.column-1])?1:-1);body.forEach((x,i)=>rows[r-1+i]=x);}};}};return sh;}
const fixSort=x=>x;
const sheets={};const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]=fixSort(mkSheet(n))};
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 ContentService:{MimeType:{JSON:1},createTextOutput:s=>({s,setMimeType(){return this;}})},Date,JSON,Math,String};
vm.createContext(ctx);vm.runInContext(src,ctx);
const post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).s);
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
ok(post({token:'bad',kind:'app'}).ok===false,'wrong password refused');
ok(Object.keys(sheets).length===0,'wrong password writes nothing');
const T=1761200000000;
const app=(ph,extra)=>Object.assign({token:'pw1',kind:'app',phone:ph,
 charges:[{ts:T,where:'Home',pct:80,stored:20,wall:22,cost:85,measured:true,auto:false},{ts:T+1000,where:'Home',pct:90,stored:5,wall:5.5,cost:21,measured:true,auto:true}],
 trips:[{ts:T-5000,km:30,kwh:5,cons:16,odo:1030,pct:70}],readings:[{ts:T,kind:'charge',odo:1030,pct:80,where:'Home',carKm:''}],
 summary:{last7:{trips:1,km:30,eff:16,charges:2,wall:27.5,cost:106},last30:{trips:3,km:90,eff:16,charges:5,wall:80,cost:300},lastReading:{ts:T,odo:1030,pct:80}},
 sessions:[{start_ms:T-3600000,end_ms:T,kwh:22,duration_s:3600,peak_w:7200,end_reason:'below_threshold'}]},extra||{});
let r=post(app('Antonio'));ok(r.ok,'first send accepted: '+r.message);
ok(sheets['Charge log'].rows.length===3,'charge log has header + 2 rows');
ok(sheets['Meter sessions'].rows.length===2,'session row added');
r=post(app('Antonio'));
ok(sheets['Charge log'].rows.length===3,'sending twice does not double rows');
r=post(app('Estelle',{charges:[{ts:T+9000,where:'Home',pct:95,stored:3,wall:3.3,cost:12,measured:false,auto:false}]}));
ok(sheets['Charge log'].rows.length===4,'second phone adds its own charge (merged)');
ok(sheets['Charge log'].rows[1][0].getTime()===T+9000,'newest charge on top');
post({token:'pw1',kind:'meter',phone:'Antonio',sessions:[{start_ms:T+1,end_ms:T+2,kwh:1,duration_s:60,peak_w:100,end_reason:'x'},{demo:true,start_ms:5,end_ms:6,kwh:9}],live:{charging:true,watts:7000,today_kwh:3,month_kwh:50,total_kwh:900}});
ok(sheets['Meter sessions'].rows.length===3,'meter push adds a real session, skips demo');
ok(sheets['Summary'].rows[0][3]==='EV METER (last check)','live block written next to summary');
ok(sheets['Summary'].rows[0][0]==='FARR Q Charge summary','summary heading kept');
ok(post({token:'pw1',kind:'app',charges:'oops'}).ok===false||true,'bad data does not crash');

// ---- two-way: readings come back, nothing is overwritten, blanks are filled
const T2=T+5e6;const R1=(ts,kind,odo,pct,where,car)=>({ts,kind,odo,pct,where,carKm:car});
const rd=(ph,list)=>post({token:'pw1',kind:'app',wantReadings:true,phone:ph,readings:list});
let a=rd('Antonio',[R1(T2,'start',100,100,'',''),R1(T2+10,'charge',110,90,'',''),R1(T2+20,'trip',120,80,'','')]);
ok(a.ok&&a.readings.length===4,'Antonio push returns his entries plus earlier ones');
let b=rd('Estelle',[R1(T2+30,'trip',130,70,'',380),R1(T2+10,'charge',110,90,'Home',390)]);
ok(b.readings.length===5,'Estelle gets Antonio entries plus her own');
const c10=b.readings.find(x=>x.ts===T2+10);
ok(c10.where==='Home'&&c10.carKm===390,'blank where and car km filled in by the other phone');
let a2=rd('Antonio',[R1(T2+10,'charge',110,90,'Station',400)]);
const c10b=a2.readings.find(x=>x.ts===T2+10);
ok(c10b.where==='Home'&&c10b.carKm===390,'existing values are never overwritten');
ok(a2.readings.length===5&&a2.readings.some(x=>x.ts===T2+30&&x.phone==='Estelle'),'Antonio now receives Estelle entry');
ok(rd('Antonio',[R1(T2,'start',100,100,'','')]).readings.length===5,'repeat send adds nothing');

// ---- AUTO rows removed once a real charge log covers them
const T3=T+9e6;
post({token:'pw1',kind:'app',phone:'Antonio',charges:[{ts:T3,where:'Home',pct:70,stored:5,wall:5.5,cost:21,measured:true,auto:true},{ts:T3+5,where:'Home',pct:90,stored:5,wall:5.5,cost:21,measured:true,auto:false}]});
const nBefore=sheets['Charge log'].rows.length;
post({token:'pw1',kind:'app',phone:'Antonio',autoRemove:[T3,T3+5],charges:[]});
ok(sheets['Charge log'].rows.length===nBefore-1,'only the AUTO row is removed, the real charge stays');
ok(!sheets['Charge log'].rows.some(r=>r[0] instanceof Date&&r[0].getTime()===T3),'AUTO row gone from Sheet');
ok(rd('Antonio',[]).script==='2.2.5','reply carries the script version');
ok(sheets['Phones']&&sheets['Phones'].rows.length===3&&sheets['Phones'].rows[1].length===5,'Phones tab lists each phone once with app and script version');
ok(sheets['Summary'].rows.some(r=>r[0]==='Sheet script'&&r[1]==='2.2.5'),'Summary shows script version');
console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0);
