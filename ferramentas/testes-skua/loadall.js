process.on('unhandledRejection',()=>{});process.on('uncaughtException',()=>{});
const fs=require('fs'),path=require('path');
global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8'));eval(fs.readFileSync('skua-extra.js','utf8'));eval(fs.readFileSync('skua-cs.js','utf8'));
const root='/home/claude/rep/Scripts-Skua';const AF=Object.getPrototypeOf(async function(){}).constructor;
const idx=JSON.parse(fs.readFileSync('bots-index.json','utf8'));
const step=+process.argv[2]||1;const errs={};let ok=0,n=0,miss={};
(async()=>{
for(let i=0;i<idx.length;i+=step){const rel=idx[i][0];n++;
 try{const r=await SkuaCS.compileFull(fs.readFileSync(path.join(root,rel),'utf8'),async p=>fs.readFileSync(path.join(root,p),'utf8'),null,rel);
  const code=r.code.replace('if (__s.ScriptMain) await __s.ScriptMain(Bot);','').replace('/*SKUA:SLOPPY*/','');
  const f=new AF('Bot','sleep','log',code); await Promise.race([f(window.Bot,()=>{},()=>{}),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),3000))]); ok++;
 }catch(e){const k=String(e.message).slice(0,90);(errs[k]=errs[k]||[]).push(rel)}
}
console.log({n,ok});Object.entries(errs).sort((a,b)=>b[1].length-a[1].length).slice(0,12).forEach(([k,v])=>console.log(v.length,k,'|',v[0]));
console.log('faltando:',Object.keys(window.__missing||{}).length, Object.keys(window.__missing||{}).slice(0,60).join(' '));
})();
