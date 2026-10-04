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
