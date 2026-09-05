import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'
import { getPublicRoutes, type ExploreRoute } from '../features/routes/api'

export function ExplorePage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const { formatDate, t } = useLocale()
  const [routes, setRoutes] = useState<ExploreRoute[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isMounted = true
    void getPublicRoutes().then((result) => {
      if (!isMounted) return
      setRoutes(result.routes)
      setPhotoCounts(result.photoCounts)
      setStatus('ready')
    }).catch((error) => {
      console.error('公開ルートの取得に失敗しました', error)
      if (isMounted) setStatus('error')
    })
    return () => { isMounted = false }
  }, [reloadKey])

  const retry = () => {
    setStatus('loading')
    setReloadKey((value) => value + 1)
  }

  return <main>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{t('explore.eyebrow')}</p>
        <h1>{t('explore.title')}</h1>
        <p className="hero-description">{t('explore.description')}</p>
      </div>
      <div className="hero-stat"><strong>{status === 'ready' ? routes.length : '—'}</strong><span>{t('explore.newRoutes')}</span></div>
    </section>

    <section className="auth-strip" aria-live="polite">
      {isAuthLoading ? <span>{t('explore.checkingLogin')}</span> : session ? <>
        <span><strong>{t('explore.loggedInAs', { email: session.user.email || '' })}</strong></span><Link to="/mypage">{t('explore.viewRecords')}</Link>
      </> : <><span>{t('explore.loginBenefit')}</span><Link to="/login?returnTo=/">{t('explore.loginLink')}</Link></>}
    </section>

    <section className="content-section" aria-labelledby="latest-routes-title">
      <div className="section-heading"><div><p className="eyebrow">{t('explore.latestEyebrow')}</p><h2 id="latest-routes-title">{t('explore.publicRoutes')}</h2></div><p>{t('explore.latestTen')}</p></div>
      {status === 'loading' && <RouteListSkeleton label={t('explore.loading')} />}
      {status === 'error' && <div className="state-panel state-error" role="alert"><p>{t('explore.loadError')}</p><button className="button button-primary" type="button" onClick={retry}>{t('explore.retry')}</button></div>}
      {status === 'ready' && routes.length === 0 && <div className="state-panel"><p>{t('explore.empty')}</p></div>}
      {status === 'ready' && routes.length > 0 && <div className="route-grid">
        {routes.map((route, index) => <Link className="route-card" to={`/routes/${route.id}`} key={route.id}>
          <div className="route-card-number">{String(index + 1).padStart(2, '0')}</div>
          <div className="route-card-body"><h3>{route.name || t('explore.untitled')}</h3><div className="route-meta"><span>{route.created_at ? formatDate(route.created_at) : '—'}</span><span>{photoCounts[String(route.id)] ? t('explore.photos', { count: photoCounts[String(route.id)] }) : t('explore.noPhotos')}</span></div></div>
          <span className="route-card-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>}
    </section>
  </main>
}

function RouteListSkeleton({ label }: { label: string }) {
  return <div className="route-grid" aria-label={label}>{[0, 1, 2].map((item) => <div className="route-card route-card-loading" key={item}><span /><div><span /><span /></div></div>)}</div>
}
