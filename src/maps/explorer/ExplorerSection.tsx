import * as turf from '@turf/turf'
import type { FeatureCollection, Point } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'
import { Eye, EyeOff, LocateFixed } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapCanvas } from '../../components/ui/MapCanvas'

const PRINCE_GEORGE_CENTER: [number, number] = [-122.7497, 53.9171]
const SOURCE_ID = 'sample-points'
const LAYER_ID = 'sample-points-layer'
const LABEL_LAYER_ID = 'sample-points-labels'

type SampleProperties = {
  name: string
  type: string
}

type SamplePoints = FeatureCollection<Point, SampleProperties>

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
    fetch('/data/sample-points.geojson')
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

  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-md border border-line bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-forest">
              Explorer
            </p>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              Sample city layer
            </h1>
          </div>
          <LocateFixed className="mt-1 size-5 text-water" aria-hidden="true" />
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          Replace the sample GeoJSON with your own points, boundaries, or
          analysis layers in public/data.
        </p>

        <label className="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-field p-3 text-sm font-medium text-ink">
          <span className="flex items-center gap-2">
            {showSampleLayer ? (
              <Eye className="size-4 text-forest" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4 text-slate-500" aria-hidden="true" />
            )}
            Show sample places
          </span>
          <input
            checked={showSampleLayer}
            className="size-4 accent-forest"
            onChange={(event) => setShowSampleLayer(event.target.checked)}
            type="checkbox"
          />
        </label>

        <dl className="mt-6 grid gap-3 text-sm">
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-slate-500">Features</dt>
            <dd className="font-semibold text-ink">
              {summary?.count ?? 'Loading'}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-slate-500">Farthest point</dt>
            <dd className="font-semibold text-ink">
              {summary?.farthest ?? 'Loading'}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-slate-500">Source</dt>
            <dd className="font-semibold text-ink">GeoJSON</dd>
          </div>
        </dl>
      </aside>

      <MapCanvas
        center={PRINCE_GEORGE_CENTER}
        className="h-[calc(100vh-88px)] min-h-[560px]"
        onMapReady={setMapInstance}
        zoom={11}
      />
    </section>
  )
}
