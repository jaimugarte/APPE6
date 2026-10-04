import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { supabase, DEMO } from './supabase'
import Admin from './Admin'
import Ajustes from './Ajustes'
import Socios from './Socios'
import Asistencia from './Asistencia'

// ECharts pesa bastante: solo se descarga al abrir Estadísticas
const Estadisticas = lazy(() => import('./Estadisticas'))

const ROL = { encargado: 'Encargado', preceptor: 'Preceptor', familia: 'Familia' }

export default function App() {
  const [session, setSession] = useState(undefined)
  const [ctx, setCtx] = useState(null)
  const [vista, setVista] = useState('hub')
  const [abierta, setAbierta] = useState(null)
  const error = new URLSearchParams(location.search).get('error_description')

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
      .from('membresias').select('rol, asociacion_id, asociaciones(nombre)').eq('user_id', uid).maybeSingle()
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
    setCtx({ perfil, mem, apps, permisos })
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  if (session === undefined) return <p className="centro">Cargando…</p>

  if (!session)
    return (
      <main className="centro">
        <h1>Hub de Asociación</h1>
        {DEMO ? (
          <>
            <p className="aviso">Modo demo con datos de ejemplo. Elige con qué rol quieres entrar:</p>
            <div className="roles-demo">
              {[['encargado', 'Encargado'], ['preceptor', 'Preceptor (1º y 2º ESO)'], ['familia', 'Familia'], ['admin', 'Admin global']]
                .map(([k, t]) => <button key={k} className="primario" onClick={() => supabase.auth.entrarComo(k)}>{t}</button>)}
            </div>
          </>
        ) : (
          <>
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

  const { perfil, mem, apps, permisos } = ctx
  const esAdmin = perfil?.es_admin_global
  const esEncargado = mem?.rol === 'encargado'
  const visible = a => esEncargado
    || (mem?.rol === 'preceptor'
      ? !!permisos.find(p => p.app_clave === a.app_clave)?.puede_ver
      : a.app_clave !== 'estadisticas') // las familias no ven estadísticas
  const activas = apps.filter(a => a.activa && visible(a))

  return (
    <div className="app">
      {DEMO && <div className="demo">Modo demo · datos de ejemplo que se reinician al recargar la página</div>}
      <header>
        <div>
          <strong>{mem?.asociaciones?.nombre || 'Administración global'}</strong>
          <small>{esAdmin ? 'Admin global' : ROL[mem?.rol]} · {session.user.email}</small>
        </div>
        <nav>
          <button onClick={() => setVista('hub')}>Inicio</button>
          {esEncargado && <button onClick={() => setVista('ajustes')}>Ajustes</button>}
          {esAdmin && <button onClick={() => setVista('admin')}>Admin</button>}
          <button onClick={() => supabase.auth.signOut()}>Salir</button>
        </nav>
      </header>

      {vista === 'hub' && (
        <main>
          {activas.length === 0 && <p>No hay apps activas todavía{esEncargado && ': actívalas en Ajustes'}.</p>}
          <div className="grid">
            {activas.map(a => (
              <button key={a.app_clave} className="tarjeta" onClick={() => { setAbierta(a); setVista('app') }}>
                <b>{a.apps.nombre}</b><span>{a.apps.descripcion}</span>
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
      {vista === 'app' && abierta && !['socios', 'asistencia', 'estadisticas'].includes(abierta.app_clave) &&
        <main><p className="aviso">«{abierta.apps.nombre}» se construirá en un próximo paso.</p></main>}
      {vista === 'ajustes' && esEncargado &&
        <Ajustes asoc={mem.asociacion_id} apps={apps} uid={session.user.id} recargar={cargar} />}
      {vista === 'admin' && esAdmin && <Admin uid={session.user.id} />}
    </div>
  )
}
