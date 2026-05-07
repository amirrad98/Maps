import * as turf from '@turf/turf'
import type { FeatureCollection, Geometry } from 'geojson'
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from 'maplibre-gl'
import {
  Check,
  Compass,
  ExternalLink,
  Eye,
  EyeOff,
  Footprints,
  Image as ImageIcon,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Route,
  Search,
  SlidersHorizontal,
  Trees,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { MapCanvas } from '../../components/ui/MapCanvas'

const PRINCE_GEORGE_CENTER: [number, number] = [-122.7497, 53.9171]
const SOURCE_ID = 'pg-trails'
const ROUTE_LAYER_ID = 'pg-trail-routes'
const SELECTED_ROUTE_LAYER_ID = 'pg-trail-routes-selected'
const POINT_LAYER_ID = 'pg-trail-points'
const SELECTED_POINT_LAYER_ID = 'pg-trail-points-selected'
const LABEL_LAYER_ID = 'pg-trail-labels'
const EMPTY_TRAILS: Trail[] = []
const ROUTE_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['LineString', 'MultiLineString']],
] as FilterSpecification
const TRAIL_CENTER_FILTER = [
  '==',
  ['get', 'kind'],
  'trail-center',
] as FilterSpecification
const CATEGORY_GROUPS = [
  {
    title: 'Region',
    icon: Compass,
    categories: ['PG-East', 'PG-South', 'PG-North', 'PG-City', 'PG-West'],
  },
  {
    title: 'Difficulty',
    icon: Footprints,
    categories: [
      'Easy',
      'Moderate',
      'Strenuous',
      'Very Strenuous',
      'Accessible',
    ],
  },
  {
    title: 'Activity',
    icon: Route,
    categories: [
      'Hiking',
      'SnowShoeing',
      'EV Friendly',
      'Camping',
      'Backpacking',
    ],
  },
  {
    title: 'Feature',
    icon: Trees,
    categories: [
      'Waterfalls',
      'Alpine Lake',
      'Caves',
      'Cabin',
      '7 Summits of Northern BC 2024',
    ],
  },
] as const

type TrailLink = {
  label: string
  href: string
}

type Trail = {
  id: number
  slug: string
  title: string
  url: string
  date: string
  modified: string
  description: string
  excerpt: string
  categories: string[]
  image: string | null
  images: string[]
  links: TrailLink[]
  center: [number, number] | null
  forecastCoordinate: [number, number] | null
  distanceKm: number
  featureCount: number
  hasRoute: boolean
  source: 'wordpress' | 'alltrails'
  hidden?: boolean
  duplicateOf?: number
  alltrails?: {
    avgRating: number
    numReviews: number
    numPhotos: number
    elevationGain: number
    difficultyRating: string
    routeType: string
    durationMinutes: number
    popularity: number
  }
}

type AllTrailsRaw = {
  ID: number
  name: string
  lat?: number
  lng?: number
  _geoloc?: {
    lat?: number
    lng?: number
  }
  length?: number
  elevation_gain?: number
  difficulty_rating?: string | number
  route_type?: string
  avg_rating?: number
  num_reviews?: number
  num_photos?: number
  photos_count?: number
  slug: string
  popularity?: number
  duration_minutes?: number
  duration_minutes_hiking?: number
  country_name?: string
  state_name?: string
  location_label?: string
}

type AllTrailsData = {
  source: string
  region: string
  generatedAt: string
  count: number
  trails?: AllTrailsRaw[]
  searchResults?: AllTrailsRaw[]
}

type TrailData = {
  source: string
  generatedAt: string
  count: number
  routeCount: number
  trails: Trail[]
}

const DIFFICULTY_LABELS: Record<string, string> = {
  '1': 'Easy',
  '3': 'Moderate',
  '5': 'Strenuous',
  '7': 'Very Strenuous',
}

const ROUTE_TYPE_LABELS: Record<string, string> = {
  L: 'Loop',
  O: 'Out & Back',
  P: 'Point to Point',
}

