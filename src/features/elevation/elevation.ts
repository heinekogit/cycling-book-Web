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

function readElevationResults(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const results = (value as { results?: Array<{ elevation?: unknown }> }).results
  if (!Array.isArray(results)) return null
  const elevations = results.map((item) => Number(item?.elevation)).filter(Number.isFinite)
  return elevations.length >= 2 ? elevations : null
}

async function fetchFromOpenElevation(points: TrackPoint[]) {
  const samples = samplePoints(points, 120)
  const response = await fetchJson('https://api.open-elevation.com/api/v1/lookup', {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations: samples.map((point) => ({ latitude: point.lat, longitude: point.lng })) }),
  })
  return { elevations: readElevationResults(response), sampleCount: samples.length }
}

async function fetchFromOpenTopoData(points: TrackPoint[]) {
  const samples = samplePoints(points, 80)
  const locations = samples.map((point) => `${point.lat},${point.lng}`).join('|')
  const response = await fetchJson(`https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locations)}&interpolation=cubic`, { mode: 'cors' })
  return { elevations: readElevationResults(response), sampleCount: samples.length }
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
  for (let index = 1; index < points.length; index += 1) distances.push(distances[index - 1] + distanceMeters(points[index - 1], points[index]))
  let gain = 0; let loss = 0
  for (let index = 1; index < elevations.length; index += 1) {
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

export async function loadElevationProfile(points: TrackPoint[]) {
  if (points.length < 2) return null
  const embedded = points.every((point) => Number.isFinite(point.elevation)) ? points.map((point) => point.elevation as number) : null
  if (embedded) return createProfile(points, embedded)
  for (const provider of [fetchFromOpenElevation, fetchFromOpenTopoData]) {
    const result = await provider(points)
    if (result.elevations) return createProfile(points, expandSamples(points.length, result.elevations, result.sampleCount))
  }
  return null
}
