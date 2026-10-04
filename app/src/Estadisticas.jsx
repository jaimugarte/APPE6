import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { hoy } from './util'
import Grafico from './estadisticas/Grafico'
import * as calc from './estadisticas/calculos'
import * as op from './estadisticas/opciones'

// PostgREST devuelve como mucho 1000 filas por petición: se pide por páginas
async function paginar(construir) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await construir().range(desde, desde + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export default function Estadisticas({ asoc, rol }) {
  const [permiso, setPermiso] = useState(rol === 'encargado' ? true : rol === 'preceptor' ? null : false)
  const [meses, setMeses] = useState(12)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [tipoId, setTipoId] = useState(null)
  const H = useMemo(() => hoy(), [])

  // Un preceptor necesita permiso de «ver» sobre Estadísticas; las familias no tienen acceso
  useEffect(() => {
    if (rol !== 'preceptor') return
    supabase.from('permisos_preceptor').select('puede_ver').eq('asociacion_id', asoc).eq('app_clave', 'estadisticas')
      .maybeSingle().then(({ data }) => setPermiso(!!data?.puede_ver))
  }, [asoc, rol])

  useEffect(() => {
    if (permiso !== true) return
    let vigente = true
    ;(async () => {
      try {
        const { data: tipos, error: e1 } = await supabase.from('tipos_actividad')
          .select('id, nombre, periodicidad').eq('asociacion_id', asoc).eq('activa', true)
          .order('orden').order('nombre')
        if (e1) throw e1
        const socios = await paginar(() => supabase.from('socios')
          .select('id, nivel, fecha_nacimiento, periodos_alta(fecha_alta, fecha_baja)')
          .eq('asociacion_id', asoc).order('id'))
        const desde = calc.desdeNecesario(tipos, H, 24)
        const registros = await paginar(() => supabase.from('registros_asistencia')
          .select('socio_id, tipo_actividad_id, periodo_inicio, asistio')
          .gte('periodo_inicio', desde)
          .order('periodo_inicio').order('tipo_actividad_id').order('socio_id'))
        if (!vigente) return
        setDatos({ tipos, socios, registros })
        setTipoId(tipos[0]?.id ?? null)
      } catch (e) { if (vigente) setError(e.message || String(e)) }
    })()
    return () => { vigente = false }
  }, [asoc, permiso, H])

  const desdeRango = `${calc.ultimosMeses(H, meses)[0]}-01`
  const tipo = datos?.tipos.find(t => t.id === tipoId)

  const serie = useMemo(() => datos && calc.serieSocios(datos.socios, H, meses), [datos, meses, H])
  const niveles = useMemo(() => datos && calc.porNivel(datos.socios, H), [datos, H])
  const edades = useMemo(() => datos && calc.porEdad(datos.socios, H), [datos, H])
  const asis = useMemo(() => datos && tipo
    ? calc.serieAsistencia(datos.registros, tipo, H, calc.periodosEnRango(tipo.periodicidad, meses)) : null,
    [datos, tipo, meses, H])
  const mapa = useMemo(() => datos && calc.matrizNivelActividad(datos.registros, datos.socios, datos.tipos, desdeRango),
    [datos, desdeRango])
  const media = useMemo(() => datos && calc.asistenciaMedia(datos.registros, desdeRango), [datos, desdeRango])

  // Opciones de los gráficos: todos los hooks van antes de cualquier return anticipado
  const oActivos = useMemo(() => serie && op.opcionActivos(serie), [serie])
  const oAltas = useMemo(() => serie && op.opcionAltasBajas(serie), [serie])
  const oAsis = useMemo(() => asis && op.opcionAsistencia(asis), [asis])
  const oMapa = useMemo(() => (mapa?.celdas.length ? op.opcionMapaCalor(mapa) : null), [mapa])
  const oNiveles = useMemo(() => (niveles?.length ? op.opcionNiveles(niveles) : null), [niveles])
  const oEdades = useMemo(() => (edades?.filas.length ? op.opcionEdades(edades.filas) : null), [edades])

  if (permiso === null) return <main><p>Cargando…</p></main>
  if (!permiso) return <main><p className="aviso">No tienes acceso a las estadísticas. Pídeselo al encargado de tu asociación.</p></main>
  if (error) return <main><p className="error">{error}</p></main>
  if (!datos) return <main><p>Cargando estadísticas…</p></main>

  const activos = serie.at(-1)?.activos ?? 0
  const altas = serie.reduce((a, s) => a + s.altas, 0)
  const bajas = serie.reduce((a, s) => a + s.bajas, 0)

  return (
    <main>
      <div className="barra">
        <h2>Estadísticas</h2>
        <label className="fila">Periodo
          <select value={meses} onChange={e => setMeses(Number(e.target.value))}>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>
        </label>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Socios activos</span><b>{activos}</b></div>
        <div className="kpi"><span>Altas ({meses} meses)</span><b>{altas}</b></div>
        <div className="kpi"><span>Bajas ({meses} meses)</span><b>{bajas}</b></div>
        <div className="kpi"><span>Asistencia media</span><b>{media == null ? '—' : `${media}%`}</b></div>
      </div>

      <Tarjeta titulo="Socios activos" subtitulo="Al final de cada mes"
        tabla={{ cab: ['Mes', 'Activos'], filas: serie.map(s => [s.etiqueta, s.activos]) }}>
        <Grafico option={oActivos} etiqueta="Evolución mensual de socios activos" />
      </Tarjeta>

      <Tarjeta titulo="Altas y bajas" subtitulo="Por mes. Las altas incluyen las reincorporaciones"
        tabla={{ cab: ['Mes', 'Altas', 'Bajas'], filas: serie.map(s => [s.etiqueta, s.altas, s.bajas]) }}>
        <Grafico option={oAltas} etiqueta="Altas y bajas por mes" />
      </Tarjeta>

      <Tarjeta titulo="Asistencia por actividad"
        subtitulo="% de socios marcados que asistieron. Los socios sin marcar no cuentan"
        extra={datos.tipos.length > 0 && (
          <div className="chips tipos">
            {datos.tipos.map(t => (
              <button key={t.id} className={'chip tipo' + (t.id === tipoId ? ' on' : '')} onClick={() => setTipoId(t.id)}>
                {t.nombre} <small>{t.periodicidad}</small>
              </button>
            ))}
          </div>
        )}
        tabla={asis && { cab: ['Periodo', 'Asistieron', 'Marcados', '%'],
          filas: asis.map(s => [s.etiqueta, s.si, s.marcados, s.pct == null ? '—' : `${s.pct}%`]) }}>
        {asis
          ? <Grafico option={oAsis} etiqueta={`Asistencia a ${tipo.nombre}`} />
          : <p className="aviso">No hay actividades activas.</p>}
      </Tarjeta>

      <Tarjeta titulo="Asistencia por nivel y actividad" subtitulo="Media del periodo seleccionado"
        tabla={mapa.celdas.length ? { cab: ['Nivel', ...mapa.tipos],
          filas: mapa.niveles.map((nv, y) => [nv, ...mapa.tipos.map((_, x) => {
            const c = mapa.celdas.find(k => k.x === x && k.y === y)
            return c ? `${c.pct}%` : '—'
          })]) } : null}>
        {oMapa
          ? <Grafico option={oMapa} alto={mapa.niveles.length * 34 + 110}
              etiqueta="Asistencia media por nivel y actividad" />
          : <p className="aviso">Todavía no hay asistencia registrada en este periodo.</p>}
      </Tarjeta>

      <Tarjeta titulo="Socios por nivel" subtitulo="Socios activos hoy"
        tabla={{ cab: ['Nivel', 'Socios'], filas: niveles.map(n => [n.nivel, n.n]) }}>
        {oNiveles
          ? <Grafico option={oNiveles} alto={niveles.length * 32 + 24}
              etiqueta="Socios activos por nivel" />
          : <p className="aviso">No hay socios activos.</p>}
      </Tarjeta>

      <Tarjeta titulo="Edades" subtitulo={`Socios activos hoy, en años${edades.sinFecha ? ` · ${edades.sinFecha} sin fecha de nacimiento` : ''}`}
        tabla={{ cab: ['Edad', 'Socios'], filas: edades.filas.map(e => [e.edad, e.n]) }}>
        {oEdades
          ? <Grafico option={oEdades} etiqueta="Distribución de edades" />
          : <p className="aviso">Ningún socio activo tiene fecha de nacimiento.</p>}
      </Tarjeta>
    </main>
  )
}

// Tarjeta de gráfico con vista alternativa en tabla (el mismo dato, accesible sin depender del color)
function Tarjeta({ titulo, subtitulo, extra, tabla, children }) {
  const [verTabla, setVerTabla] = useState(false)
  return (
    <section className="grafico">
      <div className="barra">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p className="sub">{subtitulo}</p>}
        </div>
        {tabla && <button className="mini" onClick={() => setVerTabla(v => !v)}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>}
      </div>
      {extra}
      {verTabla && tabla ? (
        <div className="tablaw">
          <table>
            <thead><tr>{tabla.cab.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{tabla.filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  )
}
