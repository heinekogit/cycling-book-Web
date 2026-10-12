import { latLngBounds, type LeafletMouseEvent } from 'leaflet'
import { useEffect, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import type { RoutePhoto } from '../routes/api'
import type { RouteMarker } from '../routes/markers'
import { nearestDistanceAlongTrack, pointAtTrackDistance, splitRouteSegments, type TrackPoint } from '../routes/geometry'
import { useLocale } from '../i18n/LocaleProvider'
import { RouteDirectionArrows } from './RouteDirectionArrows'
import { routePinIcon } from './routePinIcon'

function FitRoute({ points }: { points: TrackPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = latLngBounds(points.map((point) => [point.lat, point.lng]))
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 })
  }, [map, points])
  return null
}

export function RouteMap({ points, photos = [], markers = [], trackColor = '#3b82f6', emptyLabel, showDirectionArrows = false, splitOnGaps = false, privacyZone, activeDistanceM = null, onActiveDistanceChange }: { points: TrackPoint[]; photos?: RoutePhoto[]; markers?: RouteMarker[]; trackColor?: string; emptyLabel?: string; showDirectionArrows?: boolean; splitOnGaps?: boolean; privacyZone?: { center: TrackPoint; radius: number }; activeDistanceM?: number | null; onActiveDistanceChange?: (distance: number | null) => void }) {
  const { t } = useLocale()
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)
  const segments = splitOnGaps || points.some((point) => point.segmentStart) ? splitRouteSegments(points) : points.length >= 2 ? [points] : []
  const activePoint = activeDistanceM == null ? null : pointAtTrackDistance(points, activeDistanceM)
  const selectNearest = (event: LeafletMouseEvent) => onActiveDistanceChange?.(nearestDistanceAlongTrack({ lat: event.latlng.lat, lng: event.latlng.lng }, points))
  const locatedPhotos = photos.filter((photo) => !photo.marker_id && Number.isFinite(Number(photo.lat)) && Number.isFinite(Number(photo.lng)))
  return <div className="route-map-wrap">
    <MapContainer className="route-map" center={[35.681236, 139.767125]} zoom={12} scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      {segments.map((segment, index) => <Polyline key={index} positions={segment.map((point) => [point.lat, point.lng])} pathOptions={{ color: trackColor, weight: 6, opacity: .92 }} />)}
      {onActiveDistanceChange && segments.map((segment, index) => <Polyline key={`hit-${index}`} positions={segment.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#000', weight: 24, opacity: 0 }} eventHandlers={{ mousemove: selectNearest, mouseout: () => onActiveDistanceChange(null), click: selectNearest }} />)}
      {privacyZone && <Circle center={[privacyZone.center.lat, privacyZone.center.lng]} radius={privacyZone.radius} pathOptions={{ color: '#dc2626', weight: 3, fillColor: '#ef4444', fillOpacity: .16, dashArray: '8 7' }} />}
      {showDirectionArrows && <RouteDirectionArrows segments={segments} />}
      {activePoint && <CircleMarker center={[activePoint.lat, activePoint.lng]} radius={9} interactive={false} pathOptions={{ color: '#fff', weight: 4, fillColor: trackColor, fillOpacity: 1 }} />}
      {locatedPhotos.map((photo) => <CircleMarker key={photo.id} center={[Number(photo.lat), Number(photo.lng)]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ef6d3f', fillOpacity: 1 }}>
        <Popup><a className="map-photo-popup" href={photo.image_url} target="_blank" rel="noreferrer"><img src={photo.thumb_url || photo.image_url} alt={t('map.routePhoto')} /><span>{t('map.openPhoto')}</span></a></Popup>
      </CircleMarker>)}
      {markers.map((marker) => <Marker key={`marker-${marker.id}`} position={[marker.lat, marker.lng]} icon={routePinIcon}>
        <Popup><div className="route-marker-popup">{marker.comment && <p>{marker.comment}</p>}{marker.photos.length > 0 && <div className="route-marker-popup-photos">{marker.photos.map((photo) => <button key={photo.id} type="button" onClick={() => setExpandedPhoto(photo.imageUrl)}><img src={photo.thumbUrl} alt="マーカーの写真を拡大" /></button>)}</div>}</div></Popup>
      </Marker>)}
      <FitRoute points={points} />
    </MapContainer>
    {expandedPhoto && <div className="route-marker-lightbox" role="presentation" onClick={() => setExpandedPhoto(null)}><button type="button" aria-label="写真を閉じる" onClick={() => setExpandedPhoto(null)}>×</button><img src={expandedPhoto} alt="マーカーの写真" /></div>}
    {points.length < 2 && <div className="map-empty">{emptyLabel || t('map.empty')}</div>}
  </div>
}
