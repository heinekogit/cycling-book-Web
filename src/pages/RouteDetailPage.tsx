import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { ElevationPanel } from '../features/elevation/ElevationPanel'
import { useLocale } from '../features/i18n/LocaleProvider'
import { RouteMap } from '../features/maps/RouteMap'
import { RoutePhotos } from '../features/photos/RoutePhotos'
import { getPublicProfile, type PublicProfile } from '../features/profile/api'
import { getRoute, getRoutePhotos, getSourceRunGeometry, updateRouteVisibility, type RouteDetail, type RoutePhoto } from '../features/routes/api'
import { extractRoutePoints, totalDistanceMeters, type TrackPoint } from '../features/routes/geometry'

export function RouteDetailPage() {
  const { routeId } = useParams()
  const { session, isLoading: isAuthLoading } = useAuth()
  const { formatDate, formatNumber, t } = useLocale()
  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  const [ownerProfile, setOwnerProfile] = useState<PublicProfile | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [ownerAccountId, setOwnerAccountId] = useState<string | number | null>(null)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [visibilityMessage, setVisibilityMessage] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading')

  useEffect(() => {
    if (!routeId || isAuthLoading) return
    let isMounted = true
    void getRoute(routeId).then(async (data) => {
      if (!data || !isMounted) {
        if (isMounted) setStatus('missing')
        return
      }
      if (!data.is_public) {
        const accountId = session?.user.id ? await getAccountId(session.user.id) : null
        if (String(accountId) !== String(data.account_id)) {
          if (isMounted) setStatus('missing')
          return
        }
      }
      if (session?.user.id) {
        const accountId = await getAccountId(session.user.id)
        if (isMounted) {
          const isOwner = String(accountId) === String(data.account_id)
          setCanEdit(isOwner)
          setOwnerAccountId(isOwner ? accountId : null)
        }
      }
      let routePoints = extractRoutePoints(data)
      if (routePoints.length < 2 && data.source_run_id) {
        try {
          const sourceRun = await getSourceRunGeometry(data.source_run_id)
          if (sourceRun) routePoints = extractRoutePoints(sourceRun)
        } catch (error) {
          console.warn('元実走ログの軌跡を取得できませんでした', error)
        }
      }
      try {
        const [routePhotos, profile] = await Promise.all([
          getRoutePhotos(data.id),
          data.account_id == null ? Promise.resolve(null) : getPublicProfile(String(data.account_id)),
        ])
        if (isMounted) { setPhotos(routePhotos); setOwnerProfile(profile) }
      } catch (error) {
        console.warn('ルートの関連情報を取得できませんでした', error)
      }
      if (!isMounted) return
      setRoute(data)
      setPoints(routePoints)
      setStatus('ready')
    }).catch((error) => {
      console.error('ルート詳細の取得に失敗しました', error)
      if (isMounted) setStatus('error')
    })
    return () => { isMounted = false }
  }, [isAuthLoading, routeId, session?.user.id])

  const distance = useMemo(() => {
    if (route?.distance_m != null && Number.isFinite(Number(route.distance_m))) return Number(route.distance_m)
    return points.length >= 2 ? totalDistanceMeters(points) : null
  }, [points, route?.distance_m])
  const displayStatus = routeId ? status : 'missing'

  const changeVisibility = async () => {
    if (!route || ownerAccountId == null) return
    const nextVisibility = !route.is_public
    const confirmed = window.confirm(nextVisibility
      ? t('route.publishConfirm')
      : t('route.unpublishConfirm'))
    if (!confirmed) return
    setIsUpdatingVisibility(true)
    setVisibilityMessage(nextVisibility ? t('route.publishing') : t('route.unpublishing'))
    try {
      const updated = await updateRouteVisibility(route.id, ownerAccountId, nextVisibility)
      setRoute((current) => current ? { ...current, is_public: updated.is_public } : current)
      setVisibilityMessage(updated.is_public ? t('route.published') : t('route.unpublished'))
    } catch (error) {
      console.error('公開設定を更新できませんでした', error)
      setVisibilityMessage(t('route.updateError'))
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  const routeType = route && (route.origin === 'drawn' || route.route_type === 'planned' || route.route_type === 'manual' || (route.route_type === 'from_run' && route.origin === 'manual'))
    ? t('route.typeDrawn')
    : route && (route.route_type === 'from_run' || route.source_run_id)
      ? t('route.typeFromRun')
      : route?.route_type || t('route.notSet')

  return <main className="detail-page detail-page-wide">
    <Link className="back-link" to="/">{t('route.back')}</Link>
    {displayStatus === 'loading' && <div className="detail-card">{t('route.loading')}</div>}
    {displayStatus === 'error' && <div className="state-panel state-error">{t('route.loadError')}</div>}
    {displayStatus === 'missing' && <div className="state-panel">{t('route.missing')}</div>}
    {displayStatus === 'ready' && route && <article className="route-detail-layout">
      <header className="route-detail-heading">
        <div><p className="eyebrow">PUBLIC ROUTE</p><h1>{route.name || t('explore.untitled')}</h1>{route.description && <p className="route-description">{route.description}</p>}</div>
        <div className="route-heading-actions"><span className={`visibility-badge${route.is_public ? '' : ' visibility-private'}`}>{route.is_public ? t('route.public') : t('route.private')}</span>{canEdit && <><button className={`visibility-toggle${route.is_public ? ' is-public' : ''}`} type="button" disabled={isUpdatingVisibility} onClick={() => void changeVisibility()}>{isUpdatingVisibility ? t('route.updating') : route.is_public ? t('route.unpublish') : t('route.publish')}</button><Link className="button button-quiet" to={`/routes/${route.id}/edit`}>{t('route.edit')}</Link></>}</div>
      </header>

      {visibilityMessage && <div className="visibility-message" role="status">{visibilityMessage}</div>}

      {route.account_id != null && <Link className="route-owner" to={`/riders/${route.account_id}`}>
        <span className="route-owner-avatar" aria-hidden="true">{ownerProfile?.profile_image ? <img src={ownerProfile.profile_image} alt="" /> : (ownerProfile?.display_name?.trim() || 'C').slice(0, 1).toUpperCase()}</span>
        <span><small>{t('route.ownerLabel')}</small><strong>{ownerProfile?.display_name?.trim() || t('route.defaultRider')}</strong></span>
        <b aria-hidden="true">{t('route.viewProfile')}</b>
      </Link>}

      <RouteMap points={points} photos={photos} />

      <dl className="detail-facts detail-facts-four">
        <div><dt>{t('route.distance')}</dt><dd>{distance == null ? t('route.notSet') : `${formatNumber(distance / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`}</dd></div>
        <div><dt>{t('route.type')}</dt><dd>{routeType}</dd></div>
        <div><dt>{t('route.createdAt')}</dt><dd>{route.created_at ? formatDate(route.created_at, { dateStyle: 'long', timeStyle: 'short' }) : t('route.dateNotSet')}</dd></div>
        <div><dt>{t('route.id')}</dt><dd>#{route.id}</dd></div>
      </dl>

      {route.source_run_id && <div className="source-note"><span>{t('route.fromRun')}</span><strong>{t('route.sourceRun', { id: route.source_run_id })}</strong></div>}
      <ElevationPanel points={points} />
      <RoutePhotos photos={photos} />
    </article>}
  </main>
}