function normalizeForMatch(name: string) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\b(trail|loop|hike|path|route|connector)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function convertAllTrailsTrail(raw: AllTrailsRaw): Trail {
  const difficultyRating = String(raw.difficulty_rating ?? '')
  const diffLabel = DIFFICULTY_LABELS[difficultyRating] ?? 'Moderate'
  const lat = raw.lat ?? raw._geoloc?.lat ?? 0
  const lng = raw.lng ?? raw._geoloc?.lng ?? 0
  const length = raw.length ?? 0
  const elevationGain = raw.elevation_gain ?? 0
  const routeType = raw.route_type ?? ''
  const avgRating = raw.avg_rating ?? 0
  const numReviews = raw.num_reviews ?? 0
  const numPhotos = raw.num_photos ?? raw.photos_count ?? 0
  const durationMinutes =
    raw.duration_minutes ?? raw.duration_minutes_hiking ?? 0

  return {
    id: raw.ID,
    slug: raw.slug,
    title: raw.name,
    url: `https://www.alltrails.com/${raw.slug}`,
    date: '',
    modified: '',
    description: '',
    excerpt: '',
    categories: [diffLabel, 'Hiking'],
    image: null,
    images: [],
    links: [
      {
        label: 'View on AllTrails',
        href: `https://www.alltrails.com/${raw.slug}`,
      },
    ],
    center: [lng, lat],
    forecastCoordinate: null,
    distanceKm: Number((length / 1000).toFixed(2)),
    featureCount: 0,
    hasRoute: false,
    source: 'alltrails',
    alltrails: {
      avgRating,
      numReviews,
      numPhotos,
      elevationGain,
      difficultyRating,
      routeType,
      durationMinutes,
      popularity: raw.popularity ?? 0,
    },
  }
}

function mergeAndDeduplicate(wpTrails: Trail[], atTrails: Trail[]): Trail[] {
  const tagged = wpTrails.map((t) => ({ ...t, source: 'wordpress' as const }))
  const converted = atTrails

  const merged: Trail[] = [...tagged]

  for (const atTrail of converted) {
    const normAt = normalizeForMatch(atTrail.title)

    const match = tagged.find((wp) => {
      const normWp = normalizeForMatch(wp.title)
      const nameMatch =
        normWp.includes(normAt) || normAt.includes(normWp) || normWp === normAt
      if (!nameMatch) return false

      if (wp.center && atTrail.center) {
        const dist = haversineKm(
          wp.center[1],
          wp.center[0],
          atTrail.center[1],
          atTrail.center[0],
        )
        return dist < 10
      }
      return true
    })

    if (match) {
      const idx = merged.findIndex((t) => t.id === match.id)
      if (idx !== -1) {
        merged[idx] = { ...merged[idx], alltrails: atTrail.alltrails }
      }
      merged.push({ ...atTrail, hidden: true, duplicateOf: match.id })
    } else {
      merged.push(atTrail)
    }
  }

  return merged
}

type TrailFeatureProperties = {
  trailId?: number
  trailSlug?: string
  trailTitle?: string
  kind?: string
  stroke?: string
  type?: string
  source?: string
}

type TrailFeatureCollection = FeatureCollection<
  Geometry,
  TrailFeatureProperties
>

type CategoryChip = {
  label: string
  value: string
  count: number
}

function setLayerVisibility(
  map: MapLibreMap,
  layerId: string,
  visible: boolean,
) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
}

function getTrailFeatureFilter(trailId: number | null) {
  return (
    trailId
      ? ['==', ['get', 'trailId'], trailId]
      : ['==', ['get', 'trailId'], -1]
  ) as FilterSpecification
}

