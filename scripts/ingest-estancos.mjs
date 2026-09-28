import fs from 'node:fs/promises';

const DATA_PATH = new URL('../data/stores.json', import.meta.url);
const REPORT_PATH = new URL('../data/update-report.json', import.meta.url);

const CMT_URL = 'https://serviciostelematicosext.hacienda.gob.es/CMT/Visor/csvExpendedurias.aspx';

function clean(v='') {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}
function norm(v='') {
  return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' y ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function slug(v='') {
  return norm(v).replace(/\s+/g,'-').slice(0,80) || 'estanco';
}
function headerKey(v='') {
  return norm(v).replace(/\b(numero|num|n)\b/g,'num').trim();
}
function first(row, keys) {
  const exact = new Map(Object.keys(row).map(k => [headerKey(k), k]));
  for (const key of keys) {
    const hit = exact.get(headerKey(key));
    if (hit && clean(row[hit])) return clean(row[hit]);
  }
  return '';
}
function parseCsv(text) {
  const sample = text.slice(0,12000);
  const candidates = [';',',','\\t','|'].map(x => [x, (sample.split(x).length - 1)]).sort((a,b)=>b[1]-a[1]);
  const delimiter = candidates[0][1] > 0 ? candidates[0][0] : ';';
  const rows = [], row = [];
  let cell = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const ch=text[i], next=text[i+1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell); cell='';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell='';
      if (row.some(v => clean(v))) rows.push([...row]);
      row.length=0;
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(v => clean(v))) rows.push([...row]);
  }
  if (!rows.length) return [];
  const headers=rows.shift().map((h,i)=>clean(h) || 'field_'+(i+1));
  return rows.map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i] ?? ''])));
}
function coord(row) {
  const lat=Number(first(row,['latitud','latitude','lat','y']).replace(',','.'));
  const lng=Number(first(row,['longitud','longitude','lng','lon','x']).replace(',','.'));
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35&&lat<=40.8&&lng>=-2.5&&lng<=1.5) return {lat,lng};
  return {lat:null,lng:null};
}
function distance(a,b) {
  if (![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return Infinity;
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function isAlicante(row) {
  const province=norm(first(row,['provincia','province','provincia de residencia','provincia expendeduria']));
  const municipality=norm(first(row,['municipio','municipi','localidad','localitat','poblacion','población']));
  return !province || /\balicante\b|\balacant\b/.test(province) || /\balicante\b|\balacant\b/.test(municipality);
}
function makeRecord(row) {
  if(!isAlicante(row)) return null;
  const number=first(row,['numero','número','num','nº','n']);
  const name=first(row,['denominacion','denominación','nombre','nombre expendeduria','nombre expendeduría','expendeduria','expendeduría','razon social','razón social']);
  const municipality=first(row,['municipio','municipi','localidad','localitat','poblacion','población']) || 'Alicante';
  const street=first(row,['direccion','dirección','domicilio','calle','via','vial','direccion expendeduria','dirección expendeduría']);
  const postal=first(row,['codigo postal','código postal','cp','codpostal','postal code']);
  const phone=first(row,['telefono','teléfono','phone']);
  const c=coord(row);
  const label=name || (number ? `Estanco nº ${number}` : 'Estanco');
  const address=[street,postal,municipality].filter(Boolean).join(', ');
  if(address.length<4) return null;
  return {
    id:'cmt-estanco-'+slug(label+' '+address),
    slug:'estanco-'+slug(label+' '+address),
    name:label,
    chain:'',
    town:municipality,
    townSlug:slug(municipality),
    address,
    lat:c.lat,
    lng:c.lng,
    category:'tobacco',
    weekOpenHour:0,
    weekCloseHour:0,
    sunOpenHour:null,
    sunCloseHour:null,
    isSundayOpen:null,
    holidayOpenNote:'Horario festivo específico no confirmado.',
    officialSource:'Comisionado para el Mercado de Tabacos — listado de expendedurías',
    sourceType:'official-open-data',
    sourceUrl:CMT_URL,
    lastVerified:new Date().toISOString().slice(0,10),
    hoursVerified:false,
    confirmations:0,
    phone:phone || null,
    descriptionES:'Expendeduría incluida en el listado oficial del Comisionado para el Mercado de Tabacos. El listado no se usa para confirmar horarios de apertura.',
    descriptionEN:'Tobacco shop included in the official Spanish tobacco-market registry. The registry is not used to confirm opening hours.',
    dataScope:'official-registry',
    discoveryStatus:'official-registry',
    locationStatus:c.lat!=null?'mapped':'pending',
    hoursStatus:'unconfirmed',
    verification:{
      sourceName:'Comisionado para el Mercado de Tabacos — listado de expendedurías',
      sourceUrl:CMT_URL,
      sourceType:'official-open-data',
      verifiedAt:new Date().toISOString().slice(0,10),
      status:'official-registry',
      hoursVerified:false
    },
    weeklyHours:null
  };
}
function match(stores, r) {
  const rn=norm(r.name), ra=norm(r.address), rt=norm(r.town);
  for(const s of stores) {
    if(norm(s.name)===rn && norm(s.address)===ra) return s;
    if(rn && norm(s.name)===rn && rt && norm(s.town)===rt && distance(s,r)<=0.18) return s;
    if(Number.isFinite(r.lat)&&Number.isFinite(r.lng)&&Number.isFinite(s.lat)&&Number.isFinite(s.lng) && distance(s,r)<=0.05 && /estanc|tobacco|tabaco/i.test(s.name)) return s;
  }
  return null;
}

const response=await fetch(CMT_URL,{
  headers:{'user-agent':'OpenTodayAlicanteBot/1.6 (+https://github.com/maggiemooningles-web/open-today-alicante)'},
  redirect:'follow'
});
if(!response.ok) throw new Error('CMT HTTP '+response.status);
const bytes=new Uint8Array(await response.arrayBuffer());
const text=new TextDecoder('windows-1252').decode(bytes);
const rows=parseCsv(text);

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
const stats={source:CMT_URL,rowsRead:rows.length,accepted:0,added:0,enriched:0};
for(const row of rows) {
  const rec=makeRecord(row);
  if(!rec) continue;
  stats.accepted++;
  const hit=match(stores,rec);
  if(hit) {
    let changed=false;
    if(hit.category!=='tobacco') { hit.category='tobacco'; changed=true; }
    if(!Number.isFinite(hit.lat)&&Number.isFinite(rec.lat)) { hit.lat=rec.lat; hit.lng=rec.lng; hit.locationStatus='mapped'; changed=true; }
    if(!hit.phone && rec.phone) { hit.phone=rec.phone; changed=true; }
    if(!hit.sourceUrl) { hit.sourceUrl=CMT_URL; changed=true; }
    hit.sources=Array.from(new Set([...(Array.isArray(hit.sources)?hit.sources:[]),CMT_URL])).slice(0,10);
    hit.verification=Object.assign({},hit.verification,{sourceName:rec.officialSource,sourceUrl:CMT_URL,sourceType:'official-open-data',verifiedAt:rec.lastVerified,status:'official-registry',hoursVerified:false});
    if(changed) stats.enriched++;
  } else {
    stores.push(rec);
    stats.added++;
  }
}
await fs.writeFile(DATA_PATH,JSON.stringify(stores,null,2)+'\n');
let report={}; try { report=JSON.parse(await fs.readFile(REPORT_PATH,'utf8')); } catch (_) {}
report.checkedAt=new Date().toISOString();
report.estancos=stats;
report.dataset=report.dataset||{};
report.dataset.totalRecords=stores.length;
report.dataset.sourceTypes=stores.reduce((a,x)=>(a[x.sourceType||'unknown']=(a[x.sourceType||'unknown']||0)+1,a),{});
await fs.writeFile(REPORT_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(stats));
