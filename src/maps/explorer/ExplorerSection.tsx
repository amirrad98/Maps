import * as turf from '@turf/turf'
import type { FeatureCollection, Geometry } from 'geojson'
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map,
  MapLayerMouseEvent,
} from 'maplibre-gl'
import {
  Check,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Route,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
}

type TrailData = {
  source: string
  generatedAt: string
  count: number
  routeCount: number
  trails: Trail[]
}

type TrailFeatureProperties = {
  trailId?: number
  trailSlug?: string
  trailTitle?: string
  kind?: string
  stroke?: string
  type?: string
}

type TrailFeatureCollection = FeatureCollection<
  Geometry,
  TrailFeatureProperties
>

function setLayerVisibility(map: Map, layerId: string, visible: boolean) {
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
  const [mapInstance, setMapInstance] = useState<Map | null>(null)
  const [showRoutes, setShowRoutes] = useState(true)
  const [showPoints, setShowPoints] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedTrailId, setSelectedTrailId] = useState<number | null>(null)

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
    ])
      .then(([metadata, geoJson]) => {
        setTrailData(metadata)
        setTrailGeoJson(geoJson)
        setSelectedTrailId(
          metadata.trails.find((trail) => trail.center)?.id ?? null,
        )
      })
      .catch((error: unknown) => {
        console.error(error)
      })
  }, [])

  const trails = trailData?.trails ?? EMPTY_TRAILS
  const selectedTrail =
    trails.find((trail) => trail.id === selectedTrailId) ?? null

  const categories = useMemo(() => {
    const values = new Set<string>()

    for (const trail of trails) {
      for (const category of trail.categories) {
        if (category !== 'Trail') values.add(category)
      }
    }

    return ['All', ...Array.from(values).sort((a, b) => a.localeCompare(b))]
  }, [trails])

  const filteredTrails = useMemo(() => {
    const query = normalizeSearch(searchQuery)

    return trails.filter((trail) => {
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
  }, [searchQuery, selectedCategory, trails])

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
    (map: Map) => {
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
            'circle-color': '#2f7d55',
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

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const trailId = Number(feature?.properties?.trailId)
      if (Number.isFinite(trailId)) setSelectedTrailId(trailId)
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
  }, [mapInstance])

  const fitToTrails = useCallback(
    (scope: 'all' | 'selected' = 'all') => {
      if (!mapInstance) return

      const bounds =
        scope === 'selected' && selectedTrail?.center
          ? getTrailBounds([selectedTrail])
          : getTrailBounds(filteredTrails)

      if (!bounds) return

      mapInstance.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        {
          padding: 80,
          maxZoom: scope === 'selected' ? 12 : 8,
          duration: 700,
        },
      )
    },
    [filteredTrails, mapInstance, selectedTrail],
  )

  useEffect(() => {
    if (!mapInstance || !trailData) return
    fitToTrails('all')
  }, [fitToTrails, mapInstance, trailData])

  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1600px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)_360px]">
      <aside className="h-fit rounded-md border border-line bg-white shadow-panel lg:sticky lg:top-4">
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

        <div className="space-y-4 p-4">
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
              <Database className="size-4 text-forest" aria-hidden="true" />
              Category
            </div>
            <select
              className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none ring-water transition focus:ring-2"
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
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
            onClick={() => fitToTrails('all')}
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
                key={trail.id}
                onClick={() => {
                  setSelectedTrailId(trail.id)
                  window.setTimeout(() => fitToTrails('selected'), 0)
                }}
                type="button"
              >
                <span className="font-semibold text-ink">{trail.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    {trail.distanceKm
                      ? `${trail.distanceKm.toFixed(1)} km`
                      : 'No route distance'}
                  </span>
                  <span>
                    {trail.hasRoute ? 'Route geometry' : 'Point/details only'}
                  </span>
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
            <h2 className="mt-1 text-lg font-bold text-ink">
              {selectedTrail?.title ?? 'Choose a trail'}
            </h2>
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
                <div className="rounded-md bg-field p-3">
                  <dt className="text-slate-500">Features</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {selectedTrail.featureCount}
                  </dd>
                </div>
                <div className="rounded-md bg-field p-3">
                  <dt className="text-slate-500">Published</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatDate(selectedTrail.date)}
                  </dd>
                </div>
                <div className="rounded-md bg-field p-3">
                  <dt className="text-slate-500">Images</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {selectedTrail.images.length}
                  </dd>
                </div>
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
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-forest/90"
                  href={selectedTrail.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open source post
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
                <Button
                  onClick={() => fitToTrails('selected')}
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
