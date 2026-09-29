import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * URL <-> map-view plumbing, so any map view can be bookmarked or shared.
 * The view lives in readable query params (`?lng=-122.75&lat=53.91&z=10`),
 * which sit inside the hash under HashRouter (`#/explorer?lng=…`).
 */

export interface MapViewState {
  /** `[longitude, latitude]` */
  center: [number, number]
  zoom: number
}

export interface MapViewUrlOptions {
  /** View used when the URL carries no (valid) view. */
  defaultView: MapViewState
  minZoom?: number
  maxZoom?: number
  /** Debounce for view writes. Default {@link MAP_VIEW_URL_DEBOUNCE_MS}. */
  debounceMs?: number
}

const LNGLAT_PRECISION = 4
const ZOOM_PRECISION = 2
const KEYS = { lng: 'lng', lat: 'lat', zoom: 'z' } as const

export const MAP_VIEW_URL_DEBOUNCE_MS = 350

/** Finite number from a raw string, else `fallback`. */
export function parseNumberField(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : fallback
}

/** A view is valid when lng/lat are finite, lat is within Web Mercator range, and zoom is in bounds. */
export function isMapViewValid(
  view: MapViewState,
  {
    minZoom = 0,
    maxZoom = 22,
  }: Pick<MapViewUrlOptions, 'minZoom' | 'maxZoom'> = {},
): boolean {
  const [lng, lat] = view.center
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -85 &&
    lat <= 85 &&
    view.zoom >= minZoom &&
    view.zoom <= maxZoom
  )
}

/** True when any of the view query params are present (i.e. the URL pins a view). */
export function queryHasMapView(params: URLSearchParams): boolean {
  return params.has(KEYS.lng) || params.has(KEYS.lat) || params.has(KEYS.zoom)
}

export function readMapViewFromQuery(
  params: URLSearchParams,
  options: MapViewUrlOptions,
): MapViewState {
  const { defaultView } = options
  const view: MapViewState = {
    center: [
      parseNumberField(params.get(KEYS.lng), defaultView.center[0]),
      parseNumberField(params.get(KEYS.lat), defaultView.center[1]),
    ],
    zoom: parseNumberField(params.get(KEYS.zoom), defaultView.zoom),
  }
  return isMapViewValid(view, options) ? view : defaultView
}

/**
 * Write the view into `params` in place. The params are removed when the view
 * rounds to the default (keeps pristine URLs clean); invalid views are left
 * untouched. Mutates and returns the same `URLSearchParams`.
 */
export function applyMapViewToQuery(
  params: URLSearchParams,
  view: MapViewState,
  options: MapViewUrlOptions,
): URLSearchParams {
  if (!isMapViewValid(view, options)) return params

  const lng = view.center[0].toFixed(LNGLAT_PRECISION)
  const lat = view.center[1].toFixed(LNGLAT_PRECISION)
  const zoom = view.zoom.toFixed(ZOOM_PRECISION)
  const { defaultView } = options

  const isDefault =
    lng === defaultView.center[0].toFixed(LNGLAT_PRECISION) &&
    lat === defaultView.center[1].toFixed(LNGLAT_PRECISION) &&
    zoom === defaultView.zoom.toFixed(ZOOM_PRECISION)

  if (isDefault) {
    params.delete(KEYS.lng)
    params.delete(KEYS.lat)
    params.delete(KEYS.zoom)
  } else {
    params.set(KEYS.lng, lng)
    params.set(KEYS.lat, lat)
    params.set(KEYS.zoom, zoom)
  }
  return params
}

export interface UseMapViewUrlStateResult {
  /** View read from the URL once, at mount. Use to seed an uncontrolled map. */
  initialView: MapViewState
  /** Whether the mount URL pinned a view (use to suppress an initial auto-fit). */
  hasUrlView: boolean
  /** Debounced writer; call on the map's `moveend`. */
  onViewChange: (view: MapViewState) => void
}

/**
 * Persist a map's center/zoom in the URL so the view is bookmarkable and
 * shareable, without making the map controlled. Reads the initial view once;
 * writes later moves through `setSearchParams` (debounced, `{ replace: true }`,
 * functional updater so other params on the page are kept).
 */
export function useMapViewUrlState(
  options: MapViewUrlOptions,
): UseMapViewUrlStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  // Keep the latest options reachable from the debounced writer without
  // re-subscribing every render — callers usually pass an inline object.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const [initial] = useState(() => ({
    view: readMapViewFromQuery(searchParams, options),
    hasUrlView: queryHasMapView(searchParams),
  }))

  const debounceMs = options.debounceMs ?? MAP_VIEW_URL_DEBOUNCE_MS
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onViewChange = useCallback(
    (view: MapViewState) => {
      const opts = optionsRef.current
      if (!isMapViewValid(view, opts)) return

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        setSearchParams(
          (current) =>
            applyMapViewToQuery(new URLSearchParams(current), view, opts),
          { replace: true },
        )
      }, debounceMs)
    },
    [setSearchParams, debounceMs],
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return {
    initialView: initial.view,
    hasUrlView: initial.hasUrlView,
    onViewChange,
  }
}
