const fs=require('fs');
global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8'));eval(fs.readFileSync('skua-extra.js','utf8'));eval(fs.readFileSync('skua-cs.js','utf8'));
const root='/home/claude/rep/Scripts-Skua';const cnt={};
for(const f of ['CoreBots','CoreFarms','CoreAdvanced','CoreStory','CoreDailies']){const t=fs.readFileSync(root+'/'+f+'.cs','utf8').replace(/\/\/.*$/gm,'');
 for(const m of t.matchAll(/\bBot\.(\w+)\.(\w+)/g)){const k=m[1]+'.'+m[2];cnt[k]=(cnt[k]||0)+1}}
const B=window.Bot;const miss=[],have=[];
for(const [k,n] of Object.entries(cnt)){const [a,b]=k.split('.');const ok=B[a]!==undefined&&B[a]!==null&&(typeof B[a]==='object'||typeof B[a]==='function')&&(b in B[a]);(ok?have:miss).push([k,n])}
miss.sort((x,y)=>y[1]-x[1]);console.log('usados',Object.keys(cnt).length,'existem',have.length,'faltam',miss.length);
console.log(miss.slice(0,80).map(x=>x[0]+':'+x[1]).join(' '));
const top=Object.entries(cnt).filter(([k])=>!k.startsWith('Log')).length;
