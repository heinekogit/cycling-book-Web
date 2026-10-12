import { divIcon } from 'leaflet'

export const routePinIcon = divIcon({
  className: 'route-pin-icon',
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -30],
})
