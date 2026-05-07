import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const INPUT = 'public/data/bc-fish-waterbodies.json'
const OUTPUT = 'public/data/bc-fish-waterbodies-mapped.geojson'

const REGION_BOUNDS = {
  'region-1': {
    name: 'Vancouver Island',
    minLng: -129.5,
    maxLng: -122.9,
    minLat: 48.0,
    maxLat: 51.3,
  },
  'region-2': {
    name: 'Lower Mainland',
    minLng: -123.9,
    maxLng: -120.0,
    minLat: 48.6,
    maxLat: 50.9,
  },
  'region-3': {
    name: 'Thompson-Nicola',
    minLng: -122.8,
    maxLng: -117.7,
    minLat: 49.8,
    maxLat: 52.6,
  },
  'region-4': {
    name: 'Kootenay',
    minLng: -119.0,
    maxLng: -113.2,
    minLat: 48.4,
    maxLat: 52.2,
  },
  'region-5': {
    name: 'Cariboo',
    minLng: -124.8,
    maxLng: -119.0,
    minLat: 50.7,
    maxLat: 54.6,
  },
  'region-6': {
    name: 'Skeena',
    minLng: -133.2,
    maxLng: -124.8,
    minLat: 53.1,
    maxLat: 60.2,
  },
  'region-7a': {
    name: 'Omineca',
    minLng: -127.8,
    maxLng: -119.0,
    minLat: 52.6,
    maxLat: 57.6,
  },
  'region-7b': {
    name: 'Peace',
    minLng: -124.6,
    maxLng: -119.0,
    minLat: 54.8,
    maxLat: 60.2,
  },
  'region-8': {
    name: 'Okanagan',
    minLng: -121.4,
    maxLng: -117.8,
    minLat: 48.7,
    maxLat: 51.2,
  },
}

function normalizeName(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(r|river|lake|lakes|creek|cr|crk|reservoir|res)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function displayQueryName(record) {
  if (record.waterbodyType === 'river' && /\br\b/i.test(record.waterbodyName)) {
    return record.waterbodyName.replace(/\br\b/gi, 'River')
  }

  return record.waterbodyName
}

function candidateQueries(record) {
  const base = displayQueryName(record)
  const queries = [base]

  if (record.waterbodyType === 'lake' && !/\blake\b/i.test(base)) {
    queries.push(`${base} Lake`)
  }

  if (record.waterbodyType === 'river' && !/\b(river|creek|crk)\b/i.test(base)) {
    queries.push(`${base} River`, `${base} Creek`)
  }

  return [...new Set(queries)]
}

function parseRecordedCoordinate(value, isLongitude) {
  const absolute = Math.abs(Number(value))
  if (!Number.isFinite(absolute)) return null

  const text = String(Math.trunc(absolute)).padStart(isLongitude ? 7 : 6, '0')
  const degreeDigits = text.length - 4
  const degrees = Number(text.slice(0, degreeDigits))
  const minutes = Number(text.slice(degreeDigits, degreeDigits + 2))
  const seconds = Number(text.slice(degreeDigits + 2))

  if (![degrees, minutes, seconds].every(Number.isFinite)) return null

  const decimal = degrees + minutes / 60 + seconds / 3600
  return isLongitude ? -decimal : decimal
}

function isCompatibleFeature(feature, waterbodyType) {
  const type = String(feature.properties?.featureType ?? '').toLowerCase()
  const category = String(
    feature.properties?.featureCategoryDescription ?? '',
  ).toLowerCase()

  if (waterbodyType === 'river') {
    return (
      type.includes('river') ||
      type.includes('creek') ||
      category.includes('flowing freshwater')
    )
  }

  return type.includes('lake') || category.includes('standing water')
}

function isInRegion(lng, lat, regionId) {
  const bounds = REGION_BOUNDS[regionId]
  if (!bounds) return false

  return (
    lng >= bounds.minLng &&
    lng <= bounds.maxLng &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat
  )
}

function getFeatureLonLat(feature) {
  const lng = parseRecordedCoordinate(feature.properties?.lonAsRecorded, true)
  const lat = parseRecordedCoordinate(feature.properties?.latAsRecorded, false)

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

const searchCache = new Map()

async function searchBcNames(query) {
  if (searchCache.has(query)) return searchCache.get(query)

  const url = new URL(
    'https://apps.gov.bc.ca/pub/bcgnws/names/official/search',
  )
  url.searchParams.set('name', query)
  url.searchParams.set('outputFormat', 'json')
  url.searchParams.set('itemsPerPage', '25')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`BCGNWS request failed ${response.status}: ${url}`)
  }

  const data = await response.json()
  const features = Array.isArray(data.features) ? data.features : []
  searchCache.set(query, features)
  return features
}

