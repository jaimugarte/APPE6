import { useEffect, useRef } from 'react'
import { echarts } from './echarts'

// Envoltorio mínimo: crea el gráfico una vez, lo redimensiona con su contenedor y lo destruye al salir.
export default function Grafico({ option, alto = 260, etiqueta }) {
  const ref = useRef(null)
  const chart = useRef(null)

  useEffect(() => {
    chart.current = echarts.init(ref.current, null, { renderer: 'canvas' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); chart.current?.dispose(); chart.current = null }
  }, [])

  useEffect(() => { chart.current?.setOption(option, true) }, [option])

  return <div ref={ref} style={{ height: alto, width: '100%' }} role="img" aria-label={etiqueta} />
}
