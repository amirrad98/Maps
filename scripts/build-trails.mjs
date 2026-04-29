import { writeFile, mkdir } from 'node:fs/promises'
import * as turf from '@turf/turf'

const API_ROOT = 'https://hiking.princegeorge.tech/wp-json/wp/v2'
const SITE_ROOT = 'https://hiking.princegeorge.tech'
const TRAIL_CATEGORY_ID = 91

function stripTags(html = '') {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function decodeEntities(value = '') {
  const entities = {
    amp: '&',
    apos: "'",
    '#039': "'",
    quot: '"',
    nbsp: ' ',
    ndash: '-',
    mdash: '-',
    hellip: '...',
  }

  return value.replace(/&([^;]+);/g, (match, entity) => {
    if (entities[entity]) return entities[entity]
    if (entity.startsWith('#x')) return String.fromCharCode(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCharCode(Number.parseInt(entity.slice(1), 10))
    return match
  })
}

function cleanTitle(value = '') {
  return stripTags(value).replace(/\s+Map$/i, '').trim()
}

async function fetchJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`)
  }

  return response.json()
}

async function fetchAllPosts() {
  const firstUrl = `${API_ROOT}/posts?categories=${TRAIL_CATEGORY_ID}&per_page=100&page=1&_embed=1`
  const firstResponse = await fetch(firstUrl)

  if (!firstResponse.ok) {
    throw new Error(`Request failed ${firstResponse.status}: ${firstUrl}`)
  }

  const totalPages = Number(firstResponse.headers.get('x-wp-totalpages') ?? '1')
  const posts = await firstResponse.json()

  for (let page = 2; page <= totalPages; page += 1) {
    posts.push(
      ...(await fetchJson(
        `${API_ROOT}/posts?categories=${TRAIL_CATEGORY_ID}&per_page=100&page=${page}&_embed=1`,
      )),
    )
  }

  return posts
}

async function fetchCategories() {
  const categories = await fetchJson(`${API_ROOT}/categories?per_page=100`)
  return new Map(categories.map((category) => [category.id, category.name]))
}

function extractDescription(html) {
  const match = html.match(/<h2[^>]*>\s*<strong>\s*Description:\s*<\/strong>\s*<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i)

  if (match) return stripTags(match[1])

  const fallback = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  return fallback ? stripTags(fallback[1]) : ''
}

function extractLinks(html) {
  const links = []
  const seen = new Set()
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = pattern.exec(html))) {
    const href = decodeEntities(match[1])
    const label = stripTags(match[2])

    if (!href || !label || seen.has(`${label}|${href}`)) continue

    if (
      /spotwx|firesmoke|avalanche|maps\.google|google\.com\/maps|alltrails|strava|trailforks|waymarkedtrails|openstreetmap/i.test(
        href,
      )
    ) {
      links.push({ label, href })
      seen.add(`${label}|${href}`)
    }
  }

  return links
}

function extractImages(post, html) {
  const images = []
  const seen = new Set()
  const featured = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || post.jetpack_featured_media_url

  if (featured) {
    images.push(featured)
    seen.add(featured)
  }

  for (const pattern of [
    /data-orig-file=["']([^"']+)["']/gi,
    /data-large-file=["']([^"']+)["']/gi,
    /<img\b[^>]*src=["']([^"']+)["']/gi,
  ]) {
    let match
    while ((match = pattern.exec(html))) {
      const url = decodeEntities(match[1])
      if (!url || seen.has(url)) continue
      images.push(url)
      seen.add(url)
    }
  }

  return images
}

function extractForecastCoordinate(html) {
  const patterns = [
    /[?&]lat=([-\d.]+)&(?:amp;)?lon=([-\d.]+)/i,
    /[?&]lat=([-\d.]+)&(?:amp;)?lng=([-\d.]+)/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match) {
      const lat = Number(match[1])
      const lon = Number(match[2])

      if (Number.isFinite(lat) && Number.isFinite(lon)) return [lon, lat]
    }
  }

  return null
}

function extractWaymarkCollections(html) {
  const collections = []
  const pattern =
    /waymark_viewer\.load_json\((\{"type":"FeatureCollection"[\s\S]*?\})\);\s*waymark_viewer\.load_done/gi
  let match

  while ((match = pattern.exec(html))) {
    try {
      collections.push(JSON.parse(match[1]))
    } catch (error) {
      console.warn('Unable to parse Waymark JSON block:', error.message)
    }
  }

  return collections
}

function getFeatureCoordinates(feature) {
  const geometry = feature?.geometry

  if (!geometry) return []
  if (geometry.type === 'Point') return [geometry.coordinates]
  if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates.flat()
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)

  return []
}

function calculateCenter(features, fallbackCoordinate) {
  const coordinates = features.flatMap(getFeatureCoordinates).filter((coordinate) => {
    return Number.isFinite(coordinate?.[0]) && Number.isFinite(coordinate?.[1])
  })

  if (!coordinates.length) return fallbackCoordinate

  const collection = turf.featureCollection(coordinates.map((coordinate) => turf.point(coordinate)))
  return turf.center(collection).geometry.coordinates
}

function calculateDistanceKm(features) {
  return features.reduce((total, feature) => {
    if (feature.geometry?.type === 'LineString') return total + turf.length(feature, { units: 'kilometers' })
    if (feature.geometry?.type === 'MultiLineString') {
      return (
        total +
        feature.geometry.coordinates.reduce((sum, line) => {
          return sum + turf.length(turf.lineString(line), { units: 'kilometers' })
        }, 0)
      )
    }

    return total
  }, 0)
}

function buildTrail(post, categoryNames) {
  const html = post.content?.rendered ?? ''
  const waymarkCollections = extractWaymarkCollections(html)
  const features = waymarkCollections.flatMap((collection) => collection.features ?? [])
  const forecastCoordinate = extractForecastCoordinate(html)
  const center = calculateCenter(features, forecastCoordinate)
  const distanceKm = calculateDistanceKm(features)
  const title = cleanTitle(post.title?.rendered)
  const categories = (post.categories ?? []).map((id) => categoryNames.get(id)).filter(Boolean)

  return {
    id: post.id,
    slug: post.slug,
    title,
    url: post.link,
    date: post.date,
    modified: post.modified,
    description: extractDescription(html),
    excerpt: stripTags(post.excerpt?.rendered ?? ''),
    categories,
    image: extractImages(post, html)[0] ?? null,
    images: extractImages(post, html),
    links: extractLinks(html),
    center,
    forecastCoordinate,
    distanceKm: Number(distanceKm.toFixed(2)),
    featureCount: features.length,
    hasRoute: features.some((feature) => /LineString/.test(feature.geometry?.type ?? '')),
    features: features.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        trailId: post.id,
        trailSlug: post.slug,
        trailTitle: title,
        sourceUrl: post.link,
        featureIndex: index,
      },
    })),
  }
}

function buildGeoJson(trails) {
  const features = []

  for (const trail of trails) {
    for (const feature of trail.features) features.push(feature)

    if (trail.center) {
      features.push({
        type: 'Feature',
        properties: {
          trailId: trail.id,
          trailSlug: trail.slug,
          trailTitle: trail.title,
          sourceUrl: trail.url,
          kind: 'trail-center',
          distanceKm: trail.distanceKm,
          featureCount: trail.featureCount,
        },
        geometry: {
          type: 'Point',
          coordinates: trail.center,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

const posts = await fetchAllPosts()
const categoryNames = await fetchCategories()
const trails = posts.map((post) => buildTrail(post, categoryNames))
const geoJson = buildGeoJson(trails)
const trailMetadata = trails.map(({ features, ...trail }) => trail)

await mkdir('public/data', { recursive: true })
await writeFile(
  'public/data/pg-trails.json',
  `${JSON.stringify(
    {
      source: `${SITE_ROOT}/category/trail/`,
      sourceCategoryId: TRAIL_CATEGORY_ID,
      generatedAt: new Date().toISOString(),
      count: trails.length,
      routeCount: trails.filter((trail) => trail.hasRoute).length,
      trails: trailMetadata,
    },
    null,
    2,
  )}\n`,
)
await writeFile('public/data/pg-trails.geojson', `${JSON.stringify(geoJson, null, 2)}\n`)

console.log(
  `Wrote ${trails.length} trails, ${trails.filter((trail) => trail.hasRoute).length} with route geometry, ${geoJson.features.length} GeoJSON features.`,
)
