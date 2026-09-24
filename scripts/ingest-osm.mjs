import fs from 'node:fs/promises';

const DATA_PATH = new URL('../data/stores.json', import.meta.url);
const REPORT_PATH = new URL('../data/update-report.json', import.meta.url);

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'OpenTodayAlicante/1.2 (+https://github.com/maggiemooningles-web/open-today-alicante)';

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
  supermarket: 'supermarket',
  convenience: 'express',
  bakery: 'bakery',
  hardware: 'hardware',
  doityourself: 'hardware',
  garden_centre: 'garden',
  electronics: 'electronics',
  computer: 'electronics',
  mobile_phone: 'electronics',
  mall: 'mall',
  department_store: 'mall',
  pharmacy: 'pharmacy',
  fuel: 'petrol',
  veterinary: 'vet'
};

const GENERIC_CATEGORY = 'other';

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value = '') {
  return normalize(value).replace(/\s+/g, '-').slice(0, 80) || 'local';
}

function esc(value = '') {
  return String(value).replace(/"/g, '&quot;');
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dp = (bLat - aLat) * Math.PI / 180;
  const dl = (bLng - aLng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function addressFromTags(tags = {}) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const locality = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:municipality'] || '';
  const postcode = tags['addr:postcode'] || '';
  return [street || tags['addr:place'] || '', postcode, locality].filter(Boolean).join(', ') || locality || 'Alicante, Alicante';
}

function townFromTags(tags = {}) {
  return tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:municipality'] || 'Alicante';
}

function buildQuery() {
  const shops = SHOP_TAGS.join('|');
  const amenities = AMENITY_TAGS.join('|');
  return `[out:json][timeout:180];
// Province of Alicante OSM relation 349012 -> Overpass area 3600349012
area(3600349012)->.province;
(
  nwr["shop"~"^(${shops})$"](area.province);
  nwr["amenity"~"^(${amenities})$"](area.province);
);
out center tags;`;
}

async function fetchOverpass() {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': USER_AGENT,
      'accept': 'application/json'
    },
    body: 'data=' + encodeURIComponent(buildQuery())
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  return response.json();
}

function elementPoint(el) {
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) return [el.lat, el.lon];
  if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) return [el.center.lat, el.center.lon];
  return [null, null];
}

async function main() {
  const current = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const osm = await fetchOverpass();
  const elements = Array.isArray(osm.elements) ? osm.elements : [];

  const existingByOsmId = new Set(
    current.filter(x => x.osmId).map(x => x.osmId)
  );
  const existingSlugs = new Set(current.map(x => x.slug));
  const nameAddressKeys = new Set(
    current.map(x => `${normalize(x.name)}|${normalize(x.address)}`)
  );
  const groupedByName = new Map();
  for (const store of current) {
    const key = normalize(store.name);
    if (!key) continue;
    if (!groupedByName.has(key)) groupedByName.set(key, []);
    groupedByName.get(key).push(store);
  }

  const discovered = [];
  const seenThisRun = new Set();

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:es'] || tags['name:ca'] || tags['name:en'];
    if (!name) continue;

    const [lat, lng] = elementPoint(el);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const osmId = `osm:${el.type}:${el.id}`;
    if (existingByOsmId.has(osmId) || seenThisRun.has(osmId)) continue;
    seenThisRun.add(osmId);

    const rawTag = tags.shop || tags.amenity || '';
    const category = CATEGORY_BY_TAG[rawTag] || GENERIC_CATEGORY;
    const town = townFromTags(tags);
    const address = addressFromTags(tags);
    const key = `${normalize(name)}|${normalize(address)}`;

    if (nameAddressKeys.has(key)) continue;

    const sameName = groupedByName.get(normalize(name)) || [];
    const nearExisting = sameName.some(s =>
      Number.isFinite(s.lat) && Number.isFinite(s.lng) &&
      haversineKm(lat, lng, s.lat, s.lng) < 0.08
    );
    if (nearExisting) continue;

    let slug = slugify(`${name}-${town}`);
    if (existingSlugs.has(slug)) slug = `${slug}-osm-${el.id}`;
    existingSlugs.add(slug);

    const store = {
      id: `osm-${el.type}-${el.id}`,
      osmId,
      slug,
      name,
      chain: tags.brand || tags.operator || '',
      town,
      townSlug: slugify(town),
      address,
      lat,
      lng,
      category,
      weekOpenHour: null,
      weekCloseHour: null,
      sunOpenHour: null,
      sunCloseHour: null,
      isSundayOpen: null,
      holidayOpenNote: '',
      phone: tags.phone || tags['contact:phone'] || '',
      descriptionES: 'Local descubierto mediante OpenStreetMap. Horario pendiente de verificación.',
      descriptionEN: 'Location discovered via OpenStreetMap. Opening hours pending verification.',
      sourceType: 'osm-discovery',
      sourceName: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/${esc(el.type)}/${el.id}`,
      officialSource: 'OpenStreetMap',
      lastVerified: null,
      hoursVerified: false,
      dataScope: 'discovery',
      discoveryStatus: 'unverified',
      rawOpeningHours: tags.opening_hours || null,
      community: { seedReports: 0, openToday: 0, closedToday: 0, updatedAt: null },
      locationStatus: 'mapped',
      hoursStatus: 'unknown',
      verification: {
        sourceName: 'OpenStreetMap',
        sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        sourceType: 'osm-discovery',
        verifiedAt: null,
        status: 'discovered',
        hoursVerified: false
      },
      weeklyHours: null
    };

    discovered.push(store);
    nameAddressKeys.add(key);
  }

  const merged = current.concat(discovered);

  await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2) + '\n');

  const report = {
    version: '11.0.0',
    checkedAt: new Date().toISOString(),
    automaticMode: 'osm-discovery-plus-source-health',
    dataset: {
      before: current.length,
      discovered: discovered.length,
      after: merged.length,
      source: 'OpenStreetMap'
    },
    notes: [
      'OSM records are discovery-only and never treated as hours-verified.',
      'Existing first-party or manually verified records are preserved.',
      'Opening hours must be promoted from a checkable source before a place can appear in Open Now results.'
    ]
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
