import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PATH = path.join(ROOT, 'data', 'stores.json');
const REPORT_PATH = path.join(ROOT, 'data', 'update-report.json');
const API_BASE = 'https://datos.gob.es/apidata/catalog/dataset';
const TERMS = ['Alicante comercio','Alicante locales','Alicante establecimientos','Alicante censo','Alicante actividades','Alicante mercados','Alicante gasolineras','Alicante farmacias'];
const ALLOWED_HOSTS = ['alicante.es','datosabiertos.alicante.es','datosabiertos.diputacionalicante.es','diputacionalicante.es','dadesobertes.gva.es','gva.es'];
const CATEGORY_RULES = [
  ['pharmacy', /\bfarmacia\b|\bparafarmacia\b/i],
  ['petrol', /\bgasolinera\b|\bestación de servicio\b|\bestacio de servei\b|\bcarburante\b/i],
  ['bakery', /\bpanadería\b|\bforn de pa\b|\bpastelería\b|\bbakery\b/i],
  ['vet', /\bveterinari\b|\bveterinario\b|\bclínica veterinaria\b/i],
  ['supermarket', /\bsupermercado\b|\bsupermercat\b|\balimentación\b|\bgrocery\b|\bhipermercado\b/i],
  ['hardware', /\bferretería\b|\bferreteria\b|\bbricolaje\b|\bherramientas\b/i],
  ['garden', /\bjardinería\b|\bvivero\b|\bviver\b|\bplantas\b/i],
  ['electronics', /\belectrónica\b|\binformática\b|\btelefonía\b/i],
  ['mall', /\bcentro comercial\b|\bcentre comercial\b|\bmercado\b/i]
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.label != null) return text(v.label);
    if (v.value != null) return text(v.value);
    if (v['@value'] != null) return text(v['@value']);
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
}
function norm(v) {
  return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' y ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b(s l|slu|sll|sa)\b/g,' ').replace(/\s+/g,' ').trim();
}
function slug(v) { return norm(v).replace(/\s+/g,'-').slice(0,80); }
function first(o, keys) {
  if (!o || typeof o !== 'object') return '';
  for (const k of keys) if (o[k] != null && text(o[k])) return text(o[k]);
  const map = new Map(Object.keys(o).map(k => [norm(k), k]));
  for (const k of keys) { const hit = map.get(norm(k)); if (hit && o[hit] != null && text(o[hit])) return text(o[hit]); }
  return '';
}
function walkObjects(v, out) {
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { for (const x of v) walkObjects(x, out); return out; }
  out.push(v); for (const x of Object.values(v)) walkObjects(x, out); return out;
}
function walkArrays(v, out) {
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { if (v.length && v.every(x => x && typeof x === 'object')) out.push(v); for (const x of v) walkArrays(x, out); return out; }
  for (const x of Object.values(v)) walkArrays(x, out);
  return out;
}
function datasets(payload) {
  return walkArrays(payload, []).flat().filter(x => x && typeof x === 'object' && (x.title || x.label || x._about || x.identifier || x.id));
}
function idOf(x) { return text(x._about || x.uri || x.identifier || x.id || x['@id'] || x.title); }
function blob(x) { return text(JSON.stringify(x)).toLowerCase(); }
function candidate(x) {
  const b = blob(x);
  const where = ALLOWED_HOSTS.some(h => b.includes(h)) || b.includes('alicante');
  const useful = /\blocales?\b|\bcomercio\b|\bcomerciales?\b|\bestablecimientos?\b|\bempresas?\b|\bactividades?\b|\bgasoliner|\bfarmaci|\bmercados?\b/.test(b);
  const location = /direcci[oó]n|address|coordenadas?|latitud|longitud|georreferenc|ubicaci[oó]n|mapa|calle/.test(b);
  const aggregateNoise = /explotaci[oó]n del directorio estad[ií]stico|series?\b|por sector|por tipo de empresa|n[uú]mero de locales/.test(b);
  return where && useful && location && !aggregateNoise;
}
function distributionUrls(item) {
  const found = new Set();
  for (const o of walkObjects(item, [])) {
    for (const k of Object.keys(o)) {
      const nk = norm(k);
      if (!['accessurl','downloadurl','url','uri'].includes(nk)) continue;
      const vals = Array.isArray(o[k]) ? o[k] : [o[k]];
      for (const v of vals) {
        const u = text(v);
        if (/^https?:\/\//i.test(u) && /\.(csv|json|geojson)(?:[?#].*)?$/i.test(u)) found.add(u);
      }
    }
  }
  return Array.from(found);
}
async function get(url, timeout, maxBytes) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout || 45000);
  try {
    const r = await fetch(url, { redirect:'follow', signal:c.signal, headers:{'user-agent':'OpenTodayAlicanteBot/1.2'} });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > (maxBytes || 25000000)) throw new Error('payload too large');
    return { text:b.toString('utf8'), contentType:r.headers.get('content-type') || '' };
  } finally { clearTimeout(t); }
}
function parseCsv(s) {
  const sample=s.slice(0,5000);
  const ds=[',',';','\t','|'].map(d => [d,(sample.match(new RegExp('\\'+d,'g'))||[]).length]).sort((a,b)=>b[1]-a[1]);
  const d=ds[0][1]?ds[0][0]:',', rows=[], row=[]; let cell='', q=false;
  for(let i=0;i<s.length;i++){const ch=s[i],n=s[i+1];if(ch==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(ch===d&&!q){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&n==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()!==''))rows.push(row);row.length=0;}else cell+=ch;}
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift().map((h,i)=>text(h)||'field_'+(i+1));
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}
function records(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.features)) return payload.features.map(f => Object.assign({},f.properties||{},{_geometry:f.geometry||null}));
  return walkArrays(payload, []).sort((a,b)=>b.length-a.length)[0] || [];
}
function coords(r) {
  if (r && r._geometry && r._geometry.type==='Point' && Array.isArray(r._geometry.coordinates)) {
    const lon=Number(r._geometry.coordinates[0]), lat=Number(r._geometry.coordinates[1]);
    if(lat>=35&&lat<=40.5&&lon>=-2.5&&lon<=1.5)return{lat,lng:lon};
  }
  const lat=Number(first(r,['lat','latitude','latitud']).replace(',','.'));
  const lng=Number(first(r,['lng','lon','longitude','longitud']).replace(',','.'));
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35&&lat<=40.5&&lng>=-2.5&&lng<=1.5)return{lat,lng};
  return{lat:null,lng:null};
}
function category(s){for(const [k,re] of CATEGORY_RULES)if(re.test(s))return k;return'other';}
function makeRecord(r,dataset,url) {
  const name=first(r,['nombre','name','denominacion','denominación','nom comercial','nom_comercial','comercio','establecimiento','empresa','titular','local']);
  const activity=first(r,['actividad','actividad principal','activitat','tipo','categoria','categoría','sector','descripcion','descripción']);
  const rawAddress=first(r,['direccion','dirección','address','domicilio','calle','via','vial','ubicacion','ubicación','adreca','adreça']);
  const postal=first(r,['codigo postal','código postal','cp','postal code','zipcode','codpostal']);
  const town=first(r,['municipio','municipi','localidad','localitat','poblacion','població','town','ciudad','municipality']) || 'Alicante';
  if(!name||name.length<3)return null;
  const c=coords(r), cat=category((name+' '+activity+' '+rawAddress+' '+town).trim());
  const phone=first(r,['telefono','teléfono','phone','movil','móvil','contacto']);
  const hoursText=first(r,['horario','horarios','hours','opening hours','opening_hours']);
  const week=hoursText.match(/(?:lunes|dilluns)[^\d]{0,30}(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/i);
  const sun=hoursText.match(/(?:domingo|diumenge)[^\d]{0,30}(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/i);
  const wh=week?[Number(week[1])+Number(week[2]||0)/60,Number(week[3])+Number(week[4]||0)/60]:null;
  const sh=sun?[Number(sun[1])+Number(sun[2]||0)/60,Number(sun[3])+Number(sun[4]||0)/60]:null;
  const source=text(dataset.title||dataset.label||'Alicante open data');
  return{
    id:'open-data-'+slug(name+'-'+town)+'-'+Date.now()+Math.random().toString(36).slice(2,7),
    slug:'open-data-'+slug(name+'-'+town)+'-'+Math.random().toString(36).slice(2,7),
    name,chain:'',town,townSlug:slug(town),address:[rawAddress,postal,town].filter(Boolean).join(', '),
    lat:c.lat,lng:c.lng,category:cat,
    weekOpenHour:wh?wh[0]:0,weekCloseHour:wh?wh[1]:0,sunOpenHour:sh?sh[0]:null,sunCloseHour:sh?sh[1]:null,isSundayOpen:Boolean(sh),
    holidayOpenNote:'Horario festivo específico no confirmado.',officialSource:source,sourceType:'official-open-data',sourceUrl:url,
    lastVerified:new Date().toISOString().slice(0,10),hoursVerified:Boolean(wh||sh),confirmations:0,phone:phone||null,
    descriptionES:'Registro procedente de '+source+'. La ubicación procede del conjunto de datos; el horario solo se marca como confirmado si la fuente lo publica de forma estructurada.',
    descriptionEN:'Record sourced from '+source+'. Location comes from the dataset; hours are only confirmed when published in structured form.',
    dataScope:'open-data',discoveryStatus:'official-open-data',locationStatus:c.lat!=null?'mapped':'pending',hoursStatus:(wh||sh)?'checked':'unconfirmed',
    verification:{sourceName:source,sourceUrl:url,sourceType:'official-open-data',verifiedAt:new Date().toISOString().slice(0,10),status:'official-open-data',hoursVerified:Boolean(wh||sh)},
    weeklyHours:(wh||sh)?Object.assign({},wh?{'1':wh}: {},sh?{'0':sh}:{}) : {}
  };
}
function dist(a,b){
  if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Infinity;
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function match(stores,r){
  const n=norm(r.name), a=norm(r.address), t=norm(r.town);
  for(const s of stores){
    if(norm(s.name)===n&&norm(s.address)===a)return s;
    if(norm(s.name)===n&&t&&norm(s.town)===t&&dist(s,r)<=0.18)return s;
  }
  return null;
}

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
const stats={discoveredDatasets:0,candidateDatasets:0,distributionsChecked:0,distributionsLoaded:0,recordsRead:0,recordsAccepted:0,added:0,enriched:0,errors:[]};
const datasetsMap=new Map();

for(const term of TERMS){
  for(let page=0;page<3;page++){
    const url=API_BASE+'/keyword/'+encodeURIComponent(term)+'.json?_pageSize=50&_page='+page;
    try{
      const result=await get(url,45000,15000000);
      for(const item of datasets(JSON.parse(result.text))){const id=idOf(item);if(id)datasetsMap.set(id,item);}
    }catch(e){stats.errors.push({stage:'catalog',term,page,error:String(e)});break;}
  }
  await sleep(300);
}
stats.discoveredDatasets=datasetsMap.size;

for(const ds of datasetsMap.values()){
  if(!candidate(ds))continue;
  stats.candidateDatasets++;
  const id=idOf(ds), label=text(ds.title||ds.label||'Alicante open data');
  let full=ds;
  try{
    if(id){
      const url=id.startsWith('http')?id:API_BASE+'/'+encodeURIComponent(id)+'.json';
      full=JSON.parse((await get(url,45000,10000000)).text);
    }
  }catch(_){}
  for(const url of distributionUrls(full).slice(0,8)){
    stats.distributionsChecked++;
    try{
      const result=await get(url,60000,25000000);
      const payload=/\.csv(?:[?#]|$)/i.test(url)||String(result.contentType).includes('csv')?parseCsv(result.text):JSON.parse(result.text);
      const rows=records(payload);
      stats.distributionsLoaded++;stats.recordsRead+=rows.length;
      for(const row of rows.slice(0,50000)){
        const rec=makeRecord(row,{title:label},url);
        if(!rec){continue;} stats.recordsAccepted++;
        const found=match(stores,rec);
        if(found){
          let changed=false;
          if(!Number.isFinite(found.lat)&&Number.isFinite(rec.lat)){found.lat=rec.lat;found.lng=rec.lng;found.locationStatus='mapped';changed=true;}
          if(!found.phone&&rec.phone){found.phone=rec.phone;changed=true;}
          if(rec.sourceUrl&&!found.verification?.sourceUrl){found.verification=Object.assign({},found.verification,{sourceUrl:rec.sourceUrl});found.sourceUrl=rec.sourceUrl;changed=true;}
          if(rec.hoursVerified&&found.hoursVerified===false){found.weeklyHours=rec.weeklyHours;found.weekOpenHour=rec.weekOpenHour;found.weekCloseHour=rec.weekCloseHour;found.sunOpenHour=rec.sunOpenHour;found.sunCloseHour=rec.sunCloseHour;found.isSundayOpen=rec.isSundayOpen;found.hoursVerified=true;found.hoursStatus='checked';changed=true;}
          if(changed)stats.enriched++;
        }else{stores.push(rec);stats.added++;}
      }
    }catch(e){stats.errors.push({stage:'distribution',dataset:label,url,error:String(e)});}
    await sleep(200);
  }
}
await fs.writeFile(DATA_PATH,JSON.stringify(stores,null,2)+'\n');
let previous={};try{previous=JSON.parse(await fs.readFile(REPORT_PATH,'utf8'));}catch(_){}
await fs.writeFile(REPORT_PATH,JSON.stringify({
  version:'11.0.0',checkedAt:new Date().toISOString(),status:stats.errors.length?'open-data-complete-with-review':'open-data-complete',
  automaticMode:'official-open-data-ingestion',note:'Discovered individual/location-oriented public datasets through datos.gob.es and accepted records from machine-readable CSV/JSON/GeoJSON distributions. Hours remain unconfirmed unless structured hours are published by the source.',
  openData:stats,previousReportStatus:previous.status||null
},null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
