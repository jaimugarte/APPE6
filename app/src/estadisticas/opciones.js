// Opciones de ECharts. Paleta validada con la guía de visualización (modo claro, superficie #ffffff):
// serie 1 azul y serie 2 naranja pasan separación para daltonismo, banda de luminosidad y contraste 3:1.
// Los textos usan siempre tintas de texto, nunca el color de la serie.

export const C = {
  s1: '#2a78d6',        // categórico 1 (azul)
  s2: '#eb6834',        // categórico 2 (naranja)
  texto: '#0b0b0b',
  texto2: '#52514e',
  mudo: '#898781',
  rejilla: '#e1e0d9',
  eje: '#c3c2b7',
  sup: '#ffffff',       // superficie de la tarjeta
  // rampa secuencial de un solo tono (azul, pasos 100 → 700)
  seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", sans-serif'

// Los nombres de actividades y niveles los escribe el encargado: se escapan antes de ir al tooltip (HTML).
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const punto = color => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`

const base = () => ({
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FUENTE, color: C.texto2 },
  aria: { enabled: true }
})

const tip = (trigger, formatter, puntero = 'line') => ({
  trigger, confine: true, formatter,
  backgroundColor: '#ffffff', borderColor: 'rgba(11,11,11,0.10)', borderWidth: 1, padding: [8, 10],
  textStyle: { color: C.texto, fontSize: 13, fontFamily: FUENTE },
  extraCssText: 'box-shadow:0 2px 8px rgba(0,0,0,.08);',
  ...(trigger === 'axis' ? {
    axisPointer: puntero === 'shadow'
      ? { type: 'shadow', shadowStyle: { color: 'rgba(11,11,11,0.04)' } }
      : { type: 'line', lineStyle: { color: C.eje, width: 1 } }
  } : {})
})

const ejeX = (data, extra = {}) => ({
  type: 'category', data,
  axisLine: { lineStyle: { color: C.eje } }, axisTick: { show: false },
  axisLabel: { color: C.mudo, hideOverlap: true },
  ...extra
})

const ejeY = (extra = {}) => ({
  type: 'value',
  axisLine: { show: false }, axisTick: { show: false },
  axisLabel: { color: C.mudo },
  splitLine: { lineStyle: { color: C.rejilla, width: 1, type: 'solid' } },
  ...extra
})

// Línea con área tenue: socios activos al final de cada mes
export function opcionActivos(serie) {
  return {
    ...base(),
    grid: { left: 8, right: 40, top: 16, bottom: 8, containLabel: true },
    tooltip: tip('axis', ps => ps.length
      ? `<b>${esc(ps[0].name)}</b><br/>${punto(C.s1)}${ps[0].value} socios activos` : ''),
    xAxis: ejeX(serie.map(s => s.etiqueta)),
    yAxis: ejeY({ minInterval: 1 }),
    series: [{
      type: 'line', data: serie.map(s => s.activos),
      showSymbol: false, symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 2, color: C.s1, cap: 'round', join: 'round' },
      itemStyle: { color: C.s1, borderColor: C.sup, borderWidth: 2 },
      areaStyle: { color: C.s1, opacity: 0.1 },
      endLabel: { show: true, color: C.texto, fontWeight: 600, valueAnimation: false },
      emphasis: { focus: 'series' }
    }]
  }
}

// Columnas agrupadas: altas (azul) y bajas (naranja) por mes
export function opcionAltasBajas(serie) {
  const mk = (name, key, color) => ({
    name, type: 'bar', data: serie.map(s => s[key]), barMaxWidth: 24, barGap: '10%',
    itemStyle: { color, borderRadius: [4, 4, 0, 0] }, emphasis: { focus: 'series' }
  })
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: {
      top: 0, left: 0, data: ['Altas', 'Bajas'], icon: 'roundRect', itemWidth: 10, itemHeight: 10,
      itemGap: 16, textStyle: { color: C.texto2, fontFamily: FUENTE }
    },
    tooltip: tip('axis', ps => ps.length
      ? `<b>${esc(ps[0].name)}</b>` + ps.map(p => `<br/>${punto(p.color)}${esc(p.seriesName)}: <b>${p.value}</b>`).join('') : '',
      'shadow'),
    xAxis: ejeX(serie.map(s => s.etiqueta)),
    yAxis: ejeY({ minInterval: 1 }),
    series: [mk('Altas', 'altas', C.s1), mk('Bajas', 'bajas', C.s2)]
  }
}

// Columnas de % de asistencia por periodo. Los periodos sin marcas quedan vacíos.
export function opcionAsistencia(serie) {
  let ultimo = -1
  serie.forEach((s, i) => { if (s.pct != null) ultimo = i })
  const data = serie.map((s, i) => {
    const it = { value: s.pct, s }
    if (i === ultimo) it.label = { show: true, position: 'top', formatter: `${s.pct}%`, color: C.texto, fontWeight: 600 }
    return it
  })
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: tip('axis', ps => {
      const s = ps[0]?.data?.s
      if (!s || s.pct == null) return ''
      return `<b>${esc(ps[0].name)}</b><br/>${punto(C.s1)}${s.pct}%: ${s.si} de ${s.total} socios`
    }, 'shadow'),
    xAxis: ejeX(serie.map(s => s.etiqueta)),
    yAxis: ejeY({ min: 0, max: 100, interval: 25, axisLabel: { color: C.mudo, formatter: '{value}%' } }),
    series: [{
      type: 'bar', data, barMaxWidth: 24, barCategoryGap: '30%',
      itemStyle: { color: C.s1, borderRadius: [4, 4, 0, 0] }, label: { show: false }
    }]
  }
}

// Barras horizontales con el valor en la punta: socios activos por nivel
export function opcionNiveles(filas) {
  return {
    ...base(),
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: tip('item', p => `${punto(C.s1)}${esc(p.name)}: <b>${p.value}</b> socios`),
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', inverse: true, data: filas.map(f => f.nivel),
      axisLine: { lineStyle: { color: C.eje } }, axisTick: { show: false }, axisLabel: { color: C.texto2 }
    },
    series: [{
      type: 'bar', data: filas.map(f => f.n), barMaxWidth: 20,
      itemStyle: { color: C.s1, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: C.texto, fontWeight: 600 }
    }]
  }
}

// Histograma de edades
export function opcionEdades(filas) {
  return {
    ...base(),
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: tip('axis', ps => ps.length
      ? `${punto(C.s1)}${esc(ps[0].name)} años: <b>${ps[0].value}</b> socios` : '', 'shadow'),
    xAxis: ejeX(filas.map(f => String(f.edad)), { axisLabel: { color: C.mudo, interval: 0 } }),
    yAxis: ejeY({ minInterval: 1 }),
    series: [{
      type: 'bar', data: filas.map(f => f.n), barMaxWidth: 24, barCategoryGap: '25%',
      itemStyle: { color: C.s1, borderRadius: [4, 4, 0, 0] }
    }]
  }
}

// Mapa de calor: asistencia media (%) por nivel y actividad, rampa azul de un solo tono
export function opcionMapaCalor(m) {
  const data = m.celdas.map(c => ({
    value: [c.x, c.y, c.pct], c,
    // Texto blanco solo sobre los azules oscuros; sobre los medios y claros, tinta oscura
    label: { color: c.pct >= 60 ? '#ffffff' : C.texto }
  }))
  return {
    ...base(),
    grid: { left: 8, right: 8, top: 8, bottom: 64, containLabel: true },
    tooltip: tip('item', p =>
      `<b>${esc(m.nombres[p.value[0]])}</b>, ${esc(m.niveles[p.value[1]])}<br/>${punto(C.s1)}${p.value[2]}% (${p.data.c.si} de ${p.data.c.total})`),
    xAxis: {
      type: 'category', data: m.abrevs, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: C.texto2, interval: 0, fontSize: 11, fontWeight: 600 }
    },
    yAxis: {
      type: 'category', data: m.niveles, inverse: true, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: C.texto2 }
    },
    visualMap: {
      min: 0, max: 100, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemWidth: 12, itemHeight: 160, text: ['100 %', '0 %'], inRange: { color: C.seq },
      textStyle: { color: C.texto2, fontFamily: FUENTE }
    },
    series: [{
      type: 'heatmap', data,
      label: { show: true, formatter: p => `${Math.round(p.value[2])}%`, fontSize: 11 },
      itemStyle: { borderColor: C.sup, borderWidth: 2, borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: C.texto2 } }
    }]
  }
}
