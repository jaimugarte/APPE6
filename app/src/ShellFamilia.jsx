import { useState } from 'react'
import { IconoApp } from './iconos'
import Actividades from './Actividades'
import FamiliaHijos from './FamiliaHijos'
import FamiliaCuotas from './FamiliaCuotas'
import FamiliaAjustes from './FamiliaAjustes'
import { AvisoPlanes } from './PlanesFamilia'

// Inicio de las familias: barra inferior fija con Calendario (por defecto) · Hijos socios · Cuotas · Ajustes
export default function ShellFamilia({ activas, mem, email, onCambio }) {
  const conCalendario = activas.some(a => a.app_clave === 'actividades')
  const pestanas = [
    conCalendario && { id: 'act', nombre: 'Calendario', icono: 'actividades' },
    { id: 'hijos', nombre: 'Hijos socios', icono: 'hijos' },
    { id: 'cuotas', nombre: 'Cuotas', icono: 'cuotas' },
    { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' }
  ].filter(Boolean)
  const [tab, setTab] = useState(pestanas[0].id)
  const [foco, setFoco] = useState(null)   // plan al que lleva un aviso: { fecha, n }

  return (
    <>
      <AvisoPlanes activo={conCalendario} onAbrir={p => { setFoco({ fecha: p.fecha, n: Date.now() }); setTab('act') }} />
      {tab === 'act' && conCalendario && <Actividades asoc={mem.asociacion_id} rol="familia" email={email} foco={foco} />}
      {tab === 'hijos' && <FamiliaHijos onCambio={onCambio} />}
      {tab === 'cuotas' && <FamiliaCuotas />}
      {tab === 'ajustes' && <FamiliaAjustes />}

      <nav className="barra-inferior" aria-label="Secciones">
        {pestanas.map(p => (
          <button key={p.id} className={tab === p.id ? 'on' : ''} aria-current={tab === p.id ? 'page' : undefined} onClick={() => { setTab(p.id); setFoco(null) }}>
            <span className="ico"><IconoApp clave={p.icono} size={24} /></span>
            <span>{p.nombre}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
