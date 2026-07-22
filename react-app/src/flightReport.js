import jsPDF from 'jspdf'
import * as d3 from 'd3'

const KAPPA = 0.2857
const L_V = 2.5e6
const R_V = 461.5
const R_D = 287.05
const C_P = 1005.7

function es_hPa(T_C) {
  return 6.112 * Math.exp(17.67 * T_C / (T_C + 243.5))
}
function ws_gkg(T_C, P_hPa) {
  const e = es_hPa(T_C)
  return 621.97 * e / (P_hPa - e)
}
function altKm(P_hPa) {
  if (P_hPa <= 0) return 0
  return parseFloat((44.33 * (1 - Math.pow(P_hPa / 1013.25, 0.19022))).toFixed(1))
}
function lclCalc(T_C, Td_C, P_hPa) {
  if (T_C == null || Td_C == null || P_hPa == null) return null
  const T_K = T_C + 273.15
  const Td_K = Td_C + 273.15
  const T_L = 1 / (1 / (Td_K - 56) + Math.log(T_K / Td_K) / 800) + 56
  const P_L = P_hPa * Math.pow(T_L / T_K, 1 / KAPPA)
  return { T_C: T_L - 273.15, P_hPa: P_L }
}

function buildTephigramSVGNode(skewtData) {
  const levels = [...(skewtData?.levels || [])].filter(l => l.p != null).sort((a, b) => b.p - a.p)

  const margin = { top: 30, right: 50, bottom: 58, left: 58 }
  const W = 640, H = 510
  const P_MAX = 1050, P_MIN = 100
  const T_MIN = -80, T_MAX = 40
  const SKEW = 1.0

  const div = document.createElement('div')
  div.style.cssText = 'position:absolute;left:-9999px;top:-9999px;'
  document.body.appendChild(div)

  const svgEl = d3.select(div).append('svg')
    .attr('width', W + margin.left + margin.right)
    .attr('height', H + margin.top + margin.bottom)
    .attr('xmlns', 'http://www.w3.org/2000/svg')
    .attr('class', 'skewt-svg')

  svgEl.append('defs').append('clipPath').attr('id', 'rpt-skewt-clip')
    .append('rect')
    .attr('x', margin.left).attr('y', margin.top)
    .attr('width', W).attr('height', H)

  const svg = svgEl.append('g')

  const yScale = d3.scaleLog().domain([P_MIN, P_MAX]).range([margin.top, margin.top + H])
  const xScale = d3.scaleLinear().domain([T_MIN, T_MAX]).range([margin.left, margin.left + W])
  const yBottom = yScale(P_MAX)

  function skX(T, P) { return xScale(T) + SKEW * (yBottom - yScale(P)) }
  function skY(P) { return yScale(P) }

  svg.append('rect')
    .attr('x', margin.left).attr('y', margin.top)
    .attr('width', W).attr('height', H)
    .attr('fill', '#f8faff')

  svg.append('rect')
    .attr('x', margin.left).attr('y', skY(250))
    .attr('width', W).attr('height', skY(150) - skY(250))
    .attr('fill', '#bfdbfe').attr('opacity', 0.35)
    .attr('clip-path', 'url(#rpt-skewt-clip)')

  svg.append('rect')
    .attr('x', margin.left).attr('y', margin.top)
    .attr('width', W).attr('height', skY(100) - margin.top)
    .attr('fill', '#ddd6fe').attr('opacity', 0.4)
    .attr('clip-path', 'url(#rpt-skewt-clip)')

  const pFine = d3.range(P_MAX, P_MIN - 1, -5)

  const isobarPressures = [100, 150, 200, 250, 300, 400, 500, 700, 850, 925, 1000]
  isobarPressures.forEach(P => {
    svg.append('line')
      .attr('x1', margin.left).attr('y1', skY(P))
      .attr('x2', margin.left + W).attr('y2', skY(P))
      .attr('stroke', '#c8d0dc').attr('stroke-width', 0.6)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  })

  for (let T = T_MIN; T <= T_MAX; T += 10) {
    const isZero = T === 0
    svg.append('line')
      .attr('x1', skX(T, P_MAX)).attr('y1', skY(P_MAX))
      .attr('x2', skX(T, P_MIN)).attr('y2', skY(P_MIN))
      .attr('stroke', isZero ? '#1d6dcc' : '#e8892a')
      .attr('stroke-width', isZero ? 1.2 : 0.55)
      .attr('opacity', isZero ? 0.9 : 0.65)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  }

  d3.range(240, 460, 10).forEach(theta_K => {
    const pts = pFine.map(P => [skX(theta_K * Math.pow(P / 1000, KAPPA) - 273.15, P), skY(P)])
    svg.append('path').attr('d', d3.line()(pts))
      .attr('fill', 'none').attr('stroke', '#7c3aed')
      .attr('stroke-width', 0.6).attr('opacity', 0.55)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  })

  d3.range(-40, 50, 5).forEach(T0 => {
    let T = T0
    const pts = [[skX(T, P_MAX), skY(P_MAX)]]
    for (let P = P_MAX - 5; P >= P_MIN; P -= 5) {
      const T_K = T + 273.15
      const ws_val = ws_gkg(T, P + 2.5) / 1000
      const num = R_D * T_K + L_V * ws_val
      const den = C_P + (L_V * L_V * ws_val) / (R_V * T_K * T_K)
      T += (num / den) / (P + 2.5) * (-5)
      pts.push([skX(T, P), skY(P)])
    }
    svg.append('path').attr('d', d3.line()(pts))
      .attr('fill', 'none').attr('stroke', '#52b788')
      .attr('stroke-width', 0.5).attr('opacity', 0.6)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  })

  const tData = levels.filter(l => l.T != null)
  const tdData = levels.filter(l => l.Td != null)

  if (tData.length > 1) {
    svg.append('path').datum(tData)
      .attr('d', d3.line().x(d => skX(d.T, d.p)).y(d => skY(d.p)))
      .attr('fill', 'none').attr('stroke', '#e63946').attr('stroke-width', 2.5)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  }
  if (tdData.length > 1) {
    svg.append('path').datum(tdData)
      .attr('d', d3.line().x(d => skX(d.Td, d.p)).y(d => skY(d.p)))
      .attr('fill', 'none').attr('stroke', '#2d6a4f').attr('stroke-width', 2.5)
      .attr('clip-path', 'url(#rpt-skewt-clip)')
  }

  const pressureTickValues = [100, 150, 200, 250, 300, 400, 500, 700, 850, 925, 1000]

  svg.append('g')
    .attr('transform', `translate(${margin.left}, 0)`)
    .call(
      d3.axisLeft(yScale)
        .tickValues(pressureTickValues)
        .tickFormat(d => d)
        .tickSize(0)
    )
    .call(g => g.select('.domain').attr('stroke', '#aaa'))
    .call(g => g.selectAll('text').attr('fill', '#445').attr('font-size', '11px').attr('dx', '-4'))

  const altAxisGroup = svg.append('g').attr('transform', `translate(${margin.left + W}, 0)`)
  pressureTickValues.forEach(P => {
    const y = skY(P)
    const km = altKm(P)
    altAxisGroup.append('line').attr('x1', 0).attr('y1', y).attr('x2', 5).attr('y2', y).attr('stroke', '#aaa')
    altAxisGroup.append('text')
      .attr('x', 8).attr('y', y).attr('dy', '0.35em')
      .attr('fill', '#667').attr('font-size', '10px')
      .text(`${km > 0 ? '~' : ''}${Math.abs(km)}km`)
  })
  altAxisGroup.append('line').attr('x1', 0).attr('y1', margin.top).attr('x2', 0).attr('y2', margin.top + H).attr('stroke', '#aaa')

  const tempTickValues = d3.range(T_MIN, T_MAX + 1, 10)
  const xAxisGroup = svg.append('g').attr('transform', `translate(0, ${margin.top + H})`)
  tempTickValues.forEach(T => {
    const x = skX(T, P_MAX)
    xAxisGroup.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', 5).attr('stroke', '#aaa')
    xAxisGroup.append('text')
      .attr('x', x).attr('y', 18).attr('text-anchor', 'middle')
      .attr('fill', '#445').attr('font-size', '11px')
      .text(`${T}°`)
  })
  xAxisGroup.append('line')
    .attr('x1', margin.left).attr('y1', 0).attr('x2', margin.left + W).attr('y2', 0).attr('stroke', '#aaa')
  xAxisGroup.append('text')
    .attr('x', margin.left + W / 2).attr('y', 42)
    .attr('text-anchor', 'middle').attr('fill', '#667').attr('font-size', '11px')
    .text('Temperature (°C) — Skew-T Log-P')

  svg.append('text')
    .attr('x', margin.left - 44).attr('y', margin.top + H / 2)
    .attr('text-anchor', 'middle').attr('fill', '#667').attr('font-size', '11px')
    .attr('transform', `rotate(-90, ${margin.left - 44}, ${margin.top + H / 2})`)
    .text('hPa')

  const tropopauseY = skY(200)
  svg.append('line')
    .attr('x1', margin.left).attr('y1', tropopauseY)
    .attr('x2', margin.left + W).attr('y2', tropopauseY)
    .attr('stroke', '#3b82f6').attr('stroke-width', 1).attr('stroke-dasharray', '6,3')
    .attr('clip-path', 'url(#rpt-skewt-clip)')
  svg.append('text')
    .attr('x', margin.left + W - 4).attr('y', tropopauseY - 4)
    .attr('text-anchor', 'end').attr('fill', '#3b82f6').attr('font-size', '10px')
    .text('Tropopause')

  svg.append('line')
    .attr('x1', margin.left).attr('y1', skY(100))
    .attr('x2', margin.left + W).attr('y2', skY(100))
    .attr('stroke', '#7c3aed').attr('stroke-width', 1).attr('stroke-dasharray', '5,3')
  svg.append('text')
    .attr('x', margin.left + 4).attr('y', (margin.top + skY(100)) / 2)
    .attr('fill', '#7c3aed').attr('font-size', '10px').attr('font-weight', '600')
    .text('SkyScholar domain')

  const sfc = levels.find(l => l.p != null && l.T != null)
  if (sfc) {
    const lclResult = lclCalc(sfc.T, sfc.Td, sfc.p)
    if (lclResult && lclResult.P_hPa > P_MIN && lclResult.P_hPa < P_MAX) {
      const lclY = skY(lclResult.P_hPa)
      svg.append('line')
        .attr('x1', margin.left).attr('y1', lclY)
        .attr('x2', margin.left + W).attr('y2', lclY)
        .attr('stroke', '#06b6d4').attr('stroke-width', 0.8).attr('stroke-dasharray', '4,3')
        .attr('clip-path', 'url(#rpt-skewt-clip)')
      svg.append('text')
        .attr('x', margin.left + 4).attr('y', lclY - 3)
        .attr('fill', '#0891b2').attr('font-size', '9px')
        .text(`LCL ~${Math.round(lclResult.P_hPa)} hPa`)
    }
  }

  svg.append('rect')
    .attr('x', margin.left).attr('y', margin.top)
    .attr('width', W).attr('height', H)
    .attr('fill', 'none').attr('stroke', '#aaa').attr('stroke-width', 1)

  const svgNode = div.querySelector('svg')
  document.body.removeChild(div)
  return { svgNode, width: W + margin.left + margin.right, height: H + margin.top + margin.bottom }
}

