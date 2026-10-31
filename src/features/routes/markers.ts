import { supabase } from '../../lib/supabase'
import { signedPhotoUrl } from './api'
import { distanceMeters, minimumDistanceToTrackMeters, type TrackPoint } from './geometry'

export type MarkerPhoto = { id: string; imagePath: string; imageUrl: string; thumbUrl: string; sortOrder: number; publicImagePath?: string | null; publicImageUrl?: string | null; isPubliclySelected?: boolean }
export type RouteMarker = { id: string; lat: number; lng: number; comment: string; photos: MarkerPhoto[]; isPrivacyHidden: boolean }
export type EditableMarker = RouteMarker & { newPhotos: File[] }

function insideLoop(point: TrackPoint, routeLine: TrackPoint[]) {
  if (routeLine.length < 4 || distanceMeters(routeLine[0], routeLine[routeLine.length - 1]) > 500) return false
  let inside = false
  for (let i = 0, j = routeLine.length - 1; i < routeLine.length; j = i++) {
    const first = routeLine[i]; const second = routeLine[j]
    if ((first.lat > point.lat) !== (second.lat > point.lat)
      && point.lng < (second.lng - first.lng) * (point.lat - first.lat) / (second.lat - first.lat) + first.lng) inside = !inside
  }
  return inside
}

export function markerNearRoute(point: TrackPoint, routeLine: TrackPoint[]) {
  if (routeLine.length < 2) return true
  return minimumDistanceToTrackMeters(point, routeLine) <= 500 || insideLoop(point, routeLine)
}

export async function getRouteMarkers(routeId: string | number, ownerView = false): Promise<RouteMarker[]> {
  const { data: markerRows, error } = await supabase.from('route_markers')
    .select('id,latitude,longitude,comment,is_privacy_hidden').eq('route_id', routeId).order('sort_order')
  if (error) throw error
  const ids = (markerRows ?? []).map((row) => row.id)
  const { data: photoRows, error: photoError } = ids.length
    ? await supabase.from('route_spot_photos').select('id,marker_id,image_url,thumb_url,public_image_url,is_publicly_selected,sort_order').in('marker_id', ids).order('sort_order')
    : { data: [], error: null }
  if (photoError) throw photoError
  const photos = await Promise.all((photoRows ?? []).map(async (row) => {
    const publicUrl = await signedPhotoUrl(row.public_image_url)
    const imageUrl = ownerView ? await signedPhotoUrl(row.image_url) : publicUrl
    const thumbUrl = ownerView ? await signedPhotoUrl(row.thumb_url) : publicUrl
    return {
      markerId: String(row.marker_id), id: String(row.id), imagePath: String(row.image_url),
      imageUrl: imageUrl || publicUrl || '', thumbUrl: thumbUrl || imageUrl || publicUrl || '',
      publicImagePath: row.public_image_url, publicImageUrl: publicUrl, isPubliclySelected: row.is_publicly_selected,
      sortOrder: Number(row.sort_order || 0),
    }
  }))
  return (markerRows ?? []).map((row) => ({
    id: String(row.id), lat: Number(row.latitude), lng: Number(row.longitude), comment: String(row.comment || ''),
    isPrivacyHidden: Boolean(row.is_privacy_hidden),
    photos: photos.filter((photo) => photo.markerId === String(row.id)).map(({ markerId: _markerId, ...photo }) => { void _markerId; return photo }),
  }))
}

export async function saveRouteMarkers(routeId: string | number, markers: EditableMarker[], userId: string) {
  const existing = await getRouteMarkers(routeId, true)
  const nextIds = new Set(markers.map((marker) => marker.id))
  for (const marker of existing) {
    if (nextIds.has(marker.id)) continue
    const paths = marker.photos.flatMap((photo) => [photo.imagePath, photo.publicImagePath]).filter((path): path is string => Boolean(path?.startsWith(`routes/${routeId}/`)))
    if (paths.length) await supabase.storage.from('route-photos').remove(paths)
    const { error } = await supabase.from('route_markers').delete().eq('id', marker.id).eq('route_id', routeId)
    if (error) throw error
  }
  for (const [order, marker] of markers.entries()) {
    const { error } = await supabase.from('route_markers').upsert({
      id: marker.id, route_id: routeId, latitude: marker.lat, longitude: marker.lng,
      comment: marker.comment.trim(), sort_order: order, is_privacy_hidden: false,
    }, { onConflict: 'id' })
    if (error) throw error
    const kept = new Set(marker.photos.map((photo) => photo.id))
    const old = existing.find((item) => item.id === marker.id)
    for (const photo of old?.photos ?? []) {
      if (kept.has(photo.id)) continue
      const { error: deleteError } = await supabase.from('route_spot_photos').delete().eq('id', photo.id).eq('marker_id', marker.id)
      if (deleteError) throw deleteError
      const paths = [photo.imagePath, photo.publicImagePath].filter((path): path is string => Boolean(path?.startsWith(`routes/${routeId}/`)))
      if (paths.length) await supabase.storage.from('route-photos').remove(paths)
    }
    for (const [sortOrder, photo] of marker.photos.entries()) {
      const { error: orderError } = await supabase.from('route_spot_photos').update({ sort_order: sortOrder, lat: marker.lat, lng: marker.lng }).eq('id', photo.id).eq('marker_id', marker.id)
      if (orderError) throw orderError
    }
    for (const [index, file] of marker.newPhotos.entries()) {
      const extension = file.name.split('.').at(-1)?.toLowerCase() || 'jpg'
      const path = `routes/${routeId}/markers/${marker.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('route-photos').upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { error: photoError } = await supabase.from('route_spot_photos').insert({
        route_id: routeId, user_id: userId, marker_id: marker.id, image_url: path, thumb_url: path,
        taken_at: new Date(file.lastModified || Date.now()).toISOString(),
        lat: marker.lat, lng: marker.lng, sort_order: marker.photos.length + index,
      })
      if (photoError) { await supabase.storage.from('route-photos').remove([path]); throw photoError }
    }
  }
  const saved = await getRouteMarkers(routeId, true)
  for (const marker of markers) {
    const savedMarker = saved.find((item) => item.id === marker.id)
    if (!savedMarker || savedMarker.photos.length !== marker.photos.length + marker.newPhotos.length) {
      throw new Error('マーカー写真を保存後に確認できませんでした。再度保存してください。')
    }
  }
}
