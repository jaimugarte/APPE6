import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fecha } from './util'
import { eur } from './cuotas'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']


// Cuotas y pagos: cuota mensual con su desglose por hijo y el historial de pagos, del mes más reciente al más antiguo.
export default function FamiliaCuotas() {
  const [cuota, setCuota] = useState(undefined)
  const [hijos, setHijos] = useState([])
  const [pagos, setPagos] = useState(null)

  useEffect(() => {
    (async () => {
      const [q, s] = await Promise.all([supabase.rpc('cuota_familia'), supabase.from('socios').select('id, nombre, apellidos')])
      setCuota(q.data || null); setHijos(s.data || [])
      if (!q.data) return setPagos([])
      const { data } = await supabase.from('pagos_cuota').select('mes, importe, pagado_en')
        .eq('familia_id', q.data.familia_id).order('mes', { ascending: false })
      setPagos(data || [])
    })()
  }, [])

  if (cuota === undefined) return <main><p>Cargando…</p></main>

  return (
    <main className="familia-cuotas">
      <div className="barra"><h2>Cuotas y pagos</h2></div>
      {!cuota && <p className="aviso">Todavía no hay una cuota calculada para tu familia.</p>}
      {cuota && (
        <section>
          <div className="cuota-grande"><span>Cuota mensual total</span><b>{eur(cuota.total)}<small>/mes</small></b></div>
          <div className="desglose">
            {cuota.detalle.map(d => {
              const h = hijos.find(x => x.id === d.socio_id)
              return <div key={d.socio_id}><span>{h ? `${h.nombre} ${h.apellidos}` : 'Hijo/a'}</span><b>{eur(d.importe)}</b></div>
            })}
            {cuota.descuento > 0 && <div><span>Descuento</span><b>−{eur(cuota.descuento)}</b></div>}
            {cuota.detalle.length === 0 && <p className="aviso">Todavía no hay hijos de alta.</p>}
          </div>
        </section>
      )}

      <section>
        <h2>Historial de pagos</h2>
        {pagos === null && <p>Cargando…</p>}
        {pagos?.length === 0 && <p className="aviso">Todavía no hay pagos registrados.</p>}
        {pagos?.length > 0 && (
          <div className="tablaw">
            <table>
              <thead><tr><th>Mes</th><th className="num">Importe</th><th>Estado</th></tr></thead>
              <tbody>
                {[...pagos].sort((a, b) => b.mes.localeCompare(a.mes)).map(p => (
                  <tr key={p.mes}>
                    <td>{MESES[Number(p.mes.slice(5, 7)) - 1]} {p.mes.slice(0, 4)}</td>
                    <td className="num">{eur(p.importe)}</td>
                    <td>{p.pagado_en ? <span className="badge ok">Pagado {fecha(p.pagado_en)}</span> : <span className="badge pend">Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
