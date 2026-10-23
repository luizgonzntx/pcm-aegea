(function(root){
'use strict';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
function status(o){const a=upper(o.status).split(/\s+/);return a.includes('NEXE')?'notdone':a.includes('ENTE')?'done':a.includes('ENCE')?'closed':a.some(v=>v==='ABER'||v==='LIB')?'open':'other';}
const labels={done:'Ordens executadas',notdone:'Não executadas',closed:'Encerradas administrativamente',open:'Em aberto',other:'Outras situações'};
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
function date(v){if(!text(v))return '';if(typeof v==='number'){if(v<1||v>150000)throw Error('Data numérica inválida');return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);}let s=text(v).slice(0,10),m=s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(m)s=m[3]+'-'+m[2]+'-'+m[1];if(!validDate(s))throw Error('Data inválida: '+text(v));return s;}
function period(v,f){return validDate(v||'')&&(!f.from||v>=f.from)&&(!f.to||v<=f.to);}
function filter(data,f,cohort){const tags=new Set(data.systems.map(s=>s.tag));return data.orders.filter(o=>o.center==='PITE'&&tags.has(o.tag)&&(!f.tag||o.tag===f.tag)&&(!f.asset||o.asset===f.asset)&&(!f.type||o.type===f.type)&&period(o[cohort?'date':(f.dateField||'date')],f));}
function stats(rows){const s={total:rows.length,done:0,open:0,notdone:0,closed:0,other:0};rows.forEach(o=>s[status(o)]++);return s;}
function adherence(data,f){const rows=filter(data,f,true).filter(o=>text(o.plan)),done=rows.filter(o=>status(o)==='done'),within=done.filter(o=>period(o.start,f));return {total:rows.length,done:done.length,within:within.length,rate:rows.length?done.length/rows.length:null,withinRate:rows.length?within.length/rows.length:null};}
function rank(rows,orders,field){const ids=new Set(orders.filter(o=>status(o)==='done').map(o=>o.id)),map=new Map;for(const row of rows){const value=text(row[field]);if(!ids.has(row.order)||!value||upper(value)==='NÃO EXECUTAR'||upper(value)==='NAO EXECUTAR'||upper(row.cause)==='FALHA INEXISTENTE'||upper(row.problem)==='FALHA INEXISTENTE')continue;if(!map.has(value))map.set(value,new Set);map.get(value).add(row.order);}return [...map].map(([name,ids])=>({name,count:ids.size,ids:[...ids]})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));}
function timing(rows,asOf){const r={onTime:0,late:0,overdue:0,upcoming:0,unassessed:0,notdone:0,before:0,same:0,after:0,withoutComparison:0};
 for(const o of rows.filter(o=>text(o.plan))){const s=status(o);if(s==='done'){if(validDate(o.start||'')&&validDate(o.date||''))r[o.start<o.date?'before':o.start>o.date?'after':'same']++;else r.withoutComparison++;if(validDate(o.due||'')&&validDate(o.finished||''))r[o.finished<=o.due?'onTime':'late']++;else r.unassessed++;}else if(s==='open'&&validDate(o.due||''))r[o.due<asOf?'overdue':'upcoming']++;else if(s==='notdone')r.notdone++;else r.unassessed++;}return r;}
function dedupe(rows,key){const m=new Map;for(const r of rows){const id=text(r[key]);if(!id)throw Error('Registro sem identificador');if(m.has(id)&&JSON.stringify(m.get(id))!==JSON.stringify(r))throw Error('Registros divergentes para '+id);m.set(id,r);}return [...m.values()];}
const schemas={
 systems:['COD_INFORMACAO','NOME','COD_LATITUDE','COD_LONGITUDE'],
 orders:['Ordem','TAG Planta','Centro','Data de referência','Dta.início real','Data de entrada','Status do sistema','Plano de manutenção','Tipo de ordem'],
 items:['Ordem','Texto code causa','Texto code parte objeto','Texto de code para problema'],
 actions:['Ordem','Texto do código da medida']
};
function kind(headers){return Object.keys(schemas).find(k=>schemas[k].every(h=>headers.includes(h)));}
function normalize(tables,files){
 for(const k of Object.keys(schemas))if(!Array.isArray(tables[k])||!tables[k].length)throw Error('Planilha ausente ou vazia: '+k);
 const coord=(v,min,max)=>{let n=Number(text(v).replace(',','.'));if(!text(v)||!Number.isFinite(n)||n<min||n>max)throw Error('Latitude ou longitude inválida: '+text(v));return n;};
 const systems=dedupe(tables.systems.map(r=>({tag:text(r.COD_INFORMACAO),name:text(r.NOME),type:text(r.COD_ELEMENTO),lat:coord(r.COD_LATITUDE,-90,90),lng:coord(r.COD_LONGITUDE,-180,180),status:text(r.SITUACAO_OPERACIONAL),critical:text(r.CRITICIDADE),address:text(r.ENDERECO_LOGRADOURO),district:text(r.ENDERECO_BAIRRO),photo:text(r.FOTO_FACHADA)})),'tag');
 const tags=new Set(systems.map(s=>s.tag)),all=dedupe(tables.orders.map(r=>({id:text(r.Ordem),note:text(r.Nota),tag:text(r['TAG Planta']),center:upper(r.Centro),date:date(r['Data de referência']),start:date(r['Dta.início real']),created:date(r['Data de entrada']),due:date(r['Prazo programado']),finished:date(r['Conclusão real']),type:text(r['Tipo de ordem']),text:text(r['Texto breve']),status:text(r['Status do sistema']),equipment:text(r['Denominação do objeto técnico']),asset:text(r['TAG Ativo']),plan:text(r['Plano de manutenção']),priority:text(r['Texto prioridade'])})),'id');
 const orders=all.filter(o=>o.center==='PITE'&&tags.has(o.tag)),ids=new Set(orders.map(o=>o.id));if(!orders.length)throw Error('Nenhuma ordem de Águas de Teresina corresponde às instalações informadas.');
 const items=tables.items.map(r=>({order:text(r.Ordem),note:text(r.Nota),cause:text(r['Texto code causa']),problem:text(r['Texto de code para problema']),component:text(r['Texto code parte objeto']),item:text(r.Item)})).filter(r=>ids.has(r.order));
 const actions=tables.actions.map(r=>({order:text(r.Ordem),note:text(r.Nota),action:text(r['Texto do código da medida']),item:text(r.Medida)})).filter(r=>ids.has(r.order));
 return {systems,orders,items,actions,meta:{loadedAt:new Date().toISOString(),files,sourceOrders:all.length,excluded:all.length-orders.length,missingReference:orders.filter(o=>!o.date).length}};
}
const api={text,upper,status,labels,validDate,date,period,filter,stats,adherence,rank,timing,dedupe,schemas,kind,normalize};
if(typeof module!=='undefined')module.exports=api;root.PCM=api;
})(typeof globalThis!=='undefined'?globalThis:this);
