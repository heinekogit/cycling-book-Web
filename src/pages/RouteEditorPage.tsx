import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { RouteEditorMap, type EditorTool } from '../features/maps/RouteEditorMap'
import { getProfile } from '../features/profile/api'
import { createRoute, updateRoute } from '../features/routes/editor-api'
import { extractRoutePoints, totalDistanceMeters, type TrackPoint } from '../features/routes/geometry'
import { encodePolyline, getSnappedRoute, type TravelMode } from '../features/routes/routing'
import { getRoute } from '../features/routes/api'

type DrawMode = 'snap' | 'freehand'
type Snapshot = { controlPoints: TrackPoint[]; routeLine: TrackPoint[] }
type Draft = Snapshot & { name: string; drawMode: DrawMode; travelMode: TravelMode; routeId: string | null }
const defaultCenter = { lat: 35.681236, lng: 139.767125 }
const draftKey = (routeId?: string) => `cycling-book.route-draft.${routeId || 'new'}`
const clonePoints = (points: TrackPoint[]) => points.map((point) => ({ ...point }))

function deriveControlPoints(points: TrackPoint[]) {
  if (points.length <= 30) return clonePoints(points)
  const step = Math.ceil(points.length / 30)
  const result = points.filter((_point, index) => index % step === 0)
  if (result.at(-1) !== points.at(-1)) result.push({ ...points[points.length - 1] })
  return result
}

function nearestSegmentIndex(point: TrackPoint, controlPoints: TrackPoint[]) {
  if (controlPoints.length < 2) return -1
  const latitudeScale = 111_320; const longitudeScale = 111_320 * Math.cos(point.lat * Math.PI / 180)
  let bestIndex = -1; let bestDistance = Infinity
  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const first = controlPoints[index]; const second = controlPoints[index + 1]
    const ax = first.lng * longitudeScale; const ay = first.lat * latitudeScale
    const bx = second.lng * longitudeScale; const by = second.lat * latitudeScale
    const px = point.lng * longitudeScale; const py = point.lat * latitudeScale
    const dx = bx - ax; const dy = by - ay
    const ratio = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
    const distance = Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy))
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index }
  }
  return bestDistance <= 500 ? bestIndex : -1
}

