import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { authRedirectUrl } from '../features/auth/redirect'
import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

export function SignUpPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrorMessage('')
    if (password.length < 8) { setErrorMessage(t('auth.passwordLength')); return }
    if (password !== confirmation) { setErrorMessage(t('auth.passwordMismatch')); return }
    setIsSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectUrl('auth/callback') },
    })
    setIsSubmitting(false)
    if (error) { setErrorMessage(error.status === 429 ? t('auth.emailRateLimit') : t('auth.signupError')); return }
    if (data.session) { navigate('/mypage', { replace: true }); return }
    setSuccess(true)
  }

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">{t('auth.signupEyebrow')}</p><h1>{t('auth.signupTitle')}</h1>
    <p className="form-description">{t('auth.signupDescription')}</p>
    {success ? <p className="form-success" role="status">{t('auth.signupSent')}</p> : <form onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="signup-email">{t('login.email')}</label>
      <input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSubmitting} />
      <label htmlFor="signup-password">{t('login.password')}</label>
      <input id="signup-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting} />
      <p className="form-hint">{t('auth.passwordHint')}</p>
      <label htmlFor="signup-confirmation">{t('auth.confirmPassword')}</label>
      <input id="signup-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isSubmitting} />
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t('auth.sending') : t('auth.signupSubmit')}</button>
    </form>}
    <Link className="back-link" to="/login">{t('auth.backToLogin')}</Link>
  </section></main>
}
