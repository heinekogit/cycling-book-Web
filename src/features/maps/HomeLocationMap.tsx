import { divIcon, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useLocale } from '../i18n/LocaleProvider'

export type HomeLocation = { lat: number; lng: number }
const defaultLocation: HomeLocation = { lat: 35.681236, lng: 139.767125 }

function MapInteraction({ location, onChange }: { location: HomeLocation | null; onChange: (location: HomeLocation) => void }) {
  const map = useMap()
  useMapEvents({ click: (event: LeafletMouseEvent) => onChange({ lat: event.latlng.lat, lng: event.latlng.lng }) })
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], Math.max(map.getZoom(), 15))
  }, [location, map])
  return null
}

export function HomeLocationMap({ location, onChange }: { location: HomeLocation | null; onChange: (location: HomeLocation) => void }) {
  const { t } = useLocale()
  const markerRef = useRef<LeafletMarker>(null)
  const icon = useMemo(() => divIcon({ className: 'home-marker-shell', html: '<span class="home-marker-dot"></span>', iconSize: [30, 38], iconAnchor: [15, 36] }), [])
  const handlers = useMemo(() => ({ dragend: () => {
    const marker = markerRef.current
    if (marker) { const point = marker.getLatLng(); onChange({ lat: point.lat, lng: point.lng }) }
  } }), [onChange])

  return <div className="profile-map-wrap">
    <MapContainer className="profile-map" center={[location?.lat ?? defaultLocation.lat, location?.lng ?? defaultLocation.lng]} zoom={location ? 15 : 13} scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <MapInteraction location={location} onChange={onChange} />
      {location && <Marker ref={markerRef} position={[location.lat, location.lng]} draggable icon={icon} eventHandlers={handlers} />}
    </MapContainer>
    <div className="profile-map-help">{t('profileSettings.mapHelp')}</div>
  </div>
}
