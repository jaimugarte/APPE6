import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, fecha } from './util'
import { eur } from './cuotas'
import { etiquetaTipo } from './tiposActividad'
import { colorNivel, colorPlan, ordenarNiveles, COLOR_TODOS } from './coloresNivel'
import { useApuntes, ApuntarHijos, Plazas } from './PlanesFamilia'
import { fechaCorta } from './familiaResumen'
import { seccionesTablon } from './tablonUtil'

const hora = h => (h ? h.slice(0, 5) : '')
const VACIO = { titulo: '', texto: '', niveles: [], caduca: '' }

// Tablón: anuncios del club y de cada nivel, más las actividades que se han añadido al tablón (hasta que pasan).
// Lo ve todo el mundo según sus niveles: las familias, los de sus hijos; los preceptores, los suyos; el encargado, todo.
// Publica quien puede crear actividades (encargado; preceptores con permiso, solo en sus niveles).
export default function Tablon({ asoc, rol, email, onAbrirPlan }) {
  const hoyIso = hoy()
  const familia = rol === 'familia'
  const apuntes = useApuntes(familia)
  const [anuncios, setAnuncios] = useState(null)
  const [planes, setPlanes] = useState([])
  const [aforo, setAforo] = useState({})
  const [perm, setPerm] = useState(undefined)
  const [misNiveles, setMisNiveles] = useState([])
  const [editando, setEditando] = useState(null)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(async () => {
    const [a, p, f] = await Promise.all([
      supabase.from('anuncios').select('*').order('creado_en', { ascending: false }),
      supabase.from('planes').select('*').gte('fecha_fin', hoyIso).order('fecha'),
      supabase.rpc('planes_aforo')
    ])
    setMsg(a.error?.message || p.error?.message || '')
    setAnuncios(a.data || []); setPlanes(p.data || [])
    setAforo(Object.fromEntries((f.data || []).map(x => [x.plan_id, Number(x.apuntados)])))
  }, [hoyIso])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (rol !== 'preceptor') { setPerm(null); return }
    ;(async () => {
      const [p, n] = await Promise.all([
        supabase.from('permisos_preceptor').select('*').eq('asociacion_id', asoc).eq('app_clave', 'actividades').maybeSingle(),
        supabase.from('preceptor_niveles').select('nivel').eq('asociacion_id', asoc).eq('email', email)
      ])
      setPerm(p.data || null); setMisNiveles((n.data || []).map(x => x.nivel))
    })()
  }, [asoc, rol, email])

  const todosNiveles = rol === 'encargado' || (rol === 'preceptor' && perm?.ambito === 'todos')
  const nivelesPosibles = todosNiveles ? NIVELES : misNiveles
  const puedeCrear = rol === 'encargado' || (rol === 'preceptor' && !!perm?.puede_editar && (todosNiveles || misNiveles.length > 0))
  const puedeEditar = a => puedeCrear && (todosNiveles || (a.niveles.length > 0 && a.niveles.every(n => misNiveles.includes(n))))

  if (editando) return <EditorAnuncio anuncio={editando} asoc={asoc} niveles={nivelesPosibles} todos={todosNiveles}
    onVolver={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />

  // El encargado ve todos los niveles; el preceptor, los suyos; la familia, los de sus hijos
  const permitidos = rol === 'encargado' ? null : familia ? apuntes.hijos.map(h => h.nivel) : misNiveles
  const cargando = anuncios === null || perm === undefined || (familia && !apuntes.listo)
  const secciones = cargando ? [] : seccionesTablon({ anuncios, planes, hoyIso, permitidos })

  return (
    <main className="tablon">
      <div className="barra"><h2>Tablón</h2></div>
      {msg && <p className="error">{msg}</p>}
      {cargando && <p>Cargando…</p>}
      {!cargando && secciones.length === 0 && <p className="aviso">Todavía no hay anuncios en el tablón.</p>}

      {secciones.map(s => (
        <section key={s.clave} className="tablon-sec">
          <h3><i style={{ background: s.nivel ? colorNivel(s.nivel) : COLOR_TODOS }} />{s.titulo}</h3>
          {s.items.map(i => i.tipo === 'anuncio'
            ? <Anuncio key={i.id} a={i.a} editable={puedeEditar(i.a)} onEditar={() => setEditando(i.a)} />
            : <ActividadTablon key={i.id} p={i.p} familia={familia} apuntados={familia ? apuntes.aforo[i.p.id] || 0 : aforo[i.p.id] || 0}
              datos={apuntes} onAbrir={() => onAbrirPlan?.(i.p)} />)}
        </section>
      ))}

      {puedeCrear && (
        <button className="fab" aria-label="Nuevo anuncio" title="Nuevo anuncio" onClick={() => setEditando({ ...VACIO })}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </main>
  )
}

function Anuncio({ a, editable, onEditar }) {
  const c = a.niveles.length ? colorNivel(ordenarNiveles(a.niveles)[0]) : COLOR_TODOS
  return (
    <article className="plan anuncio" style={{ '--c': c }}>
      <div className="plan-cab"><b>{a.titulo}</b><small className="meta">{fecha(String(a.creado_en).slice(0, 10))}</small></div>
      {a.texto && <p className="plan-desc anuncio-texto">{a.texto}</p>}
      <div className="chips">
        {a.niveles.length > 1 && ordenarNiveles(a.niveles).map(n => <span key={n} className="chip nv" style={{ '--c': colorNivel(n) }}>{n}</span>)}
        {a.caduca && <span className="chip">Hasta el {fecha(a.caduca)}</span>}
      </div>
      {editable && <div className="fila"><button onClick={onEditar}>Editar</button></div>}
    </article>
  )
}

function ActividadTablon({ p, familia, apuntados, datos, onAbrir }) {
  const multi = p.fecha_fin > p.fecha
  return (
    <article className="plan actividad-tablon" style={{ '--c': colorPlan(p) }}>
      <div className="plan-cab">
        <b>{p.titulo}</b>
        <span className={'precio' + (Number(p.precio) > 0 ? '' : ' gratis')}>{Number(p.precio) > 0 ? eur(p.precio) : 'Gratis'}</span>
      </div>
      <small className="meta">
        <span>{fechaCorta(p.fecha)}{multi ? ` – ${fechaCorta(p.fecha_fin)}` : ''}</span>
        {p.hora_inicio && <span>{hora(p.hora_inicio)}{p.hora_fin ? ` – ${hora(p.hora_fin)}` : ''}</span>}
        {p.lugar && <span>{p.lugar}</span>}
      </small>
      <div className="chips">
        <span className="chip tipo-act">{etiquetaTipo(p.tipo)}</span>
        <span className={'chip plazas' + (p.limite != null && apuntados > p.limite ? ' roja' : '')}>Apuntados: {p.limite != null ? `${apuntados}/${p.limite}` : apuntados}</span>
        {familia && <Plazas plan={p} apuntados={apuntados} />}
      </div>
      {p.descripcion && <p className="plan-desc">{p.descripcion}</p>}
      {familia && <ApuntarHijos plan={p} datos={datos} />}
      <div className="fila"><button className="mini" onClick={onAbrir}>Ver en el calendario</button></div>
    </article>
  )
}

function EditorAnuncio({ anuncio, asoc, niveles, todos, onVolver, onGuardado }) {
  const nuevo = !anuncio.id
  const [f, setF] = useState({ ...VACIO, ...anuncio, caduca: anuncio.caduca || '' })
  const [msg, setMsg] = useState('')
  const [borrar, setBorrar] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const alternar = n => set('niveles', f.niveles.includes(n) ? f.niveles.filter(x => x !== n) : [...f.niveles, n])
  const lista = [...new Set([...niveles, ...f.niveles])]

  const guardar = async e => {
    e.preventDefault()
    if (!f.titulo.trim()) return setMsg('Escribe un título.')
    if (!todos && f.niveles.length === 0) return setMsg('Elige al menos un nivel.')
    if (f.caduca && f.caduca < hoy()) return setMsg('La fecha de retirada ya ha pasado.')
    const fila = { titulo: f.titulo.trim(), texto: f.texto.trim(), niveles: f.niveles, caduca: f.caduca || null }
    const { error } = nuevo
      ? await supabase.from('anuncios').insert({ ...fila, asociacion_id: asoc })
      : await supabase.from('anuncios').update(fila).eq('id', anuncio.id)
    if (error) return setMsg(error.message)
    onGuardado()
  }
  const eliminar = async () => {
    const { error } = await supabase.from('anuncios').delete().eq('id', anuncio.id)
    if (error) return setMsg(error.message)
    onGuardado()
  }

  return (
    <main className="tablon">
      <div className="barra">
        <h2>{nuevo ? 'Nuevo anuncio' : 'Editar anuncio'}</h2>
        <button onClick={onVolver}>Cancelar</button>
      </div>
      <form className="formgrid" onSubmit={guardar}>
        <label className="campo ancho"><span>Título</span><input value={f.titulo} maxLength={120} onChange={e => set('titulo', e.target.value)} /></label>
        <label className="campo ancho"><span>Texto</span><textarea rows={6} value={f.texto} maxLength={4000} onChange={e => set('texto', e.target.value)} /></label>
        <div className="campo ancho">
          <span>¿Para quién?</span>
          <div className="chips">
            {lista.map(n => (
              <button type="button" key={n} className={'chip tipo' + (f.niveles.includes(n) ? ' on' : '')} aria-pressed={f.niveles.includes(n)}
                disabled={!niveles.includes(n)} onClick={() => alternar(n)}>{n}</button>
            ))}
          </div>
          <small className="aviso">{todos ? 'Si no eliges ninguno, el anuncio es para todo el club.' : 'Solo puedes elegir entre tus niveles.'}</small>
        </div>
        <label className="campo"><span>Retirar el (opcional)</span><input type="date" value={f.caduca} min={hoy()} onChange={e => set('caduca', e.target.value)} /></label>
        {msg && <p className="error ancho">{msg}</p>}
        <div className="fila ancho">
          <button className="primario" type="submit">{nuevo ? 'Publicar' : 'Guardar'}</button>
          {!nuevo && !borrar && <button type="button" className="peligro" onClick={() => setBorrar(true)}>Eliminar</button>}
          {!nuevo && borrar && <button type="button" className="peligro" onClick={eliminar}>Sí, eliminar el anuncio</button>}
        </div>
      </form>
    </main>
  )
}
