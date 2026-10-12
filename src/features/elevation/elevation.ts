import { distanceMeters, type TrackPoint } from '../routes/geometry'

export type ElevationProfile = {
  elevations: number[]
  distances: number[]
  gain: number
  loss: number
  minimum: number
  maximum: number
  averageGrade: number
}

export type ElevationSource = 'device' | 'api' | 'inherited' | 'embedded' | 'imported'
export type StoredElevationProfile = { version: 1; distances_m: number[]; elevations_m: number[] }
export type ElevationRecord = {
  elevation_profile: unknown
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  elevation_min_m: number | null
  elevation_max_m: number | null
  elevation_source: ElevationSource | null
  elevation_updated_at: string | null
}

function samplePoints(points: TrackPoint[], maximum: number) {
  if (points.length <= maximum) return points.slice()
  const result: TrackPoint[] = []
  const step = (points.length - 1) / (maximum - 1)
  for (let index = 0; index < maximum; index += 1) result.push(points[Math.round(index * step)])
  return result
}

async function fetchJson(url: string, options?: RequestInit) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response.ok ? await response.json() as unknown : null
  } catch { return null } finally { window.clearTimeout(timeout) }
}

async function fetchFromOpenMeteo(points: TrackPoint[]) {
  const samples = samplePoints(points, 100)
  const latitude = samples.map((point) => point.lat).join(',')
  const longitude = samples.map((point) => point.lng).join(',')
  const response = await fetchJson(`https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`, { mode: 'cors' })
  const values = response && typeof response === 'object' ? (response as { elevation?: unknown }).elevation : null
  const elevations = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : null
  return { elevations: elevations && elevations.length >= 2 ? elevations : null, sampleCount: samples.length }
}

function expandSamples(pointCount: number, elevations: number[], sampleCount: number) {
  if (pointCount <= elevations.length) return elevations.slice(0, pointCount)
  const expanded = new Array<number>(pointCount)
  const step = (pointCount - 1) / Math.max(1, sampleCount - 1)
  for (let index = 0; index < pointCount; index += 1) {
    const position = index / step
    const left = Math.floor(position)
    if (left >= elevations.length - 1) expanded[index] = elevations[elevations.length - 1]
    else {
      const ratio = position - left
      expanded[index] = elevations[left] * (1 - ratio) + elevations[left + 1] * ratio
    }
  }
  return expanded
}

function smooth(values: number[]) {
  const radius = values.length < 7 ? 1 : 2
  return values.map((_value, index) => {
    const slice = values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
    return slice.reduce((sum, item) => sum + item, 0) / slice.length
  })
}

function createProfile(points: TrackPoint[], rawElevations: number[]): ElevationProfile {
  const elevations = smooth(rawElevations)
  const distances = [0]
  for (let index = 1; index < points.length; index += 1) distances.push(distances[index - 1] + (points[index].segmentStart ? 0 : distanceMeters(points[index - 1], points[index])))
  let gain = 0; let loss = 0
  for (let index = 1; index < elevations.length; index += 1) {
    if (points[index].segmentStart) continue
    const change = elevations[index] - elevations[index - 1]
    if (change > .5) gain += change
    else if (change < -.5) loss -= change
  }
  const totalDistance = distances.at(-1) ?? 0
  return {
    elevations,
    distances,
    gain: Math.round(gain),
    loss: Math.round(loss),
    minimum: Math.round(Math.min(...elevations)),
    maximum: Math.round(Math.max(...elevations)),
    averageGrade: totalDistance > 0 ? gain / totalDistance * 100 : 0,
  }
}

export function storedElevationProfile(profile: ElevationProfile): StoredElevationProfile {
  return { version: 1, distances_m: profile.distances, elevations_m: profile.elevations }
}

export function elevationProfileFromRecord(record: Pick<ElevationRecord, 'elevation_profile' | 'elevation_gain_m' | 'elevation_loss_m' | 'elevation_min_m' | 'elevation_max_m'> | null | undefined): ElevationProfile | null {
  if (!record?.elevation_profile || typeof record.elevation_profile !== 'object') return null
  const value = record.elevation_profile as Partial<StoredElevationProfile>
  if (value.version !== 1 || !Array.isArray(value.distances_m) || !Array.isArray(value.elevations_m) || value.distances_m.length < 2 || value.distances_m.length !== value.elevations_m.length) return null
  const distances = value.distances_m.map(Number); const elevations = value.elevations_m.map(Number)
  if (!distances.every(Number.isFinite) || !elevations.every(Number.isFinite)) return null
  let calculatedGain = 0; let calculatedLoss = 0
  for (let index = 1; index < elevations.length; index += 1) {
    const change = elevations[index] - elevations[index - 1]
    if (change > .5) calculatedGain += change
    else if (change < -.5) calculatedLoss -= change
  }
  const gain = record.elevation_gain_m == null ? Math.round(calculatedGain) : Number(record.elevation_gain_m)
  const loss = record.elevation_loss_m == null ? Math.round(calculatedLoss) : Number(record.elevation_loss_m)
  const minimum = record.elevation_min_m == null ? Math.round(Math.min(...elevations)) : Number(record.elevation_min_m)
  const maximum = record.elevation_max_m == null ? Math.round(Math.max(...elevations)) : Number(record.elevation_max_m)
  const totalDistance = distances.at(-1) ?? 0
  return {
    distances,
    elevations,
    gain: Number.isFinite(gain) ? gain : 0,
    loss: Number.isFinite(loss) ? loss : 0,
    minimum: Number.isFinite(minimum) ? minimum : Math.round(Math.min(...elevations)),
    maximum: Number.isFinite(maximum) ? maximum : Math.round(Math.max(...elevations)),
    averageGrade: totalDistance > 0 && Number.isFinite(gain) ? gain / totalDistance * 100 : 0,
  }
}

export async function loadElevationProfile(points: TrackPoint[]) {
  if (points.length < 2) return null
  const embedded = points.every((point) => Number.isFinite(point.elevation)) ? points.map((point) => point.elevation as number) : null
  if (embedded) return { profile: createProfile(points, embedded), source: 'embedded' as const }
  const result = await fetchFromOpenMeteo(points)
  return result.elevations
    ? { profile: createProfile(points, expandSamples(points.length, result.elevations, result.sampleCount)), source: 'api' as const }
    : null
}
