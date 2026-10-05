import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, fecha } from './util'

const TIPO = { familia: 'Alta de familia', socio: 'Alta de hijo/a', baja: 'Baja' }
const ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

const Dato = ({ k, v }) => (v ? <div className="dato"><span>{k}</span><b>{v}</b></div> : null)

function Detalle({ s }) {
  const d = s.datos || {}
  if (s.tipo === 'familia')
    return (
      <>
        <Dato k="Padre" v={d.nombre_padre} /><Dato k="Madre" v={d.nombre_madre} />
        <Dato k="Cuenta Google" v={[s.email, d.email2].filter(Boolean).join(', ')} />
        <Dato k="Móvil" v={[d.movil_padre, d.movil_madre].filter(Boolean).join(' · ')} />
        <Dato k="Dirección" v={d.direccion} />
        <Dato k="Niveles de sus hijos" v={s.niveles?.join(', ')} />
      </>
    )
  if (s.tipo === 'socio')
    return (
      <>
        <Dato k="Nombre" v={`${d.nombre} ${d.apellidos}`} /><Dato k="Nivel" v={d.nivel} />
        <Dato k="Nacimiento" v={d.fecha_nacimiento && fecha(d.fecha_nacimiento)} /><Dato k="Alergias" v={d.alergias} />
        <Dato k="Correo del socio" v={d.correo_socio} /><Dato k="Solicita" v={s.email} />
      </>
    )
  return (
    <>
      <Dato k="Socio" v={d.socio_nombre} /><Dato k="Nivel" v={s.niveles?.[0]} />
      <Dato k="Motivo" v={d.motivo} /><Dato k="Solicita" v={s.email} />
    </>
  )
}

