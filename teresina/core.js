(function(root){
'use strict';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
function status(o){const a=upper(o.status).split(/\s+/);return a.includes('NEXE')?'notdone':a.includes('ENTE')?'done':a.includes('ENCE')?'closed':a.some(v=>v==='ABER'||v==='LIB')?'open':'other';}
const labels={done:'Ordens executadas',notdone:'Não executadas',closed:'Encerradas administrativamente',open:'Em aberto',other:'Outras situações'};
// Os códigos SAP continuam na classificação interna, mas não aparecem na interface.
const typeLabels={
 ZTPF:'Preventiva por frequência',
 ZTPD:'Preditiva',
 ZTPC:'Preventiva por condição',
 ZNTE:'Corretiva emergencial',
 ZNTP:'Corretiva programada',
 ZTCO:'Controle operacional',
 ZNTS:'Serviços',
 ZTEN:'Engenharia de manutenção',
 ZTRE:'Reativa'
};
const typeGroups={ZNTS:'Não tática',ZNTP:'Não tática',ZNTE:'Não tática',ZTEN:'Tática',ZTPD:'Tática',ZTPF:'Tática',ZTPC:'Tática',ZTRE:'Tática',ZTCO:'Tática'};
function typeLabel(code){const k=upper(code);return typeLabels[k]||(text(code)?'Tipo não classificado':'Não classificado');}
function typeGroup(code){return typeGroups[upper(code)]||'Não classificada';}
function orderClass(o){
 const t=upper(o.type);
 if(t==='ZTPF'||t==='ZTPC')return 'preventive';
 if(t==='ZTPD')return 'predictive';
 if(t==='ZNTE')return 'corrective_emergency';
 if(t==='ZNTP'||t==='ZTCO')return 'corrective_planned';
 if(t==='ZTEN')return 'engineering';
 if(t==='ZNTS')return 'service';
 if(t==='ZTRE')return 'reactive';
 return text(o.plan)?'preventive':'corrective_planned';
}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function daysBetween(a,b){if(!validDate(a||'')||!validDate(b||''))return null;return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);}
function date(v){if(!text(v))return '';if(typeof v==='number'){if(v<1||v>150000)throw Error('Data numérica inválida');return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);}let s=text(v).slice(0,10),m=s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(m)s=m[3]+'-'+m[2]+'-'+m[1];if(!validDate(s))throw Error('Data inválida: '+text(v));return s;}
function time(v){if(v==null||text(v)==='')return '';let seconds;if(typeof v==='number'){if(v<0||v>=1)throw Error('Hora numérica inválida');seconds=Math.min(86399,Math.round(v*86400));}else{const m=text(v).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw Error('Hora inválida: '+text(v));const h=Number(m[1]),min=Number(m[2]),sec=Number(m[3]||0);if(h>23||min>59||sec>59)throw Error('Hora inválida: '+text(v));seconds=h*3600+min*60+sec;}const h=String(Math.floor(seconds/3600)).padStart(2,'0'),min=String(Math.floor(seconds%3600/60)).padStart(2,'0'),sec=String(seconds%60).padStart(2,'0');return h+':'+min+':'+sec;}
function period(v,f){return validDate(v||'')&&(!f.from||v>=f.from)&&(!f.to||v<=f.to);}
function filter(data,f,cohort){const tags=new Set(data.systems.map(s=>s.tag));const matches=(value,selected)=>{const list=Array.isArray(selected)?selected:(selected?[selected]:[]);return !list.length||list.includes(value);};return data.orders.filter(o=>o.center==='PITE'&&tags.has(o.tag)&&matches(o.tag,f.tag)&&matches(o.asset,f.asset)&&matches(o.type,f.type)&&matches(o.priority,f.priority)&&period(o[cohort?'date':(f.dateField||'date')],f));}
function stats(rows){const s={total:rows.length,done:0,open:0,notdone:0,closed:0,other:0};rows.forEach(o=>s[status(o)]++);return s;}
function adherence(data,f){const rows=filter(data,f,true).filter(o=>text(o.plan)),done=rows.filter(o=>status(o)==='done'),within=done.filter(o=>period(o.start,f));return {total:rows.length,done:done.length,within:within.length,rate:rows.length?done.length/rows.length:null,withinRate:rows.length?within.length/rows.length:null};}
function rank(rows,orders,field){const ids=new Set(orders.filter(o=>status(o)==='done').map(o=>o.id)),map=new Map;for(const row of rows){const value=text(row[field]);if(!ids.has(row.order)||!value||upper(value)==='NÃO EXECUTAR'||upper(value)==='NAO EXECUTAR'||upper(row.cause)==='FALHA INEXISTENTE'||upper(row.problem)==='FALHA INEXISTENTE')continue;if(!map.has(value))map.set(value,new Set);map.get(value).add(row.order);}return [...map].map(([name,ids])=>({name,count:ids.size,ids:[...ids]})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));}
function timing(rows,asOf){const r={onTime:0,late:0,overdue:0,upcoming:0,unassessed:0,notdone:0,before:0,same:0,after:0,withoutComparison:0};
 for(const o of rows.filter(o=>text(o.plan))){const s=status(o);if(s==='done'){if(validDate(o.start||'')&&validDate(o.date||''))r[o.start<o.date?'before':o.start>o.date?'after':'same']++;else r.withoutComparison++;if(validDate(o.due||'')&&validDate(o.finished||''))r[o.finished<=o.due?'onTime':'late']++;else r.unassessed++;}else if(s==='open'&&validDate(o.due||''))r[o.due<asOf?'overdue':'upcoming']++;else if(s==='notdone')r.notdone++;else r.unassessed++;}return r;}
