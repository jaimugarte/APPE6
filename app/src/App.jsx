import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import Admin from './Admin'
import Ajustes from './Ajustes'
import Socios from './Socios'
import Asistencia from './Asistencia'

const ROL = { encargado: 'Encargado', preceptor: 'Preceptor', familia: 'Familia' }

export default function App() {
  const [session, setSession] = useState(undefined)
  const [ctx, setCtx] = useState(null)
  const [vista, setVista] = useState('hub')
  const [abierta, setAbierta] = useState(null)
  const error = new URLSearchParams(location.search).get('error_description')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
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
    setCtx({ perfil, mem, apps })
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  if (session === undefined) return <p className="centro">Cargando…</p>

  if (!session)
    return (
      <main className="centro">
        <h1>Hub de Asociación</h1>
        {error && <p className="error">{error}. Pide a tu encargado que autorice tu correo.</p>}
        <button className="primario" onClick={() =>
          supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })}>
          Entrar con Google
        </button>
      </main>
    )

  if (!ctx) return <p className="centro">Cargando…</p>

  const { perfil, mem, apps } = ctx
  const esAdmin = perfil?.es_admin_global
  const esEncargado = mem?.rol === 'encargado'
  const activas = apps.filter(a => a.activa)

  return (
    <div className="app">
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
      {vista === 'app' && abierta && !['socios', 'asistencia'].includes(abierta.app_clave) &&
        <main><p className="aviso">«{abierta.apps.nombre}» se construirá en un próximo paso.</p></main>}
      {vista === 'ajustes' && esEncargado &&
        <Ajustes asoc={mem.asociacion_id} apps={apps} uid={session.user.id} recargar={cargar} />}
      {vista === 'admin' && esAdmin && <Admin uid={session.user.id} />}
    </div>
  )
}
