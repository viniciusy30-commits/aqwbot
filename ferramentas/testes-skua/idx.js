const fs=require('fs'),path=require('path');
global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8'));eval(fs.readFileSync('skua-extra.js','utf8'));eval(fs.readFileSync('skua-cs.js','utf8'));
const root='/home/claude/rep/Scripts-Skua';
function walk(d,o){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const s=fs.statSync(p);if(s.isDirectory()){if(!/^(docs|SkuaScriptsGenerator|\.git)$/.test(f))walk(p,o)}else if(/\.cs$/.test(f))o.push(p)}return o}
const out=[];let simple=0;
for(const f of walk(root,[])){const rel=path.relative(root,f).split(path.sep).join('/');
 if(/(^|\/)Core[A-Z]?\w*\.cs$/.test(rel)||/^Tools\//.test(rel)||/^Templates\//.test(rel))continue;
 let tr;try{tr=SkuaCS.transpile(fs.readFileSync(f,'utf8'))}catch(e){continue}
 if(!tr.scriptClass)continue;
 const full=(tr.includes||[]).some(i=>/Core[A-Z]\w*\.cs$/.test(i)&&!/CoreBots\.cs$/.test(i))?1:0; if(!full)simple++;
 out.push([rel,full]);}
out.sort((a,b)=>a[0].localeCompare(b[0]));
console.error('bots',out.length,'simples',simple);
fs.writeFileSync('bots-index.json',JSON.stringify(out));
const cats={};out.forEach(([p])=>{const c=p.split('/')[0];cats[c]=(cats[c]||0)+1});console.error(JSON.stringify(cats));
