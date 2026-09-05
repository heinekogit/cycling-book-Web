import { useEffect, useRef, useState } from 'react'

import { loadElevationProfile, type ElevationProfile } from './elevation'
import type { TrackPoint } from '../routes/geometry'
import { useLocale } from '../i18n/LocaleProvider'

function ElevationCanvas({ profile }: { profile: ElevationProfile }) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth; const height = canvas.clientHeight; const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d'); if (!context) return
      context.scale(ratio, ratio); context.clearRect(0, 0, width, height)
      const left = 44; const right = 14; const top = 16; const bottom = 28
      const plotWidth = width - left - right; const plotHeight = height - top - bottom
      const minimum = Math.min(0, profile.minimum); const range = Math.max(1, profile.maximum - minimum + 20)
      const totalDistance = profile.distances.at(-1) || 1
      const x = (index: number) => left + plotWidth * (profile.distances[index] / totalDistance)
      const y = (elevation: number) => top + plotHeight - plotHeight * ((elevation - minimum) / range)
      context.strokeStyle = '#dce5dc'; context.lineWidth = 1; context.fillStyle = '#748078'; context.font = '11px sans-serif'
      for (let index = 0; index <= 3; index += 1) {
        const elevation = minimum + range * index / 3; const vertical = y(elevation)
        context.beginPath(); context.moveTo(left, vertical); context.lineTo(width - right, vertical); context.stroke()
        context.fillText(`${Math.round(elevation)}m`, 2, vertical + 4)
      }
      const gradient = context.createLinearGradient(0, top, 0, height - bottom)
      gradient.addColorStop(0, 'rgba(43, 121, 80, .52)'); gradient.addColorStop(1, 'rgba(43, 121, 80, .08)')
      context.beginPath(); context.moveTo(left, height - bottom)
      profile.elevations.forEach((elevation, index) => context.lineTo(x(index), y(elevation)))
      context.lineTo(width - right, height - bottom); context.closePath(); context.fillStyle = gradient; context.fill()
      context.beginPath(); profile.elevations.forEach((elevation, index) => index ? context.lineTo(x(index), y(elevation)) : context.moveTo(x(index), y(elevation)))
      context.strokeStyle = '#2b7950'; context.lineWidth = 2.5; context.stroke()
      context.fillStyle = '#748078'; context.textAlign = 'left'; context.fillText('0 km', left, height - 8)
      context.textAlign = 'right'; context.fillText(`${(totalDistance / 1000).toFixed(1)} km`, width - right, height - 8)
    }
    draw()
    const observer = new ResizeObserver(draw); observer.observe(canvas)
    return () => observer.disconnect()
  }, [profile])
  return <canvas className="elevation-canvas" ref={canvasRef} role="img" aria-label={t('elevation.chartLabel', { min: profile.minimum, max: profile.maximum })} />
}

export function ElevationPanel({ points }: { points: TrackPoint[] }) {
  const { t } = useLocale()
  const [profile, setProfile] = useState<ElevationProfile | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  useEffect(() => {
    let isMounted = true
    void loadElevationProfile(points).then((result) => {
      if (!isMounted) return
      setProfile(result); setStatus(result ? 'ready' : 'unavailable')
    }).catch((error) => { console.warn('標高データを取得できませんでした', error); if (isMounted) setStatus('unavailable') })
    return () => { isMounted = false }
  }, [points])

  if (points.length < 2) return null
  return <section className="detail-section" aria-labelledby="elevation-title">
    <div className="detail-section-heading"><div><p className="eyebrow">ELEVATION</p><h2 id="elevation-title">{t('elevation.title')}</h2></div>
      {profile && <div className="elevation-stats"><span>{t('elevation.gain')} <strong>{profile.gain}m</strong></span><span>{t('elevation.loss')} <strong>{profile.loss}m</strong></span><span>{t('elevation.grade')} <strong>{profile.averageGrade.toFixed(1)}%</strong></span></div>}
    </div>
    {status === 'loading' && <div className="panel-loading">{t('elevation.loading')}</div>}
    {status === 'unavailable' && <div className="panel-muted">{t('elevation.unavailable')}</div>}
    {status === 'ready' && profile && <ElevationCanvas profile={profile} />}
  </section>
}
