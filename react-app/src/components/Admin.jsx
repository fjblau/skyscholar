import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import LocationPickerMap from './LocationPickerMap'
import ReversePredictResultMap from './ReversePredictResultMap'

const STORAGE_PREFIX = 'skyscholar:admin:'

const US_PRESETS = [
  { name: 'Spaceport America, NM', lat: 32.9904, lon: -106.9773 },
  { name: 'Huntsville, AL', lat: 34.7304, lon: -86.586 },
  { name: 'Reno, NV', lat: 39.5296, lon: -119.8138 },
  { name: 'Denver, CO', lat: 39.7392, lon: -104.9903 },
  { name: 'Wichita, KS', lat: 37.6872, lon: -97.3301 },
  { name: 'Portland, OR', lat: 45.5152, lon: -122.6784 },
]

function loadStoredParams(scriptId, defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scriptId)
    if (!raw) return defaults
    const stored = JSON.parse(raw)
    if (!stored || typeof stored !== 'object') return defaults
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}

function saveStoredParams(scriptId, params) {
  try {
    localStorage.setItem(STORAGE_PREFIX + scriptId, JSON.stringify(params))
  } catch {}
}

function titleCase(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function latLonPairs(params) {
  const pairs = []
  for (const p of params) {
    if (!p.name.endsWith('_lat')) continue
    if (p.type !== 'float' && p.type !== 'integer') continue
    const prefix = p.name.slice(0, -4)
    const lonP = params.find((q) => q.name === `${prefix}_lon`)
    if (!lonP) continue
    pairs.push({
      key: prefix,
      latName: p.name,
      lonName: lonP.name,
      label: p.label ? p.label.replace(/latitude/i, '').trim() || titleCase(prefix) : titleCase(prefix),
    })
  }
  return pairs
}

function ParamField({ param, value, onChange }) {
  const { name, label, type, placeholder, default: def } = param

  if (type === 'boolean') {
    return (
      <div className="form-group admin-param-check">
        <label>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(name, e.target.checked)}
          />
          <span>{label}</span>
        </label>
      </div>
    )
  }

  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type === 'integer' || type === 'float' ? 'number' : 'text'}
        step={type === 'float' ? 'any' : undefined}
        value={value ?? ''}
        placeholder={placeholder ?? String(def ?? '')}
        onChange={(e) => {
          let v = e.target.value
          if (v === '') { onChange(name, ''); return }
          if (type === 'integer') v = parseInt(v, 10)
          else if (type === 'float') v = parseFloat(v)
          onChange(name, v)
        }}
      />
    </div>
  )
}

function buildFlightPlanPayload(scriptId, params, result) {
  const planId = `plan-${scriptId}-${Date.now().toString(36)}`
  const base = { plan_id: planId, source_script: scriptId }

  if (scriptId === 'reverse_predict' && result.result_data) {
    const d = result.result_data
    return {
      ...base,
      name: `Reverse predict ${d.recommended_launch_lat?.toFixed(4)}, ${d.recommended_launch_lon?.toFixed(4)}`,
      launch_lat: d.recommended_launch_lat,
      launch_lon: d.recommended_launch_lon,
      launch_alt_m: d.launch_alt_m ?? params.launch_alt,
      ascent_rate_mps: d.ascent_rate_mps ?? params.ascent_rate,
      burst_altitude_m: d.burst_alt_m ?? params.burst_alt,
      descent_rate_mps: d.descent_rate_mps ?? params.descent_rate,
      predicted_landing_lat: d.predicted_landing_lat,
      predicted_landing_lon: d.predicted_landing_lon,
      script_params: params,
      result_data: d,
    }
  }

  if (scriptId === 'seed_simulation' && result.result_data) {
    const d = result.result_data
    return {
      ...base,
      name: `Seed sim ${d.launch_lat?.toFixed(4)}, ${d.launch_lon?.toFixed(4)}`,
      launch_lat: d.launch_lat ?? params.launch_lat,
      launch_lon: d.launch_lon ?? params.launch_lon,
      launch_alt_m: d.launch_alt_m ?? params.launch_alt,
      launch_time: d.launch_time,
      ascent_rate_mps: d.ascent_rate_mps,
      burst_altitude_m: d.burst_altitude_m,
      descent_rate_mps: d.descent_rate_mps,
      predicted_landing_lat: d.predicted_landing_lat,
      predicted_landing_lon: d.predicted_landing_lon,
      script_params: params,
      result_data: d,
    }
  }

  return {
    ...base,
    name: `${scriptId} run ${new Date().toISOString().slice(0, 16)}`,
    launch_lat: params.launch_lat,
    launch_lon: params.launch_lon,
    launch_alt_m: params.launch_alt,
    script_params: params,
  }
}

