import * as turf from '@turf/turf'
import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'
import {
  Check,
  Database,
  Eye,
  EyeOff,
  Layers,
  LocateFixed,
  Map as MapIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapCanvas } from '../../components/ui/MapCanvas'
import { Button } from '../../components/ui/Button'

const PRINCE_GEORGE_CENTER: [number, number] = [-122.7497, 53.9171]
const SOURCE_ID = 'sample-points'
const LAYER_ID = 'sample-points-layer'
const LABEL_LAYER_ID = 'sample-points-labels'

type SampleProperties = {
  name: string
  type: string
}

type SamplePoints = FeatureCollection<Point, SampleProperties>

const layerStatus = [
  { label: 'Base map', value: 'CARTO Voyager' },
  { label: 'Overlay', value: 'Sample places' },
  { label: 'Format', value: 'GeoJSON' },
]

function setLayerVisibility(map: Map, visible: boolean) {
  const visibility = visible ? 'visible' : 'none'

  if (map.getLayer(LAYER_ID)) {
    map.setLayoutProperty(LAYER_ID, 'visibility', visibility)
  }

  if (map.getLayer(LABEL_LAYER_ID)) {
    map.setLayoutProperty(LABEL_LAYER_ID, 'visibility', visibility)
  }
}

export function ExplorerSection() {
  const [sampleData, setSampleData] = useState<SamplePoints | null>(null)
  const [showSampleLayer, setShowSampleLayer] = useState(true)
  const [mapInstance, setMapInstance] = useState<Map | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/sample-points.geojson`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load sample points: ${response.status}`)
        }

        return response.json() as Promise<SamplePoints>
      })
      .then(setSampleData)
      .catch((error: unknown) => {
        console.error(error)
      })
  }, [])

  const summary = useMemo(() => {
    if (!sampleData) return null

    const distances = sampleData.features.map((feature) => {
      return turf.distance(turf.point(PRINCE_GEORGE_CENTER), feature, {
        units: 'kilometers',
      })
    })

    const farthest = Math.max(...distances)

    return {
      count: sampleData.features.length,
      farthest: `${farthest.toFixed(1)} km`,
    }
  }, [sampleData])

  const applySampleLayer = useCallback(
    (map: Map) => {
      if (!sampleData) return

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: sampleData,
        })
      } else {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource
        source.setData(sampleData)
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-color': '#2f7d55',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9,
              5,
              13,
              10,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        })
      }

      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-offset': [0, 1.3],
            'text-size': 12,
          },
          paint: {
            'text-color': '#172033',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        })
      }

      setLayerVisibility(map, showSampleLayer)
    },
    [sampleData, showSampleLayer],
  )

  useEffect(() => {
    if (!mapInstance) return
    applySampleLayer(mapInstance)
  }, [applySampleLayer, mapInstance])

  useEffect(() => {
    if (!mapInstance) return
    setLayerVisibility(mapInstance, showSampleLayer)
  }, [mapInstance, showSampleLayer])

  const fitToSampleData = useCallback(() => {
    if (!mapInstance || !sampleData?.features.length) return

    const bounds = turf.bbox(sampleData) as [number, number, number, number]

    mapInstance.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: 80,
        maxZoom: 13,
        duration: 700,
      },
    )
  }, [mapInstance, sampleData])

  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-7xl gap-4 px-4 py-4 sm:px-6 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="h-fit rounded-md border border-line bg-white shadow-panel md:sticky md:top-4">
        <div className="border-b border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-forest">
                Explorer
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink">Map controls</h1>
            </div>
            <span className="grid size-9 place-items-center rounded-md bg-field text-water">
              <LocateFixed className="size-5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Turn layers on or off, inspect the active dataset, and reset the map
            to the loaded sample places.
          </p>
        </div>

        <div className="space-y-4 p-4">
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Layers className="size-4 text-forest" aria-hidden="true" />
              Layers
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-field px-3 py-3 text-sm font-medium text-ink">
              <span className="flex min-w-0 items-center gap-2">
                {showSampleLayer ? (
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
                <span className="truncate">Sample places</span>
              </span>
              <input
                checked={showSampleLayer}
                className="size-4 shrink-0 accent-forest"
                onChange={(event) => setShowSampleLayer(event.target.checked)}
                type="checkbox"
              />
            </label>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <Database className="size-4 text-water" aria-hidden="true" />
              Dataset
            </div>
            <dl className="overflow-hidden rounded-md border border-line text-sm">
              <div className="flex items-center justify-between bg-white px-3 py-2.5">
                <dt className="text-slate-500">Features</dt>
                <dd className="font-semibold text-ink">
                  {summary?.count ?? 'Loading'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-line bg-white px-3 py-2.5">
                <dt className="text-slate-500">Farthest point</dt>
                <dd className="font-semibold text-ink">
                  {summary?.farthest ?? 'Loading'}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <MapIcon className="size-4 text-sun" aria-hidden="true" />
              System
            </div>
            <div className="overflow-hidden rounded-md border border-line bg-white text-sm">
              {layerStatus.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
                  key={item.label}
                >
                  <span className="text-slate-500">{item.label}</span>
                  <span className="flex items-center gap-1.5 font-semibold text-ink">
                    <Check
                      className="size-3.5 text-forest"
                      aria-hidden="true"
                    />
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <Button
            className="w-full"
            disabled={!sampleData || !mapInstance}
            onClick={fitToSampleData}
            variant="secondary"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Fit to places
          </Button>
        </div>
      </aside>

      <MapCanvas
        center={PRINCE_GEORGE_CENTER}
        className="h-[calc(100vh-88px)] min-h-[620px]"
        onMapReady={setMapInstance}
        zoom={11}
      />
    </section>
  )
}
