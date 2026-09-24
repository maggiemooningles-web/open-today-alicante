import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PATH=path.join(ROOT,'data','stores.json');
const REPORT_PATH=path.join(ROOT,'data','update-report.json');
const SOURCES=[
 {id:'alicante-directory',name:'Ayuntamiento de Alicante · Directorio de establecimientos',url:'https://alicante.comercioscomunitatvalenciana.com/es/mapa/index',category:'other'},
 {id:'dialprix',name:'Dialprix · Centros',url:'https://dialprix.es/supermercados/',category:'supermarket'},
 {id:'masymas',name:'masymas · Localizador',url:'https://www.masymas.com/localizadordetiendas/localizador.php',category:'supermarket'},
 {id:'hiperber',name:'Hiperber · Centros',url:'https://hiperber.com/supermercados-hiperber/',category:'supermarket'},
 {id:'moeve',name:'Moeve · Gasolineras Alicante',url:'https://www.moeve.es/es/cerca-de-ti/gasolineras/alicante/profesionales-moeve-pro-direct-cerca-de-mi',category:'petrol'}
];
function t(v=''){return String(v).replace(/\\s+/g,' ').trim();}
function n(v=''){return t(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu,' ').replace(/\\s+/g,' ').trim();}
function s(v=''){return n(v).replace(/\\s+/g,'-').slice(0,70);}
function decode(v=''){return v.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;|&#x27;/g,"'").replace(/&apos;/g,"'");}
function strip(html){return decode(html.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<(br|\\/p|\\/div|\\/li|\\/tr|\\/td|\\/h[1-6])\\b[^>]*>/gi,'\\n').replace(/<[^>]+>/g,' '));}
function ls(html){return strip(html).split(/\\n+/).map(t).filter(Boolean);}
function jsonld(html){
 const out=[],re=/<script[^>]+type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi;let m;
 while((m=re.exec(html))){try{const root=JSON.parse(m[1].trim()),stack=Array.isArray(root)?root:[root];while(stack.length){const x=stack.pop();if(!x||typeof x!=='object')continue;if(x['@graph'])stack.push(...x['@graph']);if(x.itemListElement)stack.push(...x.itemListElement);if(x.item&&typeof x.item==='object')stack.push(x.item);if(x['@type'])out.push(x);}}catch(_){}}
 return out;
}
function addr(a){if(!a)return'';if(typeof a==='string')return t(a);return [a.streetAddress,a.postalCode,a.addressLocality,a.addressRegion].filter(Boolean).map(t).join(', ');}
function geo(g){const lat=Number(g&&g.latitude),lng=Number(g&&g.longitude);return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:{lat:null,lng:null};}
function hours(specs){const out={},map={Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:0};if(!Array.isArray(specs))return out;for(const x of specs){const days=Array.isArray(x.dayOfWeek)?x.dayOfWeek:[x.dayOfWeek];for(const day of days){const d=String(day||'').split('/').pop(),i=map[d];if(i==null)continue;const a=/^(\\d{1,2})(?::(\\d{2}))?$/.exec(String(x.opens||'')),b=/^(\\d{1,2})(?::(\\d{2}))?$/.exec(String(x.closes||''));if(a&&b)out[i]=[Number(a[1])+Number(a[2]||0)/60,Number(b[1])+Number(b[2]||0)/60];}}return out;}
function rec(x,src){
 const type=Array.isArray(x['@type'])?x['@type'].join(' '):String(x['@type']||'');
 if(!/LocalBusiness|Store|Grocery|GasStation|Pharmacy|Veterinary|Medical|Bakery|ShoppingCenter/i.test(type))return null;
 const name=t(x.name||''),address=addr(x.address);if(!name||!address)return null;const g=geo(x.geo),h=hours(x.openingHoursSpecification),w=h[1]||h[2]||null;
 return {id:'first-party-'+s(src.id+' '+name+' '+address)+'-'+Math.random().toString(36).slice(2,7),slug:'first-party-'+s(name+' '+address)+'-'+Math.random().toString(36).slice(2,7),name,chain:src.id==='dialprix'?'Dialprix':src.id==='masymas'?'masymas':src.id==='hiperber'?'Hiperber':src.id==='moeve'?'Moeve':'',town:t(x.address&&x.address.addressLocality||'Alicante'),townSlug:s(x.address&&x.address.addressLocality||'Alicante'),address,lat:g.lat,lng:g.lng,category:src.category,weekOpenHour:w?w[0]:0,weekCloseHour:w?w[1]:0,sunOpenHour:h[0]?h[0][0]:null,sunCloseHour:h[0]?h[0][1]:null,isSundayOpen:Boolean(h[0]),holidayOpenNote:'Horario festivo específico no confirmado.',officialSource:src.name,sourceType:'official-locator',sourceUrl:src.url,lastVerified:new Date().toISOString().slice(0,10),hoursVerified:Object.keys(h).length>0,confirmations:0,phone:t(x.telephone||'')||null,website:t(x.url||'')||null,descriptionES:'Ficha localizada en el directorio oficial de '+src.name+'.',descriptionEN:'Listing found in the official '+src.name+' directory.',dataScope:'first-party',locationStatus:g.lat!=null?'mapped':'pending',hoursStatus:Object.keys(h).length?'checked':'unconfirmed',verification:{sourceName:src.name,sourceUrl:src.url,sourceType:'official-locator',verifiedAt:new Date().toISOString().slice(0,10),status:'official-locator',hoursVerified:Object.keys(h).length>0},weeklyHours:h};
}
function distance(a,b){if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Infinity;const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180,z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));}
function match(stores,r){const an=n(r.name),aa=n(r.address);for(const x of stores){if(n(x.name)===an&&n(x.address)===aa)return x;if(n(x.name)===an&&n(x.town)===n(r.town)&&distance(x,r)<=0.18)return x;}return null;}
async function fetchHtml(url){const c=new AbortController(),tm=setTimeout(()=>c.abort(),50000);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'OpenTodayAlicanteBot/1.2'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.text();}finally{clearTimeout(tm);}}

