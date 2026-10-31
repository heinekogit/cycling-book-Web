import { supabase } from '../../lib/supabase'
import type { ElevationRecord } from '../elevation/elevation'

export type ExploreRoute = { id: number | string; name: string | null; created_at: string | null; copy_count: number }
export type RouteDetail = ExploreRoute & ElevationRecord & {
  distance_m: number | null
  is_public: boolean | null
  origin: string | null
  route_type: string | null
  description: string | null
  source_run_id: number | string | null
  geojson: unknown
  polyline: string | null
  account_id: string | number | null
  copied_from_route_id: number | string | null
  privacy_filter_enabled: boolean
  privacy_zone_radius_m: number | null
}

export type RoutePhoto = {
  id: number | string
  image_url: string
  thumb_url: string | null
  image_path: string
  thumb_path: string | null
  taken_at: string | null
  lat: number | null
  lng: number | null
  run_photo_id: string | null
  sort_order: number
  is_privacy_hidden: boolean
  is_publicly_selected: boolean
  public_image_path: string | null
  public_image_signed_url: string | null
  marker_id: string | null
}

const photoBucket = 'route-photos'

function storagePathFromUrl(url: string) {
  if (!url.includes('://')) return url.replace(/^\/+/, '')
  const markers = ['public', 'sign', 'authenticated'].map((access) => `/storage/v1/object/${access}/${photoBucket}/`)
  const marker = markers.find((candidate) => url.includes(candidate))
  if (!marker) return null
  const encodedPath = url.split(marker)[1]?.split('?')[0]
  if (!encodedPath) return null
  try { return decodeURIComponent(encodedPath) } catch { return encodedPath }
}

export async function signedPhotoUrl(url: string | null) {
  if (!url) return null
  const path = storagePathFromUrl(url)
  if (!path) return url
  const { data, error } = await supabase.storage.from(photoBucket).createSignedUrl(path, 60 * 60)
  if (error) {
    console.warn('写真の署名URLを作成できませんでした', { path, message: error.message })
    return null
  }
  return data.signedUrl
}

export async function getPublicRoutes(limit = 10) {
  const { data, error } = await supabase.from('routes').select('id,name,created_at,copy_count').eq('is_public', true).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  const routes = (data ?? []) as ExploreRoute[]
  const photoCounts: Record<string, number> = {}
  if (routes.length) {
    const { data: photos, error: photoError } = await supabase.from('route_spot_photos').select('route_id').in('route_id', routes.map((route) => route.id)).eq('is_publicly_selected', true).eq('is_privacy_hidden', false).is('deleted_at', null)
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
  const { data, error } = await supabase.from('routes').select('id,name,created_at,distance_m,is_public,origin,route_type,description,source_run_id,geojson,polyline,account_id,copied_from_route_id,copy_count,privacy_filter_enabled,privacy_zone_radius_m,elevation_profile,elevation_gain_m,elevation_loss_m,elevation_min_m,elevation_max_m,elevation_source,elevation_updated_at').eq('id', routeId).maybeSingle()
  if (error) throw error
  return data as RouteDetail | null
}

export async function getPrivateRouteGeometry(routeId: string | number) {
  const { data, error } = await supabase.from('route_private_geometries').select('geojson,polyline,distance_m').eq('route_id', routeId).maybeSingle()
  if (error) throw error
  return data as { geojson: unknown; polyline: string | null; distance_m: number | null } | null
}

export async function getSourceRunGeometry(runId: number | string) {
  const { data, error } = await supabase.from('runs').select('geojson,polyline,started_at,created_at').eq('id', runId).maybeSingle()
  if (error) throw error
  return data as { geojson: unknown; polyline: string | null; started_at: string | null; created_at: string | null } | null
}

export async function getRoutePhotos(routeId: number | string, ownerView = false) {
  const { data, error } = await supabase
    .from('route_spot_photos')
    .select('id,image_url,thumb_url,public_image_url,is_publicly_selected,taken_at,lat,lng,run_photo_id,sort_order,is_privacy_hidden,marker_id')
    .eq('route_id', routeId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('taken_at', { ascending: true })
  if (error) throw error
  return Promise.all((data ?? []).map(async (photo) => {
    const publicUrl = await signedPhotoUrl(photo.public_image_url)
    const imageUrl = ownerView ? await signedPhotoUrl(photo.image_url) : publicUrl
    const thumbUrl = ownerView ? await signedPhotoUrl(photo.thumb_url) : publicUrl
    return { ...photo, image_path: photo.image_url, thumb_path: photo.thumb_url,
      public_image_path: photo.public_image_url, public_image_signed_url: publicUrl,
      image_url: imageUrl || publicUrl || '', thumb_url: thumbUrl || imageUrl || publicUrl,
    } satisfies RoutePhoto
  }))
}

export async function getRunPhotos(runId: number | string) {
  const { data, error } = await supabase
    .from('run_photos')
    .select('id,original_path,thumbnail_path,taken_at,latitude,longitude')
    .eq('run_id', runId)
    .order('taken_at', { ascending: true })
  if (error) throw error
  return Promise.all((data ?? []).map(async (photo, index) => {
    const imageUrl = await signedPhotoUrl(photo.original_path)
    const thumbUrl = await signedPhotoUrl(photo.thumbnail_path)
    return {
      id: photo.id,
      image_url: imageUrl || photo.original_path,
      thumb_url: thumbUrl || imageUrl,
      image_path: photo.original_path,
      thumb_path: photo.thumbnail_path,
      taken_at: photo.taken_at,
      lat: photo.latitude,
      lng: photo.longitude,
      run_photo_id: String(photo.id),
      sort_order: index,
      is_privacy_hidden: false,
      is_publicly_selected: false,
      public_image_path: null,
      public_image_signed_url: null,
      marker_id: null,
    } satisfies RoutePhoto
  }))
}

export async function updateRouteVisibility(routeId: number | string, accountId: number | string, isPublic: boolean, options?: { publicGeoJson: unknown; publicDistanceM: number; filterEnabled: boolean; radiusM: number; hiddenPhotoIds: string[]; hiddenMarkerIds: string[] }) {
  void accountId
  const { data, error } = await supabase.rpc('set_route_publication', {
    requested_route_id: Number(routeId),
    make_public: isPublic,
    filtered_geojson: options?.publicGeoJson ?? null,
    filter_enabled: options?.filterEnabled ?? false,
    radius_m: options?.radiusM ?? 500,
    filtered_distance_m: options?.publicDistanceM ?? null,
    hidden_photo_ids: options?.hiddenPhotoIds ?? [],
    hidden_marker_ids: options?.hiddenMarkerIds ?? [],
  })
  if (error) throw error
  const updated = Array.isArray(data) ? data[0] : data
  if (!updated) throw new Error('更新対象のルートを確認できません')
  return updated as { id: number | string; is_public: boolean }
}
