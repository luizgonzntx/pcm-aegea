const assert=require('node:assert/strict'),P=require('./core.js');
const o=(id,extra={})=>({id,center:'PITE',tag:'T1',asset:'A1',equipment:'Bomba 01',type:'ZTPF',priority:'Necessário',date:'2026-01-10',created:'2026-01-05',plan:'P1',status:'ENTE',start:'2026-01-10',...extra});
const data={
 systems:[{tag:'T1',name:'ETA Sul'}],
 orders:[o('1'),o('2',{status:'ABER',start:''}),o('3',{status:'ENTE NEXE'}),o('4',{center:'PIAP'}),o('5',{date:'2025-12-01'}),o('6',{type:'ZNTE',plan:'',priority:'Emergência',start:'2026-01-18'})],
 items:[{order:'1',component:'Selo Mecânico',problem:'Vazamento',cause:'Cavitação'},{order:'6',component:'Circuitos de Comando',problem:'Desenergizado',cause:'Assimetria'}],
 actions:[{order:'1',action:'Substituir componente'},{order:'6',action:'RESET'}]
};
const f={from:'2026-01-01',to:'2026-01-31',dateField:'start'};
assert.equal(P.status(o('x',{status:'ENTE NEXE'})),'notdone');
assert.equal(P.status(o('x',{status:'XENTE'})),'other');
assert.equal(P.adherence(data,f).total,3);
assert.equal(P.adherence(data,f).done,1);
assert.equal(P.adherence(data,f).rate,1/3);
assert.equal(P.adherence(data,{...f,from:'2030-01-01',to:'2030-12-31'}).rate,null);
assert.equal(P.filter(data,f).length,4);
assert.equal(P.filter(data,{...f,priority:'Urgência'}).length,0);
const r=P.rank([{order:'1',cause:'A'},{order:'1',cause:'A'},{order:'2',cause:'A'},{order:'3',cause:'B'}],data.orders,'cause');assert.equal(r[0].count,1);
assert.equal(P.rank([{order:'1',component:'Motor',cause:'FALHA INEXISTENTE'}],data.orders,'component').length,0);
assert.equal(P.date('31/01/2026'),'2026-01-31');assert.throws(()=>P.date('31/02/2026'));assert.equal(P.period('',f),false);
assert.throws(()=>P.dedupe([{id:'1',v:1},{id:'1',v:2}],'id'));
assert.equal(P.dedupe([{id:'1'},{id:'1'}],'id').length,1);
const t=P.timing([o('1',{due:'2026-01-11',finished:'2026-01-10'}),o('2',{due:'2026-01-10',finished:'2026-01-12'}),o('3',{status:'ABER',due:'2026-01-01'}),o('4')],'2026-01-15');
assert.equal(t.onTime,1);assert.equal(t.late,1);assert.equal(t.overdue,1);assert.equal(t.unassessed,1);
const filtered=P.filter(data,f);
assert.equal(P.orderClass(o('1',{type:'ZTPF'})),'preventive');
assert.equal(P.orderClass(o('6',{type:'ZNTE'})),'corrective_emergency');
const eng=P.engineeringMetrics(data,filtered,'2026-01-31');
assert.equal(eng.preventive,3);
assert.equal(eng.correctiveEmerg,1);
assert.equal(eng.palliativeCount,1);
assert.equal(eng.cavitationCount,1);
assert.equal(eng.electricalCount,1);
const insights=P.decisionInsights(data,filtered,f);
assert.equal(insights.length>=3,true);
const actors=P.badActors(filtered);
assert.equal(actors.length,1);
assert.equal(actors[0].corrective,1);
console.log('PCM: regras de execução, aderência, datas, deduplicação, tipos, top ativos, matriz ICM, saúde e engenharia de manutenção verificadas.');

