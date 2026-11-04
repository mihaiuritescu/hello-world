import L from 'leaflet'

/**
 * The marker icon for several rooms whose pins would overlap: a circle with their count. The
 * count goes in as text on an element, never as an HTML string. It's hidden from assistive
 * technology, which reads the marker's title instead, such as "3 chatrooms".
 */
export function clusterIcon(count: number): L.DivIcon {
  const label = document.createElement('span')
  label.className = 'room-cluster__count'
  label.textContent = String(count)
  label.setAttribute('aria-hidden', 'true')
  const { size, modifier } = sizeFor(count)
  return L.divIcon({
    html: label,
    className: `room-cluster room-cluster--${modifier}`,
    iconSize: [size, size],
  })
}

/** Bigger groups get bigger circles, as on most maps. Sizes are in pixels. */
function sizeFor(count: number): { size: number; modifier: string } {
  if (count < 10) return { size: 36, modifier: 'small' }
  if (count < 100) return { size: 42, modifier: 'medium' }
  return { size: 50, modifier: 'large' }
}
