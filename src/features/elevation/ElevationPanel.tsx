import { useEffect, useRef, useState } from 'react'

import { elevationProfileFromRecord, loadElevationProfile, type ElevationProfile, type ElevationRecord, type ElevationSource } from './elevation'
import type { TrackPoint } from '../routes/geometry'
import { useLocale } from '../i18n/LocaleProvider'

function ElevationCanvas({ profile, activeDistanceM, onActiveDistanceChange }: { profile: ElevationProfile; activeDistanceM: number | null; onActiveDistanceChange?: (distance: number | null) => void }) {
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
      if (activeDistanceM != null) {
        const distance = Math.max(0, Math.min(totalDistance, activeDistanceM))
        let rightIndex = profile.distances.findIndex((item) => item >= distance)
        if (rightIndex < 0) rightIndex = profile.distances.length - 1
        const leftIndex = Math.max(0, rightIndex - 1)
        const span = profile.distances[rightIndex] - profile.distances[leftIndex]
        const fraction = span > 0 ? (distance - profile.distances[leftIndex]) / span : 0
        const elevation = profile.elevations[leftIndex] + (profile.elevations[rightIndex] - profile.elevations[leftIndex]) * fraction
        const horizontal = left + plotWidth * distance / totalDistance
        const vertical = y(elevation)
        context.beginPath(); context.moveTo(horizontal, top); context.lineTo(horizontal, height - bottom)
        context.strokeStyle = '#173f2b'; context.lineWidth = 1.5; context.stroke()
        context.beginPath(); context.arc(horizontal, vertical, 5, 0, Math.PI * 2)
        context.fillStyle = '#fff'; context.fill(); context.strokeStyle = '#173f2b'; context.lineWidth = 3; context.stroke()
        const label = `${(distance / 1000).toFixed(2)} km  ${Math.round(elevation)}m`
        context.font = 'bold 11px sans-serif'; const labelWidth = context.measureText(label).width + 14
        const labelX = Math.max(left, Math.min(width - right - labelWidth, horizontal - labelWidth / 2))
        context.fillStyle = 'rgba(23,63,43,.94)'; context.fillRect(labelX, top, labelWidth, 24)
        context.fillStyle = '#fff'; context.textAlign = 'center'; context.fillText(label, labelX + labelWidth / 2, top + 16)
      }
    }
    draw()
    const observer = new ResizeObserver(draw); observer.observe(canvas)
    return () => observer.disconnect()
  }, [activeDistanceM, profile])
  const selectDistance = (clientX: number) => {
    const canvas = canvasRef.current; if (!canvas || !onActiveDistanceChange) return
    const bounds = canvas.getBoundingClientRect(); const left = 44; const right = 14
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left - left) / Math.max(1, bounds.width - left - right)))
    onActiveDistanceChange((profile.distances.at(-1) ?? 0) * ratio)
  }
  return <canvas className="elevation-canvas elevation-canvas-interactive" ref={canvasRef} role="img" aria-label={t('elevation.chartLabel', { min: profile.minimum, max: profile.maximum })} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); selectDistance(event.clientX) }} onPointerMove={(event) => { if (event.pointerType === 'mouse' || event.currentTarget.hasPointerCapture(event.pointerId)) selectDistance(event.clientX) }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} onPointerLeave={(event) => { if (event.pointerType === 'mouse') onActiveDistanceChange?.(null) }} />
}

export function ElevationPanel({ points, record, onProfileResolved, activeDistanceM = null, onActiveDistanceChange }: { points: TrackPoint[]; record?: ElevationRecord | null; onProfileResolved?: (profile: ElevationProfile, source: ElevationSource) => void | Promise<void>; activeDistanceM?: number | null; onActiveDistanceChange?: (distance: number | null) => void }) {
  const { t } = useLocale()
  const storedProfile = elevationProfileFromRecord(record)
  const [loaded, setLoaded] = useState<{ profile: ElevationProfile; source: ElevationSource } | false | null>(null)
  const profile = storedProfile ?? (loaded ? loaded.profile : null)
  const source = record?.elevation_source ?? (loaded ? loaded.source : null)
  useEffect(() => {
    let isMounted = true
    if (storedProfile || points.length < 2) return () => { isMounted = false }
    void loadElevationProfile(points).then((result) => {
      if (!isMounted) return
      setLoaded(result ?? false)
    }).catch((error) => { console.warn('標高データを取得できませんでした', error); if (isMounted) setLoaded(false) })
    return () => { isMounted = false }
  }, [points, storedProfile])

  useEffect(() => {
    if (storedProfile || !loaded || !onProfileResolved) return
    void Promise.resolve(onProfileResolved(loaded.profile, loaded.source)).catch((error) => console.warn('標高データを保存できませんでした', error))
  }, [loaded, onProfileResolved, storedProfile])

  if (points.length < 2) return null
  return <section className="detail-section" aria-labelledby="elevation-title">
    <div className="detail-section-heading"><div><p className="eyebrow">ELEVATION</p><h2 id="elevation-title">{t('elevation.title')}</h2></div>
      {profile && <div className="elevation-stats"><span>{t('elevation.gain')} <strong>{profile.gain}m</strong></span><span>{t('elevation.loss')} <strong>{profile.loss}m</strong></span><span>{t('elevation.grade')} <strong>{profile.averageGrade.toFixed(1)}%</strong></span></div>}
    </div>
    {!profile && loaded !== false && <div className="panel-loading">{t('elevation.loading')}</div>}
    {!profile && loaded === false && <div className="panel-muted">{t('elevation.unavailable')}</div>}
    {profile && <><ElevationCanvas profile={profile} activeDistanceM={activeDistanceM} onActiveDistanceChange={onActiveDistanceChange} />{source === 'api' && <p className="elevation-attribution">Elevation data: Copernicus DEM via Open-Meteo.com</p>}</>}
  </section>
}
