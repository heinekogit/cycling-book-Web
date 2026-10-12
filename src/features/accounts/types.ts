export type AccountType = 'personal' | 'group'
export type AccountRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type PlanCode = 'personal_free' | 'personal_pro' | 'group'
export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

export type AvailableAccount = {
  id: string
  accountType: AccountType
  displayName: string
  role: AccountRole
  planCode: PlanCode | null
  planStatus: PlanStatus | null
  source: 'foundation' | 'legacy'
}

export type PlanEntitlement = {
  featureCode: string
  enabled: boolean
  limitValue: number | null
  settings: Record<string, unknown>
}
