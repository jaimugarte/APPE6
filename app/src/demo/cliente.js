// Sustituto en memoria de supabase-js para el modo demo. Implementa solo lo que usa la app
// (select con relaciones, filtros, insert/update/upsert/delete, rpc y auth) y aplica reglas de
// visibilidad por rol parecidas a las de la base de datos real. No es una réplica exacta de las
// políticas RLS: sirve para ver y probar la app, no para validar la seguridad.
import { crearBD, USUARIOS_DEMO } from './datos.js'
import { nivelPorNacimiento } from '../util.js'
import { calcularCuota, IMPORTES_POR_DEFECTO } from '../cuotas.js'

const PK = {
  perfiles: ['id'], asociaciones: ['id'], apps: ['clave'], asociacion_apps: ['asociacion_id', 'app_clave'],
  accesos_permitidos: ['email'], membresias: ['user_id'], permisos_preceptor: ['asociacion_id', 'app_clave'],
  preceptor_niveles: ['asociacion_id', 'email', 'nivel'], socios: ['id'], periodos_alta: ['id'],
  socios_bancarios: ['socio_id'], socios_equipo: ['socio_id'], familiares_socios: ['email', 'socio_id'], tipos_actividad: ['id'],
  registros_asistencia: ['socio_id', 'tipo_actividad_id', 'periodo_inicio'], global_admins: ['email'],
  enlaces_alta: ['id'], familias: ['id'], permisos_aprobacion: ['asociacion_id', 'email'], solicitudes_alta: ['id'], config_cuotas: ['asociacion_id'], pagos_cuota: ['familia_id', 'mes'], planes: ['id']
}

const REL = {
  'membresias.asociaciones': { tabla: 'asociaciones', local: 'asociacion_id', remoto: 'id', uno: true },
  'asociacion_apps.apps': { tabla: 'apps', local: 'app_clave', remoto: 'clave', uno: true },
  'socios.periodos_alta': { tabla: 'periodos_alta', local: 'id', remoto: 'socio_id', uno: false }
}

const TIPOS_POR_DEFECTO = [
  ['Charla', 'CHAR', 'semanal'], ['Círculo', 'CIRC', 'semanal'], ['Visita de pobres', 'VIPO', 'mensual'],
  ['Retiro mensual', 'RTME', 'mensual'], ['Curso de retiro', 'CRT', 'anual'],
  ['Preceptuación', 'PREC', 'semanal'], ['Sacerdote', 'SACD', 'semanal'], ['Conversación con los padres', 'PADR', 'trimestral']
]

const uuid = () => (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))

