import { lazy, Suspense, useState } from 'react'
import { IconoApp } from './iconos'
import Socios from './Socios'
import Asistencia from './Asistencia'
import Actividades from './Actividades'
import Furgonetas from './Furgonetas'
import Solicitudes from './Solicitudes'
import Herramientas from './Herramientas'
import Dineros from './Dineros'

// ECharts pesa bastante: solo se descarga al abrir Estadísticas
const Estadisticas = lazy(() => import('./Estadisticas'))

// Barra fina fija arriba: una opción a la izquierda y otra a la derecha
function SubBarra({ izq, der, valor, onCambio }) {
  const op = o => (
    <button key={o.id} className={valor === o.id ? 'on' : ''} aria-pressed={valor === o.id} onClick={() => onCambio(o.id)}>
      {o.etiqueta}{o.insignia > 0 && <span className="contador" aria-label={`${o.insignia} pendientes`}>{o.insignia}</span>}
    </button>
  )
  return <div className="subbarra" role="group">{op(izq)}{op(der)}</div>
}

// Inicio del equipo (encargado y preceptores): barra de pestañas fija abajo, como en WhatsApp
//   Calendario (por defecto) · E6 (Asistencia | Estadísticas) · Chavales (con lupa y menú ⋮: Nuevo chaval, Importar, Solicitudes) · Varios (Dineros, Herramientas…)
export default function ShellEquipo({ activas, mem, email, uid, conSolicitudes, pendientes, onCambio }) {
  const tiene = k => activas.some(a => a.app_clave === k)
  const asoc = mem.asociacion_id, rol = mem.rol
  const variosApps = activas.filter(a => !['asistencia', 'estadisticas', 'socios', 'actividades'].includes(a.app_clave))

  const pestanas = [
    tiene('actividades') && { id: 'act', nombre: 'Calendario', icono: 'actividades' },   // pestaña por defecto
    (tiene('asistencia') || tiene('estadisticas')) && { id: 'e6', nombre: 'E6', icono: 'asistencia' },
    (tiene('socios') || conSolicitudes) && { id: 'bd', nombre: 'Chavales', icono: 'socios', insignia: pendientes },
    variosApps.length > 0 && { id: 'varios', nombre: 'Varios', icono: 'varios' }
  ].filter(Boolean)

  const [tab, setTab] = useState(pestanas[0]?.id)
  const [e6, setE6] = useState('asistencia')
  const [bd, setBd] = useState('socios')
  const [varios, setVarios] = useState(null)   // null = bloques; si no, clave de la app abierta

  if (!pestanas.length) {
    return <main><div className="vacio"><p>Todavía no tienes apps disponibles. Pídele acceso al encargado de tu asociación.</p></div></main>
  }
  const actual = pestanas.find(p => p.id === tab) ? tab : pestanas[0].id

  const e6Opc = ['asistencia', 'estadisticas'].filter(tiene)
  const e6Sel = e6Opc.includes(e6) ? e6 : e6Opc[0]
  const bdSel = !tiene('socios') ? 'solicitudes' : bd
  const appVarios = variosApps.find(a => a.app_clave === varios)

  return (
    <>
      {actual === 'e6' && <>
        {e6Opc.length === 2 && <SubBarra izq={{ id: 'asistencia', etiqueta: 'Asistencia' }} der={{ id: 'estadisticas', etiqueta: 'Estadísticas' }} valor={e6Sel} onCambio={setE6} />}
        {e6Sel === 'asistencia' && <Asistencia asoc={asoc} rol={rol} email={email} />}
        {e6Sel === 'estadisticas' && <Suspense fallback={<main><p>Cargando…</p></main>}><Estadisticas asoc={asoc} rol={rol} /></Suspense>}
      </>}

      {actual === 'bd' && <>
        {bdSel === 'socios' && <Socios asoc={asoc} rol={rol} email={email} pendientes={conSolicitudes ? pendientes : 0} onSolicitudes={conSolicitudes ? () => setBd('solicitudes') : null} />}
        {bdSel === 'solicitudes' && <>
          {tiene('socios') && <div className="subbarra una"><button onClick={() => setBd('socios')}>← Socios</button><b>Solicitudes</b></div>}
          <Solicitudes onCambio={onCambio} />
        </>}
      </>}

      {actual === 'act' && <Actividades asoc={asoc} rol={rol} email={email} />}

      {actual === 'varios' && (appVarios
        ? <>
          <div className="subbarra una"><button onClick={() => setVarios(null)}>← Varios</button><b>{appVarios.apps.nombre}</b></div>
          {appVarios.app_clave === 'dineros' && <Dineros asoc={asoc} rol={rol} uid={uid} />}
          {appVarios.app_clave === 'herramientas' && <Herramientas />}
          {appVarios.app_clave === 'furgonetas' && <Furgonetas asoc={asoc} rol={rol} />}
          {!['dineros', 'herramientas', 'furgonetas'].includes(appVarios.app_clave) && <main><p className="aviso">«{appVarios.apps.nombre}» se construirá en un próximo paso.</p></main>}
        </>
        : <main>
          <h1 className="solo-lectores">Varios</h1>
          <div className="grid">
            {variosApps.map(a => (
              <button key={a.app_clave} className="tarjeta" onClick={() => setVarios(a.app_clave)}>
                <span className="icono"><IconoApp clave={a.app_clave} /></span>
                <b>{a.apps.nombre}</b>
                <span className="desc">{a.apps.descripcion}</span>
              </button>
            ))}
          </div>
        </main>)}

      <nav className="barra-inferior" aria-label="Secciones">
        {pestanas.map(p => (
          <button key={p.id} className={actual === p.id ? 'on' : ''} aria-current={actual === p.id ? 'page' : undefined}
            onClick={() => { setTab(p.id); if (p.id === 'varios') setVarios(null) }}>
            <span className="ico"><IconoApp clave={p.icono} size={24} />{p.insignia > 0 && <span className="contador" aria-label={`${p.insignia} pendientes`}>{p.insignia}</span>}</span>
            <span>{p.nombre}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
