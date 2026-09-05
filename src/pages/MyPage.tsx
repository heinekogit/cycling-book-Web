import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { deleteOwnedRecord, getMyRoutes, getMyRuns, type MyRoute, type MyRun } from '../features/mypage/api'
import { routeTypeLabel } from '../features/routes/geometry'

type Tab = 'routes' | 'runs'
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '日付未設定'
const formatDistance = (value: number | null) => value == null ? '距離未設定' : `${(Number(value) / 1000).toFixed(2)} km`
const formatDuration = (value: number | null) => value == null ? '時間未設定' : `${Math.round(Number(value) / 60)} 分`

export function MyPage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'runs' ? 'runs' : 'routes'
  const [accountId, setAccountId] = useState<string | number | null>(null)
  const [routes, setRoutes] = useState<MyRoute[]>([])
  const [runs, setRuns] = useState<MyRun[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (isAuthLoading || !session?.user.id) return
    let isMounted = true
    void getAccountId(session.user.id).then(async (nextAccountId) => {
      if (!nextAccountId) throw new Error('アカウント情報が見つかりません')
      const [nextRoutes, nextRuns] = await Promise.all([getMyRoutes(nextAccountId), getMyRuns(nextAccountId)])
      if (!isMounted) return
      setAccountId(nextAccountId); setRoutes(nextRoutes); setRuns(nextRuns); setStatus('ready')
    }).catch((error) => { console.error('マイページを読み込めませんでした', error); if (isMounted) setStatus('error') })
    return () => { isMounted = false }
  }, [isAuthLoading, session?.user.id])

  const changeTab = (nextTab: Tab) => setSearchParams(nextTab === 'routes' ? {} : { tab: 'runs' }, { replace: true })

  const deleteRecord = async (type: 'routes' | 'runs', id: string | number) => {
    if (!accountId) return
    const label = type === 'routes' ? 'マイルート' : '実走ログ'
    if (!window.confirm(`この${label}を削除しますか？`)) return
    setMessage('削除しています…')
    try {
      await deleteOwnedRecord(type, id, accountId)
      if (type === 'routes') setRoutes((items) => items.filter((item) => String(item.id) !== String(id)))
      else setRuns((items) => items.filter((item) => String(item.id) !== String(id)))
      setMessage(`${label}を削除しました。`)
    } catch (error) {
      console.error(`${label}を削除できませんでした`, error)
      setMessage(`${label}を削除できませんでした。`)
    }
  }

  if (isAuthLoading) return <main className="mypage"><div className="state-panel">ログイン状態を確認しています…</div></main>
  if (!session) return <main className="mypage"><section className="state-panel"><p className="eyebrow">MEMBERS ONLY</p><h1>ログインが必要です</h1><p>マイルートと実走ログを確認するにはログインしてください。</p><Link className="button button-primary" to="/login?returnTo=/mypage">ログインへ</Link></section></main>

  return <main className="mypage">
    <section className="mypage-heading">
      <div><p className="eyebrow">MY CYCLING BOOK</p><h1>マイページ</h1><p>{session.user.email}</p></div>
      <div className="mypage-actions"><Link className="button button-primary" to="/routes/new">マイルートを作る</Link>{accountId && <Link className="button button-quiet" to={`/riders/${accountId}`}>公開ページを見る</Link>}<Link className="button button-quiet" to="/profile">プロフィール設定</Link></div>
    </section>

    <div className="mypage-summary" aria-label="登録件数"><div><strong>{routes.length}</strong><span>マイルート</span></div><div><strong>{runs.length}</strong><span>実走ログ</span></div></div>
    {message && <div className="mypage-message" role="status">{message}</div>}
    <div className="mypage-tabs" role="tablist" aria-label="マイページ切り替え">
      <button type="button" role="tab" aria-selected={tab === 'routes'} className={tab === 'routes' ? 'active' : ''} onClick={() => changeTab('routes')}>マイルート</button>
      <button type="button" role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'active' : ''} onClick={() => changeTab('runs')}>実走ログ</button>
    </div>

    {status === 'loading' && <div className="panel-loading mypage-loading">記録を読み込んでいます…</div>}
    {status === 'error' && <div className="state-panel state-error">記録を読み込めませんでした。</div>}
    {status === 'ready' && tab === 'routes' && <RecordList empty="マイルートはまだありません。ルートを描いて最初の一件を作りましょう。">
      {routes.map((route) => <article className="record-card" key={route.id}>
        <Link className="record-main" to={`/routes/${route.id}`}><div className="record-title"><h2>{route.name || '無題のルート'}</h2><span className={route.is_public ? 'record-badge public' : 'record-badge private'}>{route.is_public ? '公開' : '非公開'}</span></div><p>{formatDate(route.created_at)}</p><div className="record-meta"><span>{formatDistance(route.distance_m)}</span><span>{routeTypeLabel(route.route_type, route.origin, route.source_run_id)}</span>{route.source_run_id && <span>元ログ #{route.source_run_id}</span>}</div></Link>
        <button className="record-delete" type="button" onClick={() => void deleteRecord('routes', route.id)} aria-label={`${route.name || '無題のルート'}を削除`}>削除</button>
      </article>)}
    </RecordList>}
    {status === 'ready' && tab === 'runs' && <RecordList empty="実走ログはまだありません。">
      {runs.map((run) => <article className="record-card" key={run.id}>
        <Link className="record-main" to={`/runs/${run.id}`}><div className="record-title"><h2>{run.name || formatDate(run.started_at || run.created_at)}</h2></div><p>{formatDate(run.created_at || run.started_at)}</p><div className="record-meta"><span>{formatDistance(run.distance_m)}</span><span>{formatDuration(run.duration_s)}</span></div></Link>
        <button className="record-delete" type="button" onClick={() => void deleteRecord('runs', run.id)} aria-label={`${run.name || '実走ログ'}を削除`}>削除</button>
      </article>)}
    </RecordList>}
  </main>
}

function RecordList({ children, empty }: { children: ReactNode; empty: string }) {
  const hasRecords = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="record-list" role="tabpanel">{hasRecords ? children : <div className="panel-muted">{empty}</div>}</section>
}