function byType(rows){
 const map=new Map;
 for(const o of rows){
  const t=text(o.type)||'Não classificado';
  if(!map.has(t))map.set(t,{type:t,label:typeLabel(t),category:orderClass(o),total:0,done:0,open:0,notdone:0,closed:0,other:0,planned:0});
  const b=map.get(t);
  b.total++;
  b[status(o)]++;
  if(text(o.plan))b.planned++;
 }
 return [...map.values()].map(b=>({...b,group:typeGroup(b.type),rate:b.total?b.done/b.total:null})).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'pt-BR'));
}
function topAssets(rows){
 const map=new Map;
 for(const o of rows){
  const key=text(o.asset)||text(o.equipment);
  if(!key)continue;
  if(!map.has(key))map.set(key,{asset:text(o.asset)||key,equipment:text(o.equipment)||'Equipamento não informado',tag:text(o.tag),total:0,done:0,open:0,notdone:0,corrective:0,ids:new Set});
  const entry=map.get(key);
  entry.total++;
  const s=status(o),cls=orderClass(o);
  if(s==='done')entry.done++;
  else if(s==='open')entry.open++;
  else if(s==='notdone')entry.notdone++;
  if(cls==='corrective_emergency'||cls==='corrective_planned')entry.corrective++;
  entry.ids.add(o.id);
 }
 return [...map.values()].map(e=>({...e,ids:[...e.ids]})).sort((a,b)=>b.done-a.done||b.total-a.total||a.asset.localeCompare(b.asset,'pt-BR'));
}
function stopRecords(data,rows){
 const itemsByOrder=new Map;
 for(const item of (data.items||[])){
  if(!itemsByOrder.has(item.order))itemsByOrder.set(item.order,[]);
  itemsByOrder.get(item.order).push(item);
 }
 const systems=new Map((data.systems||[]).map(s=>[s.tag,s]));
 return rows.map(o=>{
  const linked=(itemsByOrder.get(o.id)||[]).flatMap(i=>[i.problem,i.cause,i.component]).filter(Boolean);
  const hay=upper([o.text,...linked].join(' '));
  const duration=daysBetween(o.stopStart,o.stopEnd);
  const confirmed=o.stopConfirmed===true||(duration!=null&&duration>=0);
  let reason=text(o.stopReason);
  if(!reason&&/PARADA|PARADO|PAROU|DESLIG|SEM PRODU|SEM OPER|FORA DE OPER|INTERRUP/.test(hay)) reason='Parada ou desligamento';
  else if(!reason&&/FALHA|AVARIA|DEFEIT|QUEIM|TRAVAMENT|VAZAMENT|QUEBRA|CURTO|SOBRECARGA|ALARM/.test(hay)) reason='Falha ou avaria';
  else if(!reason&&/INDISPONIBIL|BAIXA PRESS|BAIXA VAZ|SEM VAZ|PANE|\bTRIP\b/.test(hay)) reason='Indisponibilidade operacional';
  if(!reason&&confirmed) reason='Parada confirmada';
  if(!reason)return null;
  const system=systems.get(o.tag);
  return {
   id:o.id,
   year:validDate(o.created)?o.created.slice(0,4):'Sem ano',
   created:o.created||'',
   tag:o.tag||'',
   plant:system?.name||o.tag||'Instalação não informada',
   asset:o.asset||o.equipment||'Ativo não informado',
   equipment:o.equipment||'Equipamento não informado',
   reason,
   status:confirmed?'Confirmada':'Identificada',
   durationDays:duration,
   impact:text(o.stopImpact)||'Não informado',
   text:o.text||''
  };
 }).filter(Boolean);
}
function flaggedStopOrders(data,f){
 const selected=key=>Array.isArray(f?.[key])?f[key]:(f?.[key]?[f[key]]:[]);
 const matches=(key,value)=>{const values=selected(key);return !values.length||values.includes(value);};
 const ordersById=new Map((data.orders||[]).map(order=>[order.id,order]));
 const byPlant=new Map;
 for(const note of (data.stoppageNotes||[])){
  if(upper(note.flag)!=='X'||!text(note.order)||!text(note.tag)||!period(note.date||'',f||{}))continue;
  const order=ordersById.get(note.order);
  if(!matches('tag',note.tag)||!matches('asset',note.asset||order?.asset)||!matches('type',order?.type)||!matches('priority',note.priority||order?.priority))continue;
  if(!byPlant.has(note.tag))byPlant.set(note.tag,{tag:note.tag,plant:text(note.plant)||note.tag,ids:new Set,orders:new Map});
  const plant=byPlant.get(note.tag);
  plant.ids.add(note.order);
  if(!plant.orders.has(note.order))plant.orders.set(note.order,order?status(order):'other');
 }
 return [...byPlant.values()].map(item=>{
  const counts={done:0,open:0,cancelled:0,other:0};
  for(const orderStatus of item.orders.values()){
   if(orderStatus==='done')counts.done++;
   else if(orderStatus==='open')counts.open++;
   else if(orderStatus==='closed')counts.cancelled++;
   else counts.other++;
  }
  return {...item,ids:[...item.ids],count:item.ids.size,...counts};
 })
  .sort((a,b)=>b.count-a.count||a.plant.localeCompare(b.plant,'pt-BR'));
}

