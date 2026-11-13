const fs=require('fs');
global.window=global; global.localStorage={_d:{},getItem(){return null},setItem(){}};
window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8')); eval(fs.readFileSync('skua-extra.js','utf8')); eval(fs.readFileSync('skua-cs.js','utf8'));
for(const f of process.argv.slice(2)){const src=fs.readFileSync(f,'utf8');try{SkuaCS.transpile(src);console.log('ok',f)}catch(e){const m=/linha (\d+)/.exec(e.message);console.log(f.split('Scripts-Skua/').pop(),e.message);if(m)console.log('   >',src.split('\n')[m[1]-1].trim().slice(0,160))}}
