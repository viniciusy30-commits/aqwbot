const fs=require('fs');
global.window=global; global.localStorage={_d:{},getItem(){return null},setItem(){}};
window.aqw={ok:()=>true,get:()=>null,set(){},keys:()=>[],target(){},cast(){},call:()=>null};
eval(fs.readFileSync('skua.js','utf8')); eval(fs.readFileSync('skua-extra.js','utf8')); eval(fs.readFileSync('skua-cs.js','utf8'));
const src=process.argv[2]; try{console.log(SkuaCS.transpile(src).js)}catch(e){console.log('ERR',e.message)}
