import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, inicioPeriodo, sumarPeriodos, finPeriodo, etiquetaPeriodoCorta, deIso, aIso } from './util'
import { eur } from './cuotas'
import { TIPOS_ACT, etiquetaTipo } from './tiposActividad'
import { colorNivel, colorPlan, fondoPlan, ordenarNiveles, COLOR_TODOS } from './coloresNivel'
import { MenuCalendario, SemanaHoras } from './CalendarioVistas'
import { useApuntes, ApuntarHijos, Plazas } from './PlanesFamilia'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const hora = h => (h ? h.slice(0, 5) : '')
const diaLargo = iso => {
  const d = deIso(iso)
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`
}
const VACIO = { tipo: 'plan', titulo: '', descripcion: '', lugar: '', fecha: '', fecha_fin: '', hora_inicio: '', hora_fin: '', precio: '', limite: '', niveles: [] }
const activoSocio = s => !!s.no_socio || !!s.periodos_alta?.some(p => !p.fecha_baja)
// «10/20» (o «10» si no hay límite); sobrepasado = más apuntados que plazas
const cuenta = (n, limite) => (limite != null ? `${n}/${limite}` : n > 0 ? String(n) : '')

const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaCompleto = iso => {
  const d = deIso(iso)
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MESES_L[d.getMonth()]}`
}

