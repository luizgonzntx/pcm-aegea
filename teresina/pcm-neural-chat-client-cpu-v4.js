(function(root){
'use strict';

const MODEL='Manix 1.5B · INT4 WebGPU';

function createClient(workerFactory){
  const factory=workerFactory||(()=>new Worker('pcm-manix-webgpu-worker.js?v=20261110-webgpu1',{type:'module'}));
  let worker=null,active=null,serial=0,ready=false,loading=false,unavailable='',modelFiles=null,lastMetrics=null;

  const capable=()=>typeof root.Worker==='function'&&!!root.navigator?.gpu&&typeof WebAssembly?.Suspending==='function';
  const status=()=>({
    ready,
    busy:!!active,
    loading,
    available:capable()&&!unavailable,
    unavailable,
    model:MODEL,
    realQueen:true,
    webgpu:true,
    metrics:lastMetrics
  });

  function init(){
    if(worker)return;
    worker=factory();
    worker.addEventListener('message',event=>{
      const msg=event.data||{};
      if(!active||msg.id!==active.id)return;
      if(msg.type==='progress'){
        loading=true;
        active.progress?.({type:'progress',percent:Number(msg.percent)||0,message:String(msg.message||'')});
      }else if(msg.type==='status'){
        active.progress?.({type:'status',status:String(msg.status||'')});
      }else if(msg.type==='token'){
        active.token?.(String(msg.text||''));
      }else if(msg.type==='ready'){
        ready=true;loading=false;
        const current=active;active=null;
        current?.resolve(true);
      }else if(msg.type==='done'){
        ready=true;loading=false;lastMetrics=msg.metrics||null;
        const current=active;active=null;
        current?.resolve(String(msg.text||''));
      }else if(msg.type==='error'){
        loading=false;
        const current=active;active=null;
        current?.reject(new Error(String(msg.error||'Falha na Manix')));
      }
    });
    worker.addEventListener('error',event=>{
      unavailable=String(event?.message||'Falha ao carregar o mecanismo WebGPU.');
      const current=active;active=null;
      current?.reject(new Error(unavailable));
      try{worker?.terminate();}catch(_){}
      worker=null;ready=false;loading=false;
    });
    worker.addEventListener('messageerror',()=>{
      const current=active;active=null;
      current?.reject(new Error('Falha de comunicação com a Manix.'));
    });
  }

  async function getFiles(force=false){
    if(modelFiles&&!force)return modelFiles;
    if(typeof root.PCM_MANIX_MODEL_FILES!=='function')throw new Error('Arquivos da Manix indisponíveis.');
    modelFiles=await root.PCM_MANIX_MODEL_FILES();
    if(!modelFiles?.urls?.['model.onnx']||!Array.isArray(modelFiles?.parts)||!modelFiles.parts.length){
      throw new Error('Modelo Manix ainda não foi publicado.');
    }
    return modelFiles;
  }

  async function preload(callbacks={}){
    if(ready)return true;
    if(!capable())return false;
    if(active)return false;
    const id=++serial;
    loading=true;
    return new Promise(async(resolve,reject)=>{
      active={id,resolve,reject,progress:callbacks.onProgress,token:null};
      try{
        const files=await getFiles();
        init();
        worker.postMessage({id,type:'load',files});
      }catch(err){
        loading=false;active=null;reject(err);
      }
    });
  }

  async function ask(messages,callbacks={}){
    if(active)return Promise.reject(new Error('Aguarde a consulta atual terminar.'));
    if(!capable())return Promise.reject(new Error('Este navegador não oferece WebGPU compatível com a Manix.'));
    if(unavailable)return Promise.reject(new Error(unavailable));

    const id=++serial;
    loading=!ready;
    return new Promise(async(resolve,reject)=>{
      active={id,resolve,reject,progress:callbacks.onProgress,token:callbacks.onToken};
      try{
        const files=await getFiles(!ready);
        init();
        worker.postMessage({id,type:'chat',messages,files,maxTokens:240});
      }catch(err){
        loading=false;active=null;reject(err);
      }
    });
  }

  function stop(reason='Interrompido'){
    if(worker){try{worker.terminate();}catch(_){} worker=null;}
    if(active){active.reject(new Error(reason));active=null;}
    ready=false;loading=false;modelFiles=null;
  }

  return {ask,preload,status,stop};
}

const api={createClient,MODEL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_CHAT=api;
})(typeof globalThis!=='undefined'?globalThis:this);
