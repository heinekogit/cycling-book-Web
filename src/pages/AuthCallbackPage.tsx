import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useLocale } from '../features/i18n/LocaleProvider'
import { supabase } from '../lib/supabase'

const verificationRequests = new Map<string, ReturnType<typeof supabase.auth.verifyOtp>>()

function verifyLink(tokenHash: string, type: 'email' | 'recovery') {
  const key = `${type}:${tokenHash}`
  let request = verificationRequests.get(key)
  if (!request) {
    request = supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    verificationRequests.set(key, request)
  }
  return request
}

export function AuthCallbackPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true
    async function complete() {
      const params = new URLSearchParams(query)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      if (params.has('error') || window.location.hash.includes('error=')) {
        if (active) setErrorMessage(t('auth.linkInvalid'))
        return
      }
      if (tokenHash && (type === 'email' || type === 'signup')) {
        const { error } = await verifyLink(tokenHash, 'email')
        if (error) { if (active) setErrorMessage(t('auth.linkInvalid')); return }
      } else if (tokenHash && type === 'recovery') {
        const { error } = await verifyLink(tokenHash, 'recovery')
        if (error) { if (active) setErrorMessage(t('auth.linkInvalid')); return }
        if (active) navigate('/reset-password', { replace: true })
        return
      }
      const { data } = await supabase.auth.getSession()
      if (active) {
        if (data.session) navigate('/mypage', { replace: true })
        else setErrorMessage(t('auth.linkInvalid'))
      }
    }
    void complete()
    return () => { active = false }
  }, [navigate, query, t])

  return <main className="narrow-page"><section className="form-card">
    <p className="eyebrow">{t('auth.verifyEyebrow')}</p><h1>{t('auth.verifyingTitle')}</h1>
    {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : <p className="form-description">{t('auth.verifyingLink')}</p>}
    {errorMessage && <Link className="back-link" to="/login">{t('auth.backToLogin')}</Link>}
  </section></main>
}
