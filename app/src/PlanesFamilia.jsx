import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hoy } from './util'
import { fechaCorta } from './familiaResumen'
import { colorPlan } from './coloresNivel'

const activoHijo = h => !!h.no_socio || !!h.periodos_alta?.some(p => !p.fecha_baja)

// Datos de la familia para apuntar a sus hijos a los planes: hijos activos, a quién ya se ha apuntado y cuánta gente hay en cada plan
export function useApuntes(activo = true) {
  const [d, setD] = useState({ hijos: [], inscr: new Set(), aforo: {}, listo: false })
  const recargar = useCallback(async () => {
    if (!activo) return
    const [s, i, a] = await Promise.all([
      supabase.from('socios').select('id, nombre, apellidos, nivel, no_socio, periodos_alta(fecha_baja)').order('nombre'),
      supabase.rpc('mis_inscripciones'),
      supabase.rpc('planes_aforo')
    ])
    setD({
      hijos: (s.data || []).filter(activoHijo),
      inscr: new Set((i.data || []).map(x => `${x.plan_id}:${x.socio_id}`)),
      aforo: Object.fromEntries((a.data || []).map(x => [x.plan_id, Number(x.apuntados)])),
      listo: true
    })
  }, [activo])
  useEffect(() => { recargar() }, [recargar])
  return { ...d, recargar }
}

// Hijos a los que se puede apuntar a un plan (activos, de un nivel al que va dirigido)
export const hijosElegibles = (plan, hijos) => hijos.filter(h => !plan.niveles?.length || plan.niveles.includes(h.nivel))

// «Plazas: 10/20» o «Quedan 3 plazas»; null si el plan no tiene límite
export function Plazas({ plan, apuntados }) {
  if (plan.limite == null) return null
  const quedan = plan.limite - (apuntados || 0)
  return <span className={'chip plazas' + (quedan <= 0 ? ' llena' : '')}>{quedan <= 0 ? 'Completo' : `Quedan ${quedan} ${quedan === 1 ? 'plaza' : 'plazas'}`}</span>
}

// Botones para apuntar o quitar a cada hijo elegible
export function ApuntarHijos({ plan, datos }) {
  const { hijos, inscr, aforo, recargar } = datos
  const [ocupado, setOcupado] = useState('')
  const [msg, setMsg] = useState('')
  const pasado = plan.fecha_fin < hoy()
  const lista = hijosElegibles(plan, hijos)
  if (pasado || !lista.length) return null
  const llena = plan.limite != null && (aforo[plan.id] || 0) >= plan.limite

  const cambiar = async (h, apuntar) => {
    setOcupado(h.id); setMsg('')
    const { error } = await supabase.rpc('apuntar_hijo', { p_plan: plan.id, p_socio: h.id, p_apuntar: apuntar })
    setOcupado('')
    if (error) setMsg(error.message)
    recargar()
  }

  return (
    <div className="apuntar">
      {lista.map(h => {
        const dentro = inscr.has(`${plan.id}:${h.id}`)
        return (
          <div key={h.id} className="apuntar-fila">
            <span>{h.nombre}{dentro && <b className="apuntado"> · apuntado ✓</b>}</span>
            {dentro
              ? <button className="mini" disabled={ocupado === h.id} onClick={() => cambiar(h, false)}>Quitar</button>
              : <button className="mini primario" disabled={ocupado === h.id || llena} onClick={() => cambiar(h, true)}>{llena ? 'Completo' : 'Apuntar'}</button>}
          </div>
        )
      })}
      {msg && <p className="error">{msg}</p>}
    </div>
  )
}

// Aviso en el inicio de la familia: planes próximos a los que aún se puede apuntar a algún hijo (los creados hace poco, destacados)
export function PlanesNuevos({ activo, version }) {
  const datos = useApuntes(activo)
  const [planes, setPlanes] = useState(null)
  const [ids, setIds] = useState(null)   // los planes pendientes al abrir: no desaparecen al apuntar, para ver el «apuntado ✓»
  useEffect(() => {
    if (!activo) return
    supabase.from('planes').select('*').gte('fecha_fin', hoy()).order('fecha').then(({ data }) => { setPlanes(data || []); setIds(null) })
  }, [activo, version])
  useEffect(() => {
    if (ids !== null || !planes || !datos.listo) return
    setIds(planes.filter(p => hijosElegibles(p, datos.hijos).some(h => !datos.inscr.has(`${p.id}:${h.id}`))).slice(0, 4).map(p => p.id))
  }, [ids, planes, datos])
  if (!activo || !planes || !ids) return null
  const reciente = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
  const pendientes = ids.map(id => planes.find(p => p.id === id)).filter(Boolean)
  if (!pendientes.length) return null
  return (
    <section className="avisos-planes" aria-label="Planes para apuntar a tus hijos">
      <h2>Planes para apuntar</h2>
      {pendientes.map(p => (
        <article key={p.id} className="plan aviso-plan" style={{ '--c': colorPlan(p) }}>
          <div className="plan-cab">
            <b>{p.titulo}</b>
            {(p.creado_en || '') >= reciente && <span className="badge nuevo">Nuevo</span>}
          </div>
          <small className="meta">
            <span>{fechaCorta(p.fecha)}{p.fecha_fin > p.fecha ? ` – ${fechaCorta(p.fecha_fin)}` : ''}</span>
            {p.lugar && <span>{p.lugar}</span>}
            <Plazas plan={p} apuntados={datos.aforo[p.id]} />
          </small>
          <ApuntarHijos plan={p} datos={datos} />
        </article>
      ))}
    </section>
  )
}
