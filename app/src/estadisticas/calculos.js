// Cálculos puros de las estadísticas (sin React ni Supabase, para poder probarlos con node).
//
// Modelo de asistencia: en cada periodo, cada socio figura como «No» hasta que se marca «Sí».
// Solo se guardan las asistencias. El porcentaje es asistentes / socios del periodo, donde los socios
// del periodo son los que estaban de alta en algún momento del mismo (más los que ya tengan asistencia).
import { NIVELES, edad, inicioPeriodo, sumarPeriodos, finPeriodo, abrev } from '../util.js'

const p2 = n => String(n).padStart(2, '0')

export const estabaActivo = (s, f) =>
  (s.periodos_alta || []).some(p => p.fecha_alta <= f && (!p.fecha_baja || p.fecha_baja >= f))

const elegible = (s, ini, fin) =>
  (s.periodos_alta || []).some(p => p.fecha_alta <= fin && (!p.fecha_baja || p.fecha_baja >= ini))

const ultimoDia = ym => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${p2(new Date(y, m, 0).getDate())}`
}

// Inicio del curso en vigor: el 1 de septiembre más reciente
export function inicioCurso(hoyIso) {
  const [y, m] = hoyIso.split('-').map(Number)
  return `${m >= 9 ? y : y - 1}-09-01`
}

// Meses que cubre un rango (el mes de inicio y el mes final cuentan)
export function mesesDesde(desdeIso, hastaIso) {
  const [dy, dm] = desdeIso.split('-').map(Number)
  const [hy, hm] = hastaIso.split('-').map(Number)
  return (hy - dy) * 12 + (hm - dm) + 1
}

// Los n meses que terminan en el mes de «hasta» (formato AAAA-MM)
export function ultimosMeses(hastaIso, n) {
  let [y, m] = hastaIso.slice(0, 7).split('-').map(Number)
  const out = []
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${p2(m)}`)
    m--; if (m === 0) { m = 12; y-- }
  }
  return out
}

const etiquetaMes = ym => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace('.', '')
}

// Socios activos al final de cada mes, y altas y bajas ocurridas en el mes.
// «Altas» cuenta cada periodo de alta nuevo, así que incluye reincorporaciones.
export function serieSocios(socios, hastaIso, n) {
  return ultimosMeses(hastaIso, n).map(ym => {
    const ini = `${ym}-01`, fin = ultimoDia(ym)
    const ref = fin > hastaIso ? hastaIso : fin
    let activos = 0, altas = 0, bajas = 0
    for (const s of socios) {
      if (estabaActivo(s, ref)) activos++
      for (const p of s.periodos_alta || []) {
        if (p.fecha_alta >= ini && p.fecha_alta <= fin) altas++
        if (p.fecha_baja && p.fecha_baja >= ini && p.fecha_baja <= fin) bajas++
      }
    }
    return { mes: ym, etiqueta: etiquetaMes(ym), activos, altas, bajas }
  })
}

const ordenNivel = (a, b) => {
  const ia = NIVELES.indexOf(a), ib = NIVELES.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return a.localeCompare(b, 'es')
}

export function porNivel(socios, hastaIso) {
  const cuenta = new Map()
  for (const s of socios) {
    if (!estabaActivo(s, hastaIso)) continue
    const n = s.nivel || 'Sin nivel'
    cuenta.set(n, (cuenta.get(n) || 0) + 1)
  }
  return [...cuenta].map(([nivel, n]) => ({ nivel, n })).sort((a, b) => ordenNivel(a.nivel, b.nivel))
}

// Histograma de edades de los socios activos (una columna por año, sin huecos)
export function porEdad(socios, hastaIso) {
  const cuenta = new Map()
  let sinFecha = 0
  for (const s of socios) {
    if (!estabaActivo(s, hastaIso)) continue
    const e = edad(s.fecha_nacimiento)
    if (e == null) { sinFecha++; continue }
    cuenta.set(e, (cuenta.get(e) || 0) + 1)
  }
  if (!cuenta.size) return { filas: [], sinFecha }
  const edades = [...cuenta.keys()]
  const filas = []
  for (let e = Math.min(...edades); e <= Math.max(...edades); e++) filas.push({ edad: e, n: cuenta.get(e) || 0 })
  return { filas, sinFecha }
}

// Cuántos periodos de cada actividad cubre un rango de meses (solo para decidir cuántos datos pedir)
export function periodosEnRango(per, meses) {
  if (per === 'semanal') return Math.round((meses * 52) / 12)
  if (per === 'mensual') return meses
  if (per === 'trimestral') return Math.max(2, Math.ceil(meses / 3))
  return Math.max(2, Math.ceil(meses / 12))
}

// Primer día que hay que cargar para cubrir todas las series del rango
export function desdeNecesario(tipos, hastaIso, meses) {
  let min = `${ultimosMeses(hastaIso, meses)[0]}-01`
  for (const t of tipos) {
    const n = periodosEnRango(t.periodicidad, meses)
    const ini = sumarPeriodos(inicioPeriodo(hastaIso, t.periodicidad), t.periodicidad, -(n - 1))
    if (ini < min) min = ini
  }
  return min
}

