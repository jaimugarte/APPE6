import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hoy } from './util'
import { fechaCorta } from './familiaResumen'

const VACIA = { nombre: '', matricula: '', plazas: '' }

// Furgonetas de la asociación (solo las gestiona el encargado). Las reservas se hacen al crear un plan.
export default function Furgonetas({ asoc, rol }) {
  const [lista, setLista] = useState(null)
  const [reservas, setReservas] = useState([])
  const [editando, setEditando] = useState(null)   // null | 'nueva' | id
  const [f, setF] = useState(VACIA)
  const [borrar, setBorrar] = useState('')
  const [msg, setMsg] = useState('')
  const encargado = rol === 'encargado'

  const cargar = useCallback(async () => {
    const [a, pf, pl] = await Promise.all([
      supabase.from('furgonetas').select('*').order('nombre'),
      supabase.from('plan_furgonetas').select('plan_id, furgoneta_id'),
      supabase.from('planes').select('id, titulo, fecha, fecha_fin').gte('fecha_fin', hoy()).order('fecha')
    ])
    setMsg(a.error?.message || '')
    setLista(a.data || [])
    const planes = pl.data || []
    setReservas((pf.data || []).map(r => ({ ...r, plan: planes.find(p => p.id === r.plan_id) })).filter(r => r.plan))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const abrir = x => { setEditando(x ? x.id : 'nueva'); setBorrar(''); setMsg(''); setF(x ? { nombre: x.nombre, matricula: x.matricula || '', plazas: String(x.plazas) } : VACIA) }

  const guardar = async e => {
    e.preventDefault()
    const plazas = Number(f.plazas)
    if (!f.nombre.trim()) return setMsg('Pon un nombre a la furgoneta.')
    if (!(Number.isInteger(plazas) && plazas > 0)) return setMsg('Indica el número de plazas (un entero mayor que 0).')
    const fila = { nombre: f.nombre.trim(), matricula: f.matricula.trim() || null, plazas }
    const { error } = editando === 'nueva'
      ? await supabase.from('furgonetas').insert({ ...fila, asociacion_id: asoc })
      : await supabase.from('furgonetas').update(fila).eq('id', editando)
    if (error) return setMsg(error.message)
    setEditando(null); setMsg(''); cargar()
  }
  const activar = async x => {
    const { error } = await supabase.from('furgonetas').update({ activa: !x.activa }).eq('id', x.id)
    if (error) return setMsg(error.message)
    cargar()
  }
  const eliminar = async id => {
    const { error } = await supabase.from('furgonetas').delete().eq('id', id)
    if (error) return setMsg(error.message)
    setBorrar(''); setEditando(null); cargar()
  }

  return (
    <main className="furgonetas">
      <div className="barra">
        <h2>Furgonetas</h2>
        {encargado && editando === null && <button className="primario" onClick={() => abrir(null)}>+ Nueva furgoneta</button>}
      </div>
      {msg && <p className="error">{msg}</p>}
      {lista === null && <p>Cargando…</p>}
      {lista && lista.length === 0 && editando === null && <p className="aviso">Todavía no hay furgonetas. Añade la primera para poder reservarla en los planes.</p>}

      {editando !== null && (
        <form className="formgrid tarjeta-form" onSubmit={guardar}>
          <label className="campo ancho"><span>Nombre</span><input value={f.nombre} maxLength={60} placeholder="Furgoneta blanca" onChange={e => setF({ ...f, nombre: e.target.value })} /></label>
          <label className="campo"><span>Matrícula (opcional)</span><input value={f.matricula} maxLength={20} onChange={e => setF({ ...f, matricula: e.target.value })} /></label>
          <label className="campo"><span>Plazas</span><input inputMode="numeric" value={f.plazas} onChange={e => setF({ ...f, plazas: e.target.value.replace(/\D/g, '') })} /></label>
          <div className="fila ancho">
            <button className="primario" type="submit">Guardar</button>
            <button type="button" onClick={() => { setEditando(null); setMsg('') }}>Cancelar</button>
            {editando !== 'nueva' && borrar !== editando && <button type="button" className="peligro" onClick={() => setBorrar(editando)}>Eliminar</button>}
            {editando !== 'nueva' && borrar === editando && <button type="button" className="peligro" onClick={() => eliminar(editando)}>Sí, eliminar (se quitan sus reservas)</button>}
          </div>
        </form>
      )}

      {lista && lista.map(x => {
        const rs = reservas.filter(r => r.furgoneta_id === x.id)
        return (
          <article key={x.id} className={'plan furgo-card' + (x.activa ? '' : ' inactiva')}>
            <div className="plan-cab">
              <b>{x.nombre}</b>
              <span className="chip">{x.plazas} plazas</span>
            </div>
            <small className="meta">{x.matricula && <span>{x.matricula}</span>}{!x.activa && <span>Desactivada</span>}</small>
            {rs.length > 0
              ? <ul className="reservas">{rs.map(r => (
                <li key={r.plan_id}>{fechaCorta(r.plan.fecha)}{r.plan.fecha_fin > r.plan.fecha ? ` – ${fechaCorta(r.plan.fecha_fin)}` : ''} · {r.plan.titulo}</li>))}</ul>
              : <small className="aviso">Sin reservas próximas.</small>}
            {encargado && editando === null && (
              <div className="fila">
                <button onClick={() => abrir(x)}>Editar</button>
                <button onClick={() => activar(x)}>{x.activa ? 'Desactivar' : 'Activar'}</button>
              </div>
            )}
          </article>
        )
      })}
    </main>
  )
}
