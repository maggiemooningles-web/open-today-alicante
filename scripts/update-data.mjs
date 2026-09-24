import fs from 'node:fs/promises';

const sourcesPath = new URL('../data/source-registry.json', import.meta.url);
const reportPath = new URL('../data/update-report.json', import.meta.url);
const sources = JSON.parse(await fs.readFile(sourcesPath, 'utf8'));

const checkedAt = new Date().toISOString();
const results = [];

for (const source of sources) {
  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': 'OpenTodayAlicanteBot/1.0 (+https://opentodayalicante.com)' },
      redirect: 'follow'
    });
    results.push({
      id: source.id,
      name: source.name,
      url: source.url,
      ok: response.ok,
      status: response.status,
      checkedAt
    });
  } catch (error) {
    results.push({
      id: source.id,
      name: source.name,
      url: source.url,
      ok: false,
      status: null,
      error: String(error),
      checkedAt
    });
  }
}

const report = {
  version: '10.1.0',
  checkedAt,
  status: results.every(r => r.ok) ? 'sources-healthy' : 'sources-needing-review',
  automaticMode: 'source-health',
  note: 'The scheduled job verifies first-party source availability. Store hours are not overwritten blindly; changes should be promoted only after a structured source match or human verification.',
  sources: results
};

await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Checked ${results.length} sources at ${checkedAt}`);
