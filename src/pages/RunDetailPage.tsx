import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { ElevationPanel } from '../features/elevation/ElevationPanel'
import { RouteMap } from '../features/maps/RouteMap'
import { RoutePhotos } from '../features/photos/RoutePhotos'
import { getRoutePhotos, type RoutePhoto } from '../features/routes/api'
import { extractRoutePoints, totalDistanceMeters, type TrackPoint } from '../features/routes/geometry'
import { deleteRun, getRouteForRun, getRun, type RunDetail } from '../features/runs/api'

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeStyle: 'medium' }).format(new Date(value))
  : '未設定'

const durationFromDates = (startedAt: string | null, endedAt: string | null) => {
  if (!startedAt || !endedAt) return null
  const duration = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

const formatDuration = (seconds: number | null) => {
  if (seconds == null) return '未設定'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = Math.round(seconds % 60)
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}

export function RunDetailPage() {
  const { runId } = useParams()
  const { session, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  const [relatedRoute, setRelatedRoute] = useState<{ id: string | number; name: string | null } | null>(null)
  const [accountId, setAccountId] = useState<string | number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!runId || isAuthLoading) return
    let isMounted = true
    void (async () => {
      if (!session?.user.id) { setStatus('missing'); return }
      const currentAccountId = await getAccountId(session.user.id)
      const data = await getRun(runId)
      if (!data || String(data.account_id) !== String(currentAccountId)) { if (isMounted) setStatus('missing'); return }
      const runPoints = extractRoutePoints(data)
      let route: { id: string | number; name: string | null } | null = null
      let routePhotos: RoutePhoto[] = []
      if (currentAccountId != null) {
        try {
          route = await getRouteForRun(data.id, currentAccountId)
          if (route) routePhotos = await getRoutePhotos(route.id)
        } catch (error) { console.warn('関連ルートまたは写真を取得できませんでした', error) }
      }
      if (!isMounted) return
      setAccountId(currentAccountId); setRun(data); setPoints(runPoints); setRelatedRoute(route); setPhotos(routePhotos); setStatus('ready')
    })().catch((error) => { console.error('実走ログを読み込めませんでした', error); if (isMounted) setStatus('error') })
    return () => { isMounted = false }
  }, [isAuthLoading, runId, session?.user.id])

  const metrics = useMemo(() => {
    const distance = run?.distance_m != null ? Number(run.distance_m) : points.length >= 2 ? totalDistanceMeters(points) : null
    const duration = run?.duration_s != null ? Number(run.duration_s) : durationFromDates(run?.started_at ?? null, run?.ended_at ?? null)
    const averageSpeed = run?.avg_speed_kmh != null ? Number(run.avg_speed_kmh) : distance != null && duration ? distance / duration * 3.6 : null
    return { distance, duration, averageSpeed }
  }, [points, run])

  const handleDelete = async () => {
    if (!run || accountId == null || !window.confirm('この実走ログを削除しますか？')) return
    setIsDeleting(true)
    try { await deleteRun(run.id, accountId); navigate('/mypage?tab=runs', { replace: true }) }
    catch (error) { console.error('実走ログを削除できませんでした', error); setIsDeleting(false); window.alert('実走ログを削除できませんでした。') }
  }

  const displayStatus = runId ? status : 'missing'
  return <main className="detail-page detail-page-wide">
    <Link className="back-link" to="/mypage?tab=runs">← 実走ログ一覧へ戻る</Link>
    {displayStatus === 'loading' && <div className="detail-card">実走ログを読み込んでいます…</div>}
    {displayStatus === 'error' && <div className="state-panel state-error">実走ログを読み込めませんでした。</div>}
    {displayStatus === 'missing' && <div className="state-panel">実走ログが見つからないか、閲覧権限がありません。</div>}
    {displayStatus === 'ready' && run && <article className="route-detail-layout run-detail-layout">
      <header className="route-detail-heading">
        <div><p className="eyebrow">RIDE LOG</p><h1>{run.name || '実走ログ'}</h1><p className="route-description">{formatDate(run.started_at)} から {formatDate(run.ended_at)}</p></div>
        <button className="detail-delete-button" type="button" disabled={isDeleting} onClick={() => void handleDelete()}>{isDeleting ? '削除中…' : '削除'}</button>
      </header>
      <RouteMap points={points} photos={photos} trackColor="#10b981" emptyLabel="この実走ログには表示できる軌跡がありません。" />
      <dl className="detail-facts detail-facts-four run-facts">
        <div><dt>走行距離</dt><dd>{metrics.distance == null ? '未設定' : `${(metrics.distance / 1000).toFixed(2)} km`}</dd></div>
        <div><dt>走行時間</dt><dd>{formatDuration(metrics.duration)}</dd></div>
        <div><dt>平均速度</dt><dd>{metrics.averageSpeed == null ? '未設定' : `${metrics.averageSpeed.toFixed(1)} km/h`}</dd></div>
        <div><dt>ログID</dt><dd>#{run.id}</dd></div>
      </dl>
      {relatedRoute && <div className="source-note"><span>この実走ログから作成されたマイルート</span><Link to={`/routes/${relatedRoute.id}`}>{relatedRoute.name || `ルート #${relatedRoute.id}`} →</Link></div>}
      <ElevationPanel points={points} />
      <RoutePhotos photos={photos} />
    </article>}
  </main>
}
