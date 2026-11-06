'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const E=require('./pcm-neural-evidence.js');
const C=require('./pcm-neural-chat-client.js');
const ctx={revision:3,userId:'a',data:{
 orders:[
  {id:'900123456',tag:'PL-THE-ETA001',asset:'THE-A-00001',text:'Substituir motor (previsto)',status:'ABER',type:'ZNTE',created:'2026-11-03'},
  {id:'900123457',tag:'PL-THE-ETA001',asset:'THE-A-00001',text:'Inspeção no rolamento',status:'ENTE',type:'ZNTE',created:'2026-11-04'},
  {id:'900123458',tag:'PL-THE-ETA001',asset:'THE-A-00002',text:'Outros trabalhos',status:'ENTE',type:'ZNTE',created:'2026-11-02'}
 ],
 items:[{order:'900123456',component:'Motor',problem:'Sobreaquecimento',cause:'Ventilação obstruída'}],
 actions:[{order:'900123456',action:'Limpeza realizada no protetor do motor'}],
 systems:[{tag:'PL-THE-ETA001',name:'ETA Exemplo'}]
}};
const analytic={
 title:'ICM da OS 900123456',body:'Causa cadastrada no SAP',
 facts:[{label:'Causa',value:'Ventilação obstruída'}],
 source:'Itens e Causas - OS 900123456',caveat:'QUEST indisponível'
};
let p=E.makePrompt(ctx,'o que consta na OS 900123456?',null,analytic,{lastOrder:''},[
 {role:'user',content:'Olá'},
 {role:'assistant',content:'Bom dia!'}]);
assert.equal(p.orderId,'900123456');
assert.match(p.messages.at(-1).content,/Ventilação obstruída/);
assert.match(p.messages.at(-1).content,/Limpeza realizada/);
assert.match(p.messages.at(-1).content,/Substituir motor \(previsto\)/);
assert.match(p.messages.at(-1).content,/não prova, por si só, que o serviço foi executado/);
assert.doesNotMatch(p.messages.at(-1).content,/Outros trabalhos/);
assert.equal(p.messages[1].role,'user');
p=E.makePrompt(ctx,'e a causa da ordem?',null,analytic,{lastOrder:'900123456'},[]);
assert.equal(p.orderId,'900123456');
p=E.makePrompt(ctx,'para que serve um motor?',null,{title:'O que posso investigar na sua base',facts:[]},{},[]);
assert.equal(p.orderId,'');
assert.match(p.messages.at(-1).content,/Nenhuma evidência de OS específica/);
assert.throws(()=>E.makePrompt(null,'Olá',null,{},null),/dados autorizados/);
assert.equal(E.findOrder('qual a OS 900123456?'),'900123456');
const workerSrc=fs.readFileSync(require('node:path').join(__dirname,'pcm-neural-chat-worker.js'),'utf8');
const uiSrc=fs.readFileSync(require('node:path').join(__dirname,'pcm-neural-orb.js'),'utf8');
const index=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
assert.match(workerSrc,/Qwen2\.5-0\.5B-Instruct/);
assert.match(workerSrc,/device:'webgpu'/);
assert.match(workerSrc,/dtype:'q4'/);
assert.match(workerSrc,/callback_function/);
assert.match(uiSrc,/PCM_NEURAL_EVIDENCE\.makePrompt/);
assert.match(uiSrc,/llm\.ask/);
assert.match(uiSrc,/PCM_NEURAL_EDITS/);
assert.doesNotMatch(uiSrc,/Fonte: |CONSULTA AUDITÁVEL SAP/);
assert.doesNotMatch(uiSrc,/type="file"/);
assert.match(index,/pcm-neural-evidence.js\?v=20261106-8/);
assert.match(index,/pcm-neural-chat-client.js\?v=20261106-9/);
class FakeWorker {
 constructor(){this.listeners={};this.terminated=false;}
 addEventListener(name,cb){this.listeners[name]=cb;}
 postMessage(x){
  this.listeners.message({data:{type:'progress',id:x.id,percent:70,status:'progress'}});
  this.listeners.message({data:{type:'status',id:x.id,status:'generating'}});
  this.listeners.message({data:{type:'token',id:x.id,text:'O motor precisa '}});
  this.listeners.message({data:{type:'done',id:x.id,text:'O motor precisa de inspeção.'}});
 }
 terminate(){this.terminated=true;}
}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{}}});
globalThis.Worker=FakeWorker;
const client=C.createClient(()=>new FakeWorker());
const events=[];
client.ask(p.messages,{onProgress:x=>events.push(x.type),onToken:x=>events.push(x)}).then(output=>{
 assert.equal(output,'O motor precisa de inspeção.');
 assert.equal(client.status().ready,true);
 assert.ok(events.includes('progress'));
 assert.ok(events.includes('O motor precisa '));
 client.stop();
 assert.equal(client.status().ready,false);
 console.log('PCM Neural Qwen: retrieval, grounding, progress and client response passed.');
}).catch(e=>{console.error(e);process.exitCode=1;});
