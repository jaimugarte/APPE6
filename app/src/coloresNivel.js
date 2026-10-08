import { NIVELES } from './util.js'

// Un color por nivel, para reconocerlos de un vistazo en el calendario
const PALETA = ['#16a34a', '#65a30d', '#0d9488', '#0891b2', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#ea580c', '#b45309', '#57534e']
export const COLOR_TODOS = '#475569' // actividades para todos los niveles

export function colorNivel(n) {
  const i = NIVELES.indexOf(n)
  if (i >= 0) return PALETA[i % PALETA.length]
  let h = 0
  for (const c of n || '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}

const orden = n => { const i = NIVELES.indexOf(n); return i < 0 ? 99 : i }
export const ordenarNiveles = l => [...l].sort((a, b) => orden(a) - orden(b) || a.localeCompare(b, 'es'))

// Color de un plan: el de su primer nivel (o neutro si es para todos)
export const colorPlan = p => (p.niveles?.length ? colorNivel(ordenarNiveles(p.niveles)[0]) : COLOR_TODOS)

// ¿Se ve el plan con este filtro de nivel? Un plan para todos los niveles se ve siempre
export const pasaFiltro = (p, nivel) => !nivel || !p.niveles?.length || p.niveles.includes(nivel)

// Fondo de un plan en el calendario: el color de su nivel (franjas si va a varios niveles; gris suave si es para todos)
export function fondoPlan(p) {
  const cols = p.niveles?.length ? ordenarNiveles(p.niveles).map(colorNivel) : [COLOR_TODOS]
  const t = c => `color-mix(in srgb, ${c} 30%, #fff)`
  if (cols.length === 1) return t(cols[0])
  const paso = 100 / cols.length
  return `linear-gradient(135deg, ${cols.map((c, i) => `${t(c)} ${i * paso}% ${(i + 1) * paso}%`).join(', ')})`
}

// Grupos de niveles que se eligen de un golpe en el calendario
export const GRUPOS_NIVEL = [
  ['Club', '5º EP – 2º ESO', ['5º primaria', '6º primaria', '1º ESO', '2º ESO']],
  ['Sr', '3º ESO – 2º Bach.', ['3º ESO', '4º ESO', '1º Bachillerato', '2º Bachillerato']]
]
