# Open Today Alicante

Consumer-first local opening directory for Alicante and the Costa Blanca.

## Product architecture

The site is designed around one question: **what can I actually use right now?**

- Search by business, chain, street, postcode, municipality and local area.
- Use GPS to prioritize nearby places.
- Filter by category, municipality, Sunday opening and **Open now**.
- Large result sets are paginated in the browser so the interface stays fast as the directory grows.
- Municipality filters are populated dynamically from the live dataset, with a priority index and aliases in `data/municipalities.json`.
- Municipality landing routes use `/zona/<municipality-slug>`.
- Individual records use `/tienda/<slug>`.

## Data quality

Records are deliberately separated by confidence:

- **Verified/configured records** can participate in Open now.
- **Discovery records** can be searchable and mapped, but do not get presented as confirmed open/closed.
- Every record can carry source name, source URL, verification date, status and data scope.

The project does not fabricate community confirmations and does not blindly scrape Google Maps.

## Automatic data pipelines

### Source-health refresh

`scripts/update-data.mjs` checks the first-party/official sources in `data/source-registry.json`.

Workflow: `.github/workflows/refresh-data.yml`

Schedule: every 6 hours.

The job records source health and regenerates the sitemap without blindly rewriting store hours.

### Location discovery

`scripts/ingest-osm.mjs` discovers additional locations from OpenStreetMap.

Workflow: `.github/workflows/discover-locations.yml`

Schedule: weekly, with manual dispatch available.

Discovery records are marked `sourceType: osm-discovery` and `hoursVerified: false` until a stronger source confirms them.

Because public Overpass servers are shared infrastructure, discovery is rate-limited, sequential and sharded into smaller geographic queries.

### SEO

`scripts/generate-sitemap.mjs` builds the sitemap from the actual dataset.

It includes core pages, municipality pages with enough verified coverage, and store pages outside the discovery-only pool.

## Deployment

GitHub Pages deployment is handled by:

`.github/workflows/pages.yml`

The project-site URL is:

`https://maggiemooningles-web.github.io/open-today-alicante/`

GitHub Pages must be configured with **Source → GitHub Actions**.

## Local development

```bash
npm run update:data
npm run discover:locations
npm run generate:sitemap
```

Internet access is required for the data scripts.

## Official references

Municipality index: https://www.diputacionalicante.es/los-municipios/

Alicante open-data portal: https://datosabiertos.diputacionalicante.es/

OpenStreetMap attribution: https://www.openstreetmap.org/copyright