const etiquetaCorta = (inicio, per) => {
  const [y, m, d] = inicio.split('-').map(Number)
  if (per === 'semanal') return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
  if (per === 'mensual') return etiquetaMes(inicio.slice(0, 7))
  if (per === 'trimestral') return `T${Math.floor((m - 1) / 3) + 1} ${String(y).slice(2)}`
  return String(y)
}

// Recorre cada periodo de cada actividad entre dos fechas y entrega, para cada uno, los socios que
// cuentan en él y si asistieron: cb(tipo, inicioPeriodo, Map(socio_id -> asistió))
function recorrer(registros, socios, tipos, desdeIso, hastaIso, cb) {
  const idx = new Map()
  for (const r of registros) {
    if (!r.asistio) continue
    const k = `${r.tipo_actividad_id}|${r.periodo_inicio}`
    if (!idx.has(k)) idx.set(k, new Set())
    idx.get(k).add(r.socio_id)
  }
  for (const t of tipos) {
    const per = t.periodicidad
    const ultimo = inicioPeriodo(hastaIso, per)
    for (let ini = inicioPeriodo(desdeIso, per); ini <= ultimo; ini = sumarPeriodos(ini, per, 1)) {
      const fin = finPeriodo(ini, per)
      const marcados = idx.get(`${t.id}|${ini}`)
      const part = new Map()
      for (const s of socios) {
        const asistio = !!marcados?.has(s.id)
        if (asistio || elegible(s, ini, fin)) part.set(s.id, asistio)
      }
      cb(t, ini, part)
    }
  }
}

// Porcentaje de asistencia por periodo de una actividad. Un periodo sin socios queda como hueco (pct = null).
export function serieAsistencia(registros, socios, tipo, desdeIso, hastaIso) {
  const out = []
  recorrer(registros, socios, [tipo], desdeIso, hastaIso, (t, inicio, part) => {
    let si = 0
    for (const v of part.values()) if (v) si++
    const total = part.size
    out.push({
      inicio, etiqueta: etiquetaCorta(inicio, t.periodicidad), si, total,
      pct: total ? Math.round((1000 * si) / total) / 10 : null
    })
  })
  return out
}

// Asistencia por mes natural de una actividad (en números absolutos):
//  - distintos: socios distintos que asistieron al menos una vez en el mes
//  - media: asistentes por semana, de media (solo actividades semanales; null en el resto)
// Cada periodo cuenta en el mes en que empieza (las semanas, por su lunes).
export function serieAsistenciaMensual(registros, socios, tipo, desdeIso, hastaIso) {
  const meses = new Map()
  const [dy, dm] = desdeIso.split('-').map(Number)
  const [hy, hm] = hastaIso.split('-').map(Number)
  for (let y = dy, m = dm; y < hy || (y === hy && m <= hm); m === 12 ? (y++, m = 1) : m++) meses.set(`${y}-${p2(m)}`, [])
  recorrer(registros, socios, [tipo], desdeIso, hastaIso, (t, inicio, part) => {
    const asist = [...part].filter(([, v]) => v).map(([id]) => id)
    meses.get(inicio.slice(0, 7))?.push(asist)
  })
  const semanal = tipo.periodicidad === 'semanal'
  return [...meses].map(([ym, periodos]) => {
    const distintos = new Set(periodos.flat()).size
    const media = semanal && periodos.length
      ? Math.round((10 * periodos.reduce((a, l) => a + l.length, 0)) / periodos.length) / 10 : null
    return { mes: ym, etiqueta: etiquetaMes(ym), distintos, media, semanas: periodos.length }
  })
}

// Asistencia media (%) por nivel y actividad en un rango de fechas
export function matrizNivelActividad(registros, socios, tipos, desdeIso, hastaIso) {
  const nivelDe = new Map(socios.map(s => [s.id, s.nivel || 'Sin nivel']))
  const acc = new Map() // `${tipoId}|${nivel}` -> {si, total}
  recorrer(registros, socios, tipos, desdeIso, hastaIso, (t, _ini, part) => {
    for (const [id, asistio] of part) {
      const k = `${t.id}|${nivelDe.get(id)}`
      const c = acc.get(k) || { si: 0, total: 0 }
      c.total++; if (asistio) c.si++
      acc.set(k, c)
    }
  })
  const niveles = [...new Set([...acc.keys()].map(k => k.split('|').slice(1).join('|')))].sort(ordenNivel)
  const usados = tipos.filter(t => niveles.some(n => acc.has(`${t.id}|${n}`)))
  const celdas = []
  usados.forEach((t, x) => niveles.forEach((nv, y) => {
    const c = acc.get(`${t.id}|${nv}`)
    if (c) celdas.push({ x, y, pct: Math.round((1000 * c.si) / c.total) / 10, si: c.si, total: c.total })
  }))
  return { abrevs: usados.map(abrev), nombres: usados.map(t => t.nombre), niveles, celdas }
}

// Asistencia media global (%) en un rango de fechas
export function asistenciaMedia(registros, socios, tipos, desdeIso, hastaIso) {
  let si = 0, total = 0
  recorrer(registros, socios, tipos, desdeIso, hastaIso, (_t, _ini, part) => {
    total += part.size
    for (const v of part.values()) if (v) si++
  })
  return total ? Math.round((1000 * si) / total) / 10 : null
}
