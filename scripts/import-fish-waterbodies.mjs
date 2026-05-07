import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUTPUT = 'public/data/bc-fish-waterbodies.json'
const YEARS = [2025, 2024, 2023, 2022, 2021]
const REPORT_REGIONS = [
  {
    reportRegion: 'VANCOUVER ISLAND',
    regionId: 'region-1',
    regionName: 'Vancouver Island',
  },
  {
    reportRegion: 'LOWER MAINLAND',
    regionId: 'region-2',
    regionName: 'Lower Mainland',
  },
  {
    reportRegion: 'THOMPSON-NICOLA',
    regionId: 'region-3',
    regionName: 'Thompson-Nicola',
  },
  {
    reportRegion: 'EAST KOOTENAY',
    regionId: 'region-4',
    regionName: 'Kootenay',
  },
  {
    reportRegion: 'WEST KOOTENAY',
    regionId: 'region-4',
    regionName: 'Kootenay',
  },
  {
    reportRegion: 'CARIBOO',
    regionId: 'region-5',
    regionName: 'Cariboo',
  },
  {
    reportRegion: 'SKEENA',
    regionId: 'region-6',
    regionName: 'Skeena',
  },
  {
    reportRegion: 'OMINECA',
    regionId: 'region-7a',
    regionName: 'Omineca',
  },
  {
    reportRegion: 'PEACE',
    regionId: 'region-7b',
    regionName: 'Peace',
  },
  {
    reportRegion: 'OKANAGAN',
    regionId: 'region-8',
    regionName: 'Okanagan',
  },
]

function decodeEntities(value = '') {
  const entities = {
    amp: '&',
    apos: "'",
    '#039': "'",
    quot: '"',
    nbsp: ' ',
    ndash: '-',
    mdash: '-',
  }

  return value.replace(/&([^;]+);/g, (match, entity) => {
    if (entities[entity]) return entities[entity]
    if (entity.startsWith('#x')) {
      return String.fromCharCode(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCharCode(Number.parseInt(entity.slice(1), 10))
    }
    return match
  })
}

function stripTags(value = '') {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferWaterbodyType(name) {
  return /\b(r|river|creek|crk)\b/i.test(name) ? 'river' : 'lake'
}

function getReportUrl(reportRegion, year) {
  const region = encodeURIComponent(reportRegion).replace(/%20/g, '+')
  return `https://www.gofishbc.com/stocked-fish/?region=${region}&rel_year=${year}&reportType=regional`
}

function parseRows(html, { year, reportRegion, regionId, regionName }) {
  const tableMatch = html.match(
    /<table[^>]*id=["']report_table["'][\s\S]*?<\/table>/i,
  )

  if (!tableMatch) return []

  const rows = []
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch

  while ((rowMatch = rowPattern.exec(tableMatch[0]))) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => stripTags(cell[1]))

    if (cells.length !== 7) continue

    const [
      waterbodyName,
      nearestTown,
      species,
      strain,
      lifeStage,
      genotype,
      quantityText,
    ] = cells
    const quantity = Number(quantityText.replace(/,/g, ''))

    if (!waterbodyName || !species || !Number.isFinite(quantity)) continue

    rows.push({
      id: [
        year,
        reportRegion,
        waterbodyName,
        nearestTown,
        species,
        strain,
        lifeStage,
        genotype,
        quantity,
        rows.length,
      ]
        .join('|')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      year,
      regionId,
      regionName,
      reportRegion,
      waterbodyName,
      nearestTown,
      waterbodyType: inferWaterbodyType(waterbodyName),
      species,
      strain,
      lifeStage,
      genotype,
      quantity,
    })
  }

  return rows
}

const records = []

for (const year of YEARS) {
  for (const region of REPORT_REGIONS) {
    const url = getReportUrl(region.reportRegion, year)
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Request failed ${response.status}: ${url}`)
    }

    const html = await response.text()
    const rows = parseRows(html, { ...region, year })
    records.push(...rows)
    console.log(`${year} ${region.reportRegion}: ${rows.length} records`)
  }
}

const species = [...new Set(records.map((record) => record.species))].sort()

await mkdir(path.dirname(OUTPUT), { recursive: true })
await writeFile(
  OUTPUT,
  `${JSON.stringify(
    {
      source: 'GoFishBC Fish Stocking Reports',
      sourceUrl: 'https://www.gofishbc.com/stocked-fish/',
      generatedAt: new Date().toISOString(),
      years: YEARS,
      count: records.length,
      species,
      records,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote ${records.length} waterbody stocking records.`)
