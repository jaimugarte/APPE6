// Niveles habituales. El campo admite texto libre; esta lista solo sirve de sugerencia.
export const NIVELES = [
  '1º primaria', '2º primaria', '3º primaria', '4º primaria', '5º primaria', '6º primaria',
  '1º ESO', '2º ESO', '3º ESO', '4º ESO',
  '1º Bachillerato', '2º Bachillerato',
  'Universidad'
]

// Fecha de hoy en hora local, formato AAAA-MM-DD
export const hoy = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const fecha = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES') : '')

export const edad = d => {
  if (!d) return null
  const n = new Date(d + 'T00:00:00'), h = new Date()
  let a = h.getFullYear() - n.getFullYear()
  if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--
  return a
}

export const normalizarIban = s => (s || '').replace(/\s+/g, '').toUpperCase()

// Validación IBAN por formato y dígitos de control (módulo 97)
export function ibanValido(s) {
  const i = normalizarIban(s)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return false
  let resto = 0
  for (const ch of i.slice(4) + i.slice(0, 4)) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}

export const esEmail = s => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// ---------- Periodos de actividad ----------
const p2 = n => String(n).padStart(2, '0')
const aIso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

// Inicio del periodo que contiene la fecha. Coincide con inicio_periodo() de la base de datos:
// lunes de la semana, o día 1 del mes, trimestre o año.
export function inicioPeriodo(f, per) {
  const d = deIso(f)
  if (per === 'semanal') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  else if (per === 'mensual') d.setDate(1)
  else if (per === 'trimestral') { d.setDate(1); d.setMonth(d.getMonth() - (d.getMonth() % 3)) }
  else { d.setDate(1); d.setMonth(0) }
  return aIso(d)
}

export function sumarPeriodos(inicio, per, n) {
  const d = deIso(inicio)
  if (per === 'semanal') d.setDate(d.getDate() + 7 * n)
  else if (per === 'mensual') d.setMonth(d.getMonth() + n)
  else if (per === 'trimestral') d.setMonth(d.getMonth() + 3 * n)
  else d.setFullYear(d.getFullYear() + n)
  return aIso(d)
}

// Último día (incluido) del periodo
export function finPeriodo(inicio, per) {
  const d = deIso(sumarPeriodos(inicio, per, 1))
  d.setDate(d.getDate() - 1)
  return aIso(d)
}

export function etiquetaPeriodo(inicio, per) {
  const d = deIso(inicio)
  if (per === 'semanal') {
    const f = deIso(finPeriodo(inicio, per))
    const c = { day: 'numeric', month: 'short' }
    return `Semana del ${d.toLocaleDateString('es-ES', c)} al ${f.toLocaleDateString('es-ES', { ...c, year: 'numeric' })}`
  }
  if (per === 'mensual') {
    const t = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    return t[0].toUpperCase() + t.slice(1)
  }
  if (per === 'trimestral') return `${Math.floor(d.getMonth() / 3) + 1}.º trimestre ${d.getFullYear()}`
  return `Año ${d.getFullYear()}`
}
