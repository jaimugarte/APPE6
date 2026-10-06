import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fecha } from './util'

const TIPO = { familia: 'Alta de familia', socio: 'Alta de hijo/a' }
const ESTADO = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

const Dato = ({ k, v }) => (v ? <div className="dato"><span>{k}</span><b>{v}</b></div> : null)

function Detalle({ s }) {
  const d = s.datos || {}
  if (s.tipo === 'familia')
    return (
      <>
        <Dato k="Padre o tutor" v={[d.nombre_padre, d.correo_padre].filter(Boolean).join(' · ')} />
        <Dato k="Madre o tutora" v={[d.nombre_madre, d.correo_madre].filter(Boolean).join(' · ')} />
        <Dato k="Móvil" v={[d.movil_padre, d.movil_madre].filter(Boolean).join(' · ')} />
        <Dato k="Dirección" v={[d.direccion, [d.codigo_postal, d.localidad].filter(Boolean).join(' '), d.provincia].filter(Boolean).join(', ')} />
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
  return null
}

// Pantalla de solicitudes. Quien puede aprobar (encargado o preceptor autorizado) las resuelve;
// Las familias no usan esta pantalla: ven el estado de sus hijos en su inicio.
export default function Solicitudes({ onCambio }) {
  const [lista, setLista] = useState(null)
  const [msg, setMsg] = useState('')
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [verResueltas, setVerResueltas] = useState(false)

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
      <div className="barra"><h2>Solicitudes</h2></div>
      {msg && <p className="error">{msg}</p>}

      {pendientes.length === 0 && <p className="aviso">No hay solicitudes pendientes.</p>}
      {pendientes.map(s => (
        <article key={s.id} className="solicitud">
          <header><span className={'badge tipo-' + s.tipo}>{TIPO[s.tipo]}</span><small>{fecha(s.creada_en?.slice(0, 10))}</small></header>
          <div className="datos"><Detalle s={s} /></div>
          {(rechazando === s.id ? (
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
