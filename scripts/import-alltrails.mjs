import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_INPUT_DIR = 'imports/alltrails'
const DEFAULT_OUTPUT = 'public/data/alltrails.json'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function isTrailRecord(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.ID !== 'undefined' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string'
  )
}

function collectTrailRecords(value, records = []) {
  if (!value || typeof value !== 'object') return records

  if (Array.isArray(value)) {
    for (const item of value) collectTrailRecords(item, records)
    return records
  }

  if (Array.isArray(value.searchResults)) {
    for (const item of value.searchResults) {
      if (isTrailRecord(item)) records.push(item)
    }
  }

  if (Array.isArray(value.trails)) {
    for (const item of value.trails) {
      if (isTrailRecord(item)) records.push(item)
    }
  }

  return records
}

function numberFrom(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringFrom(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function getCoordinate(record, key) {
  if (Number.isFinite(record[key])) return record[key]
  if (Number.isFinite(record._geoloc?.[key])) return record._geoloc[key]
  return null
}

function normalizeTrail(record) {
  const lat = getCoordinate(record, 'lat')
  const lng = getCoordinate(record, 'lng')

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return {
    ID: numberFrom(record.ID),
    name: record.name.trim(),
    lat,
    lng,
    length: numberFrom(record.length),
    elevation_gain: numberFrom(record.elevation_gain),
    difficulty_rating: String(record.difficulty_rating ?? ''),
    route_type: stringFrom(record.route_type),
    avg_rating: numberFrom(record.avg_rating),
    num_reviews: numberFrom(record.num_reviews),
    num_photos: numberFrom(record.num_photos ?? record.photos_count),
    slug: record.slug.replace(/^\/+/, ''),
    popularity: numberFrom(record.popularity),
    duration_minutes: numberFrom(
      record.duration_minutes ?? record.duration_minutes_hiking,
    ),
    duration_minutes_hiking: numberFrom(
      record.duration_minutes_hiking ?? record.duration_minutes,
    ),
    country_name: stringFrom(record.country_name, 'Canada'),
    state_name: stringFrom(record.state_name, 'British Columbia'),
    location_label: stringFrom(record.location_label),
  }
}

function isBritishColumbiaTrail(trail) {
  const haystack = [
    trail.country_name,
    trail.state_name,
    trail.location_label,
    trail.slug,
  ]
    .join(' ')
    .toLowerCase()

  return (
    haystack.includes('british columbia') ||
    haystack.includes('/canada/british-columbia/')
  )
}

async function listDefaultInputs() {
  if (!existsSync(DEFAULT_INPUT_DIR)) return []

  const names = await readdir(DEFAULT_INPUT_DIR)
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(DEFAULT_INPUT_DIR, name))
}

async function readInputFile(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

const inputPaths = process.argv.slice(2)
const paths = inputPaths.length ? inputPaths : await listDefaultInputs()

if (!paths.length) {
  throw new Error(
    `No input files found. Add AllTrails response JSON files to ${DEFAULT_INPUT_DIR}/ or pass file paths to this script.`,
  )
}

const seen = new Set()
const trails = []

for (const inputPath of paths) {
  const data = await readInputFile(inputPath)
  const records = collectTrailRecords(data)

  for (const record of records) {
    const trail = normalizeTrail(record)
    if (!trail || !isBritishColumbiaTrail(trail) || seen.has(trail.ID)) {
      continue
    }

    seen.add(trail.ID)
    trails.push(trail)
  }
}

trails.sort((a, b) => a.name.localeCompare(b.name))

await mkdir(path.dirname(DEFAULT_OUTPUT), { recursive: true })
await writeFile(
  DEFAULT_OUTPUT,
  `${JSON.stringify(
    {
      source: 'alltrails-export',
      region: 'British Columbia, Canada',
      generatedAt: new Date().toISOString(),
      count: trails.length,
      trails,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote ${trails.length} British Columbia AllTrails records.`)
