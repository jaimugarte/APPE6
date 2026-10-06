import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, fecha } from './util'
import { eur } from './cuotas'
import { etiquetaTipo } from './tiposActividad'
import { leerImporte, repartir, resumenPorSocio } from './campos'

async function paginar(construir) {
  const out = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await construir().range(d, d + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const nombreCompleto = s => `${s.apellidos}, ${s.nombre}`

// Trabajos (antes «campos de trabajo»): eventos con los que los socios ganan dinero; dinero que ganan los socios y que luego «retiran» para pagar convivencias o cursos de retiro.
// Acceso: encargado y todos los preceptores.
export default function CamposTrabajo({ asoc, rol, uid }) {
  const esEncargado = rol === 'encargado'
  const [datos, setDatos] = useState(null)
  const [vista, setVista] = useState('campos') // 'campos' | 'resumen' | {campo: id|'nuevo'} | {socio: id}
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [campos, participantes, retiradas, socios, pre] = await Promise.all([
        supabase.from('campos_trabajo').select('*').eq('asociacion_id', asoc).order('fecha', { ascending: false }),
        paginar(() => supabase.from('campo_participantes').select('campo_id, socio_id, importe').order('campo_id').order('socio_id')),
        paginar(() => supabase.from('retiradas_campo').select('*').eq('asociacion_id', asoc).order('creado_en').order('id')),
        supabase.rpc('socios_campos'),
        supabase.rpc('lista_preceptores')
      ])
      if (campos.error) throw campos.error
      if (socios.error) throw socios.error
      setDatos({ campos: campos.data || [], participantes, retiradas, socios: socios.data || [], preceptores: pre.data || [] })
      setError('')
    } catch (e) { setError(e.message || String(e)) }
  }, [asoc])
  useEffect(() => { cargar() }, [cargar])

  const resumen = useMemo(() => datos && resumenPorSocio(datos.socios, datos.participantes, datos.retiradas), [datos])
  const nombrePre = useMemo(() => {
    const m = new Map((datos?.preceptores || []).map(p => [p.email, p.nombre || p.email]))
    return e => (e ? m.get(e) || e : '')
  }, [datos])

  if (error) return <main><p className="error">{error}</p></main>
  if (!datos) return <main><p>Cargando…</p></main>

  if (vista.campo) return <FormCampo id={vista.campo} datos={datos} asoc={asoc} uid={uid} esEncargado={esEncargado}
    onVolver={() => setVista('campos')} onCambio={cargar} />
  if (vista.socio) return <DetalleSocio fila={resumen.find(r => r.id === vista.socio)} datos={datos} esEncargado={esEncargado}
    onVolver={() => setVista('resumen')} onCambio={cargar} />

  return (
    <main className="campos">
      <div className="barra">
        <h2>Trabajos</h2>
        <button className="primario" onClick={() => setVista({ campo: 'nuevo' })}>+ Nuevo trabajo</button>
      </div>
      <div className="seg" role="group" aria-label="Vista">
        <button className={vista === 'campos' ? 'on' : ''} aria-pressed={vista === 'campos'} onClick={() => setVista('campos')}>Trabajos</button>
        <button className={vista === 'resumen' ? 'on' : ''} aria-pressed={vista === 'resumen'} onClick={() => setVista('resumen')}>Resumen por socio</button>
      </div>

      {vista === 'campos' && <ListaCampos datos={datos} nombrePre={nombrePre} onAbrir={id => setVista({ campo: id })} />}
      {vista === 'resumen' && <TablaResumen filas={resumen} onAbrir={id => setVista({ socio: id })} />}
    </main>
  )
}

function ListaCampos({ datos, nombrePre, onAbrir }) {
  if (datos.campos.length === 0) return <p className="aviso">Todavía no hay trabajos. Crea el primero con «+ Nuevo trabajo».</p>
  return datos.campos.map(c => {
    const ps = datos.participantes.filter(p => p.campo_id === c.id)
    const total = ps.reduce((a, p) => a + Number(p.importe), 0)
    return (
      <button key={c.id} className="item" onClick={() => onAbrir(c.id)}>
        <span>
          <b>{c.nombre}</b>
          <small className="meta">
            <span>{fecha(c.fecha)}</span>
            {c.responsable_email && <span>Responsable: {nombrePre(c.responsable_email)}</span>}
            <span>{ps.length} {ps.length === 1 ? 'socio' : 'socios'}</span>
          </small>
        </span>
        <b className="importe-lista">{eur(total)}</b>
      </button>
    )
  })
}

