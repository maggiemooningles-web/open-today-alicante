import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PATH = path.join(ROOT, 'data', 'stores.json');
const REPORT_PATH = path.join(ROOT, 'data', 'update-report.json');

const DGE_BASE = 'https://datos.gob.es/apidata/catalog';
const CKAN_SOURCES = [
  { id:'gva', base:'https://dadesobertes.gva.es/api/3/action', queries:[
    'Alicante comercio establecimientos',
    'Alicante locales comerciales',
    'Alicante empresas comercio',
    'Alicante gasolineras',
    'Alicante farmacias',
    'Alicante mercados'
  ]},
  { id:'alicante', base:'https://datosabiertos.alicante.es/api/3/action', queries:[
    'comercio',
    'establecimientos',
    'locales',
    'licencias',
    'mercados'
  ]}
];
const DGE_TITLE_QUERIES = [
  'Censo de locales comerciales y de ocio',
  'Directorio de establecimientos',
  'Comercio de proximidad',
  'Locales comerciales',
  'Establecimientos comerciales',
  'Gasolineras',
  'Farmacias',
  'Mercados'
];
const ALLOWED_HOSTS = [
  'alicante.es',
  'datosabiertos.alicante.es',
  'datosabiertos.diputacionalicante.es',
  'diputacionalicante.es',
  'dadesobertes.gva.es',
  'gva.es',
  'datos.gob.es'
];
const CATEGORY_RULES = [
  ['pharmacy',/\bfarmacia\b|\bparafarmacia\b/i],
  ['petrol',/\bgasolinera\b|\bestación de servicio\b|\bestacio de servei\b|\bcarburante\b/i],
  ['bakery',/\bpanadería\b|\bforn de pa\b|\bpastelería\b|\bbakery\b/i],
  ['vet',/\bveterinari\b|\bveterinario\b|\bclínica veterinaria\b/i],
  ['supermarket',/\bsupermercado\b|\bsupermercat\b|\balimentación\b|\bgrocery\b|\bhipermercado\b/i],
  ['hardware',/\bferretería\b|\bferreteria\b|\bbricolaje\b|\bherramientas\b/i],
  ['garden',/\bjardinería\b|\bvivero\b|\bviver\b|\bplantas\b/i],
  ['electronics',/\belectrónica\b|\binformática\b|\btelefonía\b/i],
  ['mall',/\bcentro comercial\b|\bcentre comercial\b|\bmercado\b/i]
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function text(v){if(v==null)return'';if(typeof v==='object'){return text(v.label??v.value??v['@value']??v['@id']??v.id??'');}return String(v).replace(/\s+/g,' ').trim();}
function norm(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' y ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b(s l|slu|sll|sa)\b/g,' ').replace(/\s+/g,' ').trim();}
function slug(v){return norm(v).replace(/\s+/g,'-').slice(0,80)||'local';}
function first(o,keys){if(!o||typeof o!=='object')return'';for(const k of keys)if(o[k]!=null&&text(o[k]))return text(o[k]);const map=new Map(Object.keys(o).map(k=>[norm(k),k]));for(const k of keys){const hit=map.get(norm(k));if(hit&&o[hit]!=null&&text(o[hit]))return text(o[hit]);}return'';}
function walkObjects(v,out=[]){if(!v||typeof v!=='object')return out;if(Array.isArray(v)){for(const x of v)walkObjects(x,out);return out;}out.push(v);for(const x of Object.values(v))walkObjects(x,out);return out;}
function findArrays(v,out=[]){if(!v||typeof v!=='object')return out;if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'))out.push(v);for(const x of v)findArrays(x,out);return out;}for(const x of Object.values(v))findArrays(x,out);return out;}
function datasetObjects(payload){
  const direct = payload?.result?.items || payload?.result?.results || payload?.items || payload?.results;
  if(Array.isArray(direct)) return direct;
  return findArrays(payload,[]).sort((a,b)=>b.length-a.length)[0]||[];
}
function maybeCandidate(item){
  const b=JSON.stringify(item||{}).toLowerCase();
  const useful=/local|comerc|establec|directorio|empresa|actividad|gasolin|farmaci|mercad|ocio|hostel/.test(b);
  const place=/alicante|provincia de alicante|comunitat valenciana|georrefer|direccion|address|latitud|longitud|geojson|coorden/.test(b);
  return useful&&place;
}
function urlsFromObject(item){
  const out=new Set();
  for(const o of walkObjects(item,[])){
    for(const [k,val] of Object.entries(o)){
      const nk=norm(k);
      if(!/accessurl|downloadurl|distrib|url|uri/.test(nk))continue;
      const vals=Array.isArray(val)?val:[val];
      for(const v of vals){
        const u=text(v);
        if(!/^https?:\/\//i.test(u))continue;
        if(ALLOWED_HOSTS.some(h=>u.includes(h)))out.add(u);
      }
    }
  }
  return [...out];
}
async function get(url,timeout=50000,maxBytes=30000000){
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'OpenTodayAlicanteBot/1.5 (+https://github.com/maggiemooningles-web/open-today-alicante)'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const b=Buffer.from(await r.arrayBuffer());
    if(b.length>maxBytes)throw new Error('payload too large');
    return{text:b.toString('utf8'),contentType:r.headers.get('content-type')||''};
  }finally{clearTimeout(tm);}
}
function parseCsv(s){
  const sample=s.slice(0,10000);
  const ds=[',',';','\t','|'].map(d=>[d,(sample.match(new RegExp('\\\\'+d,'g'))||[]).length]).sort((a,b)=>b[1]-a[1]);
  const d=ds[0][1]?ds[0][0]:',', rows=[], row=[]; let cell='',q=false;
  for(let i=0;i<s.length;i++){const ch=s[i],n=s[i+1];if(ch==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(ch===d&&!q){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&n==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()!==''))rows.push(row);row.length=0;}else cell+=ch;}
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(!rows.length)return[];
  const headers=rows.shift().map((h,i)=>text(h)||'field_'+(i+1));
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}
function records(payload){
  if(Array.isArray(payload))return payload;
  if(payload&&Array.isArray(payload.features))return payload.features.map(f=>Object.assign({},f.properties||{},{_geometry:f.geometry||null}));
  const a=findArrays(payload,[]).sort((x,y)=>y.length-x.length)[0]||[];
  return a;
}
function coords(r){
  if(r?._geometry?.type==='Point'&&Array.isArray(r._geometry.coordinates)){
    const lng=Number(r._geometry.coordinates[0]),lat=Number(r._geometry.coordinates[1]);
    if(lat>=35&&lat<=40.5&&lng>=-2.5&&lng<=1.5)return{lat,lng};
  }
  const lat=Number(first(r,['lat','latitude','latitud']).replace(',','.'));
  const lng=Number(first(r,['lng','lon','longitude','longitud']).replace(',','.'));
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35&&lat<=40.5&&lng>=-2.5&&lng<=1.5)return{lat,lng};
  return{lat:null,lng:null};
}
function category(s){for(const[k,re]of CATEGORY_RULES)if(re.test(s))return k;return'other';}
function makeRecord(r,dataset,url){
  const name=first(r,['nombre','name','denominacion','denominación','nom comercial','nom_comercial','comercio','establecimiento','empresa','titular','local']);
  const activity=first(r,['actividad','actividad principal','activitat','tipo','categoria','categoría','sector','descripcion','descripción']);
  const rawAddress=first(r,['direccion','dirección','address','domicilio','calle','via','vial','ubicacion','ubicación','adreca','adreça']);
  const postal=first(r,['codigo postal','código postal','cp','postal code','zipcode','codpostal']);
  const town=first(r,['municipio','municipi','localidad','localitat','poblacion','població','town','ciudad','municipality'])||'Alicante';
  if(!name||name.length<3)return null;
  const c=coords(r),cat=category((name+' '+activity+' '+rawAddress+' '+town).trim());
  const phone=first(r,['telefono','teléfono','phone','movil','móvil','contacto']);
  const source=text(dataset.title||dataset.name||dataset.label||'Official open data');
  return{
    id:'open-data-'+slug(name+'-'+town),
    slug:'open-data-'+slug(name+'-'+town),
    name,chain:'',town,townSlug:slug(town),address:[rawAddress,postal,town].filter(Boolean).join(', '),
    lat:c.lat,lng:c.lng,category:cat,
    weekOpenHour:0,weekCloseHour:0,sunOpenHour:null,sunCloseHour:null,isSundayOpen:null,
    holidayOpenNote:'Horario festivo específico no confirmado.',
    officialSource:source,sourceType:'official-open-data',sourceUrl:url,
    lastVerified:new Date().toISOString().slice(0,10),hoursVerified:false,confirmations:0,phone:phone||null,
    descriptionES:'Registro procedente de '+source+'. La ubicación procede del conjunto de datos; el horario no se considera confirmado salvo que la fuente lo publique estructuradamente.',
    descriptionEN:'Record sourced from '+source+'. Location comes from the dataset; opening hours are not treated as confirmed unless the source publishes them structurally.',
    dataScope:'open-data',discoveryStatus:'official-open-data',locationStatus:c.lat!=null?'mapped':'pending',hoursStatus:'unconfirmed',
    verification:{sourceName:source,sourceUrl:url,sourceType:'official-open-data',verifiedAt:new Date().toISOString().slice(0,10),status:'official-open-data',hoursVerified:false},
    weeklyHours:null
  };
}
function dist(a,b){
  if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Infinity;
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180,z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function match(stores,r){
  const n=norm(r.name),a=norm(r.address),t=norm(r.town);
  for(const s of stores){
    if(norm(s.name)===n&&norm(s.address)===a)return s;
    if(norm(s.name)===n&&t&&norm(s.town)===t&&dist(s,r)<=0.18)return s;
  }
  return null;
}
async function searchDge(pathName,value){
  const url=DGE_BASE+'/dataset/'+pathName+'/'+encodeURIComponent(value)+'.json?_pageSize=50&_page=0';
  try{return JSON.parse((await get(url,45000,20000000)).text);}catch(_){return null;}
}
async function searchCkan(source,q){
  const url=source.base+'/package_search?q='+encodeURIComponent(q)+'&rows=50';
  try{return JSON.parse((await get(url,45000,15000000)).text);}catch(_){return null;}
}
async function packageResources(pkg){
  const out=[];
  for(const r of pkg?.resources||[]){
    const u=text(r.url||r.download_url||r.access_url);
    if(/^https?:\/\//i.test(u))out.push({url:u,title:text(r.name||r.description||pkg.title||''),host:'ckan'});
  }
  return out;
}

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
const stats={catalogQueries:0,discoveredDatasets:0,candidateDatasets:0,distributionsChecked:0,distributionsLoaded:0,recordsRead:0,recordsAccepted:0,added:0,enriched:0,errors:[]};
const datasetsMap=new Map();

for(const title of DGE_TITLE_QUERIES){
  stats.catalogQueries++;
  const p=await searchDge('title',title);
  for(const x of datasetObjects(p)) {
    const id=text(x._about||x.uri||x.identifier||x.id||x['@id']||x.title);
    if(id)datasetsMap.set(id,x);
  }
  await sleep(250);
}
for(const source of CKAN_SOURCES){
  for(const q of source.queries){
    stats.catalogQueries++;
    const p=await searchCkan(source,q);
    for(const x of p?.result?.results||[]){
      const id=text(x.id||x.name||x.title);
      if(id)datasetsMap.set(source.id+':'+id,{...x,title:text(x.title||x.name),_ckan:true});
    }
    await sleep(250);
  }
}
stats.discoveredDatasets=datasetsMap.size;

for(const ds of datasetsMap.values()){
  if(ds._ckan ? !maybeCandidate(ds) : !maybeCandidate(ds)) continue;
  stats.candidateDatasets++;
  let urls=urlsFromObject(ds);
  if(ds._ckan) urls=await packageResources(ds);
  const label=text(ds.title||ds.name||ds.label||'Official open data');
  for(const item of urls.slice(0,12)){
    const url=ds._ckan ? item.url : item;
    if(!ALLOWED_HOSTS.some(h=>url.includes(h)))continue;
    stats.distributionsChecked++;
    try{
      const result=await get(url,60000,30000000);
      let payload;
      if(/\bcsv\b/i.test(result.contentType)||/\.csv(?:[?#]|$)/i.test(url))payload=parseCsv(result.text);
      else if(/\bjson\b|\bgeojson\b/i.test(result.contentType)||/\.json(?:[?#]|$)/i.test(url)||/\.geojson(?:[?#]|$)/i.test(url))payload=JSON.parse(result.text);
      else continue;
      const rows=records(payload);
      stats.distributionsLoaded++;stats.recordsRead+=rows.length;
      for(const row of rows.slice(0,75000)){
        const rec=makeRecord(row,{title:label},url);
        if(!rec)continue;
        stats.recordsAccepted++;
        const found=match(stores,rec);
        if(found){
          let changed=false;
          if(!Number.isFinite(found.lat)&&Number.isFinite(rec.lat)){found.lat=rec.lat;found.lng=rec.lng;found.locationStatus='mapped';changed=true;}
          if(!found.phone&&rec.phone){found.phone=rec.phone;changed=true;}
          if(rec.sourceUrl&&!found.verification?.sourceUrl){found.verification=Object.assign({},found.verification,{sourceUrl:rec.sourceUrl});found.sourceUrl=rec.sourceUrl;changed=true;}
          if(changed)stats.enriched++;
        }else{
          stores.push(rec);stats.added++;
        }
      }
    }catch(e){stats.errors.push({dataset:label,url,error:String(e)});}
    await sleep(200);
  }
}
await fs.writeFile(DATA_PATH,JSON.stringify(stores,null,2)+'\n');
let previous={};try{previous=JSON.parse(await fs.readFile(REPORT_PATH,'utf8'));}catch(_){}
await fs.writeFile(REPORT_PATH,JSON.stringify(Object.assign({},previous,{
  version:'12.0.0',
  checkedAt:new Date().toISOString(),
  status:stats.errors.length?'open-data-complete-with-review':'open-data-complete',
  automaticMode:'official-open-data-ingestion-v2',
  note:'Searches the Spanish open-data catalogue plus Generalitat/Alicante CKAN-style catalogs for location-oriented machine-readable datasets. Official counts are not converted into fictional individual businesses.',
  openData:stats
}),null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
