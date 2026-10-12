import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAccount } from '../features/accounts/AccountProvider'
import { useAuth } from '../features/auth/AuthProvider'
import { ElevationPanel } from '../features/elevation/ElevationPanel'
import { importGpxAsRoute, importGpxAsRun } from '../features/gpx/api'
import { parseGpx, type ParsedGpx } from '../features/gpx/gpx'
import { useLocale } from '../features/i18n/LocaleProvider'
import { RouteMap } from '../features/maps/RouteMap'

type ImportTarget = 'route' | 'run'

export function GpxImportPage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const { activeAccount, activeAccountId, isLoading: isAccountLoading } = useAccount()
  const { formatDate, formatNumber, t } = useLocale()
  const navigate = useNavigate()
  const [gpx, setGpx] = useState<ParsedGpx | null>(null)
  const [fileName, setFileName] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState<ImportTarget>('route')
  const [status, setStatus] = useState<'idle' | 'reading' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setStatus('reading'); setMessage('')
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(t('gpx.tooLarge'))
      const parsed = parseGpx(await file.text(), file.name.replace(/\.gpx$/i, ''))
      setGpx(parsed); setFileName(file.name); setName(parsed.name); setStatus('idle')
    } catch (error) {
      setGpx(null); setStatus('error'); setMessage(error instanceof Error ? error.message : t('gpx.readError'))
    }
  }

  const save = async () => {
    if (!gpx || !activeAccountId) return
    if (target === 'run' && activeAccount?.accountType !== 'personal') { setStatus('error'); setMessage(t('gpx.runPersonalOnly')); return }
    setStatus('saving'); setMessage('')
    try {
      const savedName = name.trim() || fileName.replace(/\.gpx$/i, '') || t('gpx.defaultName')
      if (target === 'run') {
        const id = await importGpxAsRun(gpx, activeAccountId, savedName)
        navigate(`/runs/${id}`, { replace: true })
      } else {
        const id = await importGpxAsRoute(gpx, activeAccountId, savedName)
        navigate(`/routes/${id}`, { replace: true })
      }
    } catch (error) {
      console.error('GPXを保存できませんでした', error)
      setStatus('error'); setMessage(`${t('gpx.saveError')} ${error instanceof Error ? error.message : ''}`.trim())
    }
  }

  if (isAuthLoading || isAccountLoading) return <main className="gpx-import-page"><div className="state-panel">{t('explore.checkingLogin')}</div></main>
  if (!session) return <main className="gpx-import-page"><section className="state-panel"><h1>{t('mypage.loginRequired')}</h1><Link className="button button-primary" to="/login?returnTo=/import/gpx">{t('mypage.loginAction')}</Link></section></main>

  return <main className="gpx-import-page">
    <header className="gpx-import-heading"><div><p className="eyebrow">GPX IMPORT</p><h1>{t('gpx.title')}</h1><p>{t('gpx.description')}</p></div><Link className="button button-quiet" to="/mypage">{t('gpx.back')}</Link></header>
    <section className="gpx-import-card">
      <label className="gpx-file-picker"><strong>{gpx ? fileName : t('gpx.choose')}</strong><span>{t('gpx.fileHelp')}</span><input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(event) => void readFile(event.target.files?.[0])} /></label>
      {status === 'reading' && <div className="panel-loading">{t('gpx.reading')}</div>}
      {message && <div className="state-panel state-error" role="alert">{message}</div>}
      {gpx && <>
        <RouteMap points={gpx.points} splitOnGaps />
        <ElevationPanel points={gpx.points} />
        <dl className="detail-facts detail-facts-four gpx-facts">
          <div><dt>{t('route.distance')}</dt><dd>{formatNumber(gpx.distanceM / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</dd></div>
          <div><dt>{t('gpx.points')}</dt><dd>{formatNumber(gpx.points.length)}</dd></div>
          <div><dt>{t('gpx.startedAt')}</dt><dd>{gpx.startedAt ? formatDate(gpx.startedAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('route.notSet')}</dd></div>
          <div><dt>{t('gpx.elevation')}</dt><dd>{formatNumber(gpx.elevationCount)} / {formatNumber(gpx.points.length)}</dd></div>
        </dl>
        <div className="gpx-import-settings">
          <label><span>{t('gpx.name')}</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
          <fieldset><legend>{t('gpx.saveAs')}</legend><label><input type="radio" name="gpx-target" checked={target === 'route'} onChange={() => setTarget('route')} /><span><strong>{t('gpx.asRoute')}</strong><small>{t('gpx.asRouteHelp')}</small></span></label><label className={activeAccount?.accountType !== 'personal' ? 'disabled' : ''}><input type="radio" name="gpx-target" checked={target === 'run'} disabled={activeAccount?.accountType !== 'personal'} onChange={() => setTarget('run')} /><span><strong>{t('gpx.asRun')}</strong><small>{t('gpx.asRunHelp')}</small></span></label></fieldset>
          <div className="gpx-import-actions"><button className="button button-primary" type="button" disabled={status === 'saving' || (target === 'run' && activeAccount?.accountType !== 'personal')} onClick={() => void save()}>{status === 'saving' ? t('gpx.saving') : t('gpx.save')}</button></div>
        </div>
      </>}
    </section>
  </main>
}
