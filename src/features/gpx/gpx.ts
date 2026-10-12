import { totalDistanceMeters, type TrackPoint } from '../routes/geometry'

export type ParsedGpx = {
  name: string
  points: TrackPoint[]
  distanceM: number
  startedAt: string | null
  endedAt: string | null
  durationS: number | null
  elevationCount: number
}

const firstText = (parent: Document | Element, localName: string) => parent.getElementsByTagNameNS('*', localName)[0]?.textContent?.trim() || ''

function parsePoint(element: Element, segmentStart: boolean): TrackPoint | null {
  const lat = Number(element.getAttribute('lat')); const lng = Number(element.getAttribute('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const elevationText = firstText(element, 'ele'); const elevation = Number(elevationText)
  const timeText = firstText(element, 'time'); const timestamp = timeText ? Date.parse(timeText) : Number.NaN
  return {
    lat,
    lng,
    ...(elevationText && Number.isFinite(elevation) ? { elevation } : {}),
    ...(Number.isFinite(timestamp) ? { timestamp } : {}),
    ...(segmentStart ? { segmentStart: true } : {}),
  }
}

export function parseGpx(text: string, fallbackName = 'GPXから取り込んだルート'): ParsedGpx {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('GPXファイルのXMLを読み取れませんでした。')
  const segments = [...document.getElementsByTagNameNS('*', 'trkseg')]
  const points: TrackPoint[] = []
  if (segments.length) {
    segments.forEach((segment, segmentIndex) => {
      const segmentPoints = [...segment.getElementsByTagNameNS('*', 'trkpt')]
      segmentPoints.forEach((element, pointIndex) => {
        const point = parsePoint(element, segmentIndex > 0 && pointIndex === 0)
        if (point) points.push(point)
      })
    })
  } else {
    const routePoints = [...document.getElementsByTagNameNS('*', 'rtept')]
    const candidates = routePoints.length ? routePoints : [...document.getElementsByTagNameNS('*', 'wpt')]
    candidates.forEach((element, index) => { const point = parsePoint(element, index === 0); if (point) points.push(point) })
  }
  if (points.length < 2) throw new Error('GPX内に有効な軌跡が2地点以上ありません。')
  if (points.length > 200_000) throw new Error('GPXの地点数が多すぎます。20万地点以下のファイルを使用してください。')
  const timestamps = points.flatMap((point) => point.timestamp == null ? [] : [point.timestamp]).sort((a, b) => a - b)
  const started = timestamps[0]; const ended = timestamps.at(-1)
  const durationS = started != null && ended != null && ended > started ? Math.round((ended - started) / 1000) : null
  const trackName = firstText(document, 'name')
  return {
    name: trackName || fallbackName,
    points,
    distanceM: totalDistanceMeters(points),
    startedAt: started == null ? null : new Date(started).toISOString(),
    endedAt: ended == null ? null : new Date(ended).toISOString(),
    durationS,
    elevationCount: points.filter((point) => point.elevation != null).length,
  }
}

export function trackGeoJson(points: TrackPoint[]) {
  return {
    type: 'Feature',
    properties: { trackPoints: points.map((point) => ({ lat: point.lat, lng: point.lng, timestamp: point.timestamp, elevation: point.elevation, segmentStart: point.segmentStart })) },
    geometry: { type: 'LineString', coordinates: points.map((point) => [point.lng, point.lat]) },
  }
}
