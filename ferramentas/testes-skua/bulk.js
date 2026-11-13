const fs=require('fs'),path=require('path');
global.window=global; global.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v}};
window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8')); eval(fs.readFileSync('skua-extra.js','utf8')); eval(fs.readFileSync('skua-cs.js','utf8'));
const root=process.argv[2]; const AF=Object.getPrototypeOf(async function(){}).constructor;
function walk(d,o){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()){if(!/docs|SkuaScriptsGenerator/.test(f))walk(p,o)}else if(/\.cs$/.test(f))o.push(p)}return o}
const files=walk(root,[]); let ok=0,tf=0,sf=0,nos=0; const errs={};
for(const f of files){
  const src=fs.readFileSync(f,'utf8'); let tr;
  try{tr=SkuaCS.transpile(src)}catch(e){tf++;const k=e.message.replace(/\(linha \d+\)/,'').slice(0,70);(errs['T:'+k]=errs['T:'+k]||[]).push(f);continue}
  if(!tr.scriptClass){nos++;} 
  try{new AF('Bot',tr.js);ok++}catch(e){sf++;const k=e.message.slice(0,70);(errs['S:'+k]=errs['S:'+k]||[]).push(f)}
}
console.log({total:files.length,ok,transpileFail:tf,syntaxFail:sf,noScriptClass:nos});
Object.entries(errs).sort((a,b)=>b[1].length-a[1].length).slice(0,25).forEach(([k,v])=>console.log(v.length,k,'|',v[0].split('Scripts-Skua/').pop()));
