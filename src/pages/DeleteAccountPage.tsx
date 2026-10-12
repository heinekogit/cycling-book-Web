import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

export function DeleteAccountPage() {
  const { session, isLoading } = useAuth()
  const { t } = useLocale()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!session?.user.email || !confirmed || !password) return
    setIsSubmitting(true)
    setErrorMessage('')

    const { data: signedIn, error: passwordError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password,
    })
    if (passwordError || signedIn.user?.id !== session.user.id) {
      setErrorMessage(t('deleteAccount.passwordError'))
      setIsSubmitting(false)
      return
    }

    const { error: deleteError } = await supabase.rpc('delete_my_empty_account')
    if (deleteError) {
      setErrorMessage(deleteError.message.includes('Account contains records or files')
        ? t('deleteAccount.hasData')
        : t('deleteAccount.failed'))
      setIsSubmitting(false)
      return
    }

    window.localStorage.removeItem(`cycling-book.active-account.${session.user.id}`)
    await supabase.auth.signOut({ scope: 'local' })
    navigate('/signup?withdrawn=1', { replace: true })
  }

  if (isLoading) return <main className="narrow-page"><section className="form-card"><p>{t('profileSettings.loading')}</p></section></main>
  if (!session) return <main className="narrow-page"><section className="form-card"><h1>{t('deleteAccount.title')}</h1><p>{t('profileSettings.loginRequired')}</p><Link to="/login?returnTo=/delete-account">{t('nav.login')}</Link></section></main>

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">ACCOUNT</p><h1>{t('deleteAccount.title')}</h1>
    <p className="form-description">{t('deleteAccount.description')}</p>
    <p className="form-hint">{t('deleteAccount.emptyOnly')}</p>
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="delete-account-password">{t('deleteAccount.password')}</label>
      <input id="delete-account-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting} />
      <label className="delete-account-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={isSubmitting} />{t('deleteAccount.confirm')}</label>
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      <button className="button button-primary submit-button" type="submit" disabled={isSubmitting || !confirmed || !password}>{isSubmitting ? t('deleteAccount.processing') : t('deleteAccount.submit')}</button>
    </form>
    <Link className="back-link" to="/profile">{t('deleteAccount.cancel')}</Link>
  </section></main>
}
