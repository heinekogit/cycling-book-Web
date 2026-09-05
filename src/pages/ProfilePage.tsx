import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'
import { HomeLocationMap, type HomeLocation } from '../features/maps/HomeLocationMap'
import { getProfile, updateProfile } from '../features/profile/api'

export function ProfilePage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const { t } = useLocale()
  const [displayName, setDisplayName] = useState('')
  const [homeName, setHomeName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)

  useEffect(() => {
    if (isAuthLoading || !session?.user.id) return
    let isMounted = true
    void getProfile(session.user.id).then((profile) => {
      if (!isMounted) return
      setDisplayName(profile?.display_name || '')
      setHomeName(profile?.home_name || '')
      setLatitude(profile?.home_lat == null ? '' : Number(profile.home_lat).toFixed(6))
      setLongitude(profile?.home_lng == null ? '' : Number(profile.home_lng).toFixed(6))
      setStatus('ready')
    }).catch((error) => { console.error('プロフィールを読み込めませんでした', error); if (isMounted) { setStatus('error'); setMessage(t('profileSettings.loadError')) } })
    return () => { isMounted = false }
  }, [isAuthLoading, session?.user.id, t])

  const location = useMemo<HomeLocation | null>(() => {
    const lat = Number(latitude); const lng = Number(longitude)
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null
  }, [latitude, longitude])

  const changeLocation = useCallback((next: HomeLocation) => {
    setLatitude(next.lat.toFixed(6)); setLongitude(next.lng.toFixed(6)); setMessage('')
  }, [])

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setMessage(t('profileSettings.locationUnsupported')); return }
    setIsLocating(true); setMessage(t('profileSettings.locationLoading'))
    navigator.geolocation.getCurrentPosition((position) => {
      setIsLocating(false); changeLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      setMessage(t('profileSettings.locationReady'))
    }, (error) => {
      setIsLocating(false)
      setMessage(error.code === error.PERMISSION_DENIED ? t('profileSettings.locationDenied') : t('profileSettings.locationError'))
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!session?.user.id) return
    const hasLatitude = latitude.trim() !== ''; const hasLongitude = longitude.trim() !== ''
    if (hasLatitude !== hasLongitude) { setMessage(t('profileSettings.coordinatePair')); return }
    if ((hasLatitude || hasLongitude) && !location) { setMessage(t('profileSettings.coordinateInvalid')); return }
    setStatus('saving'); setMessage(t('profileSettings.savingMessage'))
    try {
      await updateProfile(session.user.id, {
        display_name: displayName.trim() || null,
        home_name: homeName.trim() || null,
        home_lat: location?.lat ?? null,
        home_lng: location?.lng ?? null,
      })
      setStatus('ready'); setMessage(t('profileSettings.saved'))
    } catch (error) {
      console.error('プロフィールを保存できませんでした', error)
      setStatus('error'); setMessage(t('profileSettings.saveError'))
    }
  }

  if (isAuthLoading) return <main className="profile-page"><div className="state-panel">{t('profileSettings.loading')}</div></main>
  if (!session) return <main className="profile-page"><section className="state-panel"><p className="eyebrow">MEMBERS ONLY</p><h1>{t('profileSettings.loginRequired')}</h1><Link className="button button-primary" to="/login?returnTo=/profile">{t('profileSettings.loginAction')}</Link></section></main>

  return <main className="profile-page">
    <div className="profile-title"><div><p className="eyebrow">PROFILE & HOME</p><h1>{t('profileSettings.title')}</h1><p>{t('profileSettings.description')}</p></div><Link className="button button-quiet" to="/mypage">{t('profileSettings.back')}</Link></div>
    <form className="profile-form" onSubmit={(event) => void handleSubmit(event)}>
      <section className="profile-card profile-basic"><div className="profile-section-copy"><p className="eyebrow">BASIC</p><h2>{t('profileSettings.basic')}</h2></div><div className="profile-fields">
        <label htmlFor="display-name">{t('profileSettings.displayName')}</label><input id="display-name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t('profileSettings.displayNamePlaceholder')} disabled={status === 'saving'} />
        <p className="field-note">{t('profileSettings.imageLater')}</p>
      </div></section>
      <section className="profile-card"><div className="profile-section-copy"><p className="eyebrow">HOME LOCATION</p><h2>{t('profileSettings.home')}</h2><p>{t('profileSettings.homeDescription')}</p></div><div className="profile-fields">
        <label htmlFor="home-name">{t('profileSettings.homeName')}</label><input id="home-name" maxLength={120} value={homeName} onChange={(event) => setHomeName(event.target.value)} placeholder={t('profileSettings.homePlaceholder')} disabled={status === 'saving'} />
        <HomeLocationMap location={location} onChange={changeLocation} />
        <button className="button button-quiet current-location-button" type="button" onClick={useCurrentLocation} disabled={isLocating || status === 'saving'}>{isLocating ? t('profileSettings.locating') : t('profileSettings.useLocation')}</button>
        <div className="coordinate-grid"><label htmlFor="home-lat">{t('profileSettings.latitude')}<input id="home-lat" type="number" step="0.000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="35.680000" disabled={status === 'saving'} /></label><label htmlFor="home-lng">{t('profileSettings.longitude')}<input id="home-lng" type="number" step="0.000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="139.760000" disabled={status === 'saving'} /></label></div>
      </div></section>
      {message && <div className={`profile-message${status === 'error' ? ' error' : ''}`} role="status">{message}</div>}
      <div className="profile-submit"><button className="button button-primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? t('profileSettings.saving') : t('profileSettings.save')}</button></div>
    </form>
  </main>
}
