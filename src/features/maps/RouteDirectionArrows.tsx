import { divIcon, point as leafletPoint } from 'leaflet'
import { useState } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'

import type { TrackPoint } from '../routes/geometry'

type DirectionArrow = TrackPoint & { angle: number }

function arrowsForSegment(segment: TrackPoint[], map: ReturnType<typeof useMap>, spacing: number) {
  if (segment.length < 2) return []
  const projected = segment.map((point) => map.latLngToLayerPoint([point.lat, point.lng]))
  const arrows: DirectionArrow[] = []
  let nextDistance = spacing * .65
  let travelled = 0
  for (let index = 1; index < projected.length; index += 1) {
    const first = projected[index - 1]
    const second = projected[index]
    const segmentLength = first.distanceTo(second)
    if (segmentLength < 1) continue
    while (nextDistance <= travelled + segmentLength) {
      const ratio = (nextDistance - travelled) / segmentLength
      const pixel = leafletPoint(first.x + (second.x - first.x) * ratio, first.y + (second.y - first.y) * ratio)
      const location = map.layerPointToLatLng(pixel)
      arrows.push({ lat: location.lat, lng: location.lng, angle: Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI })
      nextDistance += spacing
    }
    travelled += segmentLength
  }
  return arrows
}

export function RouteDirectionArrows({ segments, color = '#3b82f6' }: { segments: TrackPoint[][]; color?: string }) {
  const map = useMap()
  const [, setViewVersion] = useState(0)
  useMapEvents({ zoomend: () => setViewVersion((value) => value + 1) })
  const arrows = segments.flatMap((segment) => arrowsForSegment(segment, map, 125))

  return <>{arrows.map((arrow, index) => {
    const icon = divIcon({
      className: 'route-direction-arrow-shell',
      html: `<span class="route-direction-arrow" style="color:${color};transform:rotate(${arrow.angle}deg)">➤</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
    return <Marker key={`${index}-${arrow.lat}-${arrow.lng}`} position={[arrow.lat, arrow.lng]} icon={icon} interactive={false} keyboard={false} />
  })}</>
}
