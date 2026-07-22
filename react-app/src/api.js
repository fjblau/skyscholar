const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  health: () => req('/health'),

  stations: {
    list: () => req('/stations'),
    get: (id) => req(`/stations/${id}`),
    create: (data) => req('/stations', { method: 'POST', body: data }),
    update: (id, data) => req(`/stations/${id}`, { method: 'PUT', body: data }),
    delete: (id) => req(`/stations/${id}`, { method: 'DELETE' }),
    flights: (id) => req(`/stations/${id}/flights`),
  },

  flights: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString()
      return req('/flights' + (qs ? `?${qs}` : ''))
    },
    get: (id) => req(`/flights/${id}`),
    create: (data) => req('/flights', { method: 'POST', body: data }),
    update: (id, data) => req(`/flights/${id}`, { method: 'PUT', body: data }),
    setStatus: (id, status) => req(`/flights/${id}/status?status=${status}`, { method: 'PATCH' }),
    predictTrajectory: (id) => req(`/flights/${id}/predict-trajectory`, { method: 'POST' }),
    getStoredTrajectory: (id) => req(`/flights/${id}/stored-trajectory`),
    delete: (id) => req(`/flights/${id}`, { method: 'DELETE' }),
    exportSkewt: (id) => `${BASE}/flights/${id}/export/skewt`,
    fetchSkewt: (id) => req(`/flights/${id}/export/skewt`),
    exportNwp: (id) => `${BASE}/flights/${id}/export/nwp`,
    exportBufr: (id) => `${BASE}/flights/${id}/export/bufr`,
  },

  payloads: {
    list: () => req('/payloads'),
    get: (id) => req(`/payloads/${id}`),
    create: (data) => req('/payloads', { method: 'POST', body: data }),
    update: (id, data) => req(`/payloads/${id}`, { method: 'PUT', body: data }),
    delete: (id) => req(`/payloads/${id}`, { method: 'DELETE' }),
  },

  telemetry: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString()
      return req('/telemetry' + (qs ? `?${qs}` : ''))
    },
    forFlight: (id) => req(`/telemetry/flight/${id}`),
    latest: (id) => req(`/telemetry/flight/${id}/latest`),
    profile: (id) => req(`/telemetry/flight/${id}/profile`),
    ingest: (data) => req('/telemetry', { method: 'POST', body: data }),
    batch: (readings) => req('/telemetry/batch', { method: 'POST', body: readings }),
  },

  admin: {
    listScripts: () => req('/admin/scripts'),
    runScript: (scriptId, params = {}) =>
      req(`/admin/scripts/${scriptId}/run`, { method: 'POST', body: { params } }),
  },
}
