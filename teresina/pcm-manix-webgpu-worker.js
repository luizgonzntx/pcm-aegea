import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort.jspi.min.mjs';
import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

const ORT_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
const TOKENIZER_ID='Qwen/Qwen2.5-1.5B-Instruct';

let session=null, tokenizer=null, config=null, device=null, loadedVersion='';
let activeId=0;

const post=(type,payload={})=>self.postMessage({id:activeId,type,...payload});
const tick=()=>new Promise(r=>setTimeout(r,0));

function halfToFloat(bits){
  const sign=bits&0x8000?-1:1,exp=(bits>>10)&31,frac=bits&1023;
  if(exp===31)return frac?NaN:sign*Infinity;
  return sign*(exp?2**(exp-15)*(1+frac/1024):2**-14*frac/1024);
}
function tensorInt64(values,dims){return new ort.Tensor('int64',BigInt64Array.from(values,BigInt),dims);}
function emptyFp16(dims){return new ort.Tensor('float16',new Uint16Array(dims.reduce((a,b)=>a*b,1)),dims);}

async function fetchChecked(url,label,expected,as='arrayBuffer'){
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok)throw new Error(label+' HTTP '+res.status);
  const value=as==='json'?await res.json():as==='text'?await res.text():await res.arrayBuffer();
  if(expected&&as==='arrayBuffer'&&value.byteLength!==expected)throw new Error(label+' incompleto');
  return value;
}

async function loadModel(files){
  if(session&&loadedVersion===files.version)return;
  if(typeof WebAssembly.Suspending!=='function')throw new Error('Chrome/Edge atualizado é necessário para a Manix.');
  if(!navigator.gpu)throw new Error('WebGPU não está disponível neste navegador.');

  post('progress',{percent:1,message:'Preparando GPU'});
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter||adapter.info?.isFallbackAdapter)throw new Error('GPU WebGPU de hardware não disponível.');
  if(!adapter.features.has('shader-f16'))throw new Error('A GPU/navegador não oferece shader-f16.');

  const requiredFeatures=['shader-f16'];
  if(adapter.features.has('subgroups'))requiredFeatures.push('subgroups');
  device=await adapter.requestDevice({requiredFeatures});
  ort.env.webgpu.device=device;
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths={
    wasm:ORT_BASE+'ort-wasm-simd-threaded.jspi.wasm',
    mjs:ORT_BASE+'ort-wasm-simd-threaded.jspi.mjs'
  };
  ort.env.logLevel='warning';

  config=await fetchChecked(files.urls['genai_config.json'],'Config',0,'json');
  const graphBuffer=await fetchChecked(files.urls['model.onnx'],'Grafo',0,'arrayBuffer');

  const parts=Array.isArray(files.parts)?files.parts:[];
  if(!parts.length)throw new Error('Partes do modelo não encontradas.');

  const blobs=[];
  let done=0,total=parts.reduce((n,p)=>n+Number(p.bytes||0),0);
  for(const part of parts){
    const name=String(part.name||'');
    const expected=Number(part.bytes||0);
    const url=files.urls[name];
    if(!url)throw new Error('URL ausente: '+name);
    const res=await fetch(url,{cache:'force-cache'});
    if(!res.ok)throw new Error(name+' HTTP '+res.status);
    const blob=await res.blob();
    if(expected&&blob.size!==expected)throw new Error(name+' incompleto');
    blobs.push(blob);
    done+=blob.size;
    post('progress',{percent:Math.max(2,Math.min(92,Math.round(done/Math.max(total,1)*90)+2)),message:'Carregando Manix'});
    await tick();
  }

  const weights=new Blob(blobs,{type:'application/octet-stream'});
  if(files.originalDataBytes&&weights.size!==Number(files.originalDataBytes))throw new Error('Peso recomposto com tamanho incorreto.');

  const dec=config.model.decoder;
  const preferred={};
  preferred[dec.outputs.logits]='cpu';
  for(let i=0;i<dec.num_hidden_layers;i++){
    preferred[dec.outputs.present_key_names.replace('%d',i)]='gpu-buffer';
    preferred[dec.outputs.present_value_names.replace('%d',i)]='gpu-buffer';
  }

  post('progress',{percent:94,message:'Inicializando Manix'});
  session=await ort.InferenceSession.create(new Uint8Array(graphBuffer),{
    executionProviders:['webgpu'],
    externalData:[{path:'model.onnx.data',data:weights}],
    preferredOutputLocation:preferred,
    freeDimensionOverrides:{batch_size:1},
    extra:{session:{disable_cpu_ep_fallback:'1'}},
    logSeverityLevel:2
  });

  env.allowRemoteModels=true;
  env.allowLocalModels=false;
  env.useBrowserCache=true;
  tokenizer=await AutoTokenizer.from_pretrained(TOKENIZER_ID);

  loadedVersion=files.version||'v1';
  post('progress',{percent:100,message:'Pronta'});
  post('ready',{model:'Manix 1.5B INT4 WebGPU',gpu:adapter.info?.description||adapter.info?.device||adapter.info?.vendor||'WebGPU'});
}

