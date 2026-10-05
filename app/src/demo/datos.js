// Base de datos de ejemplo para el modo demo. Se genera de forma determinista (mismo resultado cada vez)
// pero con fechas relativas a hoy, para que los gráficos siempre tengan datos recientes.
import { hoy, inicioPeriodo, sumarPeriodos, finPeriodo } from '../util.js'

// Generador pseudoaleatorio con semilla (mulberry32)
function azar(semilla) {
  return () => {
    semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const p2 = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
// Resta meses a una fecha (el día se limita a 28 para no desbordar)
const restarMeses = (f, n, dia) => { const d = deIso(f); d.setDate(1); d.setMonth(d.getMonth() - n); d.setDate(dia ?? Math.min(deIso(f).getDate(), 28)); return iso(d) }
const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const NOMBRES = ['Pablo', 'Lucía', 'Javier', 'Carmen', 'Álvaro', 'Marta', 'Diego', 'Elena', 'Hugo', 'Sofía', 'Mateo', 'Paula', 'Daniel', 'Irene', 'Adrián', 'Claudia', 'Lucas', 'Alba', 'Martín', 'Inés', 'Sergio', 'Julia', 'Carlos', 'Noa', 'Iván', 'Carla', 'Nicolás', 'Laura', 'Marcos', 'Ana', 'Rubén', 'Eva', 'Gonzalo', 'Teresa', 'Pedro', 'Cristina', 'Jaime', 'Rocío', 'Ignacio', 'Blanca', 'Tomás', 'Lola']
const APELLIDOS = ['García', 'Martínez', 'López', 'Sánchez', 'Fernández', 'González', 'Rodríguez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco', 'Molina', 'Castro', 'Ortega', 'Delgado', 'Marín', 'Iglesias']
const PADRES = ['Antonio', 'José', 'Manuel', 'Francisco', 'Juan', 'Luis', 'Ángel', 'Rafael', 'Fernando', 'Alberto', 'Ricardo', 'Jesús']
const MADRES = ['María', 'Carmen', 'Ana', 'Isabel', 'Laura', 'Marta', 'Elena', 'Cristina', 'Lucía', 'Patricia', 'Beatriz', 'Rosa']
const CALLES = ['Calle Mayor', 'Avenida de la Paz', 'Calle del Sol', 'Paseo de los Olmos', 'Calle Cervantes', 'Plaza de España', 'Calle Alcalá']
const ALERGIAS = ['Frutos secos', 'Lactosa', 'Polen', 'Gluten', 'Marisco', 'Picaduras de avispa']
const MOTIVOS = ['Cambio de ciudad', 'Falta de tiempo', 'Cambio de colegio', 'Otros intereses']

const NIVELES_SEMBRADOS = [
  ['5º primaria', 5, 10], ['6º primaria', 6, 11], ['1º ESO', 8, 12], ['2º ESO', 8, 13],
  ['3º ESO', 7, 14], ['4º ESO', 5, 15], ['1º Bachillerato', 3, 16]
]

// [id, nombre, abreviatura, periodicidad, probabilidad media de asistir]
const TIPOS = [
  ['t-charla', 'Charla', 'CHAR', 'semanal', 0.82], ['t-circulo', 'Círculo', 'CIRC', 'semanal', 0.78],
  ['t-visita', 'Visita de pobres', 'VIPO', 'mensual', 0.55], ['t-retiro', 'Retiro mensual', 'RTME', 'mensual', 0.62],
  ['t-curso', 'Curso de retiro', 'CRT', 'anual', 0.7], ['t-precept', 'Preceptuación', 'PREC', 'semanal', 0.86],
  ['t-sacerdote', 'Sacerdote', 'SACD', 'semanal', 0.72]
]

export const USUARIOS_DEMO = {
  admin: { id: 'u-admin', email: 'admin@demo.es', nombre: 'Admin global', admin: true },
  encargado: { id: 'u-enc', email: 'encargado@demo.es', nombre: 'Encargado de la asociación' },
  preceptor: { id: 'u-pre', email: 'preceptor@demo.es', nombre: 'Preceptor de 1º y 2º ESO' },
  familia: { id: 'u-fam', email: 'familia@demo.es', nombre: 'Familia de ejemplo' }
}

export function crearBD() {
  const r = azar(2026)
  const elige = lista => lista[Math.floor(r() * lista.length)]
  const H = hoy()
  const ASOC = 'asoc-1', ASOC2 = 'asoc-2'

  const db = {
    global_admins: [{ email: USUARIOS_DEMO.admin.email }],
    perfiles: Object.values(USUARIOS_DEMO).map(u => ({
      id: u.id, email: u.email, nombre: u.nombre, es_admin_global: !!u.admin, creado_en: H
    })),
    asociaciones: [
      { id: ASOC, nombre: 'Club Juvenil de Ejemplo', foto_ruta: null, creada_en: H },
      { id: ASOC2, nombre: 'Otra Asociación (vacía)', foto_ruta: null, creada_en: H }
    ],
    apps: [
      { clave: 'socios', nombre: 'Socios', descripcion: 'Base de datos de socios, altas y bajas' },
      { clave: 'asistencia', nombre: 'Asistencia', descripcion: 'Registro de asistencia a actividades' },
      { clave: 'estadisticas', nombre: 'Estadísticas', descripcion: 'Gráficos y paneles' },
      { clave: 'anuncios', nombre: 'Anuncios', descripcion: 'Planes y avisos (futuro)' },
      { clave: 'fotos', nombre: 'Fotos', descripcion: 'Galería de actividades (futuro)' }
    ],
    asociacion_apps: [
      { asociacion_id: ASOC, app_clave: 'socios', permitida: true, activa: true },
      { asociacion_id: ASOC, app_clave: 'asistencia', permitida: true, activa: true },
      { asociacion_id: ASOC, app_clave: 'estadisticas', permitida: true, activa: true },
      { asociacion_id: ASOC, app_clave: 'anuncios', permitida: true, activa: false }
    ],
    accesos_permitidos: [
      { email: 'encargado@demo.es', asociacion_id: ASOC, rol: 'encargado' },
      { email: 'preceptor@demo.es', asociacion_id: ASOC, rol: 'preceptor' },
      { email: 'preceptor2@demo.es', asociacion_id: ASOC, rol: 'preceptor' },
      { email: 'familia@demo.es', asociacion_id: ASOC, rol: 'familia' }
    ],
    membresias: [
      { user_id: 'u-enc', asociacion_id: ASOC, rol: 'encargado' },
      { user_id: 'u-pre', asociacion_id: ASOC, rol: 'preceptor' },
      { user_id: 'u-fam', asociacion_id: ASOC, rol: 'familia' }
    ],
    permisos_preceptor: [
      { asociacion_id: ASOC, app_clave: 'socios', puede_ver: true, puede_editar: true, ambito: 'su_nivel' },
      { asociacion_id: ASOC, app_clave: 'asistencia', puede_ver: true, puede_editar: true, ambito: 'su_nivel' },
      { asociacion_id: ASOC, app_clave: 'estadisticas', puede_ver: true, puede_editar: false, ambito: 'su_nivel' }
    ],
    preceptor_niveles: [
      { asociacion_id: ASOC, email: 'preceptor@demo.es', nivel: '1º ESO' },
      { asociacion_id: ASOC, email: 'preceptor@demo.es', nivel: '2º ESO' },
      { asociacion_id: ASOC, email: 'preceptor2@demo.es', nivel: '3º ESO' }
    ],
    tipos_actividad: TIPOS.map(([id, nombre, abreviatura, periodicidad], i) => ({
      id, asociacion_id: ASOC, nombre, abreviatura, periodicidad, activa: true, orden: i + 1
    })),
    socios: [], periodos_alta: [], socios_bancarios: [], familiares_socios: [], registros_asistencia: [],
    // Solicitudes de alta: enlace de invitación, familias aprobadas y solicitudes de ejemplo
    enlaces_alta: [{ id: 'e-1', asociacion_id: ASOC, token: 'demo-invitacion', activo: true, caduca_en: null, creado_en: H }],
    familias: [{ id: 'f-1', asociacion_id: ASOC, emails: ['familia@demo.es'], nombre_padre: 'Antonio Demo', nombre_madre: 'María Prueba',
      correo_padre: 'antonio@example.com', correo_madre: 'maria@example.com', movil_padre: '600111222', movil_madre: '600333444',
      direccion: 'Calle Mayor 1, 2º', creada_en: H }],
    permisos_aprobacion: [{ asociacion_id: ASOC, email: 'preceptor@demo.es', alcance: 'su_nivel' }],
    solicitudes_alta: [
      { id: 'sol-1', asociacion_id: ASOC, tipo: 'familia', estado: 'pendiente', email: 'jorge.nuevo@example.com',
        niveles: ['1º ESO', '5º primaria'], motivo_resolucion: null, resuelta_por: null, resuelta_en: null, creada_en: H,
        datos: { nombre_padre: 'Jorge Nuevo', nombre_madre: 'Elisa Familia', correo_padre: 'jorge.nuevo@example.com', correo_madre: 'elisa.familia@example.com',
          movil_padre: '611000111', movil_madre: '', direccion: 'Avenida de la Paz 12' } },
      { id: 'sol-2', asociacion_id: ASOC, tipo: 'familia', estado: 'pendiente', email: 'rosa.otra@example.com',
        niveles: ['3º ESO'], motivo_resolucion: null, resuelta_por: null, resuelta_en: null, creada_en: H,
        datos: { nombre_padre: '', nombre_madre: 'Rosa Otra', correo_padre: '', correo_madre: 'rosa.otra@example.com', movil_padre: '', movil_madre: '622000333', direccion: '' } },
      { id: 'sol-3', asociacion_id: ASOC, tipo: 'socio', estado: 'pendiente', email: 'familia@demo.es',
        niveles: ['2º ESO'], motivo_resolucion: null, resuelta_por: null, resuelta_en: null, creada_en: H,
        datos: { nombre: 'Lucas', apellidos: 'Demo Prueba', fecha_nacimiento: '2013-05-20', nivel: '2º ESO', alergias: '', correo_socio: '' } }
    ]
  }

  // ---- Socios, altas y bajas ----
  let n = 0
  for (const [nivel, cuantos, edadBase] of NIVELES_SEMBRADOS) {
    for (let i = 0; i < cuantos; i++, n++) {
      const id = `s-${n + 1}`
      const nombre = NOMBRES[n % NOMBRES.length]
      const ap1 = elige(APELLIDOS), ap2 = elige(APELLIDOS)
      const nac = deIso(H); nac.setFullYear(nac.getFullYear() - edadBase); nac.setDate(nac.getDate() - Math.floor(r() * 360))
      const padre = elige(PADRES), madre = elige(MADRES)
      const base = sinAcentos(`${nombre}.${ap1}`)
      db.socios.push({
        id, asociacion_id: ASOC, nombre, apellidos: `${ap1} ${ap2}`, fecha_nacimiento: iso(nac), nivel,
        nombre_padre: `${padre} ${ap1}`, nombre_madre: `${madre} ${ap2}`,
        alergias: r() < 0.15 ? elige(ALERGIAS) : null,
        direccion: `${elige(CALLES)} ${1 + Math.floor(r() * 80)}, ${1 + Math.floor(r() * 6)}º`,
        correo_padre: sinAcentos(`${padre}.${ap1}`) + '@example.com',
        correo_madre: sinAcentos(`${madre}.${ap2}`) + '@example.com',
        correo_socio: edadBase >= 12 ? `${base}@example.com` : null,
        movil_padre: '6' + String(Math.floor(r() * 1e8)).padStart(8, '0'),
        movil_madre: '6' + String(Math.floor(r() * 1e8)).padStart(8, '0'),
        creado_en: H
      })
      // Más altas recientes que antiguas
      const m0 = Math.floor(Math.pow(r(), 1.5) * 40) + 1
      const alta = restarMeses(H, m0, 1 + Math.floor(r() * 27))
      const periodos = [{ id: `p-${id}-1`, socio_id: id, fecha_alta: alta, fecha_baja: null, motivo_baja: null }]
      if (m0 >= 6 && r() < 0.22) {
        const mb = 1 + Math.floor(r() * (m0 - 2))
        periodos[0].fecha_baja = restarMeses(H, mb, 15)
        periodos[0].motivo_baja = elige(MOTIVOS)
        if (mb >= 2 && r() < 0.4)
          periodos.push({ id: `p-${id}-2`, socio_id: id, fecha_alta: restarMeses(H, mb - 1, 10), fecha_baja: null, motivo_baja: null })
      }
      db.periodos_alta.push(...periodos)
    }
  }
  db.socios_bancarios.push({ socio_id: 's-1', iban: 'ES9121000418450200051332' })

  // Dos hermanos vinculados a la cuenta de familia de ejemplo
  const [h1, h2] = [db.socios[9], db.socios[17]]
  h2.apellidos = h1.apellidos; h2.nombre_padre = h1.nombre_padre; h2.nombre_madre = h1.nombre_madre
  for (const h of [h1, h2]) {
    h.correo_madre = 'familia@demo.es'
    db.familiares_socios.push({ email: 'familia@demo.es', socio_id: h.id })
  }

  // ---- Asistencia de los últimos 24 meses ----
  const propension = Object.fromEntries(db.socios.map(s => [s.id, 0.65 + r() * 0.35]))
  const desde = inicioPeriodo(restarMeses(H, 24, 1), 'semanal')
  const periodosPorSocio = Object.fromEntries(db.socios.map(s => [s.id, db.periodos_alta.filter(p => p.socio_id === s.id)]))

  // Como en la app real, solo se guardan las asistencias: sin registro significa que no asistió
  for (const [tipoId, , , per, tasa] of TIPOS) {
    const actual = inicioPeriodo(H, per)
    for (let ini = inicioPeriodo(desde, per); ini <= actual; ini = sumarPeriodos(ini, per, 1)) {
      const fin = finPeriodo(ini, per)
      const mes = Number(ini.slice(5, 7))
      const verano = per === 'semanal' && (mes === 7 || mes === 8)
      for (const s of db.socios) {
        const activo = periodosPorSocio[s.id].some(p => p.fecha_alta <= fin && (!p.fecha_baja || p.fecha_baja >= ini))
        if (!activo) continue
        // En verano casi no hay actividad semanal; el periodo en curso aún tiene pocas asistencias marcadas
        const pAsiste = Math.min(0.98, tasa * propension[s.id] * (verano ? 0.6 : 1) * (ini === actual ? 0.3 : 1))
        if (r() < pAsiste)
          db.registros_asistencia.push({ socio_id: s.id, tipo_actividad_id: tipoId, periodo_inicio: ini, asistio: true })
      }
    }
  }

  return db
}