function ScriptCard({ script }) {
  const defaultParams = Object.fromEntries(
    script.params.map((p) => [p.name, p.default ?? ''])
  )
  const [params, setParams] = useState(() => loadStoredParams(script.id, defaultParams))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [planSaved, setPlanSaved] = useState(false)
  const [planSaving, setPlanSaving] = useState(false)
  const outputRef = useRef(null)

  useEffect(() => {
    saveStoredParams(script.id, params)
  }, [script.id, params])

  function setParam(name, value) {
    setParams((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSaveAsPlan() {
    setPlanSaving(true)
    try {
      const payload = buildFlightPlanPayload(script.id, params, result)
      await api.flightPlans.create(payload)
      setPlanSaved(true)
    } catch (err) {
      alert('Failed to save flight plan: ' + err.message)
    } finally {
      setPlanSaving(false)
    }
  }

  async function handleRun() {
    setRunning(true)
    setResult(null)
    setPlanSaved(false)
    try {
      const cleaned = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '')
      )
      const res = await api.admin.runScript(script.id, cleaned)
      setResult(res)
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (result && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [result])

  const exitOk = result && result.exit_code === 0
  const hasOutput = result && (result.stdout || result.stderr)

  return (
    <div className="card admin-script-card">
      <div className="admin-script-header">
        <div>
          <div className="admin-script-name">{script.name}</div>
          <div className="admin-script-desc">{script.description}</div>
        </div>
        <span className="badge gray admin-script-file">{script.script}</span>
      </div>

      {script.params.length > 0 && (
        <div className="admin-params">
          <div className="form-row">
            {script.params.map((p) => (
              <ParamField
                key={p.name}
                param={p}
                value={params[p.name]}
                onChange={setParam}
              />
            ))}
          </div>
          {latLonPairs(script.params).map((pair) => {
            const latVal = params[pair.latName]
            const lonVal = params[pair.lonName]
            const hasCoords = latVal !== '' && latVal != null && lonVal !== '' && lonVal != null
            return (
              <div className="admin-map-picker" key={pair.key}>
                <div className="admin-map-picker-label">
                  {pair.label} — click map to set
                  {hasCoords && (
                    <span className="admin-map-picker-coords">
                      {Number(latVal).toFixed(4)}, {Number(lonVal).toFixed(4)}
                    </span>
                  )}
                </div>
                <div className="admin-presets">
                  <span className="admin-presets-title">US presets:</span>
                  {US_PRESETS.map((preset) => {
                    const active = hasCoords &&
                      Number(latVal).toFixed(4) === preset.lat.toFixed(4) &&
                      Number(lonVal).toFixed(4) === preset.lon.toFixed(4)
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        className={`admin-preset-chip${active ? ' active' : ''}`}
                        title={`${preset.lat.toFixed(4)}, ${preset.lon.toFixed(4)}`}
                        onClick={() => {
                          setParam(pair.latName, preset.lat)
                          setParam(pair.lonName, preset.lon)
                        }}
                      >
                        {preset.name}
                      </button>
                    )
                  })}
                </div>
                <LocationPickerMap
                  lat={latVal}
                  lon={lonVal}
                  onChange={(la, lo) => {
                    setParam(pair.latName, Math.round(la * 1e6) / 1e6)
                    setParam(pair.lonName, Math.round(lo * 1e6) / 1e6)
                  }}
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="admin-run-row">
        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running}
        >
          {running ? 'Running…' : 'Run Script'}
        </button>
        {result && !running && (
          <span className={`badge ${exitOk ? 'green' : 'red'}`}>
            {result.error
              ? 'Error'
              : exitOk
              ? `Exit 0 · ${result.duration_ms}ms`
              : `Exit ${result.exit_code} · ${result.duration_ms}ms`}
          </span>
        )}
        {result && result.command && (
          <code className="admin-cmd-preview">{result.command}</code>
        )}
        {result && !result.error && (result.result_data || result.exit_code === 0) && !planSaved && (
          <button className="btn btn-ghost" onClick={handleSaveAsPlan} disabled={planSaving}
            style={{ marginLeft: 8 }}>
            {planSaving ? 'Saving...' : 'Save as Flight Plan'}
          </button>
        )}
        {planSaved && (
          <span className="badge green" style={{ marginLeft: 8 }}>Plan saved</span>
        )}
      </div>

      {result && !result.error && result.result_data && script.id === 'reverse_predict' && result.result_data.ok && (
        <div className="admin-result-map-wrapper">
          <div className="admin-result-map-legend">
            <span className="dot dot-target" /> Target landing
            <span className="dot dot-launch" /> Recommended launch
            <span className="dot dot-landing" /> Predicted landing
            <span className="dot dot-iter" /> Iteration guesses
          </div>
          <ReversePredictResultMap result={result.result_data} />
        </div>
      )}

      {result && !result.error && hasOutput && (
        <div className="admin-output" ref={outputRef}>
          {result.stdout && (
            <pre className="admin-output-stdout">{result.stdout}</pre>
          )}
          {result.stderr && (
            <pre className="admin-output-stderr">{result.stderr}</pre>
          )}
        </div>
      )}

      {result && result.error && (
        <div className="alert error" style={{ marginTop: 12 }}>
          {result.error}
        </div>
      )}
    </div>
  )
}

export default function Admin() {
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.admin
      .listScripts()
      .then(setScripts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="section-header">
        <h2>Admin — Server Scripts</h2>
      </div>
      <p className="section-desc">
        Run server-side scripts directly. Parameters are validated before execution.
        Output is streamed back when the script completes.
      </p>

      {loading && <div className="loading">Loading scripts…</div>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && scripts.length === 0 && (
        <div className="empty-state">
          <div className="icon">No scripts registered.</div>
        </div>
      )}

      {scripts.map((s) => (
        <ScriptCard key={s.id} script={s} />
      ))}
    </div>
  )
}
