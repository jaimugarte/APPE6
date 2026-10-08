import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { IconoApp } from './iconos'
import { nivelesDe, familiasDeNiveles, etiquetaDe, avisoDireccion } from './postales'
import { FORMATOS, generarPdfEtiquetas } from './pdfEtiquetas'

// Herramientas: utilidades para el equipo (encargado y todos los preceptores).
export default function Herramientas() {
  const [herr, setHerr] = useState(null)
  if (herr === 'postales') return <Postales onVolver={() => setHerr(null)} />
  return (
    <main>
      <h2>Herramientas</h2>
      <div className="grid">
        <button className="tarjeta" onClick={() => setHerr('postales')}>
          <span className="icono"><IconoApp clave="solicitudes" /></span>
          <b>Generar postales</b>
          <span className="desc">PDF con «Familia …» y su dirección para imprimir en pegatinas de sobres.</span>
        </button>
      </div>
    </main>
  )
}

function Postales({ onVolver }) {
  const [socios, setSocios] = useState(null)
  const [error, setError] = useState('')
  const [niveles, setNiveles] = useState([])
  const [excluidas, setExcluidas] = useState(() => new Set())
  const [formato, setFormato] = useState('e24')
  const [saltar, setSaltar] = useState(1)
  const [marco, setMarco] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    supabase.rpc('direcciones_postales').then(({ data, error }) => { if (error) setError(error.message); else setSocios(data) })
  }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const todos = useMemo(() => nivelesDe(socios || []), [socios])
  const familias = useMemo(() => familiasDeNiveles(socios || [], niveles), [socios, niveles])
  const conDir = familias.filter(f => f.direccion)
  const sinDir = familias.filter(f => !f.direccion)
  const elegidas = conDir.filter(f => !excluidas.has(f.id))
  const f = FORMATOS[formato]
  const porHoja = f.cols * f.filas

  const alternar = n => { setUrl(''); setNiveles(v => v.includes(n) ? v.filter(x => x !== n) : [...v, n]) }
  const marcar = id => { setUrl(''); setExcluidas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const hojas = Math.ceil((elegidas.length + Math.max(0, saltar - 1)) / porHoja)

  function generar() {
    const bytes = generarPdfEtiquetas(elegidas.map(etiquetaDe), { formato, saltar: Math.max(0, saltar - 1), marco })
    setUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
  }

  return (
    <main className="campos">
      <div className="barra"><button onClick={onVolver}>← Volver</button><h2>Generar postales</h2></div>
      {error && <p className="error">{error}</p>}
      {!socios && !error && <p>Cargando…</p>}
      {socios && <>
        <section>
          <h3>1. Cursos</h3>
          <div className="filtro-nivel">
            <button className="fn" onClick={() => { setUrl(''); setNiveles(todos) }}>Todos</button>
            <button className="fn" onClick={() => { setUrl(''); setNiveles([]) }}>Ninguno</button>
            {todos.map(n => <button key={n} className={'fn' + (niveles.includes(n) ? ' on' : '')} aria-pressed={niveles.includes(n)} onClick={() => alternar(n)}>{n}</button>)}
          </div>
          {!todos.length && <p className="aviso">No hay chavales de alta.</p>}
        </section>

        {niveles.length > 0 && <section>
          <h3>2. Familias ({elegidas.length} de {conDir.length})</h3>
          {sinDir.length > 0 && <p className="aviso">Sin dirección (no saldrán): {sinDir.map(x => x.nombre.replace('Familia ', '')).join(', ')}.</p>}
          <div>
            {conDir.map(x => (
              <label key={x.id} className="check-fila">
                <input type="checkbox" checked={!excluidas.has(x.id)} onChange={() => marcar(x.id)} />
                <span><b>{x.nombre}</b> · {x.niveles.join(', ')}<br /><small>{etiquetaDe(x).direccion.join(', ')}{[avisoDireccion(x), x.aviso].filter(Boolean).map(a => ' ⚠ ' + a).join('')}</small></span>
              </label>
            ))}
          </div>
        </section>}

        {niveles.length > 0 && <section>
          <h3>3. Hoja de pegatinas</h3>
          <div className="formgrid">
            <label className="campo ancho"><span>Formato</span>
              <select value={formato} onChange={e => { setUrl(''); setFormato(e.target.value); setSaltar(1) }}>
                {Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
              </select></label>
            <label className="campo"><span>Empezar en la etiqueta nº</span>
              <input type="number" min="1" max={porHoja} value={saltar} onChange={e => { setUrl(''); setSaltar(Math.min(porHoja, Math.max(1, Number(e.target.value) || 1))) }} /></label>
          </div>
          <label className="check-fila"><input type="checkbox" checked={marco} onChange={e => { setUrl(''); setMarco(e.target.checked) }} /><span>Dibujar el contorno de las etiquetas (para probar en papel normal)</span></label>
          <p className="nota">Imprime al 100 % (sin «ajustar a la página»). Saldrán {hojas || 0} {hojas === 1 ? 'hoja' : 'hojas'}.</p>
          <div className="acciones">
            <button className="primario" disabled={!elegidas.length} onClick={generar}>Generar PDF</button>
            {url && <><a className="boton" href={url} download="postales.pdf">Descargar postales.pdf</a>
              <a className="boton" href={url} target="_blank" rel="noreferrer">Abrir / imprimir</a></>}
          </div>
        </section>}
      </>}
    </main>
  )
}
