import fs from 'node:fs/promises';
const [,, localPath, remotePath] = process.argv;
const local=JSON.parse(await fs.readFile(localPath,'utf8'));
let remote={}; try { remote=JSON.parse(await fs.readFile(remotePath,'utf8')); } catch (_) {}
const stores=JSON.parse(await fs.readFile('data/stores.json','utf8'));
const discovery = remote.discovery || local.discovery || (local.dataset?.source === 'OpenStreetMap' ? local.dataset : null) || (remote.dataset?.source === 'OpenStreetMap' ? remote.dataset : null);
const out={
  version:'12.1.0',
  checkedAt:new Date().toISOString(),
  status:(local.status==='sources-healthy'||local.status?.includes('complete')) ? local.status : 'combined-refresh-with-review',
  automaticMode:'combined-open-data-first-party-osm-refresh',
  note:'Combined report: official/first-party enrichment is merged with the latest discovery dataset; unverified discovery records remain excluded from Open Now until their hours are verified.',
  dataset:{totalRecords:stores.length,sourceTypes:stores.reduce((a,x)=>(a[x.sourceType||'unknown']=(a[x.sourceType||'unknown']||0)+1,a),{})},
  sourceHealth:local.sources || remote.sources || [],
  discovery,
  openData:local.openData || remote.openData || null,
  firstParty:local.firstParty || remote.firstParty || null,
  dedupe:local.dedupe || remote.dedupe || null
};
await fs.writeFile('data/update-report.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.dataset));
