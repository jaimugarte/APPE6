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

const CLAVE_VISTOS = 'familia-planes-vistos'
const leerVistos = () => { try { const v = JSON.parse(localStorage.getItem(CLAVE_VISTOS)); return Array.isArray(v) ? v : null } catch { return null } }
const guardarVistos = l => { try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify(l.slice(-300))) } catch { /* sin almacenamiento */ } }

// Aviso flotante cuando se crea un plan nuevo para el nivel de un hijo (o para todos). Al tocarlo lleva al plan en el calendario.
// Sin servidor de notificaciones: se comprueba al abrir la app, al volver a ella y cada minuto mientras está abierta.
export function AvisoPlanes({ activo, onAbrir }) {
  const [nuevos, setNuevos] = useState([])
  const comprobar = useCallback(async () => {
    const { data } = await supabase.from('planes').select('id, titulo, fecha, fecha_fin, creado_en, notificar').gte('fecha_fin', hoy()).order('creado_en', { ascending: false })
    const planes = (data || []).filter(p => p.notificar !== false)   // solo los que lanzan aviso emergente
    let vistos = leerVistos()
    if (vistos === null) {   // primera vez en este dispositivo: solo se avisa de lo creado en los últimos 3 días
      const lim = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)
      const recientes = planes.filter(p => String(p.creado_en || '') >= lim)
      vistos = planes.filter(p => !recientes.includes(p)).map(p => p.id)
      guardarVistos(vistos)
    }
    setNuevos(planes.filter(p => !vistos.includes(p.id)))
  }, [])
  useEffect(() => {
    if (!activo) return
    comprobar()
    const t = setInterval(comprobar, 60000)
    const vis = () => { if (document.visibilityState === 'visible') comprobar() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [activo, comprobar])

  if (!activo || !nuevos.length) return null
  const descartar = () => { guardarVistos([...(leerVistos() || []), ...nuevos.map(p => p.id)]); setNuevos([]) }
  const p = nuevos[0]
  return (
    <div className="toast-plan" role="status" aria-live="polite">
      <button className="toast-cuerpo" onClick={() => { descartar(); onAbrir(p) }}>
        <span className="toast-ico" aria-hidden="true">🔔</span>
        <span>
          <b>{nuevos.length === 1 ? 'Nuevo plan' : `${nuevos.length} planes nuevos`}</b>
          <small>{p.titulo} · {fechaCorta(p.fecha)}{nuevos.length > 1 ? ` y ${nuevos.length - 1} más` : ''}</small>
        </span>
      </button>
      <button className="toast-x" aria-label="Cerrar aviso" onClick={descartar}>×</button>
    </div>
  )
}
