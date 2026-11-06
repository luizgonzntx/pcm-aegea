(function(root){
'use strict';
const MODEL='Qwen2.5-0.5B-Instruct (WebGPU local)';
function createClient(workerFactory){
 const factory=workerFactory||(()=>new Worker('pcm-neural-chat-worker.js?v=20261106-7',{type:'module'}));
 let worker=null,active=null,serial=0,ready=false,unavailable='';
 const canRun=()=>typeof root.Worker==='function'&&!!root.navigator?.gpu;
 const status=()=>({ready,busy:!!active,available:canRun()&&!unavailable,unavailable,model:MODEL});
 function stop(reason='Modelo interrompido'){
   if(worker){worker.terminate();worker=null;}
   if(active){active.reject(new Error(reason));active=null;}
   ready=false;
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
     unavailable='O código do modelo não pôde ser carregado. Verifique rede e WebGPU.';
     stop(unavailable);
   });
   worker.addEventListener('messageerror',()=>stop('Erro de comunicação com o modelo local.'));
 }
 function ask(messages,callbacks={}){
   if(!canRun())return Promise.reject(new Error('WebGPU indisponível. Use Chrome ou Edge atualizado com aceleração gráfica habilitada.'));
   if(unavailable)return Promise.reject(new Error(unavailable));
   if(active)return Promise.reject(new Error('Aguarde a consulta atual terminar.'));
   return new Promise((resolve,reject)=>{
     const id=++serial;
     active={id,resolve,reject,progress:callbacks.onProgress,token:callbacks.onToken};
     try{init();worker.postMessage({id,type:'chat',messages});}
     catch(err){active=null;reject(err);}
   });
 }
 return {ask,status,stop};
}
const api={createClient,MODEL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_CHAT=api;
})(typeof globalThis!=='undefined'?globalThis:this);
