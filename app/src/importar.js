// Importación de socios desde CSV: lectura, validación y detección de duplicados (sin tocar la base de datos).
import { NIVELES, esEmail, nivelPorNacimiento } from './util.js'

export const COLUMNAS = [
  'nombre', 'apellidos', 'fecha_nacimiento', 'nivel', 'fecha_alta',
  'nombre_padre', 'correo_padre', 'movil_padre', 'nombre_madre', 'correo_madre', 'movil_madre',
  'correo_socio', 'direccion', 'codigo_postal', 'localidad', 'provincia', 'alergias', 'es_socio'
]
const OPCIONALES = ['codigo_postal', 'localidad', 'provincia', 'es_socio']   // las plantillas antiguas no las traen

// Ayuda que se muestra junto a la plantilla
export const AYUDA = {
  nombre: 'Obligatorio', apellidos: 'Obligatorio',
  fecha_nacimiento: 'AAAA-MM-DD o DD/MM/AAAA. Obligatoria si no indicas el nivel',
  nivel: 'p. ej. 2º ESO. Si lo dejas vacío se calcula con la fecha de nacimiento',
  fecha_alta: 'Vacía = hoy', nombre_padre: '', correo_padre: 'Identifica a la familia', movil_padre: '',
  nombre_madre: '', correo_madre: 'Identifica a la familia', movil_madre: '', correo_socio: '', direccion: 'Calle, número, piso', codigo_postal: '5 cifras', localidad: '', provincia: '', alergias: '', es_socio: 'sí (vacío) o no, si participa sin ser socio'
}

export const MAX_FILAS = 500
export const MAX_BYTES = 1_000_000
const LARGO = { nombre: 100, apellidos: 150, nivel: 40, nombre_padre: 150, nombre_madre: 150, direccion: 250, codigo_postal: 10, localidad: 100, provincia: 100, alergias: 500, correo_padre: 200, correo_madre: 200, correo_socio: 200 }

// Plantilla: solo la cabecera (con «;» y BOM, para que Excel en español la abra bien)
export const plantillaCsv = () => '﻿' + COLUMNAS.join(';') + '\r\n'

// ---------- Lectura del CSV ----------
export function leerCsv(texto) {
  texto = texto.replace(/^﻿/, '')
  const primera = texto.split(/\r?\n/, 1)[0] || ''
  const sep = [';', ',', '\t'].map(s => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const filas = []; let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += c
    } else if (c === '"' && campo === '') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''; filas.push(fila); fila = []
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return { filas, sin_cerrar: comillas }
}

// Comprueba la cabecera: deben estar todas las columnas de la plantilla y ninguna más (el orden da igual)
export function comprobarCabecera(cab) {
  const nombres = cab.map(c => c.trim().toLowerCase())
  const faltan = COLUMNAS.filter(c => !OPCIONALES.includes(c) && !nombres.includes(c))
  const sobran = nombres.filter(c => c && !COLUMNAS.includes(c))
  const repetidas = nombres.filter((c, i) => c && nombres.indexOf(c) !== i)
  return { ok: !faltan.length && !sobran.length && !repetidas.length, faltan, sobran, repetidas, nombres }
}

// ---------- Normalización y validación ----------
export const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function fechaValida(s, hoyIso) {
  s = s.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  let y, mo, d
  if (m) [y, mo, d] = [m[1], m[2], m[3]].map(Number)
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, mo, y] = [m[1], m[2], m[3]].map(Number)
  else return { error: 'fecha no válida (usa AAAA-MM-DD o DD/MM/AAAA)' }
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { error: 'la fecha no existe' }
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  if (y < 1980) return { error: 'el año es demasiado antiguo' }
  return { iso }
}

function movilValido(s) {
  const v = s.replace(/[\s.\-()]/g, '')
  return /^\+?\d{9,15}$/.test(v) ? v : null
}

const mismoHijo = (a, b) => norm(a.nombre) === norm(b.nombre)
  && (norm(a.apellidos).startsWith(norm(b.apellidos)) || norm(b.apellidos).startsWith(norm(a.apellidos)))
const correosDe = s => [s.correo_padre, s.correo_madre].filter(Boolean).map(e => e.toLowerCase())
const comparten = (a, b) => correosDe(a).some(e => correosDe(b).includes(e))

