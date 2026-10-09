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
  enlaces_alta: ['id'], familias: ['id'], permisos_aprobacion: ['asociacion_id', 'email'], solicitudes_alta: ['id'], config_cuotas: ['asociacion_id'], pagos_cuota: ['familia_id', 'mes'], planes: ['id'], anuncios: ['id'], furgonetas: ['id'], plan_furgonetas: ['plan_id', 'furgoneta_id'], plan_inscritos: ['plan_id', 'socio_id'], hucha_movimientos: ['id'], campos_trabajo: ['id'], campo_participantes: ['campo_id', 'socio_id'], retiradas_campo: ['id']
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

  // Campos de trabajo: encargado y todos los preceptores (sin pasar por permisos), si la app está activa
  const esEquipo = (u, asoc) => !!u && u.asoc === asoc && (u.rol === 'encargado' || u.rol === 'preceptor') && appActiva(u, 'dineros')
  const campoDe = id => db.campos_trabajo.find(c => c.id === id)
  const esEquipoApp = (u, asoc, app) => !!u && u.asoc === asoc && (u.rol === 'encargado' || u.rol === 'preceptor') && appActiva(u, app)
  // Quienes pueden publicar anuncios (y subir sus imágenes): encargado y preceptores con permiso de edición en Actividades
  const puedePublicar = u => !!u && appActiva(u, 'actividades') && (u.rol === 'encargado' || (u.rol === 'preceptor' && !!permiso(u, 'actividades')?.puede_editar))
  const rutaAnuncio = (u, ruta) => { const [a, carpeta] = String(ruta).split('/'); return a === u?.asoc && carpeta === 'anuncios' && puedePublicar(u) }
  const saldoHucha = id => Math.round((db.hucha_movimientos.filter(x => x.socio_id === id).reduce((a, x) => a + Number(x.importe), 0) + saldoCampo(id)) * 100) / 100
  const puedeVerHucha = (u, s) => !!u && !!s && s.asociacion_id === u.asoc && appActiva(u, 'dineros') && (esEquipoApp(u, s.asociacion_id, 'dineros') || (u.rol === 'familia' && esFamiliar(u, s.id)))
  const saldoCampo = socioId =>
    db.campo_participantes.filter(x => x.socio_id === socioId).reduce((a, x) => a + Number(x.importe), 0)
    - db.retiradas_campo.filter(x => x.socio_id === socioId).reduce((a, x) => a + Number(x.importe), 0)
  // Convivencias y cursos de retiro disponibles para un socio (de su nivel o para todos; acabadas hace menos de 90 días)
  const actividadesParaRetirar = socio => {
    const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    return db.planes.filter(p => p.asociacion_id === socio.asociacion_id && ['convivencia', 'curso_retiro'].includes(p.tipo)
      && p.fecha_fin >= limite && (!p.niveles.length || p.niveles.includes(socio.nivel))).sort((a, b) => a.fecha.localeCompare(b.fecha))
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

  // Furgonetas y apuntados: solo el equipo (encargado/preceptor) con acceso al plan; las familias usan rpc
  const planDe = id => db.planes.find(x => x.id === id)
  const puedePlanEquipo = (u, plan, accion) => !!u && !!plan && (u.rol === 'encargado' || u.rol === 'preceptor') && puedePlan(u, plan.asociacion_id, plan.niveles, accion)
  const furgoDe = id => db.furgonetas.find(x => x.id === id)
  const solapa = (a, b) => a.fecha <= b.fecha_fin && a.fecha_fin >= b.fecha
  // Devuelve el mensaje de error si alguna furgoneta del plan está reservada por otro plan esos días
  const conflictoFurgoneta = (plan, furgId) => {
    const o = db.plan_furgonetas.filter(x => x.furgoneta_id === furgId && x.plan_id !== plan.id)
      .map(x => planDe(x.plan_id)).find(q => q && solapa(q, plan))
    return o ? `La furgoneta «${furgoDe(furgId)?.nombre}» ya está reservada para «${o.titulo}» esos días` : null
  }
  const apuntados = planId => db.plan_inscritos.filter(x => x.plan_id === planId).length
  const socioActivo = s => !!s.no_socio || db.periodos_alta.some(p => p.socio_id === s.id && !p.fecha_baja)

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
      case 'anuncios': return puedePlan(u, r.asociacion_id, r.niveles, 'ver')
      case 'furgonetas': return esEquipoApp(u, r.asociacion_id, 'furgonetas')
      case 'plan_furgonetas': return appActiva(u, 'furgonetas') && puedePlanEquipo(u, planDe(r.plan_id), 'ver')
      case 'plan_inscritos': return puedePlanEquipo(u, planDe(r.plan_id), 'ver')
      case 'campos_trabajo': return esEquipo(u, r.asociacion_id)
      case 'campo_participantes': return esEquipo(u, campoDe(r.campo_id)?.asociacion_id)
      case 'retiradas_campo': return esEquipo(u, r.asociacion_id)
      case 'hucha_movimientos': return esEquipoApp(u, r.asociacion_id, 'dineros')
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
      case 'anuncios': return puedePlan(u, r.asociacion_id, r.niveles, 'editar') && (!r.imagen_ruta || String(r.imagen_ruta).split('/')[0] === r.asociacion_id)
      case 'furgonetas': return u.rol === 'encargado' && r.asociacion_id === u.asoc && appActiva(u, 'furgonetas')
      case 'plan_furgonetas': return appActiva(u, 'furgonetas') && puedePlanEquipo(u, planDe(r.plan_id), 'editar')
      case 'plan_inscritos': return puedePlanEquipo(u, planDe(r.plan_id), 'editar') && socioDe(r.socio_id)?.asociacion_id === planDe(r.plan_id)?.asociacion_id
      case 'campos_trabajo': return esEquipo(u, r.asociacion_id)
      case 'campo_participantes': return esEquipo(u, campoDe(r.campo_id)?.asociacion_id) && socioDe(r.socio_id)?.asociacion_id === campoDe(r.campo_id)?.asociacion_id
      case 'retiradas_campo': return u.rol === 'encargado' && esEquipo(u, r.asociacion_id)  // solo se anulan; se crean con retirar_campo
      case 'hucha_movimientos': return esEquipoApp(u, r.asociacion_id, 'dineros') && !r.retirada_id && socioDe(r.socio_id)?.asociacion_id === r.asociacion_id  // los de «Retirar» no se tocan
      case 'pagos_cuota': return u.rol === 'encargado' && db.familias.find(x => x.id === r.familia_id)?.asociacion_id === u.asoc
      default: return false
    }
  }

  // ---------- Valores por defecto, restricciones y efectos de las inserciones ----------
  function conDefectos(tabla, p) {
    const f = { ...p }
    if (PK[tabla].includes('id') && !f.id) f.id = uuid()
    const hoyIso = new Date().toISOString().slice(0, 10)
    if (tabla === 'socios') { f.creado_en ??= hoyIso; f.no_socio ??= false }
    if (tabla === 'asociaciones') f.creada_en ??= hoyIso
    if (tabla === 'tipos_actividad') { f.activa ??= true; f.orden ??= 0 }
    if (tabla === 'permisos_preceptor') { f.puede_ver ??= false; f.puede_editar ??= false; f.ambito ??= 'su_nivel' }
    if (tabla === 'asociacion_apps') { f.permitida ??= false; f.activa ??= false }
    if (tabla === 'periodos_alta') { f.fecha_baja ??= null; f.motivo_baja ??= null }
    if (tabla === 'socios_equipo') { f.asiste_circulos ??= false; f.es_catequista ??= false }
    if (tabla === 'hucha_movimientos') { f.fecha ??= hoyIso; f.concepto ??= null; f.retirada_id ??= null; f.creado_por ??= ctx()?.id; f.creado_en ??= hoyIso
      f.importe = Math.round(Number(f.importe) * 100) / 100 }
    if (tabla === 'campos_trabajo') { f.descripcion ??= null; f.responsable_email ??= null; f.creado_por ??= ctx()?.id; f.creado_en ??= hoyIso }
    if (tabla === 'campo_participantes') f.importe ??= 0
    if (tabla === 'planes') { f.tipo ??= 'plan'; f.descripcion ??= null; f.lugar ??= null; f.hora_inicio ??= null; f.hora_fin ??= null; f.precio ??= 0; f.niveles ??= []; f.limite ??= null; f.notificar ??= true; f.en_tablon ??= true; f.tablon_dias_antes ??= null; f.creado_por ??= ctx()?.id; f.creado_en ??= hoyIso; f.fecha_fin ??= f.fecha }
    if (tabla === 'anuncios') { f.texto ??= ''; f.niveles ??= []; f.caduca ??= null; f.imagen_ruta ??= null; f.creado_por ??= ctx()?.id; f.creado_en ??= new Date().toISOString() }
    if (tabla === 'furgonetas') { f.matricula ??= null; f.activa ??= true; f.creada_en ??= hoyIso }
    if (tabla === 'plan_inscritos') { f.creado_por ??= ctx()?.id; f.creado_en ??= hoyIso }
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
    if (tabla === 'retiradas_campo') db.hucha_movimientos = db.hucha_movimientos.filter(m => m.retirada_id !== f.id)
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
    limit(n) { this.rango = [0, n - 1]; return this }
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
        if (tabla === 'retiradas_campo') return err('42501', 'new row violates row-level security policy for table "retiradas_campo"') // solo con retirar_campo()
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
          if (tabla === 'hucha_movimientos' && (!['merienda', 'cena', 'plan', 'convivencia', 'curso_retiro', 'otro'].includes(f.categoria) || !Number.isFinite(f.importe) || f.importe === 0 || Math.abs(f.importe) >= 100000 || String(f.concepto ?? '').length > 120))
            return err('23514', 'new row for relation "hucha_movimientos" violates check constraint')
          if (tabla === 'furgonetas' && (!String(f.nombre ?? '').trim() || !(Number(f.plazas) > 0)))
            return err('23514', 'new row for relation "furgonetas" violates check constraint')
          if (tabla === 'anuncios' && (!String(f.titulo ?? '').trim() || String(f.titulo).length > 120 || String(f.texto).length > 4000))
            return err('23514', 'new row for relation "anuncios" violates check constraint')
          if (tabla === 'planes' && f.tablon_dias_antes != null && !(Number.isInteger(f.tablon_dias_antes) && f.tablon_dias_antes >= 1 && f.tablon_dias_antes <= 90))
            return err('23514', 'new row for relation "planes" violates check constraint')
          if (tabla === 'planes' && f.limite != null && !(Number(f.limite) > 0))
            return err('23514', 'new row for relation "planes" violates check constraint')
          if (tabla === 'plan_furgonetas') {
            const fg = furgoDe(f.furgoneta_id)
            if (!fg || fg.asociacion_id !== planDe(f.plan_id)?.asociacion_id) return err('42501', 'new row violates row-level security policy for table "plan_furgonetas"')
            const c = conflictoFurgoneta(planDe(f.plan_id), f.furgoneta_id)
            if (c) return err('P0001', c)
          }
          if (duplicada(tabla, f)) return err('23505', `duplicate key value violates unique constraint on "${tabla}"`)
          filas.push(f); res.push(f); efectosAlInsertar(tabla, f)
        }
      } else if (this.op === 'update') {
        res = filas.filter(r => visible(tabla, r) && coincide(r) && escribible(tabla, r))
        const antes = res.map(r => ({ ...r }))
        if (tabla === 'planes' && this.payload.limite != null && !(Number(this.payload.limite) > 0)) return err('23514', 'new row for relation "planes" violates check constraint')
        res.forEach(r => Object.assign(r, this.payload))
        if (tabla === 'planes') {
          for (const r of res) for (const pf of db.plan_furgonetas.filter(x => x.plan_id === r.id)) {
            const c = conflictoFurgoneta(r, pf.furgoneta_id)
            if (c) { res.forEach((q, i) => Object.assign(q, antes[i])); return err('P0001', c) }
          }
        }
        if (tabla === 'campo_participantes' && res.some(r => saldoCampo(r.socio_id) < 0)) {
          res.forEach((r, i) => Object.assign(r, antes[i]))
          return err('P0001', 'No se puede: el socio ya ha retirado más dinero del que le quedaría')
        }
      } else if (this.op === 'delete') {
        res = filas.filter(r => visible(tabla, r) && coincide(r) && escribible(tabla, r))
        let quitadas = []
        if (tabla === 'campos_trabajo') res.forEach(r => { quitadas.push(...db.campo_participantes.filter(x => x.campo_id === r.id)); db.campo_participantes = db.campo_participantes.filter(x => x.campo_id !== r.id) })
        if (tabla === 'campo_participantes') quitadas = res
        if ((tabla === 'campos_trabajo' || tabla === 'campo_participantes') && quitadas.some(x => saldoCampo(x.socio_id) < 0)) {
          if (tabla === 'campos_trabajo') db.campo_participantes.push(...quitadas)
          return err('P0001', 'No se puede: el socio ya ha retirado más dinero del que le quedaría')
        }
        if (tabla === 'planes') res.forEach(r => { db.plan_furgonetas = db.plan_furgonetas.filter(x => x.plan_id !== r.id); db.plan_inscritos = db.plan_inscritos.filter(x => x.plan_id !== r.id) })
        if (tabla === 'furgonetas') res.forEach(r => { db.plan_furgonetas = db.plan_furgonetas.filter(x => x.furgoneta_id !== r.id) })
        if (tabla === 'socios') res.forEach(r => { db.plan_inscritos = db.plan_inscritos.filter(x => x.socio_id !== r.id) })
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
          if (bucket !== 'asociacion-fotos' || !u || !(u.rol === 'encargado' && ruta.split('/')[0] === u.asoc || rutaAnuncio(u, ruta)))
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
          for (const r of rutas) if (((u?.rol === 'encargado' && r.split('/')[0] === u.asoc) || rutaAnuncio(u, r)) && objetos.delete(r)) borrados.push({ name: r })
          return { data: borrados, error: null }
        }
      })
    },

    rpc: async (nombre, a = {}) => {
      const u = ctx()
      const hoyIso = new Date().toISOString().slice(0, 10)
      if (nombre === 'furgonetas_libres') {
        if (!u || !esEquipoApp(u, u.asoc, 'furgonetas')) return { data: [], error: null }
        const ventana = { id: a.p_excluir ?? null, fecha: a.p_desde, fecha_fin: a.p_hasta }
        return { data: db.furgonetas.filter(f => f.asociacion_id === u.asoc && f.activa).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')).map(f => {
          const o = db.plan_furgonetas.filter(x => x.furgoneta_id === f.id && x.plan_id !== ventana.id).map(x => planDe(x.plan_id)).find(q => q && solapa(q, ventana))
          return { id: f.id, nombre: f.nombre, plazas: f.plazas, ocupada: !!o, ocupada_por: o?.titulo ?? null }
        }), error: null }
      }
      if (nombre === 'planes_aforo') {
        return { data: db.planes.filter(p => visible('planes', p)).map(p => ({ plan_id: p.id, apuntados: apuntados(p.id) })), error: null }
      }
      if (nombre === 'mis_inscripciones') {
        return { data: db.plan_inscritos.filter(i => u && esFamiliar(u, i.socio_id)).map(i => ({ plan_id: i.plan_id, socio_id: i.socio_id })), error: null }
      }
      if (nombre === 'apuntar_hijo') {
        const s = socioDe(a.p_socio), p = planDe(a.p_plan)
        if (!u || !s || !esFamiliar(u, s.id)) return err('P0001', 'No puedes apuntar a este chaval')
        if (!p || !visible('planes', p) || s.asociacion_id !== p.asociacion_id) return err('P0001', 'Plan no disponible')
        if (p.fecha_fin < hoyIso) return err('P0001', 'Este plan ya ha pasado')
        if (!a.p_apuntar) { db.plan_inscritos = db.plan_inscritos.filter(i => !(i.plan_id === p.id && i.socio_id === s.id)); return { data: null, error: null } }
        if (p.niveles.length && !p.niveles.includes(s.nivel)) return err('P0001', 'Este plan no es para su nivel')
        if (!socioActivo(s)) return err('P0001', 'Este chaval no está activo')
        if (db.plan_inscritos.some(i => i.plan_id === p.id && i.socio_id === s.id)) return { data: null, error: null }
        if (p.limite != null && apuntados(p.id) >= p.limite) return err('P0001', 'No quedan plazas')
        db.plan_inscritos.push({ plan_id: p.id, socio_id: s.id, creado_por: u.id, creado_en: hoyIso })
        return { data: null, error: null }
      }
      if (nombre === 'socios_campos') {
        if (!u || !esEquipo(u, u.asoc)) return { data: [], error: null }
        return { data: db.socios.filter(x => x.asociacion_id === u.asoc).map(x => ({ id: x.id, nombre: x.nombre, apellidos: x.apellidos, nivel: x.nivel,
          activo: !!x.no_socio || db.periodos_alta.some(p => p.socio_id === x.id && !p.fecha_baja) })).sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')), error: null }
      }
      if (nombre === 'direcciones_postales') {
        if (!u || !(u.rol === 'encargado' || u.rol === 'preceptor') || !appActiva(u, 'herramientas')) return { data: [], error: null }
        return { data: db.socios.filter(x => x.asociacion_id === u.asoc && (x.no_socio || db.periodos_alta.some(p => p.socio_id === x.id && !p.fecha_baja)))
          .map(x => ({ id: x.id, nombre: x.nombre, apellidos: x.apellidos, nivel: x.nivel, direccion: x.direccion ?? null, codigo_postal: x.codigo_postal ?? null, localidad: x.localidad ?? null, provincia: x.provincia ?? null,
            correo_padre: x.correo_padre ?? null, correo_madre: x.correo_madre ?? null }))
          .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')), error: null }
      }
      if (nombre === 'hucha_saldos') {
        return { data: db.socios.filter(s => puedeVerHucha(u, s)).map(s => ({ socio_id: s.id, saldo: saldoHucha(s.id) })), error: null }
      }
      if (nombre === 'socios_dineros') {
        if (!u || !esEquipoApp(u, u.asoc, 'dineros')) return { data: [], error: null }
        return { data: db.socios.filter(x => x.asociacion_id === u.asoc).map(x => ({ id: x.id, nombre: x.nombre, apellidos: x.apellidos, nivel: x.nivel,
          activo: !!x.no_socio || db.periodos_alta.some(p => p.socio_id === x.id && !p.fecha_baja), saldo: saldoHucha(x.id) }))
          .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, 'es')), error: null }
      }
      if (nombre === 'hucha_historial') {
        const s = socioDe(a.p_socio)
        if (!puedeVerHucha(u, s)) return { data: [], error: null }
        const filas = [
          ...db.hucha_movimientos.filter(m => m.socio_id === s.id).map(m => ({ id: m.id, fecha: m.fecha, concepto: m.concepto, categoria: m.categoria, importe: Number(m.importe),
            origen: m.retirada_id ? 'retirada' : 'manual', _o: m.creado_en })),
          ...db.campo_participantes.filter(x => x.socio_id === s.id && Number(x.importe) > 0).map(x => { const c = campoDe(x.campo_id)
            return { id: null, fecha: c.fecha.slice(0, 10), concepto: `Trabajo: ${c.nombre}`, categoria: 'campo_trabajo', importe: Number(x.importe), origen: 'campo', _o: c.creado_en } }),
          ...db.retiradas_campo.filter(x => x.socio_id === s.id).map(x => ({ id: null, fecha: x.fecha, concepto: `Retirada de trabajos: ${x.actividad_titulo}`,
            categoria: 'campo_retirada', importe: -Number(x.importe), origen: 'campo', _o: x.creado_en }))
        ].sort((p, q) => String(q.fecha).localeCompare(String(p.fecha)) || String(q._o ?? '').localeCompare(String(p._o ?? '')))
        return { data: filas.map(({ _o, ...f }) => f), error: null }
      }
      if (nombre === 'lista_preceptores') {
        if (!u || !esEquipo(u, u.asoc)) return { data: [], error: null }
        return { data: db.accesos_permitidos.filter(x => x.asociacion_id === u.asoc && x.rol === 'preceptor').map(x => ({ email: x.email, nombre: x.nombre ?? null })), error: null }
      }
      if (nombre === 'actividades_para_retirar') {
        const sc = socioDe(a.p_socio)
        if (!sc || !esEquipo(u, sc.asociacion_id)) return { data: [], error: null }
        return { data: structuredClone(actividadesParaRetirar(sc)), error: null }
      }
      if (nombre === 'retirar_campo') {
        const sc = socioDe(a.p_socio)
        if (!sc || !esEquipo(u, sc.asociacion_id)) return err('P0001', 'Sin permiso')
        const imp = Number(a.p_importe)
        if (!(imp > 0)) return err('P0001', 'El importe debe ser mayor que 0')
        const act = actividadesParaRetirar(sc).find(x => x.id === a.p_actividad)
        if (!act) return err('P0001', 'Esa actividad no está disponible para este socio')
        const saldo = saldoCampo(sc.id)
        if (imp > saldo + 1e-9) return err('P0001', `El socio solo tiene ${saldo.toFixed(2)} € disponibles`)
        const id = uuid()
        db.retiradas_campo.push({ id, asociacion_id: sc.asociacion_id, socio_id: sc.id, actividad_id: act.id, actividad_titulo: act.titulo,
          importe: Math.round(imp * 100) / 100, fecha: hoyIso, nota: String(a.p_nota ?? '').trim().slice(0, 300) || null, creado_por: u.id, creado_en: hoyIso })
        db.hucha_movimientos.push({ id: uuid(), asociacion_id: sc.asociacion_id, socio_id: sc.id, fecha: hoyIso, categoria: act.tipo === 'curso_retiro' ? 'curso_retiro' : 'convivencia',
          concepto: `Pagado con trabajos: ${act.titulo}`.slice(0, 120), importe: Math.round(imp * 100) / 100, retirada_id: id, creado_por: u.id, creado_en: hoyIso })
        return { data: id, error: null }
      }
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
            movil_padre: limpio(t.movil_padre, 30), movil_madre: limpio(t.movil_madre, 30), direccion: limpio(t.direccion, 200),
            codigo_postal: limpio(t.codigo_postal, 10), localidad: limpio(t.localidad, 100), provincia: limpio(t.provincia, 100) }
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
          movil_padre: v('movil_padre', 30), movil_madre: v('movil_madre', 30), direccion: v('direccion', 200),
          codigo_postal: v('codigo_postal', 10), localidad: v('localidad', 100), provincia: v('provincia', 100) })
        const ids = db.familiares_socios.filter(x => f.emails.includes(x.email)).map(x => x.socio_id)
        for (const s of db.socios) if (ids.includes(s.id) && s.asociacion_id === f.asociacion_id)
          Object.assign(s, { nombre_padre: f.nombre_padre, nombre_madre: f.nombre_madre, movil_padre: f.movil_padre, movil_madre: f.movil_madre, direccion: f.direccion, codigo_postal: f.codigo_postal, localidad: f.localidad, provincia: f.provincia })
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
            correo_padre: s.correo_padre, correo_madre: s.correo_madre, movil_padre: s.movil_padre, movil_madre: s.movil_madre, direccion: s.direccion, codigo_postal: s.codigo_postal ?? null, localidad: s.localidad ?? null, provincia: s.provincia ?? null,
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
              movil_padre: d.movil_padre || null, movil_madre: d.movil_madre || null, direccion: d.direccion || null, codigo_postal: d.codigo_postal || null, localidad: d.localidad || null, provincia: d.provincia || null, descuento_tipo: 'porcentaje', descuento_valor: 0, descuento_nota: null, creada_en: hoyIso })
            for (const e of emails) if (!db.accesos_permitidos.some(x => x.email === e))
              db.accesos_permitidos.push({ email: e, asociacion_id: s.asociacion_id, rol: 'familia', anadido_por: u.id })
          } else if (s.tipo === 'socio') {
            const fam = db.familias.find(f => f.asociacion_id === s.asociacion_id && f.emails.includes(s.email)) || {}
            const id = uuid()
            db.socios.push({ id, asociacion_id: s.asociacion_id, nombre: d.nombre, apellidos: d.apellidos,
              fecha_nacimiento: d.fecha_nacimiento || null, nivel: d.nivel, nombre_padre: fam.nombre_padre ?? null,
              nombre_madre: fam.nombre_madre ?? null, alergias: d.alergias || null, direccion: fam.direccion ?? null, codigo_postal: fam.codigo_postal ?? null, localidad: fam.localidad ?? null, provincia: fam.provincia ?? null,
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
