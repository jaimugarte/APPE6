import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy } from './util'
import { HuchaHistorial } from './Hucha'
import { CATEGORIAS, eurSigno, claseSaldo, leerImporteHucha } from './huchaUtil'

const nombreCompleto = s => `${s.apellidos}, ${s.nombre}`
const sinTildes = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Dineros: saldo de cada socio (meriendas, cenas, planes, convivencias…; sin cuotas). Encargado y todos los preceptores.
// Las familias ven lo mismo, solo lectura, en la «Hucha» de cada hijo.
export default function Dineros({ asoc }) {
  const [socios, setSocios] = useState(null)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('lista')       // 'lista' | {socio: id} | 'varios'
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [niveles, setNiveles] = useState([])         // vacío = todos
  const [q, setQ] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(false)
  const [conBajas, setConBajas] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('socios_dineros')
    if (error) setError(error.message); else setSocios((data || []).map(s => ({ ...s, saldo: Number(s.saldo) })))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const todosNiveles = useMemo(() => [...new Set((socios || []).map(s => s.nivel).filter(Boolean))]
    .sort((a, b) => (NIVELES.indexOf(a) + 1 || 99) - (NIVELES.indexOf(b) + 1 || 99) || a.localeCompare(b, 'es')), [socios])
  const visibles = useMemo(() => (socios || []).filter(s =>
    (conBajas || s.activo || s.saldo !== 0)
    && (!niveles.length || niveles.includes(s.nivel))
    && (!soloDeuda || s.saldo < 0)
    && (!q.trim() || sinTildes(nombreCompleto(s)).includes(sinTildes(q.trim())))), [socios, niveles, q, soloDeuda, conBajas])
  const deuda = visibles.filter(s => s.saldo < 0).reduce((a, s) => a + s.saldo, 0)
  const favor = visibles.filter(s => s.saldo > 0).reduce((a, s) => a + s.saldo, 0)

  if (error) return <main><p className="error">{error}</p></main>
  if (!socios) return <main><p>Cargando…</p></main>

  if (vista.socio) {
    const s = socios.find(x => x.id === vista.socio)
    if (s) return <Detalle socio={s} asoc={asoc} onVolver={() => { setVista('lista'); cargar() }} onCambio={cargar} />
  }
  if (vista === 'varios') {
    const elegidos = socios.filter(s => seleccion.has(s.id))
    return <main className="campos">
      <div className="barra"><button onClick={() => setVista('lista')}>← Volver</button><h2>Apuntar a {elegidos.length} socios</h2></div>
      <p className="nota">{elegidos.map(nombreCompleto).join(' · ')}</p>
      <FormMovimiento asoc={asoc} socios={elegidos} onHecho={async n => { await cargar(); setSeleccion(new Set()); setAviso(`Apuntado a ${n} socios.`); setVista('lista') }} />
    </main>
  }

  const alternar = id => setSeleccion(v => { const n = new Set(v); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosMarcados = visibles.length > 0 && visibles.every(s => seleccion.has(s.id))
  const alternarTodos = () => setSeleccion(v => { const n = new Set(v); visibles.forEach(s => todosMarcados ? n.delete(s.id) : n.add(s.id)); return n })

  return (
    <main className="campos">
      <div className="barra"><h2>Dineros</h2></div>
      <p className="nota">Meriendas, cenas, planes, convivencias… (las cuotas van aparte). Negativo = debe; positivo = a favor. Las familias lo ven en la «Hucha» de cada hijo.</p>
      {aviso && <p className="okmsg">{aviso}</p>}

      <div className="filtro-nivel">
        <button className={'fn' + (!niveles.length ? ' on' : '')} onClick={() => setNiveles([])}>Todos</button>
        {todosNiveles.map(n => <button key={n} className={'fn' + (niveles.includes(n) ? ' on' : '')} aria-pressed={niveles.includes(n)}
          onClick={() => setNiveles(v => v.includes(n) ? v.filter(x => x !== n) : [...v, n])}>{n}</button>)}
      </div>
      <div className="formgrid">
        <label className="campo ancho"><span>Buscar</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o apellidos" /></label>
      </div>
      <label className="check-fila"><input type="checkbox" checked={soloDeuda} onChange={e => setSoloDeuda(e.target.checked)} /><span>Solo con deuda</span></label>
      <label className="check-fila"><input type="checkbox" checked={conBajas} onChange={e => setConBajas(e.target.checked)} /><span>Incluir socios de baja sin saldo</span></label>

      <p className="hucha-totales">Deuda <b className="saldo-neg">{eurSigno(deuda, false)}</b> · A favor <b className="saldo-pos">{eurSigno(favor, false)}</b> <small>({visibles.length} socios)</small></p>

      <div className="acciones">
        <button onClick={alternarTodos} disabled={!visibles.length}>{todosMarcados ? 'Quitar la selección' : 'Seleccionar los de la lista'}</button>
        <button className="primario" disabled={!seleccion.size} onClick={() => { setAviso(''); setVista('varios') }}>Apuntar a seleccionados ({seleccion.size})</button>
      </div>

      {visibles.length === 0 && <p className="aviso">No hay socios con esos filtros.</p>}
      <div className="hucha-socios">
        {visibles.map(s => (
          <div key={s.id} className="hucha-fila">
            <input type="checkbox" aria-label={`Seleccionar a ${nombreCompleto(s)}`} checked={seleccion.has(s.id)} onChange={() => alternar(s.id)} />
            <button className="item" onClick={() => { setAviso(''); setVista({ socio: s.id }) }}>
              <span><b>{nombreCompleto(s)}</b><small className="meta"><span>{s.nivel}</span>{!s.activo && <span>Baja</span>}</small></span>
              <b className={claseSaldo(s.saldo)}>{eurSigno(s.saldo, false)}</b>
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}

function Detalle({ socio, asoc, onVolver, onCambio }) {
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const borrar = async m => {
    setError('')
    const { error } = await supabase.from('hucha_movimientos').delete().eq('id', m.id)
    if (error) return setError(error.message)
    setVersion(v => v + 1); onCambio()
  }
  return (
    <main className="campos">
      <div className="barra"><button onClick={onVolver}>← Volver</button><h2>{socio.nombre} {socio.apellidos}</h2></div>
      <p className="nota">{socio.nivel}{!socio.activo && ' · de baja'}</p>
      {error && <p className="error">{error}</p>}
      <section>
        <h2>Nuevo apunte</h2>
        <FormMovimiento asoc={asoc} socios={[socio]} onHecho={() => { setVersion(v => v + 1); onCambio() }} />
      </section>
      <section>
        <h2>Movimientos</h2>
        <HuchaHistorial socioId={socio.id} version={version} onBorrar={borrar} />
        <p className="nota">Se puede borrar un apunte manual que esté mal. Los de campos de trabajo se gestionan en su sección.</p>
      </section>
    </main>
  )
}

function FormMovimiento({ asoc, socios, onHecho }) {
  const [signo, setSigno] = useState(-1)   // −1 cargo (debe), +1 ingreso
  const [categoria, setCategoria] = useState('merienda')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [fechaMov, setFechaMov] = useState(hoy())
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async e => {
    e.preventDefault(); setMsg('')
    const n = leerImporteHucha(importe)
    if (n === null) return setMsg('Indica un importe mayor que 0 (p. ej. 3 o 2,50).')
    if (!fechaMov) return setMsg('Indica la fecha.')
    setEnviando(true)
    const filas = socios.map(s => ({ asociacion_id: asoc, socio_id: s.id, fecha: fechaMov, categoria, concepto: concepto.trim() || null, importe: signo * n }))
    const { error } = await supabase.from('hucha_movimientos').insert(filas)
    setEnviando(false)
    if (error) return setMsg(error.message)
    setImporte(''); setConcepto('')
    onHecho(filas.length)
  }

  return (
    <form onSubmit={enviar}>
      <div className="seg" role="group" aria-label="Tipo de apunte">
        <button type="button" className={signo < 0 ? 'on' : ''} aria-pressed={signo < 0} onClick={() => setSigno(-1)}>Cargo (debe)</button>
        <button type="button" className={signo > 0 ? 'on' : ''} aria-pressed={signo > 0} onClick={() => setSigno(1)}>Ingreso (a favor)</button>
      </div>
      <div className="formgrid">
        <label className="campo"><span>Categoría</span>
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>{CATEGORIAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="campo"><span>Importe (€){socios.length > 1 ? ' por socio' : ''}</span>
          <input inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} placeholder="0,00" /></label>
        <label className="campo"><span>Fecha</span><input type="date" value={fechaMov} max={hoy()} onChange={e => setFechaMov(e.target.value)} /></label>
        <label className="campo ancho"><span>Concepto (opcional)</span>
          <input value={concepto} maxLength={120} onChange={e => setConcepto(e.target.value)} placeholder="Si lo dejas vacío se usa la categoría" /></label>
      </div>
      {msg && <p className="error">{msg}</p>}
      <div className="fila"><button className="primario" disabled={enviando}>{enviando ? 'Guardando…' : signo < 0 ? 'Apuntar cargo' : 'Apuntar ingreso'}</button></div>
    </form>
  )
}
