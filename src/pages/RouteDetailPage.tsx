import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { saveRouteElevationProfile } from '../features/elevation/api'
import { ElevationPanel } from '../features/elevation/ElevationPanel'
import type { ElevationProfile, ElevationSource } from '../features/elevation/elevation'
import { useLocale } from '../features/i18n/LocaleProvider'
import { RouteMap } from '../features/maps/RouteMap'
import { RoutePhotos } from '../features/photos/RoutePhotos'
import { getProfile, getPublicProfile, type PublicProfile } from '../features/profile/api'
import { getPrivateRouteGeometry, getRoute, getRoutePhotos, getSourceRunGeometry, updateRouteVisibility, type RouteDetail, type RoutePhoto } from '../features/routes/api'
import { getRouteMarkers, type RouteMarker } from '../features/routes/markers'
import { distanceMeters, extractRoutePoints, filterTrackOutsidePrivacyZone, minimumDistanceToTrackMeters, segmentsToGeoJson, totalDistanceMeters, type TrackPoint } from '../features/routes/geometry'
import { getLegacyRouteForRun } from '../features/runs/api'
import { RouteShareActions } from '../features/sharing/RouteShareActions'
import { applyRouteMetadata, resetRouteMetadata } from '../features/sharing/routeMetadata'

export function RouteDetailPage() {
  const { routeId } = useParams()
  const { session, isLoading: isAuthLoading } = useAuth()
  const { formatDate, formatNumber, t } = useLocale()
  const [route, setRoute] = useState<RouteDetail | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [publicPoints, setPublicPoints] = useState<TrackPoint[]>([])
  const [publicDistance, setPublicDistance] = useState<number | null>(null)
  const [showPublicVersion, setShowPublicVersion] = useState(false)
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  const [markers, setMarkers] = useState<RouteMarker[]>([])
  const [photoRouteId, setPhotoRouteId] = useState<string | number | null>(null)
  const [ownerProfile, setOwnerProfile] = useState<PublicProfile | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [ownerAccountId, setOwnerAccountId] = useState<string | number | null>(null)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [visibilityMessage, setVisibilityMessage] = useState('')
  const [privacyCheck, setPrivacyCheck] = useState<{ status: 'ready' | 'missing'; filterEnabled: boolean; home?: TrackPoint; minimumDistance?: number } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading')
  const [activeDistanceM, setActiveDistanceM] = useState<number | null>(null)

  const errorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object') {
      const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
      return [value.message, value.details, value.hint, value.code].filter((part) => typeof part === 'string' && part).join(' / ')
    }
    return ''
  }

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
      let isOwner = false
      if (session?.user.id) {
        const accountId = await getAccountId(session.user.id)
        if (isMounted) {
          isOwner = String(accountId) === String(data.account_id)
          setCanEdit(isOwner)
          setOwnerAccountId(isOwner ? accountId : null)
        }
      }
      const loadedPublicPoints = extractRoutePoints(data)
      const privateGeometry = isOwner && data.is_public ? await getPrivateRouteGeometry(data.id) : null
      const displayedRoute = privateGeometry ? { ...data, distance_m: privateGeometry.distance_m } : data
      let routePoints = privateGeometry ? extractRoutePoints(privateGeometry) : loadedPublicPoints
      if (routePoints.length < 2 && data.source_run_id) {
        try {
          const sourceRun = await getSourceRunGeometry(data.source_run_id)
          if (sourceRun) routePoints = extractRoutePoints(sourceRun)
        } catch (error) {
          console.warn('元実走ログの軌跡を取得できませんでした', error)
        }
      }
      try {
        const [photosResult, profileResult, markersResult] = await Promise.allSettled([
          getRoutePhotos(data.id),
          data.account_id == null ? Promise.resolve(null) : getPublicProfile(String(data.account_id)),
          getRouteMarkers(data.id),
        ])
        if (photosResult.status === 'rejected') console.warn('ルート写真を取得できませんでした', photosResult.reason)
        if (markersResult.status === 'rejected') console.warn('マーカーを取得できませんでした', markersResult.reason)
        const initialRoutePhotos = photosResult.status === 'fulfilled' ? photosResult.value : []
        const profile = profileResult.status === 'fulfilled' ? profileResult.value : null
        const routeMarkers = markersResult.status === 'fulfilled' ? markersResult.value : []
        let routePhotos = initialRoutePhotos
        let nextPhotoRouteId: string | number = data.id
        if (routePhotos.length === 0 && data.source_run_id && data.account_id != null) {
          const sourceRun = await getSourceRunGeometry(data.source_run_id)
          const source = sourceRun as ({ started_at?: string | null; created_at?: string | null } | null)
          const legacyRoute = await getLegacyRouteForRun(data.account_id, source?.started_at || source?.created_at || data.created_at)
          if (legacyRoute && String(legacyRoute.id) !== String(data.id)) {
            routePhotos = await getRoutePhotos(legacyRoute.id)
            nextPhotoRouteId = legacyRoute.id
          }
        }
        if (isMounted) { setPhotos(routePhotos); setPhotoRouteId(nextPhotoRouteId); setOwnerProfile(profile); setMarkers(routeMarkers) }
      } catch (error) {
        console.warn('ルートの関連情報を取得できませんでした', error)
      }
      if (!isMounted) return
      setRoute(displayedRoute)
      setPoints(routePoints)
      setPublicPoints(loadedPublicPoints)
      setPublicDistance(data.distance_m == null ? null : Number(data.distance_m))
      setShowPublicVersion(false)
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
  const isShowingPublicVersion = Boolean(canEdit && route?.is_public && showPublicVersion)
  const visiblePoints = isShowingPublicVersion ? publicPoints : points
  const visibleMarkers = isShowingPublicVersion ? markers.filter((marker) => !marker.isPrivacyHidden) : markers
  const visiblePhotos = isShowingPublicVersion ? photos.filter((photo) => !photo.is_privacy_hidden) : photos
  const visibleDistance = isShowingPublicVersion ? publicDistance : distance
  const privacySegments = useMemo(() => privacyCheck?.status === 'ready' && privacyCheck.filterEnabled && privacyCheck.home
    ? filterTrackOutsidePrivacyZone(points, privacyCheck.home, 500)
    : points.length >= 2 ? [points] : [], [points, privacyCheck])
  const privacyPreviewPoints = useMemo(() => privacySegments.flatMap((segment, segmentIndex) => segment.map((point, pointIndex) => ({ ...point, ...(segmentIndex > 0 && pointIndex === 0 ? { segmentStart: true } : {}) }))), [privacySegments])

  useEffect(() => {
    if (!route) return
    const routeTitle = route.name || t('explore.untitled')
    const distanceText = distance == null ? '' : `${formatNumber(distance / 1000, { maximumFractionDigits: 1 })} km`
    const description = route.description?.trim() || t('share.defaultDescription', { title: routeTitle, distance: distanceText })
    const shareablePhoto = route.is_public ? photos.find((photo) => !photo.is_privacy_hidden) : undefined
    const image = shareablePhoto?.image_url || shareablePhoto?.thumb_url
    applyRouteMetadata({ title: routeTitle, description, image, isPublic: Boolean(route.is_public) })
    return resetRouteMetadata
  }, [distance, formatNumber, photos, route, t])

  const changeVisibility = async () => {
    if (!route || ownerAccountId == null) return
    const nextVisibility = !route.is_public
    if (nextVisibility) {
      if (!session?.user.id) return
      try {
        const profile = await getProfile(session.user.id)
        const lat = Number(profile?.home_lat); const lng = Number(profile?.home_lng)
        if (profile?.home_lat == null || profile.home_lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          setPrivacyCheck({ status: 'missing', filterEnabled: false })
          return
        }
        const home = { lat, lng }
        const minimumDistance = minimumDistanceToTrackMeters(home, points)
        setPrivacyCheck({ status: 'ready', filterEnabled: true, home, minimumDistance })
      } catch (error) {
        console.error('プライバシーゾーンを確認できませんでした', error)
        setVisibilityMessage(t('route.updateError'))
      }
      return
    }
    if (!window.confirm(t('route.unpublishConfirm'))) return
    await applyVisibility(false)
  }

  const applyVisibility = async (nextVisibility: boolean) => {
    if (!route || ownerAccountId == null) return
    setIsUpdatingVisibility(true)
    setVisibilityMessage(nextVisibility ? t('route.publishing') : t('route.unpublishing'))
    try {
      const hiddenPhotoIds = nextVisibility && privacyCheck?.status === 'ready' && privacyCheck.filterEnabled && privacyCheck.home
        ? photos.filter((photo) => photo.lat != null && photo.lng != null && distanceMeters(privacyCheck.home as TrackPoint, { lat: Number(photo.lat), lng: Number(photo.lng) }) <= 500).map((photo) => String(photo.id))
        : []
      const hiddenMarkerIds = nextVisibility && privacyCheck?.status === 'ready' && privacyCheck.filterEnabled && privacyCheck.home
        ? markers.filter((marker) => distanceMeters(privacyCheck.home as TrackPoint, marker) <= 500).map((marker) => marker.id)
        : []
      const updated = await updateRouteVisibility(route.id, ownerAccountId, nextVisibility, nextVisibility ? {
        publicGeoJson: segmentsToGeoJson(privacySegments),
        publicDistanceM: privacySegments.reduce((sum, segment) => sum + totalDistanceMeters(segment), 0),
        filterEnabled: Boolean(privacyCheck?.status === 'ready' && privacyCheck.filterEnabled),
        radiusM: 500,
        hiddenPhotoIds,
        hiddenMarkerIds,
      } : undefined)
      setRoute((current) => current ? { ...current, is_public: updated.is_public } : current)
      if (updated.is_public) {
        setPublicPoints(privacyPreviewPoints)
        setPublicDistance(privacySegments.reduce((sum, segment) => sum + totalDistanceMeters(segment), 0))
        const hiddenIds = new Set(hiddenPhotoIds)
        setPhotos((current) => current.map((photo) => ({ ...photo, is_privacy_hidden: hiddenIds.has(String(photo.id)) })))
        const hiddenMarkerSet = new Set(hiddenMarkerIds)
        setMarkers((current) => current.map((marker) => ({ ...marker, isPrivacyHidden: hiddenMarkerSet.has(marker.id) })))
        setShowPublicVersion(true)
      } else {
        setPhotos((current) => current.map((photo) => ({ ...photo, is_privacy_hidden: false })))
        setMarkers((current) => current.map((marker) => ({ ...marker, isPrivacyHidden: false })))
        setShowPublicVersion(false)
      }
      setVisibilityMessage(updated.is_public ? t('route.published') : t('route.unpublished'))
      setPrivacyCheck(null)
    } catch (error) {
      console.error('公開設定を更新できませんでした', error)
      const detail = errorMessage(error)
      setVisibilityMessage(detail.includes('free_public_route_limit_reached')
        ? t('route.publicLimitReached')
        : detail ? `${t('route.updateError')}（${detail}）` : t('route.updateError'))
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  const saveElevation = useCallback(async (profile: ElevationProfile, source: ElevationSource) => {
    if (!route?.id || ownerAccountId == null) return
    await saveRouteElevationProfile(route.id, ownerAccountId, profile, source)
  }, [ownerAccountId, route])

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
        <div><p className="eyebrow">{route.is_public ? 'PUBLIC ROUTE' : 'PRIVATE ROUTE'}</p><h1>{route.name || t('explore.untitled')}</h1>{route.description && <p className="route-description">{route.description}</p>}</div>
        <div className="route-heading-actions"><span className={`visibility-badge${route.is_public ? '' : ' visibility-private'}`}>{route.is_public ? t('route.public') : t('route.private')}</span>{canEdit ? <><button className={`visibility-toggle${route.is_public ? ' is-public' : ''}`} type="button" disabled={isUpdatingVisibility} onClick={() => void changeVisibility()}>{isUpdatingVisibility ? t('route.updating') : route.is_public ? t('route.unpublish') : t('route.publish')}</button>{route.is_public && <button className="button button-quiet" type="button" onClick={() => setShowPublicVersion((current) => !current)}>{isShowingPublicVersion ? t('route.showPrivateVersion') : t('route.showPublicVersion')}</button>}<Link className="button button-quiet" to={`/routes/new?duplicateFrom=${encodeURIComponent(String(route.id))}`}>{t('route.duplicate')}</Link><Link className="button button-quiet" to={`/routes/${route.id}/edit`}>{t('route.edit')}</Link></> : route.is_public && <Link className="button button-primary" to={`/routes/new?duplicateFrom=${encodeURIComponent(String(route.id))}`}>{t('route.addToMyRoutes')}</Link>}</div>
      </header>

      {visibilityMessage && <div className="visibility-message" role="status">{visibilityMessage}</div>}
      {canEdit && route.is_public && <div className="visibility-message" role="status">{isShowingPublicVersion ? t('route.publicVersionNotice') : t('route.privateVersionNotice')}</div>}

      {privacyCheck && <div className="privacy-check-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrivacyCheck(null) }}>
        <section className="privacy-check-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-check-title">
          <div className="privacy-check-heading"><div><p className="eyebrow">PRIVACY ZONE</p><h2 id="privacy-check-title">{t('route.privacyTitle')}</h2></div><button type="button" aria-label={t('route.privacyCancel')} onClick={() => setPrivacyCheck(null)}>×</button></div>
          <p className={`privacy-check-result privacy-check-${privacyCheck.status}`}>{privacyCheck.status === 'ready' ? '公開されるルートを確認してください。' : t('route.privacyMissing')}</p>
          {privacyCheck.home && <><label className="privacy-filter-toggle"><input type="checkbox" checked={privacyCheck.filterEnabled} onChange={(event) => setPrivacyCheck((current) => current ? { ...current, filterEnabled: event.target.checked } : current)} /><span>ホーム地点から500m以内を公開ルートから除外する</span></label><RouteMap points={privacyPreviewPoints} privacyZone={{ center: privacyCheck.home, radius: 500 }} splitOnGaps /><p className="privacy-check-distance">ホーム地点と元ルートの最短距離：約{Math.max(0, Math.round(privacyCheck.minimumDistance ?? 0))}m</p><p className="privacy-check-note">{privacyCheck.filterEnabled ? '赤い円内の区間と写真は公開されません。元のマイルートは変更されません。' : 'フィルターがオフです。ホーム地点付近を含む元の軌跡がそのまま公開されます。'} {t('route.privacyNote')}</p>{privacyCheck.filterEnabled && privacySegments.length === 0 && <p className="privacy-check-result privacy-check-blocked">500m圏外に公開できる区間がありません。</p>}</>}
          <div className="privacy-check-actions">
            <button className="button button-quiet" type="button" onClick={() => setPrivacyCheck(null)}>{t('route.privacyCancel')}</button>
            {privacyCheck.status === 'missing' && <Link className="button button-primary" to="/profile">{t('route.privacyProfile')}</Link>}
            {privacyCheck.status === 'ready' && <button className="button button-primary" type="button" disabled={isUpdatingVisibility || privacySegments.length === 0} onClick={() => void applyVisibility(true)}>{isUpdatingVisibility ? t('route.updating') : t('route.privacyConfirm')}</button>}
          </div>
        </section>
      </div>}

      {route.account_id != null && <Link className="route-owner" to={`/riders/${route.account_id}`}>
        <span className="route-owner-avatar" aria-hidden="true">{ownerProfile?.profile_image ? <img src={ownerProfile.profile_image} alt="" /> : (ownerProfile?.display_name?.trim() || 'C').slice(0, 1).toUpperCase()}</span>
        <span><small>{t('route.ownerLabel')}</small><strong>{ownerProfile?.display_name?.trim() || t('route.defaultRider')}</strong></span>
        <b aria-hidden="true">{t('route.viewProfile')}</b>
      </Link>}

      <RouteShareActions
        title={route.name || t('explore.untitled')}
        description={route.description?.trim() || t('share.defaultDescription', { title: route.name || t('explore.untitled'), distance: distance == null ? '' : `${formatNumber(distance / 1000, { maximumFractionDigits: 1 })} km` })}
        isPublic={Boolean(route.is_public)}
      />

      <RouteMap points={visiblePoints} photos={visiblePhotos} markers={visibleMarkers} showDirectionArrows activeDistanceM={activeDistanceM} onActiveDistanceChange={setActiveDistanceM} />

      <ElevationPanel points={visiblePoints} record={isShowingPublicVersion ? undefined : route} onProfileResolved={canEdit && !isShowingPublicVersion ? saveElevation : undefined} activeDistanceM={activeDistanceM} onActiveDistanceChange={setActiveDistanceM} />

      <dl className="detail-facts detail-facts-four">
        <div><dt>{t('route.distance')}</dt><dd>{visibleDistance == null ? t('route.notSet') : `${formatNumber(visibleDistance / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`}</dd></div>
        <div><dt>{t('route.type')}</dt><dd>{routeType}</dd></div>
        <div><dt>{t('route.createdAt')}</dt><dd>{route.created_at ? formatDate(route.created_at, { dateStyle: 'long', timeStyle: 'short' }) : t('route.dateNotSet')}</dd></div>
        <div><dt>{t('route.id')}</dt><dd>#{route.id}</dd></div>
      </dl>

      {route.source_run_id && <div className="source-note"><span>{t('route.fromRun')}</span><strong>{t('route.sourceRun', { id: route.source_run_id })}</strong></div>}
      {route.is_public && <div className="source-note"><span>{t('route.copyHistory')}</span><strong>{t('route.copyCount', { count: route.copy_count || 0 })}</strong></div>}
      <RoutePhotos photos={visiblePhotos} routeId={photoRouteId ?? route.id} publicView={isShowingPublicVersion} />
    </article>}
  </main>
}
