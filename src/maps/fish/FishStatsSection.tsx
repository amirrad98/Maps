import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from 'maplibre-gl'
import {
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ExternalLink,
  Fish,
  Info,
  Layers,
  LocateFixed,
  SlidersHorizontal,
  Trophy,
  Waves,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { MapCanvas } from '../../components/ui/MapCanvas'

const BC_CENTER: [number, number] = [-123.1, 53.3]
const SOURCE_ID = 'bc-fish-stocking'
const BUBBLE_LAYER_ID = 'bc-fish-stocking-bubbles'
const SELECTED_LAYER_ID = 'bc-fish-stocking-selected'
const LABEL_LAYER_ID = 'bc-fish-stocking-labels'
const WATERBODY_SOURCE_ID = 'bc-fish-waterbodies-mapped'
const WATERBODY_LAYER_ID = 'bc-fish-waterbody-points'
const WATERBODY_SELECTED_LAYER_ID = 'bc-fish-waterbody-selected'
const WATERBODY_LABEL_LAYER_ID = 'bc-fish-waterbody-labels'
const WATERBODY_SCORE_LAYER_ID = 'bc-fish-waterbody-scores'
const DEFAULT_YEAR = 2025

type StockingRegion = {
  id: string
  regionNumber: string
  name: string
  center: [number, number]
  lakesStocked: number
  species: Record<string, number>
}

type WaterbodyType = 'all' | 'lake' | 'river'
type WaterbodySort = 'quantity' | 'name' | 'town'

type FishWaterbodyRecord = {
  id: string
  year: number
  regionId: string
  regionName: string
  reportRegion: string
  waterbodyName: string
  nearestTown: string
  waterbodyType: 'lake' | 'river'
  species: string
  strain: string
  lifeStage: string
  genotype: string
  quantity: number
}

type FishWaterbodyData = {
  source: string
  sourceUrl: string
  generatedAt: string
  years: number[]
  count: number
  species: string[]
  records: FishWaterbodyRecord[]
}

type FishStockingData = {
  source: string
  sourceUrl: string
  secondarySources: {
    label: string
    url: string
  }[]
  year: number
  provinceSummary: {
    fishStocked: number
    regionalFishTotal: number
    lakesStocked: number
    species: string[]
  }
  anadromousStocking: {
    region: string
    species: string
    quantity: number
    waterbodies: string
  }[]
  regions: StockingRegion[]
}

type FishFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  {
    id: string
    name: string
    regionNumber: string
    lakesStocked: number
    totalFish: number
    topSpecies: string
  }
>

type MappedWaterbodyProperties = {
  key: string
  waterbodyName: string
  nearestTown: string
  waterbodyType: 'lake' | 'river'
  regionId: string
  regionName: string
  reportRegion: string
  bcgnwsName: string
  bcgnwsUri: string
  featureType: string
  matchConfidence?: string
  totalFish: number
  entries: number
  topSpecies: string
  fishingScore?: number
  fishingRating?: string
  fishingReason?: string
}

type FishingWeather = {
  temperature: number
  windSpeed: number
  precipitationProbability: number
  precipitation: number
  cloudCover: number
}

type WeatherCacheEntry =
  | {
      status: 'ready'
      data: FishingWeather
    }
  | {
      status: 'error'
    }

type FishingScore = {
  score: number
  rating: 'Strong' | 'Fair' | 'Low'
  reasons: string[]
  watchOuts: string[]
}

type MappedWaterbodyFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  MappedWaterbodyProperties
> & {
  properties?: {
    source: string
    sourceUrl: string
    generatedAt: string
    checkedWaterbodies: number
    matchedWaterbodies: number
    regions: {
      regionId: string
      regionName: string
      checkedWaterbodies: number
      matchedWaterbodies: number
    }[]
  }
}

const EMPTY_REGIONS: StockingRegion[] = []
const EMPTY_WATERBODY_RECORDS: FishWaterbodyRecord[] = []
const EMPTY_MAPPED_WATERBODIES: MappedWaterbodyFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}
const ALL_SPECIES = 'All species'
const WATERBODY_TYPE_LABELS: Record<WaterbodyType, string> = {
  all: 'All',
  lake: 'Lakes',
  river: 'Rivers / Creeks',
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString()
}

function formatDisplayName(value: string) {
  if (!value || value !== value.toUpperCase()) return value

  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function getTopSpecies(species: Record<string, number>) {
  return Object.entries(species).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function buildFeatureCollection(
  regions: Array<
    StockingRegion & {
      totalFish: number
      species: Record<string, number>
    }
  >,
): FishFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: regions
      .map((region) => ({
        type: 'Feature' as const,
        properties: {
          id: region.id,
          name: region.name,
          regionNumber: region.regionNumber,
          lakesStocked: region.lakesStocked,
          totalFish: region.totalFish,
          topSpecies: getTopSpecies(region.species),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: region.center,
        },
      }))
      .filter((feature) => feature.properties.totalFish > 0),
  }
}

function getSelectedFilter(regionId: string | null) {
  return ['==', ['get', 'id'], regionId ?? '__none__'] as FilterSpecification
}

function getSelectedWaterbodyFilter(waterbodyKey: string | null) {
  return [
    '==',
    ['get', 'key'],
    waterbodyKey ?? '__none__',
  ] as FilterSpecification
}

function getWaterbodyKey(value: {
  waterbodyName: string
  nearestTown: string
  waterbodyType: 'lake' | 'river'
}) {
  return [value.waterbodyName, value.nearestTown, value.waterbodyType].join('|')
}

function matchesWaterbodyType(
  record: FishWaterbodyRecord,
  waterbodyType: WaterbodyType,
) {
  return waterbodyType === 'all' || record.waterbodyType === waterbodyType
}

function normalizeSearch(value: string) {
  return value.toLowerCase().trim()
}

function aggregateSpecies(records: FishWaterbodyRecord[]) {
  const species: Record<string, number> = {}

  for (const record of records) {
    species[record.species] = (species[record.species] ?? 0) + record.quantity
  }

  return species
}

function getUniqueSortedValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  )
}

function formatLimitedList(values: string[], limit = 2) {
  const visibleValues = values.slice(0, limit)
  const hiddenCount = values.length - visibleValues.length

  if (!visibleValues.length) return ''
  return `${visibleValues.join(', ')}${hiddenCount > 0 ? ` +${hiddenCount} more` : ''}`
}

function getBcgnwsUrl(uri: string) {
  return uri.startsWith('http') ? uri : `https://${uri}`
}

function average(values: unknown[]) {
  const numbers = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  )

  if (!numbers.length) return 0
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getFishingRating(score: number): FishingScore['rating'] {
  if (score >= 70) return 'Strong'
  if (score >= 45) return 'Fair'
  return 'Low'
}

