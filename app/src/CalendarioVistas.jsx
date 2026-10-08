import { useEffect, useRef, useState } from 'react'
import { NIVELES, deIso } from './util'
import { colorNivel, colorPlan, fondoPlan, COLOR_TODOS, GRUPOS_NIVEL } from './coloresNivel'

const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const ALTO_MIN = 14, ALTO_MAX = 80, ALTO_DEF = 26   // píxeles por hora (se ajusta pellizcando con dos dedos)
const leerAlto = () => { try { const v = Number(localStorage.getItem('cal-alto')); return v >= ALTO_MIN && v <= ALTO_MAX ? v : ALTO_DEF } catch { return ALTO_DEF } }
const aMin = h => { const [a, b] = h.slice(0, 5).split(':').map(Number); return a * 60 + b }

// Menú (tres barritas): cambiar de vista y elegir qué calendarios se ven (por nivel, Club o Sr)
// «niveles» = null significa todos los niveles; si no, la lista de niveles elegidos. «generales» = planes para todos los niveles.
export function MenuCalendario({ vista, onVista, niveles, generales, onNiveles, onGenerales, misNiveles, opciones }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    const tecla = e => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const efectivos = niveles ?? opciones
  const marcado = n => efectivos.includes(n)
  const alternar = n => onNiveles(marcado(n) ? efectivos.filter(x => x !== n) : [...efectivos, n])
  const grupo = lista => {
    const l = lista.filter(n => opciones.includes(n))
    const todos = l.length > 0 && l.every(marcado)
    onNiveles(todos ? efectivos.filter(n => !l.includes(n)) : [...new Set([...efectivos, ...l])])
  }

  return (
    <div className="menu-cal" ref={ref}>
      <button className="hamb" aria-label="Menú del calendario" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
        <span /><span /><span />
      </button>
      {abierto && (
        <div className="menu-cal-panel" role="dialog" aria-label="Opciones del calendario">
          <div className="seg-mini" role="group" aria-label="Vista">
            <button className={vista === 'semana' ? 'on' : ''} aria-pressed={vista === 'semana'} onClick={() => { onVista('semana'); setAbierto(false) }}>Semana</button>
            <button className={vista === 'mes' ? 'on' : ''} aria-pressed={vista === 'mes'} onClick={() => { onVista('mes'); setAbierto(false) }}>Mes</button>
          </div>
          <p className="menu-tit">Calendarios</p>
          <div className="menu-rapidos">
            {misNiveles.length > 0 && <button className="mini" onClick={() => onNiveles(misNiveles)}>Mis niveles</button>}
            {GRUPOS_NIVEL.map(([nombre, rango, lista]) => (
              <button key={nombre} className="mini" onClick={() => grupo(lista)} title={rango}>{nombre} <small>{rango}</small></button>
            ))}
            <button className="mini" onClick={() => onNiveles(null)}>Todos</button>
          </div>
          <ul className="menu-niveles">
            <li><label><input type="checkbox" checked={generales} onChange={e => onGenerales(e.target.checked)} />
              <i style={{ background: COLOR_TODOS }} />Para todos los niveles</label></li>
            {opciones.map(n => (
              <li key={n}><label><input type="checkbox" checked={marcado(n)} onChange={() => alternar(n)} />
                <i style={{ background: colorNivel(n) }} />{n}</label></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Reparte en carriles los planes con hora que se solapan en un mismo día (como Google Calendar)
function carriles(lista) {
  const orden = [...lista].sort((a, b) => a.ini - b.ini || b.fin - a.fin)
  const grupos = []
  let actual = null
  for (const e of orden) {
    if (!actual || e.ini >= actual.fin) { actual = { fin: e.fin, items: [] }; grupos.push(actual) }
    actual.fin = Math.max(actual.fin, e.fin); actual.items.push(e)
  }
  for (const g of grupos) {
    const fines = []
    for (const e of g.items) {
      let c = fines.findIndex(f => f <= e.ini)
      if (c < 0) { c = fines.length; fines.push(0) }
      fines[c] = e.fin; e.carril = c
    }
    g.items.forEach(e => { e.carriles = fines.length })
  }
  return orden
}

// Semana como en Google Calendar: columna fina con las horas a la izquierda, siete días, franja superior para planes sin hora o de varios días
export function SemanaHoras({ dias, delDia, sel, hoyIso, onDia, onPlan, cuentaDe }) {
  const [ALTO_H, setAlto] = useState(leerAlto)
  const caja = useRef(null)
  const altoRef = useRef(ALTO_H); altoRef.current = ALTO_H
  // Pellizcar con dos dedos (o Ctrl + rueda) para comprimir o extender la altura de las horas
  useEffect(() => {
    const el = caja.current; if (!el) return
    let base = null
    const fijar = v => { const a = Math.round(Math.min(ALTO_MAX, Math.max(ALTO_MIN, v))); setAlto(a); try { localStorage.setItem('cal-alto', String(a)) } catch { /* sin almacenamiento */ } }
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const ini = e => { base = e.touches.length === 2 ? { d: dist(e.touches), a: altoRef.current } : null }
    const mov = e => { if (e.touches.length === 2 && base) { e.preventDefault(); fijar(base.a * dist(e.touches) / base.d) } }
    const fin = () => { base = null }
    const rueda = e => { if (e.ctrlKey) { e.preventDefault(); fijar(altoRef.current * (e.deltaY < 0 ? 1.1 : 0.9)) } }
    el.addEventListener('touchstart', ini, { passive: true }); el.addEventListener('touchmove', mov, { passive: false })
    el.addEventListener('touchend', fin); el.addEventListener('wheel', rueda, { passive: false })
    return () => { el.removeEventListener('touchstart', ini); el.removeEventListener('touchmove', mov); el.removeEventListener('touchend', fin); el.removeEventListener('wheel', rueda) }
  }, [])
  const conHora = p => p.hora_inicio && p.fecha === p.fecha_fin
  const todos = dias.flatMap(delDia)
  const horas = todos.filter(conHora)
  let h0 = 8, h1 = 22
  for (const p of horas) {
    h0 = Math.min(h0, Math.floor(aMin(p.hora_inicio) / 60))
    h1 = Math.max(h1, Math.ceil((p.hora_fin ? Math.max(aMin(p.hora_fin), aMin(p.hora_inicio) + 30) : aMin(p.hora_inicio) + 60) / 60))
  }
  h1 = Math.min(24, h1)
  const filas = Array.from({ length: h1 - h0 }, (_, i) => h0 + i)
  const ahora = new Date()
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()

  return (
    <div className="semana-g" ref={caja} role="grid" aria-label="Calendario de la semana">
      <div className="sg-cab">
        <span className="sg-esq" />
        {dias.map(iso => {
          const d = deIso(iso)
          return (
            <button key={iso} className={'sg-dia' + (iso === hoyIso ? ' hoy' : '') + (iso === sel ? ' sel' : '')} onClick={() => onDia(iso)} aria-label={iso}>
              <small>{DIAS_CORTOS[(d.getDay() + 6) % 7]}</small><b>{d.getDate()}</b>
            </button>
          )
        })}
      </div>

      <div className="sg-todo">
        <span className="sg-esq"><small>día</small></span>
        {dias.map(iso => (
          <div key={iso} className={'sg-todo-col' + (iso === sel ? ' sel' : '')} onClick={() => onDia(iso)}>
            {delDia(iso).filter(p => !conHora(p)).map(p => (
              <button key={p.id} className="sg-ev todo" style={{ background: fondoPlan(p), borderColor: colorPlan(p) }}
                onClick={e => { e.stopPropagation(); onDia(iso); onPlan(p) }}>
                <span>{p.titulo}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="sg-cuerpo" style={{ height: filas.length * ALTO_H }}>
        <div className="sg-horas">
          {filas.map(h => <span key={h} style={{ top: (h - h0) * ALTO_H }}>{h}</span>)}
        </div>
        {dias.map(iso => {
          const items = carriles(delDia(iso).filter(conHora).map(p => {
            const ini = aMin(p.hora_inicio)
            return { p, ini, fin: Math.max(p.hora_fin ? aMin(p.hora_fin) : ini + 60, ini + 30) }
          }))
          return (
            <div key={iso} className={'sg-col' + (iso === sel ? ' sel' : '')} onClick={() => onDia(iso)}
              style={{ backgroundSize: `100% ${ALTO_H}px` }}>
              {iso === hoyIso && minAhora >= h0 * 60 && minAhora <= h1 * 60 && <i className="sg-ahora" style={{ top: ((minAhora - h0 * 60) / 60) * ALTO_H }} />}
              {items.map(({ p, ini, fin, carril, carriles: n }) => {
                const c = cuentaDe(p)
                return (
                  <button key={p.id} className="sg-ev" aria-label={p.titulo}
                    style={{ top: ((ini - h0 * 60) / 60) * ALTO_H, height: Math.max(((fin - ini) / 60) * ALTO_H - 1, 16),
                      left: `${(carril / n) * 100}%`, width: `${100 / n}%`, background: fondoPlan(p), borderColor: colorPlan(p) }}
                    onClick={e => { e.stopPropagation(); onDia(iso); onPlan(p) }}>
                    <span>{p.titulo}</span>
                    {c && <b className={c.rojo ? 'rojo' : ''}>{c.texto}</b>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
