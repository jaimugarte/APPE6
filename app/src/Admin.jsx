import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function Admin({ uid }) {
  const [asocs, setAsocs] = useState([])
  const [apps, setApps] = useState([])
  const [sel, setSel] = useState('')
  const [aa, setAa] = useState([])
  const [encs, setEncs] = useState([])
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    setAsocs((await supabase.from('asociaciones').select('*').order('nombre')).data || [])
    setApps((await supabase.from('apps').select('*')).data || [])
    if (sel) {
      setAa((await supabase.from('asociacion_apps').select('*').eq('asociacion_id', sel)).data || [])
      setEncs((await supabase.from('accesos_permitidos').select('*').eq('asociacion_id', sel).eq('rol', 'encargado')).data || [])
    }
  }
  useEffect(() => { cargar() }, [sel])

  const crear = async () => {
    if (!nombre.trim()) return
    const { error } = await supabase.from('asociaciones').insert({ nombre: nombre.trim() })
    setMsg(error?.message || ''); setNombre(''); cargar()
  }
  const permitir = async (clave, v) => {
    const fila = { asociacion_id: sel, app_clave: clave, permitida: v, ...(v ? {} : { activa: false }) }
    const { error } = await supabase.from('asociacion_apps').upsert(fila)
    setMsg(error?.message || ''); cargar()
  }
  const addEncargado = async () => {
    if (!email.trim()) return
    const { error } = await supabase.from('accesos_permitidos')
      .insert({ email: email.trim().toLowerCase(), asociacion_id: sel, rol: 'encargado', anadido_por: uid })
    setMsg(error?.message || ''); setEmail(''); cargar()
  }
  const quitar = async e => { await supabase.from('accesos_permitidos').delete().eq('email', e); cargar() }

  return (
    <main>
      {msg && <p className="error">{msg}</p>}
      <section>
        <h2>Asociaciones</h2>
        <div className="fila">
          <input placeholder="Nueva asociación" value={nombre} onChange={e => setNombre(e.target.value)} />
          <button onClick={crear}>Crear</button>
        </div>
        <select value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">— elige una —</option>
          {asocs.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </section>

      {sel && (
        <>
          <section>
            <h2>Apps concedidas</h2>
            {apps.map(a => (
              <label key={a.clave} className="fila">
                <input type="checkbox"
                  checked={!!aa.find(x => x.app_clave === a.clave)?.permitida}
                  onChange={e => permitir(a.clave, e.target.checked)} />
                {a.nombre}
              </label>
            ))}
          </section>
          <section>
            <h2>Encargados</h2>
            {encs.map(e => (
              <div key={e.email} className="fila">{e.email}<button onClick={() => quitar(e.email)}>Quitar</button></div>
            ))}
            <div className="fila">
              <input type="email" placeholder="correo@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
              <button onClick={addEncargado}>Autorizar</button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
