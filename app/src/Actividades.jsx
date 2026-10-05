import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, inicioPeriodo, sumarPeriodos, finPeriodo, etiquetaPeriodoCorta, deIso, aIso } from './util'
import { eur } from './cuotas'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const hora = h => (h ? h.slice(0, 5) : '')
const diaLargo = iso => {
  const d = deIso(iso)
  return `${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`
}
const VACIO = { titulo: '', descripcion: '', lugar: '', fecha: '', fecha_fin: '', hora_inicio: '', hora_fin: '', precio: '', niveles: [] }

// Planes y actividades de la asociación, por semana (por defecto) o por mes.
// Las familias ven los planes de los niveles de sus hijos; el encargado y los preceptores con permiso de edición los crean.
export default function Actividades({ asoc, rol, email }) {
  const hoyIso = hoy()
  const [vista, setVista] = useState('semana')
  const [inicio, setInicio] = useState(inicioPeriodo(hoyIso, 'semanal'))
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

  const mover = n => setInicio(sumarPeriodos(inicio, per, n))
  const cambiarVista = v => { setVista(v); setInicio(inicioPeriodo(hoyIso, v === 'semana' ? 'semanal' : 'mensual')) }

  if (editando) return <Editor plan={editando} asoc={asoc} niveles={nivelesPosibles} todos={todosNiveles}
    onVolver={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />

  // Un plan de varios días aparece en todos los días que abarca dentro del periodo
  const enPeriodo = (planes || []).filter(p => p.fecha <= hasta && p.fecha_fin >= desde)
  const delDia = iso => enPeriodo.filter(p => p.fecha <= iso && p.fecha_fin >= iso)

  const dias = []
  for (let d = deIso(desde); aIso(d) <= hasta; d.setDate(d.getDate() + 1)) dias.push(aIso(d))
  const esActual = inicio === inicioPeriodo(hoyIso, per)

  return (
    <main className="actividades">
      <div className="barra">
        <h2>Actividades</h2>
        {puedeCrear && <button className="primario" onClick={() => setEditando({ ...VACIO, fecha: hoyIso, fecha_fin: hoyIso })}>+ Nuevo plan</button>}
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
          {!esActual && <button className="mini" onClick={() => setInicio(inicioPeriodo(hoyIso, per))}>Hoy</button>}
        </div>
      </div>

      {planes === null && <p>Cargando…</p>}

      {planes && vista === 'mes' && (
        <div className="mes-rejilla" role="grid" aria-label="Calendario del mes">
          {DIAS_CORTOS.map(d => <span key={d} className="cab" aria-hidden="true">{d}</span>)}
          {Array.from({ length: (deIso(desde).getDay() + 6) % 7 }, (_, i) => <span key={'v' + i} />)}
          {dias.map(iso => {
            const n = delDia(iso).length
            return (
              <span key={iso} className={'dia' + (iso === hoyIso ? ' hoy' : '') + (n ? ' con' : '')} title={n ? `${n} plan(es)` : undefined}>
                {Number(iso.slice(8))}{n > 0 && <i aria-label={`${n} planes`} />}
              </span>
            )
          })}
        </div>
      )}

      {planes && (vista === 'semana' ? dias : [...new Set(enPeriodo.flatMap(p => dias.filter(d => p.fecha <= d && p.fecha_fin >= d)))].sort()).map(iso => {
        const lista = delDia(iso)
        return (
          <section key={iso} className={'dia-bloque' + (iso === hoyIso ? ' hoy' : '')}>
            <h3>{diaLargo(iso)}{iso === hoyIso && <span className="badge ok">Hoy</span>}</h3>
            {lista.length === 0 && <p className="aviso vacio-dia">Sin planes</p>}
            {lista.map(p => <Plan key={p.id} p={p} editable={puedeEditar(p)} onEditar={() => setEditando(p)} />)}
          </section>
        )
      })}
      {planes && vista === 'mes' && enPeriodo.length === 0 && <p className="aviso">No hay planes este mes.</p>}
    </main>
  )
}

function Plan({ p, editable, onEditar }) {
  const multi = p.fecha_fin > p.fecha
  return (
    <article className="plan">
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
        {p.niveles.length === 0 ? <span className="chip">Todos los niveles</span> : p.niveles.map(n => <span key={n} className="chip">{n}</span>)}
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
      titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, lugar: f.lugar.trim() || null,
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
        <h2>{nuevo ? 'Nuevo plan' : 'Editar plan'}</h2>
        <button onClick={onVolver}>Cancelar</button>
      </div>
      <form className="formgrid" onSubmit={guardar}>
        <label className="campo ancho"><span>Título</span><input value={f.titulo} maxLength={120} onChange={e => set('titulo', e.target.value)} /></label>
        <label className="campo"><span>Fecha</span><input type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label className="campo"><span>Hasta (si dura varios días)</span><input type="date" value={f.fecha_fin} min={f.fecha} onChange={e => set('fecha_fin', e.target.value)} /></label>
        <label className="campo"><span>Hora de inicio</span><input type="time" value={f.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} /></label>
        <label className="campo"><span>Hora de fin</span><input type="time" value={f.hora_fin} onChange={e => set('hora_fin', e.target.value)} /></label>
        <label className="campo"><span>Lugar</span><input value={f.lugar} maxLength={200} onChange={e => set('lugar', e.target.value)} /></label>
        <label className="campo"><span>Precio del plan (€)</span><input inputMode="decimal" placeholder="0 = gratis" value={f.precio} onChange={e => set('precio', e.target.value)} /></label>
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
