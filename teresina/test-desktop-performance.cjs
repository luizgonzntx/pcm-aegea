'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const P=require('./core.js');
const tags=Array.from({length:60},(_,i)=>'PL-'+String(i+1).padStart(3,'0'));
const systems=tags.map(tag=>({tag,name:'Planta '+tag}));
const orders=Array.from({length:12000},(_,i)=>({
 id:String(910000000+i),center:i%17?'PITE':'PIAP',
 tag:tags[i%tags.length],asset:'AT-'+(i%140),type:i%4?'ZNTE':'ZTPF',
 priority:i%5?'Normal':'Alta',date:'2026-06-12',created:'2026-06-09',
 start:'2026-06-11',plan:i%4?'':'P1',status:i%7?'ENTE':'ABER'
}));
const data={systems,orders,items:[],actions:[],stoppageNotes:[],workLogs:[]};
const index=new Map();
for(const o of orders){if(!index.has(o.tag))index.set(o.tag,[]);index.get(o.tag).push(o);}
const filter={from:'2026-01-01',to:'2026-12-31',dateField:'created',tag:[],asset:[],type:[],priority:[]};
for(const s of systems){
 const scoped={systems:[s],orders:index.get(s.tag)};
 const f={...filter,tag:[s.tag]};
 const baseline=P.filter(data,f),optimized=P.filter(scoped,f);
 assert.deepEqual(optimized.map(o=>o.id),baseline.map(o=>o.id));
 assert.deepEqual(P.adherence(scoped,f),P.adherence(data,f));
 assert.deepEqual(P.timing(P.filter(scoped,f,true),'2026-11-06'),P.timing(P.filter(data,f,true),'2026-11-06'));
}
const app=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
const ui=fs.readFileSync(require('node:path').join(__dirname,'pcm-neural-orb.js'),'utf8');
const worker=fs.readFileSync(require('node:path').join(__dirname,'pcm-neural-chat-worker.js'),'utf8');
assert.match(app,/function systemSlice\(system\)/);
assert.match(app,/const reliable = reliabilityMaps\(\)/);
assert.match(app,/const limited = systemSlice\(s\)/);
assert.doesNotMatch(app,/P\.reliabilityByPlant\(data, sysFilter\)/);
assert.doesNotMatch(ui,/let liteMode=|isQuickMetric/);
assert.doesNotMatch(ui,/initialLiteMode|isQuickMetric\(q\)|localStorage\.getItem\('pcm_neural_lite'\)/);
assert.match(ui,/answer=await llm\\.ask\\(prepared\\.messages/);
assert.doesNotMatch(ui,/llm\?\.stop\('Chat fechado/);
assert.match(ui,/modelError=short\(error\?\.message\|\|error/);
assert.match(ui,/streamed\.slice\(-750\)/);
assert.match(worker,/max_new_tokens:160/);
assert.match(worker,/^const MODEL='onnx-community\/Qwen2\.5-0\.5B-Instruct';$/m);
assert.doesNotMatch(worker,/\\nconst MODEL=/);
assert.match(worker,/device:'webgpu',dtype:'q4'/);
console.log('PCM performance: filtros, aderência e prazos idênticos em 60 plantas e 12 mil OS.');
console.log('PCM performance: índice de TAG, confiabilidade agregada, Qwen padrão e preservação da GPU validados.');