// Separa por comas de primer nivel: "*, periodos_alta(a, b)" -> ["*", "periodos_alta(a, b)"]
const partir = s => {
  const out = []; let d = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') d++
    if (ch === ')') d--
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const comparar = (x, y) => {
  if (x === y) return 0
  if (x == null) return 1
  if (y == null) return -1
  if (typeof x === 'string' && typeof y === 'string' && !/^\d/.test(x)) return x.localeCompare(y, 'es')
  return x < y ? -1 : 1
}

const err = (code, message) => ({ data: null, error: { code, message } })

export function crearClienteDemo() {
  const db = crearBD()
  const oyentes = new Set()
  let usuario = null
  try {
    const guardado = globalThis.sessionStorage?.getItem('demo-rol')
    if (guardado && USUARIOS_DEMO[guardado]) usuario = USUARIOS_DEMO[guardado]
  } catch { /* sin almacenamiento */ }

  const sesion = () => (usuario ? { user: { id: usuario.id, email: usuario.email } } : null)
  const notificar = () => oyentes.forEach(f => f('SIGNED_IN', sesion()))

  const objetos = new Map() // archivos subidos a storage en la demo
  const ctx = () => {
    if (!usuario) return null
    const mem = db.membresias.find(m => m.user_id === usuario.id)
    return { id: usuario.id, email: usuario.email, admin: !!usuario.admin, rol: mem?.rol, asoc: mem?.asociacion_id }
  }

  // ---------- Reglas de acceso (equivalentes simplificados a las políticas RLS) ----------
  const permiso = (u, app) => db.permisos_preceptor.find(p => p.asociacion_id === u.asoc && p.app_clave === app)
  const appActiva = (u, app) => db.asociacion_apps.some(a => a.asociacion_id === u.asoc && a.app_clave === app && a.activa)
  const nivelOk = (u, p, nivel) => p.ambito === 'todos'
    || db.preceptor_niveles.some(n => n.asociacion_id === u.asoc && n.email === u.email && n.nivel === nivel)
  const socioDe = id => db.socios.find(s => s.id === id)
  const esFamiliar = (u, id) => db.familiares_socios.some(f => f.socio_id === id && f.email === u.email)

  function puedeSocio(u, socio, app, accion) {
    if (!u || !socio || socio.asociacion_id !== u.asoc || !appActiva(u, app)) return false
    if (u.rol === 'encargado') return true
    if (u.rol === 'preceptor') {
      const p = permiso(u, app)
      if (!p || !(accion === 'ver' ? p.puede_ver : p.puede_editar)) return false
      return nivelOk(u, p, socio.nivel)
    }
    return false
  }

  // ¿Puede el usuario aprobar una solicitud con estos niveles? (encargado: todas; preceptor: según su alcance)
  function puedeAprobar(u, asoc, niveles) {
    if (!u || u.asoc !== asoc) return false
    if (u.rol === 'encargado') return true
    if (u.rol !== 'preceptor') return false
    const alc = db.permisos_aprobacion.find(p => p.asociacion_id === asoc && p.email === u.email)?.alcance
    if (alc === 'todos') return true
    return alc === 'su_nivel' && db.preceptor_niveles.some(n => n.asociacion_id === asoc && n.email === u.email && niveles.includes(n.nivel))
  }

  const enlaceVigente = token => db.enlaces_alta.find(e => e.token === token && e.activo && (!e.caduca_en || e.caduca_en > new Date().toISOString()))
  const limpio = (v, n) => String(v ?? '').trim().slice(0, n)
  const reCorreo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

  // Equivalente a puede_plan() de la base de datos
  function puedePlan(u, asoc, niveles, accion) {
    if (!u || u.asoc !== asoc || !appActiva(u, 'actividades')) return false
    niveles = niveles || []
    if (u.rol === 'encargado') return true
    if (u.rol === 'familia') {
      if (accion !== 'ver') return false
      if (niveles.length === 0) return true
      return db.socios.some(s => esFamiliar(u, s.id) && niveles.includes(s.nivel)
        && db.periodos_alta.some(p => p.socio_id === s.id && !p.fecha_baja))
    }
    if (u.rol !== 'preceptor') return false
    const p = permiso(u, 'actividades')
    if (!p || !(accion === 'ver' ? p.puede_ver : p.puede_editar)) return false
    if (p.ambito === 'todos') return true
    const mios = db.preceptor_niveles.filter(n => n.asociacion_id === asoc && n.email === u.email).map(n => n.nivel)
    if (accion === 'ver') return niveles.length === 0 || niveles.some(n => mios.includes(n))
    return niveles.length > 0 && niveles.every(n => mios.includes(n))
  }

  function visible(tabla, r) {
    const u = ctx(); if (!u) return false
    switch (tabla) {
      case 'perfiles': return r.id === u.id || u.admin
      case 'apps': return true
      case 'asociaciones': return u.admin || r.id === u.asoc
      case 'asociacion_apps': return u.admin || r.asociacion_id === u.asoc
      case 'membresias': return r.user_id === u.id || u.admin || (u.rol === 'encargado' && r.asociacion_id === u.asoc)
      case 'accesos_permitidos': return u.admin || (u.rol === 'encargado' && r.asociacion_id === u.asoc)
      case 'permisos_preceptor': return r.asociacion_id === u.asoc && (u.rol === 'encargado' || u.rol === 'preceptor')
      case 'preceptor_niveles': return r.asociacion_id === u.asoc && (u.rol === 'encargado' || r.email === u.email)
      // Las familias no tienen acceso a Asistencia ni a sus actividades
      case 'tipos_actividad': return r.asociacion_id === u.asoc && (u.rol === 'encargado' || u.rol === 'preceptor')
      case 'socios': return puedeSocio(u, r, 'socios', 'ver') || (u.rol === 'familia' && esFamiliar(u, r.id))
      case 'periodos_alta': { const s = socioDe(r.socio_id); return !!s && (puedeSocio(u, s, 'socios', 'ver') || esFamiliar(u, s.id)) }
      case 'socios_bancarios': return u.rol === 'encargado' && socioDe(r.socio_id)?.asociacion_id === u.asoc
      case 'familiares_socios': return r.email === u.email || puedeSocio(u, socioDe(r.socio_id), 'socios', 'ver')
      case 'registros_asistencia': return puedeSocio(u, socioDe(r.socio_id), 'asistencia', 'ver')
      case 'socios_equipo': return puedeSocio(u, socioDe(r.socio_id), 'socios', 'ver')
      case 'global_admins': return u.admin
      case 'enlaces_alta': return r.asociacion_id === u.asoc && u.rol === 'encargado'
      case 'familias': return r.asociacion_id === u.asoc && (u.rol === 'encargado' || r.emails.includes(u.email))
      case 'permisos_aprobacion': return r.asociacion_id === u.asoc && (u.rol === 'encargado' || r.email === u.email)
      case 'pagos_cuota': { const f = db.familias.find(x => x.id === r.familia_id); return !!f && f.asociacion_id === u.asoc && (u.rol === 'encargado' || f.emails.includes(u.email)) }
      case 'config_cuotas': return r.asociacion_id === u.asoc && u.rol === 'encargado'
      case 'planes': return puedePlan(u, r.asociacion_id, r.niveles, 'ver')
      case 'solicitudes_alta': return puedeAprobar(u, r.asociacion_id, r.niveles) || r.email === u.email
      default: return false
    }
  }

  function escribible(tabla, r) {
    const u = ctx(); if (!u) return false
    switch (tabla) {
      case 'socios': return puedeSocio(u, r, 'socios', 'editar')
      case 'periodos_alta': case 'familiares_socios': return puedeSocio(u, socioDe(r.socio_id), 'socios', 'editar')
      case 'registros_asistencia': return puedeSocio(u, socioDe(r.socio_id), 'asistencia', 'editar')
      case 'socios_bancarios': return u.rol === 'encargado' && socioDe(r.socio_id)?.asociacion_id === u.asoc
      case 'socios_equipo': return puedeSocio(u, socioDe(r.socio_id), 'socios', 'editar')
      case 'asociaciones': case 'asociacion_apps': case 'apps': case 'global_admins': return u.admin
      case 'accesos_permitidos': return u.admin || (u.rol === 'encargado' && r.asociacion_id === u.asoc && r.rol !== 'encargado')
      case 'permisos_preceptor': case 'preceptor_niveles': case 'tipos_actividad': case 'enlaces_alta': case 'permisos_aprobacion': case 'config_cuotas':
        return u.rol === 'encargado' && r.asociacion_id === u.asoc
      case 'planes': return puedePlan(u, r.asociacion_id, r.niveles, 'editar')
      case 'pagos_cuota': return u.rol === 'encargado' && db.familias.find(x => x.id === r.familia_id)?.asociacion_id === u.asoc
      default: return false
    }
  }

  // ---------- Valores por defecto, restricciones y efectos de las inserciones ----------
  function conDefectos(tabla, p) {
    const f = { ...p }
    if (PK[tabla].includes('id') && !f.id) f.id = uuid()
    const hoyIso = new Date().toISOString().slice(0, 10)
    if (tabla === 'socios') f.creado_en ??= hoyIso
    if (tabla === 'asociaciones') f.creada_en ??= hoyIso
    if (tabla === 'tipos_actividad') { f.activa ??= true; f.orden ??= 0 }
    if (tabla === 'permisos_preceptor') { f.puede_ver ??= false; f.puede_editar ??= false; f.ambito ??= 'su_nivel' }
    if (tabla === 'asociacion_apps') { f.permitida ??= false; f.activa ??= false }
    if (tabla === 'periodos_alta') { f.fecha_baja ??= null; f.motivo_baja ??= null }
    if (tabla === 'socios_equipo') { f.asiste_circulos ??= false; f.es_catequista ??= false }
    if (tabla === 'planes') { f.descripcion ??= null; f.lugar ??= null; f.hora_inicio ??= null; f.hora_fin ??= null; f.precio ??= 0; f.niveles ??= []; f.creado_por ??= ctx()?.id; f.creado_en ??= hoyIso; f.fecha_fin ??= f.fecha }
    if (tabla === 'config_cuotas') { f.importes ??= [...IMPORTES_POR_DEFECTO]; f.preceptores_descuento ??= false }
    if (tabla === 'enlaces_alta') { f.token ??= (uuid() + uuid()).replaceAll('-', ''); f.activo ??= true; f.caduca_en ??= null; f.creado_en ??= hoyIso }
    return f
  }

  function duplicada(tabla, f) {
    if (db[tabla].some(x => PK[tabla].every(k => x[k] === f[k]))) return true
    if (tabla === 'tipos_actividad' && db[tabla].some(x => x.asociacion_id === f.asociacion_id
      && (x.nombre === f.nombre || (f.abreviatura && x.abreviatura === f.abreviatura)))) return true
    if (tabla === 'periodos_alta' && !f.fecha_baja && db[tabla].some(x => x.socio_id === f.socio_id && !x.fecha_baja)) return true
    return false
  }

  function efectosAlInsertar(tabla, f) {
    if (tabla === 'asociaciones')
      TIPOS_POR_DEFECTO.forEach(([nombre, abreviatura, periodicidad], i) =>
        db.tipos_actividad.push({ id: uuid(), asociacion_id: f.id, nombre, abreviatura, periodicidad, activa: true, orden: i + 1 }))
  }

  function efectosAlBorrar(tabla, f) {
    // Quitar un correo de la lista blanca retira también el acceso
    if (tabla === 'accesos_permitidos') {
      const perfil = db.perfiles.find(p => p.email === f.email)
      if (perfil) db.membresias = db.membresias.filter(m => m.user_id !== perfil.id)
    }
  }

  const formar = (tabla, filas, cols) => {
    const rels = partir(cols).map(i => /^(\w+)\(([\s\S]*)\)$/.exec(i)).filter(Boolean)
    return filas.map(r => {
      const o = { ...r }
      for (const [, nombre] of rels) {
        const def = REL[`${tabla}.${nombre}`]
        if (!def) continue
        const rel = db[def.tabla].filter(x => x[def.remoto] === r[def.local])
        o[nombre] = def.uno ? (rel[0] ? { ...rel[0] } : null) : rel.map(x => ({ ...x }))
      }
      return o
    })
  }

  // ---------- Constructor de consultas (imita la API encadenada de supabase-js) ----------
  class Consulta {
    constructor(tabla) {
      Object.assign(this, { tabla, op: 'select', cols: '*', filtros: [], orden: [], rango: null, uno: null, payload: null, opts: {}, devolver: false })
    }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; else { this.devolver = true; this.cols = cols } return this }
    insert(p) { this.op = 'insert'; this.payload = p; return this }
    update(p) { this.op = 'update'; this.payload = p; return this }
    upsert(p, opts = {}) { this.op = 'upsert'; this.payload = p; this.opts = opts; return this }
    delete() { this.op = 'delete'; return this }
    eq(c, v) { this.filtros.push(r => r[c] === v); return this }
    neq(c, v) { this.filtros.push(r => r[c] !== v); return this }
    in(c, vs) { this.filtros.push(r => vs.includes(r[c])); return this }
    gte(c, v) { this.filtros.push(r => r[c] >= v); return this }
    lte(c, v) { this.filtros.push(r => r[c] <= v); return this }
    order(c, { ascending = true } = {}) { this.orden.push([c, ascending]); return this }
    range(a, b) { this.rango = [a, b]; return this }
    single() { this.uno = 'single'; return this }
    maybeSingle() { this.uno = 'maybe'; return this }
    then(ok, ko) { return Promise.resolve().then(() => this.ejecutar()).then(ok, ko) }

    ejecutar() {
      const { tabla } = this
      if (!db[tabla]) return err('42P01', `Tabla desconocida: ${tabla}`)
      const filas = db[tabla]
      const coincide = r => this.filtros.every(f => f(r))
      let res = []

      if (this.op === 'select') {
        res = filas.filter(r => visible(tabla, r) && coincide(r))
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const lista = Array.isArray(this.payload) ? this.payload : [this.payload]
        const conflicto = this.opts.onConflict ? this.opts.onConflict.split(',').map(s => s.trim()) : PK[tabla]
        for (const p of lista) {
          const previa = this.op === 'upsert' ? filas.find(x => conflicto.every(k => x[k] === p[k])) : null
          if (previa) {
            const nueva = { ...previa, ...p }
            if (!escribible(tabla, previa) || !escribible(tabla, nueva)) return err('42501', `new row violates row-level security policy for table "${tabla}"`)
            Object.assign(previa, p); res.push(previa)
            continue
          }
          const f = conDefectos(tabla, p)
          if (!escribible(tabla, f)) return err('42501', `new row violates row-level security policy for table "${tabla}"`)
          if (duplicada(tabla, f)) return err('23505', `duplicate key value violates unique constraint on "${tabla}"`)
          filas.push(f); res.push(f); efectosAlInsertar(tabla, f)
        }
      } else if (this.op === 'update') {
        res = filas.filter(r => visible(tabla, r) && coincide(r) && escribible(tabla, r))
        res.forEach(r => Object.assign(r, this.payload))
      } else if (this.op === 'delete') {
        res = filas.filter(r => visible(tabla, r) && coincide(r) && escribible(tabla, r))
        for (const r of res) { filas.splice(filas.indexOf(r), 1); efectosAlBorrar(tabla, r) }
      }

      if (this.orden.length) res = [...res].sort((a, b) => {
        for (const [c, asc] of this.orden) { const k = comparar(a[c], b[c]); if (k) return asc ? k : -k }
        return 0
      })
      if (this.rango) res = res.slice(this.rango[0], this.rango[1] + 1)

      // Las escrituras solo devuelven filas si se encadenó .select()
      if (this.op !== 'select' && !this.devolver) return { data: null, error: null }

      const datos = structuredClone(formar(tabla, res, this.cols))
      if (this.uno === 'single') {
        return datos.length === 1 ? { data: datos[0], error: null }
          : err('PGRST116', 'JSON object requested, multiple (or no) rows returned')
      }
      if (this.uno === 'maybe') {
        return datos.length > 1 ? err('PGRST116', 'JSON object requested, multiple rows returned')
          : { data: datos[0] ?? null, error: null }
      }
      return { data: datos, error: null }
    }
  }

  return {
    from: tabla => new Consulta(tabla),

    // Imita el bucket privado asociacion-fotos: ven los miembros de la carpeta, sube solo su encargado
    storage: {
      from: bucket => ({
        upload: async (ruta, blob) => {
          const u = ctx()
          if (bucket !== 'asociacion-fotos' || u?.rol !== 'encargado' || ruta.split('/')[0] !== u.asoc)
            return err('42501', 'new row violates row-level security policy')
          objetos.set(ruta, blob)
          return { data: { path: ruta }, error: null }
        },
        createSignedUrl: async ruta => {
          const u = ctx()
          if (!u || u.admin || ruta.split('/')[0] !== u.asoc || !objetos.has(ruta)) return err('404', 'Object not found')
          const b = objetos.get(ruta)
          const url = typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined' && b instanceof Blob
            ? URL.createObjectURL(b) : `demo://${ruta}`
          return { data: { signedUrl: url }, error: null }
        },
        remove: async rutas => {
          const u = ctx()
          const borrados = []
          if (u?.rol === 'encargado') for (const r of rutas) if (r.split('/')[0] === u.asoc && objetos.delete(r)) borrados.push({ name: r })
          return { data: borrados, error: null }
        }
      })
    },

    rpc: async (nombre, a = {}) => {
      const u = ctx()
      const hoyIso = new Date().toISOString().slice(0, 10)
      if (nombre === 'info_enlace') return { data: enlaceVigente(a.p_token) ? db.asociaciones.find(x => x.id === enlaceVigente(a.p_token).asociacion_id).nombre : null, error: null }
      if (nombre === 'solicitar_alta_familia') {
        const enl = enlaceVigente(a.p_token), t = a.p_datos || {}
        if (!enl) return err('P0001', 'El enlace no es válido o ha caducado')
        if (t.consentimiento !== true) return err('P0001', 'Debes aceptar el tratamiento de los datos')
        const np = limpio(t.nombre_padre, 120), nm = limpio(t.nombre_madre, 120)
        const cp = limpio(t.correo_padre, 120).toLowerCase(), cm = limpio(t.correo_madre, 120).toLowerCase()
        if ((np || cp) && (!np || !reCorreo.test(cp))) return err('P0001', 'Revisa el nombre y el correo de Google del padre o tutor')
        if ((nm || cm) && (!nm || !reCorreo.test(cm))) return err('P0001', 'Revisa el nombre y el correo de Google de la madre o tutora')
        if (!cp && !cm) return err('P0001', 'Indica al menos un progenitor o tutor con su correo de Google')
        if (cp === cm) return err('P0001', 'El padre y la madre necesitan correos distintos')
        const emails = [cp, cm].filter(Boolean)
        if (db.accesos_permitidos.some(x => emails.includes(x.email))) return err('P0001', 'Alguno de esos correos ya tiene acceso a la aplicación')
        if (db.solicitudes_alta.some(x => x.asociacion_id === enl.asociacion_id && x.tipo === 'familia' && x.estado === 'pendiente'
          && (emails.includes(x.email) || emails.includes(x.datos.correo_padre) || emails.includes(x.datos.correo_madre))))
          return err('P0001', 'Ya hay una solicitud pendiente con alguno de esos correos')
        db.solicitudes_alta.push({
          id: uuid(), asociacion_id: enl.asociacion_id, tipo: 'familia', estado: 'pendiente', email: emails[0],
          niveles: [],
          motivo_resolucion: null, resuelta_por: null, resuelta_en: null, creada_en: hoyIso,
          datos: { nombre_padre: np, nombre_madre: nm, correo_padre: cp, correo_madre: cm,
            movil_padre: limpio(t.movil_padre, 30), movil_madre: limpio(t.movil_madre, 30), direccion: limpio(t.direccion, 200) }
        })
        return { data: null, error: null }
      }
      if (nombre === 'solicitar_socio') {
        if (u?.rol !== 'familia') return err('P0001', 'Solo las familias pueden solicitar el alta de un hijo')
        const t = a.p_datos || {}
        if (!limpio(t.nombre, 80) || !limpio(t.apellidos, 120) || !limpio(t.fecha_nacimiento, 10)) return err('P0001', 'Indica nombre, apellidos y fecha de nacimiento')
        const nivel = nivelPorNacimiento(limpio(t.fecha_nacimiento, 10), hoyIso)
        db.solicitudes_alta.push({
          id: uuid(), asociacion_id: u.asoc, tipo: 'socio', estado: 'pendiente', email: u.email, niveles: nivel ? [nivel] : [],
          motivo_resolucion: null, resuelta_por: null, resuelta_en: null, creada_en: hoyIso,
          datos: { nombre: limpio(t.nombre, 80), apellidos: limpio(t.apellidos, 120), fecha_nacimiento: limpio(t.fecha_nacimiento, 10),
            nivel, alergias: limpio(t.alergias, 200), correo_socio: limpio(t.correo_socio, 120) }
        })
        return { data: null, error: null }
      }
      if (nombre === 'actualizar_familia') {
        const f = db.familias.find(x => u && x.emails.includes(u.email))
        if (!f) return err('P0001', 'No tienes una familia registrada')
        const t = a.p_datos || {}, v = (k, n) => limpio(t[k], n) || null
        Object.assign(f, { nombre_padre: v('nombre_padre', 120), nombre_madre: v('nombre_madre', 120),
          movil_padre: v('movil_padre', 30), movil_madre: v('movil_madre', 30), direccion: v('direccion', 200) })
        const ids = db.familiares_socios.filter(x => f.emails.includes(x.email)).map(x => x.socio_id)
        for (const s of db.socios) if (ids.includes(s.id) && s.asociacion_id === f.asociacion_id)
          Object.assign(s, { nombre_padre: f.nombre_padre, nombre_madre: f.nombre_madre, movil_padre: f.movil_padre, movil_madre: f.movil_madre, direccion: f.direccion })
        return { data: null, error: null }
      }
      if (nombre === 'actualizar_hijo') {
        const s = socioDe(a.p_socio), t = a.p_datos || {}
        if (!u || !s || !esFamiliar(u, s.id)) return err('P0001', 'No puedes editar a este socio')
        if (!limpio(t.nombre, 80) || !limpio(t.apellidos, 120)) return err('P0001', 'Nombre y apellidos son obligatorios')
        Object.assign(s, { nombre: limpio(t.nombre, 80), apellidos: limpio(t.apellidos, 120), fecha_nacimiento: limpio(t.fecha_nacimiento, 10) || null,
          alergias: limpio(t.alergias, 200) || null, correo_socio: limpio(t.correo_socio, 120) || null })
        return { data: null, error: null }
      }
      if (nombre === 'cuota_familia' || nombre === 'poner_descuento' || nombre === 'asegurar_familia') {
        const s = a.p_socio ? socioDe(a.p_socio) : null
        const emailsDe = id => db.familiares_socios.filter(x => x.socio_id === id).map(x => x.email)
        const familiaDe = id => db.familias.find(f => f.asociacion_id === socioDe(id)?.asociacion_id && f.emails.some(e => emailsDe(id).includes(e)))
        const config = asoc => db.config_cuotas.find(c => c.asociacion_id === asoc)
        const puedeDto = socio => !!socio && (u?.rol === 'encargado' && socio.asociacion_id === u.asoc
          || u?.rol === 'preceptor' && !!config(socio.asociacion_id)?.preceptores_descuento && puedeSocio(u, socio, 'socios', 'editar'))
        if (nombre === 'asegurar_familia') {
          if (!s || !puedeSocio(u, s, 'socios', 'editar')) return err('P0001', 'Sin permiso')
          const emails = emailsDe(s.id)
          if (!emails.length) return { data: null, error: null }
          const f = db.familias.find(x => x.asociacion_id === s.asociacion_id && x.emails.some(e => emails.includes(e)))
          if (!f) db.familias.push({ id: uuid(), asociacion_id: s.asociacion_id, emails, nombre_padre: s.nombre_padre, nombre_madre: s.nombre_madre,
            correo_padre: s.correo_padre, correo_madre: s.correo_madre, movil_padre: s.movil_padre, movil_madre: s.movil_madre, direccion: s.direccion,
            descuento_tipo: 'porcentaje', descuento_valor: 0, descuento_nota: null, creada_en: hoyIso })
          else f.emails = [...new Set([...f.emails, ...emails])]
          return { data: null, error: null }
        }
        if (nombre === 'poner_descuento') {
          if (!puedeDto(s)) return err('P0001', 'No tienes permiso para aplicar descuentos')
          if (!['porcentaje', 'euros'].includes(a.p_tipo) || !(a.p_valor >= 0) || (a.p_tipo === 'porcentaje' && a.p_valor > 100)) return err('P0001', 'Descuento no válido')
          const f = familiaDe(s.id)
          if (!f) return err('P0001', 'Este socio no tiene una cuenta de familia vinculada')
          Object.assign(f, { descuento_tipo: a.p_tipo, descuento_valor: Number(a.p_valor), descuento_nota: limpio(a.p_nota, 200) || null })
          return { data: null, error: null }
        }
        // cuota_familia
        let f
        if (!a.p_socio) f = db.familias.find(x => u && x.emails.includes(u.email))
        else {
          if (!u || !s || !(puedeSocio(u, s, 'socios', 'ver') || esFamiliar(u, s.id))) return err('P0001', 'Sin permiso')
          f = familiaDe(s.id)
        }
        if (!f) return { data: null, error: null }
        const hijos = db.socios.filter(x => x.asociacion_id === f.asociacion_id
          && db.familiares_socios.some(fs => fs.socio_id === x.id && f.emails.includes(fs.email))
          && db.periodos_alta.some(p => p.socio_id === x.id && !p.fecha_baja))
          .map(x => ({ id: x.id, creado: x.creado_en, desde: db.periodos_alta.filter(p => p.socio_id === x.id).map(p => p.fecha_alta).sort()[0] }))
        const q = calcularCuota(hijos, config(f.asociacion_id)?.importes || IMPORTES_POR_DEFECTO, { tipo: f.descuento_tipo, valor: f.descuento_valor })
        return { data: { familia_id: f.id, descuento_tipo: f.descuento_tipo, descuento_valor: f.descuento_valor, descuento_nota: f.descuento_nota,
          ...q, puede_descuento: puedeDto(s) }, error: null }
      }
      if (nombre === 'dar_de_baja_familia') {
        const s = socioDe(a.p_socio)
        if (!u || !s || !esFamiliar(u, s.id)) return err('P0001', 'No puedes dar de baja a este socio')
        const p = db.periodos_alta.find(x => x.socio_id === s.id && !x.fecha_baja)
        if (!p) return err('P0001', 'Este socio ya está de baja')
        p.fecha_baja = hoyIso < p.fecha_alta ? p.fecha_alta : hoyIso
        p.motivo_baja = limpio(a.p_motivo, 300) || null
        return { data: null, error: null }
      }
      if (nombre === 'resolver_solicitud') {
        const s = db.solicitudes_alta.find(x => x.id === a.p_id)
        if (!s || !puedeAprobar(u, s.asociacion_id, s.niveles)) return err('P0001', 'No tienes permiso para resolver esta solicitud')
        if (s.estado !== 'pendiente') return err('P0001', 'La solicitud ya estaba resuelta')
        const d = s.datos
        if (a.p_aprobar) {
          if (s.tipo === 'familia') {
            const emails = [d.correo_padre, d.correo_madre].filter(Boolean)
            if (db.accesos_permitidos.some(x => emails.includes(x.email) && x.asociacion_id !== s.asociacion_id))
              return err('P0001', 'Un correo de la solicitud ya pertenece a otra asociación')
            db.familias.push({ id: uuid(), asociacion_id: s.asociacion_id, emails, nombre_padre: d.nombre_padre || null,
              nombre_madre: d.nombre_madre || null, correo_padre: d.correo_padre || null, correo_madre: d.correo_madre || null,
              movil_padre: d.movil_padre || null, movil_madre: d.movil_madre || null, direccion: d.direccion || null, descuento_tipo: 'porcentaje', descuento_valor: 0, descuento_nota: null, creada_en: hoyIso })
            for (const e of emails) if (!db.accesos_permitidos.some(x => x.email === e))
              db.accesos_permitidos.push({ email: e, asociacion_id: s.asociacion_id, rol: 'familia', anadido_por: u.id })
          } else if (s.tipo === 'socio') {
            const fam = db.familias.find(f => f.asociacion_id === s.asociacion_id && f.emails.includes(s.email)) || {}
            const id = uuid()
            db.socios.push({ id, asociacion_id: s.asociacion_id, nombre: d.nombre, apellidos: d.apellidos,
              fecha_nacimiento: d.fecha_nacimiento || null, nivel: d.nivel, nombre_padre: fam.nombre_padre ?? null,
              nombre_madre: fam.nombre_madre ?? null, alergias: d.alergias || null, direccion: fam.direccion ?? null,
              correo_padre: fam.correo_padre ?? null, correo_madre: fam.correo_madre ?? null, correo_socio: d.correo_socio || null,
              movil_padre: fam.movil_padre ?? null, movil_madre: fam.movil_madre ?? null, creado_en: hoyIso })
            db.periodos_alta.push({ id: uuid(), socio_id: id, fecha_alta: hoyIso, fecha_baja: null, motivo_baja: null })
            for (const e of fam.emails || [s.email]) db.familiares_socios.push({ email: e, socio_id: id })
          }
        }
        Object.assign(s, { estado: a.p_aprobar ? 'aprobada' : 'rechazada', motivo_resolucion: limpio(a.p_motivo, 300) || null,
          resuelta_por: u.id, resuelta_en: new Date().toISOString() })
        return { data: null, error: null }
      }
      if (nombre === 'establecer_foto_asociacion') {
        if (u?.rol !== 'encargado' || u.asoc !== a.p_asoc) return err('P0001', 'Solo el encargado')
        if (a.p_ruta != null && a.p_ruta.split('/')[0] !== a.p_asoc) return err('P0001', 'La foto debe estar en la carpeta de la asociación')
        db.asociaciones.find(x => x.id === a.p_asoc).foto_ruta = a.p_ruta
        return { data: null, error: null }
      }
      if (nombre !== 'activar_app') return err('42883', `Función desconocida: ${nombre}`)
      if (u?.rol !== 'encargado' || u.asoc !== a.p_asoc) return err('P0001', 'Solo el encargado')
      const f = db.asociacion_apps.find(x => x.asociacion_id === a.p_asoc && x.app_clave === a.p_app && x.permitida)
      if (f) f.activa = a.p_activa
      return { data: null, error: null }
    },

    auth: {
      getSession: async () => ({ data: { session: sesion() } }),
      onAuthStateChange: cb => {
        oyentes.add(cb)
        return { data: { subscription: { unsubscribe: () => oyentes.delete(cb) } } }
      },
      signInWithOAuth: async () => ({ error: null }),
      // Solo existe en el modo demo: entrar directamente con uno de los cuatro roles de ejemplo
      entrarComo: rol => {
        usuario = USUARIOS_DEMO[rol]
        try { globalThis.sessionStorage?.setItem('demo-rol', rol) } catch { /* sin almacenamiento */ }
        notificar()
      },
      signOut: async () => {
        usuario = null
        try { globalThis.sessionStorage?.removeItem('demo-rol') } catch { /* sin almacenamiento */ }
        oyentes.forEach(f => f('SIGNED_OUT', null))
        return { error: null }
      }
    }
  }
}
