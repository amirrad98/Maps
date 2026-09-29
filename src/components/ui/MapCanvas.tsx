import maplibregl from 'maplibre-gl'
import type { Map, StyleSpecification } from 'maplibre-gl'
import { Loader2 } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { cn } from '../../lib/utils'
import { MapControls, MapScaleBar } from './map-controls'
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  FALLBACK_STYLE,
  isBasemapId,
  type BasemapId,
} from './map-styles'
import { useMapViewUrlState } from './map-url-state'

const BASEMAP_STORAGE_KEY = 'maps.basemap'

function readStoredBasemap(): BasemapId {
  try {
    const stored = window.localStorage.getItem(BASEMAP_STORAGE_KEY)
    return isBasemapId(stored) ? stored : DEFAULT_BASEMAP
  } catch {
    return DEFAULT_BASEMAP
  }
}

function storeBasemap(basemap: BasemapId) {
  try {
    window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap)
  } catch {
    // Storage can be unavailable (private mode); the choice just won't stick.
  }
}

export type MapReadyInfo = {
  /** The URL pinned a view on load, so the page should skip its own auto-fit. */
  hasUrlView: boolean
}

type MapCanvasProps = {
  /** Default center, used when the URL does not pin a view. */
  center: [number, number]
  /** Default zoom, used when the URL does not pin a view. */
  zoom: number
  children?: ReactNode
  className?: string
  /** Keep the view in the URL (`?lng&lat&z`) so it can be shared. Default true. */
  persistView?: boolean
  onMapReady?: (map: Map, info: MapReadyInfo) => void
  ref?: Ref<HTMLDivElement>
}

export function MapCanvas({
  center,
  zoom,
  children,
  className,
  persistView = true,
  onMapReady,
  ref,
}: MapCanvasProps) {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  const [map, setMap] = useState<Map | null>(null)
  const [basemap, setBasemap] = useState<BasemapId>(readStoredBasemap)
  const basemapRef = useRef(basemap)
  // Source and layer ids that belong to the current basemap style, so a
  // basemap swap can tell them apart from the data layers pages have added.
  const basemapIdsRef = useRef<{ sources: Set<string>; layers: Set<string> }>({
    sources: new Set(),
    layers: new Set(),
  })

  const defaultView = useMemo(
    () => ({ center, zoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center[0], center[1], zoom],
  )
  const { initialView, hasUrlView, onViewChange } = useMapViewUrlState({
    defaultView,
  })
  const onViewChangeRef = useRef(onViewChange)
  const persistViewRef = useRef(persistView)
  const initialRef = useRef({ view: initialView, hasUrlView })

  useEffect(() => {
    onMapReadyRef.current = onMapReady
    onViewChangeRef.current = onViewChange
    persistViewRef.current = persistView
  }, [onMapReady, onViewChange, persistView])

  useEffect(() => {
    if (!containerRef.current) return

    const { view, hasUrlView: pinned } = initialRef.current
    const styleUrl = BASEMAPS[basemapRef.current].style
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: view.center,
      zoom: view.zoom,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    })

    let ready = false
    let fellBack = false

    // Pages can add sources and layers as soon as the style is in, so signal
    // ready on the first `style.load` rather than `load`, which also waits for
    // every basemap tile in the first frame.
    instance.on('style.load', () => {
      if (ready) return
      ready = true
      // Nothing the page adds exists yet, so everything here is basemap.
      const style = instance.getStyle()
      basemapIdsRef.current = {
        sources: new Set(Object.keys(style.sources)),
        layers: new Set(style.layers.map((layer) => layer.id)),
      }
      setMap(instance)
      onMapReadyRef.current?.(instance, { hasUrlView: pinned })
    })

    // If the basemap style itself can't be fetched the map never becomes
    // ready; fall back to a plain background so page layers still work.
    instance.on('error', (event) => {
      if (ready || fellBack) return
      const url = (event.error as { url?: string } | undefined)?.url
      if (url && url !== styleUrl) return
      fellBack = true
      instance.setStyle(FALLBACK_STYLE)
    })

    instance.on('moveend', () => {
      if (!persistViewRef.current) return
      const { lng, lat } = instance.getCenter()
      onViewChangeRef.current({ center: [lng, lat], zoom: instance.getZoom() })
    })

    return () => {
      instance.remove()
      setMap(null)
    }
  }, [])

  // Swap basemaps in place: the new vector style replaces the old one while
  // every source and layer the page added is carried across untouched.
  useEffect(() => {
    if (!map || basemapRef.current === basemap) return
    basemapRef.current = basemap
    storeBasemap(basemap)

    map.setStyle(BASEMAPS[basemap].style, {
      transformStyle: (previous, next): StyleSpecification => {
        const basemapIds = basemapIdsRef.current
        basemapIdsRef.current = {
          sources: new Set(Object.keys(next.sources)),
          layers: new Set(next.layers.map((layer) => layer.id)),
        }
        if (!previous) return next

        const pageSources = Object.fromEntries(
          Object.entries(previous.sources).filter(
            ([id]) => !basemapIds.sources.has(id),
          ),
        )
        const pageLayers = previous.layers.filter(
          (layer) => !basemapIds.layers.has(layer.id),
        )
        return {
          ...next,
          sources: { ...next.sources, ...pageSources },
          layers: [...next.layers, ...pageLayers],
        }
      },
    })
  }, [basemap, map])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-slate-200',
        className,
      )}
      data-basemap={basemap}
      data-testid="map-canvas"
      ref={(node) => {
        setWrapper(node)
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {map ? (
        <>
          <MapControls
            basemap={basemap}
            fullscreenTarget={wrapper}
            map={map}
            onBasemapChange={setBasemap}
          />
          <MapScaleBar map={map} />
        </>
      ) : (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-field text-sm font-medium text-slate-600"
        >
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading map
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
