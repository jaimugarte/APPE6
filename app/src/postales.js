// Postales: agrupa a los socios en familias y prepara el texto de cada etiqueta (sin React ni base de datos)
import { NIVELES } from './util.js'

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const ordenNivel = (a, b) => (NIVELES.indexOf(a) + 1 || 99) - (NIVELES.indexOf(b) + 1 || 99) || a.localeCompare(b, 'es')

export const nivelesDe = socios => [...new Set(socios.map(s => s.nivel).filter(Boolean))].sort(ordenNivel)

// Agrupa los socios en familias: comparten el correo de un progenitor, o tienen los mismos apellidos y la misma dirección.
// Devuelve una familia por grupo: { id, nombre: 'Familia García López', direccion, niveles, hijos, aviso }
export function agruparFamilias(socios) {
  const padre = socios.map((_, i) => i)
  const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i] } return i }
  const unir = (a, b) => { padre[raiz(a)] = raiz(b) }
  const porClave = new Map()
  const enlazar = (clave, i) => { if (!clave) return; if (porClave.has(clave)) unir(i, porClave.get(clave)); else porClave.set(clave, i) }
  socios.forEach((s, i) => {
    for (const e of [s.correo_padre, s.correo_madre]) enlazar(e ? 'c:' + e.trim().toLowerCase() : '', i)
    if (norm(s.direccion) && norm(s.apellidos)) enlazar(`d:${norm(s.apellidos)}|${norm(s.direccion)}`, i)
  })
  const grupos = new Map()
  socios.forEach((s, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(s) })

  return [...grupos.values()].map(hijos => {
    hijos = [...hijos].sort((a, b) => ordenNivel(b.nivel || '', a.nivel || '') * -1 || a.nombre.localeCompare(b.nombre, 'es'))
    // Apellidos: los de los hijos, sin repetir (si son distintos, se juntan con « / »)
    const apellidos = []
    for (const h of hijos) if (h.apellidos?.trim() && !apellidos.some(a => norm(a) === norm(h.apellidos))) apellidos.push(h.apellidos.trim())
    // Dirección: la más repetida entre los hijos; si hay varias distintas se avisa
    const cuenta = new Map()
    for (const h of hijos) { const d = (h.direccion || '').trim(); if (d) cuenta.set(norm(d), { d, n: (cuenta.get(norm(d))?.n || 0) + 1 }) }
    const dirs = [...cuenta.values()].sort((a, b) => b.n - a.n)
    return {
      id: hijos.map(h => h.id).sort()[0],
      nombre: 'Familia ' + (apellidos.join(' / ') || 'sin apellidos'),
      direccion: dirs[0]?.d || '',
      niveles: [...new Set(hijos.map(h => h.nivel).filter(Boolean))].sort(ordenNivel),
      hijos: hijos.map(h => h.nombre),
      aviso: dirs.length > 1 ? 'Los hijos tienen direcciones distintas: se usa la más repetida.' : ''
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Familias con algún hijo en los niveles elegidos (lista vacía de niveles = ninguna)
export function familiasDeNiveles(socios, niveles) {
  return agruparFamilias(socios.filter(s => niveles.includes(s.nivel)))
}

// Texto de una etiqueta: primero «Familia …» (en negrita) y debajo la dirección tal como se escribió
export function etiquetaDe(f) {
  const lineas = (f.direccion || '').split(/\r?\n|;/).map(l => l.trim()).filter(Boolean)
  return { titulo: f.nombre, direccion: lineas }
}
