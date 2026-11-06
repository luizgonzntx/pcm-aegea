'use strict';
const assert=require('node:assert/strict');
const P=require('./core.js');
const E=require('./pcm-neural-knowledge.js');
const mk=(id,text,type='ZNTE',status='ENTE')=>({id,center:'PITE',tag:'PL-THE-ETA0001',asset:'THE-A-1',type,status,created:'2026-11-03',date:'2026-11-03',text,priority:'',equipment:'CMB',plan:'PM-1',start:'2026-11-03',finished:'2026-11-03'});
const data={
 systems:[{tag:'PL-THE-ETA0001',name:'ETA Teste'}],
 orders:[mk('900123456','Inspeção geral'),mk('900123457','Substituir CMB', 'ZNTP','ABER'),mk('900123458','Foi realizado ajuste', 'ZNTE','ENTE')],
 items:[{order:'900123456',component:'Motor',problem:'Falha elétrica',cause:'Sobrecorrente'}],
 actions:[{order:'900123456',action:'Rearme do disjuntor'}],
 stoppageNotes:[],workLogs:[]
};
const ctx={data,revision:7,filters:{from:'2026-11-01',to:'2026-11-30',dateField:'created',tag:[],asset:[],type:[],priority:[]}};
const ask=q=>E.answer(ctx,q);
let r=ask('Quantas ordens foram executadas?');
assert.equal(r.title,'Situação da carteira de ordens');
assert.equal(r.facts.find(x=>x.label==='Executadas').value,'2');
r=ask('Quantas substituições aconteceram?');
assert.equal(r.title,'Substituições · evidência disponível');
assert.match(r.body,/1 ordens com termos/);
assert.match(r.caveat,/QUEST/);
r=ask('Qual causa mais frequente no ICM?');
assert.equal(r.title,'Causas registradas mais frequentes');
assert.equal(r.facts[0].value,'1 OS');
r=ask('Qual é o MTTR ativo?');
assert.match(r.body,/não possui intervalos técnicos válidos/);
r=ask('Como está o ICM?');
assert.equal(r.title,'Qualidade e cobertura do ICM');
r=ask('Explique a OS 900123456');
assert.equal(r.title,'Dossiê SAP · OS 900123456');
assert.match(r.facts.find(x=>x.label==='ICM — itens').value,/Sobrecorrente/);
assert.match(r.body,/não posso confirmar/);
r=ask('OS 999999999');
assert.match(r.body,/Não localizei/);
r=ask('Quais plantas têm mais ordens?');
assert.equal(r.title,'Instalações com mais ordens');
assert.equal(r.facts[0].value,'3 OS · PL-THE-ETA0001');
r=ask('Qual a aderência ao plano?');
assert.equal(r.title,'Aderência ao plano');
assert.match(r.body,/2 de 3/);
r=E.answer(null,'quantas ordens?');
assert.equal(r.title,'Base indisponível');
r=E.answer(ctx,'',{label:'MTTR ativo',value:'—'});
assert.equal(r.title,'MTTR ativo · tempo de reparo');
r=ask('Esse ICM condiz com o QUEST?');
assert.equal(r.title,'Conciliação ICM × QUEST ainda indisponível');
r=E.answer(ctx,'',{label:'ETA Teste',value:'PL-THE-ETA0001'});
assert.equal(r.title,'Instalação · ETA Teste');
r=E.answer(ctx,'',{label:'THE-A-1',value:''});
assert.equal(r.title,'Ativo · THE-A-1');
console.log('PCM Neural: 14 testes de consultas concluídos.');
