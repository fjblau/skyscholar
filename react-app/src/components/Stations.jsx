import { useState, useEffect } from 'react'
import { api } from '../api'

const STATUS_BADGE = { online: 'green', offline: 'gray', maintenance: 'orange' }

const EMPTY_FORM = {
  station_id: '', name: '', status: 'online',
  lat: '', lon: '', altitude_m: '', location_desc: '',
  antenna_type: '', band: '', radio_status: '',
  auto_tune_freq_mhz: '', listening: '',
  firmware_version: '', qth_locator: '',
  test_mode: false, auto_update: true,
  confirmed_packets: 0, telemetry_packets: 0,
  record_distance_km: '',
  local_ip: '', wifi_rssi: '',
  notes: '',
}

function StationModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v) => (v !== '' && v !== undefined ? parseFloat(v) : undefined)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await onSave({
        station_id: form.station_id,
        name: form.name,
        status: form.status,
        location: {
          lat: parseFloat(form.lat),
          lon: parseFloat(form.lon),
          altitude_m: num(form.altitude_m) ?? 0,
          description: form.location_desc || undefined,
        },
        antenna_type: form.antenna_type || undefined,
        band: form.band || undefined,
        radio_status: form.radio_status || undefined,
        auto_tune_freq_mhz: num(form.auto_tune_freq_mhz),
        listening: form.listening || undefined,
        firmware_version: form.firmware_version || undefined,
        qth_locator: form.qth_locator || undefined,
        test_mode: form.test_mode,
        auto_update: form.auto_update,
        confirmed_packets: parseInt(form.confirmed_packets) || 0,
        telemetry_packets: parseInt(form.telemetry_packets) || 0,
        record_distance_km: num(form.record_distance_km),
        local_ip: form.local_ip || undefined,
        wifi_rssi: form.wifi_rssi || undefined,
        notes: form.notes || undefined,
      })
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? 'Edit Station' : 'Create Station'}</h3>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <form onSubmit={handleSubmit}>
          {/* Identity */}
          <div className="form-row">
            <div className="form-group">
              <label>Station ID *</label>
              <input required value={form.station_id} onChange={(e) => set('station_id', e.target.value)}
                placeholder="e.g. feldkirch-gs" disabled={!!initial} />
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Feldkirch_GS" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="online">online</option>
                <option value="offline">offline</option>
                <option value="maintenance">maintenance</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="form-row">
            <div className="form-group">
              <label>Latitude *</label>
              <input required type="number" step="any" value={form.lat}
                onChange={(e) => set('lat', e.target.value)} placeholder="47.24" />
            </div>
            <div className="form-group">
              <label>Longitude *</label>
              <input required type="number" step="any" value={form.lon}
                onChange={(e) => set('lon', e.target.value)} placeholder="9.60" />
            </div>
            <div className="form-group">
              <label>Altitude (m)</label>
              <input type="number" step="any" value={form.altitude_m}
                onChange={(e) => set('altitude_m', e.target.value)} placeholder="458" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Location Description</label>
              <input value={form.location_desc} onChange={(e) => set('location_desc', e.target.value)}
                placeholder="e.g. Feldkirch, Austria" />
            </div>
          </div>

          {/* Radio / Antenna */}
          <div className="form-row">
            <div className="form-group">
              <label>Antenna Type</label>
              <input value={form.antenna_type} onChange={(e) => set('antenna_type', e.target.value)}
                placeholder="e.g. Yagi 5el" />
            </div>
            <div className="form-group">
              <label>Band</label>
              <input value={form.band} onChange={(e) => set('band', e.target.value)}
                placeholder="e.g. 433 MHz" />
            </div>
            <div className="form-group">
              <label>Radio Status</label>
              <input value={form.radio_status} onChange={(e) => set('radio_status', e.target.value)}
                placeholder="e.g. receiving" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Auto-Tune Freq (MHz)</label>
              <input type="number" step="any" value={form.auto_tune_freq_mhz}
                onChange={(e) => set('auto_tune_freq_mhz', e.target.value)} placeholder="436.703" />
            </div>
            <div className="form-group">
              <label>Listening</label>
              <input value={form.listening} onChange={(e) => set('listening', e.target.value)}
                placeholder="e.g. Norby" />
            </div>
            <div className="form-group">
              <label>QTH Locator</label>
              <input value={form.qth_locator} onChange={(e) => set('qth_locator', e.target.value)}
                placeholder="e.g. JN47rf" />
            </div>
          </div>

          {/* Connectivity */}
          <div className="form-row">
            <div className="form-group">
              <label>Firmware Version</label>
              <input value={form.firmware_version} onChange={(e) => set('firmware_version', e.target.value)}
                placeholder="e.g. 2401222" />
            </div>
            <div className="form-group">
              <label>Local IP</label>
              <input value={form.local_ip} onChange={(e) => set('local_ip', e.target.value)}
                placeholder="192.168.1.100" />
            </div>
            <div className="form-group">
              <label>WiFi RSSI</label>
              <input value={form.wifi_rssi} onChange={(e) => set('wifi_rssi', e.target.value)}
                placeholder="-62 dBm" />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="form-row">
            <div className="form-group form-check">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.test_mode}
                  onChange={(e) => set('test_mode', e.target.checked)} style={{ width: 16, height: 16 }} />
                Test Mode
              </label>
            </div>
            <div className="form-group form-check">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.auto_update}
                  onChange={(e) => set('auto_update', e.target.checked)} style={{ width: 16, height: 16 }} />
                Auto Update
              </label>
            </div>
          </div>

          {/* Stats */}
          <div className="form-row">
            <div className="form-group">
              <label>Confirmed Packets</label>
              <input type="number" value={form.confirmed_packets}
                onChange={(e) => set('confirmed_packets', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Telemetry Packets</label>
              <input type="number" value={form.telemetry_packets}
                onChange={(e) => set('telemetry_packets', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Record Distance (km)</label>
              <input type="number" step="any" value={form.record_distance_km}
                onChange={(e) => set('record_distance_km', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving\u2026' : 'Save Station'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Stations() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)

  const load = () => {
    setLoading(true)
    api.stations.list()
      .then((s) => { setStations(s); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(load, [])

  const handleSave = async (payload) => {
    if (modal === 'add') {
      await api.stations.create(payload)
    } else {
      await api.stations.update(payload.station_id, payload)
    }
    setModal(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm(`Delete station ${id}?`)) return
    try { await api.stations.delete(id); load() } catch (e) { alert(e.message) }
  }

  const formFromStation = (s) => ({
    station_id: s.station_id,
    name: s.name,
    status: s.status || 'online',
    lat: s.location?.lat ?? '',
    lon: s.location?.lon ?? '',
    altitude_m: s.location?.altitude_m ?? '',
    location_desc: s.location?.description ?? '',
    antenna_type: s.antenna_type ?? '',
    band: s.band ?? '',
    radio_status: s.radio_status ?? '',
    auto_tune_freq_mhz: s.auto_tune_freq_mhz ?? '',
    listening: s.listening ?? '',
    firmware_version: s.firmware_version ?? '',
    qth_locator: s.qth_locator ?? '',
    test_mode: s.test_mode ?? false,
    auto_update: s.auto_update ?? true,
    confirmed_packets: s.confirmed_packets ?? 0,
    telemetry_packets: s.telemetry_packets ?? 0,
    record_distance_km: s.record_distance_km ?? '',
    local_ip: s.local_ip ?? '',
    wifi_rssi: s.wifi_rssi ?? '',
    notes: s.notes ?? '',
  })

  const onlineCount = stations.filter((s) => s.status === 'online').length
  const totalConfirmed = stations.reduce((sum, s) => sum + (s.confirmed_packets || 0), 0)

  return (
    <div>
      <div className="section-header">
        <h2>Ground Stations</h2>
        <button className="btn btn-primary" onClick={() => setModal('add')}>+ Add Station</button>
      </div>
      <p className="section-desc">
        TinyGS-style radio tracking and receiving stations.
      </p>

      <div className="stats-row">
        <div className={`stat ${stations.length > 0 ? 'ok' : 'warn'}`}>
          <div className="label">Total Stations</div>
          <div className="value">{stations.length}</div>
        </div>
        <div className={`stat ${onlineCount > 0 ? 'ok' : ''}`}>
          <div className="label">Online</div>
          <div className="value">{onlineCount}</div>
        </div>
        <div className="stat info">
          <div className="label">Confirmed Packets</div>
          <div className="value">{totalConfirmed.toLocaleString()}</div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Loading stations...</div>}

      {!loading && stations.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">No ground stations registered yet.</div>
          </div>
        </div>
      )}

      {!loading && stations.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Station ID</th>
                <th>Name</th>
                <th>Position</th>
                <th>Antenna</th>
                <th>Band</th>
                <th>Status</th>
                <th>Packets</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.station_id}>
                  <td><code>{s.station_id}</code></td>
                  <td>{s.name}</td>
                  <td style={{ fontSize: '0.75rem', color: '#889' }}>
                    {s.location?.lat?.toFixed(4)}, {s.location?.lon?.toFixed(4)}
                  </td>
                  <td>{s.antenna_type || '\u2014'}</td>
                  <td>{s.band || '\u2014'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[s.status] || 'gray'}`}>{s.status}</span>
                  </td>
                  <td>{(s.confirmed_packets || 0).toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => setModal(formFromStation(s))}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                        onClick={() => handleDelete(s.station_id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StationModal
          initial={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
