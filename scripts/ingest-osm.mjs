import fs from 'node:fs/promises';

const DATA_PATH = new URL('../data/stores.json', import.meta.url);
const REPORT_PATH = new URL('../data/update-report.json', import.meta.url);

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const USER_AGENT = 'OpenTodayAlicante/1.4 (+https://github.com/maggiemooningles-web/open-today-alicante)';

const SHOP_TAGS = [
  'supermarket','convenience','department_store','mall','bakery','butcher',
  'greengrocer','seafood','deli','hardware','doityourself','garden_centre',
  'electronics','computer','mobile_phone','pet','clothes','shoes','beauty',
  'hairdresser','cosmetics','optician','jewelry','furniture','sports','bicycle',
  'car','car_parts','motorcycle','laundry','florist','books','stationery','toys',
  'gift','travel_agency','copyshop','photo','outdoor','fabric','tailor','variety_store'
];

const AMENITY_TAGS = ['pharmacy','fuel','veterinary','bank','atm','post_office','clinic','dentist'];

const CATEGORY_BY_TAG = {
  supermarket:'supermarket', convenience:'express', bakery:'bakery',
  hardware:'hardware', doityourself:'hardware', garden_centre:'garden',
  electronics:'electronics', computer:'electronics', mobile_phone:'electronics',
  mall:'mall', department_store:'mall', pharmacy:'pharmacy', fuel:'petrol',
  veterinary:'vet'
};
const GENERIC_CATEGORY = 'other';

function normalize(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function slugify(value='') {
  return normalize(value).replace(/\s+/g,'-').slice(0,80) || 'local';
}
function haversineKm(aLat,aLng,bLat,bLng) {
  const R=6371, p1=aLat*Math.PI/180, p2=bLat*Math.PI/180;
  const dp=(bLat-aLat)*Math.PI/180, dl=(bLng-aLng)*Math.PI/180;
  const h=Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function addressFromTags(tags={}) {
  const street=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(' ');
  const locality=tags['addr:city']||tags['addr:town']||tags['addr:village']||tags['addr:municipality']||'';
  const postcode=tags['addr:postcode']||'';
  return [street||tags['addr:place']||'',postcode,locality].filter(Boolean).join(', ')||locality||'Alicante, Alicante';
}
function townFromTags(tags={}) {
  return tags['addr:city']||tags['addr:town']||tags['addr:village']||tags['addr:municipality']||'Alicante';
}
function point(el) {
  if(Number.isFinite(el.lat)&&Number.isFinite(el.lon)) return [el.lat,el.lon];
  if(el.center&&Number.isFinite(el.center.lat)&&Number.isFinite(el.center.lon)) return [el.center.lat,el.center.lon];
  return [null,null];
}
function makeBboxes() {
  const b=[];
  for(let lat=37.75; lat<39.2; lat+=0.35){
    for(let lon=-1.30; lon<0.35; lon+=0.42){
      b.push([lat,lon,Math.min(lat+0.35,39.2),Math.min(lon+0.42,0.35)].map(n=>n.toFixed(4)).join(','));
    }
  }
  return b;
}
function buildQuery(bbox) {
  const shops=SHOP_TAGS.join('|'), amenities=AMENITY_TAGS.join('|');
  return `[out:json][timeout:60][maxsize:536870912];
area(3600349012)->.province;
(
  nwr["shop"~"^(${shops})$"]["name"](area.province)(${bbox});
  nwr["amenity"~"^(${amenities})$"]["name"](area.province)(${bbox});
);
out center tags;`;
}
async function fetchQuery(query) {
  const errors=[];
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{
          'content-type':'application/x-www-form-urlencoded; charset=UTF-8',
          'user-agent':USER_AGENT,
          'accept':'application/json'
        },
        body:'data='+encodeURIComponent(query),
        signal:AbortSignal.timeout(90000)
      });
      if(response.ok) return await response.json();
      errors.push(`${endpoint} HTTP ${response.status}`);
    }catch(error){ errors.push(`${endpoint}: ${String(error)}`); }
  }
  throw new Error(errors.join(' | '));
}
async function pause(ms){ await new Promise(r=>setTimeout(r,ms)); }

