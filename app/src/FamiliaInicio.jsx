import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fecha, edad, nivelPorNacimiento } from './util'
import { eur } from './cuotas'
import ConfirmarBaja from './ConfirmarBaja'

const abierto = s => s.periodos_alta?.find(p => !p.fecha_baja)
const VACIO_HIJO = { nombre: '', apellidos: '', fecha_nacimiento: '', alergias: '', correo_socio: '' }

// Inicio de la familia: resumen de cuota, lista de hijos con su estado y acceso a los datos de la familia.
// Las familias no ven Socios ni Solicitudes: aquí lo tienen todo.
export default function FamiliaInicio({ onCambio, arriba, abajo }) {
  const [hijos, setHijos] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [familia, setFamilia] = useState(null)
  const [cuota, setCuota] = useState(null)
  const [vista, setVista] = useState('inicio') // 'inicio' | 'familia' | 'nuevo' | 'pagos' | id de hijo
  const [desglose, setDesglose] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    const [s, sol, fam, q] = await Promise.all([
      supabase.from('socios')
        .select('id, nombre, apellidos, nivel, fecha_nacimiento, alergias, correo_socio, periodos_alta(fecha_alta, fecha_baja, motivo_baja)')
        .order('nombre'),
      supabase.from('solicitudes_alta').select('*').eq('tipo', 'socio').order('creada_en', { ascending: false }),
      supabase.from('familias').select('*').maybeSingle(),
      supabase.rpc('cuota_familia')
    ])
    setMsg(s.error?.message || sol.error?.message || '')
    setHijos(s.data || [])
    setPendientes(sol.data || [])
    setFamilia(fam.data || null)
    setCuota(q.data || null)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const cambio = async () => { await cargar(); onCambio?.() }

  if (hijos === null) return <main><p>Cargando…</p></main>

  if (vista === 'familia')
    return <DatosFamilia familia={familia} onVolver={() => setVista('inicio')} onCambio={cambio} />
  if (vista === 'pagos')
    return <HistorialPagos familiaId={cuota?.familia_id} onVolver={() => setVista('inicio')} />
  if (vista === 'nuevo')
    return <NuevoHijo onVolver={() => setVista('inicio')} onCambio={cambio} />
  if (vista !== 'inicio') {
    const h = hijos.find(x => x.id === vista)
    if (h) return <FichaHijo hijo={h} cuota={cuota} onVolver={() => setVista('inicio')} onCambio={cambio} />
  }

  const activos = hijos.filter(abierto)
  const importe = id => cuota?.detalle?.find(d => d.socio_id === id)?.importe
  // Altas pendientes y rechazadas recientes (las aprobadas ya aparecen como hijo)
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const solicitudes = pendientes.filter(s => s.estado === 'pendiente' || (s.estado === 'rechazada' && (s.resuelta_en || s.creada_en).slice(0, 10) >= hace30))
  const filas = [
    ...hijos.map(h => ({ clave: h.id, hijo: h, orden: abierto(h) ? 0 : 2 })),
    ...solicitudes.map(s => ({ clave: s.id, sol: s, orden: s.estado === 'pendiente' ? 1 : 3 }))
  ].sort((a, b) => a.orden - b.orden)

  return (
    <main className="familia-inicio">
      {arriba}
      <section className="resumen-cuota">
        <div className="kpis dos">
          <div className="kpi"><span>Hijos socios</span><b>{activos.length}</b></div>
          <div className="kpi cuota">
            <button className="kpi-btn" aria-expanded={desglose} onClick={() => setDesglose(d => !d)} disabled={!cuota}>
              <span>Cuota mensual total</span>
              <b>{cuota ? eur(cuota.total) : '—'}<small>/mes</small></b>
            </button>
            {cuota && <button className="enlace-mini" onClick={() => setVista('pagos')}>Ver historial de pagos</button>}
          </div>
        </div>
        {desglose && cuota && (
          <div className="desglose">
            {cuota.detalle.map(d => {
              const h = hijos.find(x => x.id === d.socio_id)
              return <div key={d.socio_id}><span>{h ? `${h.nombre} ${h.apellidos}` : 'Hijo/a'}</span><b>{eur(d.importe)}</b></div>
            })}
            {cuota.descuento > 0 && <div><span>Descuento</span><b>−{eur(cuota.descuento)}</b></div>}
            <div className="total"><span>Total al mes</span><b>{eur(cuota.total)}</b></div>
          </div>
        )}
      </section>

      {msg && <p className="error">{msg}</p>}

      <div className="barra">
        <h2>Mis hijos</h2>
        <button className="primario" onClick={() => setVista('nuevo')}>+ Dar de alta otro hijo/a</button>
      </div>

      {filas.length === 0 && <p className="aviso">Todavía no hay ningún hijo. Pulsa «Dar de alta otro hijo/a» para solicitar el primero.</p>}
      {filas.map(({ clave, hijo, sol }) => {
        if (hijo) {
          const a = edad(hijo.fecha_nacimiento), act = abierto(hijo)
          return (
            <button key={clave} className="item" onClick={() => setVista(hijo.id)}>
              <span>
                <b>{hijo.nombre} {hijo.apellidos}</b>
                <small className="meta">
                  {hijo.nivel && <span>{hijo.nivel}</span>}
                  {a != null && <span>{a} años</span>}
                  {act && importe(hijo.id) != null && <span>{eur(importe(hijo.id))}/mes</span>}
                </small>
              </span>
              <span className={act ? 'badge ok' : 'badge baja'}>{act ? 'Activo' : 'Baja'}</span>
            </button>
          )
        }
        const d = sol.datos || {}
        return (
          <div key={clave} className="item sin-accion">
            <span>
              <b>{d.nombre} {d.apellidos}</b>
              <small className="meta">
                {d.nivel && <span>{d.nivel}</span>}
                {sol.estado === 'rechazada' && sol.motivo_resolucion && <span>Motivo: {sol.motivo_resolucion}</span>}
              </small>
            </span>
            <span className={sol.estado === 'pendiente' ? 'badge pend' : 'badge baja'}>
              {sol.estado === 'pendiente' ? 'Alta solicitada' : 'Alta rechazada'}
            </span>
          </div>
        )
      })}

      <div className="fila"><button onClick={() => setVista('familia')}>Datos de la familia</button></div>
      {abajo}
    </main>
  )
}

