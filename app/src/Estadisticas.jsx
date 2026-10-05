import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { hoy, abrev } from './util'
import Grafico from './estadisticas/Grafico'
import * as calc from './estadisticas/calculos'
import * as op from './estadisticas/opciones'
import { colorNivel } from './coloresNivel'

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
  const [rango, setRango] = useState('curso') // 'curso' = desde el 1 de septiembre, o un número de meses
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [tipoId, setTipoId] = useState(null)
  const [modoMensual, setModoMensual] = useState('distintos') // 'distintos' | 'media'
  const [vistaSemanal, setVistaSemanal] = useState('total') // 'total' | 'cursos'
  const [nivelesSel, setNivelesSel] = useState(null) // null = todos los cursos
  const [grupo, setGrupo] = useState('club') // mapa por nivel: 'club' | 'sanrafael'
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
          .select('id, nombre, abreviatura, periodicidad').eq('asociacion_id', asoc).eq('activa', true)
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

  const desdeRango = rango === 'curso' ? calc.inicioCurso(H) : `${calc.ultimosMeses(H, rango)[0]}-01`
  const meses = rango === 'curso' ? calc.mesesDesde(desdeRango, H) : rango
  const tipo = datos?.tipos.find(t => t.id === tipoId)

  const serie = useMemo(() => datos && calc.serieSocios(datos.socios, H, meses), [datos, meses, H])
  const niveles = useMemo(() => datos && calc.porNivel(datos.socios, H), [datos, H])
  const asis = useMemo(() => datos && tipo
    ? calc.serieAsistencia(datos.registros, datos.socios, tipo, desdeRango, H) : null,
    [datos, tipo, desdeRango, H])
  const asisMes = useMemo(() => datos && tipo
    ? calc.serieAsistenciaMensual(datos.registros, datos.socios, tipo, desdeRango, H) : null,
    [datos, tipo, desdeRango, H])
  const asisNivel = useMemo(() => datos && tipo
    ? calc.serieAsistenciaPorNivel(datos.registros, datos.socios, tipo, desdeRango, H) : null,
    [datos, tipo, desdeRango, H])
  const mapa = useMemo(() => datos && calc.matrizNivelActividad(datos.registros, datos.socios, datos.tipos, desdeRango, H, calc.GRUPOS[grupo].niveles),
    [datos, desdeRango, H, grupo])

  // Opciones de los gráficos: todos los hooks van antes de cualquier return anticipado
  const oSocios = useMemo(() => serie && op.opcionSociosMes(serie), [serie])
  const cursosMostrados = asisNivel ? asisNivel.niveles.filter(n => !nivelesSel || nivelesSel.includes(n)) : []
  const oAsisNivel = useMemo(() => (asisNivel && cursosMostrados.length
    ? op.opcionAsistenciaPorNivel(asisNivel, cursosMostrados, colorNivel) : null),
  [asisNivel, nivelesSel]) // eslint-disable-line react-hooks/exhaustive-deps
  const oAsis = useMemo(() => asis && op.opcionAsistencia(asis), [asis])
  const modoEf = modoMensual === 'media' && tipo?.periodicidad !== 'semanal' ? 'distintos' : modoMensual
  const oAsisMes = useMemo(() => asisMes && op.opcionAsistenciaMensual(asisMes, modoEf), [asisMes, modoEf])
  const oMapa = useMemo(() => (mapa?.celdas.length ? op.opcionMapaCalor(mapa) : null), [mapa])
  const oNiveles = useMemo(() => (niveles?.length ? op.opcionNiveles(niveles) : null), [niveles])

  if (permiso === null) return <main><p>Cargando…</p></main>
  if (!permiso) return <main><p className="aviso">No tienes acceso a las estadísticas. Pídeselo al encargado de tu asociación.</p></main>
  if (error) return <main><p className="error">{error}</p></main>
  if (!datos) return <main><p>Cargando estadísticas…</p></main>

  const alternarCurso = n => setNivelesSel(
    (nivelesSel || asisNivel.niveles).includes(n) ? (nivelesSel || asisNivel.niveles).filter(x => x !== n) : [...(nivelesSel || asisNivel.niveles), n])

  return (
    <main>
      <div className="barra">
        <h2>Estadísticas</h2>
        <label className="fila">Periodo
          <select value={rango} onChange={e => setRango(e.target.value === 'curso' ? 'curso' : Number(e.target.value))}>
            <option value="curso">Desde inicio de curso (1 sept)</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>
        </label>
      </div>

      <Tarjeta titulo="Socios activos" subtitulo="Altas y bajas de cada mes (columnas) y socios activos a final de mes (línea). Las altas incluyen las reincorporaciones"
        tabla={{ cab: ['Mes', 'Altas', 'Bajas', 'Activos'], filas: serie.map(s => [s.etiqueta, s.altas, s.bajas, s.activos]) }}>
        <Grafico option={oSocios} alto={300} etiqueta="Altas, bajas y socios activos por mes" />
      </Tarjeta>

      <Tarjeta titulo="Socios por nivel" subtitulo="Socios activos hoy"
        tabla={{ cab: ['Nivel', 'Socios'], filas: niveles.map(n => [n.nivel, n.n]) }}>
        {oNiveles
          ? <Grafico option={oNiveles} alto={niveles.length * 32 + 24}
              etiqueta="Socios activos por nivel" />
          : <p className="aviso">No hay socios activos.</p>}
      </Tarjeta>

      <Tarjeta titulo="Asistencia semanal"
        subtitulo={tipo ? `${tipo.nombre}: socios que asistieron en cada ${{ semanal: 'semana', mensual: 'mes', trimestral: 'trimestre', anual: 'año' }[tipo.periodicidad]}` : 'Socios que asistieron en cada periodo'}
        extra={datos.tipos.length > 0 && (
          <div className="chips tipos">
            {datos.tipos.map(t => (
              <button key={t.id} className={'chip tipo' + (t.id === tipoId ? ' on' : '')} title={t.nombre}
                aria-label={`${t.nombre}, ${t.periodicidad}`} aria-pressed={t.id === tipoId} onClick={() => setTipoId(t.id)}>
                {abrev(t)}
              </button>
            ))}
          </div>
        )}
        tabla={vistaSemanal === 'cursos' && asisNivel
          ? { cab: ['Periodo', ...cursosMostrados], filas: asisNivel.filas.map(f => [f.etiqueta, ...cursosMostrados.map(n => f.si[n] || 0)]) }
          : asis && { cab: ['Periodo', 'Asistieron', 'Socios', '%'],
            filas: asis.map(s => [s.etiqueta, s.si, s.total, s.pct == null ? '—' : `${s.pct}%`]) }}
        pie={asis && (
          <div className="pie-grafico">
            <div className="seg" role="group" aria-label="Cómo mostrar">
              <button className={vistaSemanal === 'total' ? 'on' : ''} aria-pressed={vistaSemanal === 'total'} onClick={() => setVistaSemanal('total')}>Total</button>
              <button className={vistaSemanal === 'cursos' ? 'on' : ''} aria-pressed={vistaSemanal === 'cursos'} onClick={() => setVistaSemanal('cursos')}>Por cursos</button>
            </div>
            {vistaSemanal === 'cursos' && asisNivel && (
              <div className="filtro-nivel" role="group" aria-label="Cursos a mostrar">
                {asisNivel.niveles.map(n => {
                  const on = cursosMostrados.includes(n)
                  return (
                    <button key={n} className={'fn' + (on ? ' on' : '')} aria-pressed={on} style={{ '--c': colorNivel(n) }}
                      onClick={() => alternarCurso(n)}><i />{n}</button>
                  )
                })}
                <button className="mini" onClick={() => setNivelesSel(null)}>Todos</button>
              </div>
            )}
          </div>
        )}>
        {!asis
          ? <p className="aviso">No hay eventos activos.</p>
          : vistaSemanal === 'cursos'
            ? (oAsisNivel
              ? <Grafico option={oAsisNivel} alto={300} etiqueta={`Asistencia a ${tipo.nombre} por cursos`} />
              : <p className="aviso">Elige al menos un curso.</p>)
            : <Grafico option={oAsis} etiqueta={`Asistencia a ${tipo.nombre}`} />}
      </Tarjeta>

      <Tarjeta titulo="Asistencia mensual"
        subtitulo={tipo ? `${tipo.nombre}: ${modoEf === 'media' ? 'asistentes por semana, de media' : 'socios distintos que asistieron en el mes'}` : 'Por mes'}
        extra={asisMes && (
          <div className="seg" role="group" aria-label="Qué mostrar">
            <button className={modoEf === 'distintos' ? 'on' : ''} aria-pressed={modoEf === 'distintos'}
              title="Socios distintos que asistieron al menos una vez en el mes" onClick={() => setModoMensual('distintos')}>Distintos</button>
            <button className={modoEf === 'media' ? 'on' : ''} aria-pressed={modoEf === 'media'}
              disabled={tipo.periodicidad !== 'semanal'}
              title={tipo.periodicidad === 'semanal' ? 'Asistentes por semana, de media, en el mes' : 'Solo para eventos semanales'}
              onClick={() => setModoMensual('media')}>Media/sem.</button>
          </div>
        )}
        tabla={asisMes && { cab: ['Mes', 'Distintos', ...(tipo.periodicidad === 'semanal' ? ['Media/sem.'] : [])],
          filas: asisMes.map(s => [s.etiqueta, s.distintos, ...(tipo.periodicidad === 'semanal' ? [s.media ?? '—'] : [])]) }}>
        {asisMes
          ? <Grafico option={oAsisMes} etiqueta={`Asistencia mensual a ${tipo.nombre}`} />
          : <p className="aviso">No hay eventos activos.</p>}
      </Tarjeta>

      <Tarjeta titulo="Asistencia por nivel y evento" subtitulo="Asistentes de media por periodo (semana, mes…) en el rango seleccionado"
        extra={(
          <div className="seg" role="group" aria-label="Grupo de niveles">
            {Object.entries(calc.GRUPOS).map(([k, g]) => (
              <button key={k} className={grupo === k ? 'on' : ''} aria-pressed={grupo === k}
                title={`${g.niveles[0]} a ${g.niveles.at(-1)}`} onClick={() => setGrupo(k)}>{g.nombre}</button>
            ))}
          </div>
        )}
        tabla={mapa.celdas.length ? { cab: ['Nivel', ...mapa.abrevs],
          filas: mapa.niveles.map((nv, y) => [nv, ...mapa.abrevs.map((_, x) => {
            const c = mapa.celdas.find(k => k.x === x && k.y === y)
            return c ? c.valor : '—'
          })]) } : null}>
        {oMapa
          ? <Grafico option={oMapa} alto={mapa.niveles.length * 34 + 110}
              etiqueta={`Asistentes de media por nivel y evento, ${calc.GRUPOS[grupo].nombre}`} />
          : <p className="aviso">Todavía no hay datos de asistencia de {calc.GRUPOS[grupo].nombre} en este periodo.</p>}
      </Tarjeta>
    </main>
  )
}

// Tarjeta de gráfico con vista alternativa en tabla (el mismo dato, accesible sin depender del color)
function Tarjeta({ titulo, subtitulo, extra, pie, tabla, children }) {
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
      {pie}
    </section>
  )
}
