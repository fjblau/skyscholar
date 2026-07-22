import { useState, useEffect } from 'react'
import { api } from '../api'

const BUFR_STATUS_BADGE = {
  standard: 'green', draft_extension: 'blue', custom: 'orange',
}

function SchemaDetail({ schema, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            🛰 {schema.name}
            <span className={`badge ${schema.payload_type === 'standard' ? 'green' : 'orange'}`}
              style={{ marginLeft: 10 }}>
              {schema.payload_type}
            </span>
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {schema.description && (
          <p style={{ fontSize: '0.82rem', color: '#667', marginBottom: 16 }}>{schema.description}</p>
        )}
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>BUFR Descriptor</th>
              <th>Status</th>
              <th>Unit</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {schema.fields.map((f) => (
              <tr key={f.field_name}>
                <td><code>{f.field_name}</code></td>
                <td>
                  {f.bufr_descriptor
                    ? <code>{f.bufr_descriptor}</code>
                    : <span style={{ color: '#bbb' }}>—</span>}
                </td>
                <td>
                  <span className={`badge ${BUFR_STATUS_BADGE[f.bufr_status] || 'gray'}`}>
                    {f.bufr_status}
                  </span>
                </td>
                <td style={{ color: '#889' }}>{f.unit || '—'}</td>
                <td style={{ color: '#667', fontSize: '0.75rem' }}>{f.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = { schema_id: '', name: '', payload_type: 'custom', description: '', version: '1.0' }

function SchemaModal({ onSave, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await onSave({ ...form, fields: [] })
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
          <h3>Register Payload Schema</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Schema ID *</label>
              <input required value={form.schema_id} onChange={(e) => set('schema_id', e.target.value)}
                placeholder="e.g. ozone_sonde_v1" />
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ozone Sonde v1" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={form.payload_type} onChange={(e) => set('payload_type', e.target.value)}>
                <option value="custom">Custom</option>
                <option value="standard">Standard</option>
              </select>
            </div>
            <div className="form-group">
              <label>Version</label>
              <input value={form.version} onChange={(e) => set('version', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>
          <div className="alert info" style={{ marginTop: 0 }}>
            Fields can be added via the API (POST /api/payloads/{'{'}schema_id{'}'}) after creation.
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create Schema'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Payloads() {
  const [schemas, setSchemas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detail, setDetail] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = () => {
    setLoading(true)
    api.payloads.list()
      .then(setSchemas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleSave = async (payload) => {
    await api.payloads.create(payload)
    setAdding(false)
    load()
  }

  const handleDelete = async (id) => {
    if (id === 'standard_met') return alert('Cannot delete the built-in standard schema.')
    if (!confirm(`Delete schema ${id}?`)) return
    try { await api.payloads.delete(id); load() } catch (e) { alert(e.message) }
  }

  const stdCount = schemas.filter((s) => s.payload_type === 'standard').length
  const customCount = schemas.filter((s) => s.payload_type === 'custom').length

  return (
    <div>
      <div className="section-header">
        <h2>Sensor Payload Schemas</h2>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Register Schema</button>
      </div>
      <p className="section-desc">
        Standard WMO BUFR fields and custom researcher payloads. Each schema defines field names, BUFR descriptors, and units.
      </p>

      <div className="stats-row">
        <div className="stat ok">
          <div className="label">WMO Standard</div>
          <div className="value">{stdCount}</div>
          <div className="unit">schema{stdCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat warn">
          <div className="label">Custom Payloads</div>
          <div className="value">{customCount}</div>
          <div className="unit">schema{customCount !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="loading">⏳ Loading schemas…</div>}

      {!loading && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Schema ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Fields</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schemas.map((s) => (
                <tr key={s.schema_id}>
                  <td><code>{s.schema_id}</code></td>
                  <td style={{ fontWeight: 500 }}>🛰 {s.name}</td>
                  <td>
                    <span className={`badge ${s.payload_type === 'standard' ? 'green' : 'orange'}`}>
                      {s.payload_type}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: '#889', fontSize: '0.78rem' }}>
                      {s.fields?.length ?? 0} field{s.fields?.length !== 1 ? 's' : ''}
                      {' · '}
                      {s.fields?.filter((f) => f.bufr_status === 'standard').length || 0} std
                    </span>
                  </td>
                  <td><code style={{ fontSize: '0.72rem' }}>v{s.version}</code></td>
                  <td>
                    <button className="btn btn-ghost" style={{ marginRight: 6 }}
                      onClick={() => setDetail(s)}>View Fields</button>
                    {s.schema_id !== 'standard_met' && (
                      <button className="btn btn-danger" onClick={() => handleDelete(s.schema_id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ background: '#f0f7ff', border: '1px solid #b3d4f5' }}>
        <div className="card-title" style={{ color: '#1565c0' }}>BUFR Field Status Guide</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.78rem' }}>
          <div><span className="badge green">standard</span> — WMO Table B descriptor exists</div>
          <div><span className="badge blue">draft_extension</span> — In working group review (e.g. air quality)</div>
          <div><span className="badge orange">custom</span> — No BUFR equivalent; stored in Section 2</div>
        </div>
      </div>

      {detail && <SchemaDetail schema={detail} onClose={() => setDetail(null)} />}
      {adding && <SchemaModal onSave={handleSave} onClose={() => setAdding(false)} />}
    </div>
  )
}
