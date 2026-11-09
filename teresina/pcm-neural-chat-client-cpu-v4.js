(function(root){
'use strict';
const FALLBACK_MODEL='Manix Local · modelo leve';
const REAL_MODEL='Manix IA · modelo treinado';
const onLocalHost=()=>['127.0.0.1','localhost'].includes(location.hostname);
const cleanBase=v=>String(v||'').trim().replace(/\/+$/,'');
const queryBackend=()=>{
  try{return cleanBase(new URLSearchParams(location.search).get('queen_backend'));}catch(_){return '';}
};
const savedBackend=()=>{
  try{return cleanBase(localStorage.getItem('queen_backend_url'));}catch(_){return '';}
};
let remoteBackend=queryBackend()||savedBackend();
if(queryBackend()){try{localStorage.setItem('queen_backend_url',queryBackend());}catch(_){}}
const backendBase=()=>remoteBackend||(onLocalHost()?'':'http://127.0.0.1:8765');
const isLoopback=url=>/^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?/i.test(url);
const backendRequest=(path,options={})=>{
  const url=backendBase()+path;
  return isLoopback(url)
    ? new Request(url,{mode:'cors',targetAddressSpace:'loopback',...options})
    : new Request(url,{mode:'cors',...options});
};

function createClient(workerFactory){
 const factory=workerFactory||(()=>new Worker('pcm-neural-chat-worker-cpu-v4.js?v=20261109-queen1',{type:'module'}));
 let worker=null,active=null,serial=0,ready=false,unavailable='',realQueen=false,lastProbe=0;
 const canRun=()=>typeof root.Worker==='function';
 const status=()=>({
   ready:realQueen||ready,
   busy:!!active,
   available:realQueen||canRun()&&!unavailable,
   unavailable,
   model:realQueen?REAL_MODEL:FALLBACK_MODEL,
   realQueen
 });

 function stop(reason='Modelo interrompido'){
   if(/página em segundo plano|pagina em segundo plano/i.test(String(reason||'')))return;
   if(worker){worker.terminate();worker=null;}
   if(active){active.reject(new Error(reason));active=null;}
   ready=false;
 }

 async function probeRealQueen(force=false){
   const now=Date.now();
   if(!force&&realQueen&&now-lastProbe<15000)return true;
   lastProbe=now;
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),remoteBackend?5000:(onLocalHost()?2500:900));
   try{
     const res=await fetch(backendRequest('/health',{cache:'no-store',signal:controller.signal}));
     if(!res.ok)throw Error('health '+res.status);
     const data=await res.json();
     realQueen=!!data?.queen_real;
     return realQueen;
   }catch(_){
     realQueen=false;
     return false;
   }finally{clearTimeout(timer);}
 }

 async function askRealQueen(messages,callbacks={}){
   callbacks.onProgress?.({type:'status',status:'generating',backend:'queen-real'});
   const res=await fetch(backendRequest('/api/chat',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({messages,max_new_tokens:260})
   }));
   if(!res.ok){
     let detail='';
     try{detail=(await res.json())?.detail||'';}catch(_){}
     throw Error(detail||('Manix IA respondeu HTTP '+res.status));
   }
   const data=await res.json();
   const text=String(data?.text||'').trim();
   if(!text)throw Error('Manix IA retornou resposta vazia.');
   return text;
 }

 function init(){
   if(worker)return;
   worker=factory();
   worker.addEventListener('message',event=>{
     const msg=event.data||{};
     if(!active||msg.id!==active.id)return;
     if(msg.type==='progress'){
       active.progress?.(msg);
     }else if(msg.type==='token'){
       active.token?.(String(msg.text||''));
     }else if(msg.type==='status'){
       if(msg.status==='generating')ready=true;
       active.progress?.(msg);
     }else if(msg.type==='done'){
       const current=active;active=null;
       current.resolve(String(msg.text||''));
     }else if(msg.type==='error'){
       const current=active;active=null;
       current.reject(new Error(String(msg.error||'Falha na geração')));
     }
   });
   worker.addEventListener('error',()=>{
     unavailable='O código do modelo leve não pôde ser carregado. Verifique a conexão e recarregue a página.';
     if(worker){worker.terminate();worker=null;}
     ready=false;
   });
   worker.addEventListener('messageerror',()=>stop('Erro de comunicação com o modelo local.'));
 }

 async function ask(messages,callbacks={}){
   if(active)return Promise.reject(new Error('Aguarde a consulta atual terminar.'));
   const id=++serial;
   const localCallbacks={onProgress:callbacks.onProgress,onToken:callbacks.onToken};
   const useReal=await probeRealQueen(true);
   if(useReal){
     return new Promise((resolve,reject)=>{
       active={id,resolve,reject,progress:callbacks.onProgress,token:callbacks.onToken};
       askRealQueen(messages,localCallbacks)
        .then(text=>{const current=active;active=null;current?.resolve(text);})
        .catch(err=>{realQueen=false;const current=active;active=null;current?.reject(err);});
     });
   }
   if(!canRun())return Promise.reject(new Error('Este navegador não suporta o modelo local e a Manix IA não foi detectada.'));
   if(unavailable)return Promise.reject(new Error(unavailable));
   return new Promise((resolve,reject)=>{
     active={id,resolve,reject,progress:callbacks.onProgress,token:callbacks.onToken};
     try{init();worker.postMessage({id,type:'chat',messages});}
     catch(err){active=null;reject(err);}
   });
 }

 function setBackend(url){
   remoteBackend=cleanBase(url);
   try{
     if(remoteBackend)localStorage.setItem('queen_backend_url',remoteBackend);
     else localStorage.removeItem('queen_backend_url');
   }catch(_){}
   realQueen=false;
   lastProbe=0;
   return probeRealQueen(true);
 }
 function getBackend(){return remoteBackend;}
 probeRealQueen(false);
 return {ask,status,stop,probeRealQueen,setBackend,getBackend};
}
const api={createClient,MODEL:FALLBACK_MODEL,REAL_MODEL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_CHAT=api;
})(typeof globalThis!=='undefined'?globalThis:this);
