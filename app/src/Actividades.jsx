import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, inicioPeriodo, sumarPeriodos, finPeriodo, etiquetaPeriodoCorta, deIso, aIso } from './util'
import { eur } from './cuotas'
import { TIPOS_ACT, etiquetaTipo } from './tiposActividad'
import { colorNivel, colorPlan, ordenarNiveles, pasaFiltro, COLOR_TODOS } from './coloresNivel'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const hora = h => (h ? h.slice(0, 5) : '')
const diaLargo = iso => {
  const d = deIso(iso)
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`
}
const VACIO = { tipo: 'plan', titulo: '', descripcion: '', lugar: '', fecha: '', fecha_fin: '', hora_inicio: '', hora_fin: '', precio: '', niveles: [] }

const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaCompleto = iso => {
  const d = deIso(iso)
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MESES_L[d.getMonth()]}`
}

// Actividades (planes, convivencias y cursos de retiro) como un calendario (semana o mes). Se toca un día para ver el detalle.
// Cada plan lleva el color de su nivel y se puede filtrar por nivel.
// Las familias ven los planes de los niveles de sus hijos; el encargado y los preceptores con permiso de edición los crean.
export default function Actividades({ asoc, rol, email }) {
  const hoyIso = hoy()
  const [vista, setVista] = useState('semana')
  const [inicio, setInicio] = useState(inicioPeriodo(hoyIso, 'semanal'))
  const [sel, setSel] = useState(hoyIso)
  const [filtro, setFiltro] = useState('')
  const [planes, setPlanes] = useState(null)
  const [perm, setPerm] = useState(null)
  const [misNiveles, setMisNiveles] = useState([])
  const [editando, setEditando] = useState(null) // null | plan (con id) | {…VACIO}
  const [msg, setMsg] = useState('')

  const per = vista === 'semana' ? 'semanal' : 'mensual'
  const desde = inicio, hasta = finPeriodo(inicio, per)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('planes').select('*').order('fecha')
    setMsg(error?.message || '')
    setPlanes(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (rol !== 'preceptor') return
    ;(async () => {
      const [p, n] = await Promise.all([
        supabase.from('permisos_preceptor').select('*').eq('asociacion_id', asoc).eq('app_clave', 'actividades').maybeSingle(),
        supabase.from('preceptor_niveles').select('nivel').eq('asociacion_id', asoc).eq('email', email)
      ])
      setPerm(p.data || null)
      setMisNiveles((n.data || []).map(x => x.nivel))
    })()
  }, [asoc, rol, email])

  // Qué puede hacer quien mira (la base de datos lo vuelve a comprobar)
  const todosNiveles = rol === 'encargado' || (rol === 'preceptor' && perm?.ambito === 'todos')
  const nivelesPosibles = todosNiveles ? NIVELES : misNiveles
  const puedeCrear = rol === 'encargado' || (rol === 'preceptor' && !!perm?.puede_editar && (todosNiveles || misNiveles.length > 0))
  const puedeEditar = p => puedeCrear && (todosNiveles || (p.niveles.length > 0 && p.niveles.every(n => misNiveles.includes(n))))

  // Al cambiar de periodo se selecciona hoy (si está dentro) o el primer día
  const irA = (ini, v = vista) => {
    const pr = v === 'semana' ? 'semanal' : 'mensual'
    setInicio(ini)
    setSel(inicioPeriodo(hoyIso, pr) === ini ? hoyIso : ini)
  }
  const mover = n => irA(sumarPeriodos(inicio, per, n))
  const cambiarVista = v => { setVista(v); irA(inicioPeriodo(sel || hoyIso, v === 'semana' ? 'semanal' : 'mensual'), v) }

  if (editando) return <Editor plan={editando} asoc={asoc} niveles={nivelesPosibles} todos={todosNiveles}
    onVolver={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />

  const visibles = (planes || []).filter(p => pasaFiltro(p, filtro))
  // Un plan de varios días aparece en todos los días que abarca
  const delDia = iso => visibles.filter(p => p.fecha <= iso && p.fecha_fin >= iso)
  const dias = []
  for (let d = deIso(desde); aIso(d) <= hasta; d.setDate(d.getDate() + 1)) dias.push(aIso(d))
  const esActual = inicio === inicioPeriodo(hoyIso, per)
  const nivelesEnUso = ordenarNiveles([...new Set((planes || []).flatMap(p => p.niveles))])
  const hayGenerales = (planes || []).some(p => !p.niveles.length)
  const delSel = sel ? delDia(sel) : []
  const huecos = vista === 'mes' ? (deIso(desde).getDay() + 6) % 7 : 0
  const maxChips = vista === 'semana' ? 4 : 2

  return (
    <main className="actividades">
      <div className="barra">
        <h2>Actividades</h2>
        {puedeCrear && <button className="primario" onClick={() => setEditando({ ...VACIO, fecha: sel || hoyIso, fecha_fin: sel || hoyIso })}>+ Nueva actividad</button>}
      </div>
      {msg && <p className="error">{msg}</p>}

      <div className="barra-act">
        <div className="seg" role="group" aria-label="Ver por">
          <button className={vista === 'semana' ? 'on' : ''} aria-pressed={vista === 'semana'} onClick={() => cambiarVista('semana')}>Semana</button>
          <button className={vista === 'mes' ? 'on' : ''} aria-pressed={vista === 'mes'} onClick={() => cambiarVista('mes')}>Mes</button>
        </div>
        <div className="nav-per">
          <button aria-label="Anterior" onClick={() => mover(-1)}>‹</button>
          <b>{etiquetaPeriodoCorta(inicio, per, hoyIso)}</b>
          <button aria-label="Siguiente" onClick={() => mover(1)}>›</button>
          {!esActual && <button className="mini" onClick={() => irA(inicioPeriodo(hoyIso, per))}>Hoy</button>}
        </div>
      </div>

      {nivelesEnUso.length > 0 && (
        <div className="filtro-nivel" role="group" aria-label="Filtrar por nivel">
          <button className={'fn' + (filtro === '' ? ' on' : '')} aria-pressed={filtro === ''} onClick={() => setFiltro('')}>Todos</button>
          {nivelesEnUso.map(n => (
            <button key={n} className={'fn' + (filtro === n ? ' on' : '')} aria-pressed={filtro === n}
              style={{ '--c': colorNivel(n) }} onClick={() => setFiltro(filtro === n ? '' : n)}>
              <i />{n}
            </button>
          ))}
          {hayGenerales && <span className="fn-leyenda" style={{ '--c': COLOR_TODOS }}><i />Todos los niveles</span>}
        </div>
      )}

      {planes === null && <p>Cargando…</p>}

      {planes && (
        <div className={'cal-plan ' + vista} role="grid" aria-label={vista === 'semana' ? 'Calendario de la semana' : 'Calendario del mes'}>
          {DIAS_CORTOS.map(d => <span key={d} className="cab" aria-hidden="true">{d}</span>)}
          {Array.from({ length: huecos }, (_, i) => <span key={'v' + i} className="hueco" />)}
          {dias.map(iso => {
            const l = delDia(iso)
            return (
              <button key={iso} role="gridcell" aria-selected={iso === sel}
                aria-label={`${diaCompleto(iso)}${l.length ? `, ${l.length} ${l.length === 1 ? 'actividad' : 'actividades'}` : ', sin actividades'}`}
                className={'celda' + (iso === hoyIso ? ' hoy' : '') + (iso === sel ? ' sel' : '')} onClick={() => setSel(iso)}>
                <span className="num-dia">{Number(iso.slice(8))}</span>
                <span className="evs">
                  {l.slice(0, maxChips).map(p => <span key={p.id} className="ev" style={{ '--c': colorPlan(p) }}>{p.titulo}</span>)}
                  {l.length > maxChips && <span className="mas">+{l.length - maxChips}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {planes && sel && (
        <section className="detalle-dia" aria-live="polite">
          <div className="barra">
            <h3>{diaCompleto(sel)}{sel === hoyIso && <span className="badge ok">Hoy</span>}</h3>
            {puedeCrear && <button className="mini" onClick={() => setEditando({ ...VACIO, fecha: sel, fecha_fin: sel })}>+ Actividad este día</button>}
          </div>
          {delSel.length === 0 && <p className="aviso">No hay actividades este día{filtro ? ` para ${filtro}` : ''}.</p>}
          {delSel.map(p => <Plan key={p.id} p={p} editable={puedeEditar(p)} onEditar={() => setEditando(p)} />)}
        </section>
      )}
    </main>
  )
}

function Plan({ p, editable, onEditar }) {
  const multi = p.fecha_fin > p.fecha
  return (
    <article className="plan" style={{ '--c': colorPlan(p) }}>
      <div className="plan-cab">
        <b>{p.titulo}</b>
        <span className={'precio' + (Number(p.precio) > 0 ? '' : ' gratis')}>{Number(p.precio) > 0 ? eur(p.precio) : 'Gratis'}</span>
      </div>
      <small className="meta">
        {multi && <span>Del {diaLargo(p.fecha)} al {diaLargo(p.fecha_fin)}</span>}
        {p.hora_inicio && <span>{hora(p.hora_inicio)}{p.hora_fin ? ` – ${hora(p.hora_fin)}` : ''}</span>}
        {p.lugar && <span>{p.lugar}</span>}
      </small>
      <div className="chips">
        <span className="chip tipo-act">{etiquetaTipo(p.tipo)}</span>
        {p.niveles.length === 0
          ? <span className="chip nv" style={{ '--c': COLOR_TODOS }}>Todos los niveles</span>
          : ordenarNiveles(p.niveles).map(n => <span key={n} className="chip nv" style={{ '--c': colorNivel(n) }}>{n}</span>)}
      </div>
      {p.descripcion && <p className="plan-desc">{p.descripcion}</p>}
      {editable && <div className="fila"><button onClick={onEditar}>Editar</button></div>}
    </article>
  )
}

function Editor({ plan, asoc, niveles, todos, onVolver, onGuardado }) {
  const nuevo = !plan.id
  const [f, setF] = useState({
    ...VACIO, ...plan, precio: plan.precio ? String(plan.precio) : '',
    descripcion: plan.descripcion || '', lugar: plan.lugar || '',
    hora_inicio: hora(plan.hora_inicio), hora_fin: hora(plan.hora_fin)
  })
  const [msg, setMsg] = useState('')
  const [borrar, setBorrar] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const alternar = n => set('niveles', f.niveles.includes(n) ? f.niveles.filter(x => x !== n) : [...f.niveles, n])

  const guardar = async e => {
    e.preventDefault()
    const precio = f.precio === '' ? 0 : Number(String(f.precio).replace(',', '.'))
    if (!f.titulo.trim()) return setMsg('Escribe un título.')
    if (!f.fecha) return setMsg('Elige la fecha.')
    if (f.fecha_fin && f.fecha_fin < f.fecha) return setMsg('La fecha de fin no puede ser anterior al inicio.')
    if (!(precio >= 0)) return setMsg('El precio no es válido.')
    if (!todos && f.niveles.length === 0) return setMsg('Elige al menos un nivel.')
    const fila = {
      tipo: f.tipo, titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, lugar: f.lugar.trim() || null,
      fecha: f.fecha, fecha_fin: f.fecha_fin || f.fecha, hora_inicio: f.hora_inicio || null, hora_fin: f.hora_fin || null,
      precio, niveles: f.niveles
    }
    const { error } = nuevo
      ? await supabase.from('planes').insert({ ...fila, asociacion_id: asoc })
      : await supabase.from('planes').update(fila).eq('id', plan.id)
    if (error) return setMsg(error.message)
    onGuardado()
  }

  const eliminar = async () => {
    const { error } = await supabase.from('planes').delete().eq('id', plan.id)
    if (error) return setMsg(error.message)
    onGuardado()
  }

  // Si el plan ya tenía niveles que quien edita no puede tocar, se muestran igualmente
  const lista = [...new Set([...niveles, ...f.niveles])]

  return (
    <main className="actividades">
      <div className="barra">
        <h2>{nuevo ? 'Nueva actividad' : 'Editar actividad'}</h2>
        <button onClick={onVolver}>Cancelar</button>
      </div>
      <form className="formgrid" onSubmit={guardar}>
        <label className="campo ancho"><span>Tipo</span>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS_ACT.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="campo ancho"><span>Título</span><input value={f.titulo} maxLength={120} onChange={e => set('titulo', e.target.value)} /></label>
        <label className="campo"><span>Fecha</span><input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label className="campo"><span>Hasta (si dura varios días)</span><input type="date" value={f.fecha_fin} min={f.fecha} onChange={e => set('fecha_fin', e.target.value)} /></label>
        <label className="campo"><span>Hora de inicio</span><input type="time" value={f.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} /></label>
        <label className="campo"><span>Hora de fin</span><input type="time" value={f.hora_fin} onChange={e => set('hora_fin', e.target.value)} /></label>
        <label className="campo"><span>Lugar</span><input value={f.lugar} maxLength={200} onChange={e => set('lugar', e.target.value)} /></label>
        <label className="campo"><span>Precio (€)</span><input inputMode="decimal" placeholder="0 = gratis" value={f.precio} onChange={e => set('precio', e.target.value)} /></label>
        <label className="campo ancho"><span>Descripción</span><textarea rows={4} value={f.descripcion} maxLength={2000} onChange={e => set('descripcion', e.target.value)} /></label>
        <div className="campo ancho">
          <span>Niveles a los que va dirigido</span>
          <div className="chips">
            {lista.map(n => (
              <button type="button" key={n} className={'chip tipo' + (f.niveles.includes(n) ? ' on' : '')} aria-pressed={f.niveles.includes(n)}
                disabled={!niveles.includes(n)} onClick={() => alternar(n)}>{n}</button>
            ))}
          </div>
          <small className="aviso">{todos ? 'Si no eliges ninguno, la actividad es para todos los niveles.' : 'Solo puedes elegir entre tus niveles.'}</small>
        </div>
        {msg && <p className="error ancho">{msg}</p>}
        <div className="fila ancho">
          <button className="primario" type="submit">{nuevo ? 'Crear actividad' : 'Guardar'}</button>
          {!nuevo && !borrar && <button type="button" className="peligro" onClick={() => setBorrar(true)}>Eliminar</button>}
          {!nuevo && borrar && <button type="button" className="peligro" onClick={eliminar}>Sí, eliminar la actividad</button>}
        </div>
      </form>
    </main>
  )
}
