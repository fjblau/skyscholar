import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { generateFlightReport } from '../flightReport'

const STATUSES = ['planned','launching','ascending','descending','landed','recovered','aborted']
const STATUS_BADGE = {
  planned: 'gray', launching: 'blue', ascending: 'blue',
  descending: 'orange', landed: 'green', recovered: 'green', aborted: 'red',
}

const EMPTY_FORM = {
  flight_id: '', status: 'planned',
  launch_time: '', burst_altitude_m: '',
  ascent_rate_mps: '', descent_rate_mps: '', max_altitude_m: '',
  launch_lat: '', launch_lon: '', launch_alt_m: '',
  notes: '',
}

function FlightModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v) => (v !== '' ? parseFloat(v) : undefined)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await onSave({
        flight_id: form.flight_id,
        status: form.status,
        launch_time: form.launch_time || undefined,
        burst_altitude_m: num(form.burst_altitude_m),
        ascent_rate_mps: num(form.ascent_rate_mps),
        descent_rate_mps: num(form.descent_rate_mps),
        max_altitude_m: num(form.max_altitude_m),
        launch_lat: num(form.launch_lat),
        launch_lon: num(form.launch_lon),
        launch_alt_m: num(form.launch_alt_m),
        notes: form.notes || undefined,
        payload_schema_ids: [],
      })
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? 'Edit Flight' : 'Create Flight'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Flight ID *</label>
              <input required value={form.flight_id} onChange={(e) => set('flight_id', e.target.value)}
                placeholder="e.g. FLT-2026-001" disabled={!!initial} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Launch Time (UTC)</label>
              <input type="datetime-local" value={form.launch_time}
                onChange={(e) => set('launch_time', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Ascent Rate (m/s)</label>
              <input type="number" step="any" value={form.ascent_rate_mps}
                onChange={(e) => set('ascent_rate_mps', e.target.value)} placeholder="e.g. 5.0" />
            </div>
            <div className="form-group">
              <label>Burst Altitude (m)</label>
              <input type="number" step="any" value={form.burst_altitude_m}
                onChange={(e) => set('burst_altitude_m', e.target.value)} placeholder="e.g. 30000" />
            </div>
            <div className="form-group">
              <label>Descent Rate (m/s)</label>
              <input type="number" step="any" value={form.descent_rate_mps}
                onChange={(e) => set('descent_rate_mps', e.target.value)} placeholder="e.g. 6.0" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Launch Lat</label>
              <input type="number" step="any" value={form.launch_lat}
                onChange={(e) => set('launch_lat', e.target.value)} placeholder="e.g. 47.81" />
            </div>
            <div className="form-group">
              <label>Launch Lon</label>
              <input type="number" step="any" value={form.launch_lon}
                onChange={(e) => set('launch_lon', e.target.value)} placeholder="e.g. 13.05" />
            </div>
            <div className="form-group">
              <label>Launch Alt (m)</label>
              <input type="number" step="any" value={form.launch_alt_m}
                onChange={(e) => set('launch_alt_m', e.target.value)} placeholder="e.g. 425" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TrajectoryMap({ points, burst, landing }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !points || points.length === 0) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map)

    const latlngs = points.map((p) => [p.lat, p.lon])
    const polyline = L.polyline(latlngs, { color: '#3b82f6', weight: 2.5 }).addTo(map)

    const launchIcon = L.circleMarker([points[0].lat, points[0].lon], {
      radius: 7, color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2,
    }).addTo(map)
    launchIcon.bindPopup(`<strong>Launch</strong><br>${points[0].lat.toFixed(4)}, ${points[0].lon.toFixed(4)}`)

    if (burst) {
      L.circleMarker([burst.lat, burst.lon], {
        radius: 7, color: '#7e22ce', fillColor: '#a855f7', fillOpacity: 1, weight: 2,
      }).addTo(map).bindPopup(`<strong>Burst</strong><br>${burst.alt_m?.toLocaleString()} m<br>${burst.lat.toFixed(4)}, ${burst.lon.toFixed(4)}`)
    }

    if (landing) {
      L.circleMarker([landing.lat, landing.lon], {
        radius: 7, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1, weight: 2,
      }).addTo(map).bindPopup(`<strong>Landing</strong><br>${landing.lat.toFixed(4)}, ${landing.lon.toFixed(4)}`)
    }

    map.fitBounds(polyline.getBounds(), { padding: [24, 24] })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [points, burst, landing])

  return (
    <div ref={containerRef} style={{ height: 360, width: '100%', borderRadius: 8, marginBottom: 12 }} />
  )
}

