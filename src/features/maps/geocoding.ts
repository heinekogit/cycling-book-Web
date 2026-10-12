import type { TrackPoint } from '../routes/geometry'

type GeocodingFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: { full_address?: string; name?: string }
}

export async function searchJapaneseLocation(query: string): Promise<{ point: TrackPoint; label: string }> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) throw new Error('Mapbox token is not configured')
  const parameters = new URLSearchParams({
    q: query,
    country: 'JP',
    language: 'ja',
    limit: '1',
    access_token: token,
  })
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${parameters.toString()}`)
  if (!response.ok) throw new Error(`Mapbox geocoding failed: ${response.status}`)
  const value = await response.json() as { features?: GeocodingFeature[] }
  const feature = value.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) throw new Error('Location was not found')
  return {
    point: { lat: coordinates[1], lng: coordinates[0] },
    label: feature.properties?.full_address || feature.properties?.name || query,
  }
}