function Campo({ label, children, ancho }) {
  return <label className={'campo' + (ancho ? ' ancho' : '')}><span>{label}</span>{children}</label>
}

function NuevoHijo({ onVolver, onCambio }) {
  const [f, setF] = useState(VACIO_HIJO)
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const nivel = nivelPorNacimiento(f.fecha_nacimiento)

  const enviar = async e => {
    e.preventDefault()
    if (!f.nombre.trim() || !f.apellidos.trim() || !f.fecha_nacimiento) return setMsg('Indica nombre, apellidos y fecha de nacimiento.')
    setEnviando(true)
    const { error } = await supabase.rpc('solicitar_socio', { p_datos: f })
    setEnviando(false)
    if (error) return setMsg(error.message)
    await onCambio(); onVolver()
  }

  return (
    <main>
      <div className="barra"><button onClick={onVolver}>← Volver</button><h2>Dar de alta a un hijo/a</h2></div>
      <form onSubmit={enviar}>
        <section>
          <div className="formgrid">
            <Campo label="Nombre *"><input value={f.nombre} onChange={set('nombre')} autoComplete="off" /></Campo>
            <Campo label="Apellidos *"><input value={f.apellidos} onChange={set('apellidos')} autoComplete="off" /></Campo>
            <Campo label="Fecha de nacimiento *"><input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} max={new Date().toISOString().slice(0, 10)} /></Campo>
            <Campo label="Correo del hijo/a (opcional)"><input type="email" value={f.correo_socio} onChange={set('correo_socio')} /></Campo>
            <Campo label="Alergias" ancho><textarea rows={2} value={f.alergias} onChange={set('alergias')} /></Campo>
          </div>
          {nivel && <p className="aviso">Nivel que le corresponde por su edad: <b>{nivel}</b>.</p>}
        </section>
        <p className="aviso">La asociación revisará la solicitud. Mientras tanto aparecerá en tu lista como «Alta solicitada».</p>
        {msg && <p className="error">{msg}</p>}
        <div className="fila"><button className="primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Solicitar alta'}</button></div>
      </form>
    </main>
  )
}

