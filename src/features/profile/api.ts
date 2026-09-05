import { supabase } from '../../lib/supabase'

export type Profile = {
  id: string
  account_id: string | number | null
  display_name: string | null
  profile_image: string | null
  home_lat: number | null
  home_lng: number | null
  home_name: string | null
}

export type ProfileUpdate = Pick<Profile, 'display_name' | 'home_lat' | 'home_lng' | 'home_name'>

export type PublicProfile = Pick<Profile, 'account_id' | 'display_name' | 'profile_image'>

export type PublicProfileRoute = {
  id: string | number
  name: string | null
  created_at: string | null
  distance_m: number | null
}

const columns = 'id,account_id,display_name,profile_image,home_lat,home_lng,home_name'

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from('users').select(columns).eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function updateProfile(userId: string, values: ProfileUpdate) {
  const { data, error } = await supabase.from('users').update(values).eq('id', userId).select(columns).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function getPublicProfile(accountId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('account_id,display_name,profile_image')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) throw error
  return data as PublicProfile | null
}

export async function getPublicProfileRoutes(accountId: string) {
  const { data, error } = await supabase
    .from('routes')
    .select('id,name,created_at,distance_m')
    .eq('account_id', accountId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PublicProfileRoute[]
}
