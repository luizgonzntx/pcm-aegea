// PCM Neural: Qwen2.5-0.5B-Instruct executado na GPU do próprio navegador.
// Código e pesos públicos baixados apenas do CDN de distribuição e do Hugging Face.
// Perguntas, dados SAP e ICM permanecem neste navegador.
import {pipeline,TextStreamer,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
env.allowRemoteModels=true;
env.allowLocalModels=false;
env.useBrowserCache=true;
// Limit context and tokens to keep GPU usage bounded on desktop.
const MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
let generator=null;
let loading=null;
let occupied=false;
const report=(type,id,data={})=>self.postMessage({type,id,...data});
async function load(id){
  if(generator)return generator;
  if(!self.navigator?.gpu)throw Error('Este navegador não oferece WebGPU para executar o modelo local.');
  if(!loading){
    loading=pipeline('text-generation',MODEL,{
      device:'webgpu',dtype:'q4',
      progress_callback:p=>{
        if(!p)return;
        const pct=Number(p.progress);
        report('progress',id,{
          file:String(p.file||''),
          status:String(p.status||''),
          percent:Number.isFinite(pct)?Math.max(0,Math.min(100,pct)):null
        });
      }
    }).then(g=>{generator=g;return g;}).catch(err=>{loading=null;throw err;});
  }
  return loading;
}
self.addEventListener('message',async event=>{
  const {id,type,messages}=event.data||{};
  if(type!=='chat'||!Number.isInteger(id))return;
  if(occupied){report('error',id,{error:'Existe outra consulta em processamento.'});return;}
  occupied=true;
  try{
    report('status',id,{status:'initializing'});
    const model=await load(id);
    report('status',id,{status:'generating'});
    const streamer=new TextStreamer(model.tokenizer,{
      skip_prompt:true,skip_special_tokens:true,
      callback_function:chunk=>report('token',id,{text:String(chunk)})
    });
    const safe=(Array.isArray(messages)?messages:[]).slice(-7).filter(x=>
      ['system','user','assistant'].includes(x.role)&&typeof x.content==='string'
    ).map(m=>({role:m.role,content:m.content.slice(0,4500)}));
    if(!safe.length)throw Error('Pergunta vazia.');
    const result=await model(safe,{
      max_new_tokens:160,
      do_sample:false,
      repetition_penalty:1.12,
      streamer
    });
    const out=result?.[0]?.generated_text;
    const last=Array.isArray(out)?out.at(-1)?.content:out;
    report('done',id,{text:String(last||'').trim()});
  }catch(err){
    report('error',id,{error:String(err?.message||err||'Falha no modelo')});
  }finally{occupied=false;}
});