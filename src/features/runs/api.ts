import { supabase } from '../../lib/supabase'
import type { ElevationRecord } from '../elevation/elevation'

export type RunDetail = ElevationRecord & {
  id: string | number
  name: string | null
  created_at: string | null
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  duration_s: number | null
  avg_speed_kmh: number | null
  geojson: unknown
  polyline: string | null
  account_id: string | number | null
}

export async function getRun(runId: string) {
  const { data, error } = await supabase.from('runs')
    .select('id,name,created_at,started_at,ended_at,distance_m,duration_s,avg_speed_kmh,geojson,polyline,account_id,elevation_profile,elevation_gain_m,elevation_loss_m,elevation_min_m,elevation_max_m,elevation_source,elevation_updated_at')
    .eq('id', runId)
    .maybeSingle()
  if (error) throw error
  return data as RunDetail | null
}

export async function getRouteForRun(runId: string | number, accountId: string | number, runTimeValue?: string | null) {
  const { data, error } = await supabase.from('routes')
    .select('id,name,created_at')
    .eq('source_run_id', runId)
    .eq('account_id', accountId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (data) return data as { id: string | number; name: string | null }

  return getLegacyRouteForRun(accountId, runTimeValue)
}

export async function getLegacyRouteForRun(accountId: string | number, runTimeValue?: string | null) {
  const runTime = runTimeValue ? new Date(runTimeValue).getTime() : Number.NaN
  if (!Number.isFinite(runTime)) return null
  const { data: legacyRoutes, error: legacyError } = await supabase.from('routes')
    .select('id,name,created_at')
    .eq('account_id', accountId)
    .eq('route_type', 'from_run')
    .is('source_run_id', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (legacyError) throw legacyError

  const closest = (legacyRoutes ?? []).reduce<{ id: string | number; name: string | null; difference: number } | null>((best, route) => {
    const routeTime = route.created_at ? new Date(route.created_at).getTime() : Number.NaN
    const difference = Math.abs(routeTime - runTime)
    if (!Number.isFinite(difference) || (best && best.difference <= difference)) return best
    return { id: route.id, name: route.name, difference }
  }, null)
  return closest && closest.difference <= 6 * 60 * 60 * 1000 ? { id: closest.id, name: closest.name } : null
}

export async function getConvertedRouteForRun(runId: string | number, accountId: string | number) {
  const { data, error } = await supabase.from('routes')
    .select('id,name')
    .eq('source_run_id', runId)
    .eq('account_id', accountId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { id: string | number; name: string | null } | null
}

export async function deleteRun(runId: string | number, accountId: string | number) {
  const { error } = await supabase.from('runs').delete().eq('id', runId).eq('account_id', accountId)
  if (error) throw error
}
