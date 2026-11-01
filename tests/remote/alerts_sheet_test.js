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
const T=Date.now();
let r=post({token:'pw1',kind:'meter',phone:'Estelle',live:{charging:true,watts:2750,amps:12,today_kwh:3.2,month_kwh:80.1,total_kwh:900},
  alerts:[{ts:T-120000,type:'session_start',level:'info',text:'Charging started'},{ts:T-60000,type:'charge_stopped_abrupt',level:'warning',text:'Charging stopped suddenly'}]});
ok(r.ok,'live push with alerts accepted');
ok(sheets['Alerts']&&sheets['Alerts'].rows.length===3,'both alerts stored in the Alerts tab');
ok(sheets['Summary']&&sheets['Summary'].rows[0][3]==='EV METER (last check)','live block created even before any app send');
r=post({token:'pw1',kind:'meter',phone:'Estelle',alerts:[{ts:T-120000,type:'session_start',level:'info',text:'Charging started'}]});
ok(sheets['Alerts'].rows.length===3,'same alert sent twice is stored once');
r=post({token:'pw1',kind:'pull',phone:'Antonio',wantAlerts:true,since:T-90000});
ok(r.ok&&r.alerts&&r.alerts.length===1&&r.alerts[0].type==='charge_stopped_abrupt'&&r.alerts[0].level==='warning','pull returns only alerts since the time');
ok(r.now>0,'pull returns the Sheet time');
r=post({token:'pw1',kind:'pull',phone:'Antonio',wantAlerts:true,wantMeter:true,since:0});
ok(r.alerts.length===2&&r.meter&&r.meter.live&&r.meter.live.charging===true&&r.meter.live.watts===2750,'pull with since 0 returns both alerts and the live block');
r=post({token:'pw1',kind:'pull',phone:'Antonio'});
ok(r.ok&&!('alerts' in r)&&!('meter' in r),'a pull that asks for nothing gets nothing');
ok(post({token:'bad',kind:'pull',wantAlerts:true}).ok===false,'wrong password refused');
post({token:'pw1',kind:'app',phone:'Antonio',readings:[],summary:{}});
ok(sheets['Summary'].rows[0][3]==='EV METER (last check)'&&sheets['Summary'].rows[3][4]===2750,'EV METER block survives an app send');
r=post({token:'pw1',kind:'app',phone:'Antonio',wantAlerts:true,since:0,readings:[]});
ok(r.alerts&&r.alerts.length===2,'an app send also returns the alerts');
ok(post({token:'pw1',kind:'app',phone:'X',readings:[]}).script==='2.2.5','script version is 2.2.5');
ok(src.includes('script 2.2.5'),'script header says 2.2.5');
console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0);