async function tephigramToPng(skewtData) {
  const { svgNode, width, height } = buildTephigramSVGNode(skewtData)
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgNode)
  const encoded = btoa(unescape(encodeURIComponent(svgStr)))
  const dataUrl = `data:image/svg+xml;base64,${encoded}`

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * 2
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')
      ctx.scale(2, 2)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve({ dataUrl: canvas.toDataURL('image/png'), width, height })
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

function renderTrajectoryCanvas(trajectoryData) {
  const CW = 900, CH = 560
  const canvas = document.createElement('canvas')
  canvas.width = CW
  canvas.height = CH
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#f8faff'
  ctx.fillRect(0, 0, CW, CH)

  if (!trajectoryData || trajectoryData.stub || !trajectoryData.points?.length) {
    ctx.fillStyle = '#667788'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('No stored trajectory — run Predict on this flight first.', CW / 2, CH / 2 - 10)
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#99aabb'
    ctx.fillText('Trajectory is saved to the database when Predict is run.', CW / 2, CH / 2 + 16)
    return { dataUrl: canvas.toDataURL('image/png'), width: CW, height: CH }
  }

  const points = trajectoryData.points
  const pad = 64

  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)
  let minLon = Math.min(...lons), maxLon = Math.max(...lons)

  if (trajectoryData.burst) {
    minLat = Math.min(minLat, trajectoryData.burst.lat)
    maxLat = Math.max(maxLat, trajectoryData.burst.lat)
    minLon = Math.min(minLon, trajectoryData.burst.lon)
    maxLon = Math.max(maxLon, trajectoryData.burst.lon)
  }
  if (trajectoryData.predicted_landing_lat != null) {
    minLat = Math.min(minLat, trajectoryData.predicted_landing_lat)
    maxLat = Math.max(maxLat, trajectoryData.predicted_landing_lat)
    minLon = Math.min(minLon, trajectoryData.predicted_landing_lon)
    maxLon = Math.max(maxLon, trajectoryData.predicted_landing_lon)
  }

  const latRange = Math.max(maxLat - minLat, 0.01)
  const lonRange = Math.max(maxLon - minLon, 0.01)

  const scaleX = (CW - 2 * pad) / lonRange
  const scaleY = (CH - 2 * pad) / latRange
  const scale = Math.min(scaleX, scaleY)

  const offsetX = (CW - 2 * pad - lonRange * scale) / 2
  const offsetY = (CH - 2 * pad - latRange * scale) / 2

  const toX = lon => pad + offsetX + (lon - minLon) * scale
  const toY = lat => CH - pad - offsetY - (lat - minLat) * scale

  ctx.strokeStyle = '#dde'
  ctx.lineWidth = 0.8
  for (let i = 0; i <= 5; i++) {
    const lon = minLon + lonRange * i / 5
    const x = toX(lon)
    ctx.beginPath()
    ctx.moveTo(x, pad)
    ctx.lineTo(x, CH - pad)
    ctx.stroke()
    ctx.fillStyle = '#99a'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(lon.toFixed(2) + '°', x, CH - pad + 14)
  }
  for (let i = 0; i <= 4; i++) {
    const lat = minLat + latRange * i / 4
    const y = toY(lat)
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(CW - pad, y)
    ctx.stroke()
    ctx.fillStyle = '#99a'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(lat.toFixed(2) + '°', pad - 4, y + 4)
  }

  const alts = points.map(p => p.alt_m ?? 0)
  const maxAlt = Math.max(...alts) || 1

  ctx.lineWidth = 2.5
  for (let i = 1; i < points.length; i++) {
    const t = (points[i].alt_m ?? 0) / maxAlt
    const r = Math.round(59 + t * (239 - 59))
    const g = Math.round(130 + t * (68 - 130))
    const b = Math.round(246 + t * (60 - 246))
    ctx.strokeStyle = `rgb(${r},${g},${b})`
    ctx.beginPath()
    ctx.moveTo(toX(points[i - 1].lon), toY(points[i - 1].lat))
    ctx.lineTo(toX(points[i].lon), toY(points[i].lat))
    ctx.stroke()
  }

  function drawMarker(x, y, fillColor, strokeColor, label, labelOffset) {
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2
    ctx.stroke()
    if (label) {
      ctx.fillStyle = '#223'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(label, x + (labelOffset?.x ?? 11), y + (labelOffset?.y ?? 4))
    }
  }

  drawMarker(toX(points[0].lon), toY(points[0].lat), '#22c55e', '#16a34a', 'Launch')

  if (trajectoryData.burst) {
    const bx = toX(trajectoryData.burst.lon)
    const by = toY(trajectoryData.burst.lat)
    drawMarker(bx, by, '#a855f7', '#7e22ce',
      `Burst ${trajectoryData.burst.alt_m ? (trajectoryData.burst.alt_m / 1000).toFixed(1) + ' km' : ''}`)
  }

  if (trajectoryData.predicted_landing_lat != null) {
    drawMarker(
      toX(trajectoryData.predicted_landing_lon),
      toY(trajectoryData.predicted_landing_lat),
      '#ef4444', '#b91c1c', 'Landing'
    )
  }

  ctx.strokeStyle = '#ccc'
  ctx.lineWidth = 1
  ctx.strokeRect(pad, pad, CW - 2 * pad, CH - 2 * pad)

  const legendItems = [
    { color: '#22c55e', label: 'Launch' },
    { color: '#a855f7', label: 'Burst' },
    { color: '#ef4444', label: 'Predicted Landing' },
  ]
  legendItems.forEach((item, i) => {
    const lx = CW - pad - 140
    const ly = pad + 16 + i * 20
    ctx.beginPath()
    ctx.arc(lx, ly, 6, 0, Math.PI * 2)
    ctx.fillStyle = item.color
    ctx.fill()
    ctx.fillStyle = '#223'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(item.label, lx + 12, ly + 4)
  })

  return { dataUrl: canvas.toDataURL('image/png'), width: CW, height: CH }
}

