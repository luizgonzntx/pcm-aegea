(function(root){
'use strict';
const P=root.PCM || (typeof module!=='undefined' ? require('./core.js') : null);
const txt=v=>String(v==null?'':v).trim();
const fold=v=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const num=n=>Number(n||0).toLocaleString('pt-BR');
const pct=n=>n==null?'indisponível':(100*n).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const hours=h=>h==null||!Number.isFinite(h)?'sem dado válido':(Math.floor(h)+'h '+String(Math.round((h-Math.floor(h))*60)).padStart(2,'0')+'min');
const positive=v=>!!v&&String(v).trim().length;
function answer(ctx,question='',target=null){
 if(!ctx||!ctx.data||!P)return {title:'Base indisponível',body:'O painel ainda não carregou uma base autorizada. Entre na sua conta e aguarde a atualização.',facts:[],source:'Sem dados'};
 const data=ctx.data,f=ctx.filters||{},q=fold(question), rows=P.filter(data,f),stats=P.stats(rows);
 const scope='Período de entrada '+(f.from||'início')+' a '+(f.to||'fim')+'; filtros de instalação, ativo, tipo e prioridade do painel.';
 const source=(label)=>label+' · Base SAP do painel, revisão '+(ctx.revision||'não informada')+'. '+scope;
 const result=(title,body,facts=[],label='Ordens SAP',caveat='')=>({title,body,facts,source:source(label),caveat});
 const seen=(arr,k)=>new Set(arr.map(x=>x[k]).filter(positive)).size;
 const findId=txt(question).match(/(?:\b(?:os|o\.s\.|ordem)\s*[:#nº°-]*\s*)(\d{6,12})\b/i)||txt(question).match(/\b([789]\d{8})\b/);
 if(findId){
   const id=findId[1],o=(data.orders||[]).find(x=>x.id===id);
   if(!o)return result('Ordem não encontrada','Não localizei a OS '+id+' na base disponível. Confira se a exportação inclui a ordem e se ela pertence ao escopo de Teresina.',[], 'Ordens SAP','A pesquisa por número de OS usa a base completa carregada, não apenas o filtro de período.');
   const sys=(data.systems||[]).find(x=>x.tag===o.tag);
   const item=(data.items||[]).filter(x=>x.order===id),act=(data.actions||[]).filter(x=>x.order===id);
   const facts=[
     {label:'Status SAP',value:P.labels[P.status(o)]||P.status(o)},
     {label:'Tipo de ordem',value:P.typeLabel(o.type)},
     {label:'Instalação',value:(sys?.name||o.tag||'Sem TAG')+' · '+(o.tag||'')},
     {label:'Ativo',value:o.asset||'Não cadastrado'},
     {label:'Texto breve',value:o.text||'Não informado'},
     {label:'ICM — itens',value:item.length?item.slice(0,3).map(x=>[x.component,x.problem,x.cause].filter(positive).join(' / ')).join(' | '):'Nenhum registro de item nesta exportação'},
     {label:'ICM — medidas',value:act.length?act.slice(0,3).map(x=>x.action||'Sem descrição').join(' | '):'Nenhuma medida cadastrada nesta exportação'}
   ];
   return result('Dossiê SAP · OS '+id,'Conciliei os campos disponíveis desta ordem. O QUEST não está publicado na base do site, portanto não posso confirmar uma substituição física, o diagnóstico do técnico nem validar a causa raiz.',facts,'Ordens SAP + Itens/Causas + Medidas','Causa registrada no ICM não equivale a causa comprovada. Os dados desta OS podem estar fora dos filtros de período.');
 }
 const wantsICM=/\bicm\b|\bcausa(s)?\b|\bmedida(s)?\b|componentes?|problemas? cadastrados|diagnostico/.test(q);
 const wantsMTTR=/mttr|tempo.*reparo|tempo de manutencao/.test(q);
 const wantsMTBF=/mtbf|tempo medio entre falhas/.test(q);
 const wantsSwap=/substitui|troca(s|r|das|dos|da)?\b|trocad/.test(q);
 const wantsPlan=/aderencia|preventiv|plano/.test(q);
 const wantsCoverage=/incomplet|inconsisten|divergen|auditor|falta(m|ndo)?|problema(s)? na base|dado incorreto/.test(q);
 const wantsPlant=/planta(s)?|instalac|sistema(s)?/.test(q);
 const wantsRanking=/mais |ranking|top |frequen|recorr|principal/.test(q);
 const wantsStatus=/ordens|executad|abert|pendente|nao executad|concluid/.test(q);
 if(wantsSwap){
   const re=/\b(substitui\w*|troc\w*)\b/i;
   const mentions=rows.filter(o=>re.test(fold(o.text)));
   return result('Substituições · evidência disponível',
      'Encontrei '+num(mentions.length)+' ordens com termos de troca ou substituição no TEXTO BREVE. Isso é apenas menção textual, não contagem de substituições realizadas. Uma única troca pode aparecer em múltiplas ordens; outra pode não estar descrita no título.',
      [{label:'Ordens com menção no texto breve',value:num(mentions.length)},{label:'Ordens analisadas',value:num(rows.length)},{label:'Execução física comprovada',value:'Indeterminada sem QUEST'}],
      'Ordens SAP — texto breve',
      'Para contar substituições efetivas e comparar com ICM, precisamos importar o QUEST consolidado e validar as evidências por intervenção.');
 }
 if(wantsMTTR||wantsMTBF){
   const d=P.maintenanceDashboard(data,{...f,type:[],priority:[]});
   const key=wantsMTTR?'mttrHours':'mtbfHours';
   const val=d?.total?.[key],count=d?.total?.[key+'Count']||0;
   if(wantsMTTR)return result('MTTR ativo · tempo de reparo',
     val==null?'O MTTR não possui intervalos técnicos válidos para o recorte selecionado. Isso não prova que os reparos tiveram duração zero.':'A média de reparo ativo nas ordens elegíveis é '+hours(val)+'. Exclui operação 0010 (deslocamento) e une sobreposições de trabalho simultâneo.',
     [{label:'MTTR ativo',value:hours(val)},{label:'Ordens com MTTR válido',value:num(count)},{label:'Ocorrências de manutenção elegíveis',value:num(d?.total?.events||0)}],
     'Notas de parada + Ordens + Apontamentos',
     'A apuração considera CE/CP encerradas e notas de parada qualificadas; o filtro de tipo/prioridade da visão geral não é aplicado a este indicador.');
   return result('MTBF · intervalo entre falhas',
     val==null?'Não foi possível estabelecer um intervalo entre falhas com registros suficientes.':'A média de intervalos entre falhas elegíveis é '+hours(val)+'. O indicador não mede sozinho a disponibilidade real do sistema.',
     [{label:'MTBF indicativo',value:hours(val)},{label:'Intervalos válidos',value:num(count)}],
     'Notas de parada + histórico das TAGs',
     'MTBF exige ao menos duas falhas comparáveis de um mesmo ativo; o recorte seleciona o evento posterior.');
 }
 if(wantsPlan){
   const a=P.adherence(data,f);
   return result('Aderência ao plano',
     a.total?'Foram executadas '+num(a.done)+' de '+num(a.total)+' ordens planejadas no recorte de referência ('+pct(a.rate)+').':'Não há ordens com plano na data de referência selecionada.',
     [{label:'Ordens no plano',value:num(a.total)},{label:'Executadas',value:num(a.done)},{label:'Aderência',value:pct(a.rate)},{label:'Início real dentro do período',value:num(a.within)}],
     'Ordens SAP + plano de manutenção',
     'Aderência usa DATA DE REFERÊNCIA do plano, não a data de entrada do painel. É uma regra distinta para formar a coorte.');
 }
 if(wantsICM){
   const a=P.icmAudit(data,rows);
   if(/causa|componente|medida|mais |ranking|top |recorr/.test(q)){
    const key=/medida/.test(q)?'action':/componente|item/.test(q)?'component':'cause';
    const list=P.icmRank(data,rows,key).slice(0,5);
    const title=key==='action'?'Medidas cadastradas mais frequentes':key==='component'?'Componentes mais recorrentes no ICM':'Causas registradas mais frequentes';
    return result(title,list.length?'Ranking de ordens distintas dentro do ICM, sem multiplicar ocorrências repetidas da mesma OS.':'Não há registros úteis de ICM no recorte.',
      list.map((x,i)=>({label:(i+1)+'. '+x.name,value:num(x.count)+' OS'})),
      'ICM + Ordens SAP',
      'São classificações cadastradas. Sem QUEST, não podemos confirmar diagnóstico nem vincular cada medida a cada item somente pelo número da OS.');
   }
   return result('Qualidade e cobertura do ICM',
     'Das '+num(a.eligible)+' corretivas CE/CP tecnicamente encerradas, '+num(a.complete)+' possuem item/problema/causa na mesma linha e alguma medida cadastrada. Isso mede cobertura dos campos, não concordância com o técnico.',
     [{label:'Elegíveis',value:num(a.eligible)},{label:'Diagnóstico completo',value:num(a.complete)+' ('+pct(a.coverage)+')'},{label:'Sem causa útil',value:num(a.missingCause)},{label:'Sem medida útil',value:num(a.missingMeasure)}],
     'ICM + Ordens SAP',
     'Uma causa cadastrada não comprova causa raiz. Sem o QUEST, não há validação semântica de ICM versus relato técnico.');
 }
 if(wantsCoverage){
   const a=P.icmAudit(data,rows);
   return result('Triagem de possíveis problemas de cadastro',
     'Não identifiquei erros confirmados automaticamente. Há lacunas de preenchimento do ICM que merecem revisão: '+num(a.missingCause)+' ordens elegíveis sem causa útil e '+num(a.missingMeasure)+' sem medida útil.',
     [{label:'Universo CE/CP encerradas',value:num(a.eligible)},{label:'Sem causa útil',value:num(a.missingCause)},{label:'Sem medida útil',value:num(a.missingMeasure)}],
     'ICM + Ordens SAP',
     'Campo ausente não é necessariamente erro do técnico. Uma auditoria da coerência causa × QUEST requer os relatos importados.');
 }
 if(wantsPlant && (wantsRanking||/quantas|por planta/.test(q))){
   const system=new Map((data.systems||[]).map(s=>[s.tag,s.name]));
   const counts=new Map;
   rows.forEach(o=>counts.set(o.tag,(counts.get(o.tag)||0)+1));
   const list=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);
   return result('Instalações com mais ordens',
     'Ranking pelo número de ordens SAP no período filtrado; não é necessariamente ranking de falhas ou de gravidade.',
     list.map(([tag,n],i)=>({label:(i+1)+'. '+(system.get(tag)||tag),value:num(n)+' OS · '+tag})),
     'Ordens SAP + Cadastro de instalações','Um mesmo ativo pode ter ordens preventivas, corretivas e serviços; use o filtro de tipo para restringir a análise.');
 }
 if(wantsStatus || /quantas|total|carteira/.test(q)){
   return result('Situação da carteira de ordens',
     'A base apresenta '+num(stats.total)+' ordens no recorte, das quais '+num(stats.done)+' estão executadas ('+pct(stats.total?stats.done/stats.total:null)+'). Este é o status SAP, não uma confirmação do funcionamento final do equipamento.',
     [{label:'Total',value:num(stats.total)},{label:'Executadas',value:num(stats.done)},{label:'Em aberto',value:num(stats.open)},{label:'Não executadas',value:num(stats.notdone)},{label:'Encerradas administrativamente',value:num(stats.closed)}],
     'Ordens SAP',
     'O período utiliza a data de entrada, a menos que a métrica consultada tenha regra própria.');
 }
 if(target){
   const label=txt(target.label),val=txt(target.value),h=fold(label);
   if(/mttr|mtbf|aderencia|causa|medida|icm|ordens|execu|deslocamento|atendimento|plano/.test(h))return answer(ctx,label,null);
   return result('Dado selecionado · '+(label||'indicador'),
     'O painel apresenta '+(val||'este registro')+'. Não é possível concluir a causa operacional apenas por esse valor. Para uma verificação, compare o cadastro do ativo, a OS e as evidências técnicas.',
     val?[{label:'Valor observado',value:val}]:[],
     'Indicador ou tabela do painel',
     'Para validar uma OS específica, digite o número da ordem. Não existe leitura do QUEST completo nesta publicação.');
 }
 return result('O que posso investigar na sua base',
   'Não consigo responder esta pergunta com confiabilidade a partir dos campos disponíveis. Posso calcular ordens e indicadores, localizar uma OS ou resumir o ICM, sem inventar um diagnóstico.',
   [{label:'Experimente',value:'Quantas ordens foram executadas?'},{label:'Experimente',value:'Qual é a causa mais registrada no ICM?'},{label:'Experimente',value:'Explique a OS 900123456 (substitua pelo número real)'}],
   'Ajuda de navegação','As respostas atuais são cálculos e regras locais; ainda não são geradas pela rede treinada no Colab.');
}
const api={answer,fold};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_ENGINE=api;
})(typeof globalThis!=='undefined'?globalThis:this);
