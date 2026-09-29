import type { StyleSpecification } from 'maplibre-gl'

/**
 * Vector basemaps. Carto's GL styles render from vector tiles, so labels stay
 * crisp at any zoom or pitch and the map can be restyled without new tiles.
 */
export const BASEMAPS = {
  streets: {
    label: 'Streets',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  },
  light: {
    label: 'Light',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  dark: {
    label: 'Dark',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
} as const

export type BasemapId = keyof typeof BASEMAPS

export const DEFAULT_BASEMAP: BasemapId = 'streets'

export function isBasemapId(value: unknown): value is BasemapId {
  return typeof value === 'string' && Object.hasOwn(BASEMAPS, value)
}

/**
 * Plain background used when a basemap style can't be fetched, so the map
 * still loads and page data layers still draw on top of it.
 */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e8ecea' },
    },
  ],
}
