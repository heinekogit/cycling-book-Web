import { divIcon, latLngBounds, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import type { TrackPoint } from '../routes/geometry'
import type { RouteMarker } from '../routes/markers'
import { RouteDirectionArrows } from './RouteDirectionArrows'
import { routePinIcon } from './routePinIcon'

export type EditorTool = 'add' | 'move' | 'delete' | 'insert' | 'marker'

function MapActions({ center, focusVersion, controlPoints, routeLine, tool, onAdd, onInsert, onInsertMiss, onAddMarker }: { center: TrackPoint; focusVersion: number; controlPoints: TrackPoint[]; routeLine: TrackPoint[]; tool: EditorTool; onAdd: (point: TrackPoint) => void; onInsert: (point: TrackPoint, routeSegmentIndex: number) => void; onInsertMiss: () => void; onAddMarker: (point: TrackPoint) => void }) {
  const map = useMap()
  useMapEvents({ click: (event: LeafletMouseEvent) => {
    if (tool === 'add') { onAdd({ lat: event.latlng.lat, lng: event.latlng.lng }); return }
    if (tool === 'marker') { onAddMarker({ lat: event.latlng.lat, lng: event.latlng.lng }); return }
    if (tool !== 'insert') return
    const clicked = map.latLngToContainerPoint(event.latlng)
    let nearest: { distance: number; point: TrackPoint; segmentIndex: number } | null = null
    for (let segmentIndex = 0; segmentIndex < routeLine.length - 1; segmentIndex += 1) {
      const first = routeLine[segmentIndex]
      const second = routeLine[segmentIndex + 1]
      const start = map.latLngToContainerPoint([first.lat, first.lng])
      const end = map.latLngToContainerPoint([second.lat, second.lng])
      const dx = end.x - start.x; const dy = end.y - start.y
      const ratio = dx || dy ? Math.max(0, Math.min(1, ((clicked.x - start.x) * dx + (clicked.y - start.y) * dy) / (dx * dx + dy * dy))) : 0
      const projectedX = start.x + ratio * dx; const projectedY = start.y + ratio * dy
      const distance = Math.hypot(clicked.x - projectedX, clicked.y - projectedY)
      if (!nearest || distance < nearest.distance) nearest = { distance, point: { lat: first.lat + ratio * (second.lat - first.lat), lng: first.lng + ratio * (second.lng - first.lng) }, segmentIndex }
    }
    if (!nearest || nearest.distance > 24) { onInsertMiss(); return }
    onInsert(nearest.point, nearest.segmentIndex)
  } })
  const hasFitted = useRef(false)
  useEffect(() => {
    if (controlPoints.length || routeLine.length) return
    map.setView([center.lat, center.lng], 13)
  }, [center.lat, center.lng, controlPoints.length, map, routeLine.length])
  useEffect(() => {
    if (!focusVersion) return
    map.setView([center.lat, center.lng], 13)
  }, [center.lat, center.lng, focusVersion, map])
  useEffect(() => {
    if (hasFitted.current || !routeLine.length) return
    const bounds = latLngBounds(routeLine.map((point) => [point.lat, point.lng]))
    if (bounds.isValid()) { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }); hasFitted.current = true }
  }, [map, routeLine])
  useEffect(() => { if (!controlPoints.length) hasFitted.current = false }, [controlPoints.length])
  return null
}

function ControlPointMarker({ point, index, tool, onMove, onDelete }: { point: TrackPoint; index: number; tool: EditorTool; onMove: (index: number, point: TrackPoint) => void; onDelete: (index: number) => void }) {
  const markerRef = useRef<LeafletMarker>(null)
  const color = tool === 'delete' ? '#dc5638' : tool === 'insert' ? '#d59622' : '#3b82f6'
  const icon = useMemo(() => divIcon({ className: 'editor-marker-shell', html: `<span class="editor-marker-dot" style="background:${color}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] }), [color])
  return <Marker ref={markerRef} position={[point.lat, point.lng]} icon={icon} draggable={tool === 'move'} eventHandlers={{
    dragend: () => { const marker = markerRef.current; if (marker) { const next = marker.getLatLng(); onMove(index, { lat: next.lat, lng: next.lng }) } },
    click: () => { if (tool === 'delete') onDelete(index) },
  }} />
}

export function RouteEditorMap({ center, focusVersion = 0, controlPoints, routeLine, tool, onAdd, onMove, onDelete, onInsert, onInsertMiss, markers = [], onAddMarker = () => {}, onSelectMarker = () => {}, onMoveMarker = () => true, privacyZone }: { center: TrackPoint; focusVersion?: number; controlPoints: TrackPoint[]; routeLine: TrackPoint[]; tool: EditorTool; onAdd: (point: TrackPoint) => void; onMove: (index: number, point: TrackPoint) => void; onDelete: (index: number) => void; onInsert: (point: TrackPoint, routeSegmentIndex: number) => void; onInsertMiss: () => void; markers?: RouteMarker[]; onAddMarker?: (point: TrackPoint) => void; onSelectMarker?: (id: string) => void; onMoveMarker?: (id: string, point: TrackPoint) => boolean; privacyZone?: { center: TrackPoint; radius: number } }) {
  return <MapContainer className={`route-editor-map tool-${tool}`} center={[center.lat, center.lng]} zoom={13} scrollWheelZoom>
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
    {routeLine.length >= 2 && <Polyline positions={routeLine.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#3b82f6', weight: 6, opacity: .9 }} />}
    {privacyZone && <Circle center={[privacyZone.center.lat, privacyZone.center.lng]} radius={privacyZone.radius} interactive={false} pathOptions={{ color: '#dc2626', weight: 3, fillColor: '#ef4444', fillOpacity: .13, dashArray: '8 7' }} />}
    {routeLine.length >= 2 && <RouteDirectionArrows segments={[routeLine]} />}
    {controlPoints.map((point, index) => <ControlPointMarker key={`${index}-${point.lat}-${point.lng}`} point={point} index={index} tool={tool} onMove={onMove} onDelete={onDelete} />)}
    {markers.map((marker) => <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={routePinIcon} draggable={tool === 'marker'} eventHandlers={{ click: () => onSelectMarker(marker.id), dragend: (event) => { const point = event.target.getLatLng(); if (!onMoveMarker(marker.id, { lat: point.lat, lng: point.lng })) event.target.setLatLng([marker.lat, marker.lng]) } }} />)}
    <MapActions center={center} focusVersion={focusVersion} controlPoints={controlPoints} routeLine={routeLine} tool={tool} onAdd={onAdd} onInsert={onInsert} onInsertMiss={onInsertMiss} onAddMarker={onAddMarker} />
  </MapContainer>
}
