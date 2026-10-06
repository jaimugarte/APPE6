// Generador mínimo de PDF para hojas de etiquetas (A4). Sin dependencias: texto con las fuentes estándar
// Helvetica y Helvetica-Bold, que todos los visores e impresoras traen. Codificación Latin-1 (ñ, acentos, º, ª…).

const MM = 72 / 25.4
const A4 = [595.28, 841.89]

// Formatos de hojas de etiquetas A4 habituales (medidas en mm)
export const FORMATOS = {
  e24: { nombre: '24 por hoja · 63,5 × 33,9 mm (3 × 8)', cols: 3, filas: 8, w: 63.5, h: 33.9, izq: 7.2, arriba: 12.9, hueco: 2.5 },
  e21: { nombre: '21 por hoja · 63,5 × 38,1 mm (3 × 7)', cols: 3, filas: 7, w: 63.5, h: 38.1, izq: 7.2, arriba: 15.15, hueco: 2.5 },
  e14: { nombre: '14 por hoja · 99,1 × 38,1 mm (2 × 7)', cols: 2, filas: 7, w: 99.1, h: 38.1, izq: 4.65, arriba: 15.15, hueco: 2.5 },
  e8: { nombre: '8 por hoja · 99,1 × 67,7 mm (2 × 4)', cols: 2, filas: 4, w: 99.1, h: 67.7, izq: 4.65, arriba: 13, hueco: 2.5 }
}

// Anchuras de Helvetica (AFM) de ASCII 32–126, en milésimas de punto
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

// Pasa a Latin-1: lo que no existe se sustituye por la letra sin acento o por «?»
export function aLatin1(s) {
  let out = ''
  for (const ch of String(s ?? '').replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0)
    if (c >= 32 && c <= 126 || c >= 160 && c <= 255) out += ch
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      out += base.length === 1 && base.charCodeAt(0) < 127 && base.charCodeAt(0) >= 32 ? base : (c === 0x2019 ? "'" : c === 0x2013 || c === 0x2014 ? '-' : '?')
    }
  }
  return out
}

const anchoCar = (ch, tabla) => {
  const c = ch.charCodeAt(0)
  if (c >= 32 && c <= 126) return tabla[c - 32]
  if (c === 186 || c === 170) return 365                 // º ª
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')[0]
  const b = base?.charCodeAt(0)
  return b >= 32 && b <= 126 ? tabla[b - 32] : 556
}
export const anchoTexto = (t, pt, negrita) => [...t].reduce((a, ch) => a + anchoCar(ch, negrita ? WB : W), 0) * pt / 1000

// Parte un texto en líneas que quepan en `max` puntos; las palabras demasiado largas se cortan
export function partir(texto, pt, negrita, max) {
  const lineas = []
  let actual = ''
  const pon = p => {
    while (anchoTexto(p, pt, negrita) > max) {
      let n = p.length - 1
      while (n > 1 && anchoTexto(p.slice(0, n), pt, negrita) > max) n--
      if (actual) { lineas.push(actual); actual = '' }
      lineas.push(p.slice(0, n)); p = p.slice(n)
    }
    const prueba = actual ? actual + ' ' + p : p
    if (anchoTexto(prueba, pt, negrita) <= max) actual = prueba
    else { if (actual) lineas.push(actual); actual = p }
  }
  for (const p of texto.split(' ').filter(Boolean)) pon(p)
  if (actual) lineas.push(actual)
  return lineas
}

const esc = s => s.replace(/[\\()]/g, m => '\\' + m)
const n2 = x => (Math.round(x * 100) / 100).toString()

// Calcula las líneas de una etiqueta ajustando el tamaño de letra para que quepa en su caja
export function maquetar(et, caja) {
  const titulo = aLatin1(et.titulo), dir = (et.direccion || []).map(aLatin1)
  const maxW = caja.w * MM - 2 * 5 * MM, maxH = caja.h * MM - 2 * 3 * MM
  for (let pt = 12; pt >= 6; pt -= 0.5) {
    const lead = pt * 1.25
    const lt = partir(titulo, pt + 1, true, maxW).map(t => ({ t, negrita: true, pt: pt + 1 }))
    const ld = dir.flatMap(d => partir(d, pt, false, maxW)).map(t => ({ t, negrita: false, pt }))
    const lineas = [...lt, ...ld]
    const alto = lt.length * (pt + 1) * 1.25 + ld.length * lead + (ld.length ? pt * 0.4 : 0)
    if (alto <= maxH || pt === 6) {
      // Si ni con 6 pt cabe, se recorta con puntos suspensivos
      const caben = Math.max(1, Math.floor((maxH + 1) / lead))
      if (lineas.length > caben && pt === 6) { lineas.length = caben; lineas[caben - 1].t = lineas[caben - 1].t.replace(/.{0,3}$/, '...') }
      return { lineas, alto: Math.min(alto, maxH) }
    }
  }
}

// etiquetas: [{ titulo, direccion: [líneas] }]. opciones: { formato, saltar (etiquetas ya usadas de la primera hoja), marco }
export function generarPdfEtiquetas(etiquetas, { formato = 'e24', saltar = 0, marco = false } = {}) {
  const f = FORMATOS[formato]
  if (!f) throw new Error('Formato de etiquetas desconocido')
  const porHoja = f.cols * f.filas
  const huecos = [...Array(Math.max(0, saltar)).fill(null), ...etiquetas]
  const nHojas = Math.max(1, Math.ceil(huecos.length / porHoja))

  const contenidos = []
  for (let h = 0; h < nHojas; h++) {
    let c = ''
    for (let i = 0; i < porHoja; i++) {
      const k = h * porHoja + i
      const col = i % f.cols, fila = Math.floor(i / f.cols)
      const x = (f.izq + col * (f.w + f.hueco)) * MM
      const yTop = A4[1] - (f.arriba + fila * f.h) * MM
      if (marco) c += `0.8 G 0.4 w ${n2(x)} ${n2(yTop - f.h * MM)} ${n2(f.w * MM)} ${n2(f.h * MM)} re S\n`
      const et = huecos[k]
      if (!et) continue
      const { lineas, alto } = maquetar(et, f)
      let y = yTop - (f.h * MM - alto) / 2
      for (const l of lineas) {
        y -= l.pt * 1.0
        c += `BT /${l.negrita ? 'F2' : 'F1'} ${n2(l.pt)} Tf ${n2(x + 5 * MM)} ${n2(y)} Td (${esc(l.t)}) Tj ET\n`
        y -= l.pt * 0.25
      }
    }
    contenidos.push(c)
  }

  // Objetos: 1 catálogo, 2 páginas, 3 y 4 fuentes, luego (página, contenido) por hoja
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${contenidos.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${nHojas} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ]
  contenidos.forEach((c, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`)
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}endstream`)
  })
  let pdf = '%PDF-1.4\n'
  const pos = []
  objs.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255
  return bytes
}
