import { supabase } from '../../lib/supabase'

export type ExploreRoute = { id: number | string; name: string | null; created_at: string | null }
export type RouteDetail = ExploreRoute & {
  distance_m: number | null
  is_public: boolean | null
  origin: string | null
  route_type: string | null
  description: string | null
  source_run_id: number | string | null
  geojson: unknown
  polyline: string | null
  account_id: string | number | null
}

export type RoutePhoto = {
  id: number | string
  image_url: string
  thumb_url: string | null
  taken_at: string | null
  lat: number | null
  lng: number | null
}

export async function getPublicRoutes(limit = 10) {
  const { data, error } = await supabase.from('routes').select('id,name,created_at').eq('is_public', true).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  const routes = (data ?? []) as ExploreRoute[]
  const photoCounts: Record<string, number> = {}
  if (routes.length) {
    const { data: photos, error: photoError } = await supabase.from('route_spot_photos').select('route_id').in('route_id', routes.map((route) => route.id))
    if (!photoError) {
      for (const photo of photos ?? []) {
        const routeId = String(photo.route_id)
        photoCounts[routeId] = (photoCounts[routeId] ?? 0) + 1
      }
    }
  }
  return { routes, photoCounts }
}

export async function getRoute(routeId: string) {
  const { data, error } = await supabase.from('routes').select('id,name,created_at,distance_m,is_public,origin,route_type,description,source_run_id,geojson,polyline,account_id').eq('id', routeId).maybeSingle()
  if (error) throw error
  return data as RouteDetail | null
}

export async function getSourceRunGeometry(runId: number | string) {
  const { data, error } = await supabase.from('runs').select('geojson,polyline').eq('id', runId).maybeSingle()
  if (error) throw error
  return data as { geojson: unknown; polyline: string | null } | null
}

export async function getRoutePhotos(routeId: number | string) {
  const { data, error } = await supabase
    .from('route_spot_photos')
    .select('id,image_url,thumb_url,taken_at,lat,lng')
    .eq('route_id', routeId)
    .order('taken_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RoutePhoto[]
}

export async function updateRouteVisibility(routeId: number | string, accountId: number | string, isPublic: boolean) {
  const { data, error } = await supabase
    .from('routes')
    .update({ is_public: isPublic })
    .eq('id', routeId)
    .eq('account_id', accountId)
    .select('id,is_public')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('更新対象のルートを確認できません')
  return data as { id: number | string; is_public: boolean }
}
