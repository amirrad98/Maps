import { describe, expect, it } from 'vitest'

import {
  applyMapViewToQuery,
  isMapViewValid,
  queryHasMapView,
  readMapViewFromQuery,
} from './map-url-state'

const options = { defaultView: { center: [-122.75, 53.91], zoom: 7 } } as {
  defaultView: { center: [number, number]; zoom: number }
}

describe('map view query params', () => {
  it('reads a pinned view', () => {
    const params = new URLSearchParams('lng=-123.1&lat=49.28&z=11.5')
    expect(queryHasMapView(params)).toBe(true)
    expect(readMapViewFromQuery(params, options)).toEqual({
      center: [-123.1, 49.28],
      zoom: 11.5,
    })
  })

  it('falls back to the default view for missing or invalid values', () => {
    expect(readMapViewFromQuery(new URLSearchParams(), options)).toEqual(
      options.defaultView,
    )
    expect(
      readMapViewFromQuery(new URLSearchParams('lng=abc&lat=95&z=3'), options),
    ).toEqual(options.defaultView)
    expect(queryHasMapView(new URLSearchParams('species=kokanee'))).toBe(false)
  })

  it('writes a rounded view and keeps other params', () => {
    const params = new URLSearchParams('tab=regions')
    applyMapViewToQuery(
      params,
      { center: [-123.123456, 49.287654], zoom: 11.456 },
      options,
    )
    expect(params.toString()).toBe(
      'tab=regions&lng=-123.1235&lat=49.2877&z=11.46',
    )
  })

  it('clears the view params when back at the default view', () => {
    const params = new URLSearchParams('lng=-123&lat=49&z=10&tab=regions')
    applyMapViewToQuery(params, options.defaultView, options)
    expect(params.toString()).toBe('tab=regions')
  })

  it('rejects views outside Web Mercator or zoom bounds', () => {
    expect(isMapViewValid({ center: [0, 86], zoom: 3 })).toBe(false)
    expect(isMapViewValid({ center: [0, 0], zoom: 23 })).toBe(false)
    expect(isMapViewValid({ center: [0, 0], zoom: 5 }, { maxZoom: 4 })).toBe(
      false,
    )
  })
})
