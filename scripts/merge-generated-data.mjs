import fs from 'node:fs/promises';

const [,, generatedPath, remotePath] = process.argv;
if (!generatedPath || !remotePath) {
  console.error('Usage: node scripts/merge-generated-data.mjs <generated.json> <remote.json>');
  process.exit(2);
}

function norm(v='') {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}\d]+/gu,' ').replace(/\s+/g,' ').trim();
}
function distance(a,b) {
  if (![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return Infinity;
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function quality(s) {
  let q=0;
  q += s.hoursVerified ? 8 : 0;
  q += s.sourceType==='official-locator' ? 6 : 0;
  q += s.sourceType==='configured-source' ? 5 : 0;
  q += s.sourceType==='official-open-data' ? 4 : 0;
  q += s.sourceType==='business-directory' ? 3 : 0;
  q += s.sourceType==='osm-discovery' ? 1 : 0;
  q += Number.isFinite(s.lat)&&Number.isFinite(s.lng) ? 2 : 0;
  q += s.phone ? 1 : 0;
  q += s.website ? 1 : 0;
  q += s.sourceUrl ? 1 : 0;
  return q;
}
function mergeInto(primary, secondary) {
  for (const f of ['chain','phone','website','district','suburb','neighbourhood','quarter','address','town','townSlug','descriptionES','descriptionEN','officialSource','sourceUrl']) {
    if (!primary[f] && secondary[f]) primary[f]=secondary[f];
  }
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
  ].filter(Boolean))).slice(0,10);
  primary.confirmations = Math.max(Number(primary.confirmations||0),Number(secondary.confirmations||0));
  primary.verification = primary.verification || secondary.verification || undefined;
  if (secondary.verification?.sourceUrl && !primary.verification?.sourceUrl) primary.verification.sourceUrl=secondary.verification.sourceUrl;
  if (secondary.verification?.sourceName && !primary.verification?.sourceName) primary.verification.sourceName=secondary.verification.sourceName;
  return primary;
}

const generated=JSON.parse(await fs.readFile(generatedPath,'utf8'));
const remote=JSON.parse(await fs.readFile(remotePath,'utf8'));
const out=[];
let merged=0, added=0;

for (const source of remote) {
  out.push(source);
}
for (const incoming of generated) {
  const key=norm(incoming.name)+'|'+norm(incoming.address)+'|'+norm(incoming.town);
  let hit=out.find(x=>norm(x.name)+'|'+norm(x.address)+'|'+norm(x.town)===key);
  if (!hit && incoming.name) {
    const n=norm(incoming.name), t=norm(incoming.town);
    hit=out.find(x=>norm(x.name)===n && norm(x.town)===t && distance(x,incoming)<=0.04);
  }
  if (hit) {
    const winner=quality(incoming)>quality(hit) ? incoming : hit;
    const loser=winner===incoming ? hit : incoming;
    mergeInto(winner,loser);
    if (winner!==hit) {
      const idx=out.indexOf(hit);
      out[idx]=winner;
    }
    merged++;
  } else {
    out.push(incoming);
    added++;
  }
}

await fs.writeFile('data/stores.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({remote:remote.length,generated:generated.length,merged,added,after:out.length}));