async function main(){
  const current=JSON.parse(await fs.readFile(DATA_PATH,'utf8'));
  const existingByOsmId=new Set(current.filter(x=>x.osmId).map(x=>x.osmId));
  const existingSlugs=new Set(current.map(x=>x.slug));
  const nameAddressKeys=new Set(current.map(x=>`${normalize(x.name)}|${normalize(x.address)}`));
  const groupedByName=new Map();
  for(const store of current){
    const key=normalize(store.name); if(!key) continue;
    if(!groupedByName.has(key)) groupedByName.set(key,[]);
    groupedByName.get(key).push(store);
  }

  const discovered=[], errors=[], bboxes=makeBboxes();

  for(const bbox of bboxes){
    try{
      const payload=await fetchQuery(buildQuery(bbox));
      const elements=Array.isArray(payload.elements)?payload.elements:[];
      for(const el of elements){
        const tags=el.tags||{};
        const name=tags.name||tags['name:es']||tags['name:ca']||tags['name:en'];
        if(!name) continue;
        const [lat,lng]=point(el);
        if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;

        const osmId=`osm:${el.type}:${el.id}`;
        if(existingByOsmId.has(osmId)) continue;

        const rawTag=tags.shop||tags.amenity||'';
        const category=CATEGORY_BY_TAG[rawTag]||GENERIC_CATEGORY;
        const town=townFromTags(tags);
        const address=addressFromTags(tags);
        const key=`${normalize(name)}|${normalize(address)}`;
        if(nameAddressKeys.has(key)) continue;

        const sameName=groupedByName.get(normalize(name))||[];
        const nearExisting=sameName.some(store =>
          Number.isFinite(store.lat)&&Number.isFinite(store.lng)&&
          haversineKm(lat,lng,store.lat,store.lng)<0.08
        );
        if(nearExisting) continue;

        let slug=slugify(`${name}-${town}`);
        if(existingSlugs.has(slug)) slug=`${slug}-osm-${el.id}`;
        existingSlugs.add(slug);

        const sourceUrl=`https://www.openstreetmap.org/${el.type}/${el.id}`;
        const store={
          id:`osm-${el.type}-${el.id}`, osmId, slug, name,
          chain:tags.brand||tags.operator||'', town, townSlug:slugify(town), address, lat, lng, category,
          weekOpenHour:null, weekCloseHour:null, sunOpenHour:null, sunCloseHour:null, isSundayOpen:null,
          holidayOpenNote:'',
          phone:tags.phone||tags['contact:phone']||'',
          descriptionES:'Local descubierto mediante OpenStreetMap. Horario pendiente de verificación.',
          descriptionEN:'Location discovered via OpenStreetMap. Opening hours pending verification.',
          sourceType:'osm-discovery', sourceName:'OpenStreetMap', sourceUrl,
          officialSource:'OpenStreetMap', lastVerified:null, hoursVerified:false,
          dataScope:'discovery', discoveryStatus:'unverified', rawOpeningHours:tags.opening_hours||null,
          community:{seedReports:0,openToday:0,closedToday:0,updatedAt:null},
          locationStatus:'mapped', hoursStatus:'unknown',
          verification:{sourceName:'OpenStreetMap',sourceUrl,sourceType:'osm-discovery',verifiedAt:null,status:'discovered',hoursVerified:false},
          weeklyHours:null
        };

        discovered.push(store);
        nameAddressKeys.add(key); existingByOsmId.add(osmId);
        if(!groupedByName.has(normalize(name))) groupedByName.set(normalize(name),[]);
        groupedByName.get(normalize(name)).push(store);
      }
    }catch(error){
      errors.push({bbox,error:String(error)});
    }
    await pause(1200);
  }

  const merged=current.concat(discovered);
  await fs.writeFile(DATA_PATH,JSON.stringify(merged,null,2)+'\n');

  const report={
    version:'11.3.0',
    checkedAt:new Date().toISOString(),
    automaticMode:'osm-discovery-plus-source-health',
    dataset:{before:current.length,discovered:discovered.length,after:merged.length,source:'OpenStreetMap',bboxesAttempted:bboxes.length,bboxesFailed:errors.length},
    errors,
    notes:[
      'OSM records are discovery-only and never treated as hours-verified.',
      'Existing first-party or manually verified records are preserved.',
      'Opening hours must be promoted from a checkable source before a place can appear in Open Now results.',
      'OSM discovery is sharded into small bounding boxes and uses a fallback public Overpass endpoint.'
    ]
  };
  await fs.writeFile(REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}

main().catch(error=>{ console.error(error); process.exit(1); });
