import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Ajustes (encargado): enlace de invitación para que las familias soliciten el alta
export default function Invitaciones({ asoc, uid }) {
  const [enlaces, setEnlaces] = useState([])
  const [msg, setMsg] = useState('')
  const [copiado, setCopiado] = useState(null)

  const cargar = async () => {
    const { data } = await supabase.from('enlaces_alta').select('*').eq('asociacion_id', asoc).order('creado_en', { ascending: false })
    setEnlaces(data || [])
  }
  useEffect(() => { cargar() }, [asoc])

  const url = e => `${location.origin}/?alta=${e.token}`
  const crear = async () => {
    const { error } = await supabase.from('enlaces_alta').insert({ asociacion_id: asoc, creado_por: uid })
    setMsg(error?.message || ''); cargar()
  }
  const alternar = async e => {
    const { error } = await supabase.from('enlaces_alta').update({ activo: !e.activo }).eq('id', e.id)
    setMsg(error?.message || ''); cargar()
  }
  const copiar = async e => {
    try { await navigator.clipboard.writeText(url(e)); setCopiado(e.id); setTimeout(() => setCopiado(null), 2000) }
    catch { setMsg('No se pudo copiar: selecciona el enlace y cópialo a mano.') }
  }
  const compartir = e => navigator.share?.({ title: 'Solicitud de alta', text: 'Rellena la solicitud de alta de tu familia:', url: url(e) }).catch(() => {})

  return (
    <section>
      <h2>Enlace de invitación</h2>
      <p className="sub">Envía este enlace a las familias: les lleva a un formulario para solicitar el alta. Cualquiera que lo tenga puede enviar solicitudes, pero ninguna se aprueba sin tu visto bueno. Si se difunde demasiado, desactívalo y crea otro.</p>
      {msg && <p className="error">{msg}</p>}
      {enlaces.map(e => (
        <div key={e.id} className={'enlace' + (e.activo ? '' : ' inactivo')}>
          <input readOnly value={url(e)} aria-label="Enlace de invitación" onFocus={ev => ev.target.select()} />
          <div className="fila">
            {e.activo && <button className="primario mini" onClick={() => copiar(e)}>{copiado === e.id ? 'Copiado' : 'Copiar'}</button>}
            {e.activo && navigator.share && <button className="mini" onClick={() => compartir(e)}>Compartir</button>}
            <button className="mini" onClick={() => alternar(e)}>{e.activo ? 'Desactivar' : 'Reactivar'}</button>
            {!e.activo && <small className="aviso">Desactivado</small>}
          </div>
        </div>
      ))}
      <div className="fila"><button onClick={crear}>{enlaces.length ? 'Crear otro enlace' : 'Crear enlace de invitación'}</button></div>
    </section>
  )
}