// Calendario de planes, convivencias y cursos de retiro: un mes a pantalla completa. Se toca un día para ver el detalle y el botón «+» crea un plan.
// El equipo ve cuánta gente hay apuntada (10/20, en rojo si se supera el límite); las familias apuntan a sus hijos.
// Cada plan lleva el color de su nivel y se puede filtrar por nivel.
// Las familias ven los planes de los niveles de sus hijos; el encargado y los preceptores con permiso de edición los crean.
export default function Actividades({ asoc, rol, email, foco }) {
  const hoyIso = hoy()
  const [vista, setVista] = useState('semana')   // por defecto, la semana
  const per = vista === 'semana' ? 'semanal' : 'mensual'
  const [inicio, setInicio] = useState(inicioPeriodo(hoyIso, 'semanal'))
  const [sel, setSel] = useState(hoyIso)
  const [nivSel, setNivSel] = useState(undefined)   // undefined = el valor por defecto; null = todos; si no, lista de niveles
  const [generales, setGenerales] = useState(true)   // planes para todos los niveles
  const [planes, setPlanes] = useState(null)
  const [perm, setPerm] = useState(null)
  const [misNiveles, setMisNiveles] = useState([])
  const [editando, setEditando] = useState(null) // null | plan (con id) | {…VACIO}
  const [msg, setMsg] = useState('')

  const familia = rol === 'familia'
  const apuntes = useApuntes(familia)
  const [socios, setSocios] = useState([])
  const [inscritos, setInscritos] = useState([])
  const desde = inicio, hasta = finPeriodo(inicio, per)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('planes').select('*').order('fecha')
    setMsg(error?.message || '')
    setPlanes(data || [])
    if (!familia) {
      const [s, i] = await Promise.all([
        supabase.from('socios').select('id, nombre, apellidos, nivel, no_socio, periodos_alta(fecha_baja)').order('apellidos'),
        supabase.from('plan_inscritos').select('plan_id, socio_id')
      ])
      setSocios(s.data || [])
      setInscritos(i.data || [])
    }
  }, [familia])
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

  // Un aviso de plan nuevo lleva a la semana de ese plan
  useEffect(() => {
    if (!foco?.fecha) return
    setVista('semana'); setInicio(inicioPeriodo(foco.fecha, 'semanal')); setSel(foco.fecha)
    setTimeout(() => document.querySelector('.detalle-dia')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
  }, [foco])

  // Qué puede hacer quien mira (la base de datos lo vuelve a comprobar)
  const todosNiveles = rol === 'encargado' || (rol === 'preceptor' && perm?.ambito === 'todos')
  const nivelesPosibles = todosNiveles ? NIVELES : misNiveles
  const puedeCrear = rol === 'encargado' || (rol === 'preceptor' && !!perm?.puede_editar && (todosNiveles || misNiveles.length > 0))
  const puedeEditar = p => puedeCrear && (todosNiveles || (p.niveles.length > 0 && p.niveles.every(n => misNiveles.includes(n))))

  // Al cambiar de periodo se selecciona hoy (si está dentro) o el primer día
  const irA = (ini, pr = per) => {
    setInicio(ini)
    setSel(inicioPeriodo(hoyIso, pr) === ini ? hoyIso : ini)
  }
  const cambiarVista = v => {
    const pr = v === 'semana' ? 'semanal' : 'mensual'
    setVista(v); irA(inicioPeriodo(sel || hoyIso, pr), pr)
  }
  const mover = n => irA(sumarPeriodos(inicio, per, n))

  if (editando) return <Editor plan={editando} asoc={asoc} niveles={nivelesPosibles} todos={todosNiveles}
    socios={socios} inscritos={inscritos.filter(i => i.plan_id === editando.id)}
    onVolver={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} onInscritos={cargar} />

  // Por defecto, el preceptor ve solo los planes de sus niveles; el resto ve todos
  const nivEf = nivSel === undefined ? (rol === 'preceptor' && misNiveles.length ? misNiveles : null) : nivSel
  const pasa = p => (p.niveles.length ? nivEf === null || p.niveles.some(n => nivEf.includes(n)) : generales)
  const visibles = (planes || []).filter(pasa)
  // Un plan de varios días aparece en todos los días que abarca
  const delDia = iso => visibles.filter(p => p.fecha <= iso && p.fecha_fin >= iso)
  const dias = []
  for (let d = deIso(desde); aIso(d) <= hasta; d.setDate(d.getDate() + 1)) dias.push(aIso(d))
  const esActual = inicio === inicioPeriodo(hoyIso, per)
  const delSel = sel ? delDia(sel) : []
  const huecos = vista === 'mes' ? (deIso(desde).getDay() + 6) % 7 : 0
  const maxChips = vista === 'mes' ? 3 : 99
  const nivelesHijos = familia ? [...new Set(apuntes.hijos.map(h => h.nivel).filter(Boolean))] : []
  const apuntadosDe = id => (familia ? apuntes.aforo[id] || 0 : inscritos.filter(i => i.plan_id === id).length)

  return (
    <main className={'actividades calendario-mes ' + vista}>
      <h1 className="solo-lectores">Calendario</h1>
      {msg && <p className="error">{msg}</p>}

      <div className="barra-act">
        <MenuCalendario vista={vista} onVista={cambiarVista} niveles={nivEf} generales={generales}
          onNiveles={setNivSel} onGenerales={setGenerales} misNiveles={rol === 'preceptor' ? misNiveles : nivelesHijos} opciones={familia ? ordenarNiveles(nivelesHijos) : NIVELES} />
        <div className="nav-per">
          <button aria-label={vista === 'semana' ? 'Semana anterior' : 'Mes anterior'} onClick={() => mover(-1)}>‹</button>
          <b>{etiquetaPeriodoCorta(inicio, per, hoyIso)}</b>
          <button aria-label={vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente'} onClick={() => mover(1)}>›</button>
          {!esActual && <button className="mini" onClick={() => irA(inicioPeriodo(hoyIso, per))}>Hoy</button>}
        </div>
      </div>

      {planes === null && <p>Cargando…</p>}

      {planes && vista === 'semana' && (
        <SemanaHoras dias={dias} delDia={delDia} sel={sel} hoyIso={hoyIso} onDia={setSel}
          onPlan={() => setTimeout(() => document.querySelector('.detalle-dia')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)}
          cuentaDe={p => { const n = apuntadosDe(p.id); const t = cuenta(n, p.limite); return t ? { texto: t, rojo: p.limite != null && n > p.limite } : null }} />
      )}

      {planes && vista === 'mes' && (
        <div className="cal-plan mes" role="grid" aria-label="Calendario del mes">
          {DIAS_CORTOS.map(d => <span key={d} className="cab" aria-hidden="true">{d}</span>)}
          {Array.from({ length: huecos }, (_, i) => <span key={'v' + i} className="hueco" />)}
          {dias.map(iso => {
            const l = delDia(iso)
            return (
              <button key={iso} role="gridcell" aria-selected={iso === sel}
                aria-label={`${diaCompleto(iso)}${l.length ? `, ${l.length} ${l.length === 1 ? 'plan' : 'planes'}` : ', sin planes'}`}
                className={'celda' + (iso === hoyIso ? ' hoy' : '') + (iso === sel ? ' sel' : '')} onClick={() => setSel(iso)}>
                <span className="num-dia">{Number(iso.slice(8))}</span>
                <span className="evs">
                  {l.slice(0, maxChips).map(p => {
                    const n = apuntadosDe(p.id)
                    const c = cuenta(n, p.limite)
                    const pasado = p.limite != null && n > p.limite
                    return (
                      <span key={p.id} className="ev" style={{ '--c': colorPlan(p), background: fondoPlan(p) }}>
                        <span className="ev-t">{p.titulo}</span>
                        {c && <b className={'ev-n' + (pasado ? ' rojo' : '')}>{c}</b>}
                      </span>
                    )
                  })}
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
          </div>
          {delSel.length === 0 && <p className="aviso">No hay planes este día.</p>}
          {delSel.map(p => (
            <Plan key={p.id} p={p} editable={puedeEditar(p)} onEditar={() => setEditando(p)} familia={familia}
              apuntados={apuntadosDe(p.id)} datos={apuntes}
              inscritos={familia ? [] : inscritos.filter(i => i.plan_id === p.id).map(i => socios.find(s => s.id === i.socio_id)).filter(Boolean)} />
          ))}
        </section>
      )}

      {puedeCrear && !familia && (
        <button className="fab" aria-label="Nuevo plan" title="Nuevo plan"
          onClick={() => setEditando({ ...VACIO, fecha: sel || hoyIso, fecha_fin: sel || hoyIso })}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </main>
  )
}

function Plan({ p, editable, onEditar, familia, apuntados, datos, inscritos }) {
  const multi = p.fecha_fin > p.fecha
  const rojo = p.limite != null && apuntados > p.limite
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
        {
          <span className={'chip plazas' + (rojo ? ' roja' : '')}>Apuntados: {p.limite != null ? `${apuntados}/${p.limite}` : apuntados}</span>}
        {familia && <Plazas plan={p} apuntados={apuntados} />}
      </div>
      {p.descripcion && <p className="plan-desc">{p.descripcion}</p>}
      {familia && <ApuntarHijos plan={p} datos={datos} />}
      {!familia && inscritos.length > 0 && (
        <details className="lista-apuntados">
          <summary>Ver apuntados ({inscritos.length})</summary>
          <ul>{inscritos.map(s => <li key={s.id}>{s.nombre} {s.apellidos} <small>{s.nivel}</small></li>)}</ul>
        </details>
      )}
      {editable && <div className="fila"><button onClick={onEditar}>Editar</button></div>}
    </article>
  )
}

// Apuntados de un plan: el equipo puede añadir o quitar chavales (aunque se pase del límite, que se marca en rojo)
function Inscritos({ plan, socios, inscritos, onCambio }) {
  const [msg, setMsg] = useState('')
  const [elegido, setElegido] = useState('')
  const dentro = new Set(inscritos.map(i => i.socio_id))
  const lista = inscritos.map(i => socios.find(s => s.id === i.socio_id) || { id: i.socio_id, nombre: 'Chaval', apellidos: '', nivel: '' })
  const candidatos = socios.filter(s => activoSocio(s) && !dentro.has(s.id) && (!plan.niveles.length || plan.niveles.includes(s.nivel)))
  const rojo = plan.limite != null && inscritos.length > plan.limite

  const quitar = async id => {
    const { error } = await supabase.from('plan_inscritos').delete().eq('plan_id', plan.id).eq('socio_id', id)
    if (error) return setMsg(error.message)
    setMsg(''); onCambio()
  }
  const anadir = async () => {
    if (!elegido) return
    const { error } = await supabase.from('plan_inscritos').insert({ plan_id: plan.id, socio_id: elegido })
    if (error) return setMsg(error.message)
    setElegido(''); setMsg(''); onCambio()
  }
  return (
    <div className="campo ancho inscritos">
      <span>Apuntados: <b className={rojo ? 'rojo' : ''}>{cuenta(inscritos.length, plan.limite) || '0'}</b></span>
      {lista.length > 0 && (
        <div className="chips">
          {lista.map(s => (
            <span key={s.id} className="chip">{s.nombre} {s.apellidos}
              <button type="button" aria-label={`Quitar a ${s.nombre}`} onClick={() => quitar(s.id)}>×</button></span>
          ))}
        </div>
      )}
      <div className="fila">
        <select value={elegido} onChange={e => setElegido(e.target.value)} aria-label="Añadir chaval">
          <option value="">Añadir chaval…</option>
          {candidatos.map(s => <option key={s.id} value={s.id}>{s.apellidos}, {s.nombre} ({s.nivel})</option>)}
        </select>
        <button type="button" disabled={!elegido} onClick={anadir}>Apuntar</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </div>
  )
}

function Editor({ plan, asoc, niveles, todos, socios, inscritos, onVolver, onGuardado, onInscritos }) {
  const [idActual, setIdActual] = useState(plan.id || null)
  const nuevo = !idActual
  const [f, setF] = useState({
    ...VACIO, ...plan, precio: plan.precio ? String(plan.precio) : '', limite: plan.limite != null ? String(plan.limite) : '',
    descripcion: plan.descripcion || '', lugar: plan.lugar || '',
    hora_inicio: hora(plan.hora_inicio), hora_fin: hora(plan.hora_fin)
  })
  const [msg, setMsg] = useState('')
  const [borrar, setBorrar] = useState(false)
  const [furgos, setFurgos] = useState([])        // furgonetas con su disponibilidad para las fechas elegidas
  const [reservadas, setReservadas] = useState(null) // ids reservadas ahora mismo en la base de datos (al editar)
  const [elegidas, setElegidas] = useState([])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const alternar = n => set('niveles', f.niveles.includes(n) ? f.niveles.filter(x => x !== n) : [...f.niveles, n])

  // Furgonetas reservadas hasta ahora por este plan
  useEffect(() => {
    if (!plan.id) { setReservadas([]); return }
    supabase.from('plan_furgonetas').select('furgoneta_id').eq('plan_id', plan.id).then(({ data }) => {
      const ids = (data || []).map(x => x.furgoneta_id)
      setReservadas(ids); setElegidas(ids)
    })
  }, [plan.id])

  // Disponibilidad según las fechas: las ocupadas por otro plan no se pueden elegir
  useEffect(() => {
    const desde = f.fecha, hasta = f.fecha_fin || f.fecha
    if (!desde || hasta < desde) return
    let vivo = true
    supabase.rpc('furgonetas_libres', { p_desde: desde, p_hasta: hasta, p_excluir: idActual }).then(({ data }) => {
      if (!vivo) return
      setFurgos(data || [])
      setElegidas(sel => sel.filter(id => (data || []).some(x => x.id === id && !x.ocupada)))
    })
    return () => { vivo = false }
  }, [f.fecha, f.fecha_fin, idActual])

  const alternarFurgo = id => setElegidas(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))
  const plazasFurgos = furgos.filter(x => elegidas.includes(x.id)).reduce((a, x) => a + x.plazas, 0)

  const guardar = async e => {
    e.preventDefault()
    const precio = f.precio === '' ? 0 : Number(String(f.precio).replace(',', '.'))
    const limite = String(f.limite).trim() === '' ? null : Number(f.limite)
    if (!f.titulo.trim()) return setMsg('Escribe un título.')
    if (!f.fecha) return setMsg('Elige la fecha.')
    if (f.fecha_fin && f.fecha_fin < f.fecha) return setMsg('La fecha de fin no puede ser anterior al inicio.')
    if (!(precio >= 0)) return setMsg('El precio no es válido.')
    if (limite !== null && !(Number.isInteger(limite) && limite > 0)) return setMsg('El límite de plazas debe ser un número entero mayor que 0 (o déjalo vacío).')
    if (!todos && f.niveles.length === 0) return setMsg('Elige al menos un nivel.')
    const fila = {
      tipo: f.tipo, titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, lugar: f.lugar.trim() || null,
      fecha: f.fecha, fecha_fin: f.fecha_fin || f.fecha, hora_inicio: f.hora_inicio || null, hora_fin: f.hora_fin || null,
      precio, niveles: f.niveles, limite
    }
    let id = idActual
    if (nuevo) {
      const { data, error } = await supabase.from('planes').insert({ ...fila, asociacion_id: asoc }).select('id').single()
      if (error) return setMsg(error.message)
      id = data.id; setIdActual(id)
    } else {
      const { error } = await supabase.from('planes').update(fila).eq('id', id)
      if (error) return setMsg(error.message)
    }
    // Furgonetas: se quitan las que sobran y se reservan las nuevas
    if (furgos.length || (reservadas || []).length) {
      const antes = reservadas || []
      const quitar = antes.filter(x => !elegidas.includes(x))
      const poner = elegidas.filter(x => !antes.includes(x))
      if (quitar.length) {
        const { error } = await supabase.from('plan_furgonetas').delete().eq('plan_id', id).in('furgoneta_id', quitar)
        if (error) return setMsg(`El plan se ha guardado, pero no las furgonetas: ${error.message}`)
      }
      if (poner.length) {
        const { error } = await supabase.from('plan_furgonetas').insert(poner.map(furgoneta_id => ({ plan_id: id, furgoneta_id })))
        if (error) return setMsg(`El plan se ha guardado, pero no las furgonetas: ${error.message}`)
      }
      setReservadas(elegidas)
    }
    onGuardado()
  }

  const eliminar = async () => {
    const { error } = await supabase.from('planes').delete().eq('id', idActual)
    if (error) return setMsg(error.message)
    onGuardado()
  }

  // Si el plan ya tenía niveles que quien edita no puede tocar, se muestran igualmente
  const lista = [...new Set([...niveles, ...f.niveles])]
  const limiteNum = String(f.limite).trim() === '' ? null : Number(f.limite)

  return (
    <main className="actividades">
      <div className="barra">
        <h2>{nuevo ? 'Nuevo plan' : 'Editar plan'}</h2>
        <button onClick={onVolver}>Cancelar</button>
      </div>
      <form className="formgrid" onSubmit={guardar}>
        <label className="campo ancho"><span>Tipo</span>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS_ACT.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="campo ancho"><span>Título</span><input value={f.titulo} maxLength={120} onChange={e => set('titulo', e.target.value)} /></label>
        <label className="campo"><span>Fecha</span><input type="date" value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value, fecha_fin: !x.fecha_fin || x.fecha_fin < e.target.value ? e.target.value : x.fecha_fin }))} /></label>
        <label className="campo"><span>Hasta (si dura varios días)</span><input type="date" value={f.fecha_fin} min={f.fecha} onChange={e => set('fecha_fin', e.target.value)} /></label>
        <label className="campo"><span>Hora de inicio</span><input type="time" value={f.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} /></label>
        <label className="campo"><span>Hora de fin</span><input type="time" value={f.hora_fin} onChange={e => set('hora_fin', e.target.value)} /></label>
        <label className="campo"><span>Lugar</span><input value={f.lugar} maxLength={200} onChange={e => set('lugar', e.target.value)} /></label>
        <label className="campo"><span>Precio (€)</span><input inputMode="decimal" placeholder="0 = gratis" value={f.precio} onChange={e => set('precio', e.target.value)} /></label>
        <label className="campo"><span>Límite de plazas (opcional)</span>
          <input inputMode="numeric" placeholder="Sin límite" value={f.limite} onChange={e => set('limite', e.target.value.replace(/\D/g, ''))} /></label>
        <label className="campo ancho"><span>Descripción</span><textarea rows={4} value={f.descripcion} maxLength={2000} onChange={e => set('descripcion', e.target.value)} /></label>
        <div className="campo ancho">
          <span>Niveles a los que va dirigido</span>
          <div className="chips">
            {lista.map(n => (
              <button type="button" key={n} className={'chip tipo' + (f.niveles.includes(n) ? ' on' : '')} aria-pressed={f.niveles.includes(n)}
                disabled={!niveles.includes(n)} onClick={() => alternar(n)}>{n}</button>
            ))}
          </div>
          <small className="aviso">{todos ? 'Si no eliges ninguno, el plan es para todos los niveles.' : 'Solo puedes elegir entre tus niveles.'}</small>
        </div>

        {furgos.length > 0 && (
          <div className="campo ancho">
            <span>Furgonetas</span>
            <div className="chips">
              {furgos.map(x => (
                <button type="button" key={x.id} disabled={x.ocupada}
                  className={'chip tipo furgo' + (elegidas.includes(x.id) ? ' on' : '')} aria-pressed={elegidas.includes(x.id)}
                  onClick={() => alternarFurgo(x.id)}>
                  {x.nombre} · {x.plazas} pl.
                </button>
              ))}
            </div>
            {furgos.filter(x => x.ocupada).map(x => <small key={x.id} className="aviso">{x.nombre}: ocupada por «{x.ocupada_por}» esos días.</small>)}
            {elegidas.length > 0 && (
              <small className="aviso">
                {plazasFurgos} {plazasFurgos === 1 ? 'plaza' : 'plazas'} en furgonetas
                {limiteNum != null && limiteNum > plazasFurgos ? ` — el límite (${limiteNum}) es mayor.` : '.'}
              </small>
            )}
          </div>
        )}

        {!nuevo && <Inscritos plan={{ ...plan, id: idActual, niveles: f.niveles, limite: limiteNum }} socios={socios} inscritos={inscritos} onCambio={onInscritos} />}

        {msg && <p className="error ancho">{msg}</p>}
        <div className="fila ancho">
          <button className="primario" type="submit">{nuevo ? 'Crear plan' : 'Guardar'}</button>
          {!nuevo && !borrar && <button type="button" className="peligro" onClick={() => setBorrar(true)}>Eliminar</button>}
          {!nuevo && borrar && <button type="button" className="peligro" onClick={eliminar}>Sí, eliminar el plan</button>}
        </div>
      </form>
    </main>
  )
}
