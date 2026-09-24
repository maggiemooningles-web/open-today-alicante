async function main() {
  const current = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const existingByOsmId = new Set(current.filter(x => x.osmId).map(x => x.osmId));
  const existingSlugs = new Set(current.map(x => x.slug));
  const nameAddressKeys = new Set(current.map(x => `${normalize(x.name)}|${normalize(x.address)}`));
  const groupedByName = new Map();
  for (const store of current) {
    const key = normalize(store.name);
    if (!key) continue;
    if (!groupedByName.has(key)) groupedByName.set(key, []);
    groupedByName.get(key).push(store);
  }

  const discovered = [];
  const errors = [];
  const groups = [
    ...SHOP_GROUPS.map(tags => ({ kind: 'shop', tags })),
    ...AMENITY_GROUPS.map(tags => ({ kind: 'amenity', tags }))
  ];

  for (const group of groups) {
    try {
      const payload = await fetchQuery(buildQuery(group.kind, group.tags));
      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags['name:es'] || tags['name:ca'] || tags['name:en'];
        if (!name) continue;

        const [lat, lng] = elementPoint(el);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const osmId = `osm:${el.type}:${el.id}`;
        if (existingByOsmId.has(osmId)) continue;

        const rawTag = tags.shop || tags.amenity || '';
        const category = CATEGORY_BY_TAG[rawTag] || GENERIC_CATEGORY;
        const town = townFromTags(tags);
        const address = addressFromTags(tags);
        const key = `${normalize(name)}|${normalize(address)}`;
        if (nameAddressKeys.has(key)) continue;

        const sameName = groupedByName.get(normalize(name)) || [];
        const nearExisting = sameName.some(store =>
          Number.isFinite(store.lat) && Number.isFinite(store.lng) &&
          haversineKm(lat, lng, store.lat, store.lng) < 0.08
        );
        if (nearExisting) continue;

        let slug = slugify(`${name}-${town}`);
        if (existingSlugs.has(slug)) slug = `${slug}-osm-${el.id}`;
        existingSlugs.add(slug);

        const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
        discovered.push({
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
          sourceUrl,
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
            sourceUrl,
            sourceType: 'osm-discovery',
            verifiedAt: null,
            status: 'discovered',
            hoursVerified: false
          },
          weeklyHours: null
        });

        nameAddressKeys.add(key);
        existingByOsmId.add(osmId);
        if (!groupedByName.has(normalize(name))) groupedByName.set(normalize(name), []);
        groupedByName.get(normalize(name)).push(discovered[discovered.length - 1]);
      }
    } catch (error) {
      errors.push({ kind: group.kind, tags: group.tags, error: String(error) });
    }

    await pause(1500);
  }

  const merged = current.concat(discovered);
  await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2) + '\n');

  const report = {
    version: '11.1.0',
    checkedAt: new Date().toISOString(),
    automaticMode: 'osm-discovery-plus-source-health',
    dataset: {
      before: current.length,
      discovered: discovered.length,
      after: merged.length,
      source: 'OpenStreetMap',
      groupsAttempted: groups.length,
      groupsFailed: errors.length
    },
    errors,
    notes: [
      'OSM records are discovery-only and never treated as hours-verified.',
      'Existing first-party or manually verified records are preserved.',
      'Opening hours must be promoted from a checkable source before a place can appear in Open Now results.',
      'Public Overpass services are queried conservatively and sequentially.'
    ]
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}

async function main() {
  const current = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const existingByOsmId = new Set(current.filter(x => x.osmId).map(x => x.osmId));
  const existingSlugs = new Set(current.map(x => x.slug));
  const nameAddressKeys = new Set(current.map(x => `${normalize(x.name)}|${normalize(x.address)}`));
  const groupedByName = new Map();
  for (const store of current) {
    const key = normalize(store.name);
    if (!key) continue;
    if (!groupedByName.has(key)) groupedByName.set(key, []);
    groupedByName.get(key).push(store);
  }

  const discovered = [];
  const errors = [];
  const bboxes = makeBboxes();

  for (const bbox of bboxes) {
    try {
      const payload = await fetchQuery(buildQuery(bbox));
      const elements = Array.isArray(payload.elements) ? payload.elements : [];

      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags['name:es'] || tags['name:ca'] || tags['name:en'];
        if (!name) continue;

        const [lat, lng] = elementPoint(el);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const osmId = `osm:${el.type}:${el.id}`;
        if (existingByOsmId.has(osmId)) continue;

        const rawTag = tags.shop || tags.amenity || '';
        const category = CATEGORY_BY_TAG[rawTag] || GENERIC_CATEGORY;
        const town = townFromTags(tags);
        const address = addressFromTags(tags);
        const key = `${normalize(name)}|${normalize(address)}`;
        if (nameAddressKeys.has(key)) continue;

        const sameName = groupedByName.get(normalize(name)) || [];
        const nearExisting = sameName.some(store =>
          Number.isFinite(store.lat) && Number.isFinite(store.lng) &&
          haversineKm(lat, lng, store.lat, store.lng) < 0.08
        );
        if (nearExisting) continue;

        let slug = slugify(`${name}-${town}`);
        if (existingSlugs.has(slug)) slug = `${slug}-osm-${el.id}`;
        existingSlugs.add(slug);

        const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
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
          sourceUrl,
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
            sourceUrl,
            sourceType: 'osm-discovery',
            verifiedAt: null,
            status: 'discovered',
            hoursVerified: false
          },
          weeklyHours: null
        };

        discovered.push(store);
        nameAddressKeys.add(key);
        existingByOsmId.add(osmId);
        if (!groupedByName.has(normalize(name))) groupedByName.set(normalize(name), []);
        groupedByName.get(normalize(name)).push(store);
      }
    } catch (error) {
      errors.push({ bbox, error: String(error) });
    }

    await pause(1200);
  }

  const merged = current.concat(discovered);
  await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2) + '\\n');

  const report = {
    version: '11.2.0',
    checkedAt: new Date().toISOString(),
    automaticMode: 'osm-discovery-plus-source-health',
    dataset: {
      before: current.length,
      discovered: discovered.length,
      after: merged.length,
      source: 'OpenStreetMap',
      bboxesAttempted: bboxes.length,
      bboxesFailed: errors.length
    },
    errors,
    notes: [
      'OSM records are discovery-only and never treated as hours-verified.',
      'Existing first-party or manually verified records are preserved.',
      'Opening hours must be promoted from a checkable source before a place can appear in Open Now results.',
      'OSM discovery is sharded into small bounding boxes to avoid oversized Overpass queries.'
    ]
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\\n');
  console.log(JSON.stringify(report));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
