import { useState } from 'react'
import { supabase } from './supabase'
import { hoy } from './util'
import {
  COLUMNAS, AYUDA, MAX_FILAS, MAX_BYTES, plantillaCsv, leerCsv, comprobarCabecera, analizar,
  cambiosParaSobrescribir, datosParaCrear
} from './importar'

function descargarPlantilla() {
  const url = URL.createObjectURL(new Blob([plantillaCsv()], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'plantilla-socios.csv' })
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Importar socios desde un CSV con la plantilla de la app: comprueba columnas y campos, avisa de duplicados
// (mismo nombre de hijo + correo de un progenitor) y deja elegir entre sobrescribir u omitir.
export default function ImportarSocios({ asoc, esEncargado, existentes, nivelesPermitidos, onVolver, onCambio }) {
  const [paso, setPaso] = useState('inicio') // inicio | revision | resultado
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [decision, setDecision] = useState({}) // fila -> 'sobrescribir' | 'omitir'
  const [vincular, setVincular] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState(null)

  const elegirArchivo = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    setError('')
    if (!f) return
    if (f.size > MAX_BYTES) return setError('El archivo es demasiado grande (máximo 1 MB).')
    const { filas, sin_cerrar } = leerCsv(await f.text())
    if (sin_cerrar) return setError('El archivo no está bien formado: hay unas comillas sin cerrar.')
    const [cab, ...resto] = filas
    if (!cab) return setError('El archivo está vacío.')
    const c = comprobarCabecera(cab)
    if (!c.ok) {
      const partes = []
      if (c.faltan.length) partes.push(`faltan las columnas: ${c.faltan.join(', ')}`)
      if (c.sobran.length) partes.push(`sobran columnas que no están en la plantilla: ${c.sobran.join(', ')}`)
      if (c.repetidas.length) partes.push(`columnas repetidas: ${[...new Set(c.repetidas)].join(', ')}`)
      return setError(`El archivo no coincide con la plantilla: ${partes.join('; ')}. Descarga la plantilla y copia ahí los datos.`)
    }
    const datos = resto.filter(r => r.some(x => x.trim() !== ''))
    if (!datos.length) return setError('El archivo no tiene ningún socio, solo la cabecera.')
    if (datos.length > MAX_FILAS) return setError(`Demasiadas filas (${datos.length}). El máximo por importación es ${MAX_FILAS}.`)
    const objetos = datos.map(r => Object.fromEntries(c.nombres.map((n, i) => [n, r[i] ?? ''])))
    const res = analizar(objetos, existentes, { hoyIso: hoy(), nivelesPermitidos })
    setItems(res); setDecision({}); setPaso('revision')
  }

  const nuevos = items.filter(i => i.estado === 'nuevo')
  const duplicados = items.filter(i => i.estado === 'duplicado')
  const errores = items.filter(i => i.estado === 'error')
  const aSobrescribir = duplicados.filter(i => decision[i.fila] === 'sobrescribir')
  const total = nuevos.length + aSobrescribir.length

  const ponerTodos = v => setDecision(Object.fromEntries(duplicados.map(i => [i.fila, v])))

  const importar = async () => {
    setTrabajando(true)
    const r = { creados: 0, actualizados: 0, omitidos: duplicados.length - aSobrescribir.length, fallos: [], avisos: [] }
    for (const it of [...nuevos, ...aSobrescribir]) {
      const d = it.datos
      let socioId
      if (it.estado === 'nuevo') {
        const { data, error } = await supabase.from('socios').insert({ ...datosParaCrear(d), asociacion_id: asoc }).select('id').single()
        if (error) { r.fallos.push(`Fila ${it.fila}: ${error.message}`); continue }
        socioId = data.id
        const { error: e2 } = await supabase.from('periodos_alta').insert({ socio_id: socioId, fecha_alta: d.fecha_alta || hoy() })
        if (e2) { r.fallos.push(`Fila ${it.fila}: se creó el socio pero falló el alta (${e2.message})`); continue }
        r.creados++
      } else {
        const cambios = cambiosParaSobrescribir(d)
        const { data, error } = await supabase.from('socios').update(cambios).eq('id', it.existente.id).select('id')
        if (error) { r.fallos.push(`Fila ${it.fila}: ${error.message}`); continue }
        if (!data?.length) { r.fallos.push(`Fila ${it.fila}: no tienes permiso para modificar a ${it.existente.nombre}`); continue }
        socioId = it.existente.id
        r.actualizados++
      }
      if (esEncargado && vincular) await vincularFamilia(socioId, d, asoc, r)
    }
    setTrabajando(false); setResultado(r); setPaso('resultado')
    await onCambio()
  }

  if (paso === 'resultado') return (
    <main>
      <div className="barra"><h2>Importación terminada</h2></div>
      <section>
        <div className="kpis">
          <div className="kpi"><span>Creados</span><b>{resultado.creados}</b></div>
          <div className="kpi"><span>Actualizados</span><b>{resultado.actualizados}</b></div>
          <div className="kpi"><span>Omitidos</span><b>{resultado.omitidos}</b></div>
          <div className="kpi"><span>Con error</span><b>{resultado.fallos.length + errores.length}</b></div>
        </div>
        {resultado.fallos.length > 0 && <ul className="lista-errores">{resultado.fallos.map(f => <li key={f}>{f}</li>)}</ul>}
        {resultado.avisos.length > 0 && <ul className="lista-errores aviso">{resultado.avisos.map(f => <li key={f}>{f}</li>)}</ul>}
        {errores.length > 0 && <p className="aviso">Las {errores.length} filas con errores de validación no se importaron. Corrige el archivo y vuelve a importarlo: los socios ya creados se detectarán como duplicados.</p>}
        <div className="fila"><button className="primario" onClick={onVolver}>Volver a socios</button></div>
      </section>
    </main>
  )

  if (paso === 'revision') return (
    <main className="importar">
      <div className="barra">
        <h2>Revisar importación</h2>
        <button onClick={() => setPaso('inicio')} disabled={trabajando}>Elegir otro archivo</button>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Nuevos</span><b>{nuevos.length}</b></div>
        <div className="kpi"><span>Ya existen</span><b>{duplicados.length}</b></div>
        <div className="kpi"><span>Con errores</span><b>{errores.length}</b></div>
        <div className="kpi"><span>Filas leídas</span><b>{items.length}</b></div>
      </div>

      {errores.length > 0 && (
        <section>
          <h2>Filas con errores <small>(no se importarán)</small></h2>
          <ul className="lista-errores">
            {errores.map(i => <li key={i.fila}><b>Fila {i.fila}</b> · {i.datos.nombre} {i.datos.apellidos}: {i.errores.join('; ')}</li>)}
          </ul>
        </section>
      )}

      {duplicados.length > 0 && (
        <section>
          <h2>Socios que ya existen</h2>
          <p className="aviso">Mismo nombre del hijo y el correo de un progenitor coincide con un socio ya registrado. Elige qué hacer en cada caso (por defecto se omiten). Al sobrescribir, solo se cambian los campos que traen valor en el archivo; no se modifican las altas ni las bajas.</p>
          <div className="fila">
            <button onClick={() => ponerTodos('sobrescribir')}>Sobrescribir todos</button>
            <button onClick={() => ponerTodos('omitir')}>Omitir todos</button>
          </div>
          {duplicados.map(i => {
            const ex = i.existente, bajaEx = !ex.periodos_alta?.some(p => !p.fecha_baja)
            const cambios = Object.keys(cambiosParaSobrescribir(i.datos)).filter(c => (i.datos[c] || '') !== (ex[c] || ''))
            return (
              <div key={i.fila} className="item sin-accion duplicado">
                <span>
                  <b>{i.datos.nombre} {i.datos.apellidos}</b>
                  <small className="meta">
                    <span>Fila {i.fila}</span>
                    <span>{bajaEx ? 'Existente: de baja' : 'Existente: de alta'}</span>
                    <span>{cambios.length ? `Cambiaría: ${cambios.join(', ')}` : 'Sin cambios en los datos'}</span>
                  </small>
                </span>
                <select aria-label={`Qué hacer con ${i.datos.nombre}`} value={decision[i.fila] || 'omitir'}
                  onChange={e => setDecision({ ...decision, [i.fila]: e.target.value })}>
                  <option value="omitir">Omitir</option>
                  <option value="sobrescribir">Sobrescribir</option>
                </select>
              </div>
            )
          })}
        </section>
      )}

      {nuevos.length > 0 && (
        <section>
          <h2>Socios nuevos</h2>
          <div className="tablaw">
            <table>
              <thead><tr><th>Fila</th><th>Nombre</th><th>Nivel</th><th>Alta</th><th>Avisos</th></tr></thead>
              <tbody>
                {nuevos.map(i => (
                  <tr key={i.fila}>
                    <td>{i.fila}</td>
                    <td>{i.datos.nombre} {i.datos.apellidos}</td>
                    <td>{i.datos.nivel}{i.datos.nivel_calculado && <small> (calculado)</small>}</td>
                    <td>{i.datos.fecha_alta || 'hoy'}</td>
                    <td>{i.avisos.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {esEncargado && total > 0 && (
        <label className="check-fila">
          <input type="checkbox" checked={vincular} onChange={e => setVincular(e.target.checked)} />
          <span>Autorizar y vincular los correos de los progenitores como familia (podrán entrar con Google y ver a sus hijos). Se omiten los correos ya autorizados con otro rol.</span>
        </label>
      )}

      <div className="fila">
        <button className="primario" disabled={total === 0 || trabajando} onClick={importar}>
          {trabajando ? 'Importando…' : `Importar ${total} ${total === 1 ? 'socio' : 'socios'}`}
        </button>
        {total === 0 && <span className="aviso">No hay nada que importar.</span>}
      </div>
    </main>
  )

  return (
    <main className="importar">
      <div className="barra">
        <h2>Importar socios desde CSV</h2>
        <button onClick={onVolver}>← Volver</button>
      </div>
      <section>
        <h2>1. Descarga la plantilla</h2>
        <p className="aviso">Rellénala con Excel o Google Sheets y guárdala como CSV. Las columnas deben ser exactamente estas (el orden da igual). El IBAN no se importa: se añade a mano en la ficha.</p>
        <div className="fila"><button onClick={descargarPlantilla}>Descargar plantilla (.csv)</button></div>
        <div className="tablaw">
          <table>
            <thead><tr><th>Columna</th><th>Notas</th></tr></thead>
            <tbody>{COLUMNAS.map(c => <tr key={c}><td><code>{c}</code></td><td>{AYUDA[c]}</td></tr>)}</tbody>
          </table>
        </div>
        {nivelesPermitidos && <p className="aviso">Solo puedes importar socios de tus niveles: {nivelesPermitidos.join(', ') || 'ninguno asignado'}.</p>}
      </section>
      <section>
        <h2>2. Sube el archivo</h2>
        <input type="file" accept=".csv,text/csv" onChange={elegirArchivo} />
        {error && <p className="error">{error}</p>}
        <p className="aviso">Máximo {MAX_FILAS} filas. Antes de importar verás un resumen con los errores y los duplicados.</p>
      </section>
    </main>
  )
}

// Autoriza y vincula los correos de los progenitores (solo encargado)
async function vincularFamilia(socioId, d, asoc, r) {
  let vinculado = false
  for (const e of [...new Set([d.correo_padre, d.correo_madre].filter(Boolean))]) {
    const { data: ex } = await supabase.from('accesos_permitidos').select('rol').eq('email', e).maybeSingle()
    if (ex && ex.rol !== 'familia') { r.avisos.push(`${e}: ya autorizado como ${ex.rol}, no se vinculó`); continue }
    if (!ex) {
      const { error } = await supabase.from('accesos_permitidos').insert({ email: e, asociacion_id: asoc, rol: 'familia' })
      if (error) { r.avisos.push(`${e}: ${error.code === '23505' ? 'ya tiene acceso en otra asociación' : error.message}`); continue }
    }
    const { error } = await supabase.from('familiares_socios').insert({ email: e, socio_id: socioId })
    if (error && error.code !== '23505') r.avisos.push(`${e}: ${error.message}`); else vinculado = true
  }
  if (vinculado) await supabase.rpc('asegurar_familia', { p_socio: socioId })
}
