import type { RoutePhoto } from '../routes/api'
import { useLocale } from '../i18n/LocaleProvider'

export function RoutePhotos({ photos }: { photos: RoutePhoto[] }) {
  const { formatDate, t } = useLocale()
  const formatTakenAt = (value: string | null) => value
    ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })
    : t('photos.unknownDate')
  return <section className="detail-section" aria-labelledby="photos-title">
    <div className="detail-section-heading"><div><p className="eyebrow">{t('photos.eyebrow')}</p><h2 id="photos-title">{t('photos.title')}</h2></div><span className="photo-count">{t('photos.count', { count: photos.length })}</span></div>
    {photos.length === 0 ? <div className="panel-muted">{t('photos.empty')}</div> : <div className="photo-grid">
      {photos.map((photo) => <a className="photo-card" href={photo.image_url} target="_blank" rel="noreferrer" key={photo.id}>
        <img src={photo.thumb_url || photo.image_url} alt={t('photos.alt', { date: formatTakenAt(photo.taken_at) })} loading="lazy" />
        <span>{formatTakenAt(photo.taken_at)}</span>
      </a>)}
    </div>}
  </section>
}
