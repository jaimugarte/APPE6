import { useEffect, useState } from 'react'

// Confirmación de baja con cuenta atrás: el botón de confirmar se activa a los 10 segundos
const ESPERA = 10
export default function ConfirmarBaja({ nombre, onConfirmar, onCancelar }) {
  const [resto, setResto] = useState(ESPERA)
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (resto <= 0) return
    const t = setTimeout(() => setResto(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resto])
  return (
    <div className="confirmar-baja" role="alertdialog" aria-label={`Confirmar la baja de ${nombre}`}>
      <p><b>¿Seguro que quieres dar de baja a {nombre}?</b> La baja es inmediata y quedará en su historial.</p>
      <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
      <div className="fila">
        <button className="peligro" disabled={resto > 0} onClick={() => onConfirmar(motivo)}>
          {resto > 0 ? `Confirmar baja (${resto})` : 'Confirmar baja'}
        </button>
        <button onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
