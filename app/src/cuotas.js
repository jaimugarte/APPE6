// Cuotas de las familias. La base de datos calcula lo mismo en cuota_familia(); esta versión sirve para la demo y las pruebas.

export const IMPORTES_POR_DEFECTO = [35, 10, 0]

// Importe del hijo número i (1 = el de alta más antiguo). El último importe vale para todos los siguientes.
export const importeDe = (importes, i) => importes[Math.min(i, importes.length) - 1]

// hijos: socios de alta de la familia, con `desde` (primera fecha de alta) y `creado`. desc: { tipo, valor }.
export function calcularCuota(hijos, importes, desc = { tipo: 'porcentaje', valor: 0 }) {
  const orden = [...hijos].sort((a, b) =>
    (a.desde || '').localeCompare(b.desde || '') || (a.creado || '').localeCompare(b.creado || '') || a.id.localeCompare(b.id))
  const detalle = orden.map((h, i) => ({ socio_id: h.id, orden: i + 1, importe: importeDe(importes, i + 1) }))
  const base = detalle.reduce((s, d) => s + d.importe, 0)
  const descuento = desc.tipo === 'porcentaje' ? Math.round(base * desc.valor) / 100 : Math.min(desc.valor, base)
  return { hijos: orden.length, base, descuento, total: Math.max(base - descuento, 0), detalle }
}

export const eur = n => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 })} €`

export const textoDescuento = (tipo, valor) => (tipo === 'porcentaje' ? `${valor} %` : `${eur(valor)}/mes`)
