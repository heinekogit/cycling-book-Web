import type { TrackPoint } from '../routes/geometry'

export type LocationCandidate = { point: TrackPoint; label: string; kind: string }

type LocationIQResult = {
  lat?: string
  lon?: string
  display_name?: string
  type?: string
  class?: string
}

export async function searchLocationIQ(query: string): Promise<LocationCandidate[]> {
  const token = import.meta.env.VITE_LOCATIONIQ_TOKEN
  if (!token) throw new Error('LocationIQ token is not configured')
  const parameters = new URLSearchParams({
    key: token,
    q: query,
    countrycodes: 'jp',
    'accept-language': 'ja',
    limit: '5',
    format: 'json',
    addressdetails: '1',
  })
  const response = await fetch(`https://us1.locationiq.com/v1/search?${parameters.toString()}`)
  if (response.status === 404) return []
  if (response.status === 429) throw new Error('LocationIQ rate limit exceeded')
  if (!response.ok) throw new Error(`LocationIQ geocoding failed: ${response.status}`)
  const results = await response.json() as LocationIQResult[]
  if (!Array.isArray(results)) throw new Error('Invalid LocationIQ response')
  return results.flatMap((result) => {
    const lat = Number(result.lat)
    const lng = Number(result.lon)
    if (!result.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [{ point: { lat, lng }, label: result.display_name, kind: [result.class, result.type].filter(Boolean).join(' / ') }]
  })
}
