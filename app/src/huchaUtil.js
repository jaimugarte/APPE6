// Hucha / Dineros: categorías y formato (sin React ni base de datos)
export const CATEGORIAS = [
  ['merienda', 'Merienda'], ['cena', 'Cena'], ['plan', 'Plan'], ['convivencia', 'Convivencia'], ['curso_retiro', 'Curso de retiro'], ['otro', 'Otro']
]
const ETIQ = Object.fromEntries([...CATEGORIAS, ['campo_trabajo', 'Trabajo'], ['campo_retirada', 'Retirada de trabajos']])
export const etiquetaCategoria = c => ETIQ[c] || c

// Texto del movimiento: su concepto o, si no lo tiene, la categoría
export const conceptoDe = m => (m.concepto || '').trim() || etiquetaCategoria(m.categoria)

// Importe con signo explícito: «+7 €», «−1,5 €» (el saldo usa el mismo formato salvo el «+»)
export function eurSigno(n, mas = true) {
  const v = Math.round(Number(n) * 100) / 100
  const t = Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '−' : mas && v > 0 ? '+' : ''}${t} €`
}

// Lee un importe escrito por una persona: «3», «3,5», «3.50». Devuelve null si no es válido o es 0.
export function leerImporteHucha(txt) {
  const t = String(txt ?? '').trim().replace(',', '.')
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}

export const claseSaldo = n => (Number(n) < 0 ? 'saldo-neg' : Number(n) > 0 ? 'saldo-pos' : 'saldo-cero')
