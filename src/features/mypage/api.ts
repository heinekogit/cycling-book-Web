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
}

export async function getMyRoutes(accountId: string | number) {
  const { data, error } = await supabase.from('routes')
    .select('id,name,created_at,is_public,route_type,source_run_id,origin,distance_m')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as MyRoute[]).filter((route) => !(route.origin === 'from_log' && route.route_type === 'from_run'))
}

export async function getMyRuns(accountId: string | number) {
  const { data, error } = await supabase.from('runs')
    .select('id,name,created_at,started_at,distance_m,duration_s')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as MyRun[]
}

export async function deleteOwnedRecord(table: 'routes' | 'runs', id: string | number, accountId: string | number) {
  const { error } = await supabase.from(table).delete().eq('id', id).eq('account_id', accountId)
  if (error) throw error
}
