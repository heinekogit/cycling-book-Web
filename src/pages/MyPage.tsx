import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getAccountId } from '../features/auth/account'
import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'
import { deleteOwnedRecord, getMyRoutes, getMyRuns, type MyRoute, type MyRun } from '../features/mypage/api'

type Tab = 'routes' | 'runs'

export function MyPage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const { formatDate, formatNumber, t } = useLocale()
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
  const dateLabel = (value: string | null) => value ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('route.dateNotSet')
  const distanceLabel = (value: number | null) => value == null ? t('mypage.distanceNotSet') : `${formatNumber(Number(value) / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
  const durationLabel = (value: number | null) => value == null ? t('mypage.durationNotSet') : t('mypage.minutes', { count: formatNumber(Math.round(Number(value) / 60)) })
  const routeTypeLabel = (route: MyRoute) => {
    if (route.origin === 'drawn' || route.route_type === 'planned' || route.route_type === 'manual' || (route.route_type === 'from_run' && route.origin === 'manual')) return t('route.typeDrawn')
    if (route.route_type === 'from_run' || route.source_run_id) return t('route.typeFromRun')
    return route.route_type || t('route.notSet')
  }

  const deleteRecord = async (type: 'routes' | 'runs', id: string | number) => {
    if (!accountId) return
    const label = type === 'routes' ? t('mypage.deleteRouteLabel') : t('mypage.deleteRunLabel')
    if (!window.confirm(t('mypage.deleteConfirm', { type: label }))) return
    setMessage(t('mypage.deleting'))
    try {
      await deleteOwnedRecord(type, id, accountId)
      if (type === 'routes') setRoutes((items) => items.filter((item) => String(item.id) !== String(id)))
      else setRuns((items) => items.filter((item) => String(item.id) !== String(id)))
      setMessage(t('mypage.deleted', { type: label }))
    } catch (error) {
      console.error(`${label}を削除できませんでした`, error)
      setMessage(t('mypage.deleteError', { type: label }))
    }
  }

  if (isAuthLoading) return <main className="mypage"><div className="state-panel">{t('explore.checkingLogin')}</div></main>
  if (!session) return <main className="mypage"><section className="state-panel"><p className="eyebrow">MEMBERS ONLY</p><h1>{t('mypage.loginRequired')}</h1><p>{t('mypage.loginDescription')}</p><Link className="button button-primary" to="/login?returnTo=/mypage">{t('mypage.loginAction')}</Link></section></main>

  return <main className="mypage">
    <section className="mypage-heading">
      <div><p className="eyebrow">MY CYCLING BOOK</p><h1>{t('mypage.title')}</h1><p>{session.user.email}</p></div>
      <div className="mypage-actions"><Link className="button button-primary" to="/routes/new">{t('mypage.createRoute')}</Link>{accountId && <Link className="button button-quiet" to={`/riders/${accountId}`}>{t('mypage.viewPublic')}</Link>}<Link className="button button-quiet" to="/profile">{t('mypage.profileSettings')}</Link></div>
    </section>

    <div className="mypage-summary" aria-label={t('mypage.summaryLabel')}><div><strong>{formatNumber(routes.length)}</strong><span>{t('mypage.routeCount')}</span></div><div><strong>{formatNumber(runs.length)}</strong><span>{t('mypage.runCount')}</span></div></div>
    {message && <div className="mypage-message" role="status">{message}</div>}
    <div className="mypage-tabs" role="tablist" aria-label={t('mypage.tabsLabel')}>
      <button type="button" role="tab" aria-selected={tab === 'routes'} className={tab === 'routes' ? 'active' : ''} onClick={() => changeTab('routes')}>{t('mypage.routesTab')}</button>
      <button type="button" role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'active' : ''} onClick={() => changeTab('runs')}>{t('mypage.runsTab')}</button>
    </div>

    {status === 'loading' && <div className="panel-loading mypage-loading">{t('mypage.loading')}</div>}
    {status === 'error' && <div className="state-panel state-error">{t('mypage.loadError')}</div>}
    {status === 'ready' && tab === 'routes' && <RecordList empty={t('mypage.routesEmpty')}>
      {routes.map((route) => <article className="record-card" key={route.id}>
        <Link className="record-main" to={`/routes/${route.id}`}><div className="record-title"><h2>{route.name || t('explore.untitled')}</h2><span className={route.is_public ? 'record-badge public' : 'record-badge private'}>{route.is_public ? t('route.public') : t('route.private')}</span></div><p>{dateLabel(route.created_at)}</p><div className="record-meta"><span>{distanceLabel(route.distance_m)}</span><span>{routeTypeLabel(route)}</span>{route.source_run_id && <span>{t('route.sourceRun', { id: route.source_run_id })}</span>}</div></Link>
        <button className="record-delete" type="button" onClick={() => void deleteRecord('routes', route.id)} aria-label={t('mypage.deleteAria', { name: route.name || t('explore.untitled') })}>{t('mypage.delete')}</button>
      </article>)}
    </RecordList>}
    {status === 'ready' && tab === 'runs' && <RecordList empty={t('mypage.runsEmpty')}>
      {runs.map((run) => <article className="record-card" key={run.id}>
        <Link className="record-main" to={`/runs/${run.id}`}><div className="record-title"><h2>{run.name || dateLabel(run.started_at || run.created_at)}</h2></div><p>{dateLabel(run.created_at || run.started_at)}</p><div className="record-meta"><span>{distanceLabel(run.distance_m)}</span><span>{durationLabel(run.duration_s)}</span></div></Link>
        <button className="record-delete" type="button" onClick={() => void deleteRecord('runs', run.id)} aria-label={t('mypage.deleteAria', { name: run.name || t('mypage.deleteRunLabel') })}>{t('mypage.delete')}</button>
      </article>)}
    </RecordList>}
  </main>
}

function RecordList({ children, empty }: { children: ReactNode; empty: string }) {
  const hasRecords = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="record-list" role="tabpanel">{hasRecords ? children : <div className="panel-muted">{empty}</div>}</section>
}
