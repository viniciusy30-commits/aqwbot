const fs=require('fs'),path=require('path');
global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8'));eval(fs.readFileSync('skua-extra.js','utf8'));eval(fs.readFileSync('skua-cs.js','utf8'));
const root='/home/claude/rep/Scripts-Skua';const AF=Object.getPrototypeOf(async function(){}).constructor;
const target=process.argv[2];
const seen=new Set();let parts=[];
function load(rel){rel=rel.replace(/^Scripts\//,'');if(seen.has(rel))return;seen.add(rel);const tr=SkuaCS.transpile(fs.readFileSync(path.join(root,rel),'utf8'));(tr.includes||[]).forEach(load);parts.push(tr.js);return tr}
const tr=load(target);
const stubbed=new Set();
function stub(n){const f=function(){};return new Proxy(f,{get:(t,k)=>{if(k===Symbol.toPrimitive)return()=>0;if(k==='then')return undefined;if(k===Symbol.iterator)return function*(){};return stub(n+'.'+String(k))},apply:()=>stub(n+'()'),construct:()=>stub('new '+n),set:()=>true})}
const G=new Proxy({},{has:(t,k)=>typeof k==='string'&&!(k in globalThis)&&k!=='arguments'&&k!=='Bot',get:(t,k)=>{if(k===Symbol.unscopables)return undefined;stubbed.add(k);return stub(k)}});
window.__G=G;
const code='with(__G){\n'+parts.join('\n')+'\nvar __s = new '+tr.scriptClass+'();\nreturn __s;\n}';
console.log('files',seen.size,'bytes',code.length);
const mk=(n)=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:mk(n+'.'+String(k)),apply:()=>mk(n+'()'),construct:()=>mk(n+'new')});
const Bot=window.Bot||mk('Bot');
SkuaCS.install();
let f;try{f=new AF('Bot',code)}catch(e){console.log('SYNTAX',e.message);process.exit(1)}
f(Bot).then(s=>{console.log('instanciou',s&&s.constructor&&s.constructor.name);console.log('stubs',[...stubbed].join(' '))}).catch(e=>console.log('RUNTIME',e.stack.split('\n').slice(0,4).join('\n')));