async function greedyToken(logits){
  const data=await logits.getData();
  const vocab=logits.dims.at(-1);
  const offset=data.length-vocab;
  let best=-Infinity,token=-1;
  for(let i=0;i<vocab;i++){
    const v=logits.type==='float16'&&data instanceof Uint16Array?halfToFloat(data[offset+i]):data[offset+i];
    if(v>best){best=v;token=i;}
  }
  if(token<0||!Number.isFinite(best))throw new Error('Logits inválidos.');
  return token;
}

async function generate(messages,maxTokens=240){
  if(!session||!tokenizer||!config)throw new Error('Manix ainda não carregada.');
  const dec=config.model.decoder;
  const ids=tokenizer.apply_chat_template(messages,{
    tokenize:true,return_tensor:false,return_dict:false,add_generation_prompt:true
  });
  if(!Array.isArray(ids)||!ids.every(Number.isInteger))throw new Error('Tokenização inválida.');
  if(ids.length+maxTokens>config.model.context_length)throw new Error('Pergunta excede o contexto do modelo.');

  let state={};
  for(let i=0;i<dec.num_hidden_layers;i++){
    state[dec.inputs.past_key_names.replace('%d',i)]=emptyFp16([1,dec.num_key_value_heads,0,dec.head_size]);
    state[dec.inputs.past_value_names.replace('%d',i)]=emptyFp16([1,dec.num_key_value_heads,0,dec.head_size]);
  }

  let tokens=ids,pastLength=0;
  const generated=[],eos=new Set([config.model.eos_token_id].flat()),start=performance.now();
  let firstTokenAt=0,lastText='';

  try{
    for(let step=0;step<maxTokens;step++){
      const feeds={...state};
      const ephemeral=[];
      const input=tensorInt64(tokens,[1,tokens.length]);
      const mask=tensorInt64(Array(pastLength+tokens.length).fill(1),[1,pastLength+tokens.length]);
      feeds[dec.inputs.input_ids]=input;
      feeds[dec.inputs.attention_mask]=mask;
      ephemeral.push(input,mask);

      let outputs;
      try{outputs=await session.run(feeds);}
      finally{for(const t of ephemeral)t.dispose();}

      const token=await greedyToken(outputs[dec.outputs.logits]);
      if(!firstTokenAt)firstTokenAt=performance.now();
      generated.push(token);

      const next={};
      for(let i=0;i<dec.num_hidden_layers;i++){
        const pk=dec.inputs.past_key_names.replace('%d',i),pv=dec.inputs.past_value_names.replace('%d',i);
        const ok=dec.outputs.present_key_names.replace('%d',i),ov=dec.outputs.present_value_names.replace('%d',i);
        const kt=outputs[ok],vt=outputs[ov];
        if(!kt||!vt)throw new Error('KV cache incompleto na camada '+i);
        if(kt.location!=='gpu-buffer'||vt.location!=='gpu-buffer')throw new Error('KV cache saiu da GPU.');
        next[pk]=kt;next[pv]=vt;
      }

      for(const t of Object.values(state))t.dispose();
      state=next;
      for(const [name,t] of Object.entries(outputs)){
        if(name===dec.outputs.logits)t.dispose();
        else if(!Object.values(state).includes(t))t.dispose();
      }

      const text=tokenizer.decode(generated,{skip_special_tokens:true});
      const delta=text.slice(lastText.length);
      lastText=text;
      if(delta)post('token',{text:delta});

      pastLength+=tokens.length;
      tokens=[token];
      if(eos.has(token))break;
      if(step%4===0)await tick();
    }

    const end=performance.now();
    post('done',{
      text:lastText.trim(),
      metrics:{
        promptTokens:ids.length,
        completionTokens:generated.length,
        firstTokenMs:firstTokenAt?firstTokenAt-start:null,
        tokensPerSecond:firstTokenAt&&generated.length>1?(generated.length-1)*1000/(end-firstTokenAt):null
      }
    });
  }finally{
    for(const t of Object.values(state))try{t.dispose();}catch(_){}
  }
}

self.onmessage=async({data})=>{
  activeId=data?.id||0;
  try{
    if(data?.type==='load')await loadModel(data.files);
    else if(data?.type==='chat'){
      if(!session)await loadModel(data.files);
      post('status',{status:'generating'});
      await generate(Array.isArray(data.messages)?data.messages:[],Number(data.maxTokens)||240);
    }else throw new Error('Ação inválida.');
  }catch(error){
    post('error',{error:String(error?.message||error)});
  }
};