export function RouteEditorPage() {
  const { routeId } = useParams()
  const { session, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [controlPoints, setControlPoints] = useState<TrackPoint[]>([])
  const [routeLine, setRouteLine] = useState<TrackPoint[]>([])
  const [center, setCenter] = useState<TrackPoint>(defaultCenter)
  const [tool, setTool] = useState<EditorTool>('add')
  const [drawMode, setDrawMode] = useState<DrawMode>('snap')
  const [travelMode, setTravelMode] = useState<TravelMode>('cycling')
  const [history, setHistory] = useState<Snapshot[]>([{ controlPoints: [], routeLine: [] }])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'routing' | 'saving' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const routingSequence = useRef(0)

  useEffect(() => {
    if (isAuthLoading || !session?.user.id) return
    let isMounted = true
    void (async () => {
      const profile = await getProfile(session.user.id)
      if (!isMounted) return
      if (profile?.home_lat != null && profile.home_lng != null) setCenter({ lat: Number(profile.home_lat), lng: Number(profile.home_lng) })
      let initial: Draft = { name: '', controlPoints: [], routeLine: [], drawMode: 'snap', travelMode: 'cycling', routeId: routeId || null }
      if (routeId) {
        const accountId = await getAccountId(session.user.id); const route = await getRoute(routeId)
        if (!isMounted) return
        if (!route || String(route.account_id) !== String(accountId)) throw new Error('編集できるルートが見つかりません')
        const points = extractRoutePoints(route)
        initial = { ...initial, name: route.name || '', routeLine: points, controlPoints: deriveControlPoints(points) }
      }
      const stored = localStorage.getItem(draftKey(routeId))
      if (stored && window.confirm('保存前の下書きがあります。復元しますか？')) {
        try { const draft = JSON.parse(stored) as Draft; if (draft.routeId === (routeId || null)) initial = draft } catch { localStorage.removeItem(draftKey(routeId)) }
      }
      if (!isMounted) return
      setName(initial.name); setControlPoints(clonePoints(initial.controlPoints)); setRouteLine(clonePoints(initial.routeLine)); setDrawMode(initial.drawMode); setTravelMode(initial.travelMode)
      if (initial.routeLine.length) setCenter(initial.routeLine[0])
      setHistory([{ controlPoints: clonePoints(initial.controlPoints), routeLine: clonePoints(initial.routeLine) }]); setStatus('ready')
    })().catch((error) => { console.error('ルート編集を開始できませんでした', error); if (isMounted) { setStatus('error'); setMessage('ルート編集を開始できませんでした。') } })
    return () => { isMounted = false }
  }, [isAuthLoading, routeId, session?.user.id])

  useEffect(() => {
    if (!dirty || status === 'loading' || status === 'saving') return
    const timeout = window.setTimeout(() => {
      const draft: Draft = { name, controlPoints, routeLine, drawMode, travelMode, routeId: routeId || null }
      localStorage.setItem(draftKey(routeId), JSON.stringify(draft))
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [controlPoints, dirty, drawMode, name, routeId, routeLine, status, travelMode])

  const commit = useCallback((nextControlPoints: TrackPoint[], nextRouteLine: TrackPoint[]) => {
    setControlPoints(nextControlPoints); setRouteLine(nextRouteLine)
    setDirty(true)
    setHistory((items) => [...items.slice(-99), { controlPoints: clonePoints(nextControlPoints), routeLine: clonePoints(nextRouteLine) }]); setFuture([])
  }, [])

  const rebuild = useCallback(async (nextControlPoints: TrackPoint[], nextDrawMode = drawMode, nextTravelMode = travelMode) => {
    const sequence = ++routingSequence.current
    if (nextControlPoints.length < 2) { commit(nextControlPoints, nextControlPoints); return }
    if (nextDrawMode === 'freehand') { commit(nextControlPoints, nextControlPoints); return }
    setStatus('routing'); setMessage('道路に沿うルートを計算しています…')
    try {
      const calculated = await getSnappedRoute(nextControlPoints, nextTravelMode)
      if (sequence === routingSequence.current) { commit(nextControlPoints, calculated); setStatus('ready'); setMessage('') }
    } catch (error) {
      console.warn('道路に沿うルートを計算できませんでした', error)
      if (sequence === routingSequence.current) { commit(nextControlPoints, nextControlPoints); setStatus('ready'); setMessage('道路に沿う計算に失敗したため、ポイントを直線で結びました。') }
    }
  }, [commit, drawMode, travelMode])

  const addPoint = (point: TrackPoint) => { void rebuild([...controlPoints, point]) }
  const movePoint = (index: number, point: TrackPoint) => { const next = clonePoints(controlPoints); next[index] = point; void rebuild(next) }
  const deletePoint = (index: number) => { void rebuild(controlPoints.filter((_point, itemIndex) => itemIndex !== index)) }
  const insertPoint = (point: TrackPoint) => {
    const index = nearestSegmentIndex(point, controlPoints)
    if (index < 0) { setMessage('ルート線の近くをクリックしてください。'); return }
    const next = clonePoints(controlPoints); next.splice(index + 1, 0, point); void rebuild(next)
  }

  const undo = () => {
    if (history.length <= 1) return
    const current = history[history.length - 1]; const previous = history[history.length - 2]
    setHistory((items) => items.slice(0, -1)); setFuture((items) => [...items, current]); setControlPoints(clonePoints(previous.controlPoints)); setRouteLine(clonePoints(previous.routeLine))
    setDirty(true)
  }
  const redo = () => {
    const next = future.at(-1); if (!next) return
    setFuture((items) => items.slice(0, -1)); setHistory((items) => [...items, next]); setControlPoints(clonePoints(next.controlPoints)); setRouteLine(clonePoints(next.routeLine))
    setDirty(true)
  }

  const changeDrawMode = (next: DrawMode) => { setDrawMode(next); setDirty(true); void rebuild(controlPoints, next, travelMode) }
  const changeTravelMode = (next: TravelMode) => { setTravelMode(next); setDirty(true); if (drawMode === 'snap') void rebuild(controlPoints, drawMode, next) }
  const clear = () => { if (controlPoints.length && window.confirm('すべてのポイントを削除しますか？')) commit([], []) }

  const save = async () => {
    if (!session?.user.id || routeLine.length < 2) { setMessage('少なくとも2点以上のポイントが必要です。'); return }
    setStatus('saving'); setMessage('ルートを保存しています…')
    try {
      const accountId = await getAccountId(session.user.id); if (accountId == null) throw new Error('アカウント情報がありません')
      const payload = { name: name.trim() || '新しいルート', accountId, routeLine, polyline: encodePolyline(routeLine) }
      const savedId = routeId ? await updateRoute(routeId, payload) : await createRoute(payload)
      localStorage.removeItem(draftKey(routeId)); navigate(`/routes/${savedId}`, { replace: true })
    } catch (error) {
      console.error('ルートを保存できませんでした', error)
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      setStatus('error'); setMessage(`ルートを保存できませんでした。${detail ? ` ${detail}` : ''}`)
    }
  }

  const distance = useMemo(() => totalDistanceMeters(routeLine), [routeLine])
  if (isAuthLoading) return <main className="route-editor-page"><div className="state-panel">ログイン状態を確認しています…</div></main>
  if (!session) return <main className="route-editor-page"><section className="state-panel"><h1>ログインが必要です</h1><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(routeId ? `/routes/${routeId}/edit` : '/routes/new')}`}>ログインへ</Link></section></main>

  return <main className="route-editor-page">
    <header className="editor-header"><div><p className="eyebrow">ROUTE BUILDER</p><h1>{routeId ? 'マイルートを編集' : 'マイルートを作る'}</h1></div><div className="editor-header-actions"><Link className="button button-quiet" to={routeId ? `/routes/${routeId}` : '/mypage'}>戻る</Link><button className="button button-primary" type="button" onClick={() => void save()} disabled={status === 'saving' || status === 'routing'}>{status === 'saving' ? '保存中…' : routeId ? '更新する' : '保存する'}</button></div></header>
    <section className="editor-name-row"><label htmlFor="route-name">ルート名</label><input id="route-name" maxLength={120} value={name} onChange={(event) => { setName(event.target.value); setDirty(true) }} placeholder="新しいルート" /><div><strong>{(distance / 1000).toFixed(2)} km</strong><span>{controlPoints.length}ポイント</span></div></section>
    <section className="editor-workspace">
      <aside className="editor-toolbar">
        <div className="tool-group"><span>描画方式</span><button className={drawMode === 'snap' ? 'active' : ''} type="button" onClick={() => changeDrawMode('snap')}>道路に沿う</button><button className={drawMode === 'freehand' ? 'active' : ''} type="button" onClick={() => changeDrawMode('freehand')}>直線で描く</button></div>
        <div className="tool-group"><span>移動方法</span><select value={travelMode} onChange={(event) => changeTravelMode(event.target.value as TravelMode)} disabled={drawMode === 'freehand'}><option value="cycling">自転車</option><option value="walking">徒歩</option><option value="driving">自動車</option></select></div>
        <div className="tool-group"><span>操作</span>{([['add','ポイント追加'],['move','ポイント移動'],['insert','中間点追加'],['delete','ポイント削除']] as const).map(([value,label]) => <button className={tool === value ? 'active' : ''} type="button" key={value} onClick={() => setTool(value)}>{label}</button>)}</div>
        <div className="tool-row"><button type="button" onClick={undo} disabled={history.length <= 1}>Undo</button><button type="button" onClick={redo} disabled={!future.length}>Redo</button></div><button className="clear-tool" type="button" onClick={clear} disabled={!controlPoints.length}>全消去</button>
      </aside>
      <div className="editor-map-panel"><RouteEditorMap center={center} controlPoints={controlPoints} routeLine={routeLine} tool={tool} onAdd={addPoint} onMove={movePoint} onDelete={deletePoint} onInsert={insertPoint} />{message && <div className={`editor-message${status === 'error' ? ' error' : ''}`} role="status">{message}</div>}</div>
    </section>
  </main>
}
