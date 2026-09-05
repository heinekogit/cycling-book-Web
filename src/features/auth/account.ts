import { supabase } from '../../lib/supabase'

export async function getAccountId(userId: string) {
  const { data, error } = await supabase.from('users').select('account_id').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.account_id as string | number | null
}
