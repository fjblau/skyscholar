import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_ZOOM = 8

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function popup(html) {
  return `<div style="font-size:0.8rem;line-height:1.4">${html}</div>`
}

export default function ReversePredictResultMap({ result, height = 360 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  const targetLat = num(result?.target_landing_lat)
  const targetLon = num(result?.target_landing_lon)
  const launchLat = num(result?.recommended_launch_lat)
  const launchLon = num(result?.recommended_launch_lon)
  const landingLat = num(result?.predicted_landing_lat)
  const landingLon = num(result?.predicted_landing_lon)
  const history = Array.isArray(result?.history) ? result.history : []

  useEffect(() => {
    if (!containerRef.current) return
    if (targetLat == null || targetLon == null) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current).setView([targetLat, targetLon], DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map)

    const bounds = []

    // Iteration launch guesses: small grey dots connected by a dashed path
    // to visualise the fixed-point convergence.
    const iterLaunchPoints = []
    for (const h of history) {
      const la = num(h.launch_lat)
      const lo = num(h.launch_lon)
      if (la == null || lo == null) continue
      iterLaunchPoints.push([la, lo])
      L.circleMarker([la, lo], {
        radius: 4,
        color: '#6b7280',
        fillColor: '#9ca3af',
        fillOpacity: 0.9,
        weight: 1,
      }).addTo(map).bindPopup(popup(
        `<strong>Iter ${h.iter} launch guess</strong><br>` +
        `${la.toFixed(5)}, ${lo.toFixed(5)}` +
        (h.error_km != null ? `<br>residual: ${h.error_km} km` : '')
      ))
      bounds.push([la, lo])
    }
    if (iterLaunchPoints.length >= 2) {
      L.polyline(iterLaunchPoints, {
        color: '#9ca3af', weight: 1.5, dashArray: '4 4', opacity: 0.7,
      }).addTo(map)
    }

    // Recommended launch -> predicted landing: the predicted trajectory.
    if (launchLat != null && launchLon != null && landingLat != null && landingLon != null) {
      L.polyline([[launchLat, launchLon], [landingLat, landingLon]], {
        color: '#2563eb', weight: 2.5, opacity: 0.9,
      }).addTo(map).bindPopup(popup(
        '<strong>Predicted trajectory</strong><br>' +
        'recommended launch &rarr; predicted landing'
      ))
    }

    // Residual: predicted landing -> target (dashed red).
    if (landingLat != null && landingLon != null) {
      L.polyline([[landingLat, landingLon], [targetLat, targetLon]], {
        color: '#dc2626', weight: 1.5, dashArray: '6 4', opacity: 0.7,
      }).addTo(map)
    }

    // Recommended launch (green).
    if (launchLat != null && launchLon != null) {
      L.circleMarker([launchLat, launchLon], {
        radius: 7, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 2,
      }).addTo(map).bindPopup(popup(
        '<strong>Recommended launch</strong><br>' +
        `${launchLat.toFixed(5)}, ${launchLon.toFixed(5)}`
      ))
      bounds.push([launchLat, launchLon])
    }

    // Predicted landing (amber).
    if (landingLat != null && landingLon != null) {
      L.circleMarker([landingLat, landingLon], {
        radius: 7, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 1, weight: 2,
      }).addTo(map).bindPopup(popup(
        '<strong>Predicted landing</strong><br>' +
        `${landingLat.toFixed(5)}, ${landingLon.toFixed(5)}` +
        (result?.residual_km != null ? `<br>residual: ${result.residual_km} km` : '')
      ))
      bounds.push([landingLat, landingLon])
    }

    // Target landing (red) — the goal.
    L.circleMarker([targetLat, targetLon], {
      radius: 8, color: '#7f1d1d', fillColor: '#ef4444', fillOpacity: 1, weight: 2,
    }).addTo(map).bindPopup(popup(
      '<strong>Target landing</strong><br>' +
      `${targetLat.toFixed(5)}, ${targetLon.toFixed(5)}`
    )).openPopup()
    bounds.push([targetLat, targetLon])

    if (bounds.length >= 2) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28] })
    }

    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div
      ref={containerRef}
      className="admin-result-map"
      style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  )
}
