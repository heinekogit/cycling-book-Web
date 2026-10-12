import { supabase } from '../../lib/supabase'
import { storedElevationProfile, type ElevationProfile, type ElevationSource } from './elevation'

const elevationPayload = (profile: ElevationProfile, source: ElevationSource) => ({
  elevation_profile: storedElevationProfile(profile),
  elevation_gain_m: profile.gain,
  elevation_loss_m: profile.loss,
  elevation_min_m: profile.minimum,
  elevation_max_m: profile.maximum,
  elevation_source: source,
  elevation_updated_at: new Date().toISOString(),
})

export async function saveRunElevationProfile(runId: string | number, accountId: string | number, profile: ElevationProfile, source: ElevationSource) {
  const { data, error } = await supabase.from('runs').update(elevationPayload(profile, source)).eq('id', runId).eq('account_id', accountId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('標高を保存する実走ログを確認できません')
}

export async function saveRouteElevationProfile(routeId: string | number, accountId: string | number, profile: ElevationProfile, source: ElevationSource) {
  const { data, error } = await supabase.from('routes').update(elevationPayload(profile, source)).eq('id', routeId).eq('account_id', accountId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('標高を保存するマイルートを確認できません')
}