function scoreFishingWaterbody(
  feature: GeoJSON.Feature<GeoJSON.Point, MappedWaterbodyProperties>,
  selectedYear: number,
  weather?: FishingWeather,
): FishingScore {
  const reasons: string[] = []
  const watchOuts: string[] = []
  let score = 34
  const yearAge = Math.max(0, new Date().getFullYear() - selectedYear)

  if (yearAge <= 1) {
    score += 12
    reasons.push('recent stocking year')
  } else if (yearAge === 2) {
    score += 8
    reasons.push('stocked within two years')
  } else {
    score += 3
    watchOuts.push('older stocking year')
  }

  const volumeScore = clamp(
    (Math.log10(Math.max(1, feature.properties.totalFish)) - 2) * 8.5,
    0,
    28,
  )
  score += volumeScore

  if (feature.properties.totalFish >= 100000) {
    reasons.push('major stocking volume')
  } else if (feature.properties.totalFish >= 25000) {
    reasons.push('strong stocking volume')
  } else if (feature.properties.totalFish >= 10000) {
    reasons.push('solid stocking volume')
  } else if (feature.properties.totalFish < 2500) {
    watchOuts.push('lower stocked quantity')
  }

  if (feature.properties.entries >= 5) {
    score += 10
    reasons.push('frequent stocking entries')
  } else if (feature.properties.entries >= 3) {
    score += 8
    reasons.push('multiple stocking entries')
  } else if (feature.properties.entries >= 2) {
    score += 5
  } else {
    score += 2
  }

  if (/trout|kokanee|char/i.test(feature.properties.topSpecies)) {
    score += 6
    reasons.push(`${feature.properties.topSpecies} fit`)
  } else {
    score += 3
  }

  if (feature.properties.matchConfidence === 'high') {
    score += 2
  }

  if (weather) {
    if (weather.windSpeed <= 12) {
      reasons.push('light wind')
    } else if (weather.windSpeed > 22) {
      watchOuts.push('windy conditions')
    }

    if (weather.precipitation <= 1 && weather.precipitationProbability <= 40) {
      reasons.push('low rain risk')
    } else if (weather.precipitation > 4) {
      watchOuts.push('rain may affect comfort')
    }

    if (weather.temperature >= 6 && weather.temperature <= 18) {
      reasons.push('comfortable temperature')
    } else if (weather.temperature < 0 || weather.temperature > 26) {
      watchOuts.push('temperature is less favorable')
    }
  } else {
    watchOuts.push('weather unavailable')
  }

  const boundedScore = clamp(Math.round(score), 0, 100)

  return {
    score: boundedScore,
    rating: getFishingRating(boundedScore),
    reasons: reasons.slice(0, 3),
    watchOuts: watchOuts.slice(0, 3),
  }
}

