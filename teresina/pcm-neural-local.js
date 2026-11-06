(function(root){
'use strict';
// Execucao local e privada da TextCNN do PCM Neural V2. Nao envia pesos nem QUEST a servidores.
let pack=null,weights=null,index=null;
const txt=x=>String(x==null?'':x);
function decode64(s){
  if(typeof atob==='function'){
    const binary=atob(s),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }
  if(typeof Buffer!=='undefined'){
    const b=Buffer.from(s,'base64');
    return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  }
  throw Error('Decodificador base64 indisponivel');
}
function status(){return {connected:!!pack,orders:pack?Object.keys(pack.dossiers).length:0,version:pack?.origin||''};}
function loadObject(input){
  if(!input||input.format!=='pcm-neural-browser-v1'||!input.model||!input.dossiers)throw Error('Pacote invalido. Selecione PCM_Neural_V2_Modelo_Local.json.');
  const model=input.model;
  if(!Array.isArray(model.vocab)||model.vocab.length<20||!model.weights)throw Error('Modelo incompleto.');
  const w={};
  for(const [key,value] of Object.entries(model.weights))w[key]=decode64(value);
  if(w['emb.weight']?.length!==model.vocab.length*96||w['convs.0.weight']?.length!==128*96*3||w['body.0.weight']?.length!==256*384||w['swap.weight']?.length!==4*256||w['outcome.weight']?.length!==4*256)throw Error('Dimensoes incompativeis.');
  pack=input;weights=w;index=new Map(model.vocab.map((v,i)=>[v,i]));
  return status();
}
async function loadFile(file){
  if(!file||file.size>65_000_000)throw Error('Arquivo maior que 65 MB.');
  return loadObject(JSON.parse(await file.text()));
}
function predict(source){
  if(!pack||!weights)throw Error('Modelo nao carregado.');
  const ids=Array.from(txt(source).toLowerCase()).slice(0,pack.model.max_chars||640).map(c=>index.get(c)??1);
  if(!ids.length)throw Error('Texto vazio.');
  const emb=weights['emb.weight'],feat=new Float32Array(384),n=ids.length;
  let offset=0;
  for(let ci=0;ci<3;ci++){
    const k=[3,5,7][ci],pad=k>>1,W=weights['convs.'+ci+'.weight'],bias=weights['convs.'+ci+'.bias'];
    for(let o=0;o<128;o++){
      let max=0;const base=o*96*k;
      for(let p=0;p<n;p++){
        let sum=bias[o];
        for(let t=0;t<k;t++){
          const pos=p+t-pad;if(pos<0||pos>=n)continue;
          const id=ids[pos];if(!id)continue;
          const ei=id*96;let wi=base+t;
          for(let d=0;d<96;d++,wi+=k)sum+=emb[ei+d]*W[wi];
        }
        if(sum>max)max=sum;
      }
      feat[offset++]=max;
    }
  }
  const hidden=new Float32Array(256),W=weights['body.0.weight'],B=weights['body.0.bias'];
  for(let o=0;o<256;o++){
    let sum=B[o],base=o*384;
    for(let i=0;i<384;i++)sum+=W[base+i]*feat[i];
    hidden[o]=Math.max(0,sum);
  }
  function head(name){
    const ww=weights[name+'.weight'],bb=weights[name+'.bias'],logits=new Float32Array(4);
    for(let o=0;o<4;o++){
      let sum=bb[o];for(let i=0;i<256;i++)sum+=ww[o*256+i]*hidden[i];logits[o]=sum;
    }
    const mx=Math.max(...logits),exps=Array.from(logits,x=>Math.exp(x-mx)),total=exps.reduce((a,b)=>a+b,0);
    return exps.map(x=>x/total);
  }
  const swap=head('swap'),outcome=head('outcome'),top=a=>a.indexOf(Math.max(...a));
  return {swap:pack.model.labels_swap[top(swap)],outcome:pack.model.labels_outcome[top(outcome)],swapScore:swap[top(swap)],outcomeScore:outcome[top(outcome)]};
}
function dossierFor(order){return pack?.dossiers?.[txt(order)]||null;}
function classifyOrder(order){
  const d=dossierFor(order);if(!d)return null;
  const quest=(d.quest||[]).slice(0,5).map(x=>x.texto).join(' ').slice(0,1000);
  const note=(d.notes||[]).slice(0,2).join(' ').slice(0,220);
  const source=('TEXTO PADRÃO: '+txt(d.brief).slice(0,200)+' | QUEST: '+quest+' | NOTA: '+note+' | ICM: ').slice(0,1400);
  return {order:txt(order),dossier:d,classification:predict(source),source};
}
const api={loadObject,loadFile,status,predict,dossierFor,classifyOrder};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.PCM_NEURAL_LOCAL=api;
})(typeof globalThis!=='undefined'?globalThis:this);