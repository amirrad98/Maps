import { readFile, writeFile } from 'node:fs/promises'
import { compactTrailGeoJson } from './lib/compact-geojson.mjs'

// Re-compacts the committed trail data without re-scraping the source site.
const GEOJSON = 'public/data/pg-trails.geojson'
const METADATA = 'public/data/pg-trails.json'

const geoJson = JSON.parse(await readFile(GEOJSON, 'utf8'))
const compacted = JSON.stringify(compactTrailGeoJson(geoJson))
await writeFile(GEOJSON, `${compacted}\n`)

const metadata = JSON.parse(await readFile(METADATA, 'utf8'))
await writeFile(METADATA, `${JSON.stringify(metadata)}\n`)

console.log(`Wrote ${GEOJSON} (${(compacted.length / 1024).toFixed(0)} KB)`)
