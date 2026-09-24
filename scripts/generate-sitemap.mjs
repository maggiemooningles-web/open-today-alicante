import fs from 'node:fs/promises';

const DATA_PATH = new URL('../data/stores.json', import.meta.url);
const TOWNS_PATH = new URL('../data/municipalities.json', import.meta.url);
const SITEMAP_PATH = new URL('../sitemap.xml', import.meta.url);

const SITE_URL = 'https://maggiemooningles-web.github.io/open-today-alicante';

const CORE_ROUTES = [
  '/',
  '/abierto-hoy-alicante',
  '/supermercados-abiertos-ahora',
  '/farmacias-abiertas-ahora',
  '/gasolineras-abiertas',
  '/urgencias-abiertas',
  '/panaderias-abiertas',
  '/bricolaje-abierto',
  '/jardineria-abierta',
  '/electronica-abierta',
  '/veterinarios-urgencias-24h',
  '/domingos-alicante',
  '/farmacias-guardia-alicante',
  '/aperturas-12-octubre-alicante',
  '/aperturas-navidad-alicante',
  '/aperturas-1-enero-alicante',
  '/aperturas-semana-santa-alicante',
  '/aperturas-nochebuena-alicante',
  '/aperturas-31-diciembre-alicante'
];

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const stores = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
let municipalityIndex = [];
try {
  municipalityIndex = JSON.parse(await fs.readFile(TOWNS_PATH, 'utf8')).municipalities || [];
} catch (_) {}

const urls = new Map();
for (const route of CORE_ROUTES) urls.set(route, null);

const townGroups = new Map();
for (const store of stores) {
  const townSlug = store.townSlug || slugify(store.town || '');
  if (!townSlug) continue;
  if (!townGroups.has(townSlug)) townGroups.set(townSlug, []);
  townGroups.get(townSlug).push(store);
}

for (const [townSlug, townStores] of townGroups) {
  const usable = townStores.filter(store =>
    store.dataScope !== 'discovery' &&
    store.hoursVerified !== false
  );
  if (usable.length < 3) continue;
  const lastmod = usable
    .map(store => isoDate(store.lastVerified || store.verification?.verifiedAt))
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  urls.set(`/zona/${townSlug}`, lastmod);
}

for (const store of stores) {
  if (!store?.slug || store.sourceType === 'osm-discovery' || store.dataScope === 'discovery') continue;
  const lastmod = isoDate(store.lastVerified || store.verification?.verifiedAt);
  urls.set(`/tienda/${store.slug}`, lastmod);
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[...urls.entries()].map(([route, lastmod]) => {
    const lines = [
      `  <url><loc>${xmlEscape(SITE_URL + route)}</loc>`
    ];
    if (lastmod) lines.push(`<lastmod>${lastmod}</lastmod>`);
    lines[lines.length - 1] += '</url>';
    return lines.join('');
  }),
  '</urlset>',
  ''
].join('\n');

await fs.writeFile(SITEMAP_PATH, xml);
console.log(`Generated sitemap with ${urls.size} URLs from ${stores.length} records and ${municipalityIndex.length} municipality labels.`);
