import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { hoy, inicioPeriodo, sumarPeriodos, finPeriodo, etiquetaPeriodo } from './util'

const CONFLICTO = 'socio_id,tipo_actividad_id,periodo_inicio'

export default function Asistencia({ asoc, rol, email }) {
  const [tipos, setTipos] = useState(null)
  const [socios, setSocios] = useState(null)
  const [perm, setPerm] = useState(null)
  const [tipoId, setTipoId] = useState(null)
  const [inicio, setInicio] = useState(null)
  const [marcas, setMarcas] = useState({}) // socio_id -> true | false (sin entrada = sin marcar)
  const [nivel, setNivel] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')

  const esEncargado = rol === 'encargado'
  const esPreceptor = rol === 'preceptor'
  const puedeEditar = esEncargado || (esPreceptor && !!perm?.puede_editar)

  const tipo = tipos?.find(t => t.id === tipoId)
  const per = tipo?.periodicidad
  const fin = tipo && inicio ? finPeriodo(inicio, per) : null
  const actual = tipo ? inicioPeriodo(hoy(), per) : null

  // Carga inicial: actividades activas y socios (solo las columnas necesarias)
  useEffect(() => {
    (async () => {
      const [t, s] = await Promise.all([
        supabase.from('tipos_actividad').select('*').eq('asociacion_id', asoc).eq('activa', true)
          .order('orden').order('nombre'),
        supabase.from('socios').select('id, nombre, apellidos, nivel, periodos_alta(fecha_alta, fecha_baja)')
          .eq('asociacion_id', asoc).order('apellidos').order('nombre')
      ])
      setMsg(t.error?.message || s.error?.message || '')
      setTipos(t.data || [])
      setSocios(s.data || [])
      if (t.data?.length) seleccionar(t.data[0])
    })()
    if (esPreceptor)
      supabase.from('permisos_preceptor').select('*').eq('asociacion_id', asoc).eq('app_clave', 'asistencia')
        .maybeSingle().then(({ data }) => setPerm(data))
  }, [asoc, esPreceptor, email])

  // Al elegir una actividad se muestra siempre el periodo actual
  const seleccionar = t => { setTipoId(t.id); setInicio(inicioPeriodo(hoy(), t.periodicidad)) }

  // Marcas del periodo mostrado
  useEffect(() => {
    if (!tipoId || !inicio) return
    let vigente = true
    setMarcas({})
    supabase.from('registros_asistencia').select('socio_id, asistio')
      .eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio)
      .then(({ data, error }) => {
        if (!vigente) return
        setMsg(error?.message || '')
        setMarcas(Object.fromEntries((data || []).map(r => [r.socio_id, r.asistio])))
      })
    return () => { vigente = false }
  }, [tipoId, inicio])

  // Socios que estaban de alta en algún momento del periodo (o que ya tienen marca)
  const delPeriodo = useMemo(() => {
    if (!socios || !inicio) return []
    return socios.filter(s =>
      marcas[s.id] !== undefined ||
      (s.periodos_alta || []).some(p => p.fecha_alta <= fin && (!p.fecha_baja || p.fecha_baja >= inicio)))
  }, [socios, inicio, fin, marcas])

  const niveles = useMemo(
    () => [...new Set(delPeriodo.map(s => s.nivel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [delPeriodo])

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return delPeriodo.filter(s =>
      (!nivel || s.nivel === nivel) && (!t || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(t)))
  }, [delPeriodo, nivel, q])

  const asistieron = lista.filter(s => marcas[s.id] === true).length
  const faltaron = lista.filter(s => marcas[s.id] === false).length
  const pendientes = lista.length - asistieron - faltaron

  const poner = (ids, valor) => setMarcas(m => {
    const c = { ...m }
    for (const id of ids) { if (valor === undefined) delete c[id]; else c[id] = valor }
    return c
  })

  // Pulsar «Sí» o «No»; volver a pulsar el activo lo deja sin marcar
  const marcar = async (id, valor) => {
    const previo = marcas[id]
    const nuevo = previo === valor ? undefined : valor
    poner([id], nuevo)
    let error, borradas
    if (nuevo === undefined) {
      const r = await supabase.from('registros_asistencia').delete()
        .eq('socio_id', id).eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio).select('socio_id')
      error = r.error; borradas = r.data?.length
      if (!error && !borradas) error = { message: 'No tienes permiso para modificar este registro.' }
    } else {
      const r = await supabase.from('registros_asistencia').upsert(
        { socio_id: id, tipo_actividad_id: tipoId, periodo_inicio: inicio, asistio: nuevo },
        { onConflict: CONFLICTO })
      error = r.error
    }
    if (error) { poner([id], previo); setMsg(error.message) } else setMsg('')
  }

  // Acción en bloque sobre los socios visibles que aún no están marcados
  const marcarResto = async valor => {
    const ids = lista.filter(s => marcas[s.id] === undefined).map(s => s.id)
    if (!ids.length) return
    poner(ids, valor)
    const { error } = await supabase.from('registros_asistencia').upsert(
      ids.map(socio_id => ({ socio_id, tipo_actividad_id: tipoId, periodo_inicio: inicio, asistio: valor })),
      { onConflict: CONFLICTO })
    if (error) { poner(ids, undefined); setMsg(error.message) } else setMsg('')
  }

  const limpiar = async () => {
    const ids = lista.filter(s => marcas[s.id] !== undefined).map(s => s.id)
    if (!ids.length || !window.confirm(`¿Quitar la marca de ${ids.length} socios en este periodo?`)) return
    const previas = Object.fromEntries(ids.map(id => [id, marcas[id]]))
    poner(ids, undefined)
    const { data, error } = await supabase.from('registros_asistencia').delete()
      .eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio).in('socio_id', ids).select('socio_id')
    if (error || data?.length !== ids.length) {
      setMarcas(m => ({ ...m, ...previas }))
      setMsg(error?.message || 'No se pudieron quitar todas las marcas (revisa tus permisos).')
    } else setMsg('')
  }

  if (tipos === null || socios === null) return <main><p>Cargando…</p></main>

  if (tipos.length === 0)
    return <main><p className="aviso">No hay actividades activas{esEncargado && ': defínelas en Ajustes → Actividades de interés'}.</p></main>

  return (
    <main>
      <div className="chips tipos">
        {tipos.map(t => (
          <button key={t.id} className={'chip tipo' + (t.id === tipoId ? ' on' : '')} onClick={() => seleccionar(t)}>
            {t.nombre} <small>{t.periodicidad}</small>
          </button>
        ))}
      </div>

      {tipo && inicio && (
        <>
          <div className="navperiodo">
            <button aria-label="Periodo anterior" onClick={() => setInicio(sumarPeriodos(inicio, per, -1))}>‹</button>
            <div className="etiqueta">
              <b>{etiquetaPeriodo(inicio, per)}</b>
              {inicio === actual && <span className="badge ok">actual</span>}
            </div>
            <button aria-label="Periodo siguiente" disabled={inicio >= actual}
              onClick={() => setInicio(sumarPeriodos(inicio, per, 1))}>›</button>
          </div>
          <div className="fila">
            <button disabled={inicio === actual} onClick={() => setInicio(actual)}>Ir al actual</button>
            <label className="fila">Ir a la fecha
              <input type="date" max={hoy()} value="" onChange={e => e.target.value && setInicio(inicioPeriodo(e.target.value, per))} />
            </label>
          </div>

          {msg && <p className="error">{msg}</p>}

          <div className="filtros dos">
            <input type="search" placeholder="Buscar socio" value={q} onChange={e => setQ(e.target.value)} />
            <select value={nivel} onChange={e => setNivel(e.target.value)}>
              <option value="">Todos los niveles</option>
              {niveles.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>

          <div className="resumen">
            <span><b>{asistieron}</b> asistieron</span>
            <span><b>{faltaron}</b> no asistieron</span>
            <span><b>{pendientes}</b> sin marcar</span>
          </div>
          {puedeEditar && lista.length > 0 &&
            <p className="sub">Toca Sí o No para marcar. El tercer botón deja al socio sin marcar.</p>}

          {puedeEditar && lista.length > 0 && (
            <div className="fila">
              <button disabled={!pendientes} onClick={() => marcarResto(true)}>Resto: asistió</button>
              <button disabled={!pendientes} onClick={() => marcarResto(false)}>Resto: no asistió</button>
              <button disabled={pendientes === lista.length} onClick={limpiar}>Limpiar</button>
            </div>
          )}

          {lista.length === 0 && (
            <p className="aviso">
              No hay socios para mostrar en este periodo.
              {esPreceptor && ' Recuerda que un preceptor también necesita permiso para ver Socios.'}
            </p>
          )}
          {lista.map(s => (
            <div key={s.id} className="item asist">
              <span>
                <b>{s.apellidos}, {s.nombre}</b>
                <small>{s.nivel}</small>
              </span>
              <span className="seg" role="group" aria-label={`Asistencia de ${s.nombre}`}>
                <button className={marcas[s.id] === true ? 'on si' : ''} disabled={!puedeEditar}
                  aria-pressed={marcas[s.id] === true} onClick={() => marcar(s.id, true)}>Sí</button>
                <button className={marcas[s.id] === false ? 'on no' : ''} disabled={!puedeEditar}
                  aria-pressed={marcas[s.id] === false} onClick={() => marcar(s.id, false)}>No</button>
                {/* Tercer estado: sin marcar. Es el de partida y se puede volver a él en cualquier momento */}
                <button className={'pend' + (marcas[s.id] === undefined ? ' on' : '')} disabled={!puedeEditar}
                  aria-pressed={marcas[s.id] === undefined} aria-label="Sin marcar" title="Sin marcar"
                  onClick={() => marcas[s.id] !== undefined && marcar(s.id, marcas[s.id])}>–</button>
              </span>
            </div>
          ))}
        </>
      )}
    </main>
  )
}
