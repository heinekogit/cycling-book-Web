import { supabase } from '../../lib/supabase'
import type { RoutePhoto } from './api'

/** Canvas encoding emits image pixels without the source file's EXIF metadata. */
async function publicJpeg(sourceUrl: string): Promise<Blob> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error('元画像を読み込めませんでした')
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('画像を変換できませんでした')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!result) throw new Error('公開用画像を作成できませんでした')
    return result
  } finally {
    bitmap.close()
  }
}

export async function setPhotoPublicChoice(routeId: number | string, photo: RoutePhoto, selected: boolean) {
  if (!selected) {
    // Remove the bytes first so an already issued signed URL cannot keep
    // serving the image for the remainder of its lifetime.
    if (photo.public_image_path) {
      const { error: removeError } = await supabase.storage.from('route-photos').remove([photo.public_image_path])
      if (removeError) throw removeError
    }
    const { error } = await supabase.from('route_spot_photos').update({ is_publicly_selected: false, public_image_url: null }).eq('id', photo.id).eq('route_id', routeId)
    if (error) throw error
    return { is_publicly_selected: false, public_image_url: null, public_image_signed_url: null }
  }

  const blob = await publicJpeg(photo.image_url)
  const path = `routes/${routeId}/public/${photo.id}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from('route-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError
  const { error } = await supabase.from('route_spot_photos').update({ public_image_url: path, is_publicly_selected: true }).eq('id', photo.id).eq('route_id', routeId)
  if (error) {
    await supabase.storage.from('route-photos').remove([path])
    throw error
  }
  const { data } = await supabase.storage.from('route-photos').createSignedUrl(path, 60 * 60)
  return { is_publicly_selected: true, public_image_url: path, public_image_signed_url: data?.signedUrl || null }
}
