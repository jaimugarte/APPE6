import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { supabase, DEMO } from './supabase'
import Admin from './Admin'
import Ajustes from './Ajustes'
import Socios from './Socios'
import Asistencia from './Asistencia'
import { Logo, IconoApp } from './iconos'
import { useFotoUrl } from './foto'
import FormularioAlta from './FormularioAlta'
import Solicitudes from './Solicitudes'
import FamiliaHijos from './FamiliaHijos'
import FamiliaCuotas from './FamiliaCuotas'
import Actividades from './Actividades'
import HubFamilia from './HubFamilia'

// ECharts pesa bastante: solo se descarga al abrir Estadísticas
const Estadisticas = lazy(() => import('./Estadisticas'))

const ROL = { encargado: 'Encargado', preceptor: 'Preceptor', familia: 'Familia' }

// Qué ve cada rol en la demo, explicado para quien la prueba
const ROLES_DEMO = [
  ['encargado', 'Encargado', 'Gestiona socios, actividades, permisos y ajustes de la asociación.'],
  ['preceptor', 'Preceptor', 'Ve y edita los socios de 1º y 2º ESO, según los permisos que le da el encargado.'],
  ['familia', 'Familia', 'Consulta la ficha y la asistencia de sus hijos, sin poder modificarlas.'],
  ['admin', 'Admin global', 'Crea asociaciones, concede apps y autoriza a los encargados.']
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [ctx, setCtx] = useState(null)
  const [vista, setVista] = useState('hub')
  const [abierta, setAbierta] = useState(null)
  const [version, setVersion] = useState(0) // sube al cambiar algo en el portal de la familia, para refrescar los resúmenes
  const params = new URLSearchParams(location.search)
  const error = params.get('error_description')
  const alta = params.get('alta') // enlace de invitación: formulario público de alta de familia
  const fotoUrl = useFotoUrl(ctx?.mem?.asociaciones?.foto_ruta)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setCtx(null); setVista('hub'); setAbierta(null) } // al salir, no queda nada del usuario anterior
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!session) return
    const uid = session.user.id
    const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', uid).single()
    const { data: mem } = await supabase
      .from('membresias').select('rol, asociacion_id, asociaciones(nombre, foto_ruta)').eq('user_id', uid).maybeSingle()
    let apps = []
    if (mem) {
      const { data } = await supabase
        .from('asociacion_apps').select('app_clave, permitida, activa, apps(nombre, descripcion)')
        .eq('asociacion_id', mem.asociacion_id)
      apps = data || []
    }
    // Un preceptor solo ve en el hub las apps sobre las que el encargado le ha dado permiso de ver
    let permisos = []
    if (mem?.rol === 'preceptor') {
      const { data } = await supabase.from('permisos_preceptor')
        .select('app_clave, puede_ver').eq('asociacion_id', mem.asociacion_id)
      permisos = data || []
    }
    // Solicitudes de alta: ¿puede este usuario aprobarlas y cuántas hay pendientes?
    let aprueba = mem?.rol === 'encargado', pendientes = 0
    if (mem?.rol === 'preceptor') {
      const { data } = await supabase.from('permisos_aprobacion').select('alcance').eq('asociacion_id', mem.asociacion_id).maybeSingle()
      aprueba = !!data && data.alcance !== 'ninguno'
    }
    if (aprueba) {
      const { data } = await supabase.from('solicitudes_alta').select('id').eq('estado', 'pendiente')
      pendientes = data?.length || 0
    }
    setCtx({ perfil, mem, apps, permisos, aprueba, pendientes })
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  if (alta) return <FormularioAlta token={alta} />

  if (session === undefined) return <p className="centro">Cargando…</p>

  if (!session)
    return (
      <main className="centro">
        <span className="logo"><Logo size={30} /></span>
        <h1>Hub de asociación</h1>
        {DEMO ? (
          <>
            <p>Esta es una demo con datos de ejemplo. Elige con qué rol quieres entrar.</p>
            <p className="aviso"><a href="/?alta=demo-invitacion">Ver el formulario de invitación para familias</a></p>
            <div className="roles-demo">
              {ROLES_DEMO.map(([k, titulo, desc]) => (
                <button key={k} className="rol-demo" onClick={() => supabase.auth.entrarComo(k)}>
                  <b>{titulo}</b><span>{desc}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Socios, asistencia y estadísticas de tu asociación juvenil.</p>
            {error && <p className="error">{error}. Pide a tu encargado que autorice tu correo.</p>}
            <button className="primario" onClick={() =>
              supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })}>
              Entrar con Google
            </button>
          </>
        )}
      </main>
    )

  if (!ctx) return <p className="centro">Cargando…</p>

  const { perfil, mem, apps, permisos, aprueba, pendientes } = ctx
  const esAdmin = perfil?.es_admin_global
  const esEncargado = mem?.rol === 'encargado'
  // Las familias nunca ven Asistencia ni Estadísticas; sí el resto de apps (socios, anuncios, fotos…)
  const SOLO_EQUIPO = ['asistencia', 'estadisticas', 'socios'] // Socios lo sustituye, para ellas, su pantalla de inicio
  const visible = a => esEncargado
    || (mem?.rol === 'preceptor'
      ? !!permisos.find(p => p.app_clave === a.app_clave)?.puede_ver
      : !SOLO_EQUIPO.includes(a.app_clave))
  const activas = apps.filter(a => a.activa && visible(a))
  // Solicitudes no es una app del catálogo: solo quien puede aprobar. Las familias ven el estado en su inicio.
  const esFamilia = mem?.rol === 'familia'
  const conSolicitudes = !!mem && aprueba

  return (
    <div className="app">
      {DEMO && <div className="demo">Modo demo con datos de ejemplo. Se reinician al recargar la página.</div>}
      <header className="cabecera">
        <div className="cabecera-in">
          <div className="marca">
            {fotoUrl
              ? <img className="avatar" src={fotoUrl} alt="" />
              : <span className="logo"><Logo /></span>}
            <div>
              <strong>{mem?.asociaciones?.nombre || 'Administración global'}</strong>
              <span className="rol">{esAdmin ? 'Admin global' : ROL[mem?.rol]}</span>
              <span className="correo">{session.user.email}</span>
            </div>
          </div>
          <nav>
            <button className={vista === 'hub' || vista === 'app' || vista === 'solicitudes' || vista === 'hijos' || vista === 'cuotas' ? 'activo' : ''} onClick={() => setVista('hub')}>Inicio</button>
            {esEncargado && <button className={vista === 'ajustes' ? 'activo' : ''} onClick={() => setVista('ajustes')}>Ajustes</button>}
            {esAdmin && <button className={vista === 'admin' ? 'activo' : ''} onClick={() => setVista('admin')}>Admin</button>}
            <button onClick={() => supabase.auth.signOut()}>Salir</button>
          </nav>
        </div>
      </header>

      {vista === 'hub' && esFamilia && (
        <HubFamilia fotoUrl={fotoUrl} nombre={mem?.asociaciones?.nombre} activas={activas} version={version}
          onVista={setVista} onApp={a => { setAbierta(a); setVista('app') }} />
      )}
      {vista === 'hijos' && esFamilia && <FamiliaHijos onCambio={() => { cargar(); setVersion(v => v + 1) }} />}
      {vista === 'cuotas' && esFamilia && <FamiliaCuotas />}
      {vista === 'hub' && !esFamilia && (
        <main>
          <h1 className="solo-lectores">Apps de la asociación</h1>
          {fotoUrl && <img className="banner" src={fotoUrl} alt={`Foto de ${mem?.asociaciones?.nombre || 'la asociación'}`} />}
          {activas.length === 0 && (
            <div className="vacio">
              <p>
                {esAdmin && !mem
                  ? 'Eres admin global: crea asociaciones, concede apps y autoriza a sus encargados desde Admin.'
                  : esEncargado
                    ? 'Todavía no hay apps activas. Actívalas en Ajustes para empezar.'
                    : 'Todavía no tienes apps disponibles. Pídele acceso al encargado de tu asociación.'}
              </p>
              {esAdmin && !mem && <button className="primario" onClick={() => setVista('admin')}>Abrir Admin</button>}
              {esEncargado && <button className="primario" onClick={() => setVista('ajustes')}>Abrir Ajustes</button>}
            </div>
          )}
          <div className="grid">
            {conSolicitudes && (
              <button className="tarjeta" onClick={() => setVista('solicitudes')}>
                <span className="icono"><IconoApp clave="solicitudes" /></span>
                <b>Solicitudes{pendientes > 0 && <span className="contador" aria-label={`${pendientes} pendientes`}>{pendientes}</span>}</b>
                <span className="desc">Altas pendientes de aprobar</span>
              </button>
            )}
            {activas.map(a => (
              <button key={a.app_clave} className="tarjeta" onClick={() => { setAbierta(a); setVista('app') }}>
                <span className="icono"><IconoApp clave={a.app_clave} /></span>
                <b>{a.apps.nombre}</b>
                <span className="desc">{a.apps.descripcion}</span>
              </button>
            ))}
          </div>
        </main>
      )}
      {vista === 'app' && abierta?.app_clave === 'socios' &&
        <Socios asoc={mem.asociacion_id} rol={mem.rol} email={session.user.email} />}
      {vista === 'app' && abierta?.app_clave === 'asistencia' &&
        <Asistencia asoc={mem.asociacion_id} rol={mem.rol} email={session.user.email} />}
      {vista === 'app' && abierta?.app_clave === 'estadisticas' &&
        <Suspense fallback={<main><p>Cargando…</p></main>}>
          <Estadisticas asoc={mem.asociacion_id} rol={mem.rol} />
        </Suspense>}
      {vista === 'app' && abierta?.app_clave === 'actividades' &&
        <Actividades asoc={mem.asociacion_id} rol={mem.rol} email={session.user.email} />}
      {vista === 'app' && abierta && !['socios', 'asistencia', 'estadisticas', 'actividades'].includes(abierta.app_clave) &&
        <main><p className="aviso">«{abierta.apps.nombre}» se construirá en un próximo paso.</p></main>}
      {vista === 'solicitudes' && conSolicitudes && <Solicitudes onCambio={cargar} />}
      {vista === 'ajustes' && esEncargado &&
        <Ajustes asoc={mem.asociacion_id} apps={apps} uid={session.user.id} fotoRuta={mem.asociaciones?.foto_ruta} recargar={cargar} />}
      {vista === 'admin' && esAdmin && <Admin uid={session.user.id} />}
    </div>
  )
}
