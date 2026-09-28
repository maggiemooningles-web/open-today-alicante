const GENERIC_NAME_TOKENS = new Set([
  'supermercado','supermercados','hipermercado','hipermercados','express','tienda','tiendas',
  'gasolinera','gasolineras','estacion','servicio','service','farmacia','panaderia',
  'alimentacion','market','store','grocery','bakery','shopping','center','centro',
  'comercial','local','s','l','sl','slu','sll','sa','es','de','del','la','el','los','las','y','en'
]);

function clean(v='') {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

export function norm(v='') {
  return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' y ')
    .replace(/[^0-9\p{L}]+/gu,' ')
    .replace(/\b(s l|slu|sll|s a|sa)\b/g,' ')
    .replace(/\s+/g,' ').trim();
}

function tokens(v='', generic=false) {
  const list = norm(v).split(' ').filter(Boolean);
  return new Set(list.filter(t => !generic || !GENERIC_NAME_TOKENS.has(t) || /^\d+$/.test(t)));
}

function jaccard(a,b) {
  if (!a.size || !b.size) return 0;
  let intersection=0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function containment(a,b) {
  const aa=norm(a), bb=norm(b);
  if (!aa || !bb) return 0;
  if (aa===bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) {
    return Math.min(0.95, Math.min(aa.length,bb.length)/Math.max(aa.length,bb.length)+0.15);
  }
  return 0;
}

function similarity(a,b,generic=false) {
  return Math.max(jaccard(tokens(a,generic),tokens(b,generic)), containment(a,b));
}

function addressNorm(v='') {
  return norm(v)
    .replace(/\bc\b/g,'calle')
    .replace(/\bcalle\.?\b/g,'calle')
    .replace(/\bcl\.?\b/g,'calle')
    .replace(/\bav\.?\b/g,'avenida')
    .replace(/\bavda\.?\b/g,'avenida')
    .replace(/\bavenida\.?\b/g,'avenida')
    .replace(/\bpza\.?\b/g,'plaza')
    .replace(/\bpl\.?\b/g,'plaza')
    .replace(/\bnum\.?\b|\bn\.?\b|\bnº\b/g,' ')
    .replace(/\s+/g,' ').trim();
}

function addressSimilarity(a,b) {
  return similarity(addressNorm(a),addressNorm(b),false);
}

function postal(v='') {
  return (String(v).match(/\b\d{5}\b/) || [])[0] || '';
}

function sameTown(a,b) {
  const x=norm(a), y=norm(b);
  return !!x && !!y && x===y;
}

function sameChain(a,b) {
  const x=norm(a), y=norm(b);
  return !!x && !!y && x===y;
}

function distanceKm(a,b) {
  if (![a?.lat,a?.lng,b?.lat,b?.lng].every(Number.isFinite)) return Infinity;
  const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180;
  const z=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}

export function sourceRank(s={}) {
  if (s.hoursVerified && s.sourceType==='official-locator') return 100;
  if (s.hoursVerified && s.sourceType==='configured-source') return 95;
  if (s.hoursVerified && s.sourceType==='official-open-data') return 90;
  if (s.hoursVerified && s.sourceType==='business-directory') return 80;
  if (s.hoursVerified) return 75;
  if (s.sourceType==='official-locator') return 60;
  if (s.sourceType==='configured-source') return 55;
  if (s.sourceType==='official-open-data') return 50;
  if (s.sourceType==='business-directory') return 40;
  if (s.sourceType==='osm-discovery') return 10;
  return 20;
}

function matchScore(existing,incoming) {
  const name=similarity(existing.name,incoming.name,true);
  const address=addressSimilarity(existing.address,incoming.address);
  const pA=postal(existing.address), pB=postal(incoming.address);
  const postalMatch=!!pA && pA===pB;
  const town=sameTown(existing.town,incoming.town);
  const chain=sameChain(existing.chain,incoming.chain);
  const d=distanceKm(existing,incoming);

  if (norm(existing.name)===norm(incoming.name) && address>=0.72) return 1;
  if (postalMatch && name>=0.72 && address>=0.40) return 0.96;
  if (name>=0.78 && address>=0.52 && (town || d<=0.75)) return 0.94;
  if (chain && address>=0.62 && d<=0.60) return 0.92;
  if (name>=0.84 && (postalMatch || town) && d<=0.20) return 0.90;
  if (postalMatch && address>=0.58 && (town || d<=1.00)) return 0.88;
  if (name>=0.74 && address>=0.62 && d<=1.00) return 0.87;
  return 0;
}

export function matchStore(stores,incoming) {
  let best=null;
  let bestScore=0;
  for (const existing of stores) {
    const score=matchScore(existing,incoming);
    if (score>bestScore) { best=existing; bestScore=score; }
  }
  return bestScore>=0.87 ? best : null;
}
