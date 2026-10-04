// Sustituto en memoria de supabase-js para el modo demo. Implementa solo lo que usa la app
// (select con relaciones, filtros, insert/update/upsert/delete, rpc y auth) y aplica reglas de
// visibilidad por rol parecidas a las de la base de datos real. No es una réplica exacta de las
// políticas RLS: sirve para ver y probar la app, no para validar la seguridad.
import { crearBD, USUARIOS_DEMO } from './datos.js'

const PK = {
  perfiles: ['id'], asociaciones: ['id'], apps: ['clave'], asociacion_apps: ['asociacion_id', 'app_clave'],
  accesos_permitidos: ['email'], membresias: ['user_id'], permisos_preceptor: ['asociacion_id', 'app_clave'],
  preceptor_niveles: ['asociacion_id', 'email', 'nivel'], socios: ['id'], periodos_alta: ['id'],
  socios_bancarios: ['socio_id'], familiares_socios: ['email', 'socio_id'], tipos_actividad: ['id'],
  registros_asistencia: ['socio_id', 'tipo_actividad_id', 'periodo_inicio'], global_admins: ['email']
}

const REL = {
  'membresias.asociaciones': { tabla: 'asociaciones', local: 'asociacion_id', remoto: 'id', uno: true },
  'asociacion_apps.apps': { tabla: 'apps', local: 'app_clave', remoto: 'clave', uno: true },
  'socios.periodos_alta': { tabla: 'periodos_alta', local: 'id', remoto: 'socio_id', uno: false }
}

const TIPOS_POR_DEFECTO = [
  ['Charla', 'semanal'], ['Círculo', 'semanal'], ['Visita de pobres', 'mensual'], ['Retiro mensual', 'mensual'],
  ['Curso de retiro', 'anual'], ['Preceptuación', 'semanal'], ['Sacerdote', 'semanal']
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
      case 'tipos_actividad': return r.asociacion_id === u.asoc
      case 'socios': return puedeSocio(u, r, 'socios', 'ver') || (u.rol === 'familia' && esFamiliar(u, r.id))
      case 'periodos_alta': { const s = socioDe(r.socio_id); return !!s && (puedeSocio(u, s, 'socios', 'ver') || esFamiliar(u, s.id)) }
      case 'socios_bancarios': return u.rol === 'encargado' && socioDe(r.socio_id)?.asociacion_id === u.asoc
      case 'familiares_socios': return r.email === u.email || puedeSocio(u, socioDe(r.socio_id), 'socios', 'ver')
      case 'registros_asistencia': { const s = socioDe(r.socio_id); return !!s && (puedeSocio(u, s, 'asistencia', 'ver') || esFamiliar(u, s.id)) }
      case 'global_admins': return u.admin
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
      case 'asociaciones': case 'asociacion_apps': case 'apps': case 'global_admins': return u.admin
      case 'accesos_permitidos': return u.admin || (u.rol === 'encargado' && r.asociacion_id === u.asoc && r.rol !== 'encargado')
      case 'permisos_preceptor': case 'preceptor_niveles': case 'tipos_actividad':
        return u.rol === 'encargado' && r.asociacion_id === u.asoc
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
    return f
  }

  function duplicada(tabla, f) {
    if (db[tabla].some(x => PK[tabla].every(k => x[k] === f[k]))) return true
    if (tabla === 'tipos_actividad' && db[tabla].some(x => x.asociacion_id === f.asociacion_id && x.nombre === f.nombre)) return true
    if (tabla === 'periodos_alta' && !f.fecha_baja && db[tabla].some(x => x.socio_id === f.socio_id && !x.fecha_baja)) return true
    return false
  }

  function efectosAlInsertar(tabla, f) {
    if (tabla === 'asociaciones')
      TIPOS_POR_DEFECTO.forEach(([nombre, periodicidad], i) =>
        db.tipos_actividad.push({ id: uuid(), asociacion_id: f.id, nombre, periodicidad, activa: true, orden: i + 1 }))
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

    rpc: async (nombre, a) => {
      if (nombre !== 'activar_app') return err('42883', `Función desconocida: ${nombre}`)
      const u = ctx()
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
