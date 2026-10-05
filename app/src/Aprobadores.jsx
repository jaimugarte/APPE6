import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const OPCIONES = [
  ['ninguno', 'No puede aprobar'],
  ['su_nivel', 'Sí, solo las de su nivel'],
  ['todos', 'Sí, todas']
]

// Ajustes (encargado): qué preceptores pueden aprobar solicitudes de alta y baja. El encargado siempre puede.
export default function Aprobadores({ asoc }) {
  const [preceptores, setPreceptores] = useState([])
  const [permisos, setPermisos] = useState([])
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    setPreceptores((await supabase.from('accesos_permitidos').select('email').eq('asociacion_id', asoc).eq('rol', 'preceptor').order('email')).data || [])
    setPermisos((await supabase.from('permisos_aprobacion').select('*').eq('asociacion_id', asoc)).data || [])
  }
  useEffect(() => { cargar() }, [asoc])

  const cambiar = async (email, alcance) => {
    const { error } = await supabase.from('permisos_aprobacion').upsert({ asociacion_id: asoc, email, alcance })
    setMsg(error?.message || ''); cargar()
  }

  return (
    <section>
      <h2>Quién aprueba las solicitudes</h2>
      <p className="sub">Altas de familias y de hijos, y bajas. «Su nivel» usa los niveles asignados a cada preceptor más abajo; una solicitud de familia llega al preceptor de cualquiera de los niveles que la familia haya indicado.</p>
      {msg && <p className="error">{msg}</p>}
      {preceptores.length === 0 && <p className="aviso">Todavía no has autorizado a ningún preceptor.</p>}
      {preceptores.map(p => (
        <div key={p.email} className="actividad">
          <span>{p.email}</span>
          <select aria-label={`Aprobación de solicitudes: ${p.email}`}
            value={permisos.find(x => x.email === p.email)?.alcance || 'ninguno'} onChange={e => cambiar(p.email, e.target.value)}>
            {OPCIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      ))}
    </section>
  )
}
