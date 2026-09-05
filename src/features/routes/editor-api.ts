import { supabase } from '../../lib/supabase'
import { totalDistanceMeters, type TrackPoint } from './geometry'

export type RouteEditorPayload = {
  name: string
  accountId: string | number
  routeLine: TrackPoint[]
  polyline: string
}

const toDatabasePayload = ({ name, accountId, routeLine, polyline }: RouteEditorPayload) => ({
  name,
  geojson: { type: 'LineString', coordinates: routeLine.map((point) => [point.lng, point.lat]) },
  polyline,
  distance_m: Math.round(totalDistanceMeters(routeLine)),
  is_public: false,
  account_id: accountId,
  owner_account_id: accountId,
  // 現行DBのcheck制約はplannedをまだ許可しないため、描画ルートは
  // 旧Web版と同じfrom_run + origin:drawnで保存する。
  route_type: 'from_run',
  origin: 'drawn',
})

export async function createRoute(payload: RouteEditorPayload) {
  const { data, error } = await supabase.from('routes').insert(toDatabasePayload(payload)).select('id').maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('保存したルートIDを取得できません')
  return data.id as string | number
}

export async function updateRoute(routeId: string, payload: RouteEditorPayload) {
  const { data, error } = await supabase.from('routes').update(toDatabasePayload(payload)).eq('id', routeId).eq('account_id', payload.accountId).select('id').maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('更新対象のルートを確認できません')
  return data.id as string | number
}
