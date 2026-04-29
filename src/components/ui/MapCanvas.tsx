import maplibregl from 'maplibre-gl'
import type { LngLatLike, Map, StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'carto-voyager',
      type: 'raster',
      source: 'carto',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
}

type MapCanvasProps = {
  center: LngLatLike
  zoom: number
  children?: ReactNode
  className?: string
  styleUrl?: string | StyleSpecification
  onMapReady?: (map: Map) => void
}

export function MapCanvas({
  center,
  zoom,
  children,
  className,
  styleUrl = DEFAULT_STYLE,
  onMapReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    onMapReadyRef.current = onMapReady
  }, [onMapReady])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom,
      attributionControl: { compact: true },
    })

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'top-right',
    )
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric' }),
      'bottom-left',
    )

    map.on('load', () => {
      setIsReady(true)
      onMapReadyRef.current?.(map)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      setIsReady(false)
    }
  }, [center, styleUrl, zoom])

  return (
    <div
      className={cn(
        'relative h-full min-h-[520px] overflow-hidden rounded-md bg-slate-200',
        className,
      )}
      data-testid="map-canvas"
    >
      <div ref={containerRef} className="absolute inset-0" />
      {!isReady && (
        <div className="absolute inset-0 grid place-items-center bg-field text-sm font-medium text-slate-600">
          Loading map
        </div>
      )}
      {children}
    </div>
  )
}
