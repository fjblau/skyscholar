import { useState, useEffect } from 'react'
import { api } from '../api'

function StatTile({ label, value, unit, variant }) {
  return (
    <div className={`stat ${variant || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
      {unit && <div className="unit">{unit}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [health, setHealth] = useState(null)
  const [stations, setStations] = useState([])
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.health().catch(() => ({ status: 'unreachable' })),
      api.stations.list().catch(() => []),
      api.flights.list().catch(() => []),
    ]).then(([h, s, f]) => {
      setHealth(h)
      setStations(s)
      setFlights(f)
      setLoading(false)
    }).catch((e) => {
      setError(e.message)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading">Loading…</div>
  if (error) return <div className="alert error">{error}</div>

  const activeStations = stations.filter((s) => s.status === 'active').length
  const activeFlights = flights.filter(
    (f) => !['planned', 'recovered', 'aborted', 'landed'].includes(f.status)
  ).length
  const recentFlights = [...flights]
    .sort((a, b) => (b.launch_time || '').localeCompare(a.launch_time || ''))
    .slice(0, 8)

  return (
    <div>
      <div className="section-header">
        <h2>System Overview</h2>
        <span style={{ fontSize: '0.75rem', color: '#889' }}>
          <span className="live-dot" />
          API {health?.status === 'ok' ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="section-desc">
        Real-time status across the ground station network.
      </p>

      <div className="stats-row">
        <StatTile
          label="Ground Stations"
          value={stations.length}
          unit={`${activeStations} active`}
          variant={activeStations > 0 ? 'ok' : 'warn'}
        />
        <StatTile
          label="Active Flights"
          value={activeFlights}
          unit="in progress"
          variant={activeFlights > 0 ? 'info' : ''}
        />
        <StatTile
          label="Total Flights"
          value={flights.length}
          unit="all time"
        />
      </div>

      <div className="card">
        <div className="card-title">Ground Stations</div>
        {stations.length === 0 ? (
          <div className="empty-state">
            <div className="icon">No ground stations registered yet</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Location</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.station_id}>
                  <td><code>{s.station_id}</code></td>
                  <td>{s.name}</td>
                  <td style={{ fontSize: '0.75rem', color: '#889' }}>
                    {s.location?.lat?.toFixed(4)}, {s.location?.lon?.toFixed(4)}
                    {s.location?.description ? ` · ${s.location.description}` : ''}
                  </td>
                  <td><span className="badge gray">{s.container_type}</span></td>
                  <td>
                    <span className={`status-${s.status}`} style={{ fontWeight: 600, fontSize: '0.78rem' }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">Recent Flights</div>
        {recentFlights.length === 0 ? (
          <div className="empty-state">
            <div className="icon">No flights recorded yet</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Flight ID</th>
                <th>Station</th>
                <th>Status</th>
                <th>Launch Time</th>
                <th>Max Alt</th>
              </tr>
            </thead>
            <tbody>
              {recentFlights.map((f) => (
                <tr key={f.flight_id}>
                  <td><code>{f.flight_id}</code></td>
                  <td>{f.station_id}</td>
                  <td>
                    <span className={`status-${f.status}`} style={{ fontWeight: 600, fontSize: '0.78rem' }}>
                      {f.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#889' }}>
                    {f.launch_time ? new Date(f.launch_time).toLocaleString() : '—'}
                  </td>
                  <td>{f.max_altitude_m ? `${f.max_altitude_m.toLocaleString()} m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
