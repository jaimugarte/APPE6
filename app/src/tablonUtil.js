import { NIVELES, deIso, aIso } from './util.js'

const restarDias = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() - n); return aIso(d) }

// ¿Una actividad aparece en el tablón? Si está marcada, desde que se crea (o N días antes, si se eligió) hasta que termina.
export const planEnTablon = (p, hoyIso) =>
  p.en_tablon !== false && p.fecha_fin >= hoyIso && (p.tablon_dias_antes == null || hoyIso >= restarDias(p.fecha, p.tablon_dias_antes))

// Un anuncio se retira solo al pasar su fecha de caducidad (si la tiene)
export const anuncioVigente = (a, hoyIso) => !a.caduca || a.caduca >= hoyIso

// Secciones del tablón: «Todo el club» y una por nivel. Una actividad o anuncio para varios niveles sale en cada uno de ellos.
// «permitidos»: niveles que puede ver quien mira (null = todos: el encargado). Lo de otros niveles no se muestra.
// Dentro de cada sección, primero los anuncios (los más recientes arriba) y luego las actividades por fecha.
export function seccionesTablon({ anuncios = [], planes = [], hoyIso, permitidos = null }) {
  const items = [
    ...anuncios.filter(a => anuncioVigente(a, hoyIso)).map(a => ({ tipo: 'anuncio', id: a.id, niveles: a.niveles || [], a })),
    ...planes.filter(p => planEnTablon(p, hoyIso)).map(p => ({ tipo: 'plan', id: p.id, niveles: p.niveles || [], p }))
  ]
  const orden = (x, y) => (x.tipo !== y.tipo ? (x.tipo === 'anuncio' ? -1 : 1)
    : x.tipo === 'anuncio' ? String(y.a.creado_en).localeCompare(String(x.a.creado_en)) : x.p.fecha.localeCompare(y.p.fecha) || x.p.titulo.localeCompare(y.p.titulo, 'es'))
  const secciones = []
  const club = items.filter(i => !i.niveles.length).sort(orden)
  if (club.length) secciones.push({ clave: 'club', titulo: 'Todo el club', nivel: null, items: club })
  const niveles = [...new Set(items.flatMap(i => i.niveles))]
    .filter(n => permitidos === null || permitidos.includes(n))
    .sort((a, b) => (NIVELES.indexOf(a) < 0 ? 99 : NIVELES.indexOf(a)) - (NIVELES.indexOf(b) < 0 ? 99 : NIVELES.indexOf(b)) || a.localeCompare(b, 'es'))
  for (const n of niveles) secciones.push({ clave: n, titulo: n, nivel: n, items: items.filter(i => i.niveles.includes(n)).sort(orden) })
  return secciones
}