function timestamp(day,hour){if(!validDate(day||'')||!hour)return null;const ms=Date.parse(day+'T'+hour+'Z');return Number.isFinite(ms)?ms:null;}
function hoursGap(from,to){return Number.isFinite(from)&&Number.isFinite(to)&&to>=from?(to-from)/3600000:null;}
function maintenanceEvents(data,f){
 const byId=new Map((data.orders||[]).map(o=>[o.id,o]));
 const byOrder=new Map;
 const matches=(key,value)=>{const v=f?.[key],selected=Array.isArray(v)?v:(v?[v]:[]);return !selected.length||selected.includes(value);};
 for(const note of (data.stoppageNotes||[])){
  if(upper(note.flag)!=='X'||!text(note.order)||!period(note.date||'',f||{}))continue;
  const o=byId.get(note.order);
  if(!o||status(o)!=='done'||!['ZNTE','ZNTP'].includes(upper(o.type))||!['','CE','CP'].includes(upper(note.noteType)))continue;
  const tag=o.tag||note.tag,asset=text(o.asset)||text(note.asset);
  if(!tag||note.tag!==tag||!matches('tag',tag)||!matches('asset',asset)||!matches('type',o.type)||!matches('priority',note.priority||o.priority))continue;
  const created=timestamp(note.date,note.createdTime),start=timestamp(o.start,o.startTime),end=timestamp(o.date,o.referenceTime);
  if(!byOrder.has(o.id))byOrder.set(o.id,{order:o,tag,plant:text(note.plant)||tag,asset,equipment:text(o.equipment),notes:[],created:null,start,end,ids:[o.id]});
  const event=byOrder.get(o.id);
  event.notes.push(note.note);
  if(created!==null&&(event.created===null||created<event.created))event.created=created;
 }
 const logsByOrder=new Map;
 for(const log of (data.workLogs||[])){
  if(!byOrder.has(log.order)||!text(log.worker)||!Number.isFinite(log.hours)||log.hours<0)continue;
  if(!logsByOrder.has(log.order))logsByOrder.set(log.order,{travelHours:0,executionHours:0,travelWorkers:new Set,executionWorkers:new Set});
  const bucket=logsByOrder.get(log.order),travel=text(log.operation).padStart(4,'0')==='0010';
  if(travel){bucket.travelHours+=log.hours;bucket.travelWorkers.add(log.worker);}
  else {bucket.executionHours+=log.hours;bucket.executionWorkers.add(log.worker);}
 }
 return [...byOrder.values()].map(event=>{
  const logs=logsByOrder.get(event.order.id);
  const travelAvg=logs?.travelWorkers.size?logs.travelHours/logs.travelWorkers.size:null;
  const executionAvg=logs?.executionWorkers.size?logs.executionHours/logs.executionWorkers.size:null;
  return {...event,
   attributionHours:hoursGap(event.created,event.start),
   mttrHours:hoursGap(event.start,event.end),
   stopHours:hoursGap(event.created,event.end),
   travelHours:travelAvg,executionHours:executionAvg,
   attendanceHours:travelAvg!==null&&executionAvg!==null?travelAvg+executionAvg:null,
   travelPeople:logs?.travelWorkers.size||0,executionPeople:logs?.executionWorkers.size||0,
   travelPersonHours:logs?.travelHours||0,executionPersonHours:logs?.executionHours||0
  };
 });
}
function reliabilityByGroup(data,f,byAsset){
 const groups=new Map;
 for(const e of maintenanceEvents(data,f)){
  if(byAsset&&!e.asset)continue;
  const key=byAsset?e.tag+'\u0000'+e.asset:e.tag;
  if(!groups.has(key))groups.set(key,{tag:e.tag,plant:e.plant,asset:byAsset?e.asset:'',equipment:byAsset?e.equipment:'',events:[]});
  groups.get(key).events.push(e);
 }
 const average=(arr,key)=>{const v=arr.map(e=>e[key]).filter(x=>Number.isFinite(x)&&x>=0);return {value:v.length?v.reduce((s,x)=>s+x,0)/v.length:null,count:v.length};};
 return [...groups.values()].map(g=>{
  const e=g.events;
  const repair=average(e,'mttrHours'),attrib=average(e,'attributionHours'),stop=average(e,'stopHours');
  const travel=average(e,'travelHours'),execution=average(e,'executionHours'),attendance=average(e,'attendanceHours');
  // O MTBF considera somente falhas CE consecutivas do mesmo TAG Ativo.
  const assets=new Map;
  for(const v of e){if(upper(v.order.type)!=='ZNTE'||!v.asset)continue;if(!assets.has(v.asset))assets.set(v.asset,[]);assets.get(v.asset).push(v);}
  let intervalSum=0,intervalCount=0,overlapping=0;
  for(const timeline of assets.values()){
   const events=timeline.filter(v=>v.created!==null&&v.end!==null).sort((a,b)=>a.created-b.created);
   for(let i=1;i<events.length;i++){
    const gap=hoursGap(events[i-1].end,events[i].created);
    if(gap!==null){intervalSum+=gap;intervalCount++;}else overlapping++;
   }
  }
  const mtbfHours=intervalCount?intervalSum/intervalCount:null,mttrHours=repair.value;
  const denominator=mtbfHours+mttrHours;
  return {tag:g.tag,plant:g.plant,asset:g.asset,equipment:g.equipment,
   events:e.length,closed:repair.count,incomplete:e.length-repair.count,
   mttrHours,mtbfHours,intervals:intervalCount,overlapping,
   attributionHours:attrib.value,attributionCount:attrib.count,
   travelHours:travel.value,travelCount:travel.count,
   executionHours:execution.value,executionCount:execution.count,
   attendanceHours:travel.value!=null&&execution.value!=null?travel.value+execution.value:null,attendanceCount:attendance.count,
   stopHours:stop.value,stopCount:stop.count,
   availability:mtbfHours!=null&&mttrHours!=null&&denominator>0?mtbfHours/denominator:null,
   ids:e.map(v=>v.order.id)};
 }).sort((a,b)=>b.events-a.events||a.plant.localeCompare(b.plant,'pt-BR')||(byAsset?a.asset.localeCompare(b.asset,'pt-BR'):0));
}
function reliabilityByPlant(data,f){return reliabilityByGroup(data,f,false);}
function reliabilityByAsset(data,f){return reliabilityByGroup(data,f,true);}
function badActors(rows){
 const byAsset=new Map;
 for(const o of rows){
  const key=text(o.asset);
  if(!key)continue;
  if(!byAsset.has(key))byAsset.set(key,{asset:key,equipment:text(o.equipment)||'Não informado',tag:text(o.tag),total:0,done:0,corrective:0,emergency:0,open:0,dates:[],ids:new Set});
  const a=byAsset.get(key);
  if(a.equipment==='Não informado'&&text(o.equipment))a.equipment=text(o.equipment);
  a.total++;
  const s=status(o),cls=orderClass(o);
  if(s==='done')a.done++;
  if(s==='open')a.open++;
  if(cls==='corrective_emergency'||cls==='corrective_planned'){
   a.corrective++;
   if(cls==='corrective_emergency')a.emergency++;
   const d=o.start||o.created||o.date;
   if(validDate(d))a.dates.push(d);
  }
  a.ids.add(o.id);
 }
 return [...byAsset.values()].map(a=>{
  const sorted=[...a.dates].sort();
  let sumDiff=0,intervals=0,rework30d=0;
  for(let i=1;i<sorted.length;i++){
   const diff=daysBetween(sorted[i-1],sorted[i]);
   if(diff!=null&&diff>=0){
    sumDiff+=diff;
    intervals++;
    if(diff<=30)rework30d++;
   }
  }
  const mtbfDays=intervals>0?sumDiff/intervals:null;
  return {asset:a.asset,equipment:a.equipment,tag:a.tag,total:a.total,done:a.done,corrective:a.corrective,emergency:a.emergency,open:a.open,rework30d,mtbfDays,ids:[...a.ids]};
 }).filter(a=>a.corrective>0||a.total>=3).sort((a,b)=>b.corrective-a.corrective||b.rework30d-a.rework30d||b.total-a.total);
}

