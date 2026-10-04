import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function Ajustes({ asoc, apps, uid, recargar }) {
  const [tipos, setTipos] = useState([])
  const [accesos, setAccesos] = useState([])
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState('preceptor')
  const [nombre, setNombre] = useState('')
  const [per, setPer] = useState('semanal')
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    setTipos((await supabase.from('tipos_actividad').select('*').eq('asociacion_id', asoc).order('orden')).data || [])
    setAccesos((await supabase.from('accesos_permitidos').select('*').eq('asociacion_id', asoc).neq('rol', 'encargado')).data || [])
  }
  useEffect(() => { cargar() }, [])

  const toggleApp = async (clave, v) => {
    const { error } = await supabase.rpc('activar_app', { p_asoc: asoc, p_app: clave, p_activa: v })
    setMsg(error?.message || ''); recargar()
  }
  const toggleTipo = async (id, v) => { await supabase.from('tipos_actividad').update({ activa: v }).eq('id', id); cargar() }
  const addTipo = async () => {
    if (!nombre.trim()) return
    const { error } = await supabase.from('tipos_actividad')
      .insert({ asociacion_id: asoc, nombre: nombre.trim(), periodicidad: per, orden: 99 })
    setMsg(error?.message || ''); setNombre(''); cargar()
  }
  const addAcceso = async () => {
    if (!email.trim()) return
    const { error } = await supabase.from('accesos_permitidos')
      .insert({ email: email.trim().toLowerCase(), asociacion_id: asoc, rol, anadido_por: uid })
    setMsg(error?.message || ''); setEmail(''); cargar()
  }
  const delAcceso = async e => { await supabase.from('accesos_permitidos').delete().eq('email', e); cargar() }

  return (
    <main>
      {msg && <p className="error">{msg}</p>}
      <section>
        <h2>Apps de la asociación</h2>
        {apps.filter(a => a.permitida).map(a => (
          <label key={a.app_clave} className="fila">
            <input type="checkbox" checked={a.activa} onChange={e => toggleApp(a.app_clave, e.target.checked)} />
            {a.apps.nombre}
          </label>
        ))}
        {apps.every(a => !a.permitida) && <p>El administrador global aún no ha concedido apps.</p>}
      </section>

      <section>
        <h2>Actividades de interés</h2>
        {tipos.map(t => (
          <label key={t.id} className="fila">
            <input type="checkbox" checked={t.activa} onChange={e => toggleTipo(t.id, e.target.checked)} />
            {t.nombre} <small>({t.periodicidad})</small>
          </label>
        ))}
        <div className="fila">
          <input placeholder="Nueva actividad" value={nombre} onChange={e => setNombre(e.target.value)} />
          <select value={per} onChange={e => setPer(e.target.value)}>
            {['semanal', 'mensual', 'trimestral', 'anual'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={addTipo}>Añadir</button>
        </div>
      </section>

      <section>
        <h2>Cuentas con acceso</h2>
        {accesos.map(a => (
          <div key={a.email} className="fila">
            {a.email} <small>({a.rol})</small>
            <button onClick={() => delAcceso(a.email)}>Quitar</button>
          </div>
        ))}
        <div className="fila">
          <input type="email" placeholder="correo@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
          <select value={rol} onChange={e => setRol(e.target.value)}>
            <option value="preceptor">Preceptor</option><option value="familia">Familia</option>
          </select>
          <button onClick={addAcceso}>Autorizar</button>
        </div>
      </section>
    </main>
  )
}
