import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPublicProfile, getPublicProfileRoutes, type PublicProfile, type PublicProfileRoute } from '../features/profile/api'
import { useLocale } from '../features/i18n/LocaleProvider'

export function PublicProfilePage() {
  const { accountId } = useParams()
  const { formatDate, formatNumber, t } = useLocale()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [routes, setRoutes] = useState<PublicProfileRoute[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  useEffect(() => {
    if (!accountId) return
    let isMounted = true
    void Promise.all([getPublicProfile(accountId), getPublicProfileRoutes(accountId)]).then(([nextProfile, nextRoutes]) => {
      if (!isMounted) return
      if (!nextProfile) {
        setStatus('missing')
        return
      }
      setProfile(nextProfile)
      setRoutes(nextRoutes)
      setStatus('ready')
    }).catch((error) => {
      console.error('公開プロフィールを読み込めませんでした', error)
      if (isMounted) setStatus('error')
    })
    return () => { isMounted = false }
  }, [accountId])

  const displayName = profile?.display_name?.trim() || t('profile.defaultRider')
  const initial = displayName.slice(0, 1).toUpperCase()
  const displayStatus = accountId ? status : 'missing'

  return <main className="public-profile-page">
    <Link className="back-link public-profile-back" to="/">{t('profile.back')}</Link>
    {displayStatus === 'loading' && <div className="state-panel">{t('profile.loading')}</div>}
    {displayStatus === 'error' && <div className="state-panel state-error">{t('profile.loadError')}</div>}
    {displayStatus === 'missing' && <div className="state-panel"><h1>{t('profile.missingTitle')}</h1><p>{t('profile.missingDescription')}</p></div>}
    {displayStatus === 'ready' && profile && <>
      <section className="public-profile-hero">
        <div className="public-profile-avatar" aria-hidden="true">
          {profile.profile_image ? <img src={profile.profile_image} alt="" /> : <span>{initial}</span>}
        </div>
        <div className="public-profile-copy"><p className="eyebrow">CYCLING BOOK RIDER</p><h1>{displayName}</h1><p>{t('profile.description')}</p></div>
        <div className="public-profile-stat"><strong>{formatNumber(routes.length)}</strong><span>{t('profile.publicRoutes')}</span></div>
      </section>

      <section className="content-section" aria-labelledby="rider-routes-title">
        <div className="section-heading"><div><p className="eyebrow">PUBLIC ROUTES</p><h2 id="rider-routes-title">{t('profile.routesBy', { name: displayName })}</h2></div><p>{t('profile.publishedCount', { count: formatNumber(routes.length) })}</p></div>
        {routes.length === 0 ? <div className="state-panel">{t('profile.empty')}</div> : <div className="route-grid">
          {routes.map((route, index) => <Link className="route-card" to={`/routes/${route.id}`} key={route.id}>
            <div className="route-card-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="route-card-body"><h3>{route.name || t('explore.untitled')}</h3><div className="route-meta"><span>{route.created_at ? formatDate(route.created_at) : t('route.dateNotSet')}</span><span>{route.distance_m == null ? t('profile.distanceNotSet') : `${formatNumber(Number(route.distance_m) / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`}</span></div></div>
            <span className="route-card-arrow" aria-hidden="true">→</span>
          </Link>)}
        </div>}
      </section>
    </>}
  </main>
}
