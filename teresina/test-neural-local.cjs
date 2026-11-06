'use strict';
const assert=require('node:assert/strict');
const P=require('./core.js'),local=require('./pcm-neural-local.js'),E=require('./pcm-neural-knowledge.js');
const sizes={
 'emb.weight':30*96,
 'convs.0.weight':128*96*3,'convs.0.bias':128,
 'convs.1.weight':128*96*5,'convs.1.bias':128,
 'convs.2.weight':128*96*7,'convs.2.bias':128,
 'body.0.weight':256*384,'body.0.bias':256,
 'swap.weight':4*256,'swap.bias':4,
 'outcome.weight':4*256,'outcome.bias':4
};
const weights={};
for(const [k,len] of Object.entries(sizes)){
 const v=new Float32Array(len);
 if(k==='swap.bias')v[3]=3;
 if(k==='outcome.bias')v[2]=3;
 weights[k]=Buffer.from(v.buffer).toString('base64');
}
const pkg={format:'pcm-neural-browser-v1',origin:'teste',model:{vocab:['<pad>','<unk>',...' abcdefghijklmnopqrstuvwxyz'],max_chars:640,weights,labels_swap:['sem_evidencia','apenas_prevista','potencial','relatada'],labels_outcome:['nao_informado','fora_de_operacao','operacao_relatada','relatos_mistos']},dossiers:{'800010002':{tag:'PL-THE-001',asset:'',brief:'Troca de painel',quest:[{texto:'Painel antigo. Precisa ser substituído.',operacao:'0020',linha:10}],notes:[],r:'apenas_prevista',s:'nao_informado'}}};
const state=local.loadObject(pkg);
assert.equal(state.connected,true);
assert.equal(state.orders,1);
const result=local.classifyOrder('800010002');
assert.equal(result.classification.swap,'relatada');
assert.equal(result.classification.outcome,'operacao_relatada');
assert.ok(result.classification.swapScore>.8);
const ctx={data:{systems:[{tag:'PL-THE-001',name:'EEE teste'}],orders:[],items:[],actions:[],stoppageNotes:[],workLogs:[]},revision:1,filters:{from:'2026-01-01',to:'2026-12-31',dateField:'created',tag:[],asset:[],type:[],priority:[]}};
const answer=E.answer(ctx,'Explique a OS 800010002');
assert.equal(answer.title,'PCM Neural conectado · OS 800010002');
assert.ok(answer.facts.some(x=>x.label==='QUEST — evidências originais'));
assert.ok(answer.facts.some(x=>x.label==='Possível erro de interpretação'));
assert.match(answer.caveat,/rótulos automáticos/);
assert.throws(()=>local.loadObject({format:'wrong'}),/Pacote invalido/);
console.log('PCM Neural: 10 checagens de inferência local, conexão privada e contradição de relato aprovadas.');
