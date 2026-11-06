(function(root){
'use strict';
const P=root.PCM || (typeof module!=='undefined'?require('./core.js'):null);
const BASE=root.PCM_NEURAL_ENGINE || (typeof module!=='undefined'?require('./pcm-neural-knowledge.js'):null);
const text=value=>String(value==null?'':value).trim();
const norm=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const format=n=>Number(n||0).toLocaleString('pt-BR');
const one=(n,singular,plural)=>format(n)+' '+(n===1?singular:plural);
const sample=(s,length=200)=>text(s).replace(/\s+/g,' ').slice(0,length);
const ordNum=q=>{
 const match=text(q).match(/\b(?:os|o\.s\.?|ordem)\s*(?:n[º°o]?\s*)?[:#-]?\s*(\d{6,12})\b/i)
 ||text(q).match(/\b([789]\d{8})\b/);
 return match?match[1]:'';
};
const top=(arr,max=5)=>arr.slice(0,max);
const keyOrder=(ctx,id)=>ctx.data.orders.find(o=>o.id===id);
const byOrder=(rows,id)=>rows.filter(r=>r.order===id);
const make=(ctx,title,body,facts=[],caveat='',source='SAP, base do painel',followups=[])=>({
 title,body,facts,source:source+' · Revisão '+(ctx.revision||'não informada'),caveat,followups,
 engine:'prototype'
});
function createSession(){
 const memo={lastOrder:'',lastAsset:'',lastPlant:'',revision:null,userId:null,previousTopic:''};
 function clear(){
  memo.lastOrder='';memo.lastAsset='';memo.lastPlant='';memo.revision=null;memo.userId=null;memo.previousTopic='';
 }
 function setOrder(o){
  memo.lastOrder=o.id;
  if(o.asset)memo.lastAsset=o.asset;
  if(o.tag)memo.lastPlant=o.tag;
 }
 function contextStatus(){return {...memo};}
 function orderReply(ctx,order,question){
  setOrder(order);
  const d=ctx.data,q=norm(question);
  const items=byOrder(d.items||[],order.id),acts=byOrder(d.actions||[],order.id);
  const notes=(d.stoppageNotes||[]).filter(n=>n.order===order.id);
  const s=d.systems?.find(p=>p.tag===order.tag);
  const itemFacts=top(items,4).map((row,i)=>({
   label:'ICM item '+(i+1),
   value:[row.component?'Componente: '+row.component:'',row.problem?'Problema: '+row.problem:'',row.cause?'Causa registrada: '+row.cause:''].filter(Boolean).join(' · ')||'Registro sem classificação útil'
  }));
  const actionFacts=top(acts,5).map((row,i)=>({
   label:'Medida cadastrada '+(i+1),
   value:row.action||'Sem texto da medida'
  }));
  const orderFacts=[
   {label:'Situação SAP',value:P.labels[P.status(order)]||order.status||'Sem status'},
   {label:'Tipo',value:P.typeLabel(order.type)},
   {label:'Unidade / TAG',value:(s?.name||order.tag||'Não informada')+' · '+(order.tag||'—')},
   {label:'Ativo',value:order.asset||'Não informado'},
   {label:'Texto breve',value:order.text||'Não informado'}
  ];
  const refs=[{label:'Ver outras ordens do ativo',question:'Quais são as outras ordens desse ativo?'},{label:'Ver causas cadastradas',question:'Qual causa consta nessa OS?'},{label:'Ver medidas',question:'O que foi registrado como medida nessa OS?'}];
  const source='Ordens SAP, ICM: OS '+order.id;
  if(/causa|icm|diagnostic|problem|falha|coeren|condiz|corret[ao]/.test(q)){
   memo.previousTopic='icm';
   const conflict=/condiz|coeren|quest|tecnic|divergen|certo|correto|errad|falha real|realmente/.test(q);
   return make(ctx,'ICM da OS '+order.id,
     conflict
       ?'Localizei o diagnóstico cadastrado, mas não tenho o relato QUEST completo nesta base. Assim, não posso confirmar que a causa corresponda ao que o técnico observou.'
       :items.length?'Esta é a classificação de item, problema e causa registrada na ordem. A causa cadastrada não equivale necessariamente a causa raiz confirmada.':'Não encontrei classificação de item/causa para essa OS na base carregada.',
     itemFacts.length?itemFacts:[{label:'ICM',value:'Item e causa não encontrados na exportação'}],
     'A coerência ICM × QUEST exige o relato original associado à mesma OS. Não inferi causas a partir da descrição breve.',source,refs);
  }
  if(/medid|fez|feito|execut|interven|servic|soluc|resolv|repar/.test(q)){
   memo.previousTopic='medidas';
   return make(ctx,'Intervenções cadastradas · OS '+order.id,
     acts.length?'Encontrei '+one(acts.length,'registro de medida','registros de medida')+' no ICM da ordem. Essas classificações devem ser confrontadas com os apontamentos e o QUEST antes de comprovar a execução física.':'Não encontrei medidas ICM para essa OS na exportação.',
     actionFacts.length?actionFacts:[{label:'Medidas ICM',value:'Nenhuma medida localizada'}],
     'Ausência de medida não comprova ausência de serviço; pode refletir lacuna na exportação ou no cadastro.',source,refs);
  }
  if(/substitu|troc/.test(q)){
   memo.previousTopic='substituicao';
   return make(ctx,'Substituição na OS '+order.id,
    'Sem o QUEST completo e evidência de material/equipamento, não posso comprovar que houve substituição. O texto breve SAP sozinho não permite distinguir troca executada, prevista ou mudança administrativa.',
    [{label:'Texto breve SAP',value:order.text||'Não informado'},...top(actionFacts,3)],
    'Esta resposta não contabiliza substituição física confirmada.',source,refs);
  }
  if(/outr|anterior|histor|recorr|reincident|quantas|vezes|repetiu/.test(q)&&order.asset){
   return historyReply(ctx,order.asset,order.tag,q);
  }
  memo.previousTopic='ordem';
  return make(ctx,'Dossiê resumido · OS '+order.id,
   'Resumo da ordem disponível no painel. Encontrei '+one(items.length,'linha ICM de item/causa','linhas ICM de item/causa')+', '+one(acts.length,'medida cadastrada','medidas cadastradas')+' e '+one(notes.length,'nota de parada','notas de parada')+'.',
   orderFacts.concat([{label:'Itens / causas ICM',value:format(items.length)},{label:'Medidas ICM',value:format(acts.length)}]),
   'O painel não dispõe do QUEST completo. Status encerrado não comprova restabelecimento operacional.',source,refs);
 }
 function historyReply(ctx,asset,plant,q){
   const filter=ctx.filters||{};
   const orders=P.filter(ctx.data,filter).filter(o=>o.asset===asset&&(!plant||o.tag===plant));
   const correct=orders.filter(o=>['ZNTE','ZNTP','ZTRE'].includes(norm(o.type).toUpperCase()));
   const done=correct.filter(o=>P.status(o)==='done');
   const latest=[...correct].sort((a,b)=>(b.created||'').localeCompare(a.created||''));
   memo.lastAsset=asset;if(plant)memo.lastPlant=plant;memo.previousTopic='historico';
   const facts=[
     {label:'TAG do ativo',value:asset},
     {label:'Ordens no período',value:format(orders.length)},
     {label:'Corretivas/reativas',value:format(correct.length)},
     {label:'Corretivas/reativas executadas',value:format(done.length)},
     ...top(latest,4).map(o=>({label:'OS '+o.id+' · '+(o.created||'sem data'),value:sample(o.text,115)||'Sem texto breve'}))
   ];
   const isWhy=/por que|porque|motivo|causa|falha|recorr/.test(q);
   return make(ctx,'Histórico do ativo '+asset,
     isWhy
      ?'Localizei '+one(correct.length,'ordem corretiva/reativa','ordens corretivas/reativas')+' no recorte. Isso é um indício para investigação de recorrência, não prova de '+one(correct.length,'falha física','falhas físicas')+' distintas. As causas precisam ser verificadas por OS e evidência.'
      :'No recorte filtrado, existem '+one(orders.length,'ordem','ordens')+' vinculadas a esse ativo, incluindo '+one(correct.length,'corretiva/reativa','corretivas/reativas')+'. As últimas ordens aparecem abaixo.',
     facts,
     'Uma mesma falha pode gerar várias OS. Contagem de ordens não equivale a número de falhas ou substituições.',
     'Ordens SAP por TAG de ativo',
     [{label:'Causas registradas desse ativo',question:'Quais são as causas mais frequentes desse ativo?'},{label:'Ver uma OS específica',question:'Explique a OS '+(latest[0]?.id||memo.lastOrder)}]
   );
 }
 function entityReply(ctx,question,asset,plant){
   const q=norm(question),rows=P.filter(ctx.data,ctx.filters||{}).filter(o=>(!asset||o.asset===asset)&&(!plant||o.tag===plant));
   const isRanking=/mais (frequent|recorrent|registrad|comum)|ranking|top|principal/.test(q);
   if(/corretiv|emergencial|preventiv|preditiv/.test(q)&&/quantas|abert|executad|total|numero|situacao/.test(q)){
     const types=/emergencial/.test(q)?['ZNTE']:/corretiv/.test(q)?['ZNTE','ZNTP']:/preditiv/.test(q)?['ZTPD']:['ZTPF','ZTPC'];
     const local=rows.filter(o=>types.includes(norm(o.type).toUpperCase()));
     const stats=P.stats(local);
     const askedOpen=/abert|pendente/.test(q),askedDone=/executad|concluid/.test(q);
     const value=askedOpen?stats.open:askedDone?stats.done:stats.total;
     return make(ctx,'Manutenção da '+(asset||plant),
       'Na seleção do ativo ou instalação, foram encontradas '+one(value,'ordem','ordens')+' da modalidade consultada'+(askedOpen?' em aberto':askedDone?' executadas':'')+'.',
       [{label:'Tipos SAP',value:types.join(', ')},{label:'Total',value:format(stats.total)},{label:'Executadas',value:format(stats.done)},{label:'Em aberto',value:format(stats.open)}],
       'Os status refletem registros SAP, não conclusão operacional confirmada.','Ordens SAP filtradas por TAG e tipo',
       [{label:'Histórico de ordens',question:'Quais são as outras ordens desse ativo?'},{label:'Causas no ICM',question:'Quais causas aparecem nesse ativo?'}]);
   }
   if(/causa|medid|icm|component/.test(q)){
     const kind=/medid/.test(q)?'action':/component|item/.test(q)?'component':'cause';
     const ranking=P.icmRank(ctx.data,rows,kind);
     const label=kind==='action'?'medidas':kind==='component'?'componentes':'causas';
     return make(ctx,'ICM · '+label+' em '+(asset||plant||'seleção atual'),
      ranking.length?'Ranking baseado em ordens distintas com registros úteis de '+label+' no escopo selecionado.':'Não há registros úteis do ICM para esse escopo.',
      top(ranking,6).map((r,i)=>({label:(i+1)+'. '+r.name,value:format(r.count)+' OS'})),
      'Causa registrada é classificação SAP, não diagnóstico de causa raiz confirmado.',
      'Itens, causas e medidas ICM + ordens SAP',
      [{label:'Histórico do ativo',question:'Quais são as outras ordens desse ativo?'},{label:'Qualidade geral do ICM',question:'Como está a cobertura do ICM?'}]
     );
   }
   if(asset)return historyReply(ctx,asset,plant,q);
   const st=P.stats(rows);
   return make(ctx,'Instalação · '+(ctx.data.systems?.find(s=>s.tag===plant)?.name||plant),
     'Na instalação selecionada, o painel apresenta '+one(st.total,'ordem','ordens')+' no período, sendo '+format(st.done)+' executadas e '+format(st.open)+' em aberto.',
     [{label:'TAG da planta',value:plant},{label:'Ordens',value:format(st.total)},{label:'Executadas',value:format(st.done)},{label:'Em aberto',value:format(st.open)}],
     'Quantidade de ordens não é sinônimo de falhas confirmadas.','Ordens SAP por instalação',
     [{label:'Causas nesta instalação',question:'Quais as causas mais frequentes dessa instalação?'},{label:'Corretivas abertas',question:'Quantas corretivas estão abertas nessa instalação?'}]);
 }
 function findEntity(ctx,q){
   const normQ=norm(q);
   const asset=(ctx.data.orders||[]).find(o=>o.asset&&o.asset.length>5&&normQ.includes(norm(o.asset)))?.asset||'';
   const plant=(ctx.data.systems||[]).find(s=>(s.tag&&normQ.includes(norm(s.tag)))||(s.name&&s.name.length>8&&normQ.includes(norm(s.name))))?.tag||'';
   return {asset,plant};
 }
 function ask(ctx,question='',target=null){
  if(!ctx?.data||!P){clear();return BASE.answer(ctx,question,target);}
  if(memo.revision!==ctx.revision||memo.userId!==(ctx.userId||null)){clear();memo.revision=ctx.revision;memo.userId=ctx.userId||null;}
  const q=norm(question),targetText=target?[target.label,target.value].filter(Boolean).join(' '):'';
  const combined=text(question||targetText);
  const explicitOrder=ordNum(combined);
  const e=findEntity(ctx,combined);
  if(e.asset){memo.lastAsset=e.asset;memo.lastPlant=(ctx.data.orders||[]).find(o=>o.asset===e.asset)?.tag||memo.lastPlant;memo.lastOrder='';}
  if(e.plant){memo.lastPlant=e.plant;if(!e.asset)memo.lastAsset='';memo.lastOrder='';}
  if(explicitOrder){
   const order=keyOrder(ctx,explicitOrder);
   if(!order)return make(ctx,'OS '+explicitOrder+' não encontrada','Não encontrei essa ordem na exportação SAP atualmente autorizada.',[], 'Confira a cobertura da base e o número da ordem.','Ordens SAP');
   return orderReply(ctx,order,combined);
  }
  const references=/\b(essa|esse|nessa|nesse|nesta|neste|dessa|desse|daquela|daquele|naquela|naquele|nela|nele|dele|dela|mesma|mesmo|outra|outras|outros|anteriores|anterior)\b/.test(q)||/^e\b/.test(q);
  const saysOrder=/\bos\b|\bordem\b/.test(q);
  const asksHistory=/\b(outra|outras|outros|anterior|anteriores|historico|recorr|reincident|quantas vezes|voltou)\b/.test(q);
  const asksIcm=/\b(icm|causa|causas|medida|medidas|problema|falha|componente|diagnostico|condiz|coerente|quest)\b/.test(q);
  const asksRank=/ranking|top|mais frequent|mais recorr|mais comum|mais registrada/.test(q);
  const mentionsPlant=/\b(instalacao|planta|sistema|unidade)\b/.test(q);
  const mentionsAsset=/\b(ativo|equipamento|bomba|motor|cm[b]|tag do ativo)\b/.test(q);
  const mentionsOrder=/\b(os|ordem)\b/.test(q);
  if(!e.asset&&!e.plant&&references&&memo.lastOrder&&!mentionsPlant&&!mentionsAsset&&(!asksHistory||!memo.lastAsset)){
    const order=keyOrder(ctx,memo.lastOrder);
    if(order&&(asksIcm||/fez|feito|medida|substitu|troca|execut|servic|estado|situacao|status/.test(q)||saysOrder)){
      return orderReply(ctx,order,combined);
    }
  }
  if((e.asset||e.plant)||references&&(memo.lastAsset||memo.lastPlant)){
    const asset=e.asset||(references&&!mentionsPlant?memo.lastAsset:'');
    const plant=e.plant||(references?memo.lastPlant:'');
    if(asset||plant){
      if(e.asset||e.plant||asksHistory||asksIcm||/quantas|qual|como|por que|porque|ordens|abert|executad|preventiv|corretiv|sistema/.test(q))return entityReply(ctx,combined,asset,plant);
    }
  }
  if(asksRank&&!e.asset&&!e.plant&&!references){
    // Rankings globais continuam usando as medidas originais do painel.
    return BASE.answer(ctx,question,target);
  }
  if(/corretiv|emergencial|preventiv|preditiv/.test(q)&&/quantas|abert|executad|total|numero|situacao/.test(q)){
    const rows=P.filter(ctx.data,ctx.filters||{});
    const types=/emergencial/.test(q)?['ZNTE']:/corretiv/.test(q)?['ZNTE','ZNTP']:/preditiv/.test(q)?['ZTPD']:['ZTPF','ZTPC'];
    const subset=rows.filter(o=>types.includes(norm(o.type).toUpperCase()));
    const stats=P.stats(subset);
    const wantsOpen=/abert|pendente/.test(q);
    const wantsDone=/executad|concluid/.test(q);
    const value=wantsOpen?stats.open:wantsDone?stats.done:stats.total;
    return make(ctx,'Ordens por modalidade de manutenção',
      'Encontrei '+one(value,'ordem','ordens')+' na modalidade solicitada'+(wantsOpen?' com status em aberto':wantsDone?' com status executada':'')+'.',
      [{label:'Modalidades SAP',value:types.join(', ')},{label:'Total na modalidade',value:format(stats.total)},{label:'Executadas',value:format(stats.done)},{label:'Em aberto',value:format(stats.open)}],
      'Status SAP não comprova conclusão física. A leitura usa os filtros de entrada do painel.',
      'Ordens SAP por tipo e status',
      [{label:'Ver ICM',question:'Como está a cobertura do ICM?'},{label:'Ver causas mais registradas',question:'Quais causas são mais frequentes no ICM?'}]
    );
  }
  const base=BASE.answer(ctx,question,target);
  return {...base,engine:'prototype',followups:base.title.startsWith('MTTR')?[
    {label:'Entender os registros válidos',question:'Qual é o MTTR ativo no período?'},
    {label:'Comparar MTBF',question:'Qual é o MTBF ativo?'}
  ]:base.title.includes('ICM')?[
    {label:'Causas mais frequentes',question:'Quais as causas mais frequentes no ICM?'},
    {label:'Medidas mais registradas',question:'Quais as medidas mais registradas no ICM?'}
  ]:[
    {label:'Auditar ICM',question:'Há dados incompletos no ICM?'},
    {label:'Ordens corretivas abertas',question:'Quantas corretivas estão abertas?'}
  ]};
 }
 return {ask,clear,contextStatus};
}
const api={createSession,ordNum};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_PROTOTYPE=api;
})(typeof globalThis!=='undefined'?globalThis:this);
