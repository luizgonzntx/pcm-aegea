'use strict';
const assert=require('node:assert/strict');
const E=require('./pcm-neural-prototype.js');
const mk=(id,tag,asset,type,status,brief)=>({
 id,center:'PITE',tag,asset,type,status,text:brief,created:'2026-11-03',date:'2026-11-03',
 plan:'PM-1',priority:'',start:'2026-11-03',finished:'2026-11-03'
});
const data={
 systems:[{tag:'PL-THE-ETA0001',name:'ETA Teste'},{tag:'PL-THE-EEE0002',name:'EEE Exemplo'}],
 orders:[
   mk('900123456','PL-THE-ETA0001','THE-A-00001','ZNTE','ENTE','Motor apresentou ruído'),
   mk('900123457','PL-THE-ETA0001','THE-A-00001','ZNTP','ABER','Revisão de rolamento'),
   mk('900123458','PL-THE-ETA0001','THE-A-00001','ZNTE','ENTE','Serviço no motor'),
   mk('900123459','PL-THE-ETA0001','THE-A-00002','ZTPF','ENTE','Preventiva programada'),
   mk('900123460','PL-THE-EEE0002','THE-A-00003','ZNTE','ABER','Vazamento'),
 ],
 items:[
   {order:'900123456',component:'Motor',problem:'Falha elétrica',cause:'Sobrecorrente'},
   {order:'900123458',component:'Motor',problem:'Desgaste',cause:'Rolamento'},
   {order:'900123460',component:'Válvula',problem:'Vazamento',cause:'Vedação'}
 ],
 actions:[{order:'900123456',action:'Ajuste de terminais'}, {order:'900123458',action:'Lubrificação'}],
 stoppageNotes:[],workLogs:[]
};
const ctx={data,revision:4,userId:'user-a',filters:{from:'2026-11-01',to:'2026-11-30',dateField:'created',tag:[],asset:[],type:[],priority:[]}};
const chat=E.createSession();
const ask=q=>chat.ask(ctx,q);
let r=ask('Me mostra a OS 900123456');
assert.equal(r.title,'Dossiê resumido · OS 900123456');
assert.equal(chat.contextStatus().lastOrder,'900123456');
assert.ok(r.followups.length>=2);
r=ask('E a causa?');
assert.equal(r.title,'ICM da OS 900123456');
assert.match(r.facts[0].value,/Sobrecorrente/);
r=ask('o que foi feito nessa ordem?');
assert.equal(r.title,'Intervenções cadastradas · OS 900123456');
assert.match(r.facts[0].value,/Ajuste de terminais/);
r=ask('E as outras ordens desse ativo?');
assert.equal(r.title,'Histórico do ativo THE-A-00001');
assert.equal(r.facts.find(x=>x.label==='Corretivas/reativas').value,'3');
assert.match(r.body,/3 ordens/);
r=ask('Quais as causas desse ativo?');
assert.match(r.title,/ICM · causas em THE-A-00001/);
assert.ok(r.facts.some(x=>x.label.includes('Rolamento')));
r=ask('Quantas corretivas abertas nessa instalação?');
assert.match(r.title,/Manutenção da PL-THE-ETA0001/);
assert.equal(r.facts.find(x=>x.label==='Em aberto').value,'1');
r=ask('Quantas corretivas estão abertas no total?');
assert.equal(r.title,'Ordens por modalidade de manutenção');
assert.equal(r.facts.find(x=>x.label==='Em aberto').value,'2');
r=ask('Qual a causa mais frequente no ICM?');
assert.equal(r.title,'Causas registradas mais frequentes');
r=ask('OS 999999999');
assert.match(r.title,/não encontrada/);
r=ask('Quero analisar a TAG THE-A-00002');
assert.equal(r.title,'Histórico do ativo THE-A-00002');
r=ask('o ICM dessa instalação?');
assert.match(r.title,/ICM · causas em PL-THE-ETA0001/);
chat.clear();
assert.equal(chat.contextStatus().lastOrder,'');
r=ask('E a causa?');
assert.notEqual(r.title,'ICM da OS 900123456');
r=ask('OS 900123456');
assert.equal(chat.contextStatus().lastOrder,'900123456');
r=chat.ask({...ctx,userId:'user-b'},'e a causa?');
assert.notEqual(r.title,'ICM da OS 900123456');
r=chat.ask({...ctx,revision:5},'OS 900123456');
assert.equal(chat.contextStatus().revision,5);
const target=chat.ask(ctx,'',{label:'THE-A-00002',value:''});
assert.equal(target.title,'Histórico do ativo THE-A-00002');
console.log('PCM Neural protótipo: continuidade, evidências, escopo, revisão e isolamento de usuário verificados.');
