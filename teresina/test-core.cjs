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
  {Ordem:'3','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ENTE','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'4','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'LIB','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'},
  {Ordem:'5','TAG Planta':'T1',Centro:'PITE','Data de referência':'10/01/2026','Dta.início real':'','Data de entrada':'05/01/2026','Status do sistema':'ENCE','Plano de manutenção':'P1','Tipo de ordem':'ZTPF','Texto prioridade':'Necessário','TAG Ativo':'A1'}
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
assert.deepEqual(
 (({count,done,open,cancelled,other})=>({count,done,open,cancelled,other}))(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31'})[0]),
 {count:5,done:2,open:2,cancelled:1,other:0}
);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31',asset:['A1'],type:['ZTPF'],priority:['Necessário']})[0].count,5);
assert.equal(P.flaggedStopOrders(normalized,{from:'2026-01-01',to:'2026-01-31',priority:['Emergência']}).length,0);

assert.equal(P.kind(['Ordem','Operação','ID SAP','Trabalho real']),'workLogs');
assert.equal(P.canonicalHeader('Criado as'),'Criado às');
assert.equal(P.canonicalHeader('Ínício da avaria (hora)'),'Início da avaria (hora)');
const metricsData={
 orders:[
  o('100',{asset:'A1',type:'ZNTE',status:'ENTE',start:'2026-01-01',startTime:'10:00:00',date:'2026-01-01',referenceTime:'12:00:00'}),
  o('101',{asset:'A1',type:'ZNTE',status:'ENTE',start:'2026-01-03',startTime:'09:00:00',date:'2026-01-03',referenceTime:'10:00:00'}),
  o('102',{asset:'A2',type:'ZNTP',status:'ENTE',start:'2026-01-03',startTime:'11:00:00',date:'2026-01-03',referenceTime:'12:00:00'}),
  o('103',{asset:'A1',type:'ZNTE',status:'ABER',start:'2026-01-03',startTime:'11:00:00',date:'2026-01-03',referenceTime:'13:00:00'}),
  o('104',{asset:'A1',type:'ZTPF',status:'ENTE',start:'2026-01-04',startTime:'09:00:00',date:'2026-01-04',referenceTime:'10:00:00'})
 ],
 stoppageNotes:[
  {order:'100',tag:'T1',asset:'A1',flag:'X',noteType:'CE',date:'2026-01-01',createdTime:'08:00:00'},
  {order:'100',tag:'T1',asset:'A1',flag:'X',noteType:'CE',date:'2026-01-01',createdTime:'09:00:00'},
  {order:'101',tag:'T1',asset:'A1',flag:'X',noteType:'CE',date:'2026-01-03',createdTime:'08:00:00'},
  {order:'102',tag:'T1',asset:'A2',flag:'X',noteType:'CP',date:'2026-01-03',createdTime:'10:00:00'},
  {order:'103',tag:'T1',asset:'A1',flag:'X',noteType:'CE',date:'2026-01-03',createdTime:'10:00:00'},
  {order:'104',tag:'T1',asset:'A1',flag:'X',noteType:'CE',date:'2026-01-04',createdTime:'08:00:00'}
 ],
 workLogs:[
  {order:'100',operation:'0010',worker:'TECNICO1',hours:1},
  {order:'100',operation:'0010',worker:'TECNICO2',hours:1},
  {order:'100',operation:'0020',worker:'TECNICO1',hours:2,startDate:'2026-01-01',startTime:'10:00:00',endDate:'2026-01-01',endTime:'12:00:00'},
  {order:'100',operation:'0030',worker:'TECNICO2',hours:2,startDate:'2026-01-01',startTime:'10:00:00',endDate:'2026-01-01',endTime:'12:00:00'},
  {order:'101',operation:'0010',worker:'TECNICO1',hours:0.5},
  {order:'101',operation:'0020',worker:'TECNICO1',hours:1.5,startDate:'2026-01-03',startTime:'09:00:00',endDate:'2026-01-03',endTime:'10:00:00'},
  {order:'102',operation:'0020',worker:'TECNICO2',hours:1,startDate:'2026-01-03',startTime:'11:00:00',endDate:'2026-01-03',endTime:'12:00:00'},
  {order:'100',operation:'0020',worker:'',hours:100}
 ]
};
const evt=P.maintenanceEvents(metricsData,{from:'2026-01-01',to:'2026-01-31'});
assert.equal(evt.length,3); // Uma ordem não é duplicada por ter duas notas.
const first=evt.find(v=>v.order.id==='100');
assert.equal(first.attributionHours,2);
assert.equal(first.mttrHours,2);
assert.equal(first.referenceMttrHours,2);
assert.equal(first.stopHours,4);
assert.equal(first.travelPeople,2);
assert.equal(first.executionPeople,2);
assert.equal(first.travelHours,1);
assert.equal(first.executionHours,2);
assert.equal(first.attendanceHours,3);
const rel=P.reliabilityByPlant(metricsData,{from:'2026-01-01',to:'2026-01-31'});
assert.equal(rel.length,1);
assert.equal(rel[0].events,3);
assert.equal(rel[0].closed,3);
assert.equal(rel[0].mttrHours,4/3);
assert.equal(rel[0].attributionHours,4/3);
assert.equal(rel[0].stopHours,8/3);
assert.equal(rel[0].travelHours,0.75);
assert.equal(rel[0].executionHours,1.5);
assert.equal(rel[0].attendanceHours,2.25);
assert.equal(rel[0].mtbfHours,44); // Somente CE no mesmo ativo: 01/01 12h → 03/01 08h.
assert.equal(rel[0].intervals,1);
const byAsset=P.reliabilityByAsset(metricsData,{from:'2026-01-01',to:'2026-01-31'});
assert.equal(byAsset.length,2);
assert.equal(byAsset.find(v=>v.asset==='A1').mtbfHours,44);
assert.equal(byAsset.find(v=>v.asset==='A2').mtbfHours,null);
const withoutClock=P.reliabilityByPlant({
 orders:[o('single',{type:'ZNTE',status:'ENTE',start:'2026-01-01',startTime:'10:00:00',date:'2026-01-01',referenceTime:'12:00:00'})],
 stoppageNotes:[{order:'single',flag:'X',date:'2026-01-01',tag:'T1',asset:'A1',noteType:'CE'}]
},{from:'2026-01-01',to:'2026-01-31'});
assert.equal(withoutClock[0].mttrHours,null);
assert.equal(withoutClock[0].events,1);
assert.equal(withoutClock[0].attributionHours,null);
assert.equal(withoutClock[0].stopHours,null);
assert.equal(withoutClock[0].mtbfHours,null);
const overnight=P.reliabilityByPlant({
 orders:[o('overnight',{type:'ZNTE',status:'ENTE',start:'2026-01-31',startTime:'23:30:00',date:'2026-02-01',referenceTime:'01:30:00'})],
 stoppageNotes:[{order:'overnight',flag:'X',date:'2026-01-31',createdTime:'23:00:00',tag:'T1',noteType:'CE'}]
},{from:'2026-01-01',to:'2026-01-31'});
assert.equal(overnight[0].mttrHours,null);
assert.equal(overnight[0].events,1);
assert.equal(overnight[0].attributionHours,0.5);
assert.equal(overnight[0].stopHours,2.5);

const dashboard=P.maintenanceDashboard(metricsData,{from:'2026-01-01',to:'2026-03-31'});
assert.equal(dashboard.total.events,3);
assert.equal(dashboard.total.attributionHours,4/3);
assert.equal(dashboard.total.mttrHours,4/3);
assert.equal(dashboard.total.travelHours,0.75);
assert.equal(dashboard.total.executionHours,1.5);
assert.equal(dashboard.total.attendanceHours,2.25);
assert.equal(dashboard.total.mtbfHours,44);
assert.equal(dashboard.assets.length,2);
assert.equal(dashboard.months.length,3);
assert.equal(dashboard.months[0].month,'2026-01');
assert.equal(dashboard.months[0].events,3);
assert.equal(dashboard.months[0].mtbfHours,44);
assert.equal(dashboard.months[1].month,'2026-02');
assert.equal(dashboard.months[1].mttrHours,null);
assert.equal(dashboard.months[1].mtbfHours,null);
const jan3=P.maintenanceDashboard(metricsData,{from:'2026-01-03',to:'2026-01-31',tag:['T1']});
assert.equal(jan3.total.events,2);
assert.equal(jan3.total.mtbfHours,44); // Intervalo usa a falha de janeiro anterior ao filtro.
const onlyA2=P.maintenanceDashboard(metricsData,{from:'2026-01-01',to:'2026-01-31',tag:['T1'],asset:['A2']});
assert.equal(onlyA2.total.events,1);
assert.equal(onlyA2.total.mtbfHours,null);
assert.equal(onlyA2.assets.length,1);
assert.equal(onlyA2.assets[0].asset,'A2');
assert.equal(P.maintenanceDashboard(metricsData,{from:'2026-04-01',to:'2026-04-30'}).total.mttrHours,null);


// Regressão: a operação 0010 é exclusivamente deslocamento, nunca MTTR.
assert.equal(P.isTravelOperation('0010'),true);
assert.equal(P.isTravelOperation('10'),true);
assert.equal(P.isTravelOperation('0020'),false);
const onlyTravel=P.repairIntervals([
 {operation:'0010',worker:'A',hours:4,startDate:'2026-01-01',startTime:'06:00:00',endDate:'2026-01-01',endTime:'10:00:00'}
]);
assert.equal(onlyTravel.hours,null); // Zero duração válida não pode ser inventada.
const travelAndRepair=P.repairIntervals([
 {operation:'0010',worker:'A',hours:4,startDate:'2026-01-01',startTime:'06:00:00',endDate:'2026-01-01',endTime:'10:00:00'},
 {operation:'0020',worker:'A',hours:1,startDate:'2026-01-01',startTime:'08:00:00',endDate:'2026-01-01',endTime:'09:00:00'}
]);
assert.equal(travelAndRepair.hours,1); // Mesmo sobreposto, deslocamento não entra.
assert.equal(travelAndRepair.spanHours,1);

const overlap=P.repairIntervals([
 {operation:'0010',worker:'A',hours:1,startDate:'2026-01-01',startTime:'07:00:00',endDate:'2026-01-01',endTime:'08:00:00'},
 {operation:'0020',worker:'A',hours:2,startDate:'2026-01-01',startTime:'08:00:00',endDate:'2026-01-01',endTime:'10:00:00'},
 {operation:'0030',worker:'B',hours:2,startDate:'2026-01-01',startTime:'09:00:00',endDate:'2026-01-01',endTime:'11:00:00'},
 {operation:'0020',worker:'',hours:1,startDate:'2026-01-01',startTime:'12:00:00',endDate:'2026-01-01',endTime:'13:00:00'},
 {operation:'0020',worker:'A',hours:-1,startDate:'2026-01-01',startTime:'13:00:00',endDate:'2026-01-01',endTime:'14:00:00'},
 {operation:'0020',worker:'A',hours:2,startDate:'2026-01-02',startTime:'18:00:00',endDate:'2026-01-02',endTime:'17:00:00'}
]);
assert.equal(overlap.hours,4); // 08h–11h (com sobreposição) + 12h–13h.
assert.equal(overlap.spanHours,5);
assert.equal(overlap.gapHours,1);
assert.equal(P.repairIntervals([]).hours,null);
assert.equal(P.repairIntervals([{operation:'0010',worker:'A',hours:3,startDate:'2026-01-01',startTime:'10:00:00',endDate:'2026-01-01',endTime:'13:00:00'}]).hours,null);
assert.equal(P.repairIntervals([{operation:'0020',worker:'A',hours:1,startDate:'2026-01-31',startTime:'23:30:00',endDate:'2026-02-01',endTime:'00:30:00'}]).hours,1);

const workBase={
  systems:[{COD_INFORMACAO:'T1',NOME:'ETA Sul',COD_LATITUDE:'-5',COD_LONGITUDE:'-42'}],
  orders:[
   {Ordem:'CE1','TAG Planta':'T1',Centro:'PITE','Data de referência':'02/01/2026','Dta.início real':'01/01/2026','Data de entrada':'01/01/2026','Status do sistema':'ENTE','Plano de manutenção':'','Tipo de ordem':'ZNTE','TAG Ativo':'A1'},
   {Ordem:'CE2','TAG Planta':'T1',Centro:'PITE','Data de referência':'02/01/2026','Dta.início real':'01/01/2026','Data de entrada':'01/01/2026','Status do sistema':'ENTE','Plano de manutenção':'','Tipo de ordem':'ZNTP','TAG Ativo':'A2'},
   {Ordem:'PREV','TAG Planta':'T1',Centro:'PITE','Data de referência':'02/01/2026','Dta.início real':'01/01/2026','Data de entrada':'01/01/2026','Status do sistema':'ENTE','Plano de manutenção':'','Tipo de ordem':'ZTPF','TAG Ativo':'A3'}
  ],
  items:[{Ordem:'CE1'}],actions:[{Ordem:'CE1'}],
  stoppageNotes:[
   {Ordem:'CE1','Data da nota':'01/01/2026','TAG Planta':'T1',Parada:'X','Tipo de nota':'CE'},
   {Ordem:'CE2','Data da nota':'01/01/2026','TAG Planta':'T1',Parada:'X','Tipo de nota':'CP'}
  ],
  workLogs:[]
};
const makeRaw=(order,operation,worker,hours,a,b)=>({
 Ordem:order,Operação:operation,'ID SAP':worker,'Trabalho real':hours,
 'Data de início de execução real':'01/01/2026',
 'Hora de início de execução real':a,
 'Data real do fim de execução':'01/01/2026',
 'Hora real do fim de execução':b,
 'Criado em':'01/01/2026','Criado por':'TESTE'
});
const row1=makeRaw('CE1','0020','TEC1',2,'08:00:00','10:00:00');
const row2=makeRaw('CE1','0030','TEC2',1,'09:00:00','10:00:00');
workBase.workLogs=[
 row1,row1, // Duplicata exata não pode somar horas da equipe duas vezes.
 row2,makeRaw('CE1','0040','',0.5,'10:00:00','10:30:00'),
 makeRaw('CE1','0010','TEC1',1,'07:00:00','08:00:00'),
 makeRaw('CE1','0020','',1,'08:00:00','09:00:00'),
 makeRaw('CE1','0020','',-1,'08:00:00','09:00:00'),
 makeRaw('CE2','0010','TEC3',1,'07:00:00','08:00:00'),
 makeRaw('PREV','0020','TEC3',10,'08:00:00','18:00:00')
];
const normalizedTimes=P.normalize(workBase,['s','o','i','a','n','apontamentos']);
assert.equal(normalizedTimes.meta.maintenance.eligible,2);
assert.equal(normalizedTimes.meta.maintenance.repair,1);
assert.equal(normalizedTimes.meta.duplicateWorkRows,1);
assert.equal(normalizedTimes.meta.negativeWorkRows,1);
assert.equal(normalizedTimes.meta.reverseMatched,1);
assert.equal(normalizedTimes.meta.missingWorkerRows,1);
assert.equal(normalizedTimes.workLogs.length,5); // 3 exec CE1, 1 deslocamento CE1, 1 deslocamento CE2.
assert.equal(normalizedTimes.workLogs.some(log=>log.order==='PREV'),false);
const timeEvents=P.maintenanceEvents(normalizedTimes,{});
assert.equal(timeEvents.length,2);
assert.equal(timeEvents.find(e=>e.order.id==='CE1').mttrHours,2.5);
assert.equal(timeEvents.find(e=>e.order.id==='CE1').executionHours,1.5);
assert.equal(timeEvents.find(e=>e.order.id==='CE1').travelHours,1);
assert.equal(timeEvents.find(e=>e.order.id==='CE2').mttrHours,null);
assert.equal(P.maintenanceDashboard(normalizedTimes,{}).total.mttrHours,2.5);
assert.equal(P.maintenanceDashboard(normalizedTimes,{}).total.mttrHoursCount,1);

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

const icmData={
 orders:[
  o('ce1',{type:'ZNTE',status:'ENTE'}),
  o('cp1',{type:'ZNTP',status:'ENTE'}),
  o('preventiva',{type:'ZTPF',status:'ENTE'}),
  o('aberta',{type:'ZNTE',status:'ABER'}),
  o('naoexecutada',{type:'ZNTE',status:'ENTE NEXE'})
 ],
 items:[
  {order:'ce1',component:'Motor',problem:'Superaquecimento',cause:'Curto-circuito'},
  {order:'ce1',component:'Motor',problem:'Superaquecimento',cause:'Curto-circuito'},
  {order:'cp1',component:'Não informado',problem:'Vazamento',cause:'Falha inexistente'},
  {order:'preventiva',component:'Bomba',problem:'Inspeção',cause:'Desgaste'},
  {order:'aberta',component:'Rotor',problem:'Ruído',cause:'Cavitação'}
 ],
 actions:[
  {order:'ce1',action:'Substituir contator'},
  {order:'ce1',action:'Ajustar conexão'},
  {order:'ce1',action:'Substituir contator'},
  {order:'cp1',action:'Não executar'},
  {order:'preventiva',action:'Lubrificar'}
 ]
};
assert.equal(P.icmUseful('Não informado'),false);
assert.equal(P.icmUseful('Falha inexistente'),false);
assert.equal(P.icmUseful('Troca de selo'),true);
const icmAudit=P.icmAudit(icmData,icmData.orders);
assert.deepEqual(
 (({eligible,components,causes,fullItems,measures,complete,missingCause,missingMeasure})=>
  ({eligible,components,causes,fullItems,measures,complete,missingCause,missingMeasure}))(icmAudit),
 {eligible:2,components:1,causes:1,fullItems:1,measures:1,complete:1,missingCause:1,missingMeasure:1}
);
const icmMatrix=P.icmMatrix(icmData,icmData.orders);
assert.equal(icmMatrix.length,1);
assert.equal(icmMatrix[0].component,'Motor');
assert.equal(icmMatrix[0].count,1);
assert.deepEqual(icmMatrix[0].ids,['ce1']);
assert.equal(Object.hasOwn(icmMatrix[0],'action'),false); // Sem vínculo item↔medida presumido.
assert.equal(P.icmRank(icmData,icmData.orders,'action').length,2);
assert.equal(P.icmRank(icmData,icmData.orders,'component').length,1);
assert.equal(P.icmAudit(icmData,[o('x',{type:'ZTPF',status:'ENTE'})]).eligible,0);
assert.ok(normalized.meta.icm && normalized.meta.maintenance);

const insights=P.decisionInsights(data,filtered,f);
assert.equal(insights.length>=3,true);
const actors=P.badActors(filtered);
assert.equal(actors.length,1);
assert.equal(actors[0].corrective,1);
console.log('PCM: regras de execução, aderência, datas, deduplicação, tipos, top ativos, matriz ICM, saúde e engenharia de manutenção verificadas.');

// O levantamento deve vincular apenas nomes completos conhecidos, sem misturar plantas.
const inventory=require('./inventory.js');
assert.equal(inventory.find('  ETA SUL  ').id,'eta-sul');
assert.equal(inventory.find('ELEVATÓRIA DIRCEU').id,'elevatoria-dirceu');
assert.equal(inventory.find('Booster Dirceu').id,'booster-dirceu');
assert.equal(inventory.find('Dirceu'),null);
assert.equal(inventory.find('ETA Sul - outra planta'),null);
assert.equal(inventory.find(''),null);
assert.equal(inventory.find('Sistema R7').sections.length,4);
assert.equal(inventory.find('Planta Elevatória RN7 - Teresina').id,'sist-r7');
assert.equal(inventory.find('Planta RN-7').id,'sist-r7');
assert.equal(inventory.find('Planta RN70'),null);
assert.equal(inventory.find('ETA Sul').sections[0].powerCv,1750);
assert.equal(inventory.find('ETA Norte').sections[0].equipment[0].maintenance,2);
assert.equal(inventory.find('ETA Norte').sections[1].equipment[0].project,'1+2');
assert.equal(inventory.find('Sist. R7').sections[0].powerCv,null);
assert.equal(new Set(inventory.units.map(unit=>unit.id)).size,inventory.units.length);
for(const unit of inventory.units)for(const section of unit.sections)for(const item of section.equipment){
 for(const key of ['installed','operating','hotReserve','maintenance'])assert.ok(Number.isInteger(item[key])&&item[key]>=0,`${unit.name}: ${key}`);
}
console.log('Levantamento: associação por nome, seções e quantidades verificadas.');
assert.equal(inventory.find('1 - ETA SUL').id,'eta-sul');
assert.equal(inventory.find('10 — ETA NORTE').id,'eta-norte');
assert.equal(inventory.find('ETA Sul - Captação').sections.length,1);
assert.equal(inventory.find('ETA Sul - Captação').sections[0].powerCv,1750);
assert.equal(inventory.find('Recalque - ETA Norte').sections[0].powerCv,1050);
assert.equal(inventory.find('Captação'),null);
assert.equal(inventory.find('Booster Dirceu Norte'),null);


// Contrato da interface: atribuição fica no cálculo histórico, não na visão gerencial.
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'style.css'),'utf8');
const metricSelect=html.match(/<select id="maintenanceMetric"[\s\S]*?<\/select>/)?.[0]||'';
assert.equal((metricSelect.match(/<option /g)||[]).length,5);
assert.ok(!metricSelect.includes('attributionHours'));
assert.ok(!app.includes("['attributionHours','Atribuição']"));
assert.ok(!app.includes('<th>Atribuição</th>'));
assert.ok(!app.includes("field('Tempo de atribuição'"));
assert.ok(app.includes("['travelHours','Deslocamento']"));
assert.ok(css.includes('"travel exec repair failure"'));
assert.ok(css.includes('"attend attend . ."'));
assert.equal(P.maintenanceDashboard(metricsData,{from:'2026-01-01',to:'2026-01-31'}).total.attributionHours,4/3);
console.log('Interface: cinco indicadores gerenciais; histórico de atribuição preservado para auditoria.');
