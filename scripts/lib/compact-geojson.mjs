import * as turf from '@turf/turf'

// Properties the explorer map actually reads. Everything else (photo URLs,
// GPX timestamps, descriptions) is dropped to keep the download small.
const KEPT_PROPERTIES = ['trailId', 'trailSlug', 'trailTitle', 'kind', 'stroke', 'type']
const COORDINATE_PRECISION = 5 // ~1 m
const SIMPLIFY_TOLERANCE = 0.00002 // degrees, ~2 m

function roundCoordinate(coordinate) {
  const factor = 10 ** COORDINATE_PRECISION
  return [
    Math.round(coordinate[0] * factor) / factor,
    Math.round(coordinate[1] * factor) / factor,
  ]
}

function dedupeLine(line) {
  const rounded = line.map(roundCoordinate)
  return rounded.filter(
    (coordinate, index) =>
      index === 0 ||
      coordinate[0] !== rounded[index - 1][0] ||
      coordinate[1] !== rounded[index - 1][1],
  )
}

function compactGeometry(geometry) {
  if (geometry.type === 'Point') {
    return { type: 'Point', coordinates: roundCoordinate(geometry.coordinates) }
  }

  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const simplified = turf.simplify(
      { type: 'Feature', properties: {}, geometry },
      { tolerance: SIMPLIFY_TOLERANCE, highQuality: false },
    ).geometry

    if (simplified.type === 'LineString') {
      return { type: 'LineString', coordinates: dedupeLine(simplified.coordinates) }
    }
    return {
      type: 'MultiLineString',
      coordinates: simplified.coordinates.map(dedupeLine),
    }
  }

  return geometry
}

export function compactTrailGeoJson(geoJson) {
  return {
    type: 'FeatureCollection',
    features: geoJson.features.map((feature) => ({
      type: 'Feature',
      properties: Object.fromEntries(
        KEPT_PROPERTIES.filter((key) => feature.properties?.[key] !== undefined).map((key) => [
          key,
          feature.properties[key],
        ]),
      ),
      geometry: compactGeometry(feature.geometry),
    })),
  }
}
