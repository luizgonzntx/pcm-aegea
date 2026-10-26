importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','core.js?v=20261026-2');
onmessage=async ({data:files})=>{
try{
 const tables={},names=[];
 for(const f of files){
  postMessage({progress:'Lendo '+f.name+'…'});
  const book=XLSX.read(f.buffer,{type:'array',dense:true,cellDates:false,cellStyles:false,cellHTML:false,cellNF:false});
  let matched=false;
  const inspected=[];
  for(const sheetName of book.SheetNames){
   const sheet=book.Sheets[sheetName],matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
   const headerRow=matrix.slice(0,20).findIndex(row=>PCM.kind(Array.from(row,PCM.text)));
   if(headerRow<0){
    inspected.push(sheetName+': '+matrix.slice(0,5).map(row=>Array.from(row,PCM.text).filter(Boolean).join(' | ')).filter(Boolean).join(' / '));
    continue;
   }
   const headers=Array.from(matrix[headerRow],PCM.text),kind=PCM.kind(headers);
   if(tables[kind])throw Error('Mais de uma planilha para '+kind+'. Envie um conjunto completo sem sobreposição.');
   const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',range:headerRow});
   tables[kind]=rows.map(row=>Object.fromEntries(Object.entries(row).map(([header,value])=>[PCM.canonicalHeader(header),value])));
   matched=true;
  }
  if(!matched)throw Error('Cabeçalhos não reconhecidos: '+f.name+'. Cabeçalhos lidos: '+inspected.join(' || ').slice(0,1200));
  names.push(f.name);
 }
 postMessage({result:PCM.normalize(tables,names)});
}catch(e){postMessage({error:e.message});}};