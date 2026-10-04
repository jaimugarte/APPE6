import { useEffect, useState } from 'react'
import { inicioPeriodo, sumarPeriodos, aIso, deIso } from './util'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// Calendario emergente para elegir el periodo según la periodicidad de la actividad:
// semanas (se toca la fila), meses, trimestres o años. No permite periodos futuros.
export default function SelectorPeriodo({ inicio, per, hoyIso, onElegir, onCerrar }) {
  const actual = inicioPeriodo(hoyIso, per)
  const dSel = deIso(inicio)
  const [anio, setAnio] = useState(dSel.getFullYear())
  const [mes, setMes] = useState(dSel.getMonth())
  const hoyD = deIso(hoyIso)

  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onCerrar])

  const elegir = i => { onElegir(i); onCerrar() }

  let titulo, hayAnterior = true, hayPosterior, ant, sig, cuerpo
  if (per === 'semanal') {
    titulo = `${MESES_LARGO[mes]} ${anio}`
    hayPosterior = anio < hoyD.getFullYear() || (anio === hoyD.getFullYear() && mes < hoyD.getMonth())
    const mover = n => { const d = new Date(anio, mes + n, 1); setAnio(d.getFullYear()); setMes(d.getMonth()) }
    ant = () => mover(-1); sig = () => mover(1)
    const filas = []
    let lunes = deIso(inicioPeriodo(aIso(new Date(anio, mes, 1)), 'semanal'))
    const ultimo = new Date(anio, mes + 1, 0)
    while (lunes <= ultimo) {
      filas.push(aIso(lunes))
      lunes = deIso(sumarPeriodos(aIso(lunes), 'semanal', 1))
    }
    cuerpo = (
      <div className="cal-semanas" role="grid">
        <div className="cal-cab" aria-hidden="true">{DIAS.map(d => <span key={d}>{d}</span>)}</div>
        {filas.map(ini => {
          const d0 = deIso(ini)
          const dias = Array.from({ length: 7 }, (_, i) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i))
          const fut = ini > actual
          return (
            <button key={ini} className={'cal-fila' + (ini === inicio ? ' on' : '') + (ini === actual ? ' actual' : '')}
              disabled={fut} aria-pressed={ini === inicio} aria-label={`Semana del ${dias[0].getDate()} de ${MESES_LARGO[dias[0].getMonth()]}`}
              onClick={() => elegir(ini)}>
              {dias.map(d => <span key={+d} className={d.getMonth() === mes ? '' : 'otro'}>{d.getDate()}</span>)}
            </button>
          )
        })}
      </div>
    )
  } else if (per === 'mensual' || per === 'trimestral') {
    titulo = String(anio)
    hayPosterior = anio < hoyD.getFullYear()
    ant = () => setAnio(a => a - 1); sig = () => setAnio(a => a + 1)
    const trim = per === 'trimestral'
    const n = trim ? 4 : 12
    cuerpo = (
      <div className={'cal-rejilla' + (trim ? ' trim' : '')}>
        {Array.from({ length: n }, (_, i) => {
          const ini = aIso(new Date(anio, trim ? i * 3 : i, 1))
          return (
            <button key={ini} className={ini === inicio ? 'on' : ini === actual ? 'actual' : ''} disabled={ini > actual}
              aria-pressed={ini === inicio} onClick={() => elegir(ini)}>
              {trim ? <><b>T{i + 1}</b><small>{MESES[i * 3]}–{MESES[i * 3 + 2]}</small></> : MESES[i]}
            </button>
          )
        })}
      </div>
    )
  } else {
    const base = anio - (anio % 12)
    titulo = `${base} – ${base + 11}`
    hayPosterior = base + 12 <= hoyD.getFullYear()
    ant = () => setAnio(base - 12); sig = () => setAnio(base + 12)
    cuerpo = (
      <div className="cal-rejilla">
        {Array.from({ length: 12 }, (_, i) => {
          const ini = `${base + i}-01-01`
          return (
            <button key={ini} className={ini === inicio ? 'on' : ini === actual ? 'actual' : ''} disabled={ini > actual}
              aria-pressed={ini === inicio} onClick={() => elegir(ini)}>{base + i}</button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div className="cal-fondo" onClick={onCerrar} />
      <div className="calendario" role="dialog" aria-label="Elegir periodo">
        <div className="cal-nav">
          <button aria-label="Anterior" disabled={!hayAnterior} onClick={ant}>‹</button>
          <b>{titulo}</b>
          <button aria-label="Siguiente" disabled={!hayPosterior} onClick={sig}>›</button>
        </div>
        {cuerpo}
        <button className="cal-hoy" disabled={inicio === actual} onClick={() => elegir(actual)}>Periodo actual</button>
      </div>
    </>
  )
}
