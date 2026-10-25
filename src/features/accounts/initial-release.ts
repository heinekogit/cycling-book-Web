import type { AvailableAccount } from './types'

// Route and run permissions still use the user's personal account_id.
// Keep group memberships in the database, but never expose one as an active
// account until the Web, iOS, RLS, and Storage group rules are implemented.
export function initialReleaseAccounts(available: AvailableAccount[], legacyAccount: AvailableAccount | null) {
  const personalAccount = available.find((account) =>
    account.accountType === 'personal' && account.id === legacyAccount?.id && account.role === 'owner',
  )
  if (personalAccount) return [personalAccount]
  if (legacyAccount && !available.some((account) => account.id === legacyAccount.id)) return [legacyAccount]
  return []
}
