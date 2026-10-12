import { supabase } from '../../lib/supabase'
import { loadElevationProfile } from '../elevation/elevation'
import { saveRouteElevationProfile, saveRunElevationProfile } from '../elevation/api'
import { createRoute } from '../routes/editor-api'
import { encodePolyline } from '../routes/routing'
import { trackGeoJson, type ParsedGpx } from './gpx'

export async function importGpxAsRoute(gpx: ParsedGpx, accountId: string | number, name: string) {
  const routeId = await createRoute({ name, accountId, routeLine: gpx.points, polyline: encodePolyline(gpx.points), distanceM: gpx.distanceM })
  try {
    const elevation = await loadElevationProfile(gpx.points)
    if (elevation) await saveRouteElevationProfile(routeId, accountId, elevation.profile, elevation.source === 'embedded' ? 'imported' : elevation.source)
  } catch (error) {
    console.warn('GPXルートの標高プロフィールを保存できませんでした', error)
  }
  return routeId
}

export async function importGpxAsRun(gpx: ParsedGpx, accountId: string | number, name: string) {
  const { data, error } = await supabase.from('runs').insert({
    account_id: accountId,
    name,
    started_at: gpx.startedAt,
    ended_at: gpx.endedAt,
    distance_m: Math.round(gpx.distanceM),
    duration_s: gpx.durationS,
    geojson: trackGeoJson(gpx.points),
    polyline: encodePolyline(gpx.points),
  }).select('id').single()
  if (error) throw error
  const runId = data.id as string | number
  try {
    const elevation = await loadElevationProfile(gpx.points)
    if (elevation) await saveRunElevationProfile(runId, accountId, elevation.profile, elevation.source === 'embedded' ? 'imported' : elevation.source)
  } catch (error) {
    console.warn('GPX実走ログの標高プロフィールを保存できませんでした', error)
  }
  return runId
}
