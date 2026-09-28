import fs from 'node:fs/promises';
import { matchStore, sourceRank } from './match-store.mjs';

const [,, generatedPath, remotePath] = process.argv;
if (!generatedPath || !remotePath) {
  console.error('Usage: node scripts/merge-generated-data.mjs <generated.json> <remote.json>');
  process.exit(2);
}

function mergeInto(primary, secondary) {
  const stronger = sourceRank(secondary) > sourceRank(primary);

  if (primary.category==='other' && secondary.category && secondary.category!=='other') {
    primary.category=secondary.category;
  }

  for (const f of ['chain','phone','website','district','suburb','neighbourhood','quarter','address','town','townSlug','descriptionES','descriptionEN']) {
    if (!primary[f] && secondary[f]) primary[f]=secondary[f];
  }

  if (!Number.isFinite(primary.lat)&&Number.isFinite(secondary.lat)) {
    primary.lat=secondary.lat;
    primary.lng=secondary.lng;
  }

  if (stronger) {
    for (const f of ['chain','sourceType','sourceName','officialSource','sourceUrl','dataScope','lastVerified']) {
      if (secondary[f]) primary[f]=secondary[f];
    }
    if (secondary.verification) primary.verification=structuredClone(secondary.verification);
    if (secondary.hoursStatus) primary.hoursStatus=secondary.hoursStatus;
    if (secondary.locationStatus) primary.locationStatus=secondary.locationStatus;
  }

  if (secondary.hoursVerified && (!primary.hoursVerified || stronger)) {
    Object.assign(primary,{
      weeklyHours:secondary.weeklyHours,
      weekOpenHour:secondary.weekOpenHour,
      weekCloseHour:secondary.weekCloseHour,
      sunOpenHour:secondary.sunOpenHour,
      sunCloseHour:secondary.sunCloseHour,
      isSundayOpen:secondary.isSundayOpen,
      hoursVerified:true,
      hoursStatus:secondary.hoursStatus || 'checked',
      lastVerified:secondary.lastVerified || primary.lastVerified
    });
  }

  primary.sources = Array.from(new Set([
    ...(Array.isArray(primary.sources)?primary.sources:[]),
    primary.sourceUrl || '',
    ...(Array.isArray(secondary.sources)?secondary.sources:[]),
    secondary.sourceUrl || ''
  ].filter(Boolean))).slice(0,10);

  primary.confirmations = Math.max(Number(primary.confirmations||0),Number(secondary.confirmations||0));

  if (secondary.verification && (!primary.verification || stronger)) {
    primary.verification=structuredClone(secondary.verification);
  }

  return primary;
}

const generated=JSON.parse(await fs.readFile(generatedPath,'utf8'));
const remote=JSON.parse(await fs.readFile(remotePath,'utf8'));
const out=[...remote];
let merged=0, added=0;

for (const incoming of generated) {
  const hit=matchStore(out,incoming);
  if (hit) {
    mergeInto(hit,incoming);
    merged++;
  } else {
    out.push(incoming);
    added++;
  }
}

await fs.writeFile('data/stores.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({remote:remote.length,generated:generated.length,merged,added,after:out.length}));