// Resumen por socio: nombre, curso y disponible
function TablaResumen({ filas, onAbrir }) {
  const [q, setQ] = useState('')
  const [nivel, setNivel] = useState('')
  const [todos, setTodos] = useState(false)
  const niveles = useMemo(() => [...new Set(filas.map(f => f.nivel).filter(Boolean))]
    .sort((a, b) => (NIVELES.indexOf(a) + 1 || 99) - (NIVELES.indexOf(b) + 1 || 99) || a.localeCompare(b, 'es')), [filas])
  const t = q.trim().toLowerCase()
  const lista = filas.filter(f => {
    if (!todos && !f.campos && !f.retirado) return false           // por defecto, solo quien tiene algo
    if (!todos && !f.activo && f.disponible === 0) return false
    if (nivel && f.nivel !== nivel) return false
    return !t || `${f.nombre} ${f.apellidos}`.toLowerCase().includes(t)
  })
  const total = lista.reduce((a, f) => a + f.disponible, 0)
  return (
    <section>
      <div className="filtros">
        <input type="search" placeholder="Buscar por nombre" value={q} onChange={e => setQ(e.target.value)} />
        <select value={nivel} onChange={e => setNivel(e.target.value)}>
          <option value="">Todos los cursos</option>
          {niveles.map(n => <option key={n}>{n}</option>)}
        </select>
        <label className="check-fila"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /><span>Mostrar todos los socios</span></label>
      </div>
      {lista.length === 0 && <p className="aviso">No hay socios que mostrar.</p>}
      {lista.map(f => (
        <button key={f.id} className="item" onClick={() => onAbrir(f.id)}>
          <span>
            <b>{nombreCompleto(f)}</b>
            <small className="meta">{f.nivel && <span>{f.nivel}</span>}{!f.activo && <span>De baja</span>}</small>
          </span>
          <span className="disp"><small>Disponible</small><b>{eur(f.disponible)}</b></span>
        </button>
      ))}
      {lista.length > 0 && <p className="total-lista">Total disponible: <b>{eur(total)}</b> · {lista.length} {lista.length === 1 ? 'socio' : 'socios'}</p>}
    </section>
  )
}

// Detalle de un socio: campos en los que ha ganado dinero, retiradas y botón para retirar
function DetalleSocio({ fila, datos, esEncargado, onVolver, onCambio }) {
  const [retirando, setRetirando] = useState(false)
  const [anular, setAnular] = useState(null)
  const [msg, setMsg] = useState('')
  if (!fila) return <main><button onClick={onVolver}>← Volver</button><p className="aviso">Socio no encontrado.</p></main>

  const campos = datos.participantes.filter(p => p.socio_id === fila.id)
    .map(p => ({ ...p, campo: datos.campos.find(c => c.id === p.campo_id) })).filter(p => p.campo)
    .sort((a, b) => b.campo.fecha.localeCompare(a.campo.fecha))
  const retiradas = datos.retiradas.filter(r => r.socio_id === fila.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en))

  const anularRetirada = async id => {
    const { error } = await supabase.from('retiradas_campo').delete().eq('id', id)
    setAnular(null); setMsg(error?.message || ''); await onCambio()
  }

  return (
    <main className="campos">
      <div className="barra">
        <button onClick={onVolver}>← Volver</button>
        <h2>{fila.nombre} {fila.apellidos}</h2>
      </div>
      <p className="aviso">{fila.nivel}{!fila.activo && ' · De baja'}</p>
      <div className="kpis tres">
        <div className="kpi"><span>Ganado</span><b>{eur(fila.ganado)}</b></div>
        <div className="kpi"><span>Retirado</span><b>{eur(fila.retirado)}</b></div>
        <div className="kpi"><span>Disponible</span><b>{eur(fila.disponible)}</b></div>
      </div>
      {msg && <p className="error">{msg}</p>}

      {!retirando && (
        <div className="fila"><button className="primario" disabled={fila.disponible <= 0} onClick={() => setRetirando(true)}>Retirar dinero</button>
          {fila.disponible <= 0 && <small className="aviso">No tiene dinero disponible.</small>}</div>
      )}
      {retirando && <FormRetirada fila={fila} onCancelar={() => setRetirando(false)} onHecho={async () => { setRetirando(false); await onCambio() }} />}

      <section>
        <h2>Trabajos</h2>
        {campos.length === 0 && <p className="aviso">Todavía no ha participado en ningún trabajo.</p>}
        {campos.map(p => (
          <div key={p.campo_id} className="fila-dato"><span>{p.campo.nombre} <small>{fecha(p.campo.fecha)}</small></span><b>{eur(p.importe)}</b></div>
        ))}
      </section>

      <section>
        <h2>Retiradas</h2>
        {retiradas.length === 0 && <p className="aviso">Todavía no ha retirado dinero.</p>}
        {retiradas.map(r => (
          <div key={r.id} className="fila-dato">
            <span>{r.actividad_titulo} <small>{fecha(r.fecha)}{r.nota ? ` · ${r.nota}` : ''}</small></span>
            <span className="fila"><b>−{eur(r.importe)}</b>
              {esEncargado && anular !== r.id && <button className="mini" onClick={() => setAnular(r.id)}>Anular</button>}
              {esEncargado && anular === r.id && <button className="mini peligro" onClick={() => anularRetirada(r.id)}>Sí, anular</button>}
            </span>
          </div>
        ))}
      </section>
    </main>
  )
}

