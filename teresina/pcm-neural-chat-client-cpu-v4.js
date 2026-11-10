(function(root){
'use strict';

const MODEL='Manix 1.5B · servidor central';

function createClient(){
  let active=null,serial=0;

  const status=()=>({
    ready:typeof root.PCM_MANIX_REMOTE_CHAT==='function',
    busy:!!active,
    loading:false,
    available:typeof root.PCM_MANIX_REMOTE_CHAT==='function',
    unavailable:'',
    model:MODEL,
    realQueen:true,
    central:true
  });

  async function preload(){return status().available;}

  async function ask(messages,callbacks={}){
    if(active)return Promise.reject(new Error('Aguarde a consulta atual terminar.'));
    if(typeof root.PCM_MANIX_REMOTE_CHAT!=='function'){
      return Promise.reject(new Error('A Manix central não está disponível.'));
    }

    const id=++serial;
    callbacks.onProgress?.({type:'status',status:'generating'});
    return new Promise((resolve,reject)=>{
      active={id,resolve,reject};
      root.PCM_MANIX_REMOTE_CHAT(messages)
        .then(result=>{
          const current=active;
          active=null;
          const text=String(result?.text||'').trim();
          if(!text)throw new Error('A Manix retornou resposta vazia.');
          current?.resolve(text);
        })
        .catch(err=>{
          const current=active;
          active=null;
          current?.reject(err);
        });
    });
  }

  function stop(reason='Interrompido'){
    if(active){
      active.reject(new Error(reason));
      active=null;
    }
  }

  return {ask,preload,status,stop};
}

const api={createClient,MODEL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_CHAT=api;
})(typeof globalThis!=='undefined'?globalThis:this);
