import type { AccountRole, AvailableAccount } from './types'

const roleRank: Record<AccountRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
}

export function hasRole(account: AvailableAccount | null | undefined, minimumRole: AccountRole) {
  return Boolean(account && roleRank[account.role] >= roleRank[minimumRole])
}

export function canEditAccount(account: AvailableAccount | null | undefined) {
  return hasRole(account, 'editor')
}

export function canManageMembers(account: AvailableAccount | null | undefined) {
  return hasRole(account, 'admin')
}

export function canManageAccount(account: AvailableAccount | null | undefined) {
  return hasRole(account, 'owner')
}
