import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fecha } from './util'
import { conceptoDe, etiquetaCategoria, eurSigno, claseSaldo } from './huchaUtil'

// Saldo y movimientos de un socio. Solo lectura, salvo que se pase `onBorrar` (equipo: borrar un apunte manual).
export function HuchaHistorial({ socioId, version = 0, onBorrar, seccion = false }) {
  const [filas, setFilas] = useState(null)
  const [saldo, setSaldo] = useState(null)

  const cargar = useCallback(async () => {
    const [h, s] = await Promise.all([supabase.rpc('hucha_historial', { p_socio: socioId }), supabase.rpc('hucha_saldos')])
    setFilas(h.data || [])
    setSaldo((s.data || []).find(x => x.socio_id === socioId)?.saldo ?? null)
  }, [socioId])
  useEffect(() => { cargar() }, [cargar, version])

  if (filas === null) return <p>Cargando…</p>
  if (saldo === null) return null   // «Dineros» no está activa o no tienes acceso
  const Marco = seccion ? ({ children }) => <section><h2>Hucha</h2>{children}</section> : ({ children }) => <>{children}</>
  return (
    <Marco>
      <p className="hucha-saldo">Saldo <b className={claseSaldo(saldo)}>{eurSigno(saldo, false)}</b></p>
      <p className="nota">{saldo < 0 ? 'Negativo: el socio debe esa cantidad.' : saldo > 0 ? 'Positivo: dinero a favor para próximas actividades.' : 'Sin saldo pendiente.'}</p>
      {filas.length === 0
        ? <p className="aviso">Todavía no hay movimientos.</p>
        : <ul className="hucha-lista">
          {filas.map((m, i) => (
            <li key={m.id || `${m.fecha}-${i}`}>
              <span><b>{conceptoDe(m)}</b><small>{fecha(m.fecha)} · {etiquetaCategoria(m.categoria)}</small></span>
              <span className={'hucha-importe ' + claseSaldo(m.importe)}>{eurSigno(m.importe)}</span>
              {onBorrar && m.origen === 'manual' && <button className="chip-x" title="Borrar apunte" aria-label="Borrar apunte" onClick={async () => { await onBorrar(m); cargar() }}>×</button>}
            </li>
          ))}
        </ul>}
    </Marco>
  )
}

// Para el inicio de las familias: saldo por hijo (vacío si no hay acceso)
export async function saldosHucha() {
  const { data } = await supabase.rpc('hucha_saldos')
  return Object.fromEntries((data || []).map(x => [x.socio_id, Number(x.saldo)]))
}