async function fetchFishingWeather(
  coordinates: [number, number],
): Promise<FishingWeather> {
  const [longitude, latitude] = coordinates
  const url = new URL('https://api.open-meteo.com/v1/forecast')

  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'cloud_cover',
      'wind_speed_10m',
    ].join(','),
  )
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to load fishing weather: ${response.status}`)
  }

  const data = (await response.json()) as {
    hourly?: Record<string, unknown[]>
  }
  const hourly = data.hourly ?? {}

  return {
    temperature: average(hourly.temperature_2m ?? []),
    windSpeed: average(hourly.wind_speed_10m ?? []),
    precipitationProbability: average(hourly.precipitation_probability ?? []),
    precipitation: average(hourly.precipitation ?? []),
    cloudCover: average(hourly.cloud_cover ?? []),
  }
}

function getUniqueWaterbodyCount(records: FishWaterbodyRecord[]) {
  return new Set(
    records.map((record) =>
      [
        record.regionId,
        record.reportRegion,
        record.waterbodyName,
        record.nearestTown,
      ].join('|'),
    ),
  ).size
}

export function FishStatsSection() {
  const [data, setData] = useState<FishStockingData | null>(null)
  const [waterbodyData, setWaterbodyData] = useState<FishWaterbodyData | null>(
    null,
  )
  const [mappedWaterbodyData, setMappedWaterbodyData] =
    useState<MappedWaterbodyFeatureCollection>(EMPTY_MAPPED_WATERBODIES)
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null)
  const [selectedSpecies, setSelectedSpecies] = useState(ALL_SPECIES)
  const [selectedYear, setSelectedYear] = useState(DEFAULT_YEAR)
  const [waterbodyType, setWaterbodyType] = useState<WaterbodyType>('all')
  const [waterbodySearch, setWaterbodySearch] = useState('')
  const [waterbodySort, setWaterbodySort] = useState<WaterbodySort>('quantity')
  const [selectedRegionId, setSelectedRegionId] = useState('region-5')
  const [selectedWaterbodyKey, setSelectedWaterbodyKey] = useState<
    string | null
  >(null)
  const [openPanels, setOpenPanels] = useState({
    advisor: true,
    details: true,
    filters: false,
    regions: false,
    waterbodies: true,
  })
  const [advisorEnabled, setAdvisorEnabled] = useState(true)
  const [weatherCache, setWeatherCache] = useState<
    Record<string, WeatherCacheEntry>
  >({})
  const pendingWeatherKeys = useRef(new Set<string>())

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/bc-fish-stocking.json`).then(
        (response) => {
          if (!response.ok)
            throw new Error(
              `Unable to load fish stocking data: ${response.status}`,
            )
          return response.json() as Promise<FishStockingData>
        },
      ),
      fetch(`${import.meta.env.BASE_URL}data/bc-fish-waterbodies.json`).then(
        (response) => {
          if (!response.ok)
            throw new Error(
              `Unable to load fish waterbody data: ${response.status}`,
            )
          return response.json() as Promise<FishWaterbodyData>
        },
      ),
      fetch(
        `${import.meta.env.BASE_URL}data/bc-fish-waterbodies-mapped.geojson`,
      ).then((response) => {
        if (!response.ok) return EMPTY_MAPPED_WATERBODIES
        return response.json() as Promise<MappedWaterbodyFeatureCollection>
      }),
    ])
      .then(([fishData, fishWaterbodyData, mappedWaterbodies]) => {
        setData(fishData)
        setWaterbodyData(fishWaterbodyData)
        setMappedWaterbodyData(mappedWaterbodies)
      })
      .catch((error: unknown) => console.error(error))
  }, [])

  const regions = data?.regions ?? EMPTY_REGIONS
  const waterbodyRecords = waterbodyData?.records ?? EMPTY_WATERBODY_RECORDS
  const yearOptions = waterbodyData?.years ?? [DEFAULT_YEAR]
  const speciesOptions = useMemo(
    () => [
      ALL_SPECIES,
      ...new Set([
        ...(data?.provinceSummary.species ?? []),
        ...(waterbodyData?.species ?? []),
      ]),
    ],
    [data, waterbodyData],
  )

  const filteredWaterbodyRecords = useMemo(
    () =>
      waterbodyRecords.filter((record) => {
        const matchesYear = record.year === selectedYear
        const matchesSpecies =
          selectedSpecies === ALL_SPECIES || record.species === selectedSpecies
        const matchesType = matchesWaterbodyType(record, waterbodyType)

        return matchesYear && matchesSpecies && matchesType
      }),
    [selectedSpecies, selectedYear, waterbodyRecords, waterbodyType],
  )

  const rankedRegions = useMemo(() => {
    return regions
      .map((region) => {
        const regionRecords = filteredWaterbodyRecords.filter(
          (record) => record.regionId === region.id,
        )
        const totalFish = regionRecords.reduce(
          (sum, record) => sum + record.quantity,
          0,
        )
        const waterbodyCount = getUniqueWaterbodyCount(regionRecords)

        return {
          ...region,
          species: aggregateSpecies(regionRecords),
          lakesStocked: waterbodyCount,
          totalFish,
          fishPerLake: waterbodyCount > 0 ? totalFish / waterbodyCount : 0,
          records: regionRecords,
        }
      })
      .filter((region) => region.totalFish > 0)
      .sort((a, b) => b.totalFish - a.totalFish)
  }, [filteredWaterbodyRecords, regions])

  const featureCollection = useMemo(
    () => buildFeatureCollection(rankedRegions),
    [rankedRegions],
  )

  const selectedRegion =
    rankedRegions.find((region) => region.id === selectedRegionId) ??
    rankedRegions[0] ??
    null
  const selectedRegionRecords =
    selectedRegion?.records ?? EMPTY_WATERBODY_RECORDS

  const selectedWaterbodies = useMemo(() => {
    const query = normalizeSearch(waterbodySearch)
    const byWaterbody = new Map<
      string,
      {
        waterbodyName: string
        nearestTown: string
        waterbodyType: 'lake' | 'river'
        key: string
        reportRegions: Set<string>
        totalFish: number
        species: Record<string, number>
        entries: number
      }
    >()

    for (const record of selectedRegionRecords) {
      const matchesQuery =
        !query ||
        normalizeSearch(
          `${record.waterbodyName} ${record.nearestTown}`,
        ).includes(query)

      if (!matchesQuery) continue

      const key = [
        record.reportRegion,
        record.waterbodyName,
        record.nearestTown,
        record.waterbodyType,
      ].join('|')
      const existing = byWaterbody.get(key) ?? {
        waterbodyName: record.waterbodyName,
        nearestTown: record.nearestTown,
        waterbodyType: record.waterbodyType,
        key: getWaterbodyKey(record),
        reportRegions: new Set<string>(),
        totalFish: 0,
        species: {},
        entries: 0,
      }

      existing.reportRegions.add(record.reportRegion)
      existing.totalFish += record.quantity
      existing.species[record.species] =
        (existing.species[record.species] ?? 0) + record.quantity
      existing.entries += 1
      byWaterbody.set(key, existing)
    }

    return [...byWaterbody.values()].sort((a, b) => {
      if (waterbodySort === 'name') {
        return a.waterbodyName.localeCompare(b.waterbodyName)
      }
      if (waterbodySort === 'town') {
        return (
          a.nearestTown.localeCompare(b.nearestTown) ||
          a.waterbodyName.localeCompare(b.waterbodyName)
        )
      }
      return b.totalFish - a.totalFish
    })
  }, [selectedRegionRecords, waterbodySearch, waterbodySort])

  const effectiveSelectedWaterbodyKey =
    selectedWaterbodyKey &&
    selectedWaterbodies.some(
      (waterbody) => waterbody.key === selectedWaterbodyKey,
    )
      ? selectedWaterbodyKey
      : null

  const waterbodyStatsByKey = useMemo(() => {
    const stats = new Map<
      string,
      {
        totalFish: number
        species: Record<string, number>
        entries: number
      }
    >()

    for (const record of filteredWaterbodyRecords) {
      const key = getWaterbodyKey(record)
      const existing = stats.get(key) ?? {
        totalFish: 0,
        species: {},
        entries: 0,
      }

      existing.totalFish += record.quantity
      existing.species[record.species] =
        (existing.species[record.species] ?? 0) + record.quantity
      existing.entries += 1
      stats.set(key, existing)
    }

    return stats
  }, [filteredWaterbodyRecords])

  const mappedFeatureCollection = useMemo<MappedWaterbodyFeatureCollection>(
    () => ({
      ...mappedWaterbodyData,
      features: mappedWaterbodyData.features
        .map((feature) => {
          const key = getWaterbodyKey(feature.properties)
          const stats = waterbodyStatsByKey.get(key)
          if (!stats) return null

          return {
            ...feature,
            properties: {
              ...feature.properties,
              key,
              totalFish: stats.totalFish,
              entries: stats.entries,
              topSpecies: getTopSpecies(stats.species),
            },
          }
        })
        .filter(
          (
            feature,
          ): feature is GeoJSON.Feature<
            GeoJSON.Point,
            MappedWaterbodyProperties
          > => Boolean(feature),
        ),
    }),
    [mappedWaterbodyData, waterbodyStatsByKey],
  )

  const fishingScoresByKey = useMemo(() => {
    const scores = new Map<string, FishingScore>()

    for (const feature of mappedFeatureCollection.features) {
      const weatherEntry = weatherCache[feature.properties.key]
      const score = scoreFishingWaterbody(
        feature,
        selectedYear,
        weatherEntry?.status === 'ready' ? weatherEntry.data : undefined,
      )
      scores.set(feature.properties.key, score)
    }

    return scores
  }, [mappedFeatureCollection.features, selectedYear, weatherCache])

  const scoredMappedFeatureCollection =
    useMemo<MappedWaterbodyFeatureCollection>(
      () => ({
        ...mappedFeatureCollection,
        features: mappedFeatureCollection.features.map((feature) => {
          const fishingScore = fishingScoresByKey.get(feature.properties.key)

          return {
            ...feature,
            properties: {
              ...feature.properties,
              fishingScore: fishingScore?.score,
              fishingRating: fishingScore?.rating,
              fishingReason: fishingScore?.reasons[0],
            },
          }
        }),
      }),
      [fishingScoresByKey, mappedFeatureCollection],
    )

  const advisorRankings = useMemo(
    () =>
      scoredMappedFeatureCollection.features
        .map((feature) => ({
          feature,
          score: fishingScoresByKey.get(feature.properties.key),
        }))
        .filter(
          (
            item,
          ): item is {
            feature: GeoJSON.Feature<GeoJSON.Point, MappedWaterbodyProperties>
            score: FishingScore
          } => Boolean(item.score),
        )
        .sort((a, b) => b.score.score - a.score.score),
    [fishingScoresByKey, scoredMappedFeatureCollection.features],
  )

  const mappedFeatureByKey = useMemo(
    () =>
      new Map(
        scoredMappedFeatureCollection.features.map((feature) => [
          feature.properties.key,
          feature,
        ]),
      ),
    [scoredMappedFeatureCollection],
  )

  const selectedWaterbodyDetail = useMemo(() => {
    if (!effectiveSelectedWaterbodyKey) return null

    const records = selectedRegionRecords.filter(
      (record) => getWaterbodyKey(record) === effectiveSelectedWaterbodyKey,
    )
    if (!records.length) return null

    const firstRecord = records[0]
    const species = aggregateSpecies(records)

    return {
      key: effectiveSelectedWaterbodyKey,
      waterbodyName: firstRecord.waterbodyName,
      nearestTown: firstRecord.nearestTown,
      waterbodyType: firstRecord.waterbodyType,
      totalFish: records.reduce((sum, record) => sum + record.quantity, 0),
      species,
      entries: records.length,
      strains: getUniqueSortedValues(records.map((record) => record.strain)),
      lifeStages: getUniqueSortedValues(
        records.map((record) => record.lifeStage),
      ),
      genotypes: getUniqueSortedValues(
        records.map((record) => record.genotype),
      ),
    }
  }, [effectiveSelectedWaterbodyKey, selectedRegionRecords])
  const selectedWaterbodyMappedFeature = selectedWaterbodyDetail
    ? (mappedFeatureByKey.get(selectedWaterbodyDetail.key) ?? null)
    : null

  const selectedRegionMatchStats = selectedRegion
    ? mappedWaterbodyData.properties?.regions.find(
        (region) => region.regionId === selectedRegion.id,
      )
    : null
  const selectedFishingScore = selectedWaterbodyMappedFeature
    ? (fishingScoresByKey.get(selectedWaterbodyMappedFeature.properties.key) ??
      null)
    : null
  const selectedWaterbodySpeciesEntries = selectedWaterbodyDetail
    ? Object.entries(selectedWaterbodyDetail.species).sort(
        (a, b) => b[1] - a[1],
      )
    : []
  const selectedWaterbodyTopSpecies =
    selectedWaterbodySpeciesEntries[0]?.[0] ?? 'No species'
  const selectedWaterbodyVisibleSpecies = selectedWaterbodySpeciesEntries.slice(
    0,
    3,
  )
  const selectedWaterbodyHiddenSpeciesCount =
    selectedWaterbodySpeciesEntries.length -
    selectedWaterbodyVisibleSpecies.length
  const selectedWaterbodyTypeLabel =
    selectedWaterbodyDetail?.waterbodyType === 'river'
      ? 'River / creek'
      : 'Lake / waterbody'
  const selectedWaterbodyDisplayName =
    selectedWaterbodyMappedFeature?.properties.bcgnwsName ??
    formatDisplayName(selectedWaterbodyDetail?.waterbodyName ?? '')
  const selectedWaterbodyTownLabel = selectedWaterbodyDetail?.nearestTown
    ? formatDisplayName(selectedWaterbodyDetail.nearestTown)
    : 'Unknown town'
  const selectedWaterbodyStatusLabel = selectedWaterbodyMappedFeature
    ? 'Mapped'
    : 'List only'
  const selectedWaterbodyDecision = selectedFishingScore
    ? selectedFishingScore.rating === 'Strong'
      ? 'Prioritize today'
      : selectedFishingScore.rating === 'Fair'
        ? 'Good backup'
        : 'Lower signal'
    : selectedWaterbodyMappedFeature
      ? 'Score loading'
      : 'No map score'
  const selectedScoreTone =
    selectedFishingScore?.rating === 'Strong'
      ? 'bg-forest text-white'
      : selectedFishingScore?.rating === 'Fair'
        ? 'bg-sun text-ink'
        : selectedFishingScore
          ? 'bg-slate-600 text-white'
          : 'bg-field text-slate-600'
  const selectedDecisionTone =
    selectedFishingScore?.rating === 'Strong'
      ? 'bg-emerald-100 text-emerald-700'
      : selectedFishingScore?.rating === 'Fair'
        ? 'bg-amber-100 text-amber-700'
        : selectedFishingScore
          ? 'bg-slate-100 text-slate-600'
          : 'bg-field text-slate-600'
  const selectedWaterbodyFilterSummary = `${selectedYear} · ${
    selectedSpecies === ALL_SPECIES ? 'All species' : selectedSpecies
  } · ${WATERBODY_TYPE_LABELS[waterbodyType]}`
  const activeFilterCount = [
    selectedYear !== DEFAULT_YEAR,
    selectedSpecies !== ALL_SPECIES,
    waterbodyType !== 'all',
  ].filter(Boolean).length
  const activeFilterLabel =
    activeFilterCount > 0 ? `${activeFilterCount} active` : 'All'

  const totalVisibleFish = rankedRegions.reduce(
    (sum, region) => sum + region.totalFish,
    0,
  )
  const totalVisibleLakes = rankedRegions.reduce(
    (sum, region) => sum + region.lakesStocked,
    0,
  )
  const bestDensity = [...rankedRegions].sort(
    (a, b) => b.fishPerLake - a.fishPerLake,
  )[0]

  useEffect(() => {
    if (!advisorEnabled) return

    const targetFeatures = [
      ...advisorRankings.slice(0, 10).map((item) => item.feature),
      ...(selectedWaterbodyMappedFeature
        ? [selectedWaterbodyMappedFeature]
        : []),
    ]

    for (const feature of targetFeatures) {
      const key = feature.properties.key
      if (weatherCache[key] || pendingWeatherKeys.current.has(key)) continue

      pendingWeatherKeys.current.add(key)
      fetchFishingWeather(feature.geometry.coordinates as [number, number])
        .then((weather) => {
          setWeatherCache((current) => ({
            ...current,
            [key]: {
              status: 'ready',
              data: weather,
            },
          }))
        })
        .catch(() => {
          setWeatherCache((current) => ({
            ...current,
            [key]: {
              status: 'error',
            },
          }))
        })
        .finally(() => {
          pendingWeatherKeys.current.delete(key)
        })
    }
  }, [
    advisorEnabled,
    advisorRankings,
    selectedWaterbodyMappedFeature,
    weatherCache,
  ])

  const applyLayers = useCallback(
    (map: MapLibreMap) => {
      if (!featureCollection.features.length) return

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: featureCollection,
        })
      } else {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource
        source.setData(featureCollection)
      }

      if (!map.getLayer(BUBBLE_LAYER_ID)) {
        map.addLayer({
          id: BUBBLE_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          maxzoom: 7,
          paint: {
            'circle-color': '#2f7d55',
            'circle-opacity': 0.72,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'totalFish'],
              30000,
              9,
              250000,
              18,
              1000000,
              30,
              2300000,
              44,
            ] as ExpressionSpecification,
          },
        })
      }

      if (!map.getLayer(SELECTED_LAYER_ID)) {
        map.addLayer({
          id: SELECTED_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          maxzoom: 7,
          filter: getSelectedFilter(selectedRegion?.id ?? null),
          paint: {
            'circle-color': '#d3902f',
            'circle-opacity': 0.35,
            'circle-stroke-color': '#172033',
            'circle-stroke-width': 2,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'totalFish'],
              30000,
              16,
              250000,
              28,
              1000000,
              44,
              2300000,
              60,
            ] as ExpressionSpecification,
          },
        })
      }

      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          maxzoom: 7,
          layout: {
            'text-field': ['concat', 'R', ['get', 'regionNumber']],
            'text-font': ['Open Sans Regular'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#172033',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        })
      }

      if (map.getLayer(SELECTED_LAYER_ID)) {
        map.setFilter(
          SELECTED_LAYER_ID,
          getSelectedFilter(selectedRegion?.id ?? null),
        )
      }

      if (!map.getSource(WATERBODY_SOURCE_ID)) {
        map.addSource(WATERBODY_SOURCE_ID, {
          type: 'geojson',
          data: scoredMappedFeatureCollection,
        })
      } else {
        const source = map.getSource(WATERBODY_SOURCE_ID) as GeoJSONSource
        source.setData(scoredMappedFeatureCollection)
      }

      if (!map.getLayer(WATERBODY_LAYER_ID)) {
        map.addLayer({
          id: WATERBODY_LAYER_ID,
          type: 'circle',
          source: WATERBODY_SOURCE_ID,
          minzoom: 7,
          paint: {
            'circle-color': [
              'case',
              ['>=', ['coalesce', ['get', 'fishingScore'], 0], 70],
              '#2f7d55',
              ['>=', ['coalesce', ['get', 'fishingScore'], 0], 45],
              '#d3902f',
              '#64748b',
            ] as ExpressionSpecification,
            'circle-opacity': 0.82,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.7,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'totalFish'],
              100,
              5,
              1000,
              8,
              10000,
              13,
              100000,
              22,
            ] as ExpressionSpecification,
          },
        })
      }

      if (!map.getLayer(WATERBODY_SELECTED_LAYER_ID)) {
        map.addLayer({
          id: WATERBODY_SELECTED_LAYER_ID,
          type: 'circle',
          source: WATERBODY_SOURCE_ID,
          minzoom: 7,
          filter: getSelectedWaterbodyFilter(effectiveSelectedWaterbodyKey),
          paint: {
            'circle-color': '#d3902f',
            'circle-opacity': 0.38,
            'circle-stroke-color': '#172033',
            'circle-stroke-width': 2,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'totalFish'],
              100,
              10,
              1000,
              14,
              10000,
              22,
              100000,
              34,
            ] as ExpressionSpecification,
          },
        })
      }

      if (!map.getLayer(WATERBODY_LABEL_LAYER_ID)) {
        map.addLayer({
          id: WATERBODY_LABEL_LAYER_ID,
          type: 'symbol',
          source: WATERBODY_SOURCE_ID,
          minzoom: 8,
          layout: {
            'text-field': ['get', 'waterbodyName'],
            'text-font': ['Open Sans Regular'],
            'text-size': 11,
            'text-offset': [0, 1.1],
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#172033',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.4,
          },
        })
      }

      if (!map.getLayer(WATERBODY_SCORE_LAYER_ID)) {
        map.addLayer({
          id: WATERBODY_SCORE_LAYER_ID,
          type: 'symbol',
          source: WATERBODY_SOURCE_ID,
          minzoom: 7.5,
          layout: {
            'text-field': ['to-string', ['get', 'fishingScore']],
            'text-font': ['Open Sans Bold'],
            'text-size': 10,
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#172033',
            'text-halo-width': 0.8,
          },
        })
      }

      if (map.getLayer(WATERBODY_SELECTED_LAYER_ID)) {
        map.setFilter(
          WATERBODY_SELECTED_LAYER_ID,
          getSelectedWaterbodyFilter(effectiveSelectedWaterbodyKey),
        )
      }
    },
    [
      effectiveSelectedWaterbodyKey,
      featureCollection,
      scoredMappedFeatureCollection,
      selectedRegion,
    ],
  )

  useEffect(() => {
    if (!mapInstance) return
    applyLayers(mapInstance)
  }, [applyLayers, mapInstance])

  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const regionId = String(feature?.properties?.id ?? '')
      const region = regions.find((item) => item.id === regionId)
      if (!region) return

      setSelectedRegionId(region.id)
      setSelectedWaterbodyKey(null)
      mapInstance.easeTo({
        center: region.center,
        zoom: Math.max(mapInstance.getZoom(), 6),
        duration: 500,
      })
    }

    const setPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer'
    }
    const clearPointer = () => {
      mapInstance.getCanvas().style.cursor = ''
    }

    mapInstance.on('click', BUBBLE_LAYER_ID, handleClick)
    mapInstance.on('mouseenter', BUBBLE_LAYER_ID, setPointer)
    mapInstance.on('mouseleave', BUBBLE_LAYER_ID, clearPointer)

    return () => {
      if (!mapInstance.getLayer(BUBBLE_LAYER_ID)) return
      mapInstance.off('click', BUBBLE_LAYER_ID, handleClick)
      mapInstance.off('mouseenter', BUBBLE_LAYER_ID, setPointer)
      mapInstance.off('mouseleave', BUBBLE_LAYER_ID, clearPointer)
    }
  }, [mapInstance, regions])

  useEffect(() => {
    if (!mapInstance || !mapInstance.getLayer(WATERBODY_LAYER_ID)) return

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const key = String(feature?.properties?.key ?? '')
      const coordinates =
        feature?.geometry?.type === 'Point'
          ? feature.geometry.coordinates
          : null

      if (!key || !coordinates) return

      const regionId = String(feature?.properties?.regionId ?? selectedRegionId)

      setSelectedRegionId(regionId)
      setSelectedWaterbodyKey(key)
      mapInstance.easeTo({
        center: [coordinates[0], coordinates[1]] as [number, number],
        zoom: Math.max(mapInstance.getZoom(), 9),
        duration: 500,
      })
    }

    const setPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer'
    }
    const clearPointer = () => {
      mapInstance.getCanvas().style.cursor = ''
    }

    mapInstance.on('click', WATERBODY_LAYER_ID, handleClick)
    mapInstance.on('mouseenter', WATERBODY_LAYER_ID, setPointer)
    mapInstance.on('mouseleave', WATERBODY_LAYER_ID, clearPointer)

    return () => {
      if (!mapInstance.getLayer(WATERBODY_LAYER_ID)) return
      mapInstance.off('click', WATERBODY_LAYER_ID, handleClick)
      mapInstance.off('mouseenter', WATERBODY_LAYER_ID, setPointer)
      mapInstance.off('mouseleave', WATERBODY_LAYER_ID, clearPointer)
    }
  }, [mapInstance, selectedRegionId])

  const fitRegions = useCallback(() => {
    if (!mapInstance) return
    mapInstance.fitBounds(
      [
        [-130.8, 48.2],
        [-114.0, 57.4],
      ],
      {
        padding: 70,
        duration: 650,
      },
    )
  }, [mapInstance])

  const focusSelectedRegionWaterbodies = useCallback(() => {
    if (!mapInstance || !selectedRegion) return

    const regionFeatures = mappedFeatureCollection.features.filter(
      (feature) => feature.properties.regionId === selectedRegion.id,
    )

    if (!regionFeatures.length) {
      mapInstance.easeTo({
        center: selectedRegion.center,
        zoom: Math.max(mapInstance.getZoom(), 6),
        duration: 650,
      })
      return
    }

    const lngs = regionFeatures.map(
      (feature) => feature.geometry.coordinates[0],
    )
    const lats = regionFeatures.map(
      (feature) => feature.geometry.coordinates[1],
    )

    mapInstance.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: 70,
        maxZoom: 7.6,
        duration: 650,
      },
    )
  }, [mappedFeatureCollection, mapInstance, selectedRegion])

  const togglePanel = (panel: keyof typeof openPanels) => {
    setOpenPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }))
  }

  const detailsPanelOpen =
    openPanels.details || Boolean(selectedWaterbodyDetail)

  return (
    <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1600px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="h-fit overflow-hidden rounded-md border border-line bg-white shadow-panel lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-88px)] lg:flex-col">
        <div className="border-b border-line p-4">
          <p className="text-xs font-semibold uppercase text-forest">
            Fish stats
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink">
                BC stocking overview
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Fish stocking map with lake, river, and advisor data.
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
              {selectedYear}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-field p-3">
              <dt className="text-slate-500">Fish shown</dt>
              <dd className="mt-1 font-semibold text-ink">
                {formatNumber(totalVisibleFish)}
              </dd>
            </div>
            <div className="rounded-md bg-field p-3">
              <dt className="text-slate-500">Waterbodies</dt>
              <dd className="mt-1 font-semibold text-ink">
                {formatNumber(totalVisibleLakes)}
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-xs text-slate-500">
            Province 2025 review:{' '}
            <span className="font-semibold text-ink">
              {data
                ? formatNumber(data.provinceSummary.fishStocked)
                : 'Loading'}
            </span>{' '}
            fish stocked.
          </p>

          <button
            className={`mt-4 flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
              openPanels.filters
                ? 'border-forest bg-emerald-50 text-forest'
                : 'border-line bg-white text-ink hover:bg-field'
            }`}
            onClick={() => togglePanel('filters')}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal
                className="size-4 shrink-0"
                aria-hidden="true"
              />
              <span>Filters</span>
              <span className="truncate text-xs font-medium text-slate-500">
                {selectedWaterbodyFilterSummary}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-field px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {activeFilterLabel}
              </span>
              <ChevronDown
                className={`size-4 text-slate-500 transition ${
                  openPanels.filters ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>
        </div>

        {openPanels.filters && (
          <div
            className="space-y-4 border-b border-line bg-field/60 p-4"
            data-testid="fish-filter-panel"
          >
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Calendar className="size-4 text-water" aria-hidden="true" />
                Year
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {yearOptions.map((year) => {
                  const active = selectedYear === year

                  return (
                    <button
                      className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
                        active
                          ? 'border-forest bg-forest text-white'
                          : 'border-line bg-white text-ink hover:bg-field'
                      }`}
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      type="button"
                    >
                      {year}
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Fish className="size-4 text-forest" aria-hidden="true" />
                Species
              </div>
              <div className="flex flex-wrap gap-2">
                {speciesOptions.map((species) => {
                  const active = selectedSpecies === species

                  return (
                    <button
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
                        active
                          ? 'border-forest bg-forest text-white'
                          : 'border-line bg-white text-ink hover:bg-field'
                      }`}
                      key={species}
                      onClick={() => setSelectedSpecies(species)}
                      type="button"
                    >
                      {species}
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Waves className="size-4 text-water" aria-hidden="true" />
                Waterbody type
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(WATERBODY_TYPE_LABELS) as WaterbodyType[]).map(
                  (type) => {
                    const active = waterbodyType === type

                    return (
                      <button
                        className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-water ${
                          active
                            ? 'border-forest bg-forest text-white'
                            : 'border-line bg-white text-ink hover:bg-field'
                        }`}
                        key={type}
                        onClick={() => setWaterbodyType(type)}
                        type="button"
                      >
                        {WATERBODY_TYPE_LABELS[type]}
                      </button>
                    )
                  },
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Layers className="size-4 text-water" aria-hidden="true" />
                Current view
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-white p-3">
                  <dt className="text-slate-500">Province total</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {data
                      ? formatNumber(data.provinceSummary.fishStocked)
                      : 'Loading'}
                  </dd>
                </div>
                <div className="rounded-md bg-white p-3">
                  <dt className="text-slate-500">2025 review lakes</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {data
                      ? formatNumber(data.provinceSummary.lakesStocked)
                      : 'Loading'}
                  </dd>
                </div>
              </dl>
            </section>

            {bestDensity && (
              <section className="rounded-md border border-line bg-white p-3">
                <div className="flex items-start gap-2">
                  <Trophy
                    className="mt-0.5 size-4 text-sun"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Best fish-per-lake signal
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {bestDensity.name} averages about{' '}
                      {formatNumber(bestDensity.fishPerLake)} stocked fish per
                      stocked lake for the active filter.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="w-full"
                disabled={!mapInstance}
                onClick={fitRegions}
                variant="secondary"
              >
                <LocateFixed className="size-4" aria-hidden="true" />
                Fit BC regions
              </Button>

              <Button
                className="w-full"
                disabled={
                  !mapInstance || !mappedFeatureCollection.features.length
                }
                onClick={focusSelectedRegionWaterbodies}
                variant="secondary"
              >
                <LocateFixed className="size-4" aria-hidden="true" />
                Focus selected region
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3 overflow-auto p-4 lg:min-h-0 lg:flex-1">
          <section className="overflow-hidden rounded-md border border-line bg-white">
            <button
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink"
              onClick={() => togglePanel('advisor')}
              type="button"
            >
              <span>Fishing advisor</span>
              <ChevronDown
                className={`size-4 text-slate-500 transition ${
                  openPanels.advisor ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            {openPanels.advisor && (
              <div className="space-y-3 border-t border-line p-3">
                <button
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    advisorEnabled
                      ? 'border-forest bg-emerald-50 text-forest'
                      : 'border-line bg-white text-ink'
                  }`}
                  onClick={() => setAdvisorEnabled((value) => !value)}
                  type="button"
                >
                  <span>Best today</span>
                  <span className="text-xs">
                    {advisorEnabled ? 'On' : 'Off'}
                  </span>
                </button>

                {advisorEnabled ? (
                  <div className="grid gap-2">
                    {advisorRankings.slice(0, 10).map(({ feature, score }) => (
                      <button
                        className="rounded-md border border-line bg-white p-2.5 text-left text-sm transition hover:bg-field"
                        key={feature.properties.key}
                        onClick={() => {
                          setSelectedRegionId(feature.properties.regionId)
                          setSelectedWaterbodyKey(feature.properties.key)
                          mapInstance?.easeTo({
                            center: feature.geometry.coordinates as [
                              number,
                              number,
                            ],
                            zoom: Math.max(mapInstance.getZoom(), 9),
                            duration: 500,
                          })
                        }}
                        type="button"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">
                              {feature.properties.waterbodyName}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {feature.properties.nearestTown || 'Unknown town'}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${
                              score.rating === 'Strong'
                                ? 'bg-emerald-100 text-emerald-700'
                                : score.rating === 'Fair'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {score.score}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-600">
                          {score.reasons[0] ?? 'Stocking signal available'}
                        </span>
                      </button>
                    ))}
                    {advisorRankings.length === 0 && (
                      <p className="rounded-md bg-field p-3 text-sm text-slate-600">
                        Zoom-capable mapped waterbodies are needed for today’s
                        advisor.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    Turn on Best today to rank mapped lakes using stocking data
                    and weather when available.
                  </p>
                )}
              </div>
            )}
          </section>

          {!selectedWaterbodyDetail && (
            <>
              <section className="overflow-hidden rounded-md border border-line bg-white">
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink"
                  onClick={() => togglePanel('regions')}
                  type="button"
                >
                  <span>Regions</span>
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    {rankedRegions.length}
                    <ChevronDown
                      className={`size-4 transition ${
                        openPanels.regions ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {openPanels.regions && (
                  <div className="max-h-72 overflow-auto border-t border-line">
                    {rankedRegions.map((region, index) => (
                      <button
                        className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm transition last:border-b-0 ${
                          region.id === selectedRegion?.id
                            ? 'bg-emerald-50'
                            : 'bg-white hover:bg-field'
                        }`}
                        key={region.id}
                        onClick={() => {
                          setSelectedRegionId(region.id)
                          setSelectedWaterbodyKey(null)
                          mapInstance?.easeTo({
                            center: region.center,
                            zoom: Math.max(mapInstance.getZoom(), 6),
                            duration: 500,
                          })
                        }}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-ink">
                            {index + 1}. {region.name}
                          </span>
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-emerald-700">
                            R{region.regionNumber}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {formatNumber(region.totalFish)} fish ·{' '}
                          {formatNumber(region.lakesStocked)} stocked lakes
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-md border border-line bg-white">
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink"
                  onClick={() => togglePanel('details')}
                  type="button"
                >
                  <span>Selected region</span>
                  <ChevronDown
                    className={`size-4 text-slate-500 transition ${
                      detailsPanelOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {detailsPanelOpen && selectedRegion && (
                  <div className="space-y-3 border-t border-line p-3">
                    <h2 className="text-base font-bold text-ink">
                      {selectedRegion.name}
                    </h2>

                    <>
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-md bg-field p-3">
                          <dt className="text-slate-500">Fish stocked</dt>
                          <dd className="mt-1 font-semibold text-ink">
                            {formatNumber(selectedRegion.totalFish)}
                          </dd>
                        </div>
                        <div className="rounded-md bg-field p-3">
                          <dt className="text-slate-500">Waterbodies</dt>
                          <dd className="mt-1 font-semibold text-ink">
                            {formatNumber(selectedRegion.lakesStocked)}
                          </dd>
                        </div>
                        <div className="rounded-md bg-field p-3">
                          <dt className="text-slate-500">Per waterbody</dt>
                          <dd className="mt-1 font-semibold text-ink">
                            {formatNumber(selectedRegion.fishPerLake)}
                          </dd>
                        </div>
                        <div className="rounded-md bg-field p-3">
                          <dt className="text-slate-500">Top species</dt>
                          <dd className="mt-1 font-semibold text-ink">
                            {getTopSpecies(selectedRegion.species)}
                          </dd>
                        </div>
                      </dl>

                      {selectedRegionMatchStats && (
                        <div className="rounded-md border border-line bg-field p-3 text-sm text-slate-600">
                          Mapped {selectedRegionMatchStats.matchedWaterbodies}{' '}
                          of {selectedRegionMatchStats.checkedWaterbodies}{' '}
                          {selectedRegion.name} waterbodies. Unmatched
                          waterbodies remain searchable below.
                        </div>
                      )}

                      <div>
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                          <Waves
                            className="size-4 text-water"
                            aria-hidden="true"
                          />
                          Region species mix
                        </div>
                        <div className="grid gap-2">
                          {Object.entries(selectedRegion.species)
                            .sort((a, b) => b[1] - a[1])
                            .map(([species, quantity]) => {
                              const percent =
                                selectedRegion.totalFish > 0
                                  ? (quantity / selectedRegion.totalFish) * 100
                                  : 0

                              return (
                                <div key={species}>
                                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                    <span className="font-medium text-ink">
                                      {species}
                                    </span>
                                    <span className="text-slate-500">
                                      {formatNumber(quantity)}
                                    </span>
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-field">
                                    <div
                                      className="h-full rounded-full bg-forest"
                                      style={{
                                        width: `${Math.max(percent, 4)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    </>
                  </div>
                )}
              </section>
            </>
          )}

          <section className="overflow-hidden rounded-md border border-line bg-white">
            <button
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink"
              onClick={() => togglePanel('waterbodies')}
              type="button"
            >
              <span>Waterbodies</span>
              <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                {selectedWaterbodies.length}
                <ChevronDown
                  className={`size-4 transition ${
                    openPanels.waterbodies ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {openPanels.waterbodies && (
              <div className="border-t border-line p-3">
                <input
                  className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none ring-water transition focus:ring-2"
                  onChange={(event) => setWaterbodySearch(event.target.value)}
                  placeholder="Search waterbody or town"
                  type="search"
                  value={waterbodySearch}
                />
                <div className="mt-2 flex items-center gap-2">
                  <ArrowUpDown
                    className="size-4 text-slate-500"
                    aria-hidden="true"
                  />
                  <select
                    className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none ring-water transition focus:ring-2"
                    onChange={(event) =>
                      setWaterbodySort(event.target.value as WaterbodySort)
                    }
                    value={waterbodySort}
                  >
                    <option value="quantity">Highest stocked</option>
                    <option value="name">Name A-Z</option>
                    <option value="town">Nearest town</option>
                  </select>
                </div>
                <div
                  className="mt-3 max-h-72 overflow-auto rounded-md border border-line"
                  data-testid="fish-waterbody-results"
                >
                  {selectedWaterbodies.slice(0, 60).map((waterbody) => {
                    const mappedFeature = mappedFeatureByKey.get(waterbody.key)

                    return (
                      <button
                        className={`block w-full border-b border-line p-3 text-left text-sm transition last:border-b-0 ${
                          effectiveSelectedWaterbodyKey === waterbody.key
                            ? 'bg-emerald-50'
                            : 'bg-white hover:bg-field'
                        }`}
                        key={`${waterbody.waterbodyName}-${waterbody.nearestTown}-${waterbody.waterbodyType}-${[...waterbody.reportRegions].join('-')}`}
                        data-waterbody-key={waterbody.key}
                        onClick={() => {
                          setSelectedWaterbodyKey(waterbody.key)
                          if (mappedFeature && mapInstance) {
                            mapInstance.easeTo({
                              center: mappedFeature.geometry.coordinates as [
                                number,
                                number,
                              ],
                              zoom: Math.max(mapInstance.getZoom(), 9),
                              duration: 500,
                            })
                          }
                        }}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">
                              {waterbody.waterbodyName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {waterbody.nearestTown || 'Unknown town'} ·{' '}
                              {waterbody.waterbodyType === 'river'
                                ? 'River / creek'
                                : 'Lake / waterbody'}
                            </p>
                          </div>
                          <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                            {formatNumber(waterbody.totalFish)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(waterbody.species)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([species, quantity]) => (
                              <span
                                className="rounded-full bg-field px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                key={species}
                              >
                                {species} {formatNumber(quantity)}
                              </span>
                            ))}
                          <span className="rounded-full bg-field px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {waterbody.entries} entries
                          </span>
                          {mappedFeature ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              Mapped
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              List only
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                  {selectedWaterbodies.length === 0 && (
                    <p className="p-3 text-sm text-slate-600">
                      No waterbodies match the current filters.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {data && (
            <section className="rounded-md border border-line bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Info className="size-4 text-forest" aria-hidden="true" />
                Sources
              </div>
              <div className="grid gap-2">
                <a
                  className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-field"
                  href={data.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="truncate">2025 stocking review</span>
                  <ExternalLink
                    className="size-3.5 shrink-0 text-slate-500"
                    aria-hidden="true"
                  />
                </a>
                {data.secondarySources.map((source) => (
                  <a
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-field"
                    href={source.url}
                    key={source.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="truncate">{source.label}</span>
                    <ExternalLink
                      className="size-3.5 shrink-0 text-slate-500"
                      aria-hidden="true"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      <MapCanvas
        center={BC_CENTER}
        className="h-[calc(100vh-88px)] min-h-[680px]"
        onMapReady={setMapInstance}
        zoom={4.4}
      >
        {selectedWaterbodyDetail && (
          <div
            className="absolute left-4 right-4 top-4 z-10 max-h-[calc(100%-2rem)] overflow-auto rounded-md border border-line bg-white/95 text-sm shadow-panel backdrop-blur sm:left-auto sm:w-[400px]"
            data-testid="selected-waterbody-map-card"
          >
            <div className="border-b border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-water">
                    Selected lake / river
                  </p>
                  <h2 className="mt-1 truncate text-xl font-bold text-ink">
                    {selectedWaterbodyDisplayName}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {selectedWaterbodyTownLabel} · {selectedWaterbodyTypeLabel}
                  </p>
                </div>
                <div
                  className={`grid size-[72px] shrink-0 place-items-center rounded-md text-center ${selectedScoreTone}`}
                >
                  <span className="text-[10px] font-semibold uppercase leading-none">
                    Fishing score
                  </span>
                  <span className="text-2xl font-bold leading-none">
                    {selectedFishingScore?.score ?? '--'}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedDecisionTone}`}
                >
                  {selectedFishingScore
                    ? `${selectedFishingScore.rating} · ${selectedWaterbodyDecision}`
                    : selectedWaterbodyDecision}
                </span>
                <span className="rounded-full bg-field px-2.5 py-1 text-xs font-medium text-slate-600">
                  {selectedWaterbodyFilterSummary}
                </span>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {selectedFishingScore ? (
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-md bg-emerald-50 p-3">
                    <div className="font-semibold text-ink">Why:</div>
                    <ul className="mt-1 space-y-1 text-slate-600">
                      {(selectedFishingScore.reasons.length
                        ? selectedFishingScore.reasons.slice(0, 2)
                        : ['stocking signal available']
                      ).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-md bg-field p-3">
                    <div className="font-semibold text-ink">Watch outs:</div>
                    <ul className="mt-1 space-y-1 text-slate-600">
                      {(selectedFishingScore.watchOuts.length
                        ? selectedFishingScore.watchOuts.slice(0, 2)
                        : ['no major watch outs in current data']
                      ).map((watchOut) => (
                        <li key={watchOut}>{watchOut}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-field p-3 text-xs text-slate-600">
                  Daily advisor scoring needs a mapped coordinate. Stocking
                  totals below are still lake-specific.
                </div>
              )}

              <dl className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-field p-2.5">
                  <dt className="text-[11px] text-slate-500">Stocked</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatNumber(selectedWaterbodyDetail.totalFish)}
                  </dd>
                </div>
                <div className="rounded-md bg-field p-2.5">
                  <dt className="text-[11px] text-slate-500">Entries</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatNumber(selectedWaterbodyDetail.entries)}
                  </dd>
                </div>
                <div className="rounded-md bg-field p-2.5">
                  <dt className="text-[11px] text-slate-500">Top species</dt>
                  <dd className="mt-1 truncate font-semibold text-ink">
                    {selectedWaterbodyTopSpecies}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
                  Species mix
                </p>
                <div className="grid gap-1.5">
                  {selectedWaterbodyVisibleSpecies.map(
                    ([species, quantity]) => {
                      const percent =
                        selectedWaterbodyDetail.totalFish > 0
                          ? Math.round(
                              (quantity / selectedWaterbodyDetail.totalFish) *
                                100,
                            )
                          : 0

                      return (
                        <div className="grid gap-1" key={species}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium text-ink">
                              {species} {formatNumber(quantity)} · {percent}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-field">
                            <div
                              className="h-full rounded-full bg-water"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    },
                  )}
                  {selectedWaterbodyHiddenSpeciesCount > 0 && (
                    <p className="text-[11px] text-slate-500">
                      +{selectedWaterbodyHiddenSpeciesCount} more species in
                      this filtered view
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">
                  Stocking profile
                </p>
                <div className="grid gap-1.5 text-xs">
                  {selectedWaterbodyDetail.strains.length > 0 && (
                    <div className="flex items-start justify-between gap-3 rounded-md bg-field px-2.5 py-2">
                      <span className="text-slate-500">Strains</span>
                      <span className="text-right font-medium text-ink">
                        {formatLimitedList(selectedWaterbodyDetail.strains)}
                      </span>
                    </div>
                  )}
                  {selectedWaterbodyDetail.lifeStages.length > 0 && (
                    <div className="flex items-start justify-between gap-3 rounded-md bg-field px-2.5 py-2">
                      <span className="text-slate-500">Life stage</span>
                      <span className="text-right font-medium text-ink">
                        {formatLimitedList(selectedWaterbodyDetail.lifeStages)}
                      </span>
                    </div>
                  )}
                  {selectedWaterbodyDetail.genotypes.length > 0 && (
                    <div className="flex items-start justify-between gap-3 rounded-md bg-field px-2.5 py-2">
                      <span className="text-slate-500">Genotype</span>
                      <span className="text-right font-medium text-ink">
                        {formatLimitedList(selectedWaterbodyDetail.genotypes)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedWaterbodyMappedFeature && (
                <div className="rounded-md border border-line bg-white p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink">
                      Official:{' '}
                      {selectedWaterbodyMappedFeature.properties.bcgnwsName}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                      {selectedWaterbodyStatusLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-600">
                    <span className="rounded-full bg-field px-2 py-0.5">
                      Feature:{' '}
                      {selectedWaterbodyMappedFeature.properties.featureType}
                    </span>
                    <span className="rounded-full bg-field px-2 py-0.5">
                      Region:{' '}
                      {selectedWaterbodyMappedFeature.properties.regionName}
                    </span>
                    {selectedWaterbodyMappedFeature.properties
                      .matchConfidence && (
                      <span className="rounded-full bg-field px-2 py-0.5 capitalize">
                        Match:{' '}
                        {
                          selectedWaterbodyMappedFeature.properties
                            .matchConfidence
                        }
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  className="min-h-9 flex-1 px-3 text-xs"
                  onClick={() => setSelectedWaterbodyKey(null)}
                  variant="secondary"
                >
                  Back to region data
                </Button>
                {selectedWaterbodyMappedFeature?.properties.bcgnwsUri && (
                  <a
                    className="inline-flex min-h-9 items-center rounded-md border border-line px-3 text-xs font-semibold text-water hover:bg-field"
                    href={getBcgnwsUrl(
                      selectedWaterbodyMappedFeature.properties.bcgnwsUri,
                    )}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Official record
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 max-w-[240px] rounded-md border border-line bg-white/95 p-3 text-xs shadow-panel">
          <div className="mb-2 font-semibold text-ink">Map layers</div>
          <div className="grid gap-1.5 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-forest" />
              Region totals
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-water" />
              Lake / river stats at zoom 7+
            </div>
          </div>
        </div>
      </MapCanvas>
    </section>
  )
}
