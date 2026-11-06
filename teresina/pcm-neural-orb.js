(() => {
  'use strict';
  const shell = document.getElementById('shell');
  if (!shell || document.getElementById('pcm-neural-layer')) return;
  const root = document.createElement('div');
  root.id = 'pcm-neural-layer';
  root.innerHTML = `
    <button type="button" id="pcm-neural-orb" aria-controls="pcm-neural-panel" aria-expanded="false" aria-label="Abrir Tire suas dúvidas do PCM Neural" title="Clique para perguntar ou arraste sobre um indicador">
      <span class="pcm-orb-mark" aria-hidden="true">✦</span>
      <span class="pcm-orb-caption">Tire dúvidas</span>
    </button>
    <section id="pcm-neural-panel" role="dialog" aria-modal="false" aria-labelledby="pcm-neural-title" hidden>
      <header class="pcm-neural-head">
        <div class="pcm-neural-avatar" aria-hidden="true">✦</div>
        <div class="pcm-neural-heading">
          <span class="pcm-neural-eyebrow">CENTRAL DE CONSULTAS · PCM</span>
          <strong id="pcm-neural-title">Tire suas dúvidas</strong>
          <small id="pcm-neural-source-state">Respostas baseadas no painel</small>
        </div>
        <button type="button" id="pcm-neural-close" class="pcm-neural-icon-button" aria-label="Fechar painel">×</button>
      </header>
      <div class="pcm-neural-content">
        <div class="pcm-neural-welcome">
          <div class="pcm-neural-intro-icon" aria-hidden="true">✧</div>
          <h3>O que você quer investigar?</h3>
          <p>Consulte ordens, indicadores e ICM. As respostas usam os dados carregados e mostram de onde vieram.</p>
        </div>
        <div id="pcm-neural-prompts" class="pcm-neural-prompts" aria-label="Perguntas sugeridas">
          <button type="button" data-pcm-question="Quantas ordens foram executadas?"><span>▦</span>Ordens executadas</button>
          <button type="button" data-pcm-question="Qual causa mais frequente no ICM?"><span>◎</span>Causas do ICM</button>
          <button type="button" data-pcm-question="Qual é o MTTR ativo?"><span>◷</span>Entender o MTTR</button>
          <button type="button" data-pcm-question="Há dados incompletos no ICM?"><span>◇</span>Auditar cadastro</button>
        </div>
        <div id="pcm-neural-messages" class="pcm-neural-messages" role="log" aria-label="Histórico de perguntas e respostas" aria-live="polite"></div>
      </div>
      <div class="pcm-neural-bottom">
        <button type="button" id="pcm-neural-pick" class="pcm-neural-pick"><span aria-hidden="true">⌖</span> Escolher um dado da tela</button>
        <form id="pcm-neural-form" autocomplete="off">
          <label class="pcm-neural-visually-hidden" for="pcm-neural-question">Escreva sua dúvida</label>
          <input id="pcm-neural-question" maxlength="500" placeholder="Ex.: Explique a OS 900123456" required>
          <button type="submit" id="pcm-neural-send" aria-label="Enviar pergunta" title="Enviar pergunta">↑</button>
        </form>
        <small>Consultas SAP com evidências. O modelo conversacional será disponibilizado pelo servidor privado, sem arquivos manuais.</small>
      </div>
    </section>`;
  shell.appendChild(root);
  const orb=root.querySelector('#pcm-neural-orb');
  const panel=root.querySelector('#pcm-neural-panel');
  const close=root.querySelector('#pcm-neural-close');
  const form=root.querySelector('#pcm-neural-form');
  const input=root.querySelector('#pcm-neural-question');
  const messages=root.querySelector('#pcm-neural-messages');
  const prompts=root.querySelector('#pcm-neural-prompts');
  const pick=root.querySelector('#pcm-neural-pick');
  const state=root.querySelector('#pcm-neural-source-state');
  const TARGETS='#kpis .kpi,#icmSummary .kpi,#deadlineCards .kpi,#engKpis .kpi,#maintenanceOverview .maintenance-step,#icmCards .card,.table-wrap tbody tr,.plant-summary>div';
  let drag=null,selectMode=false,highlight=null;
  const short=(value,n=170)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,n);
  function getContext(){
    try{return window.PCM_NEURAL_CONTEXT?.()||null;}catch(_){return null;}
  }
  function updateState(){
    const ctx=getContext();
    state.textContent=!ctx
      ? 'Aguardando dados da sessão'
      : (window.PCM_CONFIG?.neuralFunction
         ? 'Consultas SAP · servidor neural configurado'
         : 'Consultas SAP ativas · IA conversacional em desenvolvimento');
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
    if(!q&&!target)return;
    openPanel(false);
    prompts.classList.add('pcm-neural-prompts-used');
    const subject=target?'Explique: '+(target.label||'dado selecionado')+(target.value?' · '+target.value:''):q;
    messages.appendChild(make('div','pcm-neural-user-message',subject));
    input.value='';
    let response,serverError=false;
    const progress=make('div','pcm-neural-system-message','Consultando dados autorizados…');
    messages.appendChild(progress);
    try{
      // A URL e os pesos do modelo nunca são expostos pelo frontend. O Supabase autentica o usuário.
      if(window.PCM_CONFIG?.neuralFunction && typeof window.PCM_NEURAL_REMOTE==='function'){
        try{response=await window.PCM_NEURAL_REMOTE({question:q,target:target||null});}
        catch(error){serverError=true;}
      }
      if(!response){
        const engine=window.PCM_NEURAL_ENGINE;
        response=engine?.answer(getContext(),target?'':q,target||null);
        if(!response)throw Error('Motor de consulta indisponível');
        if(serverError)response={...response,caveat:'Servidor de IA indisponível nesta consulta. '+(response.caveat||'')};
      }
    }catch(_){
      response={title:'Não foi possível consultar',body:'A análise não pôde ser concluída nesta sessão. Atualize a base no painel e tente novamente.',facts:[],source:'Nenhuma análise calculada'};
    }finally{progress.remove();}
    const card=make('article','pcm-neural-answer');
    const cap=make('div','pcm-neural-answer-top');
    cap.appendChild(make('span','pcm-neural-answer-badge',response.engine==='server'?'ANÁLISE DO SERVIDOR':'CONSULTA AOS DADOS SAP'));
    card.appendChild(cap);
    card.appendChild(make('h4','',response.title||'Resultado'));
    card.appendChild(make('p','pcm-neural-answer-text',response.body||'Sem resultado para essa pergunta.'));
    if(response.facts?.length){
      const dl=make('dl','pcm-neural-facts');
      response.facts.slice(0,8).forEach(f=>{
        const item=make('div','pcm-neural-fact');
        item.appendChild(make('dt','',f.label));
        item.appendChild(make('dd','',f.value));
        dl.appendChild(item);
      });
      card.appendChild(dl);
    }
    if(response.caveat){
      const alert=make('div','pcm-neural-caveat');
      alert.appendChild(make('span','pcm-neural-caveat-mark','!'));
      alert.appendChild(make('p','',response.caveat));
      card.appendChild(alert);
    }
    card.appendChild(make('small','pcm-neural-reference','Fonte: '+(response.source||'dados do painel')));
    messages.appendChild(card);
    trimMessages();
    messages.lastElementChild.scrollIntoView({behavior:'smooth',block:'nearest'});
    input.value='';
  }
  root.querySelectorAll('[data-pcm-question]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.pcmQuestion)));
  form.addEventListener('submit',event=>{event.preventDefault();send(input.value);});
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