// ICM diagnóstico: somente corretivas CE/CP encerradas tecnicamente.
// Catálogos de itens e medidas compartilham a OS, mas NÃO provam associação item↔medida.
function icmUseful(value){
 const v=headerKey(value);
 return !!v && !['0','null','undefined','na','n a','nenhum','nenhuma',
  'nao informado','nao informada','sem informacao','sem registro',
  'nao aplicavel','nao executar','falha inexistente'].includes(v);
}
function icmScope(orders){
 return new Set((orders||[]).filter(o=>status(o)==='done'&&['ZNTE','ZNTP'].includes(upper(o.type))).map(o=>o.id));
}
function icmRank(data,orders,field){
 const ids=icmScope(orders),values=new Map;
 const source=field==='action'?data.actions:data.items;
 for(const row of (source||[])){
  if(!ids.has(row.order)||!icmUseful(row[field]))continue;
  const key=text(row[field]);
  if(!values.has(key))values.set(key,new Set);
  values.get(key).add(row.order);
 }
 return [...values].map(([name,orderIds])=>({name,count:orderIds.size,ids:[...orderIds]}))
   .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
}
function icmAudit(data,orders){
 const ids=icmScope(orders),comp=new Set,prob=new Set,cause=new Set,fullItem=new Set,measure=new Set;
 for(const row of (data.items||[])){
  if(!ids.has(row.order))continue;
  const c=icmUseful(row.component),p=icmUseful(row.problem),a=icmUseful(row.cause);
  if(c)comp.add(row.order);
  if(p)prob.add(row.order);
  if(a)cause.add(row.order);
  if(c&&p&&a)fullItem.add(row.order);
 }
 for(const row of (data.actions||[]))if(ids.has(row.order)&&icmUseful(row.action))measure.add(row.order);
 let complete=0;
 for(const id of fullItem)if(measure.has(id))complete++;
 return {eligible:ids.size,components:comp.size,problems:prob.size,causes:cause.size,
  fullItems:fullItem.size,measures:measure.size,complete,
  coverage:ids.size?complete/ids.size:null,missingCause:ids.size-cause.size,
  missingMeasure:ids.size-measure.size,missingItem:ids.size-fullItem.size};
}
function icmMatrix(data,orders){
 const doneIds=icmScope(orders),map=new Map;
 for(const item of (data.items||[])){
  if(!doneIds.has(item.order))continue;
  // Uma combinação só existe quando os três campos constam da MESMA linha de item.
  if(!icmUseful(item.component)||!icmUseful(item.problem)||!icmUseful(item.cause))continue;
  const comp=text(item.component),prob=text(item.problem),cause=text(item.cause);
  const key=[comp,prob,cause].join('\u0000');
  if(!map.has(key))map.set(key,{component:comp,problem:prob,cause,ids:new Set});
  map.get(key).ids.add(item.order);
 }
 return [...map.values()].map(r=>({component:r.component,problem:r.problem,cause:r.cause,count:r.ids.size,ids:[...r.ids]}))
   .sort((a,b)=>b.count-a.count||a.component.localeCompare(b.component,'pt-BR'));
}
function engineeringMetrics(data,rows,asOf){
 let preventive=0,predictive=0,correctiveEmerg=0,correctivePlan=0,service=0,engineering=0,reactive=0;
 let prioEmerg=0,prioUrg=0,agedOpen30d=0;
 const doneIds=new Set,correctiveDoneIds=new Set;
 for(const o of rows){
  const cls=orderClass(o),s=status(o),p=upper(o.priority);
  if(cls==='preventive')preventive++;
  else if(cls==='predictive')predictive++;
  else if(cls==='corrective_emergency')correctiveEmerg++;
  else if(cls==='corrective_planned')correctivePlan++;
  else if(cls==='service')service++;
  else if(cls==='engineering')engineering++;
  else if(cls==='reactive')reactive++;
  if(p.includes('EMERG'))prioEmerg++;
  else if(p.includes('URG'))prioUrg++;
  if(s==='done'){
   doneIds.add(o.id);
   if(['ZNTE','ZNTP'].includes(upper(o.type)))correctiveDoneIds.add(o.id);
  }else if(s==='open'&&asOf){
   const refDate=o.created||o.date;
   const age=daysBetween(refDate,asOf);
   if(age!=null&&age>30)agedOpen30d++;
  }
 }
 const total=rows.length;
 const proactive=preventive+predictive+engineering;
 const reactiveTotal=correctiveEmerg+correctivePlan+service+reactive;
 const proactiveRate=total?proactive/total:null;
 const predictiveRate=total?predictive/total:null;
 const emergencyRate=total?prioEmerg/total:null;
 const itemsOrders=new Set,palliativeOrders=new Set,cavitationOrders=new Set,electricalOrders=new Set;
 for(const i of (data.items||[])){
  if(!doneIds.has(i.order))continue;
  const c=upper(i.cause),pr=upper(i.problem);
  if(c==='FALHA INEXISTENTE'||pr==='FALHA INEXISTENTE')continue;
  if(icmUseful(i.component)&&icmUseful(i.problem)&&icmUseful(i.cause))itemsOrders.add(i.order);
  if(c.includes('CAVITA')||c.includes('DETRITO')||pr.includes('VAZAMENTO')||pr.includes('BAIXA VAZ'))cavitationOrders.add(i.order);
  if(c.includes('TENSÃO')||c.includes('TENSAO')||c.includes('ASSIMETRIA')||c.includes('CURTO')||c.includes('SOBRECARGA')||c.includes('PROGRAMA')||c.includes('CONFIGURA'))electricalOrders.add(i.order);
 }
 const actionOrders=new Set;
 for(const a of (data.actions||[])){
  if(!doneIds.has(a.order))continue;
  const act=upper(a.action);
  if(!icmUseful(act))continue;
  actionOrders.add(a.order);
  if(act.includes('RESET')||act.includes('REARM')||act.includes('PARAMETRO')||act.includes('PARÂMETRO'))palliativeOrders.add(a.order);
 }
 let corrWithIcm=0;
 for(const id of correctiveDoneIds){if(itemsOrders.has(id)&&actionOrders.has(id))corrWithIcm++;}
 const icmCoverageRate=correctiveDoneIds.size?corrWithIcm/correctiveDoneIds.size:null;
 const palliativeRate=actionOrders.size?palliativeOrders.size/actionOrders.size:null;
 const actors=badActors(rows);
 const totalRework30d=actors.reduce((s,a)=>s+a.rework30d,0);
 return {
  total,preventive,predictive,engineering,correctiveEmerg,correctivePlan,service,reactive,proactive,reactiveTotal,
  proactiveRate,predictiveRate,emergencyRate,prioEmerg,prioUrg,
  agedOpen30d,
  icmCoverageRate,corrWithIcm,correctiveDoneTotal:correctiveDoneIds.size,
  palliativeCount:palliativeOrders.size,palliativeRate,
  cavitationCount:cavitationOrders.size,electricalCount:electricalOrders.size,
  totalRework30d,
  palliativeIds:[...palliativeOrders],cavitationIds:[...cavitationOrders],electricalIds:[...electricalOrders]
 };
}
function decisionInsights(data,rows,f){
 const m=engineeringMetrics(data,rows,new Date().toISOString().slice(0,10));
 const adh=adherence(data,f);
 const actors=badActors(rows);
 const insights=[];
 if(m.proactiveRate!=null){
  const pctVal=Math.round(m.proactiveRate*100);
  insights.push({
   severity:pctVal>=75?'good':pctVal>=60?'warn':'critical',
   category:'MIX DE MANUTENÇÃO (NBR 5462 / SMRP)',
   title:pctVal>=75?'Matriz Proativa Saudável ('+pctVal+'%)':'Excesso de Demanda Reativa ('+(100-pctVal)+'% Corretiva/Serviços)',
   body:'Das '+m.total.toLocaleString('pt-BR')+' ordens no recorte, '+m.proactive.toLocaleString('pt-BR')+' ('+pctVal+'%) são preventivas/preditivas/engenharia e '+m.reactiveTotal.toLocaleString('pt-BR')+' são corretivas, reativas ou serviços. O benchmark de classe mundial (SMRP) recomenda ≥ 80% de atuação proativa.',
  });
 }
 if(m.palliativeCount>0){
  const pPct=m.palliativeRate?Math.round(m.palliativeRate*100):0;
  insights.push({
   severity:pPct>20?'critical':'warn',
   category:'CONFIABILIDADE ELÉTRICA & AUTOMAÇÃO',
   title:'Alerta de "Efeito Reset": '+m.palliativeCount.toLocaleString('pt-BR')+' intervenções paliativas ('+pPct+'% das medidas)',
   body:'Foram identificadas '+m.palliativeCount.toLocaleString('pt-BR')+' ordens encerradas com medidas paliativas (Reset / Rearme / Ajuste de parâmetros) e '+m.electricalCount.toLocaleString('pt-BR')+' ocorrências por distúrbios elétricos/automação (assimetria, subtensão, sobretensão, erro de configuração).',
   ids:m.palliativeIds
  });
 }
 if(m.cavitationCount>0){
  insights.push({
   severity:m.cavitationCount>=20?'critical':'warn',
   category:'INTEGRIDADE HIDRÁULICA E MECÂNICA',
   title:m.cavitationCount.toLocaleString('pt-BR')+' ordens com Cavitação, Detritos ou Perda Hidráulica',
   body:'Os apontamentos indicam desgaste prematuro de rotores, eixos e selos mecânicos associados a cavitação e entrada de detritos nas elevatórias/poços.',
   ids:m.cavitationIds
  });
 }
 if(actors.length>0&&actors[0].corrective>=3){
  const top=actors.slice(0,3).map(a=>a.asset+' ('+a.corrective+' corr.)').join(', ');
  insights.push({
   severity:actors[0].rework30d>0?'critical':'warn',
   category:'GESTÃO DE ATIVOS CRÍTICOS (BAD ACTORS)',
   title:actors.filter(a=>a.rework30d>0).length+' ativos com reincidência em menos de 30 dias ('+m.totalRework30d+' retrabalhos)',
   body:'Os ativos mais críticos no período são: '+top+'. A repetição de falhas em intervalo inferior a 30 dias caracteriza falha prematura ou atuação apenas no sintoma.',
   ids:actors[0].ids
  });
 }
 if(m.icmCoverageRate!=null&&m.correctiveDoneTotal>0){
  const covPct=Math.round(m.icmCoverageRate*100);
  insights.push({
   severity:covPct>=80?'good':covPct>=50?'warn':'critical',
   category:'GOVERNANÇA DE DADOS PCM (SAP)',
   title:'Cobertura de Apontamento ICM nas Corretivas: '+covPct+'%',
   body:'De '+m.correctiveDoneTotal.toLocaleString('pt-BR')+' ordens corretivas CE/CP encerradas tecnicamente, '+m.corrWithIcm.toLocaleString('pt-BR')+' possuem Item, Problema e Causa no mesmo registro, além de pelo menos uma Medida na ordem.',
  });
 }
 if(adh.rate!=null){
  const adhPct=Math.round(adh.rate*100);
  insights.push({
   severity:adhPct>=85?'good':adhPct>=65?'warn':'critical',
   category:'DISCIPLINA DE EXECUÇÃO DO PLANO',
   title:'Aderência à Preventiva/Preditiva em '+adhPct+'% ('+m.agedOpen30d+' OS abertas > 30 dias)',
   body:'Foram cumpridas '+adh.done.toLocaleString('pt-BR')+' de '+adh.total.toLocaleString('pt-BR')+' ordens planejadas no período, restando '+m.agedOpen30d.toLocaleString('pt-BR')+' ordens abertas com mais de 30 dias de carteira.',
  });
 }
 return insights;
}
function systemHealth(rate,overdue){
 if(rate==null)return overdue>0?'critical':'neutral';
 if(rate>=0.85&&!(overdue>0))return 'good';
 if(rate>=0.60)return 'warn';
 return 'critical';
}
function dedupe(rows,key){const m=new Map;for(const r of rows){const id=text(r[key]);if(!id)throw Error('Registro sem identificador');if(m.has(id)&&JSON.stringify(m.get(id))!==JSON.stringify(r))throw Error('Registros divergentes para '+id);m.set(id,r);}return [...m.values()];}
const schemas={
 systems:['COD_INFORMACAO','NOME','COD_LATITUDE','COD_LONGITUDE'],
 orders:['Ordem','TAG Planta','Centro','Data de referência','Dta.início real','Data de entrada','Status do sistema','Plano de manutenção','Tipo de ordem'],
 items:['Ordem','Texto code causa','Texto code parte objeto','Texto de code para problema'],
 actions:['Ordem','Texto do código da medida'],
 stoppageNotes:['Ordem','Data da nota','TAG Planta','Parada'],
 workLogs:['Ordem','Operação','ID SAP','Trabalho real']
};
const optionalSchemas={
 stoppageNotes:['Início da avaria','Início da avaria (hora)','Fim da avaria','Fim da avaria (hora)','Criado às','Tipo de nota'],
 orders:['Início real hr.','Hora de referência']
};
function headerKey(value){return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const canonicalHeaders=new Map(Object.values(schemas).flat().concat(Object.values(optionalSchemas).flat()).map(h=>[headerKey(h),h]));
const headerAliases=new Map([
 ['numero da ordem','Ordem'],['numero ordem','Ordem'],['n ordem','Ordem'],['no ordem','Ordem'],
 ['flag parada','Parada'],['indicador parada','Parada'],['parada?','Parada'],
 ['data nota','Data da nota'],['data da ocorrencia','Data da nota'],
 ['criado as','Criado às'],['hora de criacao','Criado às'],['hora de criação','Criado às'],
 ['inicio real hora','Início real hr.'],['hora inicio real','Início real hr.'],
 ['hora referencia','Hora de referência']
].map(([alias,canonical])=>[headerKey(alias),canonical]));
function canonicalHeader(value){const key=headerKey(value);return canonicalHeaders.get(key)||headerAliases.get(key)||text(value);}
function kind(headers){
 const keys=new Set(headers.map(value=>headerKey(canonicalHeader(value))));
 return Object.keys(schemas).find(k=>{
  const required=k==='stoppageNotes'?['Ordem','Parada']:schemas[k];
  return required.every(h=>keys.has(headerKey(h)));
 });
}
function normalize(tables,files){
 for(const k of Object.keys(schemas)){if(k==='workLogs')continue;if(!Array.isArray(tables[k])||(k!=='stoppageNotes'&&!tables[k].length))throw Error('Planilha ausente ou vazia: '+k);}
 const coord=(v,min,max)=>{let n=Number(text(v).replace(',','.'));if(!text(v)||!Number.isFinite(n)||n<min||n>max)throw Error('Latitude ou longitude inválida: '+text(v));return n;};
 const systems=dedupe(tables.systems.map(r=>({tag:text(r.COD_INFORMACAO),name:text(r.NOME),type:text(r.COD_ELEMENTO),lat:coord(r.COD_LATITUDE,-90,90),lng:coord(r.COD_LONGITUDE,-180,180),status:text(r.SITUACAO_OPERACIONAL),critical:text(r.CRITICIDADE),address:text(r.ENDERECO_LOGRADOURO),district:text(r.ENDERECO_BAIRRO),photo:text(r.FOTO_FACHADA)})),'tag');
 const optionalDate=v=>text(v)?date(v):'';const optionalTime=v=>{const raw=text(v);if(!raw)return '';if(raw==='0')return time(0);if(/^0[.,]\d+$/.test(raw))return time(Number(raw.replace(',','.')));return time(v);};const tags=new Set(systems.map(s=>s.tag)),all=dedupe(tables.orders.map(r=>({id:text(r.Ordem),note:text(r.Nota),tag:text(r['TAG Planta']),center:upper(r.Centro),date:date(r['Data de referência']),referenceTime:optionalTime(r['Hora de referência']),start:date(r['Dta.início real']),startTime:optionalTime(r['Início real hr.']),created:date(r['Data de entrada']),due:date(r['Prazo programado']),finished:date(r['Conclusão real']),type:text(r['Tipo de ordem']),text:text(r['Texto breve']),status:text(r['Status do sistema']),equipment:text(r['Denominação do objeto técnico']),asset:text(r['TAG Ativo']),plan:text(r['Plano de manutenção']),priority:text(r['Texto prioridade']),activity:text(r['Tipo atividad.manut.']),workCenter:text(r['CenTrabalho princ.']),stopConfirmed:['SIM','S','YES','TRUE','1','CONFIRMADA','CONFIRMADO'].includes(upper(r['Parada confirmada']||r['Parada confirmada?'])),stopStart:optionalDate(r['Início da parada']||r['Inicio da parada']),stopEnd:optionalDate(r['Fim da parada']||r['Final da parada']),stopReason:text(r['Motivo da parada']||r['Motivo parada']),stopImpact:text(r['Impacto operacional']||r['Impacto da parada'])})),'id');
 const orders=all.filter(o=>o.center==='PITE'&&tags.has(o.tag)),ids=new Set(orders.map(o=>o.id));if(!orders.length)throw Error('Nenhuma ordem de Águas de Teresina corresponde às instalações informadas.');
 const items=tables.items.map(r=>({order:text(r.Ordem),note:text(r.Nota),cause:text(r['Texto code causa']),problem:text(r['Texto de code para problema']),component:text(r['Texto code parte objeto']),item:text(r.Item)})).filter(r=>ids.has(r.order));
 const actions=tables.actions.map(r=>({order:text(r.Ordem),note:text(r.Nota),action:text(r['Texto do código da medida']),item:text(r.Medida)})).filter(r=>ids.has(r.order));
 const systemsByTag=new Map(systems.map(s=>[s.tag,s])),ordersById=new Map(orders.map(o=>[o.id,o]));
 let excludedStoppageNotes=0,missingStoppageNoteDate=0;
 const stoppageNotes=[];
 for(const r of tables.stoppageNotes){
  if(upper(r.Parada)!=='X')continue;
  const order=text(r.Ordem),linkedOrder=ordersById.get(order),providedTag=text(r['TAG Planta']),tag=linkedOrder?.tag||'';
  const noteDate=optionalDate(r['Data da nota']);
  if(!order||!linkedOrder||!tag||!systemsByTag.has(tag)||(providedTag&&providedTag!==tag)){excludedStoppageNotes++;continue;}
  if(!noteDate)missingStoppageNoteDate++;
  stoppageNotes.push({
   order,date:noteDate,createdTime:optionalTime(r['Criado às']),noteType:upper(r['Tipo de nota']),note:text(r.Nota),description:text(r['Descrição']),
   asset:text(r['TAG Ativo']),priority:text(r['Texto prioridade']),
   tag,plant:text(r['DSC Planta'])||systemsByTag.get(tag).name,flag:'X',
   startDate:optionalDate(r['Início da avaria']),startTime:time(r['Início da avaria (hora)']),
   endDate:optionalDate(r['Fim da avaria']),endTime:time(r['Fim da avaria (hora)'])
  });
 }
 const workLogs=(tables.workLogs||[]).map(r=>{
  const raw=r['Trabalho real'],work=typeof raw==='number'?raw:Number(text(raw).replace(',','.'));
  return {order:text(r.Ordem),operation:text(r['Operação']).padStart(4,'0'),worker:text(r['ID SAP']),hours:text(raw)===''?null:(Number.isFinite(work)&&work>=0?work:null)};
 }).filter(r=>ids.has(r.order));
 const normalized={systems,orders,items,actions,stoppageNotes,workLogs,meta:{loadedAt:new Date().toISOString(),files,sourceOrders:all.length,excluded:all.length-orders.length,missingReference:orders.filter(o=>!o.date).length,stoppageOrders:new Set(stoppageNotes.map(n=>n.order)).size,workLogs:workLogs.length,workLogOrders:new Set(workLogs.map(l=>l.order)).size,notesWithCreationTime:stoppageNotes.filter(n=>n.createdTime).length,excludedStoppageNotes,missingStoppageNoteDate}};
 normalized.meta.icm=icmAudit(normalized,orders);
 const events=maintenanceEvents(normalized,{});
 normalized.meta.maintenance={eligible:events.length,attribution:events.filter(e=>e.attributionHours!==null).length,repair:events.filter(e=>e.mttrHours!==null).length,
  travel:events.filter(e=>e.travelHours!==null).length,execution:events.filter(e=>e.executionHours!==null).length,
  attendance:events.filter(e=>e.attendanceHours!==null).length};
 return normalized;
}
const api={text,upper,status,labels,typeLabels,typeLabel,typeGroup,orderClass,validDate,daysBetween,date,time,period,filter,stats,adherence,rank,timing,byType,topAssets,badActors,icmScope,icmUseful,icmRank,icmAudit,icmMatrix,engineeringMetrics,decisionInsights,stopRecords,flaggedStopOrders,maintenanceEvents,reliabilityByPlant,reliabilityByAsset,systemHealth,dedupe,schemas,optionalSchemas,headerKey,canonicalHeader,kind,normalize};
if(typeof module!=='undefined')module.exports=api;root.PCM=api;
})(typeof globalThis!=='undefined'?globalThis:this);
