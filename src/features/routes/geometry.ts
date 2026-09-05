export type TrackPoint = { lat: number; lng: number; timestamp?: number; elevation?: number }
type RouteGeometrySource = { geojson?: unknown; polyline?: string | null }

const MAX_GAP_MS = 5 * 60 * 1000
const MAX_JUMP_METERS = 500

function parseJson(input: unknown): unknown {
  if (typeof input !== 'string') return input
  try {
    const parsed: unknown = JSON.parse(input)
    return typeof parsed === 'string' ? JSON.parse(parsed) as unknown : parsed
  } catch {
    return null
  }
}

function toTimestamp(value: unknown) {
  if (value == null || value === '') return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizePoint(input: unknown): TrackPoint | null {
  if (Array.isArray(input)) {
    let first = Number(input[0])
    let second = Number(input[1])
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null
    if (Math.abs(first) > 90 && Math.abs(second) <= 90) [first, second] = [second, first]
    const timestamp = toTimestamp(input[2])
    return timestamp == null ? { lat: first, lng: second } : { lat: first, lng: second, timestamp }
  }
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  const lat = Number(value.lat ?? value.latitude)
  const lng = Number(value.lng ?? value.lon ?? value.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const timestamp = toTimestamp(value.ts ?? value.timestamp)
  const elevation = Number(value.ele ?? value.elevation ?? value.altitude)
  return {
    lat,
    lng,
    ...(timestamp == null ? {} : { timestamp }),
    ...(Number.isFinite(elevation) ? { elevation } : {}),
  }
}

function pointsFromGeoJson(input: unknown) {
  const geojson = parseJson(input)
  const points: TrackPoint[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const value = node as Record<string, unknown>
    const properties = value.properties as Record<string, unknown> | undefined
    if (Array.isArray(properties?.trackPoints)) {
      const tracked = properties.trackPoints.map(normalizePoint).filter((point): point is TrackPoint => point !== null)
      if (tracked.length) { points.push(...tracked); return }
    }
    if (value.type === 'Feature') { walk(value.geometry); return }
    if (value.type === 'FeatureCollection' && Array.isArray(value.features)) { value.features.forEach(walk); return }
    if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) { value.geometries.forEach(walk); return }
    if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
      for (const pair of value.coordinates) {
        if (!Array.isArray(pair)) continue
        const lng = Number(pair[0]); const lat = Number(pair[1])
        if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng })
      }
      return
    }
    if (value.type === 'MultiLineString' && Array.isArray(value.coordinates)) {
      for (const line of value.coordinates) walk({ type: 'LineString', coordinates: line })
    }
  }
  walk(geojson)
  return points
}

export function decodePolyline(encoded: string) {
  const points: TrackPoint[] = []
  let index = 0; let latitude = 0; let longitude = 0
  const decodeValue = () => {
    let result = 0; let shift = 0; let byte: number
    do {
      if (index >= encoded.length) throw new Error('Invalid polyline')
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  try {
    while (index < encoded.length) {
      latitude += decodeValue(); longitude += decodeValue()
      points.push({ lat: latitude / 1e5, lng: longitude / 1e5 })
    }
  } catch { return [] }
  return points
}

export function extractRoutePoints(source: RouteGeometrySource) {
  const geoJsonPoints = pointsFromGeoJson(source.geojson)
  if (geoJsonPoints.length) return geoJsonPoints
  return source.polyline ? decodePolyline(source.polyline) : []
}

export function distanceMeters(first: TrackPoint, second: TrackPoint) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const radius = 6_371_000
  const latitudeDelta = radians(second.lat - first.lat)
  const longitudeDelta = radians(second.lng - first.lng)
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(value))
}

export function totalDistanceMeters(points: TrackPoint[]) {
  return points.slice(1).reduce((sum, point, index) => sum + distanceMeters(points[index], point), 0)
}

export function splitRouteSegments(points: TrackPoint[]) {
  if (!points.length) return []
  const segments: TrackPoint[][] = []
  let current = [points[0]]
  for (const point of points.slice(1)) {
    const previous = current[current.length - 1]
    const timeGap = previous.timestamp != null && point.timestamp != null ? Math.abs(point.timestamp - previous.timestamp) : 0
    if (timeGap >= MAX_GAP_MS || distanceMeters(previous, point) >= MAX_JUMP_METERS) {
      if (current.length >= 2) segments.push(current)
      current = [point]
    } else current.push(point)
  }
  if (current.length >= 2) segments.push(current)
  return segments
}

export function routeTypeLabel(routeType: string | null, origin: string | null, sourceRunId: number | string | null) {
  if (origin === 'drawn' || routeType === 'planned' || routeType === 'manual' || (routeType === 'from_run' && origin === 'manual')) return '描画ルート'
  if (routeType === 'from_run' || sourceRunId) return '実走ログ由来'
  return routeType || '未設定'
}
