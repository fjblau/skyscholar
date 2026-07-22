import { useState, useEffect } from 'react'
import { api } from '../api'

const EMPTY_FORM = {
  plan_id: '', name: '', source_script: 'manual',
  launch_lat: '', launch_lon: '', launch_alt_m: '',
  launch_time: '', ascent_rate_mps: '', burst_altitude_m: '',
  descent_rate_mps: '', predicted_landing_lat: '', predicted_landing_lon: '',
  notes: '',
}

function FlightPlanModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v) => (v !== '' && v != null ? parseFloat(v) : undefined)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await onSave({
        plan_id: form.plan_id,
        name: form.name,
        source_script: form.source_script || undefined,
        launch_lat: num(form.launch_lat),
        launch_lon: num(form.launch_lon),
        launch_alt_m: num(form.launch_alt_m),
        launch_time: form.launch_time || undefined,
        ascent_rate_mps: num(form.ascent_rate_mps),
        burst_altitude_m: num(form.burst_altitude_m),
        descent_rate_mps: num(form.descent_rate_mps),
        predicted_landing_lat: num(form.predicted_landing_lat),
        predicted_landing_lon: num(form.predicted_landing_lon),
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? 'Edit Flight Plan' : 'Create Flight Plan'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Plan ID *</label>
              <input required value={form.plan_id} onChange={(e) => set('plan_id', e.target.value)}
                placeholder="e.g. plan-001" disabled={!!initial} />
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Salzburg Test Launch" />
            </div>
            <div className="form-group">
              <label>Source</label>
              <select value={form.source_script || 'manual'} onChange={(e) => set('source_script', e.target.value)}>
                <option value="manual">manual</option>
                <option value="seed_simulation">seed_simulation</option>
                <option value="reverse_predict">reverse_predict</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Launch Lat</label>
              <input type="number" step="any" value={form.launch_lat}
                onChange={(e) => set('launch_lat', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Launch Lon</label>
              <input type="number" step="any" value={form.launch_lon}
                onChange={(e) => set('launch_lon', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Launch Alt (m)</label>
              <input type="number" step="any" value={form.launch_alt_m}
                onChange={(e) => set('launch_alt_m', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Launch Time (UTC)</label>
              <input type="datetime-local" value={form.launch_time}
                onChange={(e) => set('launch_time', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Ascent Rate (m/s)</label>
              <input type="number" step="any" value={form.ascent_rate_mps}
                onChange={(e) => set('ascent_rate_mps', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Burst Altitude (m)</label>
              <input type="number" step="any" value={form.burst_altitude_m}
                onChange={(e) => set('burst_altitude_m', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Descent Rate (m/s)</label>
              <input type="number" step="any" value={form.descent_rate_mps}
                onChange={(e) => set('descent_rate_mps', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Predicted Landing Lat</label>
              <input type="number" step="any" value={form.predicted_landing_lat}
                onChange={(e) => set('predicted_landing_lat', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Predicted Landing Lon</label>
              <input type="number" step="any" value={form.predicted_landing_lon}
                onChange={(e) => set('predicted_landing_lon', e.target.value)} />
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
              {saving ? 'Saving...' : 'Save Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PromoteModal({ planId, onDone, onClose }) {
  const [flightId, setFlightId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await api.flightPlans.promote(planId, flightId)
      onDone(flightId)
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Promote to Flight</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Flight ID *</label>
            <input required value={flightId} onChange={(e) => setFlightId(e.target.value)}
              placeholder="e.g. FLT-2026-001" />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Promoting...' : 'Create Flight'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FlightPlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [promoteId, setPromoteId] = useState(null)

  const load = () => {
    setLoading(true)
    api.flightPlans.list()
      .then((p) => { setPlans(p); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(load, [])

  const handleSave = async (payload) => {
    if (modal === 'add') {
      await api.flightPlans.create(payload)
    } else {
      await api.flightPlans.update(payload.plan_id, payload)
    }
    setModal(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm(`Delete flight plan ${id}?`)) return
    try { await api.flightPlans.delete(id); load() } catch (e) { alert(e.message) }
  }

  const formFromPlan = (p) => ({
    plan_id: p.plan_id,
    name: p.name || '',
    source_script: p.source_script || 'manual',
    launch_lat: p.launch_lat ?? '',
    launch_lon: p.launch_lon ?? '',
    launch_alt_m: p.launch_alt_m ?? '',
    launch_time: p.launch_time ? p.launch_time.slice(0, 16) : '',
    ascent_rate_mps: p.ascent_rate_mps ?? '',
    burst_altitude_m: p.burst_altitude_m ?? '',
    descent_rate_mps: p.descent_rate_mps ?? '',
    predicted_landing_lat: p.predicted_landing_lat ?? '',
    predicted_landing_lon: p.predicted_landing_lon ?? '',
    notes: p.notes ?? '',
  })

  return (
    <div>
      <div className="section-header">
        <h2>Flight Plans</h2>
        <button className="btn btn-primary" onClick={() => setModal('add')}>+ Create Plan</button>
      </div>
      <p className="section-desc">
        Capture launch parameters from script results or manual entry. Promote a plan to create a real Flight.
      </p>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">Loading flight plans...</div>}

      {!loading && plans.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">No flight plans yet. Create one or save from a script run.</div>
          </div>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Plan ID</th>
                <th>Name</th>
                <th>Source</th>
                <th>Launch</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.plan_id}>
                  <td><code>{p.plan_id}</code></td>
                  <td>{p.name || '—'}</td>
                  <td>
                    {p.source_script ? (
                      <span className="badge gray">{p.source_script}</span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#889' }}>
                    {p.launch_lat != null ? `${p.launch_lat.toFixed(4)}, ${p.launch_lon?.toFixed(4)}` : '—'}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#889', whiteSpace: 'nowrap' }}>
                    {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    {p.promoted_flight_id ? (
                      <span className="badge green" title={`Flight: ${p.promoted_flight_id}`}>
                        promoted: {p.promoted_flight_id}
                      </span>
                    ) : (
                      <span className="badge gray">draft</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px' }}
                        onClick={() => setModal(formFromPlan(p))}>Edit</button>
                      {!p.promoted_flight_id && (
                        <button className="btn btn-primary" style={{ padding: '4px 8px' }}
                          onClick={() => setPromoteId(p.plan_id)}>Promote</button>
                      )}
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                        onClick={() => handleDelete(p.plan_id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <FlightPlanModal
          initial={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {promoteId && (
        <PromoteModal
          planId={promoteId}
          onDone={(fid) => {
            setPromoteId(null)
            load()
            alert(`Flight ${fid} created successfully!`)
          }}
          onClose={() => setPromoteId(null)}
        />
      )}
    </div>
  )
}