function FichaHijo({ hijo, cuota, onVolver, onCambio }) {
  const [f, setF] = useState(() => Object.fromEntries(Object.keys(VACIO_HIJO).map(k => [k, hijo[k] ?? ''])))
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const [baja, setBaja] = useState(false)
  const act = abierto(hijo)
  const importe = cuota?.detalle?.find(d => d.socio_id === hijo.id)?.importe
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const ultimaBaja = [...(hijo.periodos_alta || [])].filter(p => p.fecha_baja).sort((a, b) => b.fecha_baja.localeCompare(a.fecha_baja))[0]

  const guardar = async () => {
    setMsg(''); setOk('')
    if (!f.nombre.trim() || !f.apellidos.trim()) return setMsg('Nombre y apellidos son obligatorios.')
    const { error } = await supabase.rpc('actualizar_hijo', { p_socio: hijo.id, p_datos: f })
    if (error) return setMsg(error.message)
    setOk('Guardado.'); onCambio()
  }
  const darDeBaja = async motivo => {
    const { error } = await supabase.rpc('dar_de_baja_familia', { p_socio: hijo.id, p_motivo: motivo })
    if (error) { setBaja(false); return setMsg(error.message) }
    await onCambio(); onVolver()
  }

  return (
    <main>
      <div className="barra">
        <button onClick={onVolver}>← Volver</button>
        <h2>{hijo.nombre} {hijo.apellidos}</h2>
        <span className={act ? 'badge ok' : 'badge baja'}>{act ? 'Activo' : 'Baja'}</span>
      </div>
      <section>
        <h2>Datos del hijo/a</h2>
        <div className="formgrid">
          <Campo label="Nombre *"><input value={f.nombre} onChange={set('nombre')} /></Campo>
          <Campo label="Apellidos *"><input value={f.apellidos} onChange={set('apellidos')} /></Campo>
          <Campo label="Fecha de nacimiento"><input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></Campo>
          <Campo label="Correo del hijo/a"><input type="email" value={f.correo_socio} onChange={set('correo_socio')} /></Campo>
          <Campo label="Alergias" ancho><textarea rows={2} value={f.alergias} onChange={set('alergias')} /></Campo>
        </div>
        {hijo.nivel && <p className="aviso">Nivel: <b>{hijo.nivel}</b> (lo gestiona la asociación).{act && importe != null && <> Cuota: <b>{eur(importe)}/mes</b>.</>}</p>}
        <div className="fila">
          <button className="primario" onClick={guardar}>Guardar</button>
          {msg && <span className="error">{msg}</span>}
          {ok && <span className="okmsg">{ok}</span>}
        </div>
      </section>

      <section>
        <h2>Alta y baja</h2>
        {act
          ? <p className="aviso">De alta desde el {fecha(act.fecha_alta)}.</p>
          : <p className="aviso">De baja{ultimaBaja && <> desde el {fecha(ultimaBaja.fecha_baja)}{ultimaBaja.motivo_baja && <> · {ultimaBaja.motivo_baja}</>}</>}. Si quieres que vuelva, habla con la asociación.</p>}
        {act && !baja && <div className="fila"><button className="peligro" onClick={() => setBaja(true)}>Dar de baja</button></div>}
        {act && baja && <ConfirmarBaja nombre={hijo.nombre} onConfirmar={darDeBaja} onCancelar={() => setBaja(false)} />}
      </section>
    </main>
  )
}

