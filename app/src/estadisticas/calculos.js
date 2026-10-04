// Cálculos puros de las estadísticas (sin React ni Supabase, para poder probarlos con node).
import { NIVELES, edad } from '../util.js'
import { inicioPeriodo, sumarPeriodos } from '../util.js'

const p2 = n => String(n).padStart(2, '0')

export const estabaActivo = (s, f) =>
  (s.periodos_alta || []).some(p => p.fecha_alta <= f && (!p.fecha_baja || p.fecha_baja >= f))

const ultimoDia = ym => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${p2(new Date(y, m, 0).getDate())}`
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

// Cuántos periodos de cada actividad cubre un rango de meses
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

// Porcentaje de asistencia por periodo de una actividad: sí / (sí + no).
// Los socios sin marcar no cuentan; un periodo sin marcas queda como hueco (pct = null).
export function serieAsistencia(registros, tipo, hastaIso, n) {
  const per = tipo.periodicidad
  const act = inicioPeriodo(hastaIso, per)
  const inicios = Array.from({ length: n }, (_, i) => sumarPeriodos(act, per, i - (n - 1)))
  const mapa = new Map(inicios.map(i => [i, { si: 0, no: 0 }]))
  for (const r of registros) {
    if (r.tipo_actividad_id !== tipo.id) continue
    const c = mapa.get(r.periodo_inicio)
    if (c) r.asistio ? c.si++ : c.no++
  }
  return inicios.map(inicio => {
    const { si, no } = mapa.get(inicio)
    const marcados = si + no
    return { inicio, etiqueta: etiquetaCorta(inicio, per), si, no, marcados, pct: marcados ? Math.round((1000 * si) / marcados) / 10 : null }
  })
}

// Asistencia media (%) por nivel y actividad desde una fecha
export function matrizNivelActividad(registros, socios, tipos, desdeIso) {
  const nivelDe = new Map(socios.map(s => [s.id, s.nivel || 'Sin nivel']))
  const acc = new Map() // `${tipoId}|${nivel}` -> {si, no}
  for (const r of registros) {
    if (r.periodo_inicio < desdeIso) continue
    const nivel = nivelDe.get(r.socio_id)
    if (nivel === undefined) continue
    const k = `${r.tipo_actividad_id}|${nivel}`
    const c = acc.get(k) || { si: 0, no: 0 }
    r.asistio ? c.si++ : c.no++
    acc.set(k, c)
  }
  const niveles = [...new Set([...acc.keys()].map(k => k.split('|').slice(1).join('|')))].sort(ordenNivel)
  const usados = tipos.filter(t => niveles.some(n => acc.has(`${t.id}|${n}`)))
  const celdas = []
  usados.forEach((t, x) => niveles.forEach((nv, y) => {
    const c = acc.get(`${t.id}|${nv}`)
    if (c) celdas.push({ x, y, pct: Math.round((1000 * c.si) / (c.si + c.no)) / 10, si: c.si, marcados: c.si + c.no })
  }))
  return { tipos: usados.map(t => t.nombre), niveles, celdas }
}

// Asistencia media global (%) desde una fecha
export function asistenciaMedia(registros, desdeIso) {
  let si = 0, tot = 0
  for (const r of registros) {
    if (r.periodo_inicio < desdeIso) continue
    tot++; if (r.asistio) si++
  }
  return tot ? Math.round((1000 * si) / tot) / 10 : null
}