function addPageHeader(pdf, pageNum, totalPages, flightId) {
  pdf.setFillColor(26, 26, 46)
  pdf.rect(0, 0, 210, 8, 'F')
  pdf.setTextColor(76, 201, 240)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text('SKYSCHOLAR', 15, 5.5)
  pdf.setTextColor(180, 190, 200)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Flight Report · ${flightId}`, 50, 5.5)
  pdf.text(`Page ${pageNum} of ${totalPages}`, 195, 5.5, { align: 'right' })
}

function addSectionTitle(pdf, title, y) {
  pdf.setFillColor(240, 242, 245)
  pdf.rect(15, y - 4, 180, 7, 'F')
  pdf.setTextColor(100, 100, 110)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.text(title, 17, y + 0.5)
  return y + 8
}

function addDataRow(pdf, label, value, y, shade) {
  if (shade) {
    pdf.setFillColor(248, 250, 255)
    pdf.rect(15, y - 3.5, 180, 6.5, 'F')
  }
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(100, 100, 110)
  pdf.text(label, 17, y + 0.5)
  pdf.setTextColor(26, 26, 46)
  pdf.setFont('helvetica', 'bold')
  pdf.text(String(value ?? '—'), 85, y + 0.5)
  return y + 7
}

function addAtmosphericTable(pdf, levels, y) {
  const headers = ['Pressure', 'Alt ~', 'Temp', 'Dew Pt', 'Wind Dir', 'Wind Spd']
  const colX = [17, 52, 87, 117, 147, 172]

  pdf.setFillColor(26, 26, 46)
  pdf.rect(15, y - 3.5, 180, 6.5, 'F')
  pdf.setTextColor(180, 200, 210)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  headers.forEach((h, i) => pdf.text(h, colX[i], y + 0.5))
  y += 7

  const targetPressures = [1000, 850, 700, 500, 300, 200, 100]
  let rowIdx = 0
  targetPressures.forEach(target => {
    const lvl = levels.filter(l => l.p != null)
      .reduce((best, l) => Math.abs(l.p - target) < Math.abs((best?.p ?? 9999) - target) ? l : best, null)
    if (!lvl || Math.abs(lvl.p - target) > target * 0.2) return

    if (rowIdx % 2 === 0) {
      pdf.setFillColor(248, 250, 255)
      pdf.rect(15, y - 3.5, 180, 6.5, 'F')
    }
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(40, 50, 60)

    const cells = [
      `${Math.round(lvl.p)} hPa`,
      `~${altKm(lvl.p)} km`,
      lvl.T != null ? `${lvl.T.toFixed(1)}°C` : '—',
      lvl.Td != null ? `${lvl.Td.toFixed(1)}°C` : '—',
      lvl.wind_dir != null ? `${Math.round(lvl.wind_dir)}°` : '—',
      lvl.wind_speed_mps != null ? `${lvl.wind_speed_mps.toFixed(1)} m/s` : '—',
    ]
    cells.forEach((c, i) => pdf.text(c, colX[i], y + 0.5))
    y += 7
    rowIdx++
  })
  return y
}

export async function generateFlightReport(flight, skewtData, trajectoryData, stationName) {
  const totalPages = 3

  const [tephiResult] = await Promise.allSettled([
    skewtData?.levels?.length > 0 ? tephigramToPng(skewtData) : Promise.resolve(null),
  ])
  const tephiImg = tephiResult.status === 'fulfilled' ? tephiResult.value : null

  const trajImg = renderTrajectoryCanvas(trajectoryData)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })

  // -- PAGE 1: Cover + Master Data + Atmospheric Analytics --

  pdf.setFillColor(26, 26, 46)
  pdf.rect(0, 0, 210, 44, 'F')

  pdf.setFillColor(76, 201, 240)
  pdf.rect(0, 44, 210, 1.5, 'F')

  pdf.setTextColor(76, 201, 240)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text('SKYSCHOLAR', 15, 18)

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(13)
  pdf.text('FLIGHT REPORT', 15, 28)

  pdf.setTextColor(140, 160, 180)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.text(`${flight.flight_id}  ·  Generated ${new Date().toUTCString()}`, 15, 37)

  let y = 56

  y = addSectionTitle(pdf, 'MASTER DATA', y)

  const masterRows = [
    ['Flight ID', flight.flight_id],
    ['Station', stationName || flight.station_id],
    ['Status', flight.status],
    ['Launch Time', flight.launch_time ? new Date(flight.launch_time).toUTCString() : '—'],
    ['Burst Altitude', flight.burst_altitude_m != null ? `${flight.burst_altitude_m.toLocaleString()} m` : '—'],
    ['Max Altitude', flight.max_altitude_m != null ? `${flight.max_altitude_m.toLocaleString()} m` : '—'],
    ['Ascent Rate', flight.ascent_rate_mps != null ? `${flight.ascent_rate_mps} m/s` : '—'],
    ['Descent Rate', flight.descent_rate_mps != null ? `${flight.descent_rate_mps} m/s` : '—'],
    ['Notes', flight.notes || '—'],
  ]
  masterRows.forEach((row, i) => {
    y = addDataRow(pdf, row[0], row[1], y, i % 2 === 0)
  })

  y += 8

  if (skewtData?.levels?.length > 0) {
    const levelsForTable = skewtData.levels
    const fitsOnPage = y + 80 < 285

    if (fitsOnPage) {
      y = addSectionTitle(pdf, 'ATMOSPHERIC ANALYTICS — KEY LEVELS', y)
      y = addAtmosphericTable(pdf, levelsForTable, y)
    }
  }

  addPageHeader(pdf, 1, totalPages, flight.flight_id)

  // -- PAGE 2: Tephigram --

  pdf.addPage()
  addPageHeader(pdf, 2, totalPages, flight.flight_id)

  let ty = 16
  pdf.setTextColor(26, 26, 46)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('TEPHIGRAM (Skew-T Log-P)', 15, ty)
  ty += 5

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(100, 110, 120)
  pdf.text(
    `Atmospheric sounding · Flight ${skewtData?.flight_id || flight.flight_id}` +
    (skewtData?.station_id ? ` · Station ${skewtData.station_id}` : '') +
    (skewtData?.launch_time ? ` · ${new Date(skewtData.launch_time).toUTCString()}` : ''),
    15, ty
  )
  ty += 6

  if (tephiImg) {
    const imgW = 178
    const imgH = imgW * tephiImg.height / tephiImg.width
    pdf.addImage(tephiImg.dataUrl, 'PNG', 15, ty, imgW, imgH)
    ty += imgH + 4
  } else {
    pdf.setFillColor(240, 242, 245)
    pdf.rect(15, ty, 178, 30, 'F')
    pdf.setTextColor(100, 110, 120)
    pdf.setFontSize(9)
    pdf.text('No sounding data available for this flight.', 104, ty + 16, { align: 'center' })
    ty += 34
  }

  if (skewtData?.levels?.length > 0) {
    const levelsForTable = skewtData.levels
    if (ty + 70 < 285) {
      ty += 4
      ty = addSectionTitle(pdf, 'KEY ATMOSPHERIC LEVELS', ty)
      addAtmosphericTable(pdf, levelsForTable, ty)
    }
  }

  // -- PAGE 3: Trajectory Prediction --

  pdf.addPage()
  addPageHeader(pdf, 3, totalPages, flight.flight_id)

  let py = 16
  pdf.setTextColor(26, 26, 46)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('TRAJECTORY PREDICTION', 15, py)
  py += 5

  if (trajectoryData?.stub) {
    pdf.setFillColor(255, 250, 230)
    pdf.rect(15, py, 178, 12, 'F')
    pdf.setTextColor(160, 100, 20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.text('balloon-predictor is not installed. Trajectory data unavailable.', 17, py + 7.5)
    py += 16
  }

  const mapW = 178
  const mapH = mapW * trajImg.height / trajImg.width
  pdf.addImage(trajImg.dataUrl, 'PNG', 15, py, mapW, mapH)
  py += mapH + 6

  if (!trajectoryData?.stub && trajectoryData) {
    py = addSectionTitle(pdf, 'PREDICTION SUMMARY', py)

    const predRows = []
    if (trajectoryData.predicted_landing_lat != null) {
      predRows.push(['Predicted Landing', `${trajectoryData.predicted_landing_lat.toFixed(4)}°, ${trajectoryData.predicted_landing_lon.toFixed(4)}°`])
    }
    if (trajectoryData.burst) {
      predRows.push(['Burst Point', `${trajectoryData.burst.alt_m?.toLocaleString()} m · ${trajectoryData.burst.lat?.toFixed(4)}°, ${trajectoryData.burst.lon?.toFixed(4)}°`])
      predRows.push(['Burst Time', `${new Date(trajectoryData.burst.time).toUTCString()}`])
    }
    if (trajectoryData.forecast_cycle) {
      predRows.push(['Forecast Cycle', trajectoryData.forecast_cycle])
    }
    predRows.push(['Track Points', String(trajectoryData.point_count ?? trajectoryData.points?.length ?? '—')])

    predRows.forEach((row, i) => {
      py = addDataRow(pdf, row[0], row[1], py, i % 2 === 0)
    })
  }

  pdf.save(`${flight.flight_id}_skyscholar_report.pdf`)
}