// Pantalla de solicitudes. Quien puede aprobar (encargado o preceptor autorizado) las resuelve;
// la familia ve las suyas y puede pedir el alta o la baja de sus hijos.
export default function Solicitudes({ rol, onCambio }) {
  const [lista, setLista] = useState(null)
  const [msg, setMsg] = useState('')
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [verResueltas, setVerResueltas] = useState(false)
  const esFamilia = rol === 'familia'

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('solicitudes_alta').select('*').order('creada_en', { ascending: false })
    if (error) setMsg(error.message)
    setLista(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const resolver = async (s, aprobar) => {
    const { error } = await supabase.rpc('resolver_solicitud', { p_id: s.id, p_aprobar: aprobar, p_motivo: aprobar ? null : motivo })
    setMsg(error?.message || '')
    setRechazando(null); setMotivo('')
    await cargar(); onCambio?.()
  }

  if (lista === null) return <main><p>Cargando…</p></main>
  const pendientes = lista.filter(s => s.estado === 'pendiente')
  const resueltas = lista.filter(s => s.estado !== 'pendiente')

  return (
    <main className="solicitudes">
      <div className="barra"><h2>{esFamilia ? 'Mis solicitudes' : 'Solicitudes'}</h2></div>
      {msg && <p className="error">{msg}</p>}

      {esFamilia && <SolicitudesFamilia recargar={() => { cargar(); onCambio?.() }} setMsg={setMsg} />}

      {!esFamilia && pendientes.length === 0 && <p className="aviso">No hay solicitudes pendientes.</p>}
      {pendientes.map(s => (
        <article key={s.id} className="solicitud">
          <header><span className={'badge tipo-' + s.tipo}>{TIPO[s.tipo]}</span><small>{fecha(s.creada_en?.slice(0, 10))}</small></header>
          <div className="datos"><Detalle s={s} /></div>
          {!esFamilia && (rechazando === s.id ? (
            <div className="fila">
              <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button className="peligro" onClick={() => resolver(s, false)}>Rechazar</button>
              <button onClick={() => { setRechazando(null); setMotivo('') }}>Cancelar</button>
            </div>
          ) : (
            <div className="fila">
              <button className="primario" onClick={() => resolver(s, true)}>Aprobar</button>
              <button onClick={() => setRechazando(s.id)}>Rechazar</button>
            </div>
          ))}
          {esFamilia && <p className="aviso">Pendiente de aprobación.</p>}
        </article>
      ))}

      {resueltas.length > 0 && (
        <>
          <button className="mini" onClick={() => setVerResueltas(v => !v)}>
            {verResueltas ? 'Ocultar' : 'Ver'} resueltas ({resueltas.length})
          </button>
          {verResueltas && resueltas.slice(0, 30).map(s => (
            <article key={s.id} className="solicitud resuelta">
              <header>
                <span className={'badge tipo-' + s.tipo}>{TIPO[s.tipo]}</span>
                <span className={'badge ' + (s.estado === 'aprobada' ? 'ok' : 'baja')}>{ESTADO[s.estado]}</span>
              </header>
              <div className="datos"><Detalle s={s} /></div>
              {s.motivo_resolucion && <p className="aviso">Motivo: {s.motivo_resolucion}</p>}
            </article>
          ))}
        </>
      )}
    </main>
  )
}

// Alta y baja de hijos, solo para la familia
function SolicitudesFamilia({ recargar, setMsg }) {
  const [hijos, setHijos] = useState([])
  const [nuevo, setNuevo] = useState(false)
  const [f, setF] = useState({ nombre: '', apellidos: '', fecha_nacimiento: '', nivel: '', alergias: '', correo_socio: '' })
  const [bajaDe, setBajaDe] = useState(null)
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('socios').select('id, nombre, apellidos, nivel, periodos_alta(fecha_alta, fecha_baja)').order('nombre')
    setHijos(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const set = k => e => setF({ ...f, [k]: e.target.value })

  const pedirAlta = async e => {
    e.preventDefault()
    if (!f.nombre.trim() || !f.apellidos.trim() || !f.nivel) return setMsg('Indica nombre, apellidos y nivel.')
    const { error } = await supabase.rpc('solicitar_socio', { p_datos: f })
    setMsg(error?.message || '')
    if (!error) { setNuevo(false); setF({ nombre: '', apellidos: '', fecha_nacimiento: '', nivel: '', alergias: '', correo_socio: '' }); recargar() }
  }
  const pedirBaja = async id => {
    const { error } = await supabase.rpc('solicitar_baja', { p_socio: id, p_motivo: motivo })
    setMsg(error?.message || '')
    if (!error) { setBajaDe(null); setMotivo(''); recargar() }
  }

  const activos = hijos.filter(h => (h.periodos_alta || []).some(p => !p.fecha_baja))

  return (
    <section>
      <h2>Mis hijos</h2>
      {activos.length === 0 && <p className="aviso">Todavía no hay ningún hijo dado de alta.</p>}
      {activos.map(h => (
        <div key={h.id} className="actividad">
          <span><b>{h.nombre} {h.apellidos}</b> <small>{h.nivel}</small></span>
          {bajaDe === h.id ? (
            <span className="fila">
              <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button className="peligro" onClick={() => pedirBaja(h.id)}>Pedir baja</button>
              <button onClick={() => setBajaDe(null)}>Cancelar</button>
            </span>
          ) : <button className="mini" onClick={() => { setBajaDe(h.id); setMotivo('') }}>Solicitar baja</button>}
        </div>
      ))}
      {!nuevo
        ? <div className="fila"><button className="primario" onClick={() => setNuevo(true)}>Solicitar alta de un hijo/a</button></div>
        : (
          <form className="nuevo-hijo" onSubmit={pedirAlta}>
            <div className="dos-col">
              <label className="campo">Nombre *<input value={f.nombre} onChange={set('nombre')} /></label>
              <label className="campo">Apellidos *<input value={f.apellidos} onChange={set('apellidos')} /></label>
              <label className="campo">Fecha de nacimiento<input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></label>
              <label className="campo">Nivel *
                <select value={f.nivel} onChange={set('nivel')}>
                  <option value="">Elige…</option>
                  {NIVELES.map(n => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="campo">Alergias<input value={f.alergias} onChange={set('alergias')} /></label>
              <label className="campo">Correo del socio (opcional)<input type="email" value={f.correo_socio} onChange={set('correo_socio')} /></label>
            </div>
            <div className="fila">
              <button className="primario">Enviar solicitud</button>
              <button type="button" onClick={() => setNuevo(false)}>Cancelar</button>
            </div>
          </form>
        )}
    </section>
  )
}
