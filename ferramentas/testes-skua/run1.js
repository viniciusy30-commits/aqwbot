process.on('unhandledRejection',e=>console.log('UNHANDLED',e&&e.message));
const fs=require('fs'),path=require('path');
const _st=global.setTimeout;global.setTimeout=(f,ms,...a)=>_st(f,ms>1000&&ms!==+process.argv[3]&&ms!==8000?Math.ceil(ms/200):Math.ceil((ms||0)/ (ms>1000?1:20)),...a);global.window=global;global.localStorage={_d:{},getItem(){return null},setItem(){}};
const G={'world.myAvatar':{},'ui.mcPopup.currentLabel':'"Bank"','world.myAvatar.items.length':50,'world.myAvatar.objData.strUsername':'tester','world.myAvatar.pMC.pname.ti.text':'tester','world.strMapName':'battleon','world.myAvatar.dataLeaf.intLevel':20,'world.myAvatar.objData.intLevel':20,'world.myAvatar.dataLeaf.intHP':100,'world.myAvatar.dataLeaf.intHPMax':100,'world.myAvatar.dataLeaf.intState':1};
window.aqw={ok:()=>true,get:(k)=>k in G?G[k]:null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8'));eval(fs.readFileSync('skua-extra.js','utf8'));eval(fs.readFileSync('skua-cs.js','utf8'));
const root='/home/claude/rep/Scripts-Skua';const rel=process.argv[2];const T=+process.argv[3]||8000;
(async()=>{
const r=await SkuaCS.compileFull(fs.readFileSync(path.join(root,rel),'utf8'),async p=>fs.readFileSync(path.join(root,p),'utf8'),null,rel);
const logs=[];const B=window.Bot;const _sl=B.Sleep;let cnt=0;B.Sleep=function(){cnt++;if(cnt==200)console.log('STACK',new Error().stack.split('\n').slice(1,9).join('\n'));return Promise.resolve()};
const AF=Object.getPrototypeOf(async function(){}).constructor;
let code=r.code.replace('/*SKUA:SLOPPY*/','');if(process.env.TR){code=code.replace(/^((?:static )?(?:async )?(\w+)\([^)]*\) \{)/gm,(m,a,n)=>a+' window.__tr("'+n+'");');window.__tr=n=>{window.__t=(window.__t||[]);window.__t.push(n);if(window.__t.length>400)window.__t.shift()};}
fs.writeFileSync('/tmp/last.js',code);
try{await Promise.race([new AF('Bot','sleep','log',code)(B,()=>{window.__n=(window.__n||0)+1;if(window.__n==300){console.log('STACK',new Error().stack.split('\n').slice(1,8).join('\n'))}return new Promise(r=>setTimeout(r,1))},m=>logs.push(m)),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout '+T)),T))]);console.log('fim normal')}catch(e){console.log('ERRO',e.stack.split('\n').slice(0,5).join('\n'))}
if(window.__t)console.log('TRACE',window.__t.slice(-25).join(' > '));console.log('LOGS:\n'+logs.slice(0,30).join('\n'));console.log('missing',Object.keys(window.__missing||{}).slice(0,30).join(' '));
process.exit(0)})();
