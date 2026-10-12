import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { authRedirectUrl } from '../features/auth/redirect'
import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl('reset-password'),
    })
    setIsSubmitting(false)
    if (error) { setErrorMessage(error.status === 429 ? t('auth.emailRateLimit') : t('auth.resetRequestError')); return }
    setSent(true)
  }

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">{t('auth.resetEyebrow')}</p><h1>{t('auth.forgotTitle')}</h1>
    <p className="form-description">{t('auth.forgotDescription')}</p>
    {sent ? <p className="form-success" role="status">{t('auth.resetSent')}</p> : <form onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="reset-email">{t('login.email')}</label>
      <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} />
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t('auth.sending') : t('auth.sendReset')}</button>
    </form>}
    <Link className="back-link" to="/login">{t('auth.backToLogin')}</Link>
  </section></main>
}
