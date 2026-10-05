// Cálculos puros de los campos de trabajo (sin React ni base de datos)

// Importe escrito por una persona («12,5», «12.50») → euros con 2 decimales, o null si no es válido
export function leerImporte(txt) {
  const t = String(txt ?? '').trim().replace(',', '.')
  if (t === '') return 0
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(parseFloat(t) * 100) / 100
}

// Reparte un total entre n personas a partes iguales, sin perder céntimos: los primeros reciben 1 céntimo más
export function repartir(total, n) {
  if (!n) return []
  const cent = Math.round(total * 100)
  const base = Math.floor(cent / n), resto = cent - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

const redondear = n => Math.round(n * 100) / 100

// Una fila por socio con lo ganado, lo retirado y lo disponible
export function resumenPorSocio(socios, participantes, retiradas) {
  const gan = new Map(), ret = new Map(), nCampos = new Map()
  for (const p of participantes) {
    gan.set(p.socio_id, (gan.get(p.socio_id) || 0) + Number(p.importe))
    nCampos.set(p.socio_id, (nCampos.get(p.socio_id) || 0) + 1)
  }
  for (const r of retiradas) ret.set(r.socio_id, (ret.get(r.socio_id) || 0) + Number(r.importe))
  return socios.map(s => {
    const ganado = redondear(gan.get(s.id) || 0), retirado = redondear(ret.get(s.id) || 0)
    return { ...s, ganado, retirado, disponible: redondear(ganado - retirado), campos: nCampos.get(s.id) || 0 }
  })
}
