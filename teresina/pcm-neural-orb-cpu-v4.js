(() => {
  'use strict';
  const shell = document.getElementById('shell');
  if (!shell || document.getElementById('pcm-neural-layer')) return;
  const root = document.createElement('div');
  root.id = 'pcm-neural-layer';
  root.innerHTML = `
    <button type="button" id="pcm-neural-orb" aria-controls="pcm-neural-panel" aria-expanded="false" aria-label="Abrir Manix, inteligência de manutenção" title="Converse com a Manix ou arraste sobre um indicador">
      <span class="pcm-orb-mark queen-orb-bot manix-orb-mark" aria-hidden="true"><b>M</b><i></i></span>
      <span class="pcm-orb-caption">MANIX</span>
    </button>
    <section id="pcm-neural-panel" role="dialog" aria-modal="false" aria-labelledby="pcm-neural-title" hidden>
      <header class="pcm-neural-head">
        <div class="pcm-neural-avatar queen-avatar manix-avatar" aria-hidden="true"><b>M</b><i></i></div>
        <div class="pcm-neural-heading">
          <span class="pcm-neural-eyebrow">MANIX · INTELIGÊNCIA DE MANUTENÇÃO</span>
          <strong id="pcm-neural-title">Converse com a Manix</strong>
          <small id="pcm-neural-source-state">Pronta para conversar</small>
        </div>
        <button type="button" id="pcm-neural-clear" class="pcm-neural-icon-button" title="Nova investigação" aria-label="Limpar conversa e começar nova investigação">↺</button>
        <button type="button" id="pcm-neural-close" class="pcm-neural-icon-button" aria-label="Fechar painel">×</button>
      </header>
      <div class="pcm-neural-content">
        <div class="pcm-neural-welcome">
          <div class="manix-welcome-kicker"><span></span> ASSISTENTE TÉCNICA</div>
          <h3>O que vamos investigar?</h3>
          <p>Analise indicadores, identifique recorrências e estruture diagnósticos com base nos dados disponíveis no painel.</p>
        </div>
        <div id="pcm-neural-prompts" class="pcm-neural-prompts" aria-label="Perguntas sugeridas">
          <button type="button" data-pcm-question="Quais ativos estão concentrando mais corretivas e o que devo investigar primeiro?"><span>▦</span><b>Ativos críticos</b><small>Prioridade e concentração</small></button>
          <button type="button" data-pcm-question="Quais sinais de recorrência aparecem nos dados e quais hipóteses devo verificar?"><span>↻</span><b>Falhas recorrentes</b><small>Padrões e hipóteses</small></button>
          <button type="button" data-pcm-question="Explique MTBF e MTTR juntos e o que eles dizem sobre a operação."><span>∿</span><b>Indicadores</b><small>MTBF, MTTR e desempenho</small></button>
          <button type="button" data-pcm-question="Analise os dados disponíveis e me diga qual investigação técnica tem maior prioridade."><span>◇</span><b>Diagnóstico técnico</b><small>Evidências e investigação</small></button>
        </div>
        <div id="pcm-neural-messages" class="pcm-neural-messages" role="log" aria-label="Histórico de perguntas e respostas" aria-live="polite"></div>
      </div>
      <div class="pcm-neural-bottom">
        <div class="pcm-neural-tools">
          <button type="button" id="pcm-neural-pick" class="pcm-neural-pick"><span aria-hidden="true">⌖</span> Analisar indicador da tela</button>
        </div>
        <form id="pcm-neural-form" autocomplete="off">
          <label class="pcm-neural-visually-hidden" for="pcm-neural-question">Escreva sua dúvida</label>
          <input id="pcm-neural-question" maxlength="500" placeholder="Ex.: Analise a OS 900123456" required>
          <button type="submit" id="pcm-neural-send" aria-label="Enviar pergunta" title="Enviar pergunta">↑</button>
        </form>

      </div>
    </section>`;
  shell.appendChild(root);
  const orb=root.querySelector('#pcm-neural-orb');
  const panel=root.querySelector('#pcm-neural-panel');
  const close=root.querySelector('#pcm-neural-close');
  const clear=root.querySelector('#pcm-neural-clear');
  const conversation=window.PCM_NEURAL_PROTOTYPE?.createSession?.()||null;
  const llm=window.PCM_NEURAL_CHAT?.createClient?.()||null;
  const history=[];
  let busy=false,requestGeneration=0,identityKey='';

  const form=root.querySelector('#pcm-neural-form');
  const input=root.querySelector('#pcm-neural-question');
  const messages=root.querySelector('#pcm-neural-messages');
  const prompts=root.querySelector('#pcm-neural-prompts');
  const pick=root.querySelector('#pcm-neural-pick');
  const connectV3=null;
  const state=root.querySelector('#pcm-neural-source-state');
  const TARGETS='#kpis .kpi,#icmSummary .kpi,#deadlineCards .kpi,#engKpis .kpi,#maintenanceOverview .maintenance-step,#icmCards .card,.table-wrap tbody tr,.plant-summary>div';
  let drag=null,selectMode=false,highlight=null;
  const short=(value,n=170)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,n);
  function conversationalText(text,question){
    let result=String(text||'').replace(/^\s*(?:Fonte|Origem dos dados|Sistema de origem):[^\n]*(?:\n|$)/gim,'').trim();
    // Preserva as siglas quando o usuário pede explicitamente seu significado.
    if(!/\b(SAP|ICM|QUEST)\b/i.test(question)){
      result=result
        .replace(/\bSAP\b/gi,'histórico de manutenção')
        .replace(/\bICM\b/gi,'registros técnicos')
        .replace(/\bQUEST\b/gi,'relatos da equipe');
    }
    return result;
  }
  function getContext(){
    try{return window.PCM_NEURAL_CONTEXT?.()||null;}catch(_){return null;}
  }
  function updateState(){
    const ctx=getContext(),local=llm?.status();
    const current=ctx?String(ctx.userId||'')+':'+String(ctx.revision||''):'';
    if(identityKey&&current!==identityKey){
      requestGeneration++;
      llm?.stop('Sessão ou dados atualizados');
      history.length=0;
      conversation?.clear();
      window.PCM_NEURAL_EDITS?.apply?.({action:'reset',value:''});
      messages.replaceChildren();
      busy=false;
      root.querySelector('#pcm-neural-send').disabled=false;
      prompts.classList.remove('pcm-neural-prompts-used');
      root.querySelector('.pcm-neural-welcome').hidden=false;
      identityKey=current;
    }
    state.textContent=!ctx?'Aguardando dados':
      local?.loading?'Preparando…':
      'Pronta';
  }
  function openPanel(focus=false){
    selectMode=false;
    orb.classList.remove('pcm-neural-selecting');
    panel.hidden=false;
    orb.setAttribute('aria-expanded','true');
    updateState();
    if(focus)input.focus();
  }
  function closePanel(){
    // Preserve o modelo já carregado quando fechar o painel:
    // recriar os pesos a cada abertura aumenta a latencia.
    panel.hidden=true;
    selectMode=false;
    orb.classList.remove('pcm-neural-selecting');
    orb.setAttribute('aria-expanded','false');
    mark(null);
  }
  function mark(target){
    if(highlight)highlight.classList.remove('pcm-neural-target');
    highlight=target;
    if(target)target.classList.add('pcm-neural-target');
  }
  function isVisible(el){return !!(el&&el.getClientRects().length&&!el.closest('[hidden]'));}
  function underPointer(x,y){
    orb.style.pointerEvents='none';
    const el=document.elementFromPoint(x,y);
    orb.style.pointerEvents='';
    const target=el?.closest(TARGETS);
    return isVisible(target)?target:null;
  }
  function targetData(el){
    if(el.matches('tr')){
      const cols=[...el.querySelectorAll('td,th')].map(c=>short(c.textContent,140));
      return {label:cols[0]||'Linha da tabela',value:cols.slice(1,5).join(' · ')};
    }
    return {label:short(el.querySelector('span,small,h2,h3')?.textContent||el.textContent,130),value:short(el.querySelector('strong,b')?.textContent||'',110)};
  }
  function make(tag,className,textValue){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(textValue!=null)el.textContent=textValue;
    return el;
  }
  function trimMessages(){
    while(messages.children.length>14)messages.firstElementChild.remove();
  }
  async function send(question,target){
    const q=short(question,500);
    if((!q&&!target)||busy)return;
    const ctx=getContext();
    if(!ctx){updateState();return;}
    const nextIdentity=String(ctx.userId||'')+':'+String(ctx.revision||'');
    if(identityKey&&identityKey!==nextIdentity){
      history.length=0;
      conversation?.clear();
      messages.replaceChildren();
      llm?.stop('Dados da sessão alterados');
    }
    identityKey=nextIdentity;
    const run=++requestGeneration;
    busy=true;
    root.querySelector('#pcm-neural-send').disabled=true;
    openPanel(false);
    prompts.classList.add('pcm-neural-prompts-used');
    root.querySelector('.pcm-neural-welcome').hidden=true;
    const subject=target?'Explique: '+(target.label||'dado selecionado')+(target.value?' · '+target.value:''):q;
    messages.appendChild(make('div','pcm-neural-user-message',subject));
    input.value='';
    const progress=make('div','pcm-neural-system-message','Manix está analisando…');
    messages.appendChild(progress);
    let answer='',modelError='',editProposal=null;
    try{
      // A análise numérica é somente contexto para o Qwen; não aparece como
      // resposta separada, etiqueta de fonte ou aviso técnico ao usuário.
      const engine=window.PCM_NEURAL_ENGINE;
      const trusted=conversation?.ask(ctx,target?'':q,target||null)
        ||engine?.answer(ctx,target?'':q,target||null)
        ||{title:'',body:'',facts:[]};
      if(!llm?.status().available || !window.PCM_NEURAL_EVIDENCE) {
        throw Error('O modelo local nao esta disponivel neste navegador.');
      }
      const editor=window.PCM_NEURAL_EDITS;
      const editRequest=!target && editor?.isEditRequest(q);
      let knowledge=[];
      if(!editRequest&&window.PCM_MANIX_RAG_SEARCH){
        try{
          progress.textContent='Manix está consultando a biblioteca técnica…';
          knowledge=await window.PCM_MANIX_RAG_SEARCH(subject,{count:6})||[];
        }catch(error){
          console.warn('Consulta à Biblioteca MANIX falhou:',error?.message||error);
        }
      }
      const prepared=editRequest
        ? {messages:editor.prompt(q)}
        : window.PCM_NEURAL_EVIDENCE.makePrompt(
            ctx,q,target||null,trusted,conversation?.contextStatus?.(),history,knowledge
          );
      let streamed='',lastPaint=0,lastDownloadPaint=0;
      progress.textContent='Preparando…';
      answer=await llm.ask(prepared.messages,{
        onProgress:p=>{
          if(run!==requestGeneration)return;
          const now=performance.now();
          if(p.type==='progress'&&now-lastDownloadPaint<180)return;
          if(p.type==='progress')lastDownloadPaint=now;
          if(p.type==='status'&&p.status==='generating')progress.textContent='Analisando…';
          else if(p.type==='progress'){
            const percent=Number.isFinite(p.percent)?' '+Math.round(p.percent)+'%':'';
            progress.textContent=(p.message||'Preparando')+percent+'…';
          }
        },
        onToken:token=>{
          if(run!==requestGeneration)return;
          streamed+=token;
          const now=performance.now();
          if(now-lastPaint>120){
            progress.textContent=streamed.slice(-750);
            lastPaint=now;
          }
        }
      });
      state.textContent='Pronta';
      if(!answer.trim())throw Error('Não recebi uma resposta do modelo.');
      if(editRequest){
        editProposal=editor.parse(answer);
        answer=editProposal
          ? editor.describe(editProposal)+'?'
          : 'Posso ajustar o título, a cor, o tamanho do texto e o espaçamento do painel. Alterações em registros de manutenção não são permitidas pelo chat.';
      }else{
        answer=conversationalText(answer.trim().slice(0,3500),q);
        history.push({role:'user',content:subject},{role:'assistant',content:answer.slice(0,900)});
      }
      while(history.length>8)history.shift();
      if(run!==requestGeneration||identityKey!==(String(getContext()?.userId||'')+':'+String(getContext()?.revision||'')))return;
      updateState();
    }catch(error){
      modelError=short(error?.message||error,220);
    }finally{
      progress.remove();
      if(run===requestGeneration){
        busy=false;
        root.querySelector('#pcm-neural-send').disabled=false;
      }
    }
    if(run!==requestGeneration)return;
    const card=make('article','pcm-neural-answer'+(modelError?' pcm-neural-answer-error':''));
    const author=make('div','pcm-neural-answer-author');
    author.append(make('span','queen-answer-bot manix-answer-mark','M'),make('strong','queen-answer-name','MANIX'));
    card.appendChild(author);
    if(modelError){
      card.appendChild(make('p','pcm-neural-answer-text',
        'Não consegui concluir essa análise agora. '+modelError));
    }else{
      card.appendChild(make('p','pcm-neural-answer-text',answer));
      if(editProposal){
        const controls=make('div','pcm-neural-edit-actions');
        const apply=make('button','pcm-neural-edit-apply','Aplicar');
        const cancel=make('button','pcm-neural-edit-cancel','Cancelar');
        apply.type=cancel.type='button';
        const freeze=()=>{apply.disabled=true;cancel.disabled=true;};
        apply.addEventListener('click',()=>{
          if(identityKey!==(String(getContext()?.userId||'')+':'+String(getContext()?.revision||'')))return;
          freeze();
          if(window.PCM_NEURAL_EDITS?.apply(editProposal)){
            card.querySelector('.pcm-neural-answer-text').textContent='Alteração aplicada ao painel.';
            const undo=make('button','pcm-neural-edit-cancel','Desfazer');
            undo.type='button';
            undo.addEventListener('click',()=>{
              if(window.PCM_NEURAL_EDITS?.undo()){
                card.querySelector('.pcm-neural-answer-text').textContent='Alteração desfeita.';
                undo.disabled=true;
              }
            });
            controls.replaceChildren(undo);
          }
        });
        cancel.addEventListener('click',()=>{
          freeze();
          card.querySelector('.pcm-neural-answer-text').textContent='Alteração cancelada.';
          controls.replaceChildren();
        });
        controls.append(apply,cancel);
        card.appendChild(controls);
      }
    }
    messages.appendChild(card);
    trimMessages();
    messages.lastElementChild.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  root.querySelectorAll('[data-pcm-question]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.pcmQuestion)));
    form.addEventListener('submit',event=>{event.preventDefault();send(input.value);});
  clear.addEventListener('click',()=>{
    requestGeneration++;
    llm?.stop('Nova investigação iniciada');
    busy=false;
    root.querySelector('#pcm-neural-send').disabled=false;
    history.length=0;
    conversation?.clear();
    messages.replaceChildren();
    prompts.classList.remove('pcm-neural-prompts-used');
    root.querySelector('.pcm-neural-welcome').hidden=false;
    input.value='';
    input.focus();
  });
  close.addEventListener('click',()=>{closePanel();orb.focus();});
  pick.addEventListener('click',()=>{
    panel.hidden=true;
    selectMode=true;
    orb.classList.add('pcm-neural-selecting');
    orb.setAttribute('aria-label','Selecione um indicador na tela para explicação');
  });
  shell.addEventListener('click',event=>{
    if(!selectMode||root.contains(event.target))return;
    const el=event.target.closest(TARGETS);
    if(!isVisible(el))return;
    event.preventDefault();
    event.stopPropagation();
    send('',targetData(el));
  },true);
  orb.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const box=orb.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top,moved:false};
    orb.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  orb.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<8)return;
    drag.moved=true;
    orb.classList.add('pcm-neural-dragging');
    orb.style.left=Math.max(8,Math.min(window.innerWidth-orb.offsetWidth-8,drag.left+dx))+'px';
    orb.style.top=Math.max(8,Math.min(window.innerHeight-orb.offsetHeight-8,drag.top+dy))+'px';
    orb.style.right='auto';orb.style.bottom='auto';
    mark(underPointer(event.clientX,event.clientY));
  });
  orb.addEventListener('pointerup',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const moved=drag.moved;
    drag=null;
    orb.classList.remove('pcm-neural-dragging');
    if(!moved){openPanel(true);return;}
    const t=underPointer(event.clientX,event.clientY);
    mark(null);
    if(t)send('',targetData(t));
  });
  orb.addEventListener('pointercancel',()=>{drag=null;mark(null);orb.classList.remove('pcm-neural-dragging');});
  orb.addEventListener('click',e=>{if(e.detail===0)openPanel(true);});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(selectMode||!panel.hidden){closePanel();orb.focus();}}});
})();
