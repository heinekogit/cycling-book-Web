import { supabase } from '../../lib/supabase'
import type { AccountRole, AvailableAccount, PlanCode, PlanEntitlement, PlanStatus } from './types'

type LegacyUser = { account_id: string | number | null; display_name: string | null }
type MembershipRow = { account_id: string; role: AccountRole }
type AccountRow = { id: string; type: 'user' | 'org'; display_name: string }
type SubscriptionRow = { account_id: string; plan_id: 'free' | 'pro' | 'group'; status: PlanStatus; created_at: string }
type EntitlementRow = { feature_code: string; enabled: boolean; limit_value: number | null; settings: Record<string, unknown> | null }

async function getLegacyPersonalAccount(userId: string) {
  const { data, error } = await supabase.from('users').select('account_id,display_name').eq('id', userId).maybeSingle()
  if (error) throw error
  const legacy = data as LegacyUser | null
  if (legacy?.account_id == null) return null
  return {
    id: String(legacy.account_id),
    accountType: 'personal',
    displayName: legacy.display_name?.trim() || 'Cycling Book ライダー',
    role: 'owner',
    planCode: 'personal_free',
    planStatus: 'active',
    source: 'legacy',
  } satisfies AvailableAccount
}

export async function getAvailableAccounts(userId: string) {
  const legacyAccount = await getLegacyPersonalAccount(userId)
  const { data: membershipData, error: membershipError } = await supabase
    .from('account_memberships')
    .select('account_id,role')
    .eq('user_id', userId)
    .eq('status', 'active')

  // The migration can be deployed independently from the React release. Until
  // the new tables exist, the legacy personal account remains the active model.
  if (membershipError) return legacyAccount ? [legacyAccount] : []

  const memberships = (membershipData ?? []) as MembershipRow[]
  if (!memberships.length) return legacyAccount ? [legacyAccount] : []
  const accountIds = memberships.map((membership) => membership.account_id)
  const [{ data: accountData, error: accountError }, { data: subscriptionData, error: subscriptionError }] = await Promise.all([
    supabase.from('accounts').select('id,type,display_name').in('id', accountIds),
    supabase.from('subscriptions').select('account_id,plan_id,status,created_at').in('account_id', accountIds).in('status', ['trialing', 'active', 'past_due']).order('created_at', { ascending: false }),
  ])
  if (accountError) return legacyAccount ? [legacyAccount] : []

  const accounts = (accountData ?? []) as AccountRow[]
  const subscriptions = subscriptionError ? [] : (subscriptionData ?? []) as SubscriptionRow[]
  const roleByAccount = new Map(memberships.map((membership) => [String(membership.account_id), membership.role]))
  const planByAccount = new Map<string, SubscriptionRow>()
  for (const subscription of subscriptions) {
    if (!planByAccount.has(String(subscription.account_id))) planByAccount.set(String(subscription.account_id), subscription)
  }

  const available = accounts.map((account): AvailableAccount => {
    const subscription = planByAccount.get(String(account.id))
    const planCode: PlanCode | null = subscription
      ? subscription.plan_id === 'free'
        ? 'personal_free'
        : subscription.plan_id === 'pro'
          ? 'personal_pro'
          : 'group'
      : null
    return {
      id: String(account.id),
      accountType: account.type === 'org' ? 'group' : 'personal',
      displayName: account.display_name,
      role: roleByAccount.get(String(account.id)) ?? 'viewer',
      planCode,
      planStatus: subscription?.status ?? null,
      source: 'foundation',
    }
  })

  if (legacyAccount && !available.some((account) => account.id === legacyAccount.id)) available.unshift(legacyAccount)
  return available
}

export async function getPlanEntitlements(planCode: PlanCode | null) {
  if (!planCode) return []
  const { data, error } = await supabase
    .from('plan_entitlements')
    .select('feature_code,enabled,limit_value,settings')
    .eq('plan_id', planCode === 'personal_free' ? 'free' : planCode === 'personal_pro' ? 'pro' : 'group')
  if (error) return []
  return ((data ?? []) as EntitlementRow[]).map((row): PlanEntitlement => ({
    featureCode: row.feature_code,
    enabled: row.enabled,
    limitValue: row.limit_value,
    settings: row.settings ?? {},
  }))
}
