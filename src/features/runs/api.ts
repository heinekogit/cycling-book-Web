import { supabase } from '../../lib/supabase'

export type RunDetail = {
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
    .select('id,name,created_at,started_at,ended_at,distance_m,duration_s,avg_speed_kmh,geojson,polyline,account_id')
    .eq('id', runId)
    .maybeSingle()
  if (error) throw error
  return data as RunDetail | null
}

export async function getRouteForRun(runId: string | number, accountId: string | number) {
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
