const fs=require('fs'),path=require('path');
function load(file){const w={};const code=fs.readFileSync('skua.js','utf8');global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};delete global.SkuaCS;(0,eval)(code);(0,eval)(fs.readFileSync('skua-extra.js','utf8'));(0,eval)(fs.readFileSync(file,'utf8'));return global.SkuaCS}
const A=load('skua-cs.before.js').transpile; const B=load('skua-cs.js').transpile;
function walk(d,o){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()){if(!/docs|SkuaScriptsGenerator/.test(f))walk(p,o)}else if(/\.cs$/.test(f))o.push(p)}return o}
let same=0,diff=0,ex=[];
for(const f of walk('/home/claude/rep/Scripts-Skua',[])){const s=fs.readFileSync(f,'utf8');let a,b;try{a=A(s).js}catch(e){continue}try{b=B(s).js}catch(e){ex.push('NEWFAIL '+f);continue}if(a===b)same++;else{diff++;if(ex.length<6){const al=a.split('\n'),bl=b.split('\n');for(let i=0;i<al.length;i++)if(al[i]!==bl[i]){ex.push(f.split('Skua/').pop()+'\n  - '+al[i].slice(0,150)+'\n  + '+(bl[i]||'').slice(0,150));break}}}}
console.log({same,diff});console.log(ex.join('\n'));
