import type { Map as MapLibreMap } from 'maplibre-gl'

// Matches the `lg` breakpoint where map pages switch to a side-by-side layout.
const STACKED_LAYOUT_QUERY = '(max-width: 1023px)'

export function isStackedLayout() {
  return window.matchMedia(STACKED_LAYOUT_QUERY).matches
}

export function getMapPadding(map: MapLibreMap, desktopPadding: number) {
  const { width, height } = map.getContainer().getBoundingClientRect()
  return Math.min(desktopPadding, Math.round(Math.min(width, height) / 8))
}

// On stacked (phone/tablet) layouts the map sits above the lists, so bring it
// back into view after the user picks something further down the page.
export function revealMapOnStackedLayout(element: HTMLElement | null) {
  if (!element || !isStackedLayout()) return

  const rect = element.getBoundingClientRect()
  const visibleHeight =
    Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  if (visibleHeight >= rect.height * 0.6) return

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  element.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}
