import { useEffect, useRef, useState } from 'react'
import { abrev } from './util'

// Fila de actividades en una sola línea. Si no caben, se desliza con el dedo (sin barra visible);
// un degradado en el borde avisa de que hay más y la activa siempre queda a la vista.
export default function ChipsActividades({ tipos, tipoId, onElegir }) {
  const ref = useRef(null)
  const [mas, setMas] = useState({ izq: false, der: false })

  const medir = () => {
    const e = ref.current
    if (!e) return
    setMas({ izq: e.scrollLeft > 2, der: e.scrollLeft + e.clientWidth < e.scrollWidth - 2 })
  }

  useEffect(() => {
    medir()
    const e = ref.current
    if (!e || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(e)
    return () => ro.disconnect()
  }, [tipos])

  useEffect(() => {
    ref.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [tipoId])

  return (
    <div className={'chips-w' + (mas.izq ? ' mas-izq' : '') + (mas.der ? ' mas-der' : '')}>
      <div className="chips tipos una-linea" ref={ref} onScroll={medir}>
        {tipos.map(t => (
          <button key={t.id} className={'chip tipo' + (t.id === tipoId ? ' on' : '')} title={t.nombre}
            aria-label={`${t.nombre}, ${t.periodicidad}`} aria-pressed={t.id === tipoId} onClick={() => onElegir(t)}>
            {abrev(t)}
          </button>
        ))}
      </div>
    </div>
  )
}
