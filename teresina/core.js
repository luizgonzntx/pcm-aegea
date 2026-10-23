(function(root){
'use strict';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
function status(o){const a=upper(o.status).split(/\s+/);return a.includes('NEXE')?'notdone':a.includes('ENTE')?'done':a.includes('ENCE')?'closed':a.some(v=>v==='ABER'||v==='LIB')?'open':'other';}
const labels={done:'Ordens executadas',notdone:'Não executadas',closed:'Encerradas administrativamente',open:'Em aberto',other:'Outras situações'};
const typeLabels={
 ZTPF:'ZTPF · Preventiva Sistemática',
 ZTPD:'ZTPD · Preditiva / Condição',
 ZTPC:'ZTPC · Preventiva Condicional',
 ZNTE:'ZNTE · Corretiva Emergencial',
 ZNTP:'ZNTP · Corretiva Programada',
 ZTCO:'ZTCO · Corretiva Operacional',
 ZNTS:'ZNTS · Serviços / Telemetria',
 ZTEN:'ZTEN · Engenharia / Calibração'
};
function typeLabel(code){const k=upper(code);return typeLabels[k]||(text(code)||'Não classificado');}
function orderClass(o){
 const t=upper(o.type);
 if(t==='ZTPF'||t==='ZTPC')return 'preventive';
 if(t==='ZTPD')return 'predictive';
 if(t==='ZNTE')return 'corrective_emergency';
 if(t==='ZNTP'||t==='ZTCO')return 'corrective_planned';
 if(t==='ZTEN')return 'engineering';
 if(t==='ZNTS')return 'service';
 return text(o.plan)?'preventive':'corrective_planned';
}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function daysBetween(a,b){if(!validDate(a||'')||!validDate(b||''))return null;return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);}
function date(v){if(!text(v))return '';if(typeof v==='number'){if(v<1||v>150000)throw Error('Data numérica inválida');return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);}let s=text(v).slice(0,10),m=s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(m)s=m[3]+'-'+m[2]+'-'+m[1];if(!validDate(s))throw Error('Data inválida: '+text(v));return s;}
function period(v,f){return validDate(v||'')&&(!f.from||v>=f.from)&&(!f.to||v<=f.to);}
function filter(data,f,cohort){const tags=new Set(data.systems.map(s=>s.tag));return data.orders.filter(o=>o.center==='PITE'&&tags.has(o.tag)&&(!f.tag||o.tag===f.tag)&&(!f.asset||o.asset===f.asset)&&(!f.type||o.type===f.type)&&(!f.priority||o.priority===f.priority)&&period(o[cohort?'date':(f.dateField||'date')],f));}
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
 return [...map.values()].map(b=>({...b,rate:b.total?b.done/b.total:null})).sort((a,b)=>b.total-a.total||a.type.localeCompare(b.type,'pt-BR'));
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
function icmMatrix(data,orders){
 const doneIds=new Set(orders.filter(o=>status(o)==='done').map(o=>o.id));
 const actionsByOrder=new Map;
 for(const a of (data.actions||[])){
  if(!doneIds.has(a.order))continue;
  const act=text(a.action);
  if(!act||upper(act)==='NÃO EXECUTAR'||upper(act)==='NAO EXECUTAR')continue;
  if(!actionsByOrder.has(a.order))actionsByOrder.set(a.order,new Set);
  actionsByOrder.get(a.order).add(act);
 }
 const map=new Map;
 for(const item of (data.items||[])){
  if(!doneIds.has(item.order))continue;
  const comp=text(item.component),prob=text(item.problem),cause=text(item.cause);
  if(upper(cause)==='FALHA INEXISTENTE'||upper(prob)==='FALHA INEXISTENTE')continue;
  if(!comp&&!prob&&!cause)continue;
  const acts=actionsByOrder.get(item.order);
  const actList=acts&&acts.size?[...acts]:['Sem medida registrada'];
  for(const act of actList){
   const key=[comp||'Não informado',prob||'Não informado',cause||'Não informada',act].join(' || ');
   if(!map.has(key))map.set(key,{component:comp||'Não informado',problem:prob||'Não informado',cause:cause||'Não informada',action:act,ids:new Set});
   map.get(key).ids.add(item.order);
  }
 }
 return [...map.values()].map(r=>({component:r.component,problem:r.problem,cause:r.cause,action:r.action,count:r.ids.size,ids:[...r.ids]})).sort((a,b)=>b.count-a.count||a.component.localeCompare(b.component,'pt-BR'));
}
function engineeringMetrics(data,rows,asOf){
 let preventive=0,predictive=0,correctiveEmerg=0,correctivePlan=0,service=0,engineering=0;
 let prioEmerg=0,prioUrg=0,leadSum=0,leadCount=0,emergLeadSum=0,emergLeadCount=0,agedOpen30d=0;
 const doneIds=new Set,correctiveDoneIds=new Set;
 for(const o of rows){
  const cls=orderClass(o),s=status(o),p=upper(o.priority);
  if(cls==='preventive')preventive++;
  else if(cls==='predictive')predictive++;
  else if(cls==='corrective_emergency')correctiveEmerg++;
  else if(cls==='corrective_planned')correctivePlan++;
  else if(cls==='service')service++;
  else if(cls==='engineering')engineering++;
  if(p.includes('EMERG'))prioEmerg++;
  else if(p.includes('URG'))prioUrg++;
  if(s==='done'){
   doneIds.add(o.id);
   if(cls==='corrective_emergency'||cls==='corrective_planned'||cls==='service')correctiveDoneIds.add(o.id);
   const lt=daysBetween(o.created,o.start);
   if(lt!=null&&lt>=0&&lt<=365){
    leadSum+=lt;leadCount++;
    if(cls==='corrective_emergency'){emergLeadSum+=lt;emergLeadCount++;}
   }
  }else if(s==='open'&&asOf){
   const refDate=o.created||o.date;
   const age=daysBetween(refDate,asOf);
   if(age!=null&&age>30)agedOpen30d++;
  }
 }
 const total=rows.length;
 const proactive=preventive+predictive+engineering;
 const reactive=correctiveEmerg+correctivePlan+service;
 const proactiveRate=total?proactive/total:null;
 const predictiveRate=total?predictive/total:null;
 const emergencyRate=total?prioEmerg/total:null;
 const itemsOrders=new Set,palliativeOrders=new Set,cavitationOrders=new Set,electricalOrders=new Set;
 for(const i of (data.items||[])){
  if(!doneIds.has(i.order))continue;
  const c=upper(i.cause),pr=upper(i.problem);
  if(c==='FALHA INEXISTENTE'||pr==='FALHA INEXISTENTE')continue;
  if(text(i.component)||text(i.cause)||text(i.problem))itemsOrders.add(i.order);
  if(c.includes('CAVITA')||c.includes('DETRITO')||pr.includes('VAZAMENTO')||pr.includes('BAIXA VAZ'))cavitationOrders.add(i.order);
  if(c.includes('TENSÃO')||c.includes('TENSAO')||c.includes('ASSIMETRIA')||c.includes('CURTO')||c.includes('SOBRECARGA')||c.includes('PROGRAMA')||c.includes('CONFIGURA'))electricalOrders.add(i.order);
 }
 const actionOrders=new Set;
 for(const a of (data.actions||[])){
  if(!doneIds.has(a.order))continue;
  const act=upper(a.action);
  if(!act||act==='NÃO EXECUTAR'||act==='NAO EXECUTAR')continue;
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
  total,preventive,predictive,engineering,correctiveEmerg,correctivePlan,service,proactive,reactive,
  proactiveRate,predictiveRate,emergencyRate,prioEmerg,prioUrg,
  avgLeadDays:leadCount?leadSum/leadCount:null,
  avgEmergLeadDays:emergLeadCount?emergLeadSum/emergLeadCount:null,
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
   body:'Das '+m.total.toLocaleString('pt-BR')+' ordens no recorte, '+m.proactive.toLocaleString('pt-BR')+' ('+pctVal+'%) são preventivas/preditivas/engenharia e '+m.reactive.toLocaleString('pt-BR')+' são corretivas ou serviços. O benchmark de classe mundial (SMRP) recomenda ≥ 80% de atuação proativa.',
   action:'Converter os modos de falha recorrentes das corretivas ZNTE em listas de tarefas preventivas (ZTPF) e inspeções preditivas (ZTPD).'
  });
 }
 if(m.palliativeCount>0){
  const pPct=m.palliativeRate?Math.round(m.palliativeRate*100):0;
  insights.push({
   severity:pPct>20?'critical':'warn',
   category:'CONFIABILIDADE ELÉTRICA & AUTOMAÇÃO',
   title:'Alerta de "Efeito Reset": '+m.palliativeCount.toLocaleString('pt-BR')+' intervenções paliativas ('+pPct+'% das medidas)',
   body:'Foram identificadas '+m.palliativeCount.toLocaleString('pt-BR')+' ordens encerradas com medidas paliativas (Reset / Rearme / Ajuste de parâmetros) e '+m.electricalCount.toLocaleString('pt-BR')+' ocorrências por distúrbios elétricos/automação (assimetria, subtensão, sobretensão, erro de configuração).',
   action:'Realizar termografia nos quadros de comando, aferir proteção de falta/assimetria de fase e investigar qualidade de energia junto à concessionária.',
   ids:m.palliativeIds
  });
 }
 if(m.cavitationCount>0){
  insights.push({
   severity:m.cavitationCount>=20?'critical':'warn',
   category:'INTEGRIDADE HIDRÁULICA E MECÂNICA',
   title:m.cavitationCount.toLocaleString('pt-BR')+' ordens com Cavitação, Detritos ou Perda Hidráulica',
   body:'Os apontamentos indicam desgaste prematuro de rotores, eixos e selos mecânicos associados a cavitação e entrada de detritos nas elevatórias/poços.',
   action:'Conferir pressão de sucção / NPSH disponível, revisar limpeza de grades e crivos e validar se o conjunto opera próximo ao BEP (ponto de melhor eficiência).',
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
   action:'Abrir Análise de Causa Raiz (RCA / 5 Porquês) para os Top 5 Bad Actors e bloquear encerramento sem laudo técnico.',
   ids:actors[0].ids
  });
 }
 if(m.icmCoverageRate!=null&&m.correctiveDoneTotal>0){
  const covPct=Math.round(m.icmCoverageRate*100);
  insights.push({
   severity:covPct>=80?'good':covPct>=50?'warn':'critical',
   category:'GOVERNANÇA DE DADOS PCM (SAP)',
   title:'Cobertura de Apontamento ICM nas Corretivas: '+covPct+'%',
   body:'De '+m.correctiveDoneTotal.toLocaleString('pt-BR')+' ordens corretivas/serviços executadas, '+m.corrWithIcm.toLocaleString('pt-BR')+' possuem Item, Causa e Medida completos nas planilhas de catálogo.',
   action:'Tornar obrigatório o preenchimento dos catálogos de Parte Objeto, Causa e Medida antes do encerramento técnico (ENTE) das ordens ZNTE e ZNTP.'
  });
 }
 if(adh.rate!=null){
  const adhPct=Math.round(adh.rate*100);
  insights.push({
   severity:adhPct>=85?'good':adhPct>=65?'warn':'critical',
   category:'DISCIPLINA DE EXECUÇÃO DO PLANO',
   title:'Aderência à Preventiva/Preditiva em '+adhPct+'% ('+m.agedOpen30d+' OS abertas > 30 dias)',
   body:'Foram cumpridas '+adh.done.toLocaleString('pt-BR')+' de '+adh.total.toLocaleString('pt-BR')+' ordens planejadas no período, restando '+m.agedOpen30d.toLocaleString('pt-BR')+' ordens abertas com mais de 30 dias de carteira.',
   action:'Priorizar na programação semanal dos centros ELT-001 e MEC-001 o nivelamento das instalações com aderência inferior a 85%.'
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
 actions:['Ordem','Texto do código da medida']
};
function kind(headers){return Object.keys(schemas).find(k=>schemas[k].every(h=>headers.includes(h)));}
function normalize(tables,files){
 for(const k of Object.keys(schemas))if(!Array.isArray(tables[k])||!tables[k].length)throw Error('Planilha ausente ou vazia: '+k);
 const coord=(v,min,max)=>{let n=Number(text(v).replace(',','.'));if(!text(v)||!Number.isFinite(n)||n<min||n>max)throw Error('Latitude ou longitude inválida: '+text(v));return n;};
 const systems=dedupe(tables.systems.map(r=>({tag:text(r.COD_INFORMACAO),name:text(r.NOME),type:text(r.COD_ELEMENTO),lat:coord(r.COD_LATITUDE,-90,90),lng:coord(r.COD_LONGITUDE,-180,180),status:text(r.SITUACAO_OPERACIONAL),critical:text(r.CRITICIDADE),address:text(r.ENDERECO_LOGRADOURO),district:text(r.ENDERECO_BAIRRO),photo:text(r.FOTO_FACHADA)})),'tag');
 const tags=new Set(systems.map(s=>s.tag)),all=dedupe(tables.orders.map(r=>({id:text(r.Ordem),note:text(r.Nota),tag:text(r['TAG Planta']),center:upper(r.Centro),date:date(r['Data de referência']),start:date(r['Dta.início real']),created:date(r['Data de entrada']),due:date(r['Prazo programado']),finished:date(r['Conclusão real']),type:text(r['Tipo de ordem']),text:text(r['Texto breve']),status:text(r['Status do sistema']),equipment:text(r['Denominação do objeto técnico']),asset:text(r['TAG Ativo']),plan:text(r['Plano de manutenção']),priority:text(r['Texto prioridade']),activity:text(r['Tipo atividad.manut.']),workCenter:text(r['CenTrabalho princ.'])})),'id');
 const orders=all.filter(o=>o.center==='PITE'&&tags.has(o.tag)),ids=new Set(orders.map(o=>o.id));if(!orders.length)throw Error('Nenhuma ordem de Águas de Teresina corresponde às instalações informadas.');
 const items=tables.items.map(r=>({order:text(r.Ordem),note:text(r.Nota),cause:text(r['Texto code causa']),problem:text(r['Texto de code para problema']),component:text(r['Texto code parte objeto']),item:text(r.Item)})).filter(r=>ids.has(r.order));
 const actions=tables.actions.map(r=>({order:text(r.Ordem),note:text(r.Nota),action:text(r['Texto do código da medida']),item:text(r.Medida)})).filter(r=>ids.has(r.order));
 return {systems,orders,items,actions,meta:{loadedAt:new Date().toISOString(),files,sourceOrders:all.length,excluded:all.length-orders.length,missingReference:orders.filter(o=>!o.date).length}};
}
const api={text,upper,status,labels,typeLabels,typeLabel,orderClass,validDate,daysBetween,date,period,filter,stats,adherence,rank,timing,byType,topAssets,badActors,icmMatrix,engineeringMetrics,decisionInsights,systemHealth,dedupe,schemas,kind,normalize};
if(typeof module!=='undefined')module.exports=api;root.PCM=api;
})(typeof globalThis!=='undefined'?globalThis:this);

