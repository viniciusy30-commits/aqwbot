const fs=require('fs'),path=require('path');
global.window=global; global.localStorage={_d:{},getItem(){return null},setItem(){}};
window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8')); eval(fs.readFileSync('skua-extra.js','utf8')); eval(fs.readFileSync('skua-cs.js','utf8'));
const AF=Object.getPrototypeOf(async function(){}).constructor;
function walk(d,o){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()){if(!/docs|SkuaScriptsGenerator/.test(f))walk(p,o)}else if(/\.cs$/.test(f))o.push(p)}return o}
for(const f of walk(process.argv[2],[])){const src=fs.readFileSync(f,'utf8');let tr;
 try{tr=SkuaCS.transpile(src)}catch(e){const m=/linha (\d+)/.exec(e.message);console.log('T',f.split('Scripts-Skua/').pop(),e.message.slice(0,60),m?'| '+src.split('\n')[m[1]-1].trim().slice(0,110):'');continue}
 try{new AF('Bot',tr.js)}catch(e){console.log('S',f.split('Scripts-Skua/').pop(),e.message)}
 if(!tr.scriptClass&&process.argv[3])console.log('N',f.split('Scripts-Skua/').pop());}
