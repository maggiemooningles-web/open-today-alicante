import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PATH = path.join(ROOT, 'data', 'stores.json');
const REPORT_PATH = path.join(ROOT, 'data', 'update-report.json');

const SOURCES = [
  { id:'consum', name:'Consum · Supermercados Alicante', url:'https://www.consum.es/supermercados/alicante/', category:'supermarket', listing:'detailLinks', patterns:[/https?:\/\/www\.consum\.es\/supermercados\/[^"' ]+/gi] },
  { id:'carrefour', name:'Carrefour · Tiendas Alicante', url:'https://www.carrefour.es/tiendas-carrefour/comunidad-valenciana/alicante/', category:'supermarket', listing:'detailLinks', patterns:[/https?:\/\/www\.carrefour\.es\/tiendas-carrefour\/[^"' ]+/gi] },
  { id:'dia', name:'DIA · Tiendas Alicante', url:'https://www.dia.es/tiendas/buscador-tiendas/alicante', category:'supermarket', listing:'detailLinks', patterns:[/https?:\/\/www\.dia\.es\/tiendas\/buscador-tiendas\/alicante\/[^"' ]+/gi] },
  { id:'repsol', name:'Repsol · Estaciones Alicante', url:'https://www.repsol.es/buscador-eess-y-puntos-de-recarga/alicante/', category:'petrol', listing:'detailLinks', patterns:[/https?:\/\/www\.repsol\.es\/buscador-eess-y-puntos-de-recarga\/alicante\/[^"' ]+/gi] },
  { id:'dialprix', name:'Dialprix · Centros', url:'https://dialprix.es/supermercados/', category:'supermarket', listing:'jsonld' },
  { id:'masymas', name:'masymas · Localizador', url:'https://www.masymas.com/localizadordetiendas/localizador.php', category:'supermarket', listing:'jsonld' },
  { id:'hiperber', name:'Hiperber · Centros', url:'https://hiperber.com/supermercados-hiperber/', category:'supermarket', listing:'jsonld' },
  { id:'moeve', name:'Moeve · Gasolineras Alicante', url:'https://www.moeve.es/es/cerca-de-ti/gasolineras/alicante/profesionales-moeve-pro-direct-cerca-de-mi', category:'petrol', listing:'jsonld' },
  { id:'lidl', name:'Lidl · Tiendas Alicante', url:'https://www.lidl.es/s/es-ES/tiendas/', category:'supermarket', listing:'jsonld' },
  { id:'aldi', name:'ALDI · Tiendas', url:'https://www.aldi.es/supermercados/encuentra-tu-supermercado.html/l/m', category:'supermarket', listing:'jsonld' },
  { id:'unide', name:'UNIDE · Localizador de tiendas', url:'https://tu.unidesupermercados.es/establecimientos/', category:'supermarket', listing:'jsonld' }
];

function clean(v='') { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function norm(v='') {
  return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^0-9\p{L}]+/gu,' ').replace(/\b(s l|slu|sll|sa)\b/g,' ').replace(/\s+/g,' ').trim();
}
function slug(v='') { return norm(v).replace(/\s+/g,'-').slice(0,80) || 'local'; }

function decode(v='') {
  return String(v)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#039;|&#x27;/gi,"'")
    .replace(/&apos;/gi,"'")
    .replace(/&#(\d+);/g, (_,n)=>String.fromCharCode(Number(n)));
}
function strip(html='') {
  return decode(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/h[1-6])\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' '));
}
function jsonld(html='') {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const root = JSON.parse(m[1].trim());
      const stack = Array.isArray(root) ? [...root] : [root];
      while (stack.length) {
        const x = stack.pop();
        if (!x || typeof x !== 'object') continue;
        if (Array.isArray(x)) stack.push(...x);
        if (x['@graph']) stack.push(...(Array.isArray(x['@graph']) ? x['@graph'] : [x['@graph']]));
        if (x.itemListElement) stack.push(...(Array.isArray(x.itemListElement) ? x.itemListElement : [x.itemListElement]));
        if (x.item && typeof x.item === 'object') stack.push(x.item);
        if (x['@type']) out.push(x);
      }
    } catch (_) {}
  }
  return out;
}
function addr(a) {
  if (!a) return '';
  if (typeof a === 'string') return clean(a);
  return [a.streetAddress,a.postalCode,a.addressLocality,a.addressRegion].filter(Boolean).map(clean).join(', ');
}
function geo(g) {
  const lat = Number(g?.latitude), lng = Number(g?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? {lat,lng} : {lat:null,lng:null};
}
function parseTime(v='') {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(clean(v));
  return m ? Number(m[1]) + Number(m[2] || 0)/60 : null;
}
function pushHour(out, idx, open, close) {
  const a = parseTime(open), b = parseTime(close);
  if (a != null && b != null) out[idx] = [a,b];
}
function hoursFromSpec(specs) {
  const out = {}, map = {Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:0};
  if (!Array.isArray(specs)) return out;
  for (const x of specs) {
    const days = Array.isArray(x.dayOfWeek) ? x.dayOfWeek : [x.dayOfWeek];
    for (const day of days) {
      const d = String(day || '').split('/').pop();
      const idx = map[d];
      if (idx == null) continue;
      pushHour(out, idx, x.opens, x.closes);
    }
  }
  return out;
}
function hoursFromStrings(values) {
  const out = {};
  const list = Array.isArray(values) ? values : [values];
  const dayMap = [
    [1,/^(?:Mo|Mon|Monday)/i],[2,/^(?:Tu|Tue|Tuesday)/i],[3,/^(?:We|Wed|Wednesday)/i],
    [4,/^(?:Th|Thu|Thursday)/i],[5,/^(?:Fr|Fri|Friday)/i],[6,/^(?:Sa|Sat|Saturday)/i],[0,/^(?:Su|Sun|Sunday)/i]
  ];
  for (const raw of list) {
    const s = clean(raw);
    const m = /^([A-Za-z]+)\s*(?:[-–]\s*([A-Za-z]+))?\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(s);
    if (!m) continue;
    const start = dayMap.find(x=>x[1].test(m[1]));
    if (!start) continue;
    pushHour(out, start[0], m[3], m[4]);
    if (m[2]) {
      const end = dayMap.find(x=>x[1].test(m[2]));
      if (end) {
        let d = start[0];
        while (d !== end[0]) {
          d = (d + 1) % 7;
          pushHour(out, d, m[3], m[4]);
        }
      }
    }
  }
  return out;
}
function hoursForEntity(x) {
  const a = hoursFromSpec(x.openingHoursSpecification);
  const b = hoursFromStrings(x.openingHours);
  return Object.assign({}, b, a);
}
function typeText(x) {
  return Array.isArray(x?.['@type']) ? x['@type'].join(' ') : String(x?.['@type'] || '');
}
function makeRecord(x, src) {
  const type = typeText(x);
  if (!/LocalBusiness|Store|Grocery|GasStation|Pharmacy|Veterinary|Medical|Bakery|ShoppingCenter|FoodEstablishment/i.test(type)) return null;
  const name = clean(x.name);
  const address = addr(x.address);
  if (!name || name.length < 3 || !address) return null;
  const g = geo(x.geo);
  const h = hoursForEntity(x);
  const firstWeek = h[1] || h[2] || h[3] || h[4] || h[5] || h[6] || null;
  const town = clean(x.address?.addressLocality || 'Alicante');
  const canonical = norm(name) + '|' + norm(address);
  return {
    canonical,
    id: 'first-party-' + slug(src.id+' '+name+' '+address),
    slug: 'first-party-' + slug(name+' '+address),
    name,
    chain: src.id === 'consum' ? 'Consum' : src.id === 'carrefour' ? 'Carrefour' : src.id === 'dia' ? 'DIA' : src.id === 'repsol' ? 'Repsol' : src.id === 'dialprix' ? 'Dialprix' : src.id === 'masymas' ? 'masymas' : src.id === 'hiperber' ? 'Hiperber' : src.id === 'moeve' ? 'Moeve' : '',
    town,
    townSlug: slug(town),
    address,
    lat:g.lat,
    lng:g.lng,
    category:src.category,
    weekOpenHour:firstWeek ? firstWeek[0] : 0,
    weekCloseHour:firstWeek ? firstWeek[1] : 0,
    sunOpenHour:h[0]?.[0] ?? null,
    sunCloseHour:h[0]?.[1] ?? null,
    isSundayOpen:Boolean(h[0]),
    holidayOpenNote:'Horario festivo específico no confirmado.',
    officialSource:src.name,
    sourceType:'official-locator',
    sourceUrl:src.url,
    lastVerified:new Date().toISOString().slice(0,10),
    hoursVerified:Object.keys(h).length > 0,
    confirmations:0,
    phone:clean(x.telephone || '') || null,
    website:clean(x.url || '') || null,
    descriptionES:'Ficha localizada en el directorio oficial de '+src.name+'.',
    descriptionEN:'Listing found in the official '+src.name+' directory.',
    dataScope:'first-party',
    locationStatus:g.lat != null ? 'mapped' : 'pending',
    hoursStatus:Object.keys(h).length ? 'checked' : 'unconfirmed',
    verification:{sourceName:src.name,sourceUrl:src.url,sourceType:'official-locator',verifiedAt:new Date().toISOString().slice(0,10),status:'official-locator',hoursVerified:Object.keys(h).length > 0},
    weeklyHours:h
  };
}
function linksFromHtml(html, patterns=[]) {
  const out = new Set();
  for (const re of patterns) for (const hit of (html.match(re) || [])) {
    let u = decode(hit).replace(/&amp;/g,'&').trim().replace(/[),.;]+$/,'');
    if (/^https?:\/\//i.test(u)) out.add(u);
  }
  return [...out];
}
function uniqueRecords(rows) {
  const m = new Map();
  for (const r of rows) if (r) m.set(r.canonical, r);
  return [...m.values()];
}
function distance(a,b) {
  if (![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return Infinity;
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function match(stores, r) {
  const an=norm(r.name), aa=norm(r.address), at=norm(r.town);
  for (const x of stores) {
    if (norm(x.name)===an && norm(x.address)===aa) return x;
    if (norm(x.name)===an && at && norm(x.town)===at && distance(x,r)<=0.18) return x;
  }
  return null;
}
async function fetchText(url, timeout=50000) {
  const c=new AbortController(), tm=setTimeout(()=>c.abort(),timeout);
  try {
    const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'OpenTodayAlicanteBot/1.5 (+https://github.com/maggiemooningles-web/open-today-alicante)'}});
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.text();
  } finally { clearTimeout(tm); }
}
async function mapLimit(items, limit, worker) {
  const out=[], queue=[...items];
  const runners=Array.from({length:Math.min(limit,queue.length)}, async ()=>{
    while(queue.length) {
      const item=queue.shift();
      try { out.push(await worker(item)); } catch (_) {}
    }
  });
  await Promise.all(runners);
  return out;
}

function makeManualRecord(x){
  const now=new Date().toISOString().slice(0,10);
  return {
    id:x.id,
    slug:x.id,
    name:x.name,
    chain:x.chain,
    town:x.town,
    townSlug:slug(x.town),
    address:x.address,
    lat:null,lng:null,
    category:'supermarket',
    weekOpenHour:0,weekCloseHour:0,sunOpenHour:null,sunCloseHour:null,isSundayOpen:false,
    holidayOpenNote:'Horario festivo específico no confirmado.',
    officialSource:x.sourceName,
    sourceType:x.sourceType,
    sourceUrl:x.sourceUrl,
    lastVerified:now,
    confirmations:0,
    phone:null,
    website:x.website||null,
    descriptionES:x.descriptionES,
    descriptionEN:x.descriptionEN,
    dataScope:'manual-current',
    locationStatus:'pending',
    hoursStatus:'unconfirmed',
    hoursVerified:false,
    verification:{
      sourceName:x.sourceName,
      sourceUrl:x.sourceUrl,
      sourceType:x.sourceType,
      verifiedAt:now,
      status:'current-listing',
      hoursVerified:false
    },
    weeklyHours:null
  };
}

const MANUAL_RECORDS = [
  {
    id:'unide-alimentacion-el-campello-muro-1',
    name:'Unide Alimentación El Campello',
    chain:'Unide',
    town:'El Campello',
    address:'C/ Muro, 1, 03560 El Campello, Alicante',
    sourceName:'Food Retail & Service — UNIDE opening report',
    sourceType:'business-directory',
    sourceUrl:'https://www.foodretail.es/retailers/unide-inaugura-cuatro-supermercados-en-una-semana-y-suma-siete-en-lo-que-va-de-2026.html',
    website:'https://tu.unidesupermercados.es/establecimientos/',
    descriptionES:'Supermercado Unide Alimentación en El Campello. La dirección está respaldada por una publicación sectorial reciente; horario pendiente de confirmación.',
    descriptionEN:'Unide Alimentación supermarket in El Campello. The address is supported by a recent sector publication; opening hours are still unconfirmed.'
  },
  {
    id:'udaco-alimentacion-el-campello-xorrutella-1',
    name:'Udaco Alimentación El Campello',
    chain:'Udaco',
    town:'El Campello',
    address:'C/ De la Xorrutella, 1, Local 4, 03560 El Campello, Alicante',
    sourceName:'UNIDE — Nueva apertura en El Campello',
    sourceType:'official-locator',
    sourceUrl:'https://tu.unidesupermercados.es/nueva-apertura-en-el-campello/',
    website:'https://tu.unidesupermercados.es/establecimientos/',
    descriptionES:'Supermercado Udaco Alimentación anunciado por UNIDE en El Campello. Horario pendiente de confirmación.',
    descriptionEN:'Udaco Alimentación supermarket announced by UNIDE in El Campello. Opening hours are still unconfirmed.'
  }
];

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
const stats={sources:[],structuredRecords:0,detailLinks:0,added:0,enriched:0,errors:[]};

for (const r of MANUAL_RECORDS.map(makeManualRecord)) {
  const m=match(stores,r);
  if (!m) { stores.push(r); stats.added++; }
  else if (!m.sourceUrl) { m.sourceUrl=r.sourceUrl; m.officialSource=r.sourceName; m.verification=Object.assign({},m.verification,{sourceUrl:r.sourceUrl,sourceName:r.sourceName}); stats.enriched++; }
}

for (const src of SOURCES) {
  try {
    const listingHtml = await fetchText(src.url);
    let rows = jsonld(listingHtml).map(x=>makeRecord(x,src)).filter(Boolean);

    if (src.listing === 'detailLinks') {
      const links = [...new Set(linksFromHtml(listingHtml, src.patterns))].slice(0,500);
      stats.detailLinks += links.length;
      const details = await mapLimit(links, 6, async url => {
        const html = await fetchText(url,35000);
        return uniqueRecords(jsonld(html).map(x=>makeRecord(x,src)).filter(Boolean));
      });
      rows.push(...details.flat());
    }

    rows = uniqueRecords(rows);
    stats.sources.push({id:src.id,ok:true,records:rows.length,detailLinks:src.listing==='detailLinks' ? rows.length : 0});
    stats.structuredRecords += rows.length;

    for (const r of rows) {
      const m=match(stores,r);
      if (m) {
        let changed=false;
        if (!Number.isFinite(m.lat) && Number.isFinite(r.lat)) { m.lat=r.lat; m.lng=r.lng; m.locationStatus='mapped'; changed=true; }
        if (!m.phone && r.phone) { m.phone=r.phone; changed=true; }
        if (!m.website && r.website) { m.website=r.website; changed=true; }
        if (r.hoursVerified && m.hoursVerified===false) {
          Object.assign(m,{
            weeklyHours:r.weeklyHours,weekOpenHour:r.weekOpenHour,weekCloseHour:r.weekCloseHour,
            sunOpenHour:r.sunOpenHour,sunCloseHour:r.sunCloseHour,isSundayOpen:r.isSundayOpen,
            hoursVerified:true,hoursStatus:'checked'
          });
          changed=true;
        }
        if (r.sourceUrl && !m.verification?.sourceUrl) {
          m.sourceUrl=r.sourceUrl;
          m.verification=Object.assign({},m.verification,{sourceUrl:r.sourceUrl});
          changed=true;
        }
        if (changed) stats.enriched++;
      } else {
        delete r.canonical;
        stores.push(r);
        stats.added++;
      }
    }
  } catch (e) {
    stats.sources.push({id:src.id,ok:false,error:String(e)});
    stats.errors.push({source:src.id,error:String(e)});
  }
}

await fs.writeFile(DATA_PATH,JSON.stringify(stores,null,2)+'\n');
let previous={}; try { previous=JSON.parse(await fs.readFile(REPORT_PATH,'utf8')); } catch (_) {}
await fs.writeFile(REPORT_PATH,JSON.stringify(Object.assign({},previous,{
  version:'12.0.0',
  checkedAt:new Date().toISOString(),
  status:stats.errors.length?'first-party-complete-with-review':'first-party-complete',
  automaticMode:'first-party-ingestion-v2',
  note:'First-party locators are used for discoverable locations and structured opening hours. Hours are promoted only when the official locator publishes structured hours.',
  firstParty:stats
}),null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
