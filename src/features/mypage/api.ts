import { supabase } from '../../lib/supabase'

export type MyRoute = {
  id: string | number
  name: string | null
  created_at: string | null
  is_public: boolean | null
  route_type: string | null
  source_run_id: string | number | null
  origin: string | null
  distance_m: number | null
}

export type MyRun = {
  id: string | number
  name: string | null
  created_at: string | null
  started_at: string | null
  distance_m: number | null
  duration_s: number | null
  has_photos: boolean
}

export async function getMyRoutes(accountId: string | number) {
  const { data, error } = await supabase.from('routes')
    .select('id,name,created_at,is_public,route_type,source_run_id,origin,distance_m')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as MyRoute[]).filter((route) => !(route.origin === 'from_log' && route.route_type === 'from_run' && route.source_run_id == null))
}

export async function getMyRuns(accountId: string | number) {
  const { data, error } = await supabase.from('runs')
    .select('id,name,created_at,started_at,distance_m,duration_s')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const runs = (data ?? []) as Omit<MyRun, 'has_photos'>[]
  if (runs.length === 0) return []

  const { data: relatedRoutes, error: routeError } = await supabase.from('routes')
    .select('id,source_run_id,created_at,route_type')
    .eq('account_id', accountId)
  if (routeError) throw routeError

  const routeIds = (relatedRoutes ?? []).map((route) => route.id)
  const runIdsWithPhotos = new Set<string>()
  const { data: runPhotos, error: runPhotoError } = await supabase.from('run_photos')
    .select('run_id')
    .in('run_id', runs.map((run) => run.id))
  if (runPhotoError) throw runPhotoError
  for (const photo of runPhotos ?? []) runIdsWithPhotos.add(String(photo.run_id))
  if (routeIds.length > 0) {
    const { data: photos, error: photoError } = await supabase.from('route_spot_photos')
      .select('route_id')
      .in('route_id', routeIds)
    if (photoError) throw photoError

    const runIdByRouteId = new Map<string, string>()
    for (const route of relatedRoutes ?? []) {
      if (route.source_run_id != null) {
        runIdByRouteId.set(String(route.id), String(route.source_run_id))
        continue
      }

      if (route.route_type !== 'from_run') continue

      const routeTime = route.created_at ? new Date(route.created_at).getTime() : Number.NaN
      if (!Number.isFinite(routeTime)) continue
      let closestRun: Omit<MyRun, 'has_photos'> | null = null
      let closestDifference = Number.POSITIVE_INFINITY
      for (const run of runs) {
        const runTimeValue = run.started_at || run.created_at
        const runTime = runTimeValue ? new Date(runTimeValue).getTime() : Number.NaN
        const difference = Math.abs(routeTime - runTime)
        if (Number.isFinite(difference) && difference < closestDifference) {
          closestRun = run
          closestDifference = difference
        }
      }
      if (closestRun && closestDifference <= 6 * 60 * 60 * 1000) runIdByRouteId.set(String(route.id), String(closestRun.id))
    }
    for (const photo of photos ?? []) {
      const runId = runIdByRouteId.get(String(photo.route_id))
      if (runId) runIdsWithPhotos.add(runId)
    }
  }

  return runs.map((run) => ({ ...run, has_photos: runIdsWithPhotos.has(String(run.id)) }))
}

export async function deleteOwnedRecord(table: 'routes' | 'runs', id: string | number, accountId: string | number) {
  const { error } = await supabase.from(table).delete().eq('id', id).eq('account_id', accountId)
  if (error) throw error
}