function getTrailLayerColor(fallback: string) {
  return [
    'case',
    ['has', 'stroke'],
    ['concat', '#', ['get', 'stroke']],
    ['==', ['get', 'type'], 'red'],
    '#d1495b',
    ['==', ['get', 'type'], 'blue'],
    '#2f6fbd',
    ['==', ['get', 'type'], 'orange'],
    '#d3902f',
    fallback,
  ] as ExpressionSpecification
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function normalizeSearch(value: string) {
  return value.toLowerCase().trim()
}

function getTrailBounds(trails: Trail[]) {
  const coordinates = trails
    .map((trail) => trail.center)
    .filter((center): center is [number, number] => Boolean(center))

  if (!coordinates.length) return null

  const bounds = turf.bbox(
    turf.featureCollection(coordinates.map((center) => turf.point(center))),
  )
  return bounds as [number, number, number, number]
}

export function ExplorerSection() {
  const [trailData, setTrailData] = useState<TrailData | null>(null)
  const [trailGeoJson, setTrailGeoJson] =
    useState<TrailFeatureCollection | null>(null)
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null)
  const [showRoutes, setShowRoutes] = useState(true)
  const [showPoints, setShowPoints] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedTrailId, setSelectedTrailId] = useState<number | null>(null)
  const hasFitInitialTrails = useRef(false)

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/pg-trails.json`).then(
        (response) => {
          if (!response.ok)
            throw new Error(`Unable to load trail metadata: ${response.status}`)
          return response.json() as Promise<TrailData>
        },
      ),
      fetch(`${import.meta.env.BASE_URL}data/pg-trails.geojson`).then(
        (response) => {
          if (!response.ok)
            throw new Error(`Unable to load trail geometry: ${response.status}`)
          return response.json() as Promise<TrailFeatureCollection>
        },
      ),
      fetch(`${import.meta.env.BASE_URL}data/alltrails.json`)
        .then((response) => {
          if (!response.ok) return null
          return response.json() as Promise<AllTrailsData>
        })
        .catch(() => null),
    ])
      .then(([metadata, geoJson, alltrailsData]) => {
        const alltrailsRecords =
          alltrailsData?.trails ?? alltrailsData?.searchResults ?? []
        const atTrails = alltrailsData
          ? alltrailsRecords
              .filter((trail) => {
                const lat = trail.lat ?? trail._geoloc?.lat
                const lng = trail.lng ?? trail._geoloc?.lng
                return Number.isFinite(lat) && Number.isFinite(lng)
              })
              .map(convertAllTrailsTrail)
          : []
        const merged = mergeAndDeduplicate(metadata.trails, atTrails)

        const atFeatures = merged
          .filter((t) => t.source === 'alltrails' && !t.hidden && t.center)
          .map((t) => ({
            type: 'Feature' as const,
            properties: {
              trailId: t.id,
              trailSlug: t.slug,
              trailTitle: t.title,
              kind: 'trail-center',
              source: 'alltrails',
            },
            geometry: {
              type: 'Point' as const,
              coordinates: t.center!,
            },
          }))

        const enrichedGeoJson: TrailFeatureCollection = {
          ...geoJson,
          features: [...geoJson.features, ...atFeatures],
        }

        setTrailData({
          ...metadata,
          count: merged.filter((t) => !t.hidden).length,
          trails: merged,
        })
        setTrailGeoJson(enrichedGeoJson)
        setSelectedTrailId(
          merged.find((trail) => trail.center && !trail.hidden)?.id ?? null,
        )
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }, [])

  const trails = trailData?.trails ?? EMPTY_TRAILS
  const visibleTrails = useMemo(
    () => trails.filter((trail) => !trail.hidden),
    [trails],
  )
  const selectedTrail =
    trails.find((trail) => trail.id === selectedTrailId) ?? null

  const categoryGroups = useMemo(() => {
    const counts = new Map<string, number>()

    for (const trail of visibleTrails) {
      for (const category of trail.categories) {
        if (category === 'Trail') continue
        counts.set(category, (counts.get(category) ?? 0) + 1)
      }
    }

    return CATEGORY_GROUPS.map((group) => ({
      ...group,
      categories: group.categories
        .map(
          (category): CategoryChip => ({
            label: category,
            value: category,
            count: counts.get(category) ?? 0,
          }),
        )
        .filter((category) => category.count > 0),
    })).filter((group) => group.categories.length > 0)
  }, [visibleTrails])

  const selectedCategoryLabel =
    selectedCategory === 'All' ? 'All trails' : selectedCategory

  const filteredTrails = useMemo(() => {
    const query = normalizeSearch(searchQuery)

    return visibleTrails.filter((trail) => {
      const matchesSearch =
        !query ||
        normalizeSearch(
          `${trail.title} ${trail.description} ${trail.categories.join(' ')}`,
        ).includes(query)
      const matchesCategory =
        selectedCategory === 'All' ||
        trail.categories.includes(selectedCategory)

      return matchesSearch && matchesCategory
    })
  }, [searchQuery, selectedCategory, visibleTrails])

  const stats = useMemo(() => {
    const totalDistance = filteredTrails.reduce(
      (sum, trail) => sum + trail.distanceKm,
      0,
    )
    return {
      count: filteredTrails.length,
      routeCount: filteredTrails.filter((trail) => trail.hasRoute).length,
      totalDistance: `${Math.round(totalDistance).toLocaleString()} km`,
    }
  }, [filteredTrails])

  const applyTrailLayers = useCallback(
    (map: MapLibreMap) => {
      if (!trailGeoJson) return

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: trailGeoJson,
        })
      } else {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource
        source.setData(trailGeoJson)
      }

      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ROUTE_FILTER,
          paint: {
            'line-color': getTrailLayerColor('#2f7d55'),
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6,
              1.2,
              11,
              3,
              14,
              5,
            ],
            'line-opacity': 0.78,
          },
        })
      }

      if (!map.getLayer(SELECTED_ROUTE_LAYER_ID)) {
        map.addLayer({
          id: SELECTED_ROUTE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: getTrailFeatureFilter(selectedTrailId),
          paint: {
            'line-color': '#111827',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6,
              3,
              11,
              6,
              14,
              9,
            ],
            'line-opacity': 0.95,
          },
        })
      }

      if (!map.getLayer(POINT_LAYER_ID)) {
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: TRAIL_CENTER_FILTER,
          paint: {
            'circle-color': [
              'case',
              ['==', ['get', 'source'], 'alltrails'],
              '#059669',
              '#2f7d55',
            ] as ExpressionSpecification,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              4,
              10,
              6,
              13,
              9,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.8,
            'circle-opacity': 0.9,
          },
        })
      }

      if (!map.getLayer(SELECTED_POINT_LAYER_ID)) {
        map.addLayer({
          id: SELECTED_POINT_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: getTrailFeatureFilter(selectedTrailId),
          paint: {
            'circle-color': '#f59e0b',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              7,
              10,
              10,
              13,
              14,
            ],
            'circle-stroke-color': '#111827',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95,
          },
        })
      }

      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: TRAIL_CENTER_FILTER,
          layout: {
            'text-field': ['get', 'trailTitle'],
            'text-font': ['Open Sans Regular'],
            'text-offset': [0, 1.25],
            'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 11, 12],
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#172033',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.4,
          },
        })
      }

      setLayerVisibility(map, ROUTE_LAYER_ID, showRoutes)
      setLayerVisibility(map, SELECTED_ROUTE_LAYER_ID, showRoutes)
      setLayerVisibility(map, POINT_LAYER_ID, showPoints)
      setLayerVisibility(map, SELECTED_POINT_LAYER_ID, showPoints)
      setLayerVisibility(map, LABEL_LAYER_ID, showPoints)
    },
    [selectedTrailId, showPoints, showRoutes, trailGeoJson],
  )

  useEffect(() => {
    if (!mapInstance) return
    applyTrailLayers(mapInstance)
  }, [applyTrailLayers, mapInstance])

  useEffect(() => {
    if (!mapInstance) return

    setLayerVisibility(mapInstance, ROUTE_LAYER_ID, showRoutes)
    setLayerVisibility(mapInstance, SELECTED_ROUTE_LAYER_ID, showRoutes)
    setLayerVisibility(mapInstance, POINT_LAYER_ID, showPoints)
    setLayerVisibility(mapInstance, SELECTED_POINT_LAYER_ID, showPoints)
    setLayerVisibility(mapInstance, LABEL_LAYER_ID, showPoints)
  }, [mapInstance, showPoints, showRoutes])

  useEffect(() => {
    if (!mapInstance) return

    if (mapInstance.getLayer(SELECTED_ROUTE_LAYER_ID)) {
      mapInstance.setFilter(
        SELECTED_ROUTE_LAYER_ID,
        getTrailFeatureFilter(selectedTrailId),
      )
    }

    if (mapInstance.getLayer(SELECTED_POINT_LAYER_ID)) {
      mapInstance.setFilter(
        SELECTED_POINT_LAYER_ID,
        getTrailFeatureFilter(selectedTrailId),
      )
    }
  }, [mapInstance, selectedTrailId])

  const fitVisibleTrails = useCallback(() => {
    if (!mapInstance) return

    const bounds = getTrailBounds(filteredTrails)
    if (!bounds) return

    mapInstance.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: 80,
        maxZoom: 8,
        duration: 700,
      },
    )
  }, [filteredTrails, mapInstance])

  const focusTrail = useCallback(
    (trail: Trail | null) => {
      if (!mapInstance) return
      if (!trail?.center) return

      mapInstance.easeTo({
        center: trail.center,
        zoom: Math.max(mapInstance.getZoom(), trail.hasRoute ? 12 : 11),
        duration: 650,
      })
    },
    [mapInstance],
  )

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const trailId = Number(feature?.properties?.trailId)
      const trail = trails.find((item) => item.id === trailId)

      if (trail) {
        setSelectedTrailId(trail.id)
        focusTrail(trail)
      }
    }

    const setPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer'
    }
    const clearPointer = () => {
      mapInstance.getCanvas().style.cursor = ''
    }

    for (const layerId of [POINT_LAYER_ID, ROUTE_LAYER_ID]) {
      mapInstance.on('click', layerId, handleClick)
      mapInstance.on('mouseenter', layerId, setPointer)
      mapInstance.on('mouseleave', layerId, clearPointer)
    }

    return () => {
      for (const layerId of [POINT_LAYER_ID, ROUTE_LAYER_ID]) {
        if (!mapInstance.getLayer(layerId)) continue
        mapInstance.off('click', layerId, handleClick)
        mapInstance.off('mouseenter', layerId, setPointer)
        mapInstance.off('mouseleave', layerId, clearPointer)
      }
    }
  }, [focusTrail, mapInstance, trails])

  useEffect(() => {
    if (!mapInstance || !trailData || hasFitInitialTrails.current) return

    const bounds = getTrailBounds(visibleTrails)
    if (!bounds) return

    mapInstance.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: 80,
        maxZoom: 8,
        duration: 700,
      },
    )
    hasFitInitialTrails.current = true
  }, [mapInstance, trailData, visibleTrails])

  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1600px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)_360px]">
      <aside className="h-fit overflow-hidden rounded-md border border-line bg-white shadow-panel lg:sticky lg:top-4 lg:max-h-[calc(100vh-88px)]">
        <div className="border-b border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-forest">
                Trail explorer
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink">
                Prince George hikes
              </h1>
            </div>
            <span className="grid size-9 place-items-center rounded-md bg-field text-water">
              <Route className="size-5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Imported from hiking.princegeorge.tech with route overlays, trail
            centers, source posts, photos, descriptions, and forecast links.
          </p>
        </div>

        <div className="space-y-4 overflow-auto p-4 lg:max-h-[calc(100vh-272px)]">
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Search className="size-4 text-water" aria-hidden="true" />
              Search
            </div>
            <input
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none ring-water transition focus:ring-2"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Trail name, place, category"
              type="search"
              value={searchQuery}
            />
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <SlidersHorizontal
                className="size-4 text-forest"
                aria-hidden="true"
              />
              Filters
            </div>
            <div className="rounded-md border border-line bg-white p-2">
              <button
                aria-expanded={filtersOpen}
                className="flex w-full items-center justify-between gap-3 rounded-md bg-forest px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-forest/90 focus:outline-none focus:ring-2 focus:ring-water"
                onClick={() => setFiltersOpen((open) => !open)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SlidersHorizontal
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Filters</span>
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
                  {stats.count}
                </span>
              </button>

              <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs">
                <span className="min-w-0 truncate text-slate-500">
                  Active:{' '}
                  <span className="font-semibold text-ink">
                    {selectedCategoryLabel}
                  </span>
                </span>
                {selectedCategory !== 'All' && (
                  <button
                    className="shrink-0 font-semibold text-forest hover:text-forest/80"
                    onClick={() => setSelectedCategory('All')}
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>

              {filtersOpen && (
                <div className="mt-3 grid gap-3 border-t border-line pt-3">
                  <button
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
                      selectedCategory === 'All'
                        ? 'bg-forest text-white'
                        : 'bg-field text-ink hover:bg-slate-100'
                    }`}
                    onClick={() => {
                      setSelectedCategory('All')
                      setFiltersOpen(false)
                    }}
                    type="button"
                  >
                    <span>All trails</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        selectedCategory === 'All'
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      {visibleTrails.length}
                    </span>
                  </button>

                  {categoryGroups.map((group) => {
                    const Icon = group.icon

                    return (
                      <div key={group.title}>
                        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase text-slate-500">
                          <Icon
                            className="size-3.5 text-forest"
                            aria-hidden="true"
                          />
                          {group.title}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.categories.map((category) => {
                            const isSelected =
                              selectedCategory === category.value

                            return (
                              <button
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
                                  isSelected
                                    ? 'border-forest bg-forest text-white'
                                    : 'border-line bg-white text-ink hover:border-forest/50 hover:bg-emerald-50'
                                }`}
                                key={category.value}
                                onClick={() => {
                                  setSelectedCategory(category.value)
                                  setFiltersOpen(false)
                                }}
                                type="button"
                              >
                                <span className="truncate">
                                  {category.label}
                                </span>
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                                    isSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-field text-slate-500'
                                  }`}
                                >
                                  {category.count}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Layers className="size-4 text-forest" aria-hidden="true" />
              Layers
            </div>
            <div className="grid gap-2">
              {[
                {
                  label: 'Trail routes',
                  checked: showRoutes,
                  setChecked: setShowRoutes,
                },
                {
                  label: 'Trail points',
                  checked: showPoints,
                  setChecked: setShowPoints,
                },
              ].map((layer) => (
                <label
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-field px-3 py-3 text-sm font-medium text-ink"
                  key={layer.label}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {layer.checked ? (
                      <Eye
                        className="size-4 shrink-0 text-forest"
                        aria-hidden="true"
                      />
                    ) : (
                      <EyeOff
                        className="size-4 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{layer.label}</span>
                  </span>
                  <input
                    checked={layer.checked}
                    className="size-4 shrink-0 accent-forest"
                    onChange={(event) => layer.setChecked(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <MapIcon className="size-4 text-sun" aria-hidden="true" />
              Dataset
            </div>
            <dl className="overflow-hidden rounded-md border border-line text-sm">
              <div className="flex items-center justify-between bg-white px-3 py-2.5">
                <dt className="text-slate-500">Visible trails</dt>
                <dd className="font-semibold text-ink">{stats.count}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-line bg-white px-3 py-2.5">
                <dt className="text-slate-500">With routes</dt>
                <dd className="font-semibold text-ink">{stats.routeCount}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-line bg-white px-3 py-2.5">
                <dt className="text-slate-500">Route distance</dt>
                <dd className="font-semibold text-ink">
                  {stats.totalDistance}
                </dd>
              </div>
            </dl>
          </section>

          <Button
            className="w-full"
            disabled={!trailData || !mapInstance}
            onClick={fitVisibleTrails}
            variant="secondary"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Fit visible trails
          </Button>
        </div>
      </aside>

      <MapCanvas
        center={PRINCE_GEORGE_CENTER}
        className="h-[calc(100vh-88px)] min-h-[680px]"
        onMapReady={setMapInstance}
        zoom={7}
      />

      <aside className="grid min-h-0 gap-4 lg:h-[calc(100vh-88px)] lg:grid-rows-[minmax(260px,1fr)_auto]">
        <section className="min-h-0 overflow-hidden rounded-md border border-line bg-white shadow-panel">
          <div className="border-b border-line p-4">
            <p className="text-xs font-semibold uppercase text-forest">
              Results
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink">
              {filteredTrails.length.toLocaleString()} trails
            </h2>
          </div>
          <div className="max-h-[420px] overflow-auto lg:max-h-none lg:h-[calc(100%-73px)]">
            {filteredTrails.map((trail) => (
              <button
                className={`block w-full border-b border-line px-4 py-3 text-left text-sm transition last:border-b-0 ${
                  trail.id === selectedTrailId
                    ? 'bg-emerald-50'
                    : 'bg-white hover:bg-field'
                }`}
                key={`${trail.source}-${trail.id}`}
                onClick={() => {
                  setSelectedTrailId(trail.id)
                  focusTrail(trail)
                }}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{trail.title}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${
                      trail.source === 'alltrails'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {trail.source === 'alltrails' ? 'AT' : 'WP'}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    {trail.distanceKm
                      ? `${trail.distanceKm.toFixed(1)} km`
                      : 'No route distance'}
                  </span>
                  {trail.alltrails ? (
                    <>
                      <span>
                        {trail.alltrails.avgRating.toFixed(1)} (
                        {trail.alltrails.numReviews})
                      </span>
                      <span>
                        {DIFFICULTY_LABELS[trail.alltrails.difficultyRating] ??
                          'Moderate'}
                      </span>
                    </>
                  ) : (
                    <span>
                      {trail.hasRoute ? 'Route geometry' : 'Point/details only'}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white shadow-panel">
          <div className="border-b border-line p-4">
            <p className="text-xs font-semibold uppercase text-forest">
              Selected trail
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink">
                {selectedTrail?.title ?? 'Choose a trail'}
              </h2>
              {selectedTrail && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${
                    selectedTrail.source === 'alltrails'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {selectedTrail.source === 'alltrails'
                    ? 'AllTrails'
                    : 'WordPress'}
                </span>
              )}
            </div>
          </div>

          {selectedTrail ? (
            <div className="space-y-4 p-4">
              {selectedTrail.image ? (
                <img
                  alt=""
                  className="h-36 w-full rounded-md object-cover"
                  loading="lazy"
                  src={selectedTrail.image}
                />
              ) : (
                <div className="grid h-28 place-items-center rounded-md bg-field text-slate-500">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </div>
              )}

              <p className="text-sm leading-6 text-slate-600">
                {selectedTrail.description ||
                  selectedTrail.excerpt ||
                  'No description available.'}
              </p>

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-field p-3">
                  <dt className="text-slate-500">Distance</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {selectedTrail.distanceKm
                      ? `${selectedTrail.distanceKm.toFixed(1)} km`
                      : 'N/A'}
                  </dd>
                </div>
                {selectedTrail.alltrails ? (
                  <>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Rating</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {selectedTrail.alltrails.avgRating.toFixed(1)} (
                        {selectedTrail.alltrails.numReviews})
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Elev. gain</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {Math.round(selectedTrail.alltrails.elevationGain)} m
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Duration</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {selectedTrail.alltrails.durationMinutes >= 60
                          ? `${Math.floor(selectedTrail.alltrails.durationMinutes / 60)}h ${selectedTrail.alltrails.durationMinutes % 60}m`
                          : `${selectedTrail.alltrails.durationMinutes}m`}
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Difficulty</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {DIFFICULTY_LABELS[
                          selectedTrail.alltrails.difficultyRating
                        ] ?? 'Moderate'}
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Route type</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {ROUTE_TYPE_LABELS[selectedTrail.alltrails.routeType] ??
                          selectedTrail.alltrails.routeType}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Features</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {selectedTrail.featureCount}
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Published</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {selectedTrail.date
                          ? formatDate(selectedTrail.date)
                          : 'N/A'}
                      </dd>
                    </div>
                    <div className="rounded-md bg-field p-3">
                      <dt className="text-slate-500">Images</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {selectedTrail.images.length}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              <div className="flex flex-wrap gap-2">
                {selectedTrail.categories
                  .filter((category) => category !== 'Trail')
                  .slice(0, 6)
                  .map((category) => (
                    <span
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-forest"
                      key={category}
                    >
                      {category}
                    </span>
                  ))}
              </div>

              <div className="grid gap-2">
                <a
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white hover:opacity-90 ${
                    selectedTrail.source === 'alltrails'
                      ? 'bg-emerald-600'
                      : 'bg-forest'
                  }`}
                  href={selectedTrail.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {selectedTrail.source === 'alltrails'
                    ? 'View on AllTrails'
                    : 'Open source post'}
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
                <Button
                  onClick={() => focusTrail(selectedTrail)}
                  variant="secondary"
                >
                  <LocateFixed className="size-4" aria-hidden="true" />
                  Fit selected trail
                </Button>
              </div>

              {selectedTrail.links.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Check className="size-4 text-forest" aria-hidden="true" />
                    Website links
                  </div>
                  <div className="grid gap-2">
                    {selectedTrail.links.slice(0, 8).map((link) => (
                      <a
                        className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-field"
                        href={link.href}
                        key={`${link.label}-${link.href}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">{link.label}</span>
                        <ExternalLink
                          className="size-3.5 shrink-0 text-slate-500"
                          aria-hidden="true"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">
              Select a result or click a trail on the map.
            </p>
          )}
        </section>
      </aside>
    </section>
  )
}
