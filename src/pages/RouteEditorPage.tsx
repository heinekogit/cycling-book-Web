import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { EditorElevationPreview } from '../features/elevation/EditorElevationPreview'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { RouteEditorMap, type EditorTool } from '../features/maps/RouteEditorMap'
import { searchJapaneseLocation } from '../features/maps/geocoding'
import { getProfile } from '../features/profile/api'
import { createRoute, getRunPhotoCandidates, saveRoutePhotoSelections, updateRoute, type RoutePhotoCandidate } from '../features/routes/editor-api'
import { extractRoutePoints, simplifyTrack, totalDistanceMeters, type TrackPoint } from '../features/routes/geometry'
import { deleteMarkerFilesDraft, loadMarkerFilesDraft, saveMarkerFilesDraft } from '../features/routes/marker-draft'
import { getRouteMarkers, markerNearRoute, saveRouteMarkers, type EditableMarker, type RouteMarker } from '../features/routes/markers'
import { encodePolyline, getSnappedRoute, type TravelMode } from '../features/routes/routing'
import { getPrivateRouteGeometry, getRoute, getRoutePhotos } from '../features/routes/api'
import { getConvertedRouteForRun, getLegacyRouteForRun, getRouteForRun, getRun } from '../features/runs/api'

type DrawMode = 'snap' | 'freehand'
type Snapshot = { controlPoints: TrackPoint[]; routeLine: TrackPoint[]; lockedRouteLine: TrackPoint[]; segmentStartIndex: number }
type Draft = Snapshot & { name: string; description: string; isPublic: boolean; drawMode: DrawMode; travelMode: TravelMode; routeId: string | null; sourceRunId: string | null; distanceM: number | null; markers?: RouteMarker[] }
const defaultCenter = { lat: 35.681236, lng: 139.767125 }
const prefectures = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']
const draftKey = (routeId?: string, sourceRunId?: string | null, duplicateRouteId?: string | null) => `cycling-book.route-draft.${routeId || (sourceRunId ? `run-${sourceRunId}` : duplicateRouteId ? `copy-${duplicateRouteId}` : 'new')}`
const clonePoints = (points: TrackPoint[]) => points.map((point) => ({ ...point }))
const savedMarkerMetadata = (markers: EditableMarker[]): RouteMarker[] => markers.map(({ newPhotos: _newPhotos, ...marker }) => { void _newPhotos; return marker })

function PendingMarkerPhoto({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const frame = requestAnimationFrame(() => setPreviewUrl(url))
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url) }
  }, [file])
  return <div>{previewUrl && <img src={previewUrl} alt={file.name} />}<span>{file.name}</span><button type="button" onClick={onRemove}>削除</button></div>
}

function joinRouteLines(lockedRouteLine: TrackPoint[], activeRouteLine: TrackPoint[]) {
  if (!lockedRouteLine.length) return clonePoints(activeRouteLine)
  if (!activeRouteLine.length) return clonePoints(lockedRouteLine)
  const lockedEnd = lockedRouteLine[lockedRouteLine.length - 1]
  const activeStart = activeRouteLine[0]
  const startsAtLockedEnd = lockedEnd.lat === activeStart.lat && lockedEnd.lng === activeStart.lng
  return [...clonePoints(lockedRouteLine), ...clonePoints(startsAtLockedEnd ? activeRouteLine.slice(1) : activeRouteLine)]
}

function deriveControlPoints(geojson: unknown, points: TrackPoint[]) {
  const stored = (geojson as { properties?: { controlPoints?: unknown } } | null)?.properties?.controlPoints
  if (Array.isArray(stored) && stored.length && stored.every((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))) return clonePoints(stored as TrackPoint[])
  return points.length > 1 ? [points[0], points[points.length - 1]].map((point) => ({ ...point })) : clonePoints(points)
}

function controlPointRouteIndexes(controlPoints: TrackPoint[], routeLine: TrackPoint[]) {
  let cursor = 0
  return controlPoints.map((controlPoint) => {
    let bestIndex = cursor
    let bestDistance = Infinity
    for (let index = cursor; index < routeLine.length; index += 1) {
      const latitudeDelta = routeLine[index].lat - controlPoint.lat
      const longitudeDelta = routeLine[index].lng - controlPoint.lng
      const distance = latitudeDelta * latitudeDelta + longitudeDelta * longitudeDelta
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index }
      if (distance === 0) break
    }
    cursor = bestIndex
    return bestIndex
  })
}

function movePointWithStraightConnections(controlPoints: TrackPoint[], routeLine: TrackPoint[], index: number, point: TrackPoint) {
  const nextControlPoints = clonePoints(controlPoints)
  nextControlPoints[index] = point
  if (controlPoints.length <= 1 || !routeLine.length) return { controlPoints: nextControlPoints, routeLine: [point] }

  const routeIndexes = controlPointRouteIndexes(controlPoints, routeLine)
  const previousRouteIndex = index > 0 ? routeIndexes[index - 1] : -1
  const nextRouteIndex = index < controlPoints.length - 1 ? routeIndexes[index + 1] : -1
  if (previousRouteIndex >= 0 && nextRouteIndex >= 0) {
    return { controlPoints: nextControlPoints, routeLine: [...clonePoints(routeLine.slice(0, previousRouteIndex + 1)), point, ...clonePoints(routeLine.slice(nextRouteIndex))] }
  }
  if (previousRouteIndex >= 0) {
    return { controlPoints: nextControlPoints, routeLine: [...clonePoints(routeLine.slice(0, previousRouteIndex + 1)), point] }
  }
  return { controlPoints: nextControlPoints, routeLine: [point, ...clonePoints(routeLine.slice(nextRouteIndex))] }
}

