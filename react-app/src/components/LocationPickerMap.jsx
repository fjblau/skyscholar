import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [47.8095, 13.0550]
const DEFAULT_ZOOM = 6

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5" stroke-linejoin="round"><path d="M12 22s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/></svg>'

const pinIcon = L.divIcon({
  className: 'location-picker-pin',
  html: PIN_SVG,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

function isNum(v) {
  return v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v))
}

export default function LocationPickerMap({ lat, lon, onChange, height = 280 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  function placeMarker(map, latVal, lonVal) {
    const latlng = [Number(latVal), Number(lonVal)]
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng)
    } else {
      const m = L.marker(latlng, { draggable: true, icon: pinIcon }).addTo(map)
      m.on('dragend', (e) => {
        const p = e.target.getLatLng()
        onChangeRef.current(p.lat, p.lng)
      })
      markerRef.current = m
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    const initialCenter = (isNum(lat) && isNum(lon))
      ? [Number(lat), Number(lon)]
      : DEFAULT_CENTER
    const map = L.map(containerRef.current).setView(initialCenter, DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map)

    if (isNum(lat) && isNum(lon)) {
      placeMarker(map, lat, lon)
    }

    map.on('click', (e) => {
      placeMarker(map, e.latlng.lat, e.latlng.lng)
      onChangeRef.current(e.latlng.lat, e.latlng.lng)
    })

    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (isNum(lat) && isNum(lon)) {
      placeMarker(map, lat, lon)
      map.panTo([Number(lat), Number(lon)], { animate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon])

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  )
}
