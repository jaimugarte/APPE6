import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Permisos from './Permisos'
import FotoAsociacion from './FotoAsociacion'
import Invitaciones from './Invitaciones'
import Aprobadores from './Aprobadores'
import Cuotas from './Cuotas'
import { abrev, limpiarAbrev } from './util'

export default function Ajustes({ asoc, apps, uid, fotoRuta, recargar }) {
  const [tipos, setTipos] = useState([])
  const [accesos, setAccesos] = useState([])
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState('preceptor')
  const [nombre, setNombre] = useState('')
  const [nombrePre, setNombrePre] = useState('')
  const [nombres, setNombres] = useState({}) // email -> nombre de preceptor que se está escribiendo
  const [abrNueva, setAbrNueva] = useState('')
  const [edicion, setEdicion] = useState({}) // id -> abreviatura que se está escribiendo
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
  // Comprueba que la abreviatura tenga entre 2 y 6 caracteres y no esté ya usada por otro evento
  const errorAbrev = (valor, idPropio) => {
    if (valor.length < 2) return 'La abreviatura debe tener entre 2 y 6 caracteres.'
    if (tipos.some(t => t.id !== idPropio && abrev(t) === valor)) return `La abreviatura ${valor} ya la usa otro evento.`
    return ''
  }
  const guardarAbrev = async t => {
    if (edicion[t.id] === undefined) return
    const valor = limpiarAbrev(edicion[t.id])
    const sinCambio = valor === abrev(t)
    const fallo = sinCambio ? '' : errorAbrev(valor, t.id)
    setEdicion(({ [t.id]: _, ...resto }) => resto)
    if (sinCambio) return
    if (fallo) return setMsg(fallo)
    const { error } = await supabase.from('tipos_actividad').update({ abreviatura: valor }).eq('id', t.id)
    setMsg(error?.code === '23505' ? `La abreviatura ${valor} ya la usa otro evento.` : error?.message || '')
    cargar()
  }
  const addTipo = async () => {
    if (!nombre.trim()) return
    const candidata = limpiarAbrev(abrNueva) || abrev({ nombre })
    const fallo = errorAbrev(candidata, null)
    if (fallo) return setMsg(fallo)
    const { error } = await supabase.from('tipos_actividad')
      .insert({ asociacion_id: asoc, nombre: nombre.trim(), abreviatura: candidata, periodicidad: per, orden: 99 })
    setMsg(error?.code === '23505' ? 'Ya existe un evento con ese nombre o esa abreviatura.' : error?.message || '')
    if (!error) { setNombre(''); setAbrNueva('') }
    cargar()
  }
  const addAcceso = async () => {
    if (!email.trim()) return
    const fila = { email: email.trim().toLowerCase(), asociacion_id: asoc, rol, anadido_por: uid }
    if (rol === 'preceptor' && nombrePre.trim()) fila.nombre = nombrePre.trim()
    const { error } = await supabase.from('accesos_permitidos').insert(fila)
    setMsg(error?.message || ''); setEmail(''); setNombrePre(''); cargar()
  }
  // El nombre del preceptor lo pone el encargado: es el que se ve en Campos de trabajo
  const guardarNombre = async a => {
    const v = (nombres[a.email] ?? a.nombre ?? '').trim()
    if (v === (a.nombre || '')) return
    const { error } = await supabase.from('accesos_permitidos').update({ nombre: v || null }).eq('email', a.email)
    setMsg(error?.message || ''); cargar()
  }
  const delAcceso = async e => { await supabase.from('accesos_permitidos').delete().eq('email', e); cargar() }

  return (
    <main>
      {msg && <p className="error">{msg}</p>}
      <FotoAsociacion asoc={asoc} fotoRuta={fotoRuta} recargar={recargar} />

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
        <h2>Eventos de interés</h2>
        <p className="sub">Marca las que quieres usar. La abreviatura es lo que se muestra en el móvil.</p>
        {tipos.map(t => (
          <div key={t.id} className="actividad">
            <label className="fila">
              <input type="checkbox" checked={t.activa} onChange={e => toggleTipo(t.id, e.target.checked)} />
              <span>{t.nombre} <small>{t.periodicidad}</small></span>
            </label>
            <input className="abrev" maxLength={6} aria-label={`Abreviatura de ${t.nombre}`}
              value={edicion[t.id] ?? abrev(t)}
              onChange={e => setEdicion({ ...edicion, [t.id]: limpiarAbrev(e.target.value) })}
              onBlur={() => guardarAbrev(t)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          </div>
        ))}
        <div className="fila nueva-actividad">
          <input placeholder="Nuevo evento" value={nombre} onChange={e => setNombre(e.target.value)} />
          <input className="abrev" maxLength={6} aria-label="Abreviatura del nuevo evento" placeholder={nombre ? abrev({ nombre }) : 'Abrev.'}
            value={abrNueva} onChange={e => setAbrNueva(limpiarAbrev(e.target.value))} />
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
            {a.rol === 'preceptor' && (
              <input className="nombre-pre" placeholder="Nombre del preceptor" aria-label={`Nombre de ${a.email}`} maxLength={80}
                value={nombres[a.email] ?? a.nombre ?? ''} onChange={e => setNombres({ ...nombres, [a.email]: e.target.value })}
                onBlur={() => guardarNombre(a)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
            )}
            <button onClick={() => delAcceso(a.email)}>Quitar</button>
          </div>
        ))}
        <div className="fila">
          <input type="email" placeholder="correo@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
          {rol === 'preceptor' && <input placeholder="Nombre" maxLength={80} value={nombrePre} onChange={e => setNombrePre(e.target.value)} />}
          <select value={rol} onChange={e => setRol(e.target.value)}>
            <option value="preceptor">Preceptor</option><option value="familia">Familia</option>
          </select>
          <button onClick={addAcceso}>Autorizar</button>
        </div>
      </section>

      <Cuotas asoc={asoc} />

      <Invitaciones asoc={asoc} uid={uid} />
      <Aprobadores asoc={asoc} />
      <Permisos asoc={asoc} apps={apps} />
    </main>
  )
}