// filas: matriz del CSV sin cabecera ya mapeada a objetos. existentes: socios que ve quien importa.
// opciones: { hoyIso, nivelesPermitidos (null = cualquiera) }
export function analizar(objetos, existentes, { hoyIso, nivelesPermitidos = null }) {
  const out = []
  objetos.forEach((o, idx) => {
    const fila = idx + 2 // número de fila en la hoja (la 1 es la cabecera)
    const errores = [], avisos = []
    const d = Object.fromEntries(COLUMNAS.map(c => [c, (o[c] ?? '').trim()]))
    for (const [c, max] of Object.entries(LARGO)) if (d[c].length > max) errores.push(`${c}: demasiado largo (máx. ${max})`)
    if (!d.nombre) errores.push('falta el nombre')
    if (!d.apellidos) errores.push('faltan los apellidos')
    for (const c of ['correo_padre', 'correo_madre', 'correo_socio']) {
      d[c] = d[c].toLowerCase()
      if (d[c] && !esEmail(d[c])) errores.push(`${c} no es un correo válido`)
    }
    {
      const v = d.es_socio.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (['', 'si', 's', '1', 'true', 'x'].includes(v)) d.es_socio = 'si'
      else if (['no', 'n', '0', 'false'].includes(v)) d.es_socio = 'no'
      else errores.push('es_socio debe ser «sí» o «no»')
    }
    if (d.codigo_postal && !/^\d{5}$/.test(d.codigo_postal)) errores.push('codigo_postal debe tener 5 cifras')
    for (const c of ['movil_padre', 'movil_madre']) if (d[c]) {
      const v = movilValido(d[c]); if (v) d[c] = v; else errores.push(`${c} no es un teléfono válido`)
    }
    if (d.fecha_nacimiento) {
      const r = fechaValida(d.fecha_nacimiento, hoyIso)
      if (r.error) errores.push(`fecha_nacimiento: ${r.error}`)
      else if (r.iso > hoyIso) errores.push('fecha_nacimiento: está en el futuro')
      else d.fecha_nacimiento = r.iso
    }
    if (d.fecha_alta) {
      const r = fechaValida(d.fecha_alta, hoyIso)
      if (r.error) errores.push(`fecha_alta: ${r.error}`)
      else if (r.iso > hoyIso) errores.push('fecha_alta: está en el futuro')
      else if (/^\d{4}-/.test(d.fecha_nacimiento) && r.iso < d.fecha_nacimiento) errores.push('fecha_alta: anterior al nacimiento')
      else d.fecha_alta = r.iso
    }
    if (!d.nivel) {
      const n = /^\d{4}-/.test(d.fecha_nacimiento) ? nivelPorNacimiento(d.fecha_nacimiento, hoyIso) : null
      if (n) { d.nivel = n; d.nivel_calculado = true }
      else errores.push('falta el nivel y no se puede deducir de la fecha de nacimiento')
    } else if (!NIVELES.includes(d.nivel)) avisos.push(`nivel «${d.nivel}» no es de la lista habitual`)
    if (d.nivel && nivelesPermitidos && !nivelesPermitidos.includes(d.nivel)) errores.push(`el nivel «${d.nivel}» no es de los tuyos`)
    if (!d.correo_padre && !d.correo_madre) avisos.push('sin correo de progenitor: no se puede detectar si ya existe ni vincular a la familia')
    out.push({ fila, datos: d, errores, avisos, estado: errores.length ? 'error' : 'nuevo', existente: null })
  })

  // Repetidos dentro del propio archivo y duplicados con socios que ya existen
  const vistos = []
  for (const it of out) {
    if (it.estado === 'error') continue
    const previo = vistos.find(v => mismoHijo(v.datos, it.datos) && comparten(v.datos, it.datos))
    if (previo) { it.estado = 'error'; it.errores.push(`repetido en el archivo (igual que la fila ${previo.fila})`); continue }
    vistos.push(it)
    const ex = existentes.find(e => mismoHijo(e, it.datos) && comparten(e, it.datos))
    if (ex) { it.estado = 'duplicado'; it.existente = ex }
    else {
      const parecido = existentes.find(e => mismoHijo(e, it.datos))
      if (parecido) it.avisos.push('hay un socio con el mismo nombre y otros correos: se creará como nuevo')
    }
  }
  return out
}

// Qué columnas se escriben al sobrescribir: solo las que traen valor (una celda vacía nunca borra datos)
export const CAMPOS_SOBRESCRIBIR = COLUMNAS.filter(c => !['fecha_alta', 'es_socio'].includes(c))   // fecha_alta y es_socio solo cuentan al crear
export function cambiosParaSobrescribir(d) {
  return Object.fromEntries(CAMPOS_SOBRESCRIBIR.filter(c => d[c]).map(c => [c, d[c]]))
}
// Para crear: celdas vacías = null
export function datosParaCrear(d) {
  return Object.fromEntries(CAMPOS_SOBRESCRIBIR.map(c => [c, d[c] || null]))
}
