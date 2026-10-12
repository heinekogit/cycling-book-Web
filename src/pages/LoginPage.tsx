import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { safeReturnTo } from '../features/auth/redirect'
import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session, isLoading } = useAuth()
  const { t } = useLocale()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  useEffect(() => { if (!isLoading && session) navigate(returnTo, { replace: true }) }, [isLoading, navigate, returnTo, session])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) { setErrorMessage(t('login.required')); return }
    setIsSubmitting(true); setErrorMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setIsSubmitting(false)
    if (error) {
      const isInvalidCredentials = error.message.toLowerCase().includes('invalid login credentials')
      setErrorMessage(isInvalidCredentials
        ? t('login.invalid')
        : t('login.connectionError', { status: error.status || t('login.connectionStatus') }))
      return
    }
    navigate(returnTo, { replace: true })
  }

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">{t('login.eyebrow')}</p><h1>{t('login.title')}</h1><p className="form-description">{t('login.description')}</p>
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="email">{t('login.email')}</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} />
      <label htmlFor="password">{t('login.password')}</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting} />
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t('login.submitting') : t('login.submit')}</button>
    </form>
    <div className="auth-links"><Link to="/signup">{t('auth.signupLink')}</Link><Link to="/forgot-password">{t('auth.forgotLink')}</Link></div>
    <Link className="back-link" to="/">{t('login.back')}</Link>
  </section></main>
}