function DatosFamilia({ familia, onVolver, onCambio }) {
  const [f, setF] = useState(() => ({
    nombre_padre: familia?.nombre_padre ?? '', movil_padre: familia?.movil_padre ?? '',
    nombre_madre: familia?.nombre_madre ?? '', movil_madre: familia?.movil_madre ?? '', direccion: familia?.direccion ?? ''
  }))
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })

  const guardar = async () => {
    setMsg(''); setOk('')
    const { error } = await supabase.rpc('actualizar_familia', { p_datos: f })
    if (error) return setMsg(error.message)
    setOk('Guardado.'); onCambio()
  }

  if (!familia)
    return (
      <main>
        <div className="barra"><button onClick={onVolver}>← Volver</button><h2>Datos de la familia</h2></div>
        <p className="aviso">Todavía no hay datos de familia registrados. Habla con la asociación.</p>
      </main>
    )

  return (
    <main>
      <div className="barra"><button onClick={onVolver}>← Volver</button><h2>Datos de la familia</h2></div>
      <section>
        <h2>Padre o tutor</h2>
        <div className="formgrid">
          <Campo label="Nombre y apellidos"><input value={f.nombre_padre} onChange={set('nombre_padre')} /></Campo>
          <Campo label="Móvil"><input type="tel" value={f.movil_padre} onChange={set('movil_padre')} /></Campo>
          {familia.correo_padre && <Campo label="Correo de Google"><input value={familia.correo_padre} disabled /></Campo>}
        </div>
      </section>
      <section>
        <h2>Madre o tutora</h2>
        <div className="formgrid">
          <Campo label="Nombre y apellidos"><input value={f.nombre_madre} onChange={set('nombre_madre')} /></Campo>
          <Campo label="Móvil"><input type="tel" value={f.movil_madre} onChange={set('movil_madre')} /></Campo>
          {familia.correo_madre && <Campo label="Correo de Google"><input value={familia.correo_madre} disabled /></Campo>}
        </div>
      </section>
      <section>
        <h2>Domicilio</h2>
        <Campo label="Dirección"><input value={f.direccion} onChange={set('direccion')} autoComplete="street-address" /></Campo>
      </section>
      <p className="aviso">Los correos son las cuentas de Google con las que entráis. Para cambiarlos, habla con la asociación.</p>
      <div className="fila">
        <button className="primario" onClick={guardar}>Guardar</button>
        {msg && <span className="error">{msg}</span>}
        {ok && <span className="okmsg">{ok}</span>}
      </div>
    </main>
  )
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Pagos de cuota, un mes por fila, del más reciente al más antiguo
function HistorialPagos({ familiaId, onVolver }) {
  const [pagos, setPagos] = useState(null)
  useEffect(() => {
    if (!familiaId) return setPagos([])
    supabase.from('pagos_cuota').select('mes, importe, pagado_en').eq('familia_id', familiaId).order('mes', { ascending: false })
      .then(({ data }) => setPagos(data || []))
  }, [familiaId])

  return (
    <main>
      <div className="barra"><button onClick={onVolver}>← Volver</button><h2>Historial de pagos</h2></div>
      {pagos === null && <p>Cargando…</p>}
      {pagos?.length === 0 && <p className="aviso">Todavía no hay pagos registrados.</p>}
      {pagos?.length > 0 && (
        <div className="tablaw">
          <table>
            <thead><tr><th>Mes</th><th className="num">Importe</th><th>Estado</th></tr></thead>
            <tbody>
              {[...pagos].sort((a, b) => b.mes.localeCompare(a.mes)).map(p => (
                <tr key={p.mes}>
                  <td>{MESES[Number(p.mes.slice(5, 7)) - 1]} {p.mes.slice(0, 4)}</td>
                  <td className="num">{eur(p.importe)}</td>
                  <td>{p.pagado_en ? <span className="badge ok">Pagado {fecha(p.pagado_en)}</span> : <span className="badge pend">Pendiente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
