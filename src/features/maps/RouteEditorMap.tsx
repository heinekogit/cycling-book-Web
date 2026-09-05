import { divIcon, latLngBounds, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import type { TrackPoint } from '../routes/geometry'

export type EditorTool = 'add' | 'move' | 'delete' | 'insert'

function MapActions({ controlPoints, routeLine, tool, onMapClick }: { controlPoints: TrackPoint[]; routeLine: TrackPoint[]; tool: EditorTool; onMapClick: (point: TrackPoint) => void }) {
  const map = useMap()
  useMapEvents({ click: (event: LeafletMouseEvent) => { if (tool === 'add' || tool === 'insert') onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng }) } })
  const hasFitted = useRef(false)
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

export function RouteEditorMap({ center, controlPoints, routeLine, tool, onAdd, onMove, onDelete, onInsert }: { center: TrackPoint; controlPoints: TrackPoint[]; routeLine: TrackPoint[]; tool: EditorTool; onAdd: (point: TrackPoint) => void; onMove: (index: number, point: TrackPoint) => void; onDelete: (index: number) => void; onInsert: (point: TrackPoint) => void }) {
  return <MapContainer className={`route-editor-map tool-${tool}`} center={[center.lat, center.lng]} zoom={13} scrollWheelZoom>
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
    {routeLine.length >= 2 && <Polyline positions={routeLine.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#3b82f6', weight: 6, opacity: .9 }} />}
    {controlPoints.map((point, index) => <ControlPointMarker key={`${index}-${point.lat}-${point.lng}`} point={point} index={index} tool={tool} onMove={onMove} onDelete={onDelete} />)}
    <MapActions controlPoints={controlPoints} routeLine={routeLine} tool={tool} onMapClick={tool === 'insert' ? onInsert : onAdd} />
  </MapContainer>
}
