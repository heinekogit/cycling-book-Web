import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useLocale } from '../features/i18n/LocaleProvider'
import { getRoute, getRoutePhotos, type RouteDetail, type RoutePhoto } from '../features/routes/api'

export function RoutePhotosPage() {
  const { routeId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { formatDate, t } = useLocale()
  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading')

  useEffect(() => {
    if (!routeId) return
    let mounted = true
    void Promise.all([getRoute(routeId), getRoutePhotos(routeId)]).then(([nextRoute, nextPhotos]) => {
      if (!mounted) return
      if (!nextRoute) { setStatus('missing'); return }
      setRoute(nextRoute); setPhotos(nextPhotos); setStatus('ready')
    }).catch((error) => { console.error('写真一覧を読み込めませんでした', error); if (mounted) setStatus('error') })
    return () => { mounted = false }
  }, [routeId])

  const selected = useMemo(() => {
    const selectedId = searchParams.get('photo')
    return photos.find((photo) => String(photo.id) === selectedId) || photos[0] || null
  }, [photos, searchParams])
  const formatTakenAt = (value: string | null) => value ? formatDate(value, { dateStyle: 'long', timeStyle: 'short' }) : t('photos.unknownDate')
  const displayStatus = routeId ? status : 'missing'

  return <main className="photo-viewer-page">
    <button className="back-link photo-back" type="button" onClick={() => navigate(-1)}>{t('photos.back')}</button>
    {displayStatus === 'loading' && <div className="state-panel">{t('photos.loading')}</div>}
    {displayStatus === 'error' && <div className="state-panel state-error">{t('photos.loadError')}</div>}
    {displayStatus === 'missing' && <div className="state-panel">{t('photos.missing')}</div>}
    {displayStatus === 'ready' && route && <section className="photo-viewer-shell">
      <header className="photo-viewer-heading"><div><p className="eyebrow">ROUTE PHOTOS</p><h1>{route.name || t('explore.untitled')}</h1></div><span>{t('photos.count', { count: photos.length })}</span></header>
      {selected ? <>
        <figure className="photo-viewer-main"><img src={selected.image_url} alt={t('photos.alt', { date: formatTakenAt(selected.taken_at) })} /><figcaption>{formatTakenAt(selected.taken_at)}</figcaption></figure>
        <div className="photo-viewer-thumbs" aria-label={t('photos.select')}>
          {photos.map((photo) => <button type="button" className={String(photo.id) === String(selected.id) ? 'active' : ''} onClick={() => setSearchParams({ photo: String(photo.id) }, { replace: true })} key={photo.id}><img src={photo.thumb_url || photo.image_url} alt={formatTakenAt(photo.taken_at)} /></button>)}
        </div>
      </> : <div className="panel-muted">{t('photos.empty')}</div>}
      <Link className="button button-quiet photo-route-link" to={`/routes/${route.id}`}>{t('photos.backToRoute')}</Link>
    </section>}
  </main>
}
