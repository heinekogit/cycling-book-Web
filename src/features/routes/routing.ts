import { decodePolyline, type TrackPoint } from './geometry'

export type TravelMode = 'cycling' | 'walking' | 'driving'

export async function getSnappedRoute(points: TrackPoint[], mode: TravelMode) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) throw new Error('Mapbox token is not configured')
  if (points.length < 2) return points
  const route: TrackPoint[] = []
  for (let start = 0; start < points.length - 1; start += 24) {
    const chunk = points.slice(start, Math.min(points.length, start + 25))
    const path = chunk.map((point) => `${point.lng},${point.lat}`).join(';')
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${mode}/${path}?geometries=polyline&overview=full&access_token=${encodeURIComponent(token)}`)
    if (!response.ok) throw new Error(`Mapbox routing failed: ${response.status}`)
    const value = await response.json() as { routes?: Array<{ geometry?: string }> }
    const encoded = value.routes?.[0]?.geometry
    if (!encoded) throw new Error('Route geometry is missing')
    const segment = decodePolyline(encoded)
    if (route.length) segment.shift()
    route.push(...segment)
  }
  return route
}

export function encodePolyline(points: TrackPoint[]) {
  let lastLatitude = 0; let lastLongitude = 0; let encoded = ''
  const append = (input: number) => {
    let value = input < 0 ? ~(input << 1) : input << 1
    while (value >= 0x20) { encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63); value >>= 5 }
    encoded += String.fromCharCode(value + 63)
  }
  for (const point of points) {
    const latitude = Math.round(point.lat * 1e5); const longitude = Math.round(point.lng * 1e5)
    append(latitude - lastLatitude); append(longitude - lastLongitude)
    lastLatitude = latitude; lastLongitude = longitude
  }
  return encoded
}
