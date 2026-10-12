import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { getAvailableAccounts, getPlanEntitlements } from './api'
import type { AvailableAccount, PlanEntitlement } from './types'

type AccountContextValue = {
  accounts: AvailableAccount[]
  activeAccount: AvailableAccount | null
  activeAccountId: string | null
  entitlements: PlanEntitlement[]
  isLoading: boolean
  error: Error | null
  setActiveAccountId: (accountId: string) => void
  refreshAccounts: () => Promise<void>
  findAccount: (accountId: string | number | null | undefined) => AvailableAccount | null
}

const AccountContext = createContext<AccountContextValue | null>(null)
const storageKey = (userId: string) => `cycling-book.active-account.${userId}`

export function AccountProvider({ children }: PropsWithChildren) {
  const { session, isLoading: isAuthLoading } = useAuth()
  const [accounts, setAccounts] = useState<AvailableAccount[]>([])
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null)
  const [entitlements, setEntitlements] = useState<PlanEntitlement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refreshAccounts = useCallback(async () => {
    const userId = session?.user.id
    if (!userId) {
      setAccounts([]); setActiveAccountIdState(null); setEntitlements([]); setError(null); setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const nextAccounts = await getAvailableAccounts(userId)
      const storedId = window.localStorage.getItem(storageKey(userId))
      const nextActive = nextAccounts.find((account) => account.id === storedId)
        ?? nextAccounts.find((account) => account.accountType === 'personal')
        ?? nextAccounts[0]
        ?? null
      setAccounts(nextAccounts)
      setActiveAccountIdState(nextActive?.id ?? null)
      setEntitlements(await getPlanEntitlements(nextActive?.planCode ?? null))
      setError(null)
    } catch (caught) {
      setAccounts([]); setActiveAccountIdState(null); setEntitlements([])
      setError(caught instanceof Error ? caught : new Error(String(caught)))
    } finally {
      setIsLoading(false)
    }
  }, [session?.user.id])

  useEffect(() => {
    if (isAuthLoading) return
    const timeoutId = window.setTimeout(() => { void refreshAccounts() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [isAuthLoading, refreshAccounts])

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  )

  const setActiveAccountId = useCallback((accountId: string) => {
    const userId = session?.user.id
    const next = accounts.find((account) => account.id === accountId)
    if (!userId || !next) return
    window.localStorage.setItem(storageKey(userId), next.id)
    setActiveAccountIdState(next.id)
    void getPlanEntitlements(next.planCode).then(setEntitlements)
  }, [accounts, session?.user.id])

  const value = useMemo<AccountContextValue>(() => ({
    accounts,
    activeAccount,
    activeAccountId,
    entitlements,
    isLoading,
    error,
    setActiveAccountId,
    refreshAccounts,
    findAccount: (accountId) => accountId == null
      ? null
      : accounts.find((account) => account.id === String(accountId)) ?? null,
  }), [accounts, activeAccount, activeAccountId, entitlements, error, isLoading, refreshAccounts, setActiveAccountId])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('useAccount must be used inside AccountProvider')
  return context
}
