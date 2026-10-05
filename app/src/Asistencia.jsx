import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { hoy, inicioPeriodo, sumarPeriodos, finPeriodo, etiquetaPeriodoCorta } from './util'
import ChipsActividades from './ChipsActividades'
import SelectorPeriodo from './SelectorPeriodo'
import { IconoCalendario } from './iconos'

const CONFLICTO = 'socio_id,tipo_actividad_id,periodo_inicio'

// La familia nunca accede a Asistencia, ni siquiera a los datos de sus hijos
export default function Asistencia(props) {
  if (props.rol === 'familia')
    return <main><p className="aviso">La asistencia solo está disponible para el equipo de la asociación.</p></main>
  return <PantallaAsistencia {...props} />
}

// Modelo: cada socio figura como «No» en cada periodo hasta que se marca «Sí».
// Solo se guardan las asistencias; pasar a «No» borra el registro.
function PantallaAsistencia({ asoc, rol, email }) {
  const [tipos, setTipos] = useState(null)
  const [socios, setSocios] = useState(null)
  const [perm, setPerm] = useState(null)
  const [tipoId, setTipoId] = useState(null)
  const [inicio, setInicio] = useState(null)
  const [marcas, setMarcas] = useState({}) // socio_id -> true (asistió)
  const [nivel, setNivel] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [cal, setCal] = useState(false)

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

  // Asistencias del periodo mostrado
  useEffect(() => {
    if (!tipoId || !inicio) return
    let vigente = true
    setMarcas({})
    supabase.from('registros_asistencia').select('socio_id, asistio')
      .eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio)
      .then(({ data, error }) => {
        if (!vigente) return
        setMsg(error?.message || '')
        setMarcas(Object.fromEntries((data || []).filter(r => r.asistio).map(r => [r.socio_id, true])))
      })
    return () => { vigente = false }
  }, [tipoId, inicio])

  // Socios que estaban de alta en algún momento del periodo (o que ya tienen asistencia marcada)
  const delPeriodo = useMemo(() => {
    if (!socios || !inicio) return []
    return socios.filter(s =>
      marcas[s.id] ||
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

  const asistieron = lista.filter(s => marcas[s.id]).length

  const poner = (ids, si) => setMarcas(m => {
    const c = { ...m }
    for (const id of ids) { if (si) c[id] = true; else delete c[id] }
    return c
  })

  const filaDe = id => ({ socio_id: id, tipo_actividad_id: tipoId, periodo_inicio: inicio, asistio: true })

  // Sí: guarda la asistencia. No: borra el registro (sin registro = no asistió)
  const marcar = async (id, si) => {
    if (!!marcas[id] === si) return
    poner([id], si)
    let error
    if (si) {
      ;({ error } = await supabase.from('registros_asistencia').upsert(filaDe(id), { onConflict: CONFLICTO }))
    } else {
      const r = await supabase.from('registros_asistencia').delete()
        .eq('socio_id', id).eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio).select('socio_id')
      error = r.error || (r.data?.length ? null : { message: 'No tienes permiso para modificar este registro.' })
    }
    if (error) { poner([id], !si); setMsg(error.message) } else setMsg('')
  }

  // Acciones en bloque sobre los socios que se ven en la lista
  const todosSi = async () => {
    const ids = lista.filter(s => !marcas[s.id]).map(s => s.id)
    if (!ids.length) return
    poner(ids, true)
    const { error } = await supabase.from('registros_asistencia').upsert(ids.map(filaDe), { onConflict: CONFLICTO })
    if (error) { poner(ids, false); setMsg(error.message) } else setMsg('')
  }

  const ninguno = async () => {
    const ids = lista.filter(s => marcas[s.id]).map(s => s.id)
    if (!ids.length || !window.confirm(`¿Poner «No» a ${ids.length} socios en este periodo?`)) return
    poner(ids, false)
    const { data, error } = await supabase.from('registros_asistencia').delete()
      .eq('tipo_actividad_id', tipoId).eq('periodo_inicio', inicio).in('socio_id', ids).select('socio_id')
    if (error || data?.length !== ids.length) {
      poner(ids, true)
      setMsg(error?.message || 'No se pudieron cambiar todos (revisa tus permisos).')
    } else setMsg('')
  }

  if (tipos === null || socios === null) return <main><p>Cargando…</p></main>

  if (tipos.length === 0)
    return <main><p className="aviso">No hay eventos activos{esEncargado && ': defínelas en Ajustes'}.</p></main>

  return (
    <main className="asistencia">
      <ChipsActividades tipos={tipos} tipoId={tipoId} onElegir={seleccionar} />

      {tipo && inicio && (
        <>
          <div className="navperiodo">
            <button aria-label="Periodo anterior" onClick={() => setInicio(sumarPeriodos(inicio, per, -1))}>‹</button>
            <div className="periodo-w">
              <button className="periodo" aria-haspopup="dialog" aria-expanded={cal} onClick={() => setCal(c => !c)}>
                <span className="periodo-txt">
                  <small>{tipo.nombre} · {tipo.periodicidad}</small>
                  <b>{etiquetaPeriodoCorta(inicio, per, hoy())}</b>
                </span>
                {inicio === actual && <span className="badge ok">actual</span>}
                <IconoCalendario />
              </button>
              {cal && <SelectorPeriodo inicio={inicio} per={per} hoyIso={hoy()} onElegir={setInicio} onCerrar={() => setCal(false)} />}
            </div>
            <button aria-label="Periodo siguiente" disabled={inicio >= actual}
              onClick={() => setInicio(sumarPeriodos(inicio, per, 1))}>›</button>
          </div>

          {msg && <p className="error">{msg}</p>}

          <div className="filtros dos una">
            <input type="search" placeholder="Buscar socio" aria-label="Buscar socio" value={q} onChange={e => setQ(e.target.value)} />
            <select value={nivel} aria-label="Nivel" onChange={e => setNivel(e.target.value)}>
              <option value="">Nivel: todos</option>
              {niveles.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>

          <div className="resumen">
            <span><b>{asistieron}</b> Sí</span>
            <span><b>{lista.length - asistieron}</b> No</span>
            {puedeEditar && lista.length > 0 && (
              <span className="bloque">
                <button className="mini" disabled={asistieron === lista.length} onClick={todosSi}>Todos Sí</button>
                <button className="mini" disabled={asistieron === 0} onClick={ninguno}>Todos No</button>
              </span>
            )}
          </div>

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
                <button className={marcas[s.id] ? 'on si' : ''} disabled={!puedeEditar}
                  aria-pressed={!!marcas[s.id]} onClick={() => marcar(s.id, true)}>Sí</button>
                <button className={!marcas[s.id] ? 'on no' : ''} disabled={!puedeEditar}
                  aria-pressed={!marcas[s.id]} onClick={() => marcar(s.id, false)}>No</button>
              </span>
            </div>
          ))}
        </>
      )}
    </main>
  )
}
