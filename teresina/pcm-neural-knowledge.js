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
 const lookup=txt(question)||(target?[target.label,target.value].filter(positive).join(' '):'');
 const findId=lookup.match(/(?:\b(?:os|o\.s\.|ordem)\s*[:#nº°-]*\s*)(\d{6,12})\b/i)||lookup.match(/\b([789]\d{8})\b/);
 if(findId){
   const id=findId[1],o=(data.orders||[]).find(x=>x.id===id);
   const M=root.PCM_NEURAL_LOCAL;
   const neural=M?.status()?.connected?M.classifyOrder(id):null;
   if(!o&&!neural)return result('Ordem não encontrada','Não localizei a OS '+id+' na base carregada nem no pacote neural local.',[],'Ordens SAP e QUEST local','Confira a abrangência das exportações.');
   const sys=(data.systems||[]).find(x=>x.tag===(o?.tag||neural?.dossier?.tag));
   const item=(data.items||[]).filter(x=>x.order===id),act=(data.actions||[]).filter(x=>x.order===id);
   const facts=[
      {label:'Status SAP',value:o?(P.labels[P.status(o)]||P.status(o)):'Não está nesta exportação SAP'},
      {label:'Tipo de ordem',value:o?P.typeLabel(o.type):'Não informado'},
      {label:'Instalação',value:(sys?.name||o?.tag||neural?.dossier?.tag||'Sem TAG')+' · '+(o?.tag||neural?.dossier?.tag||'')},
      {label:'Ativo',value:o?.asset||neural?.dossier?.asset||'Não cadastrado'},
      {label:'Texto breve SAP',value:o?.text||neural?.dossier?.brief||'Não informado'},
      {label:'ICM — itens/causas',value:item.length?item.slice(0,3).map(x=>[x.component,x.problem,x.cause].filter(positive).join(' / ')).join(' | '):'Sem item cadastrado neste pacote'},
      {label:'ICM — medidas',value:act.length?act.slice(0,3).map(x=>x.action||'Sem descrição').join(' | '):'Sem medida cadastrada neste pacote'}
   ];
   if(neural){
     const d=neural.dossier,p=neural.classification;
     const quest=(d.quest||[]).slice(0,5).map(x=>x.texto).join(' | ').slice(0,1300);
     const folded=fold(quest);
     const risky=/\\b(?:precisa|necessario|necessaria|pendente|aguardando|sera|devera|nao foi possivel|nao foi realizada)\\b.{0,85}\\b(?:substitui|troc|instal)/i.test(folded)
       || /(?:o\\.?s\\.?|ordem).{0,35}(?:foi )?trocad/i.test(folded);
     const swapLabels={sem_evidencia:'Sem evidência suficiente',apenas_prevista:'Apenas prevista',potencial:'Substituição potencial',relatada:'Possível substituição relatada'};
     const stateLabels={nao_informado:'Situação não identificada',fora_de_operacao:'Fora de operação relatado',operacao_relatada:'Em operação relatado',relatos_mistos:'Relatos operacionais mistos'};
     facts.push({label:'QUEST — evidências originais',value:quest||'Sem texto informativo'});
     facts.push({label:'Modelo treinado no Colab — substituição',value:swapLabels[p.swap]||p.swap});
     facts.push({label:'Modelo treinado no Colab — situação',value:stateLabels[p.outcome]||p.outcome});
     if(risky)facts.push({label:'Possível erro de interpretação',value:'O texto pode indicar intenção de troca ou alteração administrativa de OS, não substituição física.'});
     return result('PCM Neural conectado · OS '+id,
       'A TextCNN treinada no Colab analisou os textos da ordem. Os resultados são classificações experimentais, e os trechos originais abaixo devem prevalecer sobre a hipótese da rede.',
       facts,'Rede neural V2 local + QUEST + SAP/ICM importado',
       (risky?'Alerta: a própria frase contraria uma troca executada. ':'')+'O treinamento usou rótulos automáticos; os escores do modelo não demonstram precisão técnica nem comprovam causa raiz.');
   }
   return result('Dossiê SAP · OS '+id,'Conciliei os campos disponíveis no SAP, mas o QUEST completo não está no site. Para usar a rede, carregue o pacote privado em Conectar modelo.',facts,'Ordens SAP + Itens/Causas + Medidas','Sem QUEST a execução física e a concordância do ICM não podem ser confirmadas.');
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
   const M=root.PCM_NEURAL_LOCAL;
   if(M?.status()?.connected){
     const observed=rows.map(o=>M.dossierFor(o.id)).filter(Boolean);
     const cnt={relatada:0,potencial:0,apenas_prevista:0,sem_evidencia:0};
     observed.forEach(d=>{if(Object.prototype.hasOwnProperty.call(cnt,d.r))cnt[d.r]++;});
     return result('Substituições · QUEST processado',
       'No recorte do painel, '+num(observed.length)+' ordens possuem relatos QUEST no pacote local. São indícios classificados pela auditoria V2, e não contagem comprovada de substituições físicas.',
       [{label:'Relatadas (a revisar)',value:num(cnt.relatada)},{label:'Potenciais',value:num(cnt.potencial)},{label:'Apenas previstas',value:num(cnt.apenas_prevista)},{label:'Sem evidência',value:num(cnt.sem_evidencia)}],
       'QUEST privado + Ordens SAP',
       'Rótulos experimentais: existem falsos positivos em trocas previstas/administrativas; cada evento deve ser revisado antes de alterar indicadores.');
   }
   const re=/\\b(substitui\\w*|troc\\w*)\\b/i;
   const mentions=rows.filter(o=>re.test(fold(o.text)));
   return result('Substituições · evidência disponível',
      'Encontrei '+num(mentions.length)+' ordens com termos de troca ou substituição apenas no TEXTO BREVE. Isso não prova execução física.',
      [{label:'OS com menção',value:num(mentions.length)},{label:'Ordens no recorte',value:num(rows.length)},{label:'Trocas físicas comprovadas',value:'Indeterminadas sem QUEST'}],
      'Ordens SAP — texto breve',
      'Carregue o modelo local com dossiês QUEST. A contagem de substituições físicas continua exigindo validação por evento.');
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
   if(/condiz|coerente|compativel|relato|quest|tecnico/.test(q)){
     return result('Conciliação ICM × QUEST ainda indisponível',
       'O painel tem os campos de ICM da base SAP, mas não contém o texto QUEST completo. Por isso não consigo dizer se a causa e a medida cadastradas condizem com o que o técnico efetivamente relatou.',
       [{label:'Corretivas CE/CP elegíveis',value:num(a.eligible)},{label:'Com diagnóstico ICM completo',value:num(a.complete)},{label:'Sem causa útil',value:num(a.missingCause)}],
       'ICM + Ordens SAP','Uma verificação real precisa cruzar os relatos QUEST por OS e operação com os itens, causas e medidas cadastrados.');
   }
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
   const label=txt(target.label),val=txt(target.value),h=fold(label),raw=fold(label+' '+val);
   const plant=(data.systems||[]).find(x=>(x.tag&&raw.includes(fold(x.tag)))||(x.name&&x.name.length>7&&raw.includes(fold(x.name))));
   if(plant){
     const local=rows.filter(o=>o.tag===plant.tag),t=P.stats(local);
     return result('Instalação · '+plant.name,
       'Neste recorte, a instalação possui '+num(t.total)+' ordens, '+num(t.done)+' executadas e '+num(t.open)+' em aberto. O volume não prova maior incidência de falhas sem segmentação pelo tipo de manutenção.',
       [{label:'TAG',value:plant.tag},{label:'Ordens',value:num(t.total)},{label:'Executadas',value:num(t.done)},{label:'Em aberto',value:num(t.open)}],
       'Cadastro das instalações + Ordens SAP','Para analisar causa de uma ocorrência, consulte a OS e compare o QUEST correspondente quando estiver disponível.');
   }
   const assetMatch=(label+' '+val).match(/\b(?:THE|API|TMN)-A-\d{3,6}\b/i);
   if(assetMatch){
     const tag=assetMatch[0].toUpperCase(),local=rows.filter(o=>o.asset===tag),t=P.stats(local);
     return result('Ativo · '+tag,
       'O cadastro apresenta '+num(t.total)+' ordens para esse ativo no período, com '+num(t.done)+' executadas. Falhas recorrentes exigem confirmar o histórico de eventos, e não apenas o número de ordens.',
       [{label:'TAG do ativo',value:tag},{label:'Ordens',value:num(t.total)},{label:'Executadas',value:num(t.done)}],
       'Ordens SAP — TAG do ativo','Confira se o equipamento foi substituído mantendo a TAG; isso pode afetar a interpretação da reincidência.');
   }
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