function TrajectoryPanel({ flightId, onClose }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.flights.predictTrajectory(flightId)
      .then(setResult)
      .catch((e) => setErr(e.message || 'Prediction failed'))
      .finally(() => setLoading(false))
  }, [flightId])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Trajectory Prediction · {flightId}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loading && <div className="loading">Running prediction…</div>}
        {err && <div className="alert error">{err}</div>}
        {!loading && !err && !result && (
          <div className="alert error">No prediction data returned. Check that the flight has a launch time and station coordinates.</div>
        )}
        {result && (
          result.stub ? (
            <div className="alert info">
              <strong>balloon-predictor not installed.</strong><br />
              {result.message}
            </div>
          ) : (
            <div>
              {result.points && result.points.length > 0 && (
                <TrajectoryMap
                  points={result.points}
                  burst={result.burst}
                  landing={result.predicted_landing_lat != null ? { lat: result.predicted_landing_lat, lon: result.predicted_landing_lon } : null}
                />
              )}
              <div className="stats-row" style={{ marginBottom: 16 }}>
                <div className="stat info">
                  <div className="label">Landing Lat</div>
                  <div className="value" style={{ fontSize: '1.2rem' }}>
                    {result.predicted_landing_lat?.toFixed(4) ?? '—'}
                  </div>
                </div>
                <div className="stat info">
                  <div className="label">Landing Lon</div>
                  <div className="value" style={{ fontSize: '1.2rem' }}>
                    {result.predicted_landing_lon?.toFixed(4) ?? '—'}
                  </div>
                </div>
                <div className="stat">
                  <div className="label">Track Points</div>
                  <div className="value">{result.point_count}</div>
                </div>
              </div>
              {result.burst && (
                <div className="card" style={{ marginBottom: 0, background: '#f3e5f5' }}>
                  <div className="card-title">Burst Point</div>
                  <div style={{ fontSize: '0.82rem' }}>
                    {result.burst.alt_m?.toLocaleString()} m · {result.burst.lat?.toFixed(4)}, {result.burst.lon?.toFixed(4)}
                    · {new Date(result.burst.time).toLocaleTimeString()} UTC
                  </div>
                </div>
              )}
            </div>
          )
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Flights() {
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [trajFlight, setTrajFlight] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  const load = () => {
    setLoading(true)
    api.flights.list()
      .then((f) => { setFlights(f); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(load, [])

  const handleSave = async (payload) => {
    if (modal === 'add') {
      await api.flights.create(payload)
    } else {
      await api.flights.update(payload.flight_id, payload)
    }
    setModal(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm(`Delete flight ${id}?`)) return
    try { await api.flights.delete(id); load() } catch (e) { alert(e.message) }
  }

  const handleReport = async (f) => {
    setReportLoading(true)
    try {
      const [skewtResult, trajResult] = await Promise.allSettled([
        api.flights.fetchSkewt(f.flight_id),
        api.flights.getStoredTrajectory(f.flight_id),
      ])
      const skewtData = skewtResult.status === 'fulfilled' ? skewtResult.value : null
      const trajectoryData = trajResult.status === 'fulfilled' ? trajResult.value : null
      await generateFlightReport(f, skewtData, trajectoryData, null)
    } catch (e) {
      alert('Failed to generate report: ' + e.message)
    } finally {
      setReportLoading(false)
    }
  }

  const formFromFlight = (f) => ({
    flight_id: f.flight_id,
    status: f.status, launch_time: f.launch_time ? f.launch_time.slice(0, 16) : '',
    burst_altitude_m: f.burst_altitude_m ?? '', ascent_rate_mps: f.ascent_rate_mps ?? '',
    descent_rate_mps: f.descent_rate_mps ?? '', max_altitude_m: f.max_altitude_m ?? '',
    launch_lat: f.launch_lat ?? '', launch_lon: f.launch_lon ?? '', launch_alt_m: f.launch_alt_m ?? '',
    notes: f.notes ?? '',
  })

  return (
    <div>
      <div className="section-header">
        <h2>Flights</h2>
        <button className="btn btn-primary" onClick={() => setModal('add')}>+ Create Flight</button>
      </div>
      <p className="section-desc">
        Full lifecycle: launch -> ascent -> descent -> recovery. Balloon trajectory powered by balloon-predictor.
      </p>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Loading flights…</div>}

      {!loading && flights.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">No flights yet. Create your first flight operation.</div>
          </div>
        </div>
      )}

      {!loading && flights.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>Flight ID</th>
                <th style={{ whiteSpace: 'nowrap' }}>Launch</th>
                <th style={{ whiteSpace: 'nowrap' }}>Burst Alt</th>
                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.flight_id}>
                  <td style={{ whiteSpace: 'nowrap' }}><code>{f.flight_id}</code></td>
                  <td style={{ fontSize: '0.75rem', color: '#889', whiteSpace: 'nowrap' }}>
                    {f.launch_time ? new Date(f.launch_time).toLocaleString() : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{f.burst_altitude_m ? `${f.burst_altitude_m.toLocaleString()} m` : '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[f.status] || 'gray'}`}>{f.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => setModal(formFromFlight(f))}>Edit</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => setTrajFlight(f.flight_id)}>Predict</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => handleReport(f)} disabled={reportLoading}>Report</button>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                        onClick={() => handleDelete(f.flight_id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <FlightModal
          initial={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {trajFlight && (
        <TrajectoryPanel flightId={trajFlight} onClose={() => setTrajFlight(null)} />
      )}

      {reportLoading && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 320, textAlign: 'center', padding: '32px 28px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Generating Report…</div>
            <div style={{ fontSize: '0.8rem', color: '#667788' }}>
              Fetching flight data, tephigram and trajectory. This may take a few seconds.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
