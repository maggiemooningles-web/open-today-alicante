# Open Today Alicante V10

Consumer-first local opening directory for Alicante and nearby towns.

## Automatic data refresh

The repository includes a conservative updater at `scripts/update-data.mjs` and a GitHub Actions schedule in `.github/workflows/refresh-data.yml`.

The updater checks official/first-party sources listed in `data/source-registry.json`, attempts structured-data matches, updates hours only when the match is strong enough, and writes an audit report to `data/update-report.json`.

It deliberately does **not** scrape Google Maps or blindly overwrite hours from weak matches.

## Deploy

Serve this directory from the domain root so `/data/stores.json`, `/sw.js`, `/manifest.webmanifest`, `/tienda/...`, and the route rewrites resolve correctly.

Replace `__SITE_URL__` in `sitemap.xml` and `robots.txt` before production deployment.

For shared automatic updates, push this folder to GitHub with Actions enabled and grant the workflow `contents: write` permission (the workflow already requests it).

## Local update

```bash
npm run update:data
```

Internet access is required for the updater.
