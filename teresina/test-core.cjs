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
assert.equal(P.kind(['Ordem','Data da nota','TAG Planta','Parada','Início da avaria','Início da avaria (hora)','Fim da avaria','Fim da avaria (hora)']),'stoppageNotes');
assert.equal(P.kind(['ORDEM ','Data da nota','TAG PLANTA','PARADA']),'stoppageNotes');
assert.equal(P.kind(['Número da Ordem','Flag Parada']),'stoppageNotes');
assert.equal(P.canonicalHeader('INICIO DA AVARIA (HORA)'),'Início da avaria (hora)');
assert.equal(P.kind(['Ordem','Data da nota','TAG Planta','Parada','Início da avaria']), 'stoppageNotes');
assert.equal(P.time('2:53:20'),'02:53:20');
assert.equal(P.time(0.5),'12:00:00');
assert.equal(P.time(0.9999999999),'23:59:59');
assert.throws(()=>P.time('25:00:00'));
const normalized=P.normalize({
 systems:[{COD_INFORMACAO:'T1',NOME:'ETA Sul',COD_LATITUDE:'-5',COD_LONGITUDE:'-42'}],
 orders:[
  {Ordem:'1','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ENTE','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'2','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ABER','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'3','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ABER','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'4','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ABER','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'5','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ABER','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'}
 ],
 items:[{Ordem:'1'}],
 actions:[{Ordem:'1'}],
 stoppageNotes:[
  {Ordem:'1','Data da nota':'05/01/2026',Nota:'N1','Descrição':'Parada','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'01/01/2026','Início da avaria (hora)':'02:00:00','Fim da avaria':'01/01/2026','Fim da avaria (hora)':'04:30:00'},
  {Ordem:'1','Data da nota':'06/01/2026',Nota:'N2','Descrição':'Parada repetida','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'01/01/2026','Início da avaria (hora)':'02:00:00','Fim da avaria':'01/01/2026','Fim da avaria (hora)':'04:30:00'},
  {Ordem:'1','Data da nota':'06/01/2026',Nota:'N3','Descrição':'Não marcada','TAG Planta':'T1',Parada:''},
  {Ordem:'2','Data da nota':'06/01/2026',Nota:'N4','Descrição':'Planta fora do cadastro','TAG Planta':'T2',Parada:'X'},
  {Ordem:'1','Data da nota':'',Nota:'N5','Descrição':'Sem data','TAG Planta':'T1',Parada:'X'},
  {Ordem:'2','Data da nota':'07/01/2026',Nota:'N6','Descrição':'Avaria ainda aberta','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'03/01/2026','Início da avaria (hora)':'02:00:00','Fim da avaria':'','Fim da avaria (hora)':'00:00:00'},
  {Ordem:'3','Data da nota':'08/01/2026',Nota:'N7','Descrição':'Fechada à meia-noite','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'04/01/2026','Início da avaria (hora)':'23:00:00','Fim da avaria':'05/01/2026','Fim da avaria (hora)':'00:00:00'},
  {Ordem:'4','Data da nota':'08/01/2026',Nota:'N8','Descrição':'Início incompleto','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'06/01/2026','Início da avaria (hora)':'','Fim da avaria':'06/01/2026','Fim da avaria (hora)':'00:00:00'},
  {Ordem:'5','Data da nota':'09/01/2026',Nota:'N9','Descrição':'Fim incompleto','TAG Planta':'T1','TAG Ativo':'A1','Texto prioridade':'Necessário',Parada:'X','Início da avaria':'05/01/2026','Início da avaria (hora)':'23:00:00','Fim da avaria':'06/01/2026','Fim da avaria (hora)':''}
 ]
},['sistemas.xlsx','ordens.xlsx','itens.xlsx','medidas.xlsx','notas.xlsx']);
assert.equal(normalized.stoppageNotes.length,7);
assert.equal(normalized.meta.stoppageOrders,5);
assert.equal(normalized.meta.excludedStoppageNotes,1);
assert.equal(normalized.meta.missingStoppageNoteDate,1);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31'}).length,1);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-02-01',to:'2026-02-28'}).length,0);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31'})[0].count,5);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31',asset:['A1'],type:['ZTPF'],priority:['Necessário']})[0].count,5);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31',priority:['Emergência']}).length,0);
const reliability=P.reliabilityByPlant(normalized,{from:'2026-01-01',to:'2026-01-31'});
assert.equal(reliability.length,1);
assert.equal(reliability[0].events,5);
assert.equal(reliability[0].mtbfHours,39);
assert.equal(reliability[0].mttrHours,1.75);
assert.equal(reliability[0].open,1);
assert.equal(reliability[0].closed,2);
assert.equal(reliability[0].incomplete,2);
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
