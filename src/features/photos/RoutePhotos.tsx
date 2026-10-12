import type { RoutePhoto } from '../routes/api'
import { useLocale } from '../i18n/LocaleProvider'
import { Link } from 'react-router-dom'

export function RoutePhotos({ photos, routeId }: { photos: RoutePhoto[]; routeId?: string | number | null }) {
  const { formatDate, t } = useLocale()
  const formatTakenAt = (value: string | null) => value
    ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })
    : t('photos.unknownDate')
  return <section className="detail-section" aria-labelledby="photos-title">
    <div className="detail-section-heading"><div><p className="eyebrow">{t('photos.eyebrow')}</p><h2 id="photos-title">{t('photos.title')}</h2></div><div className="photo-heading-actions"><span className="photo-count">{t('photos.count', { count: photos.length })}</span>{routeId != null && photos.length > 0 && <Link className="button button-quiet" to={`/routes/${routeId}/photos`}>{t('photos.viewAll')}</Link>}</div></div>
    {photos.length === 0 ? <div className="panel-muted">{t('photos.empty')}</div> : <div className="photo-grid">
      {photos.map((photo) => <Link className="photo-card" to={routeId == null ? photo.image_url : `/routes/${routeId}/photos?photo=${encodeURIComponent(String(photo.id))}`} key={photo.id}>
        <img src={photo.thumb_url || photo.image_url} alt={t('photos.alt', { date: formatTakenAt(photo.taken_at) })} loading="lazy" />
        <span>{formatTakenAt(photo.taken_at)}</span>
      </Link>)}
    </div>}
  </section>
}
