import type { PlanEntitlement } from './types'

export function hasFeature(entitlements: PlanEntitlement[], featureCode: string, fallback = false) {
  return entitlements.find((item) => item.featureCode === featureCode)?.enabled ?? fallback
}

export function getLimit(entitlements: PlanEntitlement[], featureCode: string) {
  const entitlement = entitlements.find((item) => item.featureCode === featureCode)
  return entitlement?.enabled ? entitlement.limitValue : null
}
