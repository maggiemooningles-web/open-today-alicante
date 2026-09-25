import fs from 'node:fs/promises';

const DATA_PATH = new URL('../data/stores.json', import.meta.url);
const REPORT_PATH = new URL('../data/update-report.json', import.meta.url);

function norm(v='') {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}\d]+/gu,' ').replace(/\s+/g,' ').trim();
}
function dist(a,b) {
  if (![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return Infinity;
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function quality(s) {
  let q=0;
  q += s.hoursVerified ? 5 : 0;
  q += s.sourceType==='official-locator' ? 4 : 0;
  q += s.sourceType==='official-open-data' ? 3 : 0;
  q += s.sourceType==='configured-source' ? 3 : 0;
  q += s.sourceType==='business-directory' ? 2 : 0;
  q += Number.isFinite(s.lat)&&Number.isFinite(s.lng) ? 2 : 0;
  q += s.phone ? 1 : 0;
  q += s.website ? 1 : 0;
  q += s.sourceUrl ? 1 : 0;
  return q;
}
function mergeInto(primary, secondary) {
  const fields=['chain','phone','website','district','suburb','neighbourhood','quarter','address'];
  for (const f of fields) if (!primary[f] && secondary[f]) primary[f]=secondary[f];
  if (!Number.isFinite(primary.lat)&&Number.isFinite(secondary.lat)) { primary.lat=secondary.lat; primary.lng=secondary.lng; }
  if (!primary.hoursVerified && secondary.hoursVerified) {
    Object.assign(primary,{
      weeklyHours:secondary.weeklyHours,
      weekOpenHour:secondary.weekOpenHour,
      weekCloseHour:secondary.weekCloseHour,
      sunOpenHour:secondary.sunOpenHour,
      sunCloseHour:secondary.sunCloseHour,
      isSundayOpen:secondary.isSundayOpen,
      hoursVerified:true,
      hoursStatus:secondary.hoursStatus || 'checked'
    });
  }
  primary.sources = Array.from(new Set([
    ...(Array.isArray(primary.sources)?primary.sources:[]),
    primary.sourceUrl || '',
    ...(Array.isArray(secondary.sources)?secondary.sources:[]),
    secondary.sourceUrl || ''
  ].filter(Boolean))).slice(0,8);
  primary.confirmations = Math.max(Number(primary.confirmations||0),Number(secondary.confirmations||0));
  return primary;
}

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
const out=[], exact=new Map();
let removed=0, merged=0;
for (const store of stores) {
  const key=norm(store.name)+'|'+norm(store.address)+'|'+norm(store.town);
  const exactHit=exact.get(key);
  if (exactHit) {
    const winner=quality(store)>quality(exactHit)?store:exactHit;
    const loser=winner===store?exactHit:store;
    mergeInto(winner,loser);
    if (winner===store) {
      const idx=out.indexOf(exactHit);
      out[idx]=winner;
      exact.set(key,winner);
    }
    merged++; removed++;
    continue;
  }
  let near=null;
  if (store.name) {
    for (const existing of out) {
      if (norm(existing.name)!==norm(store.name) || norm(existing.town)!==norm(store.town)) continue;
      if (dist(existing,store)<=0.04) { near=existing; break; }
    }
  }
  if (near) {
    const winner=quality(store)>quality(near)?store:near;
    const loser=winner===store?near:store;
    mergeInto(winner,loser);
    if (winner===store) out[out.indexOf(near)]=winner;
    merged++; removed++;
    continue;
  }
  out.push(store);
  exact.set(key,store);
}
await fs.writeFile(DATA_PATH,JSON.stringify(out,null,2)+'\n');
let report={};try{report=JSON.parse(await fs.readFile(REPORT_PATH,'utf8'));}catch(_){}
report.checkedAt=new Date().toISOString();
report.dedupe={before:stores.length,after:out.length,removed,merged,nearMatchKm:0.04};
await fs.writeFile(REPORT_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.dedupe));