// Retirar dinero: hay que elegir una convivencia o curso de retiro disponible para ese socio
function FormRetirada({ fila, onCancelar, onHecho }) {
  const [acts, setActs] = useState(null)
  const [actId, setActId] = useState('')
  const [importe, setImporte] = useState('')
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    supabase.rpc('actividades_para_retirar', { p_socio: fila.id }).then(({ data, error }) => {
      setMsg(error?.message || ''); setActs(data || [])
    })
  }, [fila.id])

  // Al elegir la actividad se propone su precio (o lo disponible, si es menos)
  const elegir = id => {
    setActId(id)
    const a = acts.find(x => x.id === id)
    if (a) setImporte(String(Math.min(Number(a.precio) || fila.disponible, fila.disponible)).replace('.', ','))
  }

  const confirmar = async () => {
    const v = leerImporte(importe)
    if (!actId) return setMsg('Elige la convivencia o el curso de retiro.')
    if (v == null || v <= 0) return setMsg('Escribe un importe válido mayor que 0.')
    if (v > fila.disponible + 1e-9) return setMsg(`Solo tiene ${eur(fila.disponible)} disponibles.`)
    setEnviando(true)
    const { error } = await supabase.rpc('retirar_campo', { p_socio: fila.id, p_actividad: actId, p_importe: v, p_nota: nota })
    setEnviando(false)
    if (error) return setMsg(error.message)
    onHecho()
  }

  return (
    <section className="form-retirada">
      <h2>Retirar dinero</h2>
      {acts === null && <p>Cargando…</p>}
      {acts?.length === 0 && <p className="aviso">No hay convivencias ni cursos de retiro disponibles para este socio (de su nivel o para todos, recientes o futuros).</p>}
      {acts?.length > 0 && (
        <div className="formgrid">
          <label className="campo ancho"><span>Convivencia o curso de retiro</span>
            <select value={actId} onChange={e => elegir(e.target.value)}>
              <option value="">Elige una…</option>
              {acts.map(a => <option key={a.id} value={a.id}>{a.titulo} · {etiquetaTipo(a.tipo)} · {fecha(a.fecha)}{Number(a.precio) > 0 ? ` · ${eur(a.precio)}` : ''}</option>)}
            </select>
          </label>
          <label className="campo"><span>Importe a retirar (€)</span><input inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} /></label>
          <label className="campo"><span>Disponible</span><input value={eur(fila.disponible)} disabled /></label>
          <label className="campo ancho"><span>Nota (opcional)</span><input value={nota} maxLength={300} onChange={e => setNota(e.target.value)} /></label>
        </div>
      )}
      {msg && <p className="error">{msg}</p>}
      <div className="fila">
        {acts?.length > 0 && <button className="primario" disabled={enviando} onClick={confirmar}>{enviando ? 'Retirando…' : 'Retirar'}</button>}
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </section>
  )
}

