import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { IMPORTES_POR_DEFECTO } from './cuotas'

const ORDINAL = ['1.er', '2.º', '3.er', '4.º', '5.º', '6.º', '7.º', '8.º', '9.º', '10.º']

// Ajustes (encargado): criterio de cuotas por orden de hermano y si los preceptores pueden poner descuentos
export default function Cuotas({ asoc }) {
  const [importes, setImportes] = useState(IMPORTES_POR_DEFECTO.map(String))
  const [precDto, setPrecDto] = useState(false)
  const [guardado, setGuardado] = useState(null) // última versión guardada, para saber si hay cambios
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    supabase.from('config_cuotas').select('*').eq('asociacion_id', asoc).maybeSingle().then(({ data }) => {
      const imp = (data?.importes || IMPORTES_POR_DEFECTO).map(String)
      setImportes(imp); setPrecDto(!!data?.preceptores_descuento)
      setGuardado(JSON.stringify([imp, !!data?.preceptores_descuento]))
    })
  }, [asoc])

  const cambiado = guardado !== JSON.stringify([importes, precDto])
  const ponerImporte = (i, v) => setImportes(importes.map((x, j) => (j === i ? v.replace(',', '.') : x)))

  const guardar = async () => {
    setMsg(''); setOk('')
    const nums = importes.map(Number)
    if (importes.some(x => x.trim() === '') || nums.some(n => !Number.isFinite(n) || n < 0)) return setMsg('Cada importe debe ser un número igual o mayor que 0.')
    const { error } = await supabase.from('config_cuotas').upsert({ asociacion_id: asoc, importes: nums, preceptores_descuento: precDto })
    if (error) return setMsg(error.message)
    setGuardado(JSON.stringify([importes, precDto])); setOk('Guardado.')
  }

  return (
    <section>
      <h2>Cuotas de las familias</h2>
      <p className="sub">Cuota mensual de cada hijo de alta según su orden en la familia: el de alta más antiguo es el 1.er hermano, y así sucesivamente. El último importe vale para todos los siguientes.</p>
      {importes.map((v, i) => {
        const ultimo = i === importes.length - 1
        return (
          <div key={i} className="actividad">
            <span>{ORDINAL[i]} hermano{ultimo && importes.length > 1 ? ' y siguientes' : ''}</span>
            <span className="fila">
              <input className="importe" inputMode="decimal" aria-label={`Cuota del ${ORDINAL[i]} hermano`} value={v} onChange={e => ponerImporte(i, e.target.value)} /> €/mes
              {ultimo && importes.length > 1 && <button className="mini" aria-label="Quitar este tramo" onClick={() => setImportes(importes.slice(0, -1))}>Quitar</button>}
            </span>
          </div>
        )
      })}
      <div className="fila">
        {importes.length < 10 && <button className="mini" onClick={() => setImportes([...importes, importes.at(-1) ?? '0'])}>+ Añadir tramo</button>}
      </div>
      <label className="fila">
        <input type="checkbox" checked={precDto} onChange={e => setPrecDto(e.target.checked)} />
        Los preceptores pueden poner descuentos a las familias de sus socios
      </label>
      <p className="aviso">Las familias no pueden solicitar descuentos desde la aplicación. Los pone el encargado (o un preceptor, si lo permites) desde la ficha del socio.</p>
      <div className="fila">
        <button className="primario" disabled={!cambiado} onClick={guardar}>Guardar cuotas</button>
        {msg && <span className="error">{msg}</span>}
        {ok && !cambiado && <span className="okmsg">{ok}</span>}
      </div>
    </section>
  )
}
