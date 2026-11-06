(() => {
'use strict';
const shell=document.getElementById('shell');
if(!shell || document.getElementById('pcm-neural-layer')) return;
const root=document.createElement('div');root.id='pcm-neural-layer';
root.innerHTML='<button type="button" id="pcm-neural-orb" title="Arraste para um dado ou clique para selecionar" aria-label="PCM Neural: arraste sobre um indicador">✦<span>IA</span></button><section id="pcm-neural-panel" role="dialog" aria-labelledby="pcm-neural-title" hidden><header class="pcm-neural-head"><b>✦</b><div><strong id="pcm-neural-title">PCM Neural</strong><small>Explicação contextual</small></div><button type="button" id="pcm-neural-close" aria-label="Fechar">×</button></header><div class="pcm-neural-body"><h3 id="pcm-neural-subject"></h3><strong id="pcm-neural-value"></strong><p id="pcm-neural-explanation"></p><p id="pcm-neural-next"></p><small>Explicação preliminar baseada nas regras do painel. O modelo treinado no Colab ainda não está conectado. Nenhum dado SAP ou ICM é alterado.</small></div></section>';
shell.appendChild(root);
const orb=root.querySelector('#pcm-neural-orb'),panel=root.querySelector('#pcm-neural-panel'), close=root.querySelector('#pcm-neural-close');
const TARGETS='#kpis .kpi,#icmSummary .kpi,#deadlineCards .kpi,#engKpis .kpi,#maintenanceOverview .maintenance-step,#icmCards .icm-card,[data-view] .table-wrap tbody tr,.plant-summary>div';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const short=(s,n=120)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,n);
const usable=el=>!!(el&&el.getClientRects().length&&!el.closest('[hidden]'));
let drag=null,selecting=false,marked=null;
function mark(t){if(marked)marked.classList.remove('pcm-neural-target');marked=t;if(t)t.classList.add('pcm-neural-target');}
function at(x,y){orb.style.pointerEvents='none';const el=document.elementFromPoint(x,y);orb.style.pointerEvents='';const t=el?.closest(TARGETS);return usable(t)?t:null;}
function explain(t){
 const txt=short(t.textContent,400);
 const section=t.closest('section');
 const hint=norm(txt+' '+(section?.querySelector('h2')?.textContent||''));
 const cells=t.matches('tr')?[...t.querySelectorAll('td,th')].map(x=>short(x.textContent,85)):[];
 let name=cells.length?cells[0]:short(t.querySelector('span,small,th,td')?.textContent||txt,100);
 let val=cells.length?cells.slice(1,4).join(' · '):short(t.querySelector('strong,b')?.textContent||'',95);
 let meaning='O número depende dos dados importados e dos filtros aplicados. Isoladamente, ele não demonstra causa de falha nem conclusão de serviço.';
 let next='Confronte a ordem, TAG, texto breve, QUEST, ICM e datas antes de concluir que o dado está incorreto.';
 if(/mttr|reparo/.test(hint)){meaning='MTTR ativo: média dos intervalos efetivos de reparo em CE/CP elegíveis, sem contar a operação 0010 de deslocamento nem sobrepor períodos simultâneos. Não é o tempo total de indisponibilidade da planta.';next='Se o valor estiver nulo ou fora do esperado, revise os horários de apontamento, a elegibilidade das ordens e a cobertura de registros.';}
 else if(/mtbf/.test(hint)){meaning='MTBF: indicador do intervalo entre falhas elegíveis de um ativo. O resultado depende da TAG e de eventos suficientes no período.';next='Confira se há histórico suficiente da TAG e se as ordens representam ocorrências de falha distintas.';}
 else if(/aderencia|preventiv|plano/.test(hint)){meaning='Aderência ao plano compara as ordens planejadas com as executadas segundo datas de referência, status SAP e filtros do painel. Não comprova qualidade técnica.';next='Revise pendências, status e datas de referência das ordens previstas.';}
 else if(/icm|causa|medida|item|componente|falha/.test(hint)){meaning='ICM contém itens, causas e medidas cadastrados no SAP. Causa registrada não equivale necessariamente a causa raiz comprovada pelo técnico no QUEST.';next='Audite a mesma OS no QUEST e no ICM; a verificação automática completa depende de importar os dossiês produzidos no Colab.';}
 else if(/deslocamento/.test(hint)){meaning='Deslocamento usa os apontamentos técnicos previstos na regra do indicador. Não representa tempo líquido de reparo.';next='Confirme operação 0010 e a qualidade dos registros de horário.';}
 else if(/execucao|execução/.test(hint)){meaning='Execução refere-se ao trabalho reportado nas operações; difere de MTTR ativo quando profissionais possuem intervalos simultâneos.';next='Compare horas e sobreposições dos apontamentos na OS.';}
 else if(/atendimento/.test(hint)){meaning='Atendimento é a composição de tempo apresentada pelo painel; não deve ser confundido com indisponibilidade do equipamento.';next='Verifique deslocamento, execução e a base de ordens consideradas.';}
 else if(/substitui|troca|trocad/.test(hint)){meaning='Uma troca citada em texto pode estar executada, apenas prevista ou negada. Uma OS não é necessariamente uma troca física única.';next='Verifique verbos de execução, objeto substituído e eventuais OS duplicadas.';}
 else if(/ordens|executadas|prazo|abertas/.test(hint)){meaning='Este valor é derivado dos status e das datas SAP conforme os filtros. Uma OS encerrada não demonstra, por si, que a planta voltou a operar.';next='Confronte status, datas e relato do técnico.';}
 root.querySelector('#pcm-neural-subject').textContent=name||'Indicador selecionado';
 const value=root.querySelector('#pcm-neural-value');value.textContent=val;value.hidden=!val;
 root.querySelector('#pcm-neural-explanation').textContent=meaning;
 root.querySelector('#pcm-neural-next').textContent='Verificação sugerida: '+next;
 panel.hidden=false;orb.setAttribute('aria-expanded','true');selecting=false;orb.classList.remove('pcm-neural-selecting');mark(null);
}
orb.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;const r=orb.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};orb.setPointerCapture(e.pointerId);e.preventDefault();});
orb.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<8)return;drag.moved=true;orb.classList.add('pcm-neural-dragging');selecting=false;orb.classList.remove('pcm-neural-selecting');orb.style.left=Math.max(8,Math.min(innerWidth-orb.offsetWidth-8,drag.left+dx))+'px';orb.style.top=Math.max(8,Math.min(innerHeight-orb.offsetHeight-8,drag.top+dy))+'px';orb.style.right='auto';orb.style.bottom='auto';mark(at(e.clientX,e.clientY));});
orb.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const moved=drag.moved;drag=null;orb.classList.remove('pcm-neural-dragging');if(moved){const t=at(e.clientX,e.clientY);t?explain(t):mark(null);}else{selecting=!selecting;orb.classList.toggle('pcm-neural-selecting',selecting);if(selecting)panel.hidden=true;}});
orb.addEventListener('pointercancel',()=>{drag=null;mark(null);orb.classList.remove('pcm-neural-dragging');});
orb.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selecting=!selecting;orb.classList.toggle('pcm-neural-selecting',selecting);}else if(e.key==='Escape'){selecting=false;panel.hidden=true;orb.classList.remove('pcm-neural-selecting');}});
shell.addEventListener('click',e=>{if(!selecting||root.contains(e.target))return;const t=e.target.closest(TARGETS);if(!usable(t))return;e.preventDefault();e.stopPropagation();explain(t);},true);
close.addEventListener('click',()=>{panel.hidden=true;orb.setAttribute('aria-expanded','false');orb.focus();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){panel.hidden=true;orb.focus();}});
})();