export function RouteEditorPage() {
  const { routeId } = useParams()
  const [searchParams] = useSearchParams()
  const sourceRunParam = routeId ? null : searchParams.get('fromRun')
  const duplicateRouteParam = routeId || sourceRunParam ? null : searchParams.get('duplicateFrom')
  const { session, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [sourceRunId, setSourceRunId] = useState<string | null>(sourceRunParam)
  const [sourceDistanceM, setSourceDistanceM] = useState<number | null>(null)
  const [controlPoints, setControlPoints] = useState<TrackPoint[]>([])
  const [routeLine, setRouteLine] = useState<TrackPoint[]>([])
  const [lockedRouteLine, setLockedRouteLine] = useState<TrackPoint[]>([])
  const [segmentStartIndex, setSegmentStartIndex] = useState(0)
  const [center, setCenter] = useState<TrackPoint>(defaultCenter)
  const [focusVersion, setFocusVersion] = useState(0)
  const [prefecture, setPrefecture] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [locationStatus, setLocationStatus] = useState<'idle' | 'searching'>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [tool, setTool] = useState<EditorTool>('add')
  const [drawMode, setDrawMode] = useState<DrawMode>('snap')
  const [moveMode, setMoveMode] = useState<DrawMode>('snap')
  const [travelMode, setTravelMode] = useState<TravelMode>('cycling')
  const [history, setHistory] = useState<Snapshot[]>([{ controlPoints: [], routeLine: [], lockedRouteLine: [], segmentStartIndex: 0 }])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'routing' | 'saving' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [photoCandidates, setPhotoCandidates] = useState<RoutePhotoCandidate[]>([])
  const [selectedPhotoKeys, setSelectedPhotoKeys] = useState<string[]>([])
  const [markers, setMarkers] = useState<EditableMarker[]>([])
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [markerSaving, setMarkerSaving] = useState(false)
  const [markerSaveMessage, setMarkerSaveMessage] = useState('')
  const pendingSavedRouteId = useRef<string | number | null>(null)
  const routingSequence = useRef(0)

  useEffect(() => {
    if (isAuthLoading || !session?.user.id) return
    let isMounted = true
    void (async () => {
      const profile = await getProfile(session.user.id)
      if (!isMounted) return
      const homeLat = Number(profile?.home_lat)
      const homeLng = Number(profile?.home_lng)
      if (profile?.home_lat != null && profile.home_lng != null && Number.isFinite(homeLat) && Number.isFinite(homeLng)) {
        const home = { lat: homeLat, lng: homeLng }
        setCenter(home)
      }
      let initial: Draft = { name: '', description: '', isPublic: false, controlPoints: [], routeLine: [], lockedRouteLine: [], segmentStartIndex: 0, drawMode: 'snap', travelMode: 'cycling', routeId: routeId || null, sourceRunId: sourceRunParam, distanceM: null }
      let initialPhotoCandidates: RoutePhotoCandidate[] = []
      let initialSelectedPhotoKeys: string[] = []
      let initialMarkers: EditableMarker[] = []
      if (routeId) {
        const accountId = await getAccountId(session.user.id); const route = await getRoute(routeId)
        if (!isMounted) return
        if (accountId == null) throw new Error('アカウント情報がありません')
        if (!route || String(route.account_id) !== String(accountId)) throw new Error('編集できるルートが見つかりません')
        const privateGeometry = route.is_public ? await getPrivateRouteGeometry(route.id) : null
        const points = extractRoutePoints(privateGeometry || route)
        initial = { ...initial, name: route.name || '', description: route.description || '', isPublic: false, sourceRunId: route.source_run_id == null ? null : String(route.source_run_id), routeLine: points, controlPoints: deriveControlPoints(privateGeometry?.geojson ?? route.geojson, points), distanceM: privateGeometry?.distance_m ?? route.distance_m }
        initialMarkers = (await getRouteMarkers(route.id)).map((marker) => ({ ...marker, newPhotos: [] }))
        if (route.source_run_id != null) {
          const run = await getRun(String(route.source_run_id))
          const legacyRoute = run ? await getLegacyRouteForRun(accountId, run.started_at || run.created_at) : null
          const [legacyPhotos, savedPhotos] = await Promise.all([
            legacyRoute && String(legacyRoute.id) !== String(route.id) ? getRoutePhotos(legacyRoute.id) : Promise.resolve([]),
            getRoutePhotos(route.id),
          ])
          initialPhotoCandidates = await getRunPhotoCandidates(route.source_run_id, legacyPhotos)
          const savedPathOrder = new Map<string, number>()
          savedPhotos.forEach((photo, index) => {
            savedPathOrder.set(photo.image_path, index)
            if (photo.thumb_path) savedPathOrder.set(photo.thumb_path, index)
          })
          initialSelectedPhotoKeys = initialPhotoCandidates
            .filter((photo) => savedPathOrder.has(photo.imagePath) || Boolean(photo.thumbPath && savedPathOrder.has(photo.thumbPath)))
            .sort((a, b) => (savedPathOrder.get(a.imagePath) ?? savedPathOrder.get(a.thumbPath || '') ?? 0) - (savedPathOrder.get(b.imagePath) ?? savedPathOrder.get(b.thumbPath || '') ?? 0))
            .map((photo) => photo.key)
          if (!savedPhotos.length) initialSelectedPhotoKeys = initialPhotoCandidates.map((photo) => photo.key)
        }
      } else if (duplicateRouteParam) {
        const accountId = await getAccountId(session.user.id); const route = await getRoute(duplicateRouteParam)
        if (!isMounted) return
        if (!route || (!route.is_public && String(route.account_id) !== String(accountId))) throw new Error('複製できるルートが見つかりません')
        const points = extractRoutePoints(route)
        initial = {
          ...initial,
          name: `${route.name || '無題のルート'} のコピー`,
          description: route.description || '',
          isPublic: false,
          sourceRunId: null,
          routeLine: points,
          controlPoints: deriveControlPoints(route.geojson, points),
          distanceM: route.distance_m,
        }
      } else if (sourceRunParam) {
        const accountId = await getAccountId(session.user.id)
        const run = await getRun(sourceRunParam)
        if (!run || String(run.account_id) !== String(accountId)) throw new Error('マイルート化する実走ログが見つかりません')
        const runPoints = extractRoutePoints(run)
        const photoRoute = accountId == null ? null : await getRouteForRun(run.id, accountId, run.started_at || run.created_at)
        const photos = photoRoute ? await getRoutePhotos(photoRoute.id) : []
        initialPhotoCandidates = await getRunPhotoCandidates(run.id, photos)
        initialSelectedPhotoKeys = initialPhotoCandidates.map((photo) => photo.key)
        const photoPoints = photos.filter((photo) => Number.isFinite(Number(photo.lat)) && Number.isFinite(Number(photo.lng))).map((photo) => ({ lat: Number(photo.lat), lng: Number(photo.lng) }))
        const simplified = simplifyTrack(runPoints, 10, photoPoints)
        initial = { ...initial, name: run.name || '実走ログから作成したルート', routeLine: simplified, controlPoints: simplified, drawMode: 'freehand', distanceM: run.distance_m }
      }
      const stored = localStorage.getItem(draftKey(routeId, sourceRunParam, duplicateRouteParam))
      if (stored && window.confirm('保存前の下書きがあります。復元しますか？')) {
        try {
          const draft = JSON.parse(stored) as Draft
          if (draft.routeId === (routeId || null)) {
            initial = { ...initial, ...draft }
            if (draft.markers) {
              const files = await loadMarkerFilesDraft(draftKey(routeId, sourceRunParam, duplicateRouteParam)).catch(() => new Map<string, File[]>())
              initialMarkers = draft.markers.map((marker) => ({ ...marker, newPhotos: files.get(marker.id) ?? [] }))
            }
          }
        } catch { localStorage.removeItem(draftKey(routeId, sourceRunParam, duplicateRouteParam)) }
      }
      if (!isMounted) return
      setName(initial.name); setDescription(initial.description); setIsPublic(initial.isPublic); setSourceRunId(initial.sourceRunId); setSourceDistanceM(initial.distanceM); setControlPoints(clonePoints(initial.controlPoints)); setRouteLine(clonePoints(initial.routeLine)); setLockedRouteLine(clonePoints(initial.lockedRouteLine)); setSegmentStartIndex(initial.segmentStartIndex); setDrawMode(initial.drawMode); setTravelMode(initial.travelMode)
      setPhotoCandidates(initialPhotoCandidates); setSelectedPhotoKeys(initialSelectedPhotoKeys)
      setMarkers(initialMarkers)
      if (initial.routeLine.length) setCenter(initial.routeLine[0])
      setHistory([{ controlPoints: clonePoints(initial.controlPoints), routeLine: clonePoints(initial.routeLine), lockedRouteLine: clonePoints(initial.lockedRouteLine), segmentStartIndex: initial.segmentStartIndex }]); setStatus('ready')
    })().catch((error) => { console.error('ルート編集を開始できませんでした', error); if (isMounted) { setStatus('error'); setMessage('ルート編集を開始できませんでした。') } })
    return () => { isMounted = false }
  }, [duplicateRouteParam, isAuthLoading, routeId, session?.user.id, sourceRunParam])

  useEffect(() => {
    if (!dirty || status === 'loading' || status === 'saving') return
    const timeout = window.setTimeout(() => {
      const draft: Draft = { name, description, isPublic, controlPoints, routeLine, lockedRouteLine, segmentStartIndex, drawMode, travelMode, routeId: routeId || null, sourceRunId, distanceM: sourceDistanceM, markers: savedMarkerMetadata(markers) }
      const key = draftKey(routeId, sourceRunParam, duplicateRouteParam)
      void saveMarkerFilesDraft(key, markers).then(() => {
        localStorage.setItem(key, JSON.stringify(draft))
      }).catch((error) => console.warn('写真の自動下書きを保存できませんでした', error))
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [controlPoints, description, dirty, drawMode, duplicateRouteParam, isPublic, lockedRouteLine, markers, name, routeId, routeLine, segmentStartIndex, sourceDistanceM, sourceRunId, sourceRunParam, status, travelMode])

  const commit = useCallback((nextControlPoints: TrackPoint[], nextRouteLine: TrackPoint[], nextLockedRouteLine: TrackPoint[], nextSegmentStartIndex: number) => {
    setControlPoints(nextControlPoints); setRouteLine(nextRouteLine)
    setLockedRouteLine(nextLockedRouteLine); setSegmentStartIndex(nextSegmentStartIndex)
    setSourceDistanceM(null)
    setDirty(true)
    setHistory((items) => [...items.slice(-99), { controlPoints: clonePoints(nextControlPoints), routeLine: clonePoints(nextRouteLine), lockedRouteLine: clonePoints(nextLockedRouteLine), segmentStartIndex: nextSegmentStartIndex }]); setFuture([])
  }, [])

  const rebuild = useCallback(async (nextControlPoints: TrackPoint[], nextDrawMode = drawMode, nextTravelMode = travelMode) => {
    const sequence = ++routingSequence.current
    const activeControlPoints = nextControlPoints.slice(segmentStartIndex)
    if (activeControlPoints.length < 2) { commit(nextControlPoints, joinRouteLines(lockedRouteLine, activeControlPoints), lockedRouteLine, segmentStartIndex); return }
    if (nextDrawMode === 'freehand') { commit(nextControlPoints, joinRouteLines(lockedRouteLine, activeControlPoints), lockedRouteLine, segmentStartIndex); return }
    setStatus('routing'); setMessage('道路に沿うルートを計算しています…')
    try {
      const calculated = await getSnappedRoute(activeControlPoints, nextTravelMode)
      if (sequence === routingSequence.current) { commit(nextControlPoints, joinRouteLines(lockedRouteLine, calculated), lockedRouteLine, segmentStartIndex); setStatus('ready'); setMessage('') }
    } catch (error) {
      console.warn('道路に沿うルートを計算できませんでした', error)
      if (sequence === routingSequence.current) { commit(nextControlPoints, joinRouteLines(lockedRouteLine, activeControlPoints), lockedRouteLine, segmentStartIndex); setStatus('ready'); setMessage('道路に沿う計算に失敗したため、新しい区間を直線で結びました。') }
    }
  }, [commit, drawMode, lockedRouteLine, segmentStartIndex, travelMode])

  const addPoint = (point: TrackPoint) => { void rebuild([...controlPoints, point]) }
  const isLockedControlPoint = (index: number) => lockedRouteLine.length > 0 && index <= segmentStartIndex
  const movePoint = async (index: number, point: TrackPoint) => {
    if (isLockedControlPoint(index)) { setMessage('切り替え前の区間は固定されています。必要な場合はUndoで切り替え前に戻してください。'); return }
    const sequence = ++routingSequence.current
    const activeControlPoints = controlPoints.slice(segmentStartIndex)
    const activeRouteLine = lockedRouteLine.length ? routeLine.slice(Math.max(0, lockedRouteLine.length - 1)) : routeLine
    const activeIndex = index - segmentStartIndex
    const finish = (nextRouteLine: TrackPoint[], message: string) => {
      if (sequence !== routingSequence.current) return
      const nextControlPoints = clonePoints(controlPoints)
      nextControlPoints[index] = point
      commit(nextControlPoints, joinRouteLines(lockedRouteLine, nextRouteLine), lockedRouteLine, segmentStartIndex)
      setStatus('ready'); setMessage(message)
    }
    if (moveMode === 'freehand' || activeControlPoints.length < 2 || activeRouteLine.length < 2) {
      finish(movePointWithStraightConnections(activeControlPoints, activeRouteLine, activeIndex, point).routeLine, '移動したポイントの前後を直線で結びました。')
      return
    }
    const routeIndexes = controlPointRouteIndexes(activeControlPoints, activeRouteLine)
    const startIndex = activeIndex > 0 ? routeIndexes[activeIndex - 1] : routeIndexes[activeIndex]
    const endIndex = activeIndex < activeControlPoints.length - 1 ? routeIndexes[activeIndex + 1] : routeIndexes[activeIndex]
    const adjacentPoints = [activeControlPoints[activeIndex - 1], point, activeControlPoints[activeIndex + 1]].filter((item): item is TrackPoint => Boolean(item))
    setStatus('routing'); setMessage('移動したポイントの前後を道路に沿って計算しています…')
    try {
      const calculated = await getSnappedRoute(adjacentPoints, travelMode)
      finish([...clonePoints(activeRouteLine.slice(0, startIndex)), ...calculated, ...clonePoints(activeRouteLine.slice(endIndex + 1))], '')
    } catch (error) {
      console.warn('移動したポイントの前後を道路に沿って計算できませんでした', error)
      finish(movePointWithStraightConnections(activeControlPoints, activeRouteLine, activeIndex, point).routeLine, '道路に沿う計算に失敗したため、移動したポイントの前後を直線で結びました。')
    }
  }
  const deletePoint = (index: number) => {
    if (isLockedControlPoint(index)) { setMessage('切り替え前の区間は固定されています。必要な場合はUndoで切り替え前に戻してください。'); return }
    void rebuild(controlPoints.filter((_point, itemIndex) => itemIndex !== index))
  }
  const insertPoint = (point: TrackPoint, routeSegmentIndex: number) => {
    if (lockedRouteLine.length && routeSegmentIndex < lockedRouteLine.length - 1) { setMessage('切り替え前の区間は固定されています。'); return }
    const activeControlPoints = controlPoints.slice(segmentStartIndex)
    const activeRouteLine = lockedRouteLine.length ? routeLine.slice(Math.max(0, lockedRouteLine.length - 1)) : routeLine
    if (activeControlPoints.length < 2 || activeRouteLine.length < 2) { setMessage('中間点を追加できるルート線がありません。'); return }
    const activeRouteSegmentIndex = routeSegmentIndex - (lockedRouteLine.length ? lockedRouteLine.length - 1 : 0)
    const routeIndexes = controlPointRouteIndexes(activeControlPoints, activeRouteLine)
    let controlSegmentIndex = 0
    while (controlSegmentIndex < activeControlPoints.length - 2 && activeRouteSegmentIndex >= routeIndexes[controlSegmentIndex + 1]) controlSegmentIndex += 1
    const nextControlPoints = clonePoints(controlPoints)
    nextControlPoints.splice(segmentStartIndex + controlSegmentIndex + 1, 0, point)
    const nextRouteLine = clonePoints(routeLine)
    nextRouteLine.splice(routeSegmentIndex + 1, 0, point)
    commit(nextControlPoints, nextRouteLine, lockedRouteLine, segmentStartIndex)
    setStatus('ready'); setMessage('ルート線上に中間点を追加しました。ルート形状は変更していません。')
  }

  const undo = () => {
    if (history.length <= 1) return
    const current = history[history.length - 1]; const previous = history[history.length - 2]
    setHistory((items) => items.slice(0, -1)); setFuture((items) => [...items, current]); setControlPoints(clonePoints(previous.controlPoints)); setRouteLine(clonePoints(previous.routeLine)); setLockedRouteLine(clonePoints(previous.lockedRouteLine)); setSegmentStartIndex(previous.segmentStartIndex)
    setDirty(true)
  }
  const redo = () => {
    const next = future.at(-1); if (!next) return
    setFuture((items) => items.slice(0, -1)); setHistory((items) => [...items, next]); setControlPoints(clonePoints(next.controlPoints)); setRouteLine(clonePoints(next.routeLine)); setLockedRouteLine(clonePoints(next.lockedRouteLine)); setSegmentStartIndex(next.segmentStartIndex)
    setDirty(true)
  }

  const freezeCurrentRoute = () => {
    routingSequence.current += 1
    if (!controlPoints.length || !routeLine.length) return
    const nextLockedRouteLine = clonePoints(routeLine)
    const nextSegmentStartIndex = controlPoints.length - 1
    setLockedRouteLine(nextLockedRouteLine); setSegmentStartIndex(nextSegmentStartIndex)
    setHistory((items) => [...items.slice(-99), { controlPoints: clonePoints(controlPoints), routeLine: clonePoints(routeLine), lockedRouteLine: nextLockedRouteLine, segmentStartIndex: nextSegmentStartIndex }]); setFuture([])
  }
  const changeDrawMode = (next: DrawMode) => {
    if (next === drawMode) return
    freezeCurrentRoute(); setDrawMode(next); setDirty(true); setStatus('ready')
    setMessage(next === 'freehand' ? 'ここから先を直線で描きます。切り替え前の区間は保持されます。' : 'ここから先を道路に沿って描きます。切り替え前の区間は保持されます。')
  }
  const changeTravelMode = (next: TravelMode) => {
    if (next === travelMode) return
    if (drawMode === 'snap') freezeCurrentRoute()
    setTravelMode(next); setDirty(true); setStatus('ready'); setMessage('ここから先に新しい移動方法を適用します。切り替え前の区間は保持されます。')
  }
  const clear = () => { if (controlPoints.length && window.confirm('すべてのポイントを削除しますか？')) commit([], [], [], 0) }

  const addMarker = (point: TrackPoint) => {
    if (!markerNearRoute(point, routeLine)) { setMessage('マーカーはルートから500m以内、または周回ルートの内側に置いてください。'); return }
    const id = crypto.randomUUID()
    setMarkers((items) => [...items, { id, lat: point.lat, lng: point.lng, comment: '', photos: [], newPhotos: [], isPrivacyHidden: false }])
    setSelectedMarkerId(id); setDirty(true); setMarkerSaveMessage(''); setMessage('マーカーを追加しました。コメントや写真を設定できます。')
  }
  const moveMarker = (id: string, point: TrackPoint) => {
    if (!markerNearRoute(point, routeLine)) { setMessage('マーカーはルートから500m以内、または周回ルートの内側に置いてください。'); return false }
    setMarkers((items) => items.map((marker) => marker.id === id ? { ...marker, ...point } : marker))
    setDirty(true); setMarkerSaveMessage(''); setMessage('')
    return true
  }
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId)
  const updateSelectedMarker = (change: Partial<EditableMarker>) => {
    setMarkers((items) => items.map((marker) => marker.id === selectedMarkerId ? { ...marker, ...change } : marker))
    setDirty(true); setMarkerSaveMessage('')
  }

  const saveMarkerDraft = async () => {
    setMarkerSaving(true); setMarkerSaveMessage('下書きを保存しています…')
    const key = draftKey(routeId, sourceRunParam, duplicateRouteParam)
    try {
      const draft: Draft = { name, description, isPublic, controlPoints, routeLine, lockedRouteLine, segmentStartIndex, drawMode, travelMode, routeId: routeId || null, sourceRunId, distanceM: sourceDistanceM, markers: savedMarkerMetadata(markers) }
      await saveMarkerFilesDraft(key, markers)
      localStorage.setItem(key, JSON.stringify(draft))
      setMarkerSaveMessage('マーカーと写真をこの端末の下書きに保存しました。ルートを描いた後、ルートを保存するとサーバーにも保存されます。')
    } catch (error) {
      console.error('マーカーの下書きを保存できませんでした', error)
      setMarkerSaveMessage('下書きを保存できませんでした。ブラウザの保存領域をご確認ください。')
    } finally { setMarkerSaving(false) }
  }

  const showLocation = async (place: string, selectedPrefecture = prefecture) => {
    const query = [selectedPrefecture, place.trim()].filter(Boolean).join(' ')
    if (!query) { setLocationMessage('都道府県または地名を入力してください。'); return }
    setLocationStatus('searching'); setLocationMessage('地域を検索しています…')
    try {
      const result = await searchJapaneseLocation(query)
      setCenter(result.point); setFocusVersion((value) => value + 1); setLocationMessage(`${result.label}を表示しました。`)
    } catch (error) {
      console.warn('地域を検索できませんでした', error)
      setLocationMessage('地域が見つかりませんでした。地名や住所を変えてお試しください。')
    } finally { setLocationStatus('idle') }
  }

  const save = async () => {
    if (!session?.user.id) return
    if (routeLine.length < 2) {
      if (markers.length) await saveMarkerDraft()
      else setMessage('少なくとも2点以上のポイントが必要です。')
      return
    }
    if (markers.some((marker) => !markerNearRoute(marker, routeLine))) { setMessage('ルートから離れたマーカーがあります。位置を調整してから保存してください。'); return }
    setStatus('saving'); setMessage('ルートを保存しています…'); setMarkerSaveMessage('ルートとマーカーを保存しています…')
    try {
      const accountId = await getAccountId(session.user.id); if (accountId == null) throw new Error('アカウント情報がありません')
      if (!routeId && sourceRunId) {
        const existing = await getConvertedRouteForRun(sourceRunId, accountId)
        if (existing) { localStorage.removeItem(draftKey(routeId, sourceRunParam, duplicateRouteParam)); navigate(`/routes/${existing.id}`, { replace: true }); return }
      }
      const payload = { name: name.trim() || '新しいルート', description, isPublic: false, sourceRunId, distanceM: sourceDistanceM, copiedFromRouteId: routeId ? undefined : duplicateRouteParam, accountId, routeLine, controlPoints, polyline: encodePolyline(routeLine) }
      const savedId = routeId ? await updateRoute(routeId, payload) : pendingSavedRouteId.current ?? await createRoute(payload)
      pendingSavedRouteId.current = savedId
      if (sourceRunId) {
        const photosByKey = new Map(photoCandidates.map((photo) => [photo.key, photo]))
        const selectedPhotos = selectedPhotoKeys.flatMap((key) => {
          const photo = photosByKey.get(key)
          return photo ? [photo] : []
        })
        await saveRoutePhotoSelections(savedId, sourceRunId, selectedPhotos, session.user.id)
      }
      await saveRouteMarkers(savedId, markers, session.user.id)
      const key = draftKey(routeId, sourceRunParam, duplicateRouteParam)
      localStorage.removeItem(key)
      await deleteMarkerFilesDraft(key).catch((error) => console.warn('マーカーのローカル下書きを削除できませんでした', error))
      navigate(`/routes/${savedId}`, { replace: true })
    } catch (error) {
      console.error('ルートを保存できませんでした', error)
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      setStatus('error'); setMessage(`ルートを保存できませんでした。${detail ? ` ${detail}` : ''}`)
      setMarkerSaveMessage('保存に失敗しました。地図上のメッセージをご確認ください。')
    }
  }
  const saveMarkers = async () => {
    if (!routeId) {
      if (routeLine.length < 2) await saveMarkerDraft()
      else await save()
      return
    }
    if (!session?.user.id) return
    if (routeLine.length >= 2 && markers.some((marker) => !markerNearRoute(marker, routeLine))) {
      setMarkerSaveMessage('ルートから離れたマーカーがあります。位置を調整してください。')
      return
    }
    setMarkerSaving(true)
    setMarkerSaveMessage('マーカーと写真を保存しています…')
    try {
      await saveRouteMarkers(routeId, markers, session.user.id)
      const saved = await getRouteMarkers(routeId)
      setMarkers(saved.map((marker) => ({ ...marker, newPhotos: [] })))
      const key = draftKey(routeId, sourceRunParam, duplicateRouteParam)
      localStorage.removeItem(key)
      await deleteMarkerFilesDraft(key).catch((error) => console.warn('マーカーのローカル下書きを削除できませんでした', error))
      setDirty(false)
      setStatus('ready')
      setMessage('')
      setMarkerSaveMessage('マーカーと写真を保存しました。')
    } catch (error) {
      console.error('マーカーと写真を保存できませんでした', error)
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      setMarkerSaveMessage(`保存できませんでした。${detail ? ` ${detail}` : ''}`)
    } finally { setMarkerSaving(false) }
  }

  const distance = useMemo(() => totalDistanceMeters(routeLine), [routeLine])
  const selectedPhotoSet = useMemo(() => new Set(selectedPhotoKeys), [selectedPhotoKeys])
  const orderedPhotos = useMemo(() => {
    const order = new Map(selectedPhotoKeys.map((key, index) => [key, index]))
    return [...photoCandidates].sort((a, b) => {
      const aSelected = order.has(a.key); const bSelected = order.has(b.key)
      if (aSelected && bSelected) return Number(order.get(a.key)) - Number(order.get(b.key))
      if (aSelected) return -1
      if (bSelected) return 1
      return String(a.takenAt || '').localeCompare(String(b.takenAt || ''))
    })
  }, [photoCandidates, selectedPhotoKeys])
  const togglePhoto = (key: string) => {
    setSelectedPhotoKeys((keys) => keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key])
    setDirty(true)
  }
  const movePhoto = (key: string, direction: -1 | 1) => {
    setSelectedPhotoKeys((keys) => {
      const index = keys.indexOf(key); const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= keys.length) return keys
      const next = [...keys]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
    setDirty(true)
  }
  if (isAuthLoading) return <main className="route-editor-page"><div className="state-panel">ログイン状態を確認しています…</div></main>
  if (!session) {
    const returnTo = routeId ? `/routes/${routeId}/edit` : duplicateRouteParam ? `/routes/new?duplicateFrom=${encodeURIComponent(duplicateRouteParam)}` : sourceRunParam ? `/routes/new?fromRun=${encodeURIComponent(sourceRunParam)}` : '/routes/new'
    return <main className="route-editor-page"><section className="state-panel"><h1>ログインが必要です</h1><Link className="button button-primary" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>ログインへ</Link></section></main>
  }

  return <main className="route-editor-page">
    <header className="editor-header"><div><p className="eyebrow">ROUTE BUILDER</p><h1>{routeId ? 'マイルートを編集' : duplicateRouteParam ? 'マイルートを複製して編集' : sourceRunId ? '実走ログをマイルートにする' : 'マイルートを作る'}</h1></div><div className="editor-header-actions"><Link className="button button-quiet" to={routeId ? `/routes/${routeId}` : duplicateRouteParam ? `/routes/${duplicateRouteParam}` : sourceRunId ? `/runs/${sourceRunId}` : '/mypage'}>戻る</Link><button className="button button-primary" type="button" onClick={() => void save()} disabled={status === 'saving' || status === 'routing' || markerSaving}>{status === 'saving' || markerSaving ? '保存中…' : routeId ? '更新する' : sourceRunId ? 'この内容で作成' : '保存する'}</button></div></header>
    <form className="editor-location-search" onSubmit={(event) => { event.preventDefault(); void showLocation(placeQuery) }}>
      <label><span>都道府県</span><select value={prefecture} onChange={(event) => { const next = event.target.value; setPrefecture(next); if (next) void showLocation('', next) }}><option value="">選択してください</option>{prefectures.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label><span>地名・住所</span><input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="市区町村、駅名、住所など" /></label>
      <button className="button button-primary" type="submit" disabled={locationStatus === 'searching'}>{locationStatus === 'searching' ? '検索中…' : '地図を表示'}</button>
      {locationMessage && <p role="status">{locationMessage}</p>}
    </form>
    <section className="editor-name-row"><label htmlFor="route-name">ルート名</label><input id="route-name" maxLength={120} value={name} onChange={(event) => { setName(event.target.value); setDirty(true) }} placeholder="新しいルート" /><div><strong>{((sourceDistanceM ?? distance) / 1000).toFixed(2)} km</strong><span>{controlPoints.length}ポイント</span></div></section>
    <section className="editor-route-settings"><label htmlFor="route-description"><span>説明</span><textarea id="route-description" maxLength={1000} value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true) }} placeholder="ルートの特徴や見どころ" /></label><p>ルートは非公開で保存されます。保存後の公開前確認で、プライバシーゾーンを設定できます。</p>{sourceRunId && <p>実走ログ #{sourceRunId} の軌跡を10m精度で整理しています。写真付近の地点は保持されます。</p>}</section>
    {sourceRunId && <section className="editor-photo-selection">
      <div className="editor-photo-heading"><div><p className="eyebrow">PHOTOS</p><h2>引き継ぐ写真を確認</h2><p>{photoCandidates.length ? `${selectedPhotoKeys.length} / ${photoCandidates.length} 枚を選択中` : 'この実走ログに写真はありません。'}</p></div>{photoCandidates.length > 0 && <div><button type="button" onClick={() => { setSelectedPhotoKeys(photoCandidates.map((photo) => photo.key)); setDirty(true) }}>すべて選択</button><button type="button" onClick={() => { setSelectedPhotoKeys([]); setDirty(true) }}>すべて解除</button></div>}</div>
      {photoCandidates.length > 0 && <div className="editor-photo-grid">{orderedPhotos.map((photo) => {
        const selected = selectedPhotoSet.has(photo.key); const selectedIndex = selectedPhotoKeys.indexOf(photo.key)
        return <article className={`editor-photo-card${selected ? ' selected' : ''}`} key={photo.key}>
          <button className="editor-photo-toggle" type="button" onClick={() => togglePhoto(photo.key)} aria-pressed={selected}><img src={photo.thumbUrl} alt="" /><span>{selected ? '選択中' : '選択しない'}</span></button>
          <footer><time>{photo.takenAt ? new Date(photo.takenAt).toLocaleString('ja-JP') : '撮影日時なし'}</time>{selected && <div><button type="button" aria-label="前へ移動" onClick={() => movePhoto(photo.key, -1)} disabled={selectedIndex === 0}>←</button><strong>{selectedIndex + 1}</strong><button type="button" aria-label="後ろへ移動" onClick={() => movePhoto(photo.key, 1)} disabled={selectedIndex === selectedPhotoKeys.length - 1}>→</button></div>}</footer>
        </article>
      })}</div>}
      {isPublic && selectedPhotoKeys.length > 0 && <p className="editor-photo-public-note">公開すると、選択した写真もルート閲覧者に表示されます。位置情報を含む写真は内容をご確認ください。</p>}
    </section>}
    <section className="editor-workspace">
      <aside className="editor-toolbar">
        <div className="tool-group"><span>描画方式</span><button className={drawMode === 'snap' ? 'active' : ''} type="button" onClick={() => changeDrawMode('snap')}>道路に沿う</button><button className={drawMode === 'freehand' ? 'active' : ''} type="button" onClick={() => changeDrawMode('freehand')}>直線で描く</button></div>
        <div className="tool-group"><span>移動方法</span><select value={travelMode} onChange={(event) => changeTravelMode(event.target.value as TravelMode)} disabled={drawMode === 'freehand'}><option value="cycling">自転車</option><option value="walking">徒歩</option><option value="driving">自動車</option></select></div>
        <div className="tool-group"><span>操作</span>{([['add','ポイント追加'],['move','ポイント移動'],['insert','中間点追加'],['delete','ポイント削除']] as const).map(([value,label]) => <button className={tool === value ? 'active' : ''} type="button" key={value} onClick={() => setTool(value)}>{label}</button>)}</div>
        {tool === 'move' && <div className="tool-group"><span>ポイント移動時</span><button className={moveMode === 'snap' ? 'active' : ''} type="button" onClick={() => setMoveMode('snap')}>道路に沿う</button><button className={moveMode === 'freehand' ? 'active' : ''} type="button" onClick={() => setMoveMode('freehand')}>直線で描く</button></div>}
        <div className="tool-row"><button type="button" onClick={undo} disabled={history.length <= 1}>Undo</button><button type="button" onClick={redo} disabled={!future.length}>Redo</button></div>
        <div className="tool-group editor-marker-tools">
          <span>マーカー</span>
          <button className={tool === 'marker' ? 'active' : ''} type="button" onClick={() => setTool('marker')}>マーカー編集</button>
          {tool === 'marker' && <div className="editor-marker-panel">
            <p>{routeLine.length < 2 ? 'ルートを描く前でも、地図の好きな場所にマーカーを置けます。' : '地図をクリックして追加。ルートから500m以内、または周回ルートの内側に配置できます。'}</p>
            {markers.length > 0 && <div className="editor-marker-list">{markers.map((marker, index) => <button key={marker.id} type="button" className={selectedMarkerId === marker.id ? 'active' : ''} onClick={() => setSelectedMarkerId(marker.id)}>{index + 1}. {marker.comment || 'コメントなし'}（{marker.photos.length + marker.newPhotos.length}枚）</button>)}</div>}
            {selectedMarker && <div className="editor-marker-fields">
              <label>コメント<textarea maxLength={500} value={selectedMarker.comment} onChange={(event) => updateSelectedMarker({ comment: event.target.value })} placeholder="この場所の見どころなど" /></label>
              <label>写真を追加<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); const files = selected.filter((file) => /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name) || /^(image\/jpeg|image\/png|image\/webp|image\/gif|image\/avif)$/.test(file.type)); if (selected.length !== files.length) { setMessage('表示できる写真はJPEG・PNG・WebP・GIF・AVIFです。HEICはJPEGに変換してから追加してください。'); event.target.value = ''; return } if (files.some((file) => file.size > 20 * 1024 * 1024)) { setMessage('写真は1枚20MB以下にしてください。'); event.target.value = ''; return } updateSelectedMarker({ newPhotos: [...selectedMarker.newPhotos, ...files] }); setMessage(files.length ? `${files.length}枚の写真を追加しました。保存ボタンでアップロードします。` : ''); event.target.value = '' }} /></label>
              <p>写真は長辺1600～2400px・1枚1～3MB程度を推奨します。アップロード上限は1枚20MBです。</p>
              <div className="editor-marker-photos">{selectedMarker.photos.map((photo) => <div key={photo.id}><img src={photo.thumbUrl} alt="" /><button type="button" onClick={() => updateSelectedMarker({ photos: selectedMarker.photos.filter((item) => item.id !== photo.id) })}>削除</button></div>)}{selectedMarker.newPhotos.map((file, index) => <PendingMarkerPhoto key={`${file.name}-${index}`} file={file} onRemove={() => updateSelectedMarker({ newPhotos: selectedMarker.newPhotos.filter((_item, itemIndex) => itemIndex !== index) })} />)}</div>
              <button type="button" onClick={() => { setMarkers((items) => items.filter((marker) => marker.id !== selectedMarker.id)); setSelectedMarkerId(null); setDirty(true); setMarkerSaveMessage('') }}>このマーカーを削除</button>
            </div>}
            {markers.length > 0 && <button className="editor-marker-save" type="button" onClick={() => void saveMarkers()} disabled={markerSaving || status === 'saving' || status === 'routing'}>{markerSaving || status === 'saving' ? '保存中…' : routeId ? 'マーカーと写真を保存' : routeLine.length < 2 ? '下書きを保存' : 'ルートを作成して保存'}</button>}
            {markerSaveMessage && <p role="status" className="editor-marker-save-message">{markerSaveMessage}</p>}
            <p>{routeId ? 'マーカーと写真だけを保存します。' : routeLine.length < 2 ? '写真は下書きに保存され、ルート作成時にアップロードされます。' : '初回はルート作成と一緒に写真を保存します。'}</p>
          </div>}
        </div>
        <button className="clear-tool" type="button" onClick={clear} disabled={!controlPoints.length}>全消去</button>
      </aside>
      <div className="editor-map-panel"><RouteEditorMap center={center} focusVersion={focusVersion} controlPoints={controlPoints} routeLine={routeLine} tool={tool} onAdd={addPoint} onMove={movePoint} onDelete={deletePoint} onInsert={insertPoint} onInsertMiss={() => setMessage('ルート線の近くをクリックしてください。')} markers={markers} onAddMarker={addMarker} onSelectMarker={setSelectedMarkerId} onMoveMarker={moveMarker} />{message && <div className={`editor-message${status === 'error' ? ' error' : ''}`} role="status">{message}</div>}</div>
    </section>
    <EditorElevationPreview points={routeLine} isRouting={status === 'routing'} />
  </main>
}