async function matchWaterbody(record) {
  const sourceBase = normalizeName(record.waterbodyName)

  for (const query of candidateQueries(record)) {
    const features = await searchBcNames(query)
    const candidates = features
      .map((feature) => {
        const coordinates = getFeatureLonLat(feature)
        return { feature, coordinates }
      })
      .filter(({ feature, coordinates }) => {
        if (!coordinates) return false
        const candidateBase = normalizeName(feature.properties?.name)
        return (
          isCompatibleFeature(feature, record.waterbodyType) &&
          candidateBase === sourceBase &&
          isInRegion(coordinates[0], coordinates[1], record.regionId)
        )
      })

    if (candidates.length === 1) return candidates[0]

    const exactQueryBase = normalizeName(query)
    const exact = candidates.filter(
      ({ feature }) => normalizeName(feature.properties?.name) === exactQueryBase,
    )
    if (exact.length === 1) return exact[0]
  }

  return null
}

const data = JSON.parse(await readFile(INPUT, 'utf8'))
const unique = new Map()

for (const record of data.records) {
  const key = [
    record.regionId,
    record.reportRegion,
    record.waterbodyName,
    record.nearestTown,
    record.waterbodyType,
  ].join('|')

  if (!unique.has(key)) unique.set(key, record)
}

const features = []
const regionStats = {}

for (const regionId of Object.keys(REGION_BOUNDS)) {
  regionStats[regionId] = {
    regionId,
    regionName: REGION_BOUNDS[regionId].name,
    checkedWaterbodies: 0,
    matchedWaterbodies: 0,
  }
}

let checked = 0

for (const record of unique.values()) {
  checked += 1
  regionStats[record.regionId].checkedWaterbodies += 1
  const match = await matchWaterbody(record)

  if (!match) {
    console.log(
      `No match: ${record.regionName} / ${record.waterbodyName} (${record.nearestTown})`,
    )
    continue
  }

  regionStats[record.regionId].matchedWaterbodies += 1
  features.push({
    type: 'Feature',
    properties: {
      waterbodyName: record.waterbodyName,
      nearestTown: record.nearestTown,
      waterbodyType: record.waterbodyType,
      regionId: record.regionId,
      regionName: record.regionName,
      reportRegion: record.reportRegion,
      bcgnwsName: match.feature.properties.name,
      bcgnwsUri: match.feature.properties.uri,
      featureType: match.feature.properties.featureType,
      matchConfidence: 'high',
    },
    geometry: {
      type: 'Point',
      coordinates: match.coordinates,
    },
  })

  console.log(
    `Matched ${features.length}/${checked}: ${record.regionName} / ${record.waterbodyName} -> ${match.feature.properties.name}`,
  )
}

await mkdir(path.dirname(OUTPUT), { recursive: true })
await writeFile(
  OUTPUT,
  `${JSON.stringify(
    {
      type: 'FeatureCollection',
      properties: {
        source: 'BC Geographical Names Web Service',
        sourceUrl: 'https://apps.gov.bc.ca/pub/bcgnws/',
        generatedAt: new Date().toISOString(),
        checkedWaterbodies: unique.size,
        matchedWaterbodies: features.length,
        regions: Object.values(regionStats),
      },
      features,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote ${features.length} of ${unique.size} waterbodies.`)
