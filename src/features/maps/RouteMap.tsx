import { latLngBounds } from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import type { RoutePhoto } from '../routes/api'
import { splitRouteSegments, type TrackPoint } from '../routes/geometry'
import { useLocale } from '../i18n/LocaleProvider'

function FitRoute({ points }: { points: TrackPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = latLngBounds(points.map((point) => [point.lat, point.lng]))
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 })
  }, [map, points])
  return null
}

export function RouteMap({ points, photos = [], trackColor = '#3b82f6', emptyLabel }: { points: TrackPoint[]; photos?: RoutePhoto[]; trackColor?: string; emptyLabel?: string }) {
  const { t } = useLocale()
  const segments = splitRouteSegments(points)
  const locatedPhotos = photos.filter((photo) => Number.isFinite(Number(photo.lat)) && Number.isFinite(Number(photo.lng)))
  return <div className="route-map-wrap">
    <MapContainer className="route-map" center={[35.681236, 139.767125]} zoom={12} scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      {segments.map((segment, index) => <Polyline key={index} positions={segment.map((point) => [point.lat, point.lng])} pathOptions={{ color: trackColor, weight: 6, opacity: .92 }} />)}
      {locatedPhotos.map((photo) => <CircleMarker key={photo.id} center={[Number(photo.lat), Number(photo.lng)]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ef6d3f', fillOpacity: 1 }}>
        <Popup><a className="map-photo-popup" href={photo.image_url} target="_blank" rel="noreferrer"><img src={photo.thumb_url || photo.image_url} alt={t('map.routePhoto')} /><span>{t('map.openPhoto')}</span></a></Popup>
      </CircleMarker>)}
      <FitRoute points={points} />
    </MapContainer>
    {points.length < 2 && <div className="map-empty">{emptyLabel || t('map.empty')}</div>}
  </div>
}