const stores=JSON.parse(await fs.readFile(DATA_PATH,'utf8')),stats={sources:[],structuredRecords:0,added:0,enriched:0,errors:[]};
for(const src of SOURCES){
 try{
  const html=await fetchHtml(src.url), parsed=jsonld(html).map(x=>rec(x,src)).filter(Boolean);
  const uniq=new Map(parsed.map(x=>[n(x.name)+'|'+n(x.address),x]));
  const finalRows=Array.from(uniq.values());
  stats.sources.push({id:src.id,ok:true,records:finalRows.length});stats.structuredRecords+=finalRows.length;
  for(const r of finalRows.slice(0,1000)){const m=match(stores,r);if(m){let changed=false;if(!Number.isFinite(m.lat)&&Number.isFinite(r.lat)){m.lat=r.lat;m.lng=r.lng;m.locationStatus='mapped';changed=true;}if(!m.phone&&r.phone){m.phone=r.phone;changed=true;}if(r.hoursVerified&&m.hoursVerified===false){m.weeklyHours=r.weeklyHours;m.weekOpenHour=r.weekOpenHour;m.weekCloseHour=r.weekCloseHour;m.sunOpenHour=r.sunOpenHour;m.sunCloseHour=r.sunCloseHour;m.isSundayOpen=r.isSundayOpen;m.hoursVerified=true;m.hoursStatus='checked';changed=true;}if(!m.sourceUrl){m.sourceUrl=r.sourceUrl;m.verification=Object.assign({},m.verification,{sourceUrl:r.sourceUrl});changed=true;}if(changed)stats.enriched++;}else{stores.push(r);stats.added++;}}
 }catch(e){stats.sources.push({id:src.id,ok:false,error:String(e)});stats.errors.push({source:src.id,error:String(e)});}
}
await fs.writeFile(DATA_PATH,JSON.stringify(stores,null,2)+'\\n');
let previous={};try{previous=JSON.parse(await fs.readFile(REPORT_PATH,'utf8'));}catch(_){}
await fs.writeFile(REPORT_PATH,JSON.stringify(Object.assign({},previous,{version:'11.0.0',checkedAt:new Date().toISOString(),status:stats.errors.length?'first-party-complete-with-review':'first-party-complete',automaticMode:'first-party-ingestion',firstParty:stats}),null,2)+'\\n');
console.log(JSON.stringify(stats,null,2));
