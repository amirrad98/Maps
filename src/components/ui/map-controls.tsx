import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  Check,
  Layers,
  Loader2,
  Locate,
  Maximize,
  Minimize,
  Minus,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { BASEMAPS, type BasemapId } from './map-styles'
import { greatCircleMeters, scaleBarFor, type ScaleBar } from './map-scale'

function ControlGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-line bg-white shadow-sm [&>button:not(:last-child)]:border-b [&>button:not(:last-child)]:border-line',
        className,
      )}
    >
      {children}
    </div>
  )
}

function ControlButton({
  onClick,
  label,
  children,
  disabled = false,
  pressed,
  expanded,
}: {
  onClick: () => void
  label: string
  children: ReactNode
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={label}
      aria-pressed={pressed}
      className="flex size-10 items-center justify-center text-ink transition-colors hover:bg-field focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water disabled:cursor-not-allowed disabled:opacity-50 md:size-8"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

function CompassButton({ map }: { map: MapLibreMap }) {
  const compassRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const updateRotation = () => {
      if (!compassRef.current) return
      compassRef.current.style.transform = `rotateX(${map.getPitch()}deg) rotateZ(${-map.getBearing()}deg)`
    }
    map.on('rotate', updateRotation)
    map.on('pitch', updateRotation)
    updateRotation()
    return () => {
      map.off('rotate', updateRotation)
      map.off('pitch', updateRotation)
    }
  }, [map])

  return (
    <ControlButton
      label="Reset bearing to north"
      onClick={() => map.resetNorthPitch({ duration: 300 })}
    >
      <svg
        aria-hidden="true"
        className="size-5 transition-transform duration-200 md:size-4"
        ref={compassRef}
        style={{ transformStyle: 'preserve-3d' }}
        viewBox="0 0 24 24"
      >
        <path className="fill-red-500" d="M12 2L16 12H12V2Z" />
        <path className="fill-red-300" d="M12 2L8 12H12V2Z" />
        <path className="fill-slate-400" d="M12 22L16 12H12V22Z" />
        <path className="fill-slate-300" d="M12 22L8 12H12V22Z" />
      </svg>
    </ControlButton>
  )
}

function BasemapPicker({
  basemap,
  onBasemapChange,
}: {
  basemap: BasemapId
  onBasemapChange: (basemap: BasemapId) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (
        event instanceof PointerEvent &&
        rootRef.current?.contains(event.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <ControlGroup>
        <ControlButton
          expanded={open}
          label="Change basemap"
          onClick={() => setOpen((value) => !value)}
        >
          <Layers className="size-4" aria-hidden="true" />
        </ControlButton>
      </ControlGroup>
      {open && (
        <div
          className="absolute right-full top-0 mr-1.5 w-32 overflow-hidden rounded-md border border-line bg-white py-1 text-sm shadow-panel"
          role="menu"
        >
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              aria-checked={id === basemap}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-ink hover:bg-field md:py-1.5"
              key={id}
              onClick={() => {
                onBasemapChange(id)
                setOpen(false)
              }}
              role="menuitemradio"
              type="button"
            >
              {BASEMAPS[id].label}
              {id === basemap && (
                <Check className="size-4 text-forest" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type MapControlsProps = {
  map: MapLibreMap
  /** Element to show fullscreen; the map wrapper, so overlays come along. */
  fullscreenTarget: HTMLElement | null
  basemap: BasemapId
  onBasemapChange: (basemap: BasemapId) => void
}

/**
 * Themed zoom / compass / locate / fullscreen / basemap controls, drawn in the
 * app's own style instead of MapLibre's default control chrome.
 */
export function MapControls({
  map,
  fullscreenTarget,
  basemap,
  onBasemapChange,
}: MapControlsProps) {
  const [locating, setLocating] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const update = () =>
      setIsFullscreen(
        Boolean(fullscreenTarget) &&
          document.fullscreenElement === fullscreenTarget,
      )
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [fullscreenTarget])

  const handleLocate = useCallback(() => {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), 12),
          duration: 1500,
        })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }, [map])

  const handleFullscreen = useCallback(() => {
    if (!fullscreenTarget) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void fullscreenTarget.requestFullscreen()
    }
  }, [fullscreenTarget])

  const canFullscreen =
    typeof document !== 'undefined' && document.fullscreenEnabled

  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
      {/* Touch screens pinch to zoom, so keep the small map uncluttered there. */}
      <ControlGroup className="[@media(pointer:coarse)]:hidden">
        <ControlButton
          label="Zoom in"
          onClick={() => map.zoomTo(map.getZoom() + 1, { duration: 300 })}
        >
          <Plus className="size-4" aria-hidden="true" />
        </ControlButton>
        <ControlButton
          label="Zoom out"
          onClick={() => map.zoomTo(map.getZoom() - 1, { duration: 300 })}
        >
          <Minus className="size-4" aria-hidden="true" />
        </ControlButton>
      </ControlGroup>
      <ControlGroup>
        <CompassButton map={map} />
      </ControlGroup>
      <ControlGroup>
        <ControlButton
          disabled={locating}
          label="Find my location"
          onClick={handleLocate}
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Locate className="size-4" aria-hidden="true" />
          )}
        </ControlButton>
      </ControlGroup>
      {canFullscreen && (
        <ControlGroup className="max-md:hidden">
          <ControlButton
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={handleFullscreen}
            pressed={isFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="size-4" aria-hidden="true" />
            ) : (
              <Maximize className="size-4" aria-hidden="true" />
            )}
          </ControlButton>
        </ControlGroup>
      )}
      <BasemapPicker basemap={basemap} onBasemapChange={onBasemapChange} />
    </div>
  )
}

type MapScaleBarProps = {
  map: MapLibreMap
  /** Longest the bar may be, in pixels (default 100). */
  maxWidth?: number
  /** Hide when the map is pitched past this, where one scale no longer holds (default 60°). */
  hideAbovePitch?: number
}

/**
 * A metric scale bar measured across the map's vertical middle, great-circle,
 * as MapLibre's own control is, but drawn in the app's theme. Hidden on a
 * steeply pitched map, where the scale runs from centimetres at the bottom to
 * kilometres at the horizon.
 */
export function MapScaleBar({
  map,
  maxWidth = 100,
  hideAbovePitch = 60,
}: MapScaleBarProps) {
  const [bar, setBar] = useState<ScaleBar | null>(null)

  useEffect(() => {
    const update = () => {
      if (map.getPitch() > hideAbovePitch) {
        setBar(null)
        return
      }
      const y = map.getContainer().clientHeight / 2
      const left = map.unproject([0, y])
      const right = map.unproject([maxWidth, y])
      setBar(scaleBarFor(greatCircleMeters(left, right) / maxWidth, maxWidth))
    }
    update()
    map.on('move', update)
    map.on('resize', update)
    return () => {
      map.off('move', update)
      map.off('resize', update)
    }
  }, [map, maxWidth, hideAbovePitch])

  if (!bar) return null
  return (
    <div
      aria-label={`Scale: ${bar.label}`}
      className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-white/85 px-1.5 pb-1 pt-0.5 text-[10px] leading-3 text-ink shadow-sm"
      data-map-scale={bar.meters}
      role="img"
    >
      <span className="block tabular-nums">{bar.label}</span>
      <span
        className="mt-0.5 block h-1.5 border-x-2 border-b-2 border-ink"
        style={{ width: `${bar.pixels}px` }}
      />
    </div>
  )
}
