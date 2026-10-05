import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hoy, deIso } from './util'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const mesLargo = iso => MESES[Number(iso.slice(5, 7)) - 1]
export const fechaCorta = iso => {
  const d = deIso(iso)
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

// Datos que muestran las cajas del inicio de la familia: hijos, cuota del mes y próximo plan
export function useResumenFamilia(activo, conActividades, version) {
  const [r, setR] = useState(null)
  const cargar = useCallback(async () => {
    if (!activo) return
    const [s, sol, q, pl] = await Promise.all([
      supabase.from('socios').select('id, periodos_alta(fecha_baja)'),
      supabase.from('solicitudes_alta').select('id').eq('tipo', 'socio').eq('estado', 'pendiente'),
      supabase.rpc('cuota_familia'),
      conActividades
        ? supabase.from('planes').select('titulo, fecha, fecha_fin').gte('fecha_fin', hoy()).order('fecha').limit(1)
        : Promise.resolve({ data: [] })
    ])
    const cuota = q.data || null
    let pendiente = null
    if (cuota?.familia_id) {
      const { data } = await supabase.from('pagos_cuota').select('mes, pagado_en').eq('familia_id', cuota.familia_id).order('mes', { ascending: false }).limit(1)
      if (data?.[0] && !data[0].pagado_en) pendiente = data[0].mes
    }
    setR({
      activos: (s.data || []).filter(x => x.periodos_alta?.some(p => !p.fecha_baja)).length,
      solicitados: sol.data?.length || 0,
      cuota, pendiente, proximo: pl.data?.[0] || null
    })
  }, [activo, conActividades])
  useEffect(() => { cargar() }, [cargar, version])
  return r
}
