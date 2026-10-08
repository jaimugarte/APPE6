import { IconoApp } from './iconos'
import { hoy } from './util'
import { eur } from './cuotas'
import { useResumenFamilia, mesLargo, fechaCorta } from './familiaResumen'
import { PlanesNuevos } from './PlanesFamilia'

// Inicio de la familia: cajas con un resumen en vivo (hijos, cuota del mes, próximo plan)
export default function HubFamilia({ fotoUrl, nombre, activas, version, onVista, onApp }) {
  const resumen = useResumenFamilia(true, activas.some(a => a.app_clave === 'actividades'), version)
  return (
<main>
  <h1 className="solo-lectores">Portal de la familia</h1>
  {fotoUrl && <img className="banner" src={fotoUrl} alt={`Foto de ${nombre || 'la asociación'}`} />}
  <PlanesNuevos activo={activas.some(a => a.app_clave === 'actividades')} version={version} />
  <div className="grid">
    <button className="tarjeta" onClick={() => onVista('hijos')}>
      <span className="icono"><IconoApp clave="hijos" /></span>
      <b>Hijos socios</b>
      <span className="desc">Altas, bajas y datos de tus hijos</span>
      {resumen && (
        <span className="resumen-tarjeta">
          <span>{resumen.activos} {resumen.activos === 1 ? 'socio' : 'socios'}</span>
          {resumen.solicitados > 0 && <span className="badge pend">{resumen.solicitados} {resumen.solicitados === 1 ? 'alta solicitada' : 'altas solicitadas'}</span>}
        </span>
      )}
    </button>
    <button className="tarjeta" onClick={() => onVista('cuotas')}>
      <span className="icono"><IconoApp clave="cuotas" /></span>
      <b>Cuotas</b>
      <span className="desc">Cuota mensual e historial de pagos</span>
      {resumen?.cuota && (
        <span className="resumen-tarjeta">
          <span>{eur(resumen.cuota.total)}/mes</span>
          {resumen.pendiente && <span className="badge pend">{mesLargo(resumen.pendiente)} pendiente</span>}
        </span>
      )}
    </button>
    {activas.map(a => (
      <button key={a.app_clave} className="tarjeta" onClick={() => onApp(a)}>
        <span className="icono"><IconoApp clave={a.app_clave} /></span>
        <b>{a.apps.nombre}</b>
        <span className="desc">{a.apps.descripcion}</span>
        {a.app_clave === 'actividades' && resumen?.proximo && (
          <span className="resumen-tarjeta"><span>Próximo: {resumen.proximo.titulo} · {fechaCorta(resumen.proximo.fecha < hoy() ? hoy() : resumen.proximo.fecha)}</span></span>
        )}
      </button>
    ))}
  </div>
</main>
  )
}