// Crear o editar un campo de trabajo: datos, responsable (un preceptor) y socios con lo que ha ganado cada uno
function FormCampo({ id, datos, asoc, uid, esEncargado, onVolver, onCambio }) {
  const nuevo = id === 'nuevo'
  const campo = nuevo ? null : datos.campos.find(c => c.id === id)
  const [f, setF] = useState({ nombre: campo?.nombre || '', fecha: campo?.fecha || hoy(), responsable: campo?.responsable_email || '', descripcion: campo?.descripcion || '' })
  const [filas, setFilas] = useState(() => nuevo ? [] : datos.participantes.filter(p => p.campo_id === id).map(p => ({ socio_id: p.socio_id, importe: String(p.importe).replace('.', ',') })))
  const [modo, setModo] = useState('por_socio')   // 'por_socio' | 'total'
  const [cantidad, setCantidad] = useState('')
  const [q, setQ] = useState('')
  const [nivel, setNivel] = useState('')
  const [msg, setMsg] = useState('')
  const [borrar, setBorrar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })

  const socio = sid => datos.socios.find(s => s.id === sid)
  const elegidos = new Set(filas.map(r => r.socio_id))
  const niveles = useMemo(() => [...new Set(datos.socios.map(s => s.nivel).filter(Boolean))]
    .sort((a, b) => (NIVELES.indexOf(a) + 1 || 99) - (NIVELES.indexOf(b) + 1 || 99) || a.localeCompare(b, 'es')), [datos.socios])
  const t = q.trim().toLowerCase()
  const candidatos = datos.socios.filter(s => s.activo && !elegidos.has(s.id) && (!nivel || s.nivel === nivel)
    && (!t || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(t)))

  const cant = leerImporte(cantidad)
  const importeInicial = modo === 'por_socio' && cant ? String(cant).replace('.', ',') : '0'
  const anadir = lista => setFilas(fs => [...fs, ...lista.map(s => ({ socio_id: s.id, importe: importeInicial }))])
  const quitar = sid => setFilas(fs => fs.filter(r => r.socio_id !== sid))
  const cambiar = (sid, v) => setFilas(fs => fs.map(r => (r.socio_id === sid ? { ...r, importe: v } : r)))

  const aplicar = () => {
    if (cant == null || filas.length === 0) return setMsg(filas.length ? 'Escribe una cantidad válida.' : 'Añade primero algún socio.')
    setMsg('')
    if (modo === 'por_socio') setFilas(fs => fs.map(r => ({ ...r, importe: String(cant).replace('.', ',') })))
    else { const parte = repartir(cant, filas.length); setFilas(fs => fs.map((r, i) => ({ ...r, importe: String(parte[i]).replace('.', ',') }))) }
  }
  const total = filas.reduce((a, r) => a + (leerImporte(r.importe) || 0), 0)

  const guardar = async () => {
    setMsg('')
    if (!f.nombre.trim()) return setMsg('Escribe el nombre del trabajo.')
    if (!f.fecha) return setMsg('Elige la fecha.')
    const importes = filas.map(r => leerImporte(r.importe))
    if (importes.some(v => v == null)) return setMsg('Hay un importe que no es válido (usa números como 12 o 12,50).')
    setGuardando(true)
    const fila = { nombre: f.nombre.trim(), fecha: f.fecha, responsable_email: f.responsable || null, descripcion: f.descripcion.trim() || null }
    let cid = id
    if (nuevo) {
      const { data, error } = await supabase.from('campos_trabajo').insert({ ...fila, asociacion_id: asoc }).select('id').single()
      if (error) { setGuardando(false); return setMsg(error.message) }
      cid = data.id
    } else {
      const { data, error } = await supabase.from('campos_trabajo').update(fila).eq('id', id).select('id')
      if (error || !data?.length) { setGuardando(false); return setMsg(error?.message || 'No se pudo guardar.') }
    }
    // Participantes: quitar los que ya no están y guardar los nuevos y los cambiados
    const antes = nuevo ? [] : datos.participantes.filter(p => p.campo_id === cid)
    for (const p of antes.filter(p => !elegidos.has(p.socio_id))) {
      const { error } = await supabase.from('campo_participantes').delete().eq('campo_id', cid).eq('socio_id', p.socio_id)
      if (error) { setGuardando(false); await onCambio(); return setMsg(`No se pudo quitar a ${socio(p.socio_id)?.nombre || 'un socio'}: ${error.message}`) }
    }
    for (const [i, r] of filas.entries()) {
      const previo = antes.find(p => p.socio_id === r.socio_id)
      if (previo && Number(previo.importe) === importes[i]) continue
      const { error } = await supabase.from('campo_participantes').upsert({ campo_id: cid, socio_id: r.socio_id, importe: importes[i] })
      if (error) { setGuardando(false); await onCambio(); return setMsg(`No se pudo guardar a ${socio(r.socio_id)?.nombre || 'un socio'}: ${error.message}`) }
    }
    setGuardando(false)
    await onCambio(); onVolver()
  }

  const eliminar = async () => {
    const { error } = await supabase.from('campos_trabajo').delete().eq('id', id)
    if (error) { setBorrar(false); return setMsg(error.message) }
    await onCambio(); onVolver()
  }

  if (!nuevo && !campo) return <main><button onClick={onVolver}>← Volver</button><p className="aviso">Campo no encontrado.</p></main>

  return (
    <main className="campos">
      <div className="barra">
        <button onClick={onVolver}>← Volver</button>
        <h2>{nuevo ? 'Nuevo trabajo' : 'Editar trabajo'}</h2>
      </div>

      <section>
        <div className="formgrid">
          <label className="campo ancho"><span>Nombre *</span><input value={f.nombre} maxLength={120} onChange={set('nombre')} /></label>
          <label className="campo"><span>Fecha *</span><input type="date" value={f.fecha} onChange={set('fecha')} /></label>
          <label className="campo"><span>Responsable (preceptor)</span>
            <select value={f.responsable} onChange={set('responsable')}>
              <option value="">Sin asignar</option>
              {datos.preceptores.map(p => <option key={p.email} value={p.email}>{p.nombre || p.email}</option>)}
              {f.responsable && !datos.preceptores.some(p => p.email === f.responsable) && <option value={f.responsable}>{f.responsable}</option>}
            </select>
          </label>
          <label className="campo ancho"><span>Descripción</span><textarea rows={3} maxLength={2000} value={f.descripcion} onChange={set('descripcion')} /></label>
        </div>
      </section>

      <section>
        <h2>Socios y dinero ganado</h2>
        <div className="reparto">
          <div className="seg" role="group" aria-label="Cómo asignar la cantidad">
            <button className={modo === 'por_socio' ? 'on' : ''} aria-pressed={modo === 'por_socio'} onClick={() => setModo('por_socio')}>Por socio</button>
            <button className={modo === 'total' ? 'on' : ''} aria-pressed={modo === 'total'} onClick={() => setModo('total')}>Total a repartir</button>
          </div>
          <div className="fila">
            <input inputMode="decimal" placeholder={modo === 'por_socio' ? 'Cantidad para cada socio (€)' : 'Cantidad total (€)'} aria-label="Cantidad"
              value={cantidad} onChange={e => setCantidad(e.target.value)} />
            <button onClick={aplicar}>{modo === 'por_socio' ? 'Dar a todos' : 'Repartir entre todos'}</button>
          </div>
          <small className="aviso">También puedes cambiar después la cantidad de cada socio, una a una.</small>
        </div>

        {filas.length === 0 && <p className="aviso">Todavía no hay socios en este trabajo. Añádelos abajo.</p>}
        {filas.map(r => {
          const s = socio(r.socio_id)
          return (
            <div key={r.socio_id} className="item sin-accion participante">
              <span><b>{s ? nombreCompleto(s) : 'Socio'}</b><small className="meta">{s?.nivel && <span>{s.nivel}</span>}{s && !s.activo && <span>De baja</span>}</small></span>
              <span className="fila">
                <input className="importe" inputMode="decimal" aria-label={`Importe de ${s?.nombre || 'socio'}`} value={r.importe} onChange={e => cambiar(r.socio_id, e.target.value)} />
                <span aria-hidden="true">€</span>
                <button className="mini" aria-label={`Quitar a ${s?.nombre || 'socio'}`} onClick={() => quitar(r.socio_id)}>×</button>
              </span>
            </div>
          )
        })}
        {filas.length > 0 && <p className="total-lista">Total: <b>{eur(total)}</b> · {filas.length} {filas.length === 1 ? 'socio' : 'socios'}</p>}

        <h3>Añadir socios</h3>
        <div className="filtros dos">
          <input type="search" placeholder="Buscar por nombre" value={q} onChange={e => setQ(e.target.value)} />
          <select value={nivel} onChange={e => setNivel(e.target.value)}>
            <option value="">Todos los cursos</option>
            {niveles.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        {candidatos.length > 0 && <div className="fila"><button className="mini" onClick={() => anadir(candidatos)}>Añadir los {candidatos.length} que se ven</button></div>}
        <div className="lista-candidatos">
          {candidatos.slice(0, 60).map(s => (
            <button key={s.id} className="item" onClick={() => anadir([s])}>
              <span><b>{nombreCompleto(s)}</b><small className="meta">{s.nivel && <span>{s.nivel}</span>}</small></span>
              <span className="badge ok">+ Añadir</span>
            </button>
          ))}
          {candidatos.length > 60 && <p className="aviso">Hay {candidatos.length - 60} más: usa el buscador o el curso para acotar.</p>}
          {candidatos.length === 0 && <p className="aviso">No hay más socios de alta que añadir con ese filtro.</p>}
        </div>
      </section>

      {msg && <p className="error">{msg}</p>}
      <div className="fila">
        <button className="primario" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : nuevo ? 'Crear trabajo' : 'Guardar'}</button>
        {!nuevo && !borrar && <button className="peligro" onClick={() => setBorrar(true)}>Eliminar</button>}
        {!nuevo && borrar && <button className="peligro" onClick={eliminar}>Sí, eliminar el trabajo</button>}
      </div>
    </main>
  )
}
