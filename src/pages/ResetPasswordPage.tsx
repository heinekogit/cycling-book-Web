import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

export function ResetPasswordPage() {
  const { session, isLoading } = useAuth()
  const { t } = useLocale()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [updated, setUpdated] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const linkError = hash.has('error') || hash.has('error_code')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrorMessage('')
    if (password.length < 8) { setErrorMessage(t('auth.passwordLength')); return }
    if (password !== confirmation) { setErrorMessage(t('auth.passwordMismatch')); return }
    setIsSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsSubmitting(false)
    if (error) { setErrorMessage(t('auth.updatePasswordError')); return }
    setUpdated(true)
  }

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">{t('auth.resetEyebrow')}</p><h1>{t('auth.newPasswordTitle')}</h1>
    {updated ? <p className="form-success" role="status">{t('auth.passwordUpdated')}</p>
      : linkError ? <p className="form-error" role="alert">{t('auth.linkInvalid')}</p>
      : isLoading ? <p className="form-description">{t('auth.verifyingLink')}</p>
      : !session ? <p className="form-error" role="alert">{t('auth.linkInvalid')}</p>
      : <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="new-password">{t('auth.newPassword')}</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={isSubmitting} />
        <p className="form-hint">{t('auth.passwordHint')}</p>
        <label htmlFor="new-password-confirmation">{t('auth.confirmPassword')}</label>
        <input id="new-password-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={isSubmitting} />
        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        <button className="button button-primary submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t('auth.saving') : t('auth.savePassword')}</button>
      </form>}
    <Link className="back-link" to={linkError || !session ? '/forgot-password' : '/mypage'}>{linkError || !session ? t('auth.requestNewLink') : t('auth.goToMyPage')}</Link>
  </section></main>
}
