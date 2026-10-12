import { supabase } from '../../lib/supabase'
import { totalDistanceMeters, type TrackPoint } from './geometry'
import { signedPhotoUrl, type RoutePhoto } from './api'

export type RoutePhotoCandidate = {
  key: string
  runPhotoId: string | null
  legacyPhotoId: string | null
  imagePath: string
  thumbPath: string | null
  imageUrl: string
  thumbUrl: string
  takenAt: string | null
  lat: number | null
  lng: number | null
}

export type RouteEditorPayload = {
  name: string
  accountId: string | number
  routeLine: TrackPoint[]
  controlPoints?: TrackPoint[]
  polyline: string
  description?: string
  isPublic?: boolean
  sourceRunId?: string | number | null
  distanceM?: number | null
  copiedFromRouteId?: string | number | null
}

const toDatabasePayload = ({ name, accountId, routeLine, controlPoints, polyline, description = '', isPublic = false, sourceRunId = null, distanceM = null, copiedFromRouteId = null }: RouteEditorPayload) => ({
  name,
  geojson: {
    type: 'Feature',
    properties: { trackPoints: routeLine.map((point) => ({ lat: point.lat, lng: point.lng, timestamp: point.timestamp, elevation: point.elevation, segmentStart: point.segmentStart })), ...(controlPoints ? { controlPoints: controlPoints.map((point) => ({ lat: point.lat, lng: point.lng })) } : {}) },
    geometry: { type: 'LineString', coordinates: routeLine.map((point) => [point.lng, point.lat]) },
  },
  polyline,
  distance_m: Math.round(distanceM ?? totalDistanceMeters(routeLine)),
  is_public: isPublic,
  description: description.trim() || null,
  account_id: accountId,
  owner_account_id: accountId,
  // 現行DBのcheck制約はplannedをまだ許可しないため、描画ルートは
  // 旧Web版と同じfrom_run + origin:drawnで保存する。
  route_type: 'from_run',
  origin: sourceRunId == null ? 'drawn' : 'from_log',
  source_run_id: sourceRunId,
  copied_from_route_id: copiedFromRouteId,
})

export async function createRoute(payload: RouteEditorPayload) {
  const { data, error } = await supabase.from('routes').insert(toDatabasePayload({ ...payload, isPublic: false })).select('id').maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('保存したルートIDを取得できません')
  return data.id as string | number
}

export async function updateRoute(routeId: string, payload: RouteEditorPayload) {
  const { data, error } = await supabase.from('routes').update({ ...toDatabasePayload({ ...payload, isPublic: false }), privacy_filter_enabled: false, privacy_zone_radius_m: null }).eq('id', routeId).eq('account_id', payload.accountId).select('id').maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('更新対象のルートを確認できません')
  const { error: privateGeometryError } = await supabase.from('route_private_geometries').delete().eq('route_id', routeId)
  if (privateGeometryError) throw privateGeometryError
  const { error: photoVisibilityError } = await supabase.from('route_spot_photos').update({ is_privacy_hidden: false }).eq('route_id', routeId)
  if (photoVisibilityError) throw photoVisibilityError
  return data.id as string | number
}

export async function getRunPhotoCandidates(runId: string | number, legacyPhotos: RoutePhoto[] = []) {
  const { data, error } = await supabase
    .from('run_photos')
    .select('id,original_path,thumbnail_path,taken_at,latitude,longitude')
    .eq('run_id', runId)
    .order('taken_at', { ascending: true })
  if (error) throw error

  const direct = await Promise.all((data ?? []).map(async (photo) => {
    const imageUrl = await signedPhotoUrl(photo.original_path)
    const thumbUrl = await signedPhotoUrl(photo.thumbnail_path)
    return {
      key: `run:${photo.id}`,
      runPhotoId: String(photo.id),
      legacyPhotoId: null,
      imagePath: photo.original_path,
      thumbPath: photo.thumbnail_path,
      imageUrl: imageUrl || photo.original_path,
      thumbUrl: thumbUrl || imageUrl || photo.original_path,
      takenAt: photo.taken_at,
      lat: photo.latitude,
      lng: photo.longitude,
    } satisfies RoutePhotoCandidate
  }))
  const directIds = new Set(direct.map((photo) => photo.runPhotoId))
  const legacy = legacyPhotos
    .filter((photo) => !photo.run_photo_id || !directIds.has(String(photo.run_photo_id)))
    .map((photo) => ({
      key: `legacy:${photo.id}`,
      runPhotoId: null,
      legacyPhotoId: String(photo.id),
      imagePath: photo.image_path,
      thumbPath: photo.thumb_path,
      imageUrl: photo.image_url,
      thumbUrl: photo.thumb_url || photo.image_url,
      takenAt: photo.taken_at,
      lat: photo.lat,
      lng: photo.lng,
    } satisfies RoutePhotoCandidate))
  return [...direct, ...legacy].sort((a, b) => String(a.takenAt || '').localeCompare(String(b.takenAt || '')))
}

export async function saveRoutePhotoSelections(routeId: string | number, runId: string | number, photos: RoutePhotoCandidate[], userId: string) {
  const { error: selectionDeleteError } = await supabase.from('route_photo_selections').delete().eq('route_id', routeId)
  if (selectionDeleteError) throw selectionDeleteError
  const directSelections = photos.flatMap((photo, sortOrder) => photo.runPhotoId ? [{ route_id: routeId, run_photo_id: photo.runPhotoId, sort_order: sortOrder }] : [])
  if (directSelections.length) {
    const { error } = await supabase.from('route_photo_selections').insert(directSelections)
    if (error) throw error
  }

  // route_spot_photos is kept as a display-compatible reference for legacy and
  // public-route clients. It stores the same object paths; image files are not copied.
  const { error: compatibilityDeleteError } = await supabase.from('route_spot_photos').delete().eq('route_id', routeId).is('marker_id', null)
  if (compatibilityDeleteError) throw compatibilityDeleteError
  if (!photos.length) return
  const { error: compatibilityInsertError } = await supabase.from('route_spot_photos').insert(photos.map((photo, sortOrder) => ({
    route_id: routeId,
    user_id: userId,
    image_url: photo.imagePath,
    thumb_url: photo.thumbPath,
    taken_at: photo.takenAt,
    lat: photo.lat,
    lng: photo.lng,
    run_id: runId,
    sort_order: sortOrder,
  })))
  if (compatibilityInsertError) throw compatibilityInsertError
